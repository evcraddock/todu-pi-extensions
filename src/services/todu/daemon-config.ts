import fs from "node:fs";
import path from "node:path";
import {
  normalizeConfigPaths,
  resolveConfigPath,
  resolveDataDir,
  type ConfigResolutionOptions,
  type ToduFileConfig,
} from "@todu/core";
import { parse } from "yaml";

const TODU_DAEMON_SOCKET_ENV = "TODU_DAEMON_SOCKET";
const TODUAI_DAEMON_SOCKET_ENV = "TODUAI_DAEMON_SOCKET";
const DEFAULT_TODU_DAEMON_SOCKET_FILENAME = "daemon.sock";

export interface ToduDaemonConfig {
  configPath: string;
  dataDir: string;
  socketPath: string;
  fileConfig: ToduFileConfig;
}

export interface ResolveToduDaemonConfigOptions extends ConfigResolutionOptions {
  configPath?: string;
}

const loadToduFileConfig = (configPath: string): ToduFileConfig => {
  let content: string;

  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch {
    return {};
  }

  const parsed = (parse(content) as ToduFileConfig | null) ?? {};
  return normalizeConfigPaths(parsed, configPath);
};

const resolveDaemonSocketPath = (dataDir: string, env: NodeJS.ProcessEnv = process.env): string => {
  const socketOverride = env[TODU_DAEMON_SOCKET_ENV] ?? env[TODUAI_DAEMON_SOCKET_ENV];
  if (typeof socketOverride === "string" && socketOverride.trim().length > 0) {
    return path.resolve(socketOverride);
  }

  return path.join(dataDir, DEFAULT_TODU_DAEMON_SOCKET_FILENAME);
};

const resolveToduDaemonConfig = (
  options: ResolveToduDaemonConfigOptions = {}
): ToduDaemonConfig => {
  const configPath = resolveConfigPath(options.configPath, options);
  const fileConfig = loadToduFileConfig(configPath);
  const dataDir = resolveDataDir(configPath, fileConfig, options);
  const socketPath = resolveDaemonSocketPath(dataDir, options.env);

  return {
    configPath,
    dataDir,
    socketPath,
    fileConfig,
  };
};

export {
  DEFAULT_TODU_DAEMON_SOCKET_FILENAME,
  TODUAI_DAEMON_SOCKET_ENV,
  TODU_DAEMON_SOCKET_ENV,
  loadToduFileConfig,
  resolveDaemonSocketPath,
  resolveToduDaemonConfig,
};
