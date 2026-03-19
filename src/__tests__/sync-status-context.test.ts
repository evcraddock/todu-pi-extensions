import { describe, expect, it, vi } from "vitest";

import {
  createSyncStatusContextController,
  extractSyncStatus,
  formatSyncStatus,
  handleConnectionStateChange,
  normalizeSyncStatus,
  SYNC_STATUS_KEY,
} from "@/extension/sync-status-context";

const createContext = () => ({
  hasUI: true,
  ui: {
    setStatus: vi.fn(),
  },
});

describe("createSyncStatusContextController", () => {
  it("fetches the initial sync status snapshot after attaching", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        local: { mode: "ephemeral-client" },
        remote: { state: "connected", server: "ws://localhost:3030" },
      },
    });
    const controller = createSyncStatusContextController(
      { appendEntry: vi.fn() },
      {
        runtime: {
          client: {
            on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
          },
          connection: {
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
            connect: vi.fn().mockResolvedValue(undefined),
            request,
          },
        } as never,
      }
    );
    const ctx = createContext();

    await controller.attach(ctx as never);

    expect(request).toHaveBeenCalledWith("sync.status", {});
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: connected");
    expect(controller.getState()).toEqual({ syncStatus: "connected" });
  });

  it("updates status from sync.statusChanged payloads", async () => {
    let syncListener: unknown = null;
    const controller = createSyncStatusContextController(
      { appendEntry: vi.fn() },
      {
        runtime: {
          client: {
            on: vi.fn().mockImplementation(async (_eventName, listener) => {
              syncListener = listener;
              return { unsubscribe: vi.fn() };
            }),
          },
          connection: {
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
            connect: vi.fn().mockResolvedValue(undefined),
            request: vi.fn().mockResolvedValue({
              ok: true,
              value: {
                local: { mode: "ephemeral-client" },
                remote: { state: "disconnected" },
              },
            }),
          },
        } as never,
      }
    );
    const ctx = createContext();

    await controller.attach(ctx as never);

    if (typeof syncListener !== "function") {
      throw new Error("Expected sync listener to be registered");
    }

    syncListener({
      name: "sync.statusChanged",
      payload: {
        local: { mode: "ephemeral-client" },
        remote: { state: "syncing" },
      },
    });

    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: syncing");
    expect(controller.getState()).toEqual({ syncStatus: "syncing" });
  });

  it("resets to unknown on disconnect and refreshes on reconnect", async () => {
    let connectionStateListener: unknown = null;
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          local: { mode: "ephemeral-client" },
          remote: { state: "connected" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          local: { mode: "ephemeral-client" },
          remote: { state: "connected" },
        },
      });
    const controller = createSyncStatusContextController(
      { appendEntry: vi.fn() },
      {
        runtime: {
          client: {
            on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
          },
          connection: {
            subscribe: vi.fn().mockImplementation((listener) => {
              connectionStateListener = listener;
              return { unsubscribe: vi.fn() };
            }),
            connect: vi.fn().mockResolvedValue(undefined),
            request,
          },
        } as never,
      }
    );
    const ctx = createContext();

    await controller.attach(ctx as never);

    if (typeof connectionStateListener !== "function") {
      throw new Error("Expected connection state listener to be registered");
    }

    connectionStateListener({
      status: "reconnecting",
      socketPath: "/tmp/todu.sock",
      handshake: null,
      lastError: null,
    });
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: unknown");

    connectionStateListener({
      status: "connected",
      socketPath: "/tmp/todu.sock",
      handshake: null,
      lastError: null,
    });
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: connected");
  });
});

describe("sync status helpers", () => {
  it("extracts status values from supported payload shapes", () => {
    expect(extractSyncStatus("connected")).toBe("connected");
    expect(extractSyncStatus({ remote: { state: "syncing" } })).toBe("syncing");
    expect(extractSyncStatus({ status: "connected" })).toBe("connected");
    expect(extractSyncStatus({ state: "blocked" })).toBe("blocked");
    expect(extractSyncStatus({ binding: { state: "error" } })).toBe("error");
    expect(extractSyncStatus({ sync: { status: "running" } })).toBe("running");
    expect(extractSyncStatus({ nope: true })).toBeNull();
  });

  it("normalizes known and unknown sync states", () => {
    expect(
      normalizeSyncStatus({
        local: { mode: "ephemeral-client" },
        remote: { state: "CONNECTED" },
      })
    ).toBe("connected");
    expect(normalizeSyncStatus({ remote: { state: "paused" } })).toBe("custom:paused");
    expect(normalizeSyncStatus({})).toBe("unknown");
  });

  it("formats sync status values for the footer", () => {
    expect(formatSyncStatus("unknown")).toBe("sync: unknown");
    expect(formatSyncStatus("connected")).toBe("sync: connected");
    expect(formatSyncStatus("custom:paused")).toBe("sync: paused");
  });

  it("maps disconnected connection states to unknown sync state", () => {
    const setSyncStatus = vi.fn();

    handleConnectionStateChange(
      {
        status: "connected",
        socketPath: "/tmp/todu.sock",
        handshake: null,
        lastError: null,
      },
      setSyncStatus
    );
    handleConnectionStateChange(
      {
        status: "reconnecting",
        socketPath: "/tmp/todu.sock",
        handshake: null,
        lastError: null,
      },
      setSyncStatus
    );

    expect(setSyncStatus).toHaveBeenCalledTimes(1);
    expect(setSyncStatus).toHaveBeenCalledWith("unknown");
  });
});
