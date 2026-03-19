import type { ToduDaemonSubscription } from "@/services/todu/daemon-events";

export type ToduDaemonConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ToduDaemonConnectionState {
  status: ToduDaemonConnectionStatus;
}

export interface ToduDaemonConnection {
  getState(): ToduDaemonConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: () => void): ToduDaemonSubscription;
}

const createDisconnectedDaemonConnectionState = (): ToduDaemonConnectionState => ({
  status: "disconnected",
});

export { createDisconnectedDaemonConnectionState };
