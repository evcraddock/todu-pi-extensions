export const TODU_DAEMON_EVENT_NAMES = ["data.changed", "sync.statusChanged"] as const;

export type ToduDaemonEventName = (typeof TODU_DAEMON_EVENT_NAMES)[number];

export interface ToduDaemonEvent {
  name: ToduDaemonEventName;
  payload?: Record<string, unknown>;
}

export interface ToduDaemonSubscription {
  unsubscribe(): void;
}
