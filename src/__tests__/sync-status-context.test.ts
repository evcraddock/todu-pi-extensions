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
  it("shows the initial unknown state and updates status from sync events", async () => {
    let syncListener: unknown = null;
    const subscribeToConnectionState = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
    const connect = vi.fn().mockResolvedValue(undefined);
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
            subscribe: subscribeToConnectionState,
            connect,
          },
        } as never,
      }
    );
    const ctx = createContext();

    await controller.attach(ctx as never);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith(SYNC_STATUS_KEY, "sync: unknown");
    expect(connect).toHaveBeenCalledTimes(1);

    const registeredSyncListener = syncListener;
    if (typeof registeredSyncListener !== "function") {
      throw new Error("Expected sync listener to be registered");
    }

    registeredSyncListener({ name: "sync.statusChanged", payload: { status: "running" } });

    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: running");
    expect(controller.getState()).toEqual({ syncStatus: "running" });
  });

  it("resets to unknown when the daemon connection is not connected", async () => {
    let connectionStateListener: unknown = null;
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
          },
        } as never,
      }
    );
    const ctx = createContext();

    await controller.attach(ctx as never);

    const registeredConnectionStateListener = connectionStateListener;
    if (typeof registeredConnectionStateListener !== "function") {
      throw new Error("Expected connection state listener to be registered");
    }

    registeredConnectionStateListener({
      status: "reconnecting",
      socketPath: "/tmp/todu.sock",
      handshake: null,
      lastError: null,
    });

    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(SYNC_STATUS_KEY, "sync: unknown");
    expect(controller.getState()).toEqual({ syncStatus: "unknown" });
  });
});

describe("sync status helpers", () => {
  it("extracts status values from supported payload shapes", () => {
    expect(extractSyncStatus("running")).toBe("running");
    expect(extractSyncStatus({ status: "idle" })).toBe("idle");
    expect(extractSyncStatus({ state: "blocked" })).toBe("blocked");
    expect(extractSyncStatus({ binding: { state: "error" } })).toBe("error");
    expect(extractSyncStatus({ sync: { status: "running" } })).toBe("running");
    expect(extractSyncStatus({ sync: { state: "idle" } })).toBe("idle");
    expect(extractSyncStatus({ nope: true })).toBeNull();
  });

  it("normalizes known and unknown sync states", () => {
    expect(normalizeSyncStatus({ payload: { status: "RUNNING" } })).toBe("running");
    expect(normalizeSyncStatus({ payload: { state: "paused" } })).toBe("custom:paused");
    expect(normalizeSyncStatus({ payload: {} })).toBe("unknown");
  });

  it("formats sync status values for the footer", () => {
    expect(formatSyncStatus("unknown")).toBe("sync: unknown");
    expect(formatSyncStatus("running")).toBe("sync: running");
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
