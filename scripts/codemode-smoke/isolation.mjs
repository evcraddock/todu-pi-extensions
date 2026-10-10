import path from "node:path";
import process from "node:process";

/** @param {string} root @returns {Record<string, string>} */
export function smokePaths(root) {
  if (
    !path.isAbsolute(root) ||
    path.resolve(root) !== root ||
    !/^todu-cm-[A-Za-z0-9]{6}$/.test(path.basename(root))
  ) {
    throw new Error("Expected a fresh absolute todu-cm- temporary root");
  }
  return {
    home: path.join(root, "home"),
    work: path.join(root, "work"),
    agent: path.join(root, "agent"),
    configHome: path.join(root, "config"),
    cache: path.join(root, "cache"),
    data: path.join(root, "data"),
    toduConfig: path.join(root, "todu.yaml"),
    toduData: path.join(root, "todu"),
    socket: path.join(root, "d.sock"),
  };
}

/** @param {string} root @param {Record<string, string | undefined>} inherited @returns {Record<string, string>} */
export function createSmokeEnvironment(root, inherited) {
  const p = smokePaths(root);
  return {
    ...(inherited.PATH ? { PATH: inherited.PATH } : {}),
    HOME: p.home,
    XDG_CONFIG_HOME: p.configHome,
    XDG_CACHE_HOME: p.cache,
    XDG_DATA_HOME: p.data,
    TODU_CONFIG: p.toduConfig,
    TODU_DATA_DIR: p.toduData,
    TODU_DAEMON_SOCKET: p.socket,
    TODUAI_DAEMON_SOCKET: p.socket,
    PI_CODING_AGENT_DIR: p.agent,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    LANG: "C.UTF-8",
    TZ: "UTC",
  };
}

/** @param {string} root @param {Record<string, string | undefined>} env @returns {void} */
export function assertSmokeEnvironment(root, env) {
  const expected = createSmokeEnvironment(root, env);
  if (
    Object.entries(expected).some(([key, value]) => env[key] !== value) ||
    Object.keys(env).some(
      (key) =>
        !Object.hasOwn(expected, key) &&
        // macOS adds its locale/encoding marker even with a fresh child environment.
        !(process.platform === "darwin" && key === "__CF_USER_TEXT_ENCODING")
    )
  ) {
    throw new Error("Smoke isolation environment mismatch");
  }
}

/** @param {string} version @returns {boolean} */
export function supportsPiVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match !== null && Number(match[1]) === 1 && Number(match[2]) >= 1;
}
