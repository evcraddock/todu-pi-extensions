import { describe, expect, it } from "vitest";

import toduPiExtensions from "@/index";

describe("toduPiExtensions", () => {
  it("exports an extension entrypoint", () => {
    expect(typeof toduPiExtensions).toBe("function");
  });
});
