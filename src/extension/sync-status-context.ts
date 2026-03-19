import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  getDefaultToduTaskServiceRuntime,
  type ToduTaskServiceRuntime,
} from "../services/todu/default-task-service";
import type { ToduDaemonConnectionState } from "../services/todu/daemon-connection";
import type { ToduDaemonSubscription } from "../services/todu/daemon-events";

const SYNC_STATUS_KEY = "todu-sync-status";
const KNOWN_SYNC_STATUSES = ["disconnected", "connected", "syncing"] as const;

type KnownSyncStatus = (typeof KNOWN_SYNC_STATUSES)[number];

type SyncStatusValue = "unknown" | KnownSyncStatus | `custom:${string}`;

interface ToduSyncStatusSnapshot {
  local?: {
    mode?: string;
  };
  remote?: {
    state?: string;
    server?: string;
    lastSync?: string;
  };
}

export interface SyncStatusContextState {
  syncStatus: SyncStatusValue;
}

export interface SyncStatusContextController {
  getState(): SyncStatusContextState;
  attach(ctx: ExtensionContext): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateSyncStatusContextControllerDependencies {
  runtime?: Pick<ToduTaskServiceRuntime, "client" | "connection">;
}

const createSyncStatusContextController = (
  _pi: Pick<ExtensionAPI, "appendEntry">,
  dependencies: CreateSyncStatusContextControllerDependencies = {}
): SyncStatusContextController => {
  const runtime = dependencies.runtime ?? getDefaultToduTaskServiceRuntime();

  let activeContext: ExtensionContext | null = null;
  let syncStatus: SyncStatusValue = "unknown";
  let syncEventSubscription: ToduDaemonSubscription | null = null;
  let connectionStateSubscription: ToduDaemonSubscription | null = null;
  let subscribePromise: Promise<ToduDaemonSubscription> | null = null;

  const updateAmbientUi = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) {
      return;
    }

    ctx.ui.setStatus(SYNC_STATUS_KEY, formatSyncStatus(syncStatus));
  };

  const updateSyncStatus = (nextSyncStatus: SyncStatusValue): void => {
    syncStatus = nextSyncStatus;
    if (activeContext) {
      updateAmbientUi(activeContext);
    }
  };

  const refreshSyncStatus = async (): Promise<void> => {
    const statusResult = await runtime.connection.request<ToduSyncStatusSnapshot>(
      "sync.status",
      {}
    );
    if (!statusResult.ok) {
      updateSyncStatus("unknown");
      return;
    }

    updateSyncStatus(normalizeSyncStatus(statusResult.value));
  };

  const ensureConnectionStateSubscription = (): void => {
    if (connectionStateSubscription) {
      return;
    }

    connectionStateSubscription = runtime.connection.subscribe((state) => {
      handleConnectionStateChange(state, updateSyncStatus);
      if (state.status === "connected") {
        void refreshSyncStatus();
      }
    });
  };

  const ensureSyncEventSubscription = async (): Promise<void> => {
    if (syncEventSubscription) {
      return;
    }

    if (subscribePromise) {
      await subscribePromise;
      return;
    }

    subscribePromise = runtime.client
      .on("sync.statusChanged", (event) => {
        updateSyncStatus(normalizeSyncStatus(event.payload));
      })
      .then((subscription) => {
        syncEventSubscription = subscription;
        return subscription;
      })
      .finally(() => {
        subscribePromise = null;
      });

    await subscribePromise;
  };

  return {
    getState: (): SyncStatusContextState => ({ syncStatus }),

    async attach(ctx: ExtensionContext): Promise<void> {
      activeContext = ctx;
      ensureConnectionStateSubscription();
      await ensureSyncEventSubscription();
      updateAmbientUi(ctx);

      try {
        await runtime.connection.connect();
        await refreshSyncStatus();
      } catch {
        updateSyncStatus("unknown");
      }
    },

    async dispose(): Promise<void> {
      syncEventSubscription?.unsubscribe();
      syncEventSubscription = null;
      connectionStateSubscription?.unsubscribe();
      connectionStateSubscription = null;
      subscribePromise = null;
      activeContext = null;
      syncStatus = "unknown";
    },
  };
};

const handleConnectionStateChange = (
  state: ToduDaemonConnectionState,
  setSyncStatus: (status: SyncStatusValue) => void
): void => {
  if (state.status !== "connected") {
    setSyncStatus("unknown");
  }
};

const normalizeSyncStatus = (payload: unknown): SyncStatusValue => {
  const rawStatus = extractSyncStatus(payload);
  if (!rawStatus) {
    return "unknown";
  }

  const normalizedStatus = rawStatus.trim().toLowerCase();
  if (normalizedStatus.length === 0) {
    return "unknown";
  }

  if (isKnownSyncStatus(normalizedStatus)) {
    return normalizedStatus;
  }

  return `custom:${normalizedStatus}`;
};

const extractSyncStatus = (payload: unknown): string | null => {
  if (typeof payload === "string") {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const candidate =
    readNestedString(payload, "remote", "state") ??
    readString(payload, "status") ??
    readString(payload, "state") ??
    readNestedString(payload, "binding", "state") ??
    readNestedString(payload, "sync", "status") ??
    readNestedString(payload, "sync", "state");

  return candidate ?? null;
};

const formatSyncStatus = (status: SyncStatusValue): string => {
  if (status === "unknown") {
    return "sync: unknown";
  }

  if (status.startsWith("custom:")) {
    return `sync: ${status.slice("custom:".length)}`;
  }

  return `sync: ${status}`;
};

const isKnownSyncStatus = (value: string): value is KnownSyncStatus =>
  KNOWN_SYNC_STATUSES.includes(value as KnownSyncStatus);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: Record<string, unknown>, key: string): string | null => {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
};

const readNestedString = (
  value: Record<string, unknown>,
  outerKey: string,
  innerKey: string
): string | null => {
  const nestedValue = value[outerKey];
  if (!isRecord(nestedValue)) {
    return null;
  }

  return readString(nestedValue, innerKey);
};

let defaultSyncStatusContextController: SyncStatusContextController | null = null;

const getDefaultSyncStatusContextController = (
  pi?: Pick<ExtensionAPI, "appendEntry">
): SyncStatusContextController => {
  if (!defaultSyncStatusContextController) {
    if (!pi) {
      throw new Error("Sync status context controller has not been initialized");
    }

    defaultSyncStatusContextController = createSyncStatusContextController(pi);
  }

  return defaultSyncStatusContextController;
};

const resetDefaultSyncStatusContextController = async (): Promise<void> => {
  if (!defaultSyncStatusContextController) {
    return;
  }

  await defaultSyncStatusContextController.dispose();
  defaultSyncStatusContextController = null;
};

export {
  createSyncStatusContextController,
  extractSyncStatus,
  formatSyncStatus,
  getDefaultSyncStatusContextController,
  handleConnectionStateChange,
  normalizeSyncStatus,
  resetDefaultSyncStatusContextController,
  SYNC_STATUS_KEY,
};
