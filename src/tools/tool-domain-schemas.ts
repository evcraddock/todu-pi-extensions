import { Type } from "typebox";

import { stringEnum } from "./string-enum";

const IdSchema = Type.String({ minLength: 1 });
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const TaskStatusSchema = stringEnum([
  "active",
  "inprogress",
  "waiting",
  "done",
  "cancelled",
] as const);
const TaskPrioritySchema = stringEnum(["low", "medium", "high"] as const);

const EntityReferenceSchema = Type.Object(
  {
    entityType: stringEnum([
      "task",
      "project",
      "actor",
      "habit",
      "recurring",
      "note",
      "integration",
    ] as const),
    entityId: IdSchema,
  },
  { additionalProperties: false }
);

const ImportedContentApprovalSchema = Type.Object(
  {
    state: stringEnum(["notRequired", "pendingApproval", "approved"] as const),
    sourceBindingId: Type.Optional(Type.String()),
    sourceActorId: Type.Optional(Type.String()),
    sourceFingerprint: Type.Optional(Type.String()),
    reviewedAt: Type.Optional(Type.String()),
    reviewedByActorId: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

// Shared by task comments and notes. Missing approval must not silently become approved.
const ContentAuthorProperties = {
  authorActorId: NullableStringSchema,
  authorDisplayName: Type.String(),
  author: NullableStringSchema,
  contentApproval: Type.Union([ImportedContentApprovalSchema, Type.Null()]),
};

const OutboundAssigneeWarningSchema = Type.Object(
  {
    bindingId: Type.String(),
    provider: Type.String(),
    targetRef: Type.String(),
    unmappedActorIds: Type.Array(Type.String()),
    unmappedAssigneeDisplayNames: Type.Array(Type.String()),
  },
  { additionalProperties: false }
);

export {
  ContentAuthorProperties,
  EntityReferenceSchema,
  IdSchema,
  ImportedContentApprovalSchema,
  NullableStringSchema,
  OutboundAssigneeWarningSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
};
