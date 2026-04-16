import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ActorSummary } from "../domain/actor";
import type { ActorService } from "../services/actor-service";

const ActorListParams = Type.Object({});

interface ActorListToolDetails {
  kind: "actor_list";
  actors: ActorSummary[];
  total: number;
  empty: boolean;
}

interface ActorReadToolDependencies {
  getActorService: () => Promise<ActorService>;
}

const createActorListToolDefinition = ({ getActorService }: ActorReadToolDependencies) => ({
  name: "actor_list",
  label: "Actor List",
  description: "List actors.",
  promptSnippet: "List actors through the native backend tool.",
  promptGuidelines: ["Use this tool for lightweight actor-management lookups in normal chat."],
  parameters: ActorListParams,
  async execute(_toolCallId: string, _params: Record<string, never>) {
    try {
      const actorService = await getActorService();
      const actors = await actorService.listActors();
      const details: ActorListToolDetails = {
        kind: "actor_list",
        actors,
        total: actors.length,
        empty: actors.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatActorListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "actor_list failed"), { cause: error });
    }
  },
});

const registerActorReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ActorReadToolDependencies
): void => {
  pi.registerTool(createActorListToolDefinition(dependencies));
};

const formatActorListContent = (details: ActorListToolDetails): string => {
  if (details.empty) {
    return "No actors found.";
  }

  return [
    `Actors (${details.total}):`,
    ...details.actors.map(
      (actor) => `- ${actor.id} • ${actor.displayName} • ${actor.archived ? "archived" : "active"}`
    ),
  ].join("\n");
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { ActorListToolDetails, ActorReadToolDependencies };
export { createActorListToolDefinition, formatActorListContent, registerActorReadTools };
