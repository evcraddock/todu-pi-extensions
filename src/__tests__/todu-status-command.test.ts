import { describe, expect, it, vi } from "vitest";

import { createToduStatusCommandHandler } from "@/extension/todu-status-command";

const createContext = (hasUI = true) => ({
  hasUI,
  ui: {
    notify: vi.fn(),
  },
});

const createRuntime = (options: {
  daemonVersion?: string;
  syncResult?: unknown;
  connectError?: Error;
}) => ({
  ensureConnected: options.connectError
    ? vi.fn().mockRejectedValue(options.connectError)
    : vi.fn().mockResolvedValue({}),
  connection: {
    getState: vi.fn().mockReturnValue({
      status: "connected",
      socketPath: "/tmp/todu.sock",
      handshake: {
        protocolVersion: "1",
        daemonVersion: options.daemonVersion,
      },
      lastError: null,
    }),
    request: vi.fn().mockResolvedValue(
      options.syncResult ?? {
        ok: true,
        value: {
          local: { mode: "standalone" },
          remote: { state: "disconnected" },
        },
      }
    ),
  },
});

describe("createToduStatusCommandHandler", () => {
  it("reports daemon and configured sync server status", async () => {
    const runtime = createRuntime({
      daemonVersion: "0.24.0",
      syncResult: {
        ok: true,
        value: {
          local: { mode: "standalone" },
          remote: {
            state: "connected",
            server: "wss://sync.todu.example",
          },
        },
      },
    });
    const context = createContext();
    const handler = createToduStatusCommandHandler({ runtime: runtime as never });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Todu daemon: connected (version 0.24.0)\n" +
        "Sync server: connected — wss://sync.todu.example",
      "info"
    );
  });

  it("reports when no sync server is configured", async () => {
    const runtime = createRuntime({ daemonVersion: "0.24.0" });
    const context = createContext();
    const handler = createToduStatusCommandHandler({ runtime: runtime as never });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Todu daemon: connected (version 0.24.0)\nSync server: not configured",
      "info"
    );
  });

  it("reports clearly when the daemon is unavailable", async () => {
    const runtime = createRuntime({
      connectError: new Error("Timed out connecting to the todu daemon after 2000ms"),
    });
    const context = createContext();
    const handler = createToduStatusCommandHandler({ runtime: runtime as never });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Todu daemon: unavailable — Timed out connecting to the todu daemon after 2000ms",
      "error"
    );
    expect(runtime.connection.request).not.toHaveBeenCalled();
  });

  it("reports a sync status request failure without hiding daemon availability", async () => {
    const runtime = createRuntime({
      syncResult: {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "sync status failed",
        },
      },
    });
    const context = createContext();
    const handler = createToduStatusCommandHandler({ runtime: runtime as never });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Todu daemon: connected\nSync server: status unavailable — sync status failed",
      "warning"
    );
  });
});
