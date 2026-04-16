import { describe, expect, it, vi } from "vitest";

import type { ActorSummary } from "@/domain/actor";
import { registerTools } from "@/extension/register-tools";
import type { ActorService } from "@/services/actor-service";
import type { TaskService } from "@/services/task-service";
import {
  createActorArchiveToolDefinition,
  createActorCreateToolDefinition,
  createActorRenameToolDefinition,
  createActorUnarchiveToolDefinition,
} from "@/tools/actor-mutation-tools";
import { createActorListToolDefinition } from "@/tools/actor-read-tools";

const createActor = (overrides: Partial<ActorSummary> = {}): ActorSummary => ({
  id: "actor-user",
  displayName: "Erik",
  archived: false,
  ...overrides,
});

describe("registerTools", () => {
  it("registers actor management tools", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getActorService: vi.fn().mockResolvedValue({} as ActorService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining([
        "actor_list",
        "actor_create",
        "actor_rename",
        "actor_archive",
        "actor_unarchive",
      ])
    );
  });
});

describe("actor tools", () => {
  it("lists actors", async () => {
    const actorService = {
      listActors: vi.fn().mockResolvedValue([createActor()]),
    } as unknown as ActorService;
    const tool = createActorListToolDefinition({
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain("Actors (1):");
    expect(result.content[0]?.text).toContain("actor-user • Erik • active");
  });

  it("creates, renames, archives, and unarchives actors", async () => {
    const actorService = {
      createActor: vi.fn().mockResolvedValue(createActor()),
      renameActor: vi.fn().mockResolvedValue(createActor({ displayName: "Updated Erik" })),
      archiveActor: vi.fn().mockResolvedValue(createActor({ archived: true })),
      unarchiveActor: vi.fn().mockResolvedValue(createActor()),
    } as unknown as ActorService;

    const createTool = createActorCreateToolDefinition({
      getActorService: vi.fn().mockResolvedValue(actorService),
    });
    const renameTool = createActorRenameToolDefinition({
      getActorService: vi.fn().mockResolvedValue(actorService),
    });
    const archiveTool = createActorArchiveToolDefinition({
      getActorService: vi.fn().mockResolvedValue(actorService),
    });
    const unarchiveTool = createActorUnarchiveToolDefinition({
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    await expect(
      createTool.execute("tool-call-1", { id: " actor-user ", displayName: " Erik " })
    ).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Created actor actor-user") }],
    });
    await expect(
      renameTool.execute("tool-call-2", { actorId: " actor-user ", displayName: " Updated Erik " })
    ).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Renamed actor actor-user") }],
    });
    await expect(
      archiveTool.execute("tool-call-3", { actorId: " actor-user " })
    ).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Archived actor actor-user") }],
    });
    await expect(
      unarchiveTool.execute("tool-call-4", { actorId: " actor-user " })
    ).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Unarchived actor actor-user") }],
    });
  });
});
