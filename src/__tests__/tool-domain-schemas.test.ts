import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";

import type { ImportedContentApproval } from "@/domain/approval";
import type { OutboundAssigneeWarning, TaskComment, TaskPriority, TaskStatus } from "@/domain/task";
import {
  ContentAuthorProperties,
  EntityReferenceSchema,
  ImportedContentApprovalSchema,
  OutboundAssigneeWarningSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
} from "@/tools/tool-domain-schemas";

const approval: ImportedContentApproval = {
  state: "pendingApproval",
  sourceBindingId: "ibind-1",
  sourceActorId: "actor-1",
  sourceFingerprint: "fingerprint-1",
  reviewedAt: "2026-10-08T00:00:00Z",
  reviewedByActorId: "actor-reviewer",
};
const warning: OutboundAssigneeWarning = {
  bindingId: "ibind-1",
  provider: "github",
  targetRef: "owner/repo",
  unmappedActorIds: ["actor-1"],
  unmappedAssigneeDisplayNames: ["Erik"],
};
const CommentSchema = Type.Object(
  {
    id: Type.String(),
    taskId: Type.String(),
    content: Type.String(),
    ...ContentAuthorProperties,
    createdAt: Type.String(),
  },
  { additionalProperties: false }
);

// Compile-time checks keep reusable fragments aligned with the existing domain interfaces.
const schemaApproval: Static<typeof ImportedContentApprovalSchema> = approval;
const domainApproval: ImportedContentApproval = schemaApproval;
const schemaWarning: Static<typeof OutboundAssigneeWarningSchema> = warning;
const domainWarning: OutboundAssigneeWarning = schemaWarning;
const schemaStatus: Static<typeof TaskStatusSchema> = "active" satisfies TaskStatus;
const schemaPriority: Static<typeof TaskPrioritySchema> = "high" satisfies TaskPriority;

describe("shared domain fragments", () => {
  it.each([
    [ImportedContentApprovalSchema, domainApproval],
    [OutboundAssigneeWarningSchema, domainWarning],
    [TaskStatusSchema, schemaStatus],
    [TaskPrioritySchema, schemaPriority],
    [EntityReferenceSchema, { entityType: "task", entityId: "task-1" }],
  ])("validates and roundtrips schema and value", (schema, value) => {
    expect(Value.Check(schema, value)).toBe(true);
    expect(Value.Check(schema, JSON.parse(JSON.stringify(value)))).toBe(true);
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it.each(["notRequired", "pendingApproval", "approved"])("preserves %s approval", (state) => {
    expect(Value.Check(ImportedContentApprovalSchema, { state })).toBe(true);
  });

  it.each([
    [ImportedContentApprovalSchema, { state: "trusted" }],
    [ImportedContentApprovalSchema, { state: "approved", credentials: "secret" }],
    [OutboundAssigneeWarningSchema, { ...warning, unmappedActorIds: [42] }],
    [OutboundAssigneeWarningSchema, { ...warning, rawError: "secret" }],
    [EntityReferenceSchema, { entityType: "task", entityId: "" }],
    [TaskStatusSchema, "unknown"],
    [TaskPrioritySchema, "critical"],
  ])("rejects invalid states and undeclared security fields", (schema, value) => {
    expect(Value.Check(schema, value)).toBe(false);
  });

  it("composes author and approval fields without losing provenance", () => {
    const comment: TaskComment = {
      id: "note-1",
      taskId: "task-1",
      content: "Untrusted imported content",
      authorActorId: "actor-1",
      authorDisplayName: "Erik",
      author: null,
      contentApproval: approval,
      createdAt: "2026-10-08T00:00:00Z",
    };
    const schemaComment: Static<typeof CommentSchema> = comment;
    const domainComment: TaskComment = schemaComment;
    expect(Value.Check(CommentSchema, domainComment)).toBe(true);
    expect(JSON.parse(JSON.stringify(comment)).contentApproval).toEqual(approval);
    expect(
      Value.Check(CommentSchema, { ...comment, authorActorId: null, contentApproval: null })
    ).toBe(true);
    expect(Value.Check(CommentSchema, { ...comment, contentApproval: undefined })).toBe(false);
  });
});
