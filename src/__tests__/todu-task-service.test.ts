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
      body: [
        "ID: task-123",
        "Status: Active",
        "Priority: high",
        "Project: Foundation",
        "Labels: foundation",
        "",
        "Description",
        "Create the initial module layout",
        "",
        "Recent comments (0)",
        "No comments yet",
      ].join("\n"),
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

  it("allows browse flow calls to recover after a transient project lookup failure", async () => {
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
    const client = {
      listTasks: vi.fn().mockResolvedValue([taskSummary]),
      getTask: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
      listProjects: vi
        .fn()
        .mockRejectedValueOnce(
          new ToduDaemonClientError({
            code: "unavailable",
            method: "project.list",
            message: "project.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
            details: { socketPath: "/tmp/daemon.sock" },
          })
        )
        .mockResolvedValueOnce([project]),
      getProject: vi.fn().mockResolvedValue(project),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    await expect(taskService.listTasks()).rejects.toEqual(
      expect.objectContaining<ToduTaskServiceError>({
        name: "ToduTaskServiceError",
        operation: "listTasks",
        causeCode: "unavailable",
        message: "listTasks failed: project.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );

    await expect(taskService.listTasks()).resolves.toEqual([
      {
        ...taskSummary,
        projectName: "Foundation",
      },
    ]);
    expect(client.listTasks).toHaveBeenCalledTimes(2);
    expect(client.listProjects).toHaveBeenCalledTimes(2);
  });

  it("allows detail flow calls to recover after a transient project lookup failure", async () => {
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
      listProjects: vi.fn().mockResolvedValue([project]),
      getProject: vi
        .fn()
        .mockRejectedValueOnce(
          new ToduDaemonClientError({
            code: "unavailable",
            method: "project.get",
            message: "project.get failed (DAEMON_UNAVAILABLE): daemon unavailable",
            details: { socketPath: "/tmp/daemon.sock" },
          })
        )
        .mockResolvedValueOnce(project),
      listTaskComments: vi.fn().mockResolvedValue([]),
      on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
    };
    const taskService = createToduTaskService({ client });

    await expect(taskService.getTask("task-123")).rejects.toEqual(
      expect.objectContaining<ToduTaskServiceError>({
        name: "ToduTaskServiceError",
        operation: "getTask",
        causeCode: "unavailable",
        message: "getTask failed: project.get failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );

    await expect(taskService.getTask("task-123")).resolves.toEqual({
      ...taskDetail,
      projectName: "Foundation",
    });
    expect(client.getTask).toHaveBeenCalledTimes(2);
    expect(client.getProject).toHaveBeenCalledTimes(2);
  });
});
