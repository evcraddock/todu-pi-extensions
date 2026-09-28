import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import {
  getDefaultToduTaskServiceRuntime,
  type ToduTaskServiceRuntime,
} from "../services/todu/default-task-service";

interface ToduSyncStatusSnapshot {
  remote?: {
    state?: string;
    server?: string;
  };
}

export interface CreateToduStatusCommandHandlerDependencies {
  runtime?: Pick<ToduTaskServiceRuntime, "connection" | "ensureConnected">;
}

const createToduStatusCommandHandler = (
  dependencies: CreateToduStatusCommandHandlerDependencies = {}
): ((args: string, ctx: ExtensionCommandContext) => Promise<void>) => {
  const runtime = dependencies.runtime ?? getDefaultToduTaskServiceRuntime();

  return async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
    try {
      await runtime.ensureConnected();
    } catch (error) {
      presentStatus(ctx, `Todu daemon: unavailable — ${getErrorMessage(error)}`, "error");
      return;
    }

    const daemonStatus = formatDaemonStatus(runtime.connection.getState().handshake?.daemonVersion);

    try {
      const syncResult = await runtime.connection.request<ToduSyncStatusSnapshot>(
        "sync.status",
        {}
      );
      if (!syncResult.ok) {
        presentStatus(
          ctx,
          `${daemonStatus}\nSync server: status unavailable — ${syncResult.error.message}`,
          "warning"
        );
        return;
      }

      presentStatus(ctx, `${daemonStatus}\n${formatSyncServerStatus(syncResult.value)}`, "info");
    } catch (error) {
      presentStatus(
        ctx,
        `${daemonStatus}\nSync server: status unavailable — ${getErrorMessage(error)}`,
        "warning"
      );
    }
  };
};

const formatDaemonStatus = (daemonVersion: string | undefined): string => {
  const normalizedVersion = daemonVersion?.trim();
  return normalizedVersion
    ? `Todu daemon: connected (version ${normalizedVersion})`
    : "Todu daemon: connected";
};

const formatSyncServerStatus = (status: ToduSyncStatusSnapshot): string => {
  const server = status.remote?.server?.trim();
  if (!server) {
    return "Sync server: not configured";
  }

  const state = status.remote?.state?.trim().toLowerCase() || "unknown";
  return `Sync server: ${state} — ${server}`;
};

const presentStatus = (
  ctx: ExtensionCommandContext,
  message: string,
  level: "info" | "warning" | "error"
): void => {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }

  const output = `${message}\n`;
  if (level === "error") {
    process.stderr.write(output);
    return;
  }

  process.stdout.write(output);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "unknown error";
};

export {
  createToduStatusCommandHandler,
  formatDaemonStatus,
  formatSyncServerStatus,
  getErrorMessage,
  presentStatus,
};
