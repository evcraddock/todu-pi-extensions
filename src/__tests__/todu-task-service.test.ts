import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary, TaskDetail, TaskFilter, TaskSummary } from "@/domain/task";
import { browseTasks } from "@/flows/browse-tasks";
import { createTaskDetailViewModel } from "@/ui/components/task-detail";
import { createToduTaskService, ToduTaskServiceError } from "@/services/todu/todu-task-service";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";

describe("createToduTaskService", () => {
  it("hydrates task summaries with project names for browse flows", async () => {
    const taskSummary: TaskSummary = {
      id: "task-123",
      title: "Set up foundation",
      status: "active",
      priority: "high",
      projectId: "proj-1",
      projectName: null,
      labels: ["foundation"],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
    };
    const filter: TaskFilter = { statuses: ["active"] };
    const client = {
      listTasks: vi.fn().mockResolvedValue([taskSummary]),
      getTask: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
      listProjects: vi.fn().mockResolvedValue([project]),
      getProject: vi.fn().mockResolvedValue(project),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    await expect(browseTasks({ taskService }, filter)).resolves.toEqual([
      {
        ...taskSummary,
        projectName: "Foundation",
      },
    ]);
    expect(client.listTasks).toHaveBeenCalledWith(filter);
    expect(client.listProjects).toHaveBeenCalledTimes(1);
  });

  it("hydrates task detail with project name for detail rendering", async () => {
    const taskDetail: TaskDetail = {
      id: "task-123",
      title: "Set up foundation",
      status: "active",
      priority: "high",
      projectId: "proj-1",
      projectName: null,
      labels: ["foundation"],
      description: "Create the initial module layout",
      comments: [],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
    };
    const client = {
      listTasks: vi.fn(),
      getTask: vi.fn().mockResolvedValue(taskDetail),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
      listProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue(project),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    const hydratedDetail = await taskService.getTask("task-123");
    expect(hydratedDetail).toEqual({
      ...taskDetail,
      projectName: "Foundation",
    });
    expect(createTaskDetailViewModel(hydratedDetail!)).toEqual({
      title: "Set up foundation",
      body: "Set up foundation\nCreate the initial module layout",
      commentCount: 0,
    });
  });

  it("wraps daemon client failures in a service-level error", async () => {
    const client = {
      listTasks: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "unavailable",
          method: "task.list",
          message: "task.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
          details: { socketPath: "/tmp/daemon.sock" },
        })
      ),
      getTask: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
      listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockResolvedValue(null),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    await expect(taskService.listTasks()).rejects.toEqual(
      expect.objectContaining<ToduTaskServiceError>({
        name: "ToduTaskServiceError",
        operation: "listTasks",
        causeCode: "unavailable",
        message: "listTasks failed: task.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );
  });
});
