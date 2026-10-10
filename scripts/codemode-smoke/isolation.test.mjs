import { describe, expect, it } from "vitest";

import {
  assertSmokeEnvironment,
  createSmokeEnvironment,
  smokePaths,
  supportsPiVersion,
} from "./isolation.mjs";

const root = "/tmp/todu-cm-Ab1234";

describe("codemode smoke isolation guards (unit only)", () => {
  it("does not forward ambient credentials, Node preload flags, or Todu/Pi overrides", () => {
    const env = createSmokeEnvironment(root, {
      PATH: "/bin",
      OPENAI_API_KEY: "synthetic-secret",
      NODE_OPTIONS: "--import unsafe.js",
      TODU_CONFIG: "/normal/config",
      TODU_DATA_DIR: "/normal/data",
      TODU_DAEMON_SOCKET: "/normal/socket",
      TODUAI_DAEMON_SOCKET: "/legacy/socket",
      PI_CODING_AGENT_DIR: "/normal/pi",
      PI_SESSION_FILE: "/normal/session",
      HOME: "/normal/home",
      XDG_CONFIG_HOME: "/normal/config",
    });
    expect(env.PATH).toBe("/bin");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PI_SESSION_FILE).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain("/normal");
    expect(env.TODU_DAEMON_SOCKET).toBe(smokePaths(root).socket);
    expect(env.TODUAI_DAEMON_SOCKET).toBe(smokePaths(root).socket);
    expect(env.PI_OFFLINE).toBe("1");
    expect(env.PI_TELEMETRY).toBe("0");
    expect(() => assertSmokeEnvironment(root, env)).not.toThrow();
  });

  it.each(["OPENAI_API_KEY", "NODE_OPTIONS", "toString"])(
    "rejects unexpected worker environment key %s",
    (key) => {
      const env = createSmokeEnvironment(root, {});
      env[key] = "synthetic-only";
      expect(() => assertSmokeEnvironment(root, env)).toThrow(
        "Smoke isolation environment mismatch"
      );
    }
  );

  it.each([
    "HOME",
    "XDG_CONFIG_HOME",
    "TODU_CONFIG",
    "TODU_DATA_DIR",
    "TODU_DAEMON_SOCKET",
    "TODUAI_DAEMON_SOCKET",
    "PI_CODING_AGENT_DIR",
    "PI_OFFLINE",
  ])("rejects missing/changed critical isolation variable %s", (key) => {
    const env = createSmokeEnvironment(root, {});
    delete env[key];
    expect(() => assertSmokeEnvironment(root, env)).toThrow("Smoke isolation environment mismatch");
    env[key] = "/normal/state";
    expect(() => assertSmokeEnvironment(root, env)).toThrow("Smoke isolation environment mismatch");
  });

  it.each([
    "/normal/state",
    "relative/todu-cm-Ab1234",
    "/tmp/todu-cm-Ab1234/../normal",
    "/tmp/todu-cm-Ab1234/",
  ])("rejects non-owned or non-normalized root %s", (value) => {
    expect(() => smokePaths(value)).toThrow("Expected a fresh absolute todu-cm- temporary root");
  });

  it.each([
    ["1.1.0", true],
    ["1.2.0", true],
    ["1.0.99", false],
    ["0.99.0", false],
    ["2.0.0", false],
    ["1.1.0-beta.1", false],
    ["invalid", false],
  ])("checks the Pi baseline %s", (version, expected) => {
    expect(supportsPiVersion(version)).toBe(expected);
  });
});
