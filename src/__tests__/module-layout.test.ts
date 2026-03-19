import { describe, expect, it } from "vitest";

import { registerCommands } from "@/extension/register-commands";
import { registerEvents } from "@/extension/register-events";
import { registerTools } from "@/extension/register-tools";
import { registerUi } from "@/extension/register-ui";
import toduPiExtensions from "@/index";

describe("module layout", () => {
  it("exports the extension entrypoint and registration modules", () => {
    expect(typeof toduPiExtensions).toBe("function");
    expect(typeof registerCommands).toBe("function");
    expect(typeof registerTools).toBe("function");
    expect(typeof registerUi).toBe("function");
    expect(typeof registerEvents).toBe("function");
  });
});
