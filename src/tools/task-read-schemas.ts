import { Type, type Static } from "typebox";

import { stringEnum } from "./string-enum";
import {
  ContentAuthorProperties,
  IdSchema,
  ImportedContentApprovalSchema,
  NullableStringSchema,
  OutboundAssigneeWarningSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
} from "./tool-domain-schemas";
import { createToolOutputSchema, type ToolOutput } from "./tool-result-contracts";

const closed = { additionalProperties: false };
const TaskSummaryProperties = {
  id: IdSchema,
  title: Type.String(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  projectId: NullableStringSchema,
  projectName: NullableStringSchema,
  dueDate: NullableStringSchema,
  scheduledDate: NullableStringSchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
  labels: Type.Array(Type.String()),
  assigneeActorIds: Type.Array(Type.String()),
  assigneeDisplayNames: Type.Array(Type.String()),
  assignees: Type.Array(Type.String()),
};
const TaskSummarySchema = Type.Object(TaskSummaryProperties, closed);
const TaskCommentSchema = Type.Object(
  {
    id: IdSchema,
    taskId: Type.String(),
    content: Type.String(),
    ...ContentAuthorProperties,
    createdAt: Type.String(),
  },
  closed
);
const TaskDetailSchema = Type.Object(
  {
    ...TaskSummaryProperties,
    description: NullableStringSchema,
    descriptionApproval: Type.Union([ImportedContentApprovalSchema, Type.Null()]),
    comments: Type.Array(TaskCommentSchema),
    outboundAssigneeWarnings: Type.Array(OutboundAssigneeWarningSchema),
    outboundAssigneeWarningsUnavailable: Type.Optional(Type.Boolean()),
  },
  closed
);

const TaskFilterSchema = Type.Object(
  {
    statuses: Type.Optional(Type.Array(TaskStatusSchema)),
    priorities: Type.Optional(Type.Array(TaskPrioritySchema)),
    projectId: Type.Optional(NullableStringSchema),
    query: Type.Optional(Type.String()),
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    updatedFrom: Type.Optional(Type.String()),
    updatedTo: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    overdue: Type.Optional(Type.Boolean()),
    today: Type.Optional(Type.Boolean()),
    sort: Type.Optional(
      stringEnum(["priority", "dueDate", "createdAt", "updatedAt", "title"] as const)
    ),
    sortDirection: Type.Optional(stringEnum(["asc", "desc"] as const)),
    timezone: Type.String(),
  },
  closed
);

const TaskListDataSchema = Type.Object(
  {
    filter: TaskFilterSchema,
    tasks: Type.Array(TaskSummarySchema),
    total: Type.Integer({ minimum: 0 }),
    empty: Type.Boolean(),
  },
  closed
);
const TaskShowDataSchema = Type.Object(
  { taskId: IdSchema, found: Type.Literal(true), task: TaskDetailSchema },
  closed
);
const TaskListOutputSchema = createToolOutputSchema(TaskListDataSchema);
const TaskShowOutputSchema = createToolOutputSchema(TaskShowDataSchema);

type TaskListOutput = ToolOutput<typeof TaskListDataSchema>;
type TaskShowOutput = ToolOutput<typeof TaskShowDataSchema>;
type NormalizedTaskFilter = Static<typeof TaskFilterSchema>;

export type { NormalizedTaskFilter, TaskListOutput, TaskShowOutput };
export {
  TaskCommentSchema,
  TaskDetailSchema,
  TaskFilterSchema,
  TaskListOutputSchema,
  TaskShowOutputSchema,
  TaskSummarySchema,
};
