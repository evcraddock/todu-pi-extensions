import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ActorSummary } from "../domain/actor";
import type { ActorService, CreateActorInput, RenameActorInput } from "../services/actor-service";

const ActorCreateParams = Type.Object({
  id: Type.String({ description: "Actor ID" }),
  displayName: Type.String({ description: "Actor display name" }),
});

const ActorRenameParams = Type.Object({
  actorId: Type.String({ description: "Actor ID" }),
  displayName: Type.String({ description: "Actor display name" }),
});

const ActorArchiveParams = Type.Object({
  actorId: Type.String({ description: "Actor ID" }),
});

interface ActorCreateToolDetails {
  kind: "actor_create";
  input: CreateActorInput;
  actor: ActorSummary;
}

interface ActorRenameToolDetails {
  kind: "actor_rename";
  input: RenameActorInput;
  actor: ActorSummary;
}

interface ActorArchiveToolDetails {
  kind: "actor_archive" | "actor_unarchive";
  actorId: string;
  actor: ActorSummary;
}

interface ActorMutationToolDependencies {
  getActorService: () => Promise<ActorService>;
}

const createActorCreateToolDefinition = ({ getActorService }: ActorMutationToolDependencies) => ({
  name: "actor_create",
  label: "Actor Create",
  description: "Create an actor.",
  promptSnippet: "Create an actor through the native backend tool.",
  promptGuidelines: ["Use this tool for lightweight actor management in normal chat."],
  parameters: ActorCreateParams,
  async execute(_toolCallId: string, params: { id: string; displayName: string }) {
    try {
      const input = normalizeCreateActorInput(params);
      const actorService = await getActorService();
      const actor = await actorService.createActor(input);
      const details: ActorCreateToolDetails = { kind: "actor_create", input, actor };

      return {
        content: [{ type: "text" as const, text: formatActorResult("Created", actor) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "actor_create failed"), { cause: error });
    }
  },
});

const createActorRenameToolDefinition = ({ getActorService }: ActorMutationToolDependencies) => ({
  name: "actor_rename",
  label: "Actor Rename",
  description: "Rename an actor.",
  promptSnippet: "Rename an actor through the native backend tool.",
  promptGuidelines: ["Use this tool for lightweight actor management in normal chat."],
  parameters: ActorRenameParams,
  async execute(_toolCallId: string, params: { actorId: string; displayName: string }) {
    try {
      const input = normalizeRenameActorInput(params);
      const actorService = await getActorService();
      const actor = await actorService.renameActor(input);
      const details: ActorRenameToolDetails = { kind: "actor_rename", input, actor };

      return {
        content: [{ type: "text" as const, text: formatActorResult("Renamed", actor) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "actor_rename failed"), { cause: error });
    }
  },
});

const createActorArchiveToolDefinition = ({ getActorService }: ActorMutationToolDependencies) => ({
  name: "actor_archive",
  label: "Actor Archive",
  description: "Archive an actor.",
  promptSnippet: "Archive an actor through the native backend tool.",
  promptGuidelines: ["Use this tool for lightweight actor management in normal chat."],
  parameters: ActorArchiveParams,
  async execute(_toolCallId: string, params: { actorId: string }) {
    try {
      const actorId = normalizeRequiredText(params.actorId, "actorId");
      const actorService = await getActorService();
      const actor = await actorService.archiveActor(actorId);
      const details: ActorArchiveToolDetails = { kind: "actor_archive", actorId, actor };

      return {
        content: [{ type: "text" as const, text: formatActorResult("Archived", actor) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "actor_archive failed"), { cause: error });
    }
  },
});

const createActorUnarchiveToolDefinition = ({
  getActorService,
}: ActorMutationToolDependencies) => ({
  name: "actor_unarchive",
  label: "Actor Unarchive",
  description: "Unarchive an actor.",
  promptSnippet: "Unarchive an actor through the native backend tool.",
  promptGuidelines: ["Use this tool for lightweight actor management in normal chat."],
  parameters: ActorArchiveParams,
  async execute(_toolCallId: string, params: { actorId: string }) {
    try {
      const actorId = normalizeRequiredText(params.actorId, "actorId");
      const actorService = await getActorService();
      const actor = await actorService.unarchiveActor(actorId);
      const details: ActorArchiveToolDetails = { kind: "actor_unarchive", actorId, actor };

      return {
        content: [{ type: "text" as const, text: formatActorResult("Unarchived", actor) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "actor_unarchive failed"), { cause: error });
    }
  },
});

const registerActorMutationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ActorMutationToolDependencies
): void => {
  pi.registerTool(createActorCreateToolDefinition(dependencies));
  pi.registerTool(createActorRenameToolDefinition(dependencies));
  pi.registerTool(createActorArchiveToolDefinition(dependencies));
  pi.registerTool(createActorUnarchiveToolDefinition(dependencies));
};

const normalizeCreateActorInput = (params: {
  id: string;
  displayName: string;
}): CreateActorInput => ({
  id: normalizeRequiredText(params.id, "id"),
  displayName: normalizeRequiredText(params.displayName, "displayName"),
});

const normalizeRenameActorInput = (params: {
  actorId: string;
  displayName: string;
}): RenameActorInput => ({
  actorId: normalizeRequiredText(params.actorId, "actorId"),
  displayName: normalizeRequiredText(params.displayName, "displayName"),
});

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
};

const formatActorResult = (verb: string, actor: ActorSummary): string =>
  `${verb} actor ${actor.id}: ${actor.displayName} (${actor.archived ? "archived" : "active"}).`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  ActorArchiveToolDetails,
  ActorCreateToolDetails,
  ActorMutationToolDependencies,
  ActorRenameToolDetails,
};
export {
  createActorArchiveToolDefinition,
  createActorCreateToolDefinition,
  createActorRenameToolDefinition,
  createActorUnarchiveToolDefinition,
  registerActorMutationTools,
};
