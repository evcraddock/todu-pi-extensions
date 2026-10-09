import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";

import { ImportedContentApprovalSchema } from "@/tools/tool-domain-schemas";
import {
  createStructuredToolResult,
  createToolOutputSchema,
  safeToolError,
  type ToolOutput,
} from "@/tools/tool-result-contracts";

const ParamsSchema = Type.Object({});
const DataSchema = Type.Object({ ids: Type.Array(Type.String()) }, { additionalProperties: false });
const OutputSchema = createToolOutputSchema(DataSchema);
type Output = ToolOutput<typeof DataSchema>;
const base = { schemaVersion: 1 as const, tool: "example_read", warnings: [] };
const outputs: Output[] = [
  { ...base, ok: true, status: "success", data: { ids: ["task-1"] } },
  { ...base, ok: true, status: "empty", data: { ids: [] } },
  { ...base, ok: false, status: "not_found", target: { entityType: "task", entityId: "task-1" } },
  { ...base, ok: false, status: "validation_error", error: safeToolError("validation_error") },
  { ...base, ok: false, status: "ambiguous", error: safeToolError("ambiguous") },
  { ...base, ok: false, status: "backend_error", error: safeToolError("backend_error") },
  {
    ...base,
    ok: false,
    status: "uncertain",
    error: safeToolError("uncertain"),
    confirmedEntities: [{ entityType: "task", entityId: "task-1" }],
  },
];

describe("shared output schema", () => {
  it.each(outputs)("validates and JSON-roundtrips $status", (output) => {
    expect(Value.Check(OutputSchema, output)).toBe(true);
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    expect(Value.Check(OutputSchema, JSON.parse(JSON.stringify(output)))).toBe(true);
  });

  it("is itself a JSON-compatible schema", () => {
    expect(JSON.parse(JSON.stringify(OutputSchema))).toEqual(OutputSchema);
  });

  it("distinguishes empty lists, missing entities, and failed reads", () => {
    expect(outputs.slice(1, 3).map(({ ok, status }) => ({ ok, status }))).toEqual([
      { ok: true, status: "empty" },
      { ok: false, status: "not_found" },
    ]);
    expect(outputs.find(({ status }) => status === "backend_error")?.ok).toBe(false);
  });

  it.each([
    { ...base, ok: true, status: "backend_error", data: { ids: [] } },
    { ...base, ok: false, status: "success", data: { ids: [] } },
    { ...base, ok: true, status: "success", data: { ids: [42] } },
    { ...base, ok: true, status: "success", data: { ids: [] }, credentials: "secret" },
    { ...base, ok: false, status: "not_found" },
    {
      ...base,
      ok: false,
      status: "backend_error",
      error: { message: "failed", stack: "internal" },
    },
    { ...base, ok: false, status: "uncertain", error: safeToolError("uncertain") },
    { ...base, schemaVersion: 2, ok: true, status: "success", data: { ids: [] } },
  ])("rejects invalid or undeclared fields", (output) => {
    expect(Value.Check(OutputSchema, output)).toBe(false);
  });
});

describe("createStructuredToolResult", () => {
  it.each(outputs)("preserves structured data and derives isError for $status", (output) => {
    const details = { kind: "existing_ui_shape", output };
    const result = createStructuredToolResult({
      outputSchema: OutputSchema,
      structuredContent: output,
      text: "Human-readable result",
      details,
    });
    expect(result.content).toEqual([{ type: "text", text: "Human-readable result" }]);
    expect(result.details).toBe(details);
    expect(result.structuredContent).toEqual(output);
    expect(result.isError).toBe(!output.ok && output.status !== "not_found");
  });

  it("preserves warnings even on a resolved error result", () => {
    const output: Output = {
      ...base,
      ok: false,
      status: "backend_error",
      error: safeToolError("backend_error"),
      warnings: [
        {
          code: "unmapped_assignees",
          message: "Outbound assignees could not be mapped.",
          target: { entityType: "task", entityId: "task-1" },
          outboundAssigneeWarning: {
            bindingId: "ibind-1",
            provider: "github",
            targetRef: "owner/repo",
            unmappedActorIds: ["actor-1"],
            unmappedAssigneeDisplayNames: ["Erik"],
          },
        },
      ],
    };
    const result = createStructuredToolResult({
      outputSchema: OutputSchema,
      structuredContent: output,
      text: output.error.message,
      details: undefined,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.ok).toBe(false);
    expect(result.structuredContent.warnings).toEqual(output.warnings);
  });

  it("preserves nullable approval and all provenance fields in structured data", () => {
    const schema = createToolOutputSchema(
      Type.Object(
        {
          descriptionApproval: Type.Union([ImportedContentApprovalSchema, Type.Null()]),
        },
        { additionalProperties: false }
      )
    );
    const approval = {
      state: "pendingApproval" as const,
      sourceBindingId: "ibind-1",
      sourceActorId: "actor-1",
      sourceFingerprint: "fingerprint",
      reviewedAt: "2026-10-08T00:00:00Z",
      reviewedByActorId: "actor-reviewer",
    };
    for (const descriptionApproval of [approval, null]) {
      const result = createStructuredToolResult({
        outputSchema: schema,
        structuredContent: { ...base, ok: true, status: "success", data: { descriptionApproval } },
        text: "Result",
        details: undefined,
      });
      expect(JSON.parse(JSON.stringify(result.structuredContent)).data.descriptionApproval).toEqual(
        descriptionApproval
      );
    }
  });

  it("rejects schema violations without echoing payloads", () => {
    const invalid = { ...outputs[0], credentials: "do-not-leak" };
    expect(() =>
      createStructuredToolResult({
        outputSchema: OutputSchema,
        structuredContent: invalid,
        text: "Result",
        details: undefined,
      })
    ).toThrow(/^Structured tool result does not match outputSchema$/);
  });

  it("omits undefined object properties without changing UI details", () => {
    const schema = createToolOutputSchema(Type.Object({ optional: Type.Optional(Type.String()) }));
    const details = { optional: undefined };
    const result = createStructuredToolResult({
      outputSchema: schema,
      structuredContent: { ...base, ok: true, status: "success", data: details },
      text: "Result",
      details,
    });
    expect(result.structuredContent).toEqual({ ...base, ok: true, status: "success", data: {} });
    expect(result.details).toBe(details);
  });

  class CustomArray extends Array {}
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  it.each([
    NaN,
    Infinity,
    -Infinity,
    1n,
    () => "secret",
    Symbol("secret"),
    new Date(),
    new Map(),
    new Set(),
    new Error("secret"),
    cyclic,
    [undefined],
    Array(1),
    {
      get secret() {
        throw new Error("secret");
      },
    },
    { toJSON: () => "secret" },
    { [Symbol("secret")]: true },
    Object.defineProperty({}, "hidden", { value: "secret", enumerable: false }),
    Object.assign([], { extra: "secret" }),
    new CustomArray(),
  ])("rejects non-JSON values without raw error details", (value) => {
    const schema = createToolOutputSchema(Type.Any());
    expect(() =>
      createStructuredToolResult({
        outputSchema: schema,
        structuredContent: { ...base, ok: true, status: "success", data: value },
        text: "Result",
        details: undefined,
      })
    ).toThrow(/^Structured tool result must contain only JSON-compatible data$/);
  });

  it("allows shared non-cyclic objects and keeps special keys inert", () => {
    const data = JSON.parse('{"__proto__":{"safe":true},"a":{"id":"1"}}');
    data.b = data.a;
    const result = createStructuredToolResult({
      outputSchema: createToolOutputSchema(Type.Any()),
      structuredContent: { ...base, ok: true, status: "success", data },
      text: "Result",
      details: undefined,
    });
    expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual({
      ...base,
      ok: true,
      status: "success",
      data,
    });
  });

  it("fits Pi's tool definition without replacing existing details", () => {
    const tool: ToolDefinition<typeof ParamsSchema, { kind: string }> = {
      name: "example_read",
      label: "Example",
      description: "Contract typing test",
      parameters: ParamsSchema,
      outputSchema: OutputSchema,
      async execute() {
        return createStructuredToolResult({
          outputSchema: OutputSchema,
          structuredContent: outputs[0],
          text: "Result",
          details: { kind: "example_read" },
        });
      },
    };
    expect(tool.outputSchema).toBe(OutputSchema);
  });
});

describe("safeToolError", () => {
  it.each(["validation_error", "ambiguous", "backend_error", "uncertain"] as const)(
    "uses an allowlisted message for %s",
    (status) => {
      const error = safeToolError(status);
      expect(Object.keys(error)).toEqual(["message"]);
      expect(error.message.length).toBeGreaterThan(0);
    }
  );
  it("warns against retrying uncertain writes", () => {
    expect(safeToolError("uncertain").message).toContain("Do not retry automatically");
  });
});
