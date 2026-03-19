export interface ToduDaemonConfig {
  configPath: string;
  dataDir: string;
  socketPath: string;
}

const resolveDaemonSocketPath = (config: ToduDaemonConfig): string => config.socketPath;

export { resolveDaemonSocketPath };
