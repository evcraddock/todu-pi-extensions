import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createSmokeEnvironment, smokePaths } from "./codemode-smoke/isolation.mjs";

// Only this launcher creates/removes the root. There is intentionally no user-supplied state path.
let root;
try {
  if (process.platform === "win32")
    throw new Error("This smoke harness requires POSIX Unix sockets");
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  await stat(path.join(scriptsDir, "../dist/index.js"));
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "todu-cm-")));
  const p = smokePaths(root);
  if (Buffer.byteLength(p.socket) > 100)
    throw new Error("Temporary socket path is too long; use a shorter TMPDIR");
  await Promise.all(
    [p.home, p.work, p.agent, p.configHome, p.cache, p.data, p.toduData].map((directory) =>
      mkdir(directory, { mode: 0o700 })
    )
  );
  await writeFile(p.toduConfig, JSON.stringify({ data_dir: p.toduData }), { mode: 0o600 });
  const worker = spawnSync(
    process.execPath,
    [path.join(scriptsDir, "codemode-smoke/worker.mjs"), root],
    {
      cwd: p.work,
      env: createSmokeEnvironment(root, process.env),
      stdio: "inherit",
      timeout: 90_000,
      killSignal: "SIGKILL",
    }
  );
  if (worker.error)
    throw new Error("Smoke worker could not complete within its 90-second deadline");
  if (worker.status !== 0)
    throw new Error("Smoke worker failed; see fixture-only diagnostics above");
} catch (error) {
  process.stderr.write(
    `Codemode smoke failed: ${error instanceof Error ? error.message : "Unknown harness failure"}\n`
  );
  process.exitCode = 1;
} finally {
  if (root) await rm(root, { recursive: true });
}
if (!process.exitCode)
  process.stdout.write("PASS isolated worker exited and temporary state removed\n");
