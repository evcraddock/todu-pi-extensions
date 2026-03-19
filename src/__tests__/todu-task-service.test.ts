import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskFilter } from "@/domain/task";
import { browseTasks } from "@/flows/browse-tasks";
import { createToduTaskService } from "@/services/todu/todu-task-service";

describe("createToduTaskService", () => {
  it("delegates flow-facing task operations to the daemon client", async () => {
    const taskDetail: TaskDetail = {
      id: "task-123",
      title: "Set up foundation",
      status: "active",
      priority: "high",
      projectId: "proj-1",
      labels: ["foundation"],
      description: "Create the initial module layout",
      comments: [],
    };
    const filter: TaskFilter = { statuses: ["active"] };
    const client = {
      listTasks: vi.fn().mockResolvedValue([taskDetail]),
      getTask: vi.fn().mockResolvedValue(taskDetail),
      createTask: vi.fn().mockResolvedValue(taskDetail),
      updateTask: vi.fn().mockResolvedValue(taskDetail),
      addTaskComment: vi.fn().mockResolvedValue({
        id: "comment-1",
        taskId: taskDetail.id,
        content: "Looks good",
        author: "user",
        createdAt: "2026-03-18T00:00:00.000Z",
      }),
      listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockResolvedValue(null),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    await expect(browseTasks({ taskService }, filter)).resolves.toEqual([taskDetail]);
    expect(client.listTasks).toHaveBeenCalledWith(filter);
  });
});
