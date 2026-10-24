import { Type } from "typebox";

import { stringEnum } from "./string-enum";
import {
  ContentAuthorProperties,
  IdSchema,
  ImportedContentApprovalSchema,
  NullableStringSchema,
} from "./tool-domain-schemas";

const closed = { additionalProperties: false };
const scope = stringEnum(["task", "project", "habit"] as const);
const NoteSchema = Type.Object(
  {
    id: IdSchema,
    content: Type.String(),
    ...ContentAuthorProperties,
    entityType: Type.Union([scope, Type.Null()]),
    entityId: NullableStringSchema,
    tags: Type.Array(Type.String()),
    createdAt: Type.String(),
  },
  closed
);
const NoteFilterSchema = Type.Object(
  {
    entityType: Type.Optional(scope),
    entityId: Type.Optional(Type.String()),
    tag: Type.Optional(Type.String()),
    author: Type.Optional(Type.String()),
    authorActorId: Type.Optional(Type.String()),
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    journal: Type.Optional(Type.Boolean()),
    timezone: Type.Optional(Type.String()),
  },
  closed
);
const totals = { total: Type.Integer({ minimum: 0 }), empty: Type.Boolean() };
export const NoteListDataSchema = Type.Object(
  { filter: NoteFilterSchema, notes: Type.Array(NoteSchema), ...totals },
  closed
);
export const NoteShowDataSchema = Type.Object({ note: NoteSchema }, closed);

const ApprovalItemSchema = Type.Object(
  {
    ...ImportedContentApprovalSchema.properties,
    kind: stringEnum(["taskDescription", "noteContent"] as const),
    taskId: Type.Optional(Type.String()),
    noteId: Type.Optional(Type.String()),
    projectId: Type.Optional(Type.String()),
    taskTitle: Type.Optional(Type.String()),
    entityType: Type.Optional(scope),
    entityId: Type.Optional(Type.String()),
    contentPreview: Type.String(),
  },
  closed
);
export const ApprovalListDataSchema = Type.Object(
  {
    filter: Type.Object(
      { kind: Type.Optional(stringEnum(["taskDescription", "noteContent"] as const)) },
      closed
    ),
    items: Type.Array(ApprovalItemSchema),
    ...totals,
  },
  closed
);
export const ApprovalUpdateDataSchema = Type.Object({ item: ApprovalItemSchema }, closed);

const ActorMappingSchema = Type.Object(
  {
    actorId: IdSchema,
    externalAccountId: Type.Optional(Type.String()),
    externalLogin: Type.Optional(Type.String()),
    displayName: Type.Optional(Type.String()),
    trusted: Type.Optional(Type.Boolean()),
  },
  closed
);
const BindingSchema = Type.Object(
  {
    id: IdSchema,
    provider: Type.String(),
    projectId: IdSchema,
    targetKind: Type.String(),
    targetRef: Type.String(),
    strategy: stringEnum(["bidirectional", "pull", "push", "none"] as const),
    enabled: Type.Boolean(),
    options: Type.Optional(
      Type.Object({ actorMappings: Type.Optional(Type.Array(ActorMappingSchema)) }, closed)
    ),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  closed
);
const BindingStatusSchema = Type.Object(
  {
    bindingId: IdSchema,
    state: stringEnum(["running", "idle", "blocked", "error"] as const),
    authorityId: NullableStringSchema,
    lastSuccessfulSyncAt: NullableStringSchema,
    lastAttemptedSyncAt: NullableStringSchema,
    lastErrorSummary: NullableStringSchema,
    updatedAt: Type.String(),
  },
  closed
);
const IntegrationTaskWarningSchema = Type.Object(
  {
    taskId: IdSchema,
    title: Type.String(),
    unmappedActorIds: Type.Array(Type.String()),
    unmappedAssigneeDisplayNames: Type.Array(Type.String()),
  },
  closed
);
const ActorSchema = Type.Object(
  { id: IdSchema, displayName: Type.String(), archived: Type.Boolean() },
  closed
);
export const IntegrationListDataSchema = Type.Object(
  {
    filter: Type.Object(
      {
        provider: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String()),
        enabled: Type.Optional(Type.Boolean()),
      },
      closed
    ),
    bindings: Type.Array(BindingSchema),
    projectNames: Type.Array(Type.Object({ id: IdSchema, name: Type.String() }, closed)),
    ...totals,
  },
  closed
);
export const IntegrationShowDataSchema = Type.Object(
  {
    binding: BindingSchema,
    status: Type.Union([BindingStatusSchema, Type.Null()]),
    projectName: NullableStringSchema,
    actors: Type.Array(ActorSchema),
    taskWarnings: Type.Array(IntegrationTaskWarningSchema),
  },
  closed
);
export const IntegrationUpdateDataSchema = Type.Object({ binding: BindingSchema }, closed);
