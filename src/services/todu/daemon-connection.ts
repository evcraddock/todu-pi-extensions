import net, { type Socket } from "node:net";

import {
  resolveToduDaemonConfig,
  type ResolveToduDaemonConfigOptions,
  type ToduDaemonConfig,
} from "@/services/todu/daemon-config";
import {
  TODU_DAEMON_EVENT_NAMES,
  type ToduDaemonEvent,
  type ToduDaemonEventListener,
  type ToduDaemonEventName,
  type ToduDaemonSubscription,
} from "@/services/todu/daemon-events";

export const TODU_DAEMON_PROTOCOL_VERSION = "1";
export const DEFAULT_TODU_DAEMON_CONNECT_TIMEOUT_MS = 1_000;
export const DEFAULT_TODU_DAEMON_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_TODU_DAEMON_RECONNECT_BACKOFF_MS = [250, 500, 1_000, 2_000] as const;

export interface ToduDaemonConnectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ToduDaemonConnectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ToduDaemonConnectionError };

export interface ToduDaemonHelloResult {
  protocolVersion: string;
  daemonVersion?: string;
  role?: "node" | "authority";
  capabilities?: {
    methods?: string[];
    events?: string[];
  };
  catalog?: {
    id: string | null;
  };
}

export type ToduDaemonConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ToduDaemonConnectionState {
  status: ToduDaemonConnectionStatus;
  socketPath: string;
  handshake: ToduDaemonHelloResult | null;
  lastError: ToduDaemonConnectionError | null;
}

export interface ToduDaemonRequestOptions {
  timeoutMs?: number;
}

export interface CreateToduDaemonConnectionOptions extends ResolveToduDaemonConfigOptions {
  daemonConfig?: ToduDaemonConfig;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  reconnectBackoffMs?: readonly number[];
  connect?: (socketPath: string) => Socket;
  requestIdFactory?: () => string;
}

export interface ToduDaemonConnection {
  getState(): ToduDaemonConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: ToduDaemonRequestOptions
  ): Promise<ToduDaemonConnectionResult<T>>;
  subscribe(listener: (state: ToduDaemonConnectionState) => void): ToduDaemonSubscription;
  subscribeToEvents(
    events: readonly ToduDaemonEventName[],
    listener: ToduDaemonEventListener
  ): Promise<ToduDaemonSubscription>;
}

interface PendingRequest {
  id: string;
  method: string;
  resolve: (result: ToduDaemonConnectionResult<unknown>) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ActiveConnection {
  socket: Socket;
  pending: Map<string, PendingRequest>;
  buffer: string;
  closed: boolean;
  dispose(): void;
}

interface ProtocolSuccessFrame {
  id: string;
  result: unknown;
}

interface ProtocolErrorFrame {
  id: string | null;
  error: ToduDaemonConnectionError;
}

interface ParsedEventFrame {
  event: ToduDaemonEventName;
  payload: unknown;
  ts?: string;
}

interface EventSubscriptionRecord {
  events: ToduDaemonEventName[];
  listener: ToduDaemonEventListener;
}

class ToduDaemonConnectionManager implements ToduDaemonConnection {
  private readonly daemonConfig: ToduDaemonConfig;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly reconnectBackoffMs: readonly number[];
  private readonly connectSocketFactory: (socketPath: string) => Socket;
  private readonly requestIdFactory: () => string;

  private state: ToduDaemonConnectionState;
  private readonly stateListeners = new Set<(state: ToduDaemonConnectionState) => void>();
  private readonly eventSubscriptions = new Set<EventSubscriptionRecord>();
  private activeEventNames: ToduDaemonEventName[] = [];
  private activeConnection: ActiveConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private running = false;
  private connecting = false;
  private connectPromise: Promise<void> | null = null;
  private resolveConnectPromise: (() => void) | null = null;
  private rejectConnectPromise: ((error: unknown) => void) | null = null;

  constructor(options: CreateToduDaemonConnectionOptions = {}) {
    this.daemonConfig = options.daemonConfig ?? resolveToduDaemonConfig(options);
    this.connectTimeoutMs = normalizeTimeout(
      options.connectTimeoutMs,
      DEFAULT_TODU_DAEMON_CONNECT_TIMEOUT_MS
    );
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      DEFAULT_TODU_DAEMON_REQUEST_TIMEOUT_MS
    );
    this.reconnectBackoffMs = normalizeReconnectBackoff(options.reconnectBackoffMs);
    this.connectSocketFactory =
      options.connect ?? ((socketPath: string) => net.createConnection(socketPath));
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.state = createDisconnectedDaemonConnectionState(this.daemonConfig.socketPath);
  }

  getState(): ToduDaemonConnectionState {
    return cloneConnectionState(this.state);
  }

  async connect(): Promise<void> {
    if (this.activeConnection) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.running = true;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnectPromise = resolve;
      this.rejectConnectPromise = reject;
    });

    void this.attemptConnect();

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.connecting = false;
    this.reconnectAttempt = 0;
    this.activeEventNames = [];

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.activeConnection) {
      this.closeConnection(this.activeConnection, {
        reason: new Error("Daemon connection disconnected by caller"),
        shouldReconnect: false,
      });
    } else {
      this.updateState({
        status: "disconnected",
        handshake: null,
      });
    }

    this.rejectPendingConnect(
      new Error("Daemon connection disconnected before initial connect completed")
    );
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options?: ToduDaemonRequestOptions
  ): Promise<ToduDaemonConnectionResult<T>> {
    if (!this.activeConnection) {
      return {
        ok: false,
        error: createDaemonUnavailableError(this.daemonConfig.socketPath, "NOT_CONNECTED"),
      };
    }

    const timeoutMs = normalizeTimeout(options?.timeoutMs, this.requestTimeoutMs);
    return this.sendRequestOnConnection<T>(this.activeConnection, method, params, timeoutMs);
  }

  subscribe(listener: (state: ToduDaemonConnectionState) => void): ToduDaemonSubscription {
    this.stateListeners.add(listener);
    listener(this.getState());

    return {
      unsubscribe: () => {
        this.stateListeners.delete(listener);
      },
    };
  }

  async subscribeToEvents(
    events: readonly ToduDaemonEventName[],
    listener: ToduDaemonEventListener
  ): Promise<ToduDaemonSubscription> {
    const normalizedEvents = uniqueEventNames(events);
    const record: EventSubscriptionRecord = {
      events: normalizedEvents,
      listener,
    };

    this.eventSubscriptions.add(record);

    if (this.activeConnection) {
      const syncResult = await this.syncEventSubscriptions();
      if (!syncResult.ok) {
        this.closeConnection(this.activeConnection, {
          reason: syncResult.error,
          shouldReconnect: true,
        });
      }
    }

    return {
      unsubscribe: () => {
        this.eventSubscriptions.delete(record);
        if (this.activeConnection) {
          void this.syncEventSubscriptions();
        }
      },
    };
  }

  private async attemptConnect(): Promise<void> {
    if (!this.running || this.connecting || this.activeConnection) {
      return;
    }

    this.connecting = true;
    this.updateState({
      status: this.reconnectAttempt > 0 ? "reconnecting" : "connecting",
    });

    const socketResult = await connectSocket(
      this.daemonConfig.socketPath,
      this.connectTimeoutMs,
      this.connectSocketFactory
    );

    this.connecting = false;

    if (!this.running) {
      if (socketResult.ok) {
        socketResult.value.destroy();
      }
      return;
    }

    if (!socketResult.ok) {
      this.scheduleReconnect(socketResult.error);
      return;
    }

    const connection = this.createActiveConnection(socketResult.value);
    this.activeConnection = connection;

    const helloResult = await this.sendRequestOnConnection<ToduDaemonHelloResult>(
      connection,
      "daemon.hello",
      {
        protocolVersion: TODU_DAEMON_PROTOCOL_VERSION,
      },
      this.requestTimeoutMs
    );

    if (!helloResult.ok) {
      this.closeConnection(connection, {
        reason: helloResult.error,
        shouldReconnect: true,
      });
      return;
    }

    if (!isProtocolHelloResult(helloResult.value, TODU_DAEMON_PROTOCOL_VERSION)) {
      this.closeConnection(connection, {
        reason: {
          code: "BAD_RESPONSE",
          message: "Daemon hello response is missing expected protocol metadata",
        },
        shouldReconnect: true,
      });
      return;
    }

    this.reconnectAttempt = 0;
    this.updateState({
      status: "connected",
      handshake: helloResult.value,
      lastError: null,
    });

    const syncResult = await this.syncEventSubscriptions();
    if (!syncResult.ok) {
      this.closeConnection(connection, {
        reason: syncResult.error,
        shouldReconnect: true,
      });
      return;
    }

    this.resolvePendingConnect();
  }

  private createActiveConnection(socket: Socket): ActiveConnection {
    const connection: ActiveConnection = {
      socket,
      pending: new Map<string, PendingRequest>(),
      buffer: "",
      closed: false,
      dispose: () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("close", onClose);
      },
    };

    const onData = (chunk: string | Buffer) => {
      if (connection.closed) {
        return;
      }

      connection.buffer += chunk.toString();
      const lines = connection.buffer.split("\n");
      connection.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }

        const parsedFrame = parseIncomingFrame(trimmed);
        if (!parsedFrame.ok) {
          this.closeConnection(connection, {
            reason: parsedFrame.error,
            shouldReconnect: true,
          });
          return;
        }

        if (parsedFrame.kind === "event") {
          this.dispatchEvent(parsedFrame.value);
          continue;
        }

        const pending = connection.pending.get(parsedFrame.value.id ?? "");
        if (!pending) {
          continue;
        }

        clearTimeout(pending.timeout);
        connection.pending.delete(pending.id);

        if (parsedFrame.kind === "error") {
          pending.resolve({ ok: false, error: parsedFrame.value.error });
          continue;
        }

        pending.resolve({ ok: true, value: parsedFrame.value.result });
      }
    };

    const onError = (error: unknown) => {
      this.closeConnection(connection, {
        reason: error,
        shouldReconnect: true,
      });
    };

    const onClose = () => {
      this.closeConnection(connection, {
        reason: new Error("Daemon connection closed"),
        shouldReconnect: true,
      });
    };

    socket.setEncoding("utf8");
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);

    return connection;
  }

  private async sendRequestOnConnection<T>(
    connection: ActiveConnection,
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ToduDaemonConnectionResult<T>> {
    if (connection.closed) {
      return {
        ok: false,
        error: createDaemonUnavailableError(this.daemonConfig.socketPath, "CONNECTION_CLOSED"),
      };
    }

    const id = this.requestIdFactory();

    return new Promise<ToduDaemonConnectionResult<T>>((resolve) => {
      const timeout = setTimeout(() => {
        connection.pending.delete(id);
        resolve({
          ok: false,
          error: createRequestTimeoutError(method, timeoutMs),
        });
      }, timeoutMs);

      connection.pending.set(id, {
        id,
        method,
        timeout,
        resolve: (result) => {
          resolve(result as ToduDaemonConnectionResult<T>);
        },
      });

      try {
        connection.socket.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch (error) {
        clearTimeout(timeout);
        connection.pending.delete(id);
        resolve({
          ok: false,
          error: mapUnknownToConnectionError(error, {
            code: "DAEMON_UNAVAILABLE",
            socketPath: this.daemonConfig.socketPath,
            method,
          }),
        });
      }
    });
  }

  private dispatchEvent(frame: ParsedEventFrame): void {
    const event: ToduDaemonEvent = {
      name: frame.event,
      payload: frame.payload,
      ts: frame.ts,
    };

    for (const subscription of this.eventSubscriptions) {
      if (!subscription.events.includes(frame.event)) {
        continue;
      }

      subscription.listener(event);
    }
  }

  private async syncEventSubscriptions(): Promise<ToduDaemonConnectionResult<void>> {
    if (!this.activeConnection) {
      return { ok: true, value: undefined };
    }

    const desiredEvents = collectSubscribedEvents(this.eventSubscriptions);
    const eventsToSubscribe = desiredEvents.filter(
      (event) => !this.activeEventNames.includes(event)
    );
    const eventsToUnsubscribe = this.activeEventNames.filter(
      (event) => !desiredEvents.includes(event)
    );

    if (eventsToSubscribe.length > 0) {
      const subscribeResult = await this.sendRequestOnConnection<{ subscribed: string[] }>(
        this.activeConnection,
        "events.subscribe",
        { events: eventsToSubscribe },
        this.requestTimeoutMs
      );
      if (!subscribeResult.ok) {
        return subscribeResult;
      }
    }

    if (eventsToUnsubscribe.length > 0) {
      const unsubscribeResult = await this.sendRequestOnConnection<{ unsubscribed: string[] }>(
        this.activeConnection,
        "events.unsubscribe",
        { events: eventsToUnsubscribe },
        this.requestTimeoutMs
      );
      if (!unsubscribeResult.ok) {
        return unsubscribeResult;
      }
    }

    this.activeEventNames = desiredEvents;

    return { ok: true, value: undefined };
  }

  private closeConnection(
    connection: ActiveConnection,
    options: { reason: unknown; shouldReconnect: boolean }
  ): void {
    if (connection.closed) {
      return;
    }

    connection.closed = true;
    connection.dispose();

    if (this.activeConnection === connection) {
      this.activeConnection = null;
    }

    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve({
        ok: false,
        error: createDaemonUnavailableError(this.daemonConfig.socketPath, "CONNECTION_CLOSED", {
          method: pending.method,
        }),
      });
    }
    connection.pending.clear();

    connection.socket.destroy();
    this.activeEventNames = [];

    if (options.shouldReconnect && this.running) {
      this.scheduleReconnect(options.reason);
      return;
    }

    this.updateState({
      status: "disconnected",
      handshake: null,
      lastError: options.shouldReconnect
        ? mapUnknownToConnectionError(options.reason)
        : this.state.lastError,
    });
  }

  private scheduleReconnect(reason: unknown): void {
    if (!this.running) {
      this.updateState({
        status: "disconnected",
        handshake: null,
        lastError: mapUnknownToConnectionError(reason),
      });
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay =
      this.reconnectBackoffMs[Math.min(this.reconnectAttempt, this.reconnectBackoffMs.length - 1)];
    this.reconnectAttempt += 1;

    this.updateState({
      status: "reconnecting",
      handshake: null,
      lastError: mapUnknownToConnectionError(reason),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptConnect();
    }, delay);
  }

  private updateState(partialState: Partial<ToduDaemonConnectionState>): void {
    this.state = {
      ...this.state,
      ...partialState,
    };

    const snapshot = this.getState();
    for (const listener of this.stateListeners) {
      listener(snapshot);
    }
  }

  private resolvePendingConnect(): void {
    this.resolveConnectPromise?.();
    this.connectPromise = null;
    this.resolveConnectPromise = null;
    this.rejectConnectPromise = null;
  }

  private rejectPendingConnect(error: unknown): void {
    this.rejectConnectPromise?.(error);
    this.connectPromise = null;
    this.resolveConnectPromise = null;
    this.rejectConnectPromise = null;
  }
}

const createDisconnectedDaemonConnectionState = (socketPath = ""): ToduDaemonConnectionState => ({
  status: "disconnected",
  socketPath,
  handshake: null,
  lastError: null,
});

const createToduDaemonConnection = (
  options: CreateToduDaemonConnectionOptions = {}
): ToduDaemonConnection => new ToduDaemonConnectionManager(options);

const cloneConnectionState = (state: ToduDaemonConnectionState): ToduDaemonConnectionState => ({
  ...state,
  handshake: state.handshake ? { ...state.handshake } : null,
  lastError: state.lastError ? { ...state.lastError } : null,
});

const connectSocket = async (
  socketPath: string,
  timeoutMs: number,
  connect: (socketPath: string) => Socket
): Promise<ToduDaemonConnectionResult<Socket>> =>
  new Promise((resolve) => {
    const socket = connect(socketPath);
    let settled = false;

    const cleanup = (): void => {
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };

    const finish = (result: ToduDaemonConnectionResult<Socket>): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(result);
    };

    const onConnect = (): void => {
      finish({ ok: true, value: socket });
    };

    const onError = (error: unknown): void => {
      finish({
        ok: false,
        error: mapConnectError(socketPath, error),
      });
    };

    const timeout = setTimeout(() => {
      socket.destroy();
      finish({
        ok: false,
        error: {
          code: "DAEMON_UNAVAILABLE",
          message: `Timed out connecting to daemon socket after ${Math.floor(timeoutMs)}ms`,
          details: {
            socketPath,
            timeoutMs: Math.floor(timeoutMs),
          },
        },
      });
    }, timeoutMs);

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });

const mapConnectError = (socketPath: string, source: unknown): ToduDaemonConnectionError => {
  const code = errorCode(source);
  if (code === "ENOENT" || code === "ECONNREFUSED" || code === "EACCES" || code === "EPERM") {
    return createDaemonUnavailableError(socketPath, code);
  }

  return mapUnknownToConnectionError(source, {
    socketPath,
  });
};

const parseIncomingFrame = (
  payload: string
):
  | { ok: true; kind: "success"; value: ProtocolSuccessFrame }
  | { ok: true; kind: "error"; value: ProtocolErrorFrame }
  | { ok: true; kind: "event"; value: ParsedEventFrame }
  | { ok: false; error: ToduDaemonConnectionError } => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: "Daemon returned invalid JSON response",
        details: {
          parseError: getErrorMessage(error),
        },
      },
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: "Daemon response frame must be an object",
      },
    };
  }

  if (typeof parsed.event === "string") {
    if (!isToduDaemonEventName(parsed.event)) {
      return {
        ok: false,
        error: {
          code: "BAD_RESPONSE",
          message: `Daemon emitted unsupported event: ${parsed.event}`,
        },
      };
    }

    return {
      ok: true,
      kind: "event",
      value: {
        event: parsed.event,
        payload: parsed.payload,
        ts: typeof parsed.ts === "string" ? parsed.ts : undefined,
      },
    };
  }

  if (isRecord(parsed.error)) {
    const error = parsed.error;
    if (typeof error.code === "string" && typeof error.message === "string") {
      return {
        ok: true,
        kind: "error",
        value: {
          id: typeof parsed.id === "string" ? parsed.id : null,
          error: {
            code: error.code,
            message: error.message,
            details: isRecord(error.details) ? error.details : undefined,
          },
        },
      };
    }
  }

  if (typeof parsed.id === "string" && "result" in parsed) {
    return {
      ok: true,
      kind: "success",
      value: {
        id: parsed.id,
        result: parsed.result,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "BAD_RESPONSE",
      message: "Daemon response frame shape is invalid",
    },
  };
};

const isProtocolHelloResult = (
  value: unknown,
  expectedProtocolVersion: string
): value is ToduDaemonHelloResult => {
  if (!isRecord(value)) {
    return false;
  }

  return value.protocolVersion === expectedProtocolVersion;
};

const createDaemonUnavailableError = (
  socketPath: string,
  reason: string,
  details: Record<string, unknown> = {}
): ToduDaemonConnectionError => ({
  code: "DAEMON_UNAVAILABLE",
  message: `Daemon unavailable at socket: ${socketPath}`,
  details: {
    socketPath,
    reason,
    ...details,
  },
});

const createRequestTimeoutError = (
  method: string,
  timeoutMs: number
): ToduDaemonConnectionError => ({
  code: "TIMEOUT",
  message: `Timed out waiting for daemon response to ${method} after ${Math.floor(timeoutMs)}ms`,
  details: {
    method,
    timeoutMs: Math.floor(timeoutMs),
  },
});

const mapUnknownToConnectionError = (
  source: unknown,
  details: Record<string, unknown> = {}
): ToduDaemonConnectionError => {
  if (isToduDaemonConnectionError(source)) {
    return {
      ...source,
      details: {
        ...(source.details ?? {}),
        ...details,
      },
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: getErrorMessage(source),
    details: Object.keys(details).length > 0 ? details : undefined,
  };
};

const collectSubscribedEvents = (
  subscriptions: ReadonlySet<EventSubscriptionRecord>
): ToduDaemonEventName[] => {
  const events = new Set<ToduDaemonEventName>();

  for (const subscription of subscriptions) {
    for (const event of subscription.events) {
      events.add(event);
    }
  }

  return [...events];
};

const uniqueEventNames = (events: readonly ToduDaemonEventName[]): ToduDaemonEventName[] => {
  const deduped = new Set<ToduDaemonEventName>();

  for (const event of events) {
    if (isToduDaemonEventName(event)) {
      deduped.add(event);
    }
  }

  return [...deduped];
};

const isToduDaemonEventName = (value: string): value is ToduDaemonEventName =>
  (TODU_DAEMON_EVENT_NAMES as readonly string[]).includes(value);

const normalizeReconnectBackoff = (backoff?: readonly number[]): readonly number[] => {
  const values = backoff && backoff.length > 0 ? backoff : DEFAULT_TODU_DAEMON_RECONNECT_BACKOFF_MS;
  return values.map((value) => normalizeTimeout(value, 250));
};

const normalizeTimeout = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
};

const createRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isToduDaemonConnectionError = (value: unknown): value is ToduDaemonConnectionError =>
  isRecord(value) && typeof value.code === "string" && typeof value.message === "string";

const getErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return "Unexpected internal error";
};

const errorCode = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.code !== "string") {
    return null;
  }

  return value.code;
};

export {
  createDisconnectedDaemonConnectionState,
  createToduDaemonConnection,
  createDaemonUnavailableError,
};
