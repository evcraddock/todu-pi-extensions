import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const includeDist = process.argv.includes("--include-dist");
const rootDir = process.cwd();
const forbiddenRuntimeImports = [
  ["@mariozechner", "pi-ai"].join("/"),
  ["@mariozechner", "pi-coding-agent"].join("/"),
  ["@mariozechner", "pi-tui"].join("/"),
  ["@mariozechner", "pi-agent-core"].join("/"),
];

const collectFiles = async (entryPath) => {
  let stat;
  try {
    stat = await fs.stat(entryPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (stat.isFile()) {
    return [entryPath];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => collectFiles(path.join(entryPath, entry.name)))
  );
  return nestedFiles.flat();
};

const scanTargets = ["package.json", "package-lock.json", "src"];
if (includeDist) {
  scanTargets.push("dist");
}

const files = (
  await Promise.all(scanTargets.map((target) => collectFiles(path.join(rootDir, target))))
)
  .flat()
  .filter((filePath) => /\.(?:json|ts|tsx|js|mjs|cjs|d\.ts)$/.test(filePath));

const violations = [];

for (const filePath of files) {
  const content = await fs.readFile(filePath, "utf8");
  for (const forbiddenImport of forbiddenRuntimeImports) {
    if (content.includes(forbiddenImport)) {
      violations.push(`${path.relative(rootDir, filePath)} contains ${forbiddenImport}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Found old Pi runtime imports:\n${violations.map((violation) => `- ${violation}`).join("\n")}\n`
  );
  process.exit(1);
}

process.stdout.write("No old Pi runtime imports found.\n");
