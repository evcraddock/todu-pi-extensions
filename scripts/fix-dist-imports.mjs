import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const distDir = path.resolve("dist");
const supportedExtensions = new Set([".js", ".json", ".node", ".mjs", ".cjs"]);

const needsJsExtension = (specifier) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return false;
  }

  const extension = path.extname(specifier);
  return !supportedExtensions.has(extension);
};

const withJsExtension = (specifier) =>
  needsJsExtension(specifier) ? `${specifier}.js` : specifier;

const rewriteImports = (content) =>
  content
    .replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${withJsExtension(specifier)}${suffix}`;
    })
    .replace(/(import\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${withJsExtension(specifier)}${suffix}`;
    })
    .replace(
      /(import\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_match, prefix, specifier, suffix) => {
        return `${prefix}${withJsExtension(specifier)}${suffix}`;
      }
    );

const collectJavaScriptFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectJavaScriptFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    })
  );

  return files.flat();
};

try {
  const files = await collectJavaScriptFiles(distDir);
  await Promise.all(
    files.map(async (filePath) => {
      const current = await fs.readFile(filePath, "utf8");
      const updated = rewriteImports(current);
      if (updated !== current) {
        await fs.writeFile(filePath, updated, "utf8");
      }
    })
  );
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    process.exit(0);
  }
  throw error;
}
