import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Pi runtime imports", () => {
  it("does not mix the current Pi runtime with old package namespace imports", () => {
    expect(() => {
      execFileSync(process.execPath, ["scripts/check-pi-runtime-imports.mjs"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    }).not.toThrow();
  });
});
