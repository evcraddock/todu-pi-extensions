import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createToduDaemonConnection,
  TODU_DAEMON_PROTOCOL_VERSION,
  type ToduDaemonConnection,
  type ToduDaemonConnectionState,
} from "@/services/todu/daemon-connection";
import type { ToduDaemonConfig } from "@/services/todu/daemon-config";
import type { ToduDaemonEventName } from "@/services/todu/daemon-events";

describe("createToduDaemonConnection", () => {
  it("connects, performs daemon.hello, and exposes connected state", async () => {
    const socketPath = createSocketPath();
    const daemon = createMockDaemonServer(socketPath);
    await daemon.start();

    const manager = createTestConnection(socketPath);
    const states: ToduDaemonConnectionState[] = [];
    manager.subscribe((state) => {
      states.push(state);
    });

    await manager.connect();

    expect(manager.getState().status).toBe("connected");
    expect(manager.getState().handshake?.protocolVersion).toBe(TODU_DAEMON_PROTOCOL_VERSION);

    await expect(manager.request<{ ok: true }>("daemon.ping")).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });

    await manager.disconnect();
    await daemon.stop();

    expect(states.at(-1)?.status).toBe("disconnected");
    expect(daemon.methodCalls).toContain("daemon.hello");
    expect(daemon.methodCalls).toContain("daemon.ping");
  });

  it("reconnects and re-subscribes after daemon restart", async () => {
    const socketPath = createSocketPath();
    const daemon = createMockDaemonServer(socketPath);
    await daemon.start();

    const manager = createTestConnection(socketPath);
    const receivedEvents: ToduDaemonEventName[] = [];

    await manager.connect();
    await manager.subscribeToEvents(["data.changed"], (event) => {
      receivedEvents.push(event.name);
    });

    await waitForCondition(
      () => daemon.methodCalls.filter((method) => method === "events.subscribe").length >= 1,
      "initial event subscription"
    );

    daemon.dispatchEvent("data.changed", { count: 1 });
    await waitForCondition(() => receivedEvents.length >= 1, "first daemon event");

    await daemon.stop();
    await waitForCondition(
      () => manager.getState().status === "reconnecting",
      "reconnecting state"
    );

    await daemon.start();
    await waitForCondition(() => manager.getState().status === "connected", "reconnected state");
    await waitForCondition(
      () => daemon.methodCalls.filter((method) => method === "events.subscribe").length >= 2,
      "re-subscribe after reconnect"
    );

    daemon.dispatchEvent("data.changed", { count: 2 });
    await waitForCondition(() => receivedEvents.length >= 2, "event after reconnect");

    await manager.disconnect();
    await daemon.stop();

    expect(receivedEvents).toEqual(["data.changed", "data.changed"]);
  });

  it("keeps retrying until the daemon becomes available", async () => {
    const socketPath = createSocketPath();
    const daemon = createMockDaemonServer(socketPath);
    const manager = createTestConnection(socketPath, {
      connectTimeoutMs: 20,
      reconnectBackoffMs: [10, 20, 20],
    });

    const connectPromise = manager.connect();
    await waitForCondition(() => manager.getState().status === "reconnecting", "initial reconnect");

    await daemon.start();
    await connectPromise;

    expect(manager.getState().status).toBe("connected");
    expect(daemon.methodCalls).toContain("daemon.hello");

    await manager.disconnect();
    await daemon.stop();
  });
});

const createTestConnection = (
  socketPath: string,
  overrides: Partial<{
    connectTimeoutMs: number;
    requestTimeoutMs: number;
    reconnectBackoffMs: readonly number[];
  }> = {}
): ToduDaemonConnection => {
  const daemonConfig: ToduDaemonConfig = {
    configPath: path.join(path.dirname(socketPath), "config.yaml"),
    dataDir: path.dirname(socketPath),
    socketPath,
    fileConfig: {},
  };

  return createToduDaemonConnection({
    daemonConfig,
    connectTimeoutMs: overrides.connectTimeoutMs ?? 50,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 100,
    reconnectBackoffMs: overrides.reconnectBackoffMs ?? [10, 20, 20],
  });
};

interface MockDaemonServer {
  methodCalls: string[];
  start(): Promise<void>;
  stop(): Promise<void>;
  dispatchEvent(event: ToduDaemonEventName, payload: unknown): void;
}

const createMockDaemonServer = (socketPath: string): MockDaemonServer => {
  let server: net.Server | null = null;
  const sockets = new Set<Socket>();
  const methodCalls: string[] = [];

  return {
    methodCalls,

    async start(): Promise<void> {
      await fs.promises.mkdir(path.dirname(socketPath), { recursive: true });
      try {
        await fs.promises.unlink(socketPath);
      } catch {
        // Socket path did not exist.
      }

      server = net.createServer((socket) => {
        sockets.add(socket);
        socket.setEncoding("utf8");

        let buffer = "";
        const subscriptions = new Set<ToduDaemonEventName>();

        socket.on("data", (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
              continue;
            }

            const frame = JSON.parse(trimmed) as {
              id?: string;
              method?: string;
              params?: Record<string, unknown>;
            };

            if (typeof frame.id !== "string" || typeof frame.method !== "string") {
              continue;
            }

            methodCalls.push(frame.method);

            if (frame.method === "daemon.hello") {
              socket.write(
                `${JSON.stringify({
                  id: frame.id,
                  result: {
                    protocolVersion: TODU_DAEMON_PROTOCOL_VERSION,
                    daemonVersion: "test",
                    role: "node",
                    capabilities: {
                      methods: [
                        "daemon.hello",
                        "daemon.ping",
                        "events.subscribe",
                        "events.unsubscribe",
                      ],
                      events: ["data.changed", "sync.statusChanged"],
                    },
                    catalog: { id: "catalog-test" },
                  },
                })}\n`
              );
              continue;
            }

            if (frame.method === "daemon.ping") {
              socket.write(`${JSON.stringify({ id: frame.id, result: { ok: true } })}\n`);
              continue;
            }

            if (frame.method === "events.subscribe") {
              const events = normalizeEventNames(frame.params?.events);
              for (const event of events) {
                subscriptions.add(event);
              }
              socket.write(`${JSON.stringify({ id: frame.id, result: { subscribed: events } })}\n`);
              continue;
            }

            if (frame.method === "events.unsubscribe") {
              const events = normalizeEventNames(frame.params?.events);
              for (const event of events) {
                subscriptions.delete(event);
              }
              socket.write(
                `${JSON.stringify({ id: frame.id, result: { unsubscribed: events } })}\n`
              );
              continue;
            }

            socket.write(
              `${JSON.stringify({
                id: frame.id,
                error: {
                  code: "METHOD_NOT_FOUND",
                  message: `Unknown method: ${frame.method}`,
                },
              })}\n`
            );
          }
        });

        const removeSocket = (): void => {
          sockets.delete(socket);
        };

        socket.on("close", removeSocket);
        socket.on("error", removeSocket);

        (socket as Socket & { subscriptions?: Set<ToduDaemonEventName> }).subscriptions =
          subscriptions;
      });

      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(socketPath, () => {
          server?.off("error", reject);
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();

      if (server) {
        const activeServer = server;
        server = null;
        await new Promise<void>((resolve) => {
          activeServer.close(() => {
            resolve();
          });
        });
      }

      try {
        await fs.promises.unlink(socketPath);
      } catch {
        // Socket path already removed.
      }
    },

    dispatchEvent(event: ToduDaemonEventName, payload: unknown): void {
      for (const socket of sockets) {
        const trackedSocket = socket as Socket & { subscriptions?: Set<ToduDaemonEventName> };
        if (!trackedSocket.subscriptions?.has(event)) {
          continue;
        }

        socket.write(`${JSON.stringify({ event, payload, ts: new Date().toISOString() })}\n`);
      }
    },
  };
};

const normalizeEventNames = (value: unknown): ToduDaemonEventName[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is ToduDaemonEventName =>
      entry === "data.changed" || entry === "sync.statusChanged"
  );
};

const createSocketPath = (): string => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-pi-daemon-connection-"));
  return path.join(tmpDir, "daemon.sock");
};

const waitForCondition = async (
  predicate: () => boolean,
  label: string,
  timeoutMs = 2_000
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(`Timed out waiting for condition: ${label}`);
};
