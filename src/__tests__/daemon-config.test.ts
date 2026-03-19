import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadToduFileConfig,
  resolveDaemonSocketPath,
  resolveToduDaemonConfig,
} from "@/services/todu/daemon-config";

describe("resolveToduDaemonConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads config and resolves data and socket paths with todu conventions", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-pi-config-"));
    const configPath = path.join(tmpDir, "config", "config.yaml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "data_dir: ../storage\n", "utf8");

    const config = resolveToduDaemonConfig({
      configPath,
      env: {},
    });

    expect(loadToduFileConfig(configPath)).toEqual({ data_dir: "../storage" });
    expect(config.configPath).toBe(path.resolve(configPath));
    expect(config.dataDir).toBe(path.resolve(path.dirname(configPath), "../storage"));
    expect(config.socketPath).toBe(path.join(config.dataDir, "daemon.sock"));
  });

  it("prefers daemon socket env overrides", () => {
    const dataDir = path.join(os.tmpdir(), "todu-pi-config-env");
    const socketPath = resolveDaemonSocketPath(dataDir, {
      TODU_DAEMON_SOCKET: "./tmp/custom-daemon.sock",
    });

    expect(socketPath).toBe(path.resolve("./tmp/custom-daemon.sock"));
  });
});
