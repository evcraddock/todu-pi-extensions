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
      assigneeActorIds: ["actor-user"],
      assigneeDisplayNames: ["Erik"],
      assignees: ["Erik"],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
      authorizedAssigneeActorIds: ["actor-user"],
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
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listRecurring: vi.fn(),
      getRecurring: vi.fn(),
      createRecurring: vi.fn(),
      updateRecurring: vi.fn(),
      deleteRecurring: vi.fn(),
      listIntegrationBindings: vi.fn(),
      createIntegrationBinding: vi.fn(),
      listHabits: vi.fn(),
      getHabit: vi.fn(),
      createHabit: vi.fn(),
      updateHabit: vi.fn(),
      checkHabit: vi.fn(),
      deleteHabit: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
      getHabitStreak: vi.fn(),
      listTaskComments: vi.fn().mockResolvedValue([]),
      addHabitNote: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue(null),
      listActors: vi.fn().mockResolvedValue([]),
      createActor: vi.fn(),
      renameActor: vi.fn(),
      archiveActor: vi.fn(),
      unarchiveActor: vi.fn(),
      getIntegrationBinding: vi.fn(),
      updateIntegrationBinding: vi.fn(),
      getIntegrationBindingStatus: vi.fn(),
      listApprovals: vi.fn(),
      approveTaskDescription: vi.fn(),
      approveNoteContent: vi.fn(),
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
      assigneeActorIds: ["actor-user"],
      assigneeDisplayNames: ["Erik"],
      assignees: ["Erik"],
      description: "Create the initial module layout",
      descriptionApproval: null,
      comments: [],
      outboundAssigneeWarnings: [],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
      authorizedAssigneeActorIds: ["actor-user"],
    };
    const client = {
      listTasks: vi.fn(),
      getTask: vi.fn().mockResolvedValue(taskDetail),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
      listProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue(project),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listRecurring: vi.fn(),
      getRecurring: vi.fn(),
      createRecurring: vi.fn(),
      updateRecurring: vi.fn(),
      deleteRecurring: vi.fn(),
      listIntegrationBindings: vi.fn(),
      createIntegrationBinding: vi.fn(),
      listHabits: vi.fn(),
      getHabit: vi.fn(),
      createHabit: vi.fn(),
      updateHabit: vi.fn(),
      checkHabit: vi.fn(),
      deleteHabit: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
      getHabitStreak: vi.fn(),
      listTaskComments: vi.fn().mockResolvedValue([]),
      addHabitNote: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue(null),
      listActors: vi.fn().mockResolvedValue([]),
      createActor: vi.fn(),
      renameActor: vi.fn(),
      archiveActor: vi.fn(),
      unarchiveActor: vi.fn(),
      getIntegrationBinding: vi.fn(),
      updateIntegrationBinding: vi.fn(),
      getIntegrationBindingStatus: vi.fn(),
      listApprovals: vi.fn(),
      approveTaskDescription: vi.fn(),
      approveNoteContent: vi.fn(),
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
        "Assignees: Erik",
        "Description approval: None",
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
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listRecurring: vi.fn(),
      getRecurring: vi.fn(),
      createRecurring: vi.fn(),
      updateRecurring: vi.fn(),
      deleteRecurring: vi.fn(),
      listIntegrationBindings: vi.fn(),
      createIntegrationBinding: vi.fn(),
      listHabits: vi.fn(),
      getHabit: vi.fn(),
      createHabit: vi.fn(),
      updateHabit: vi.fn(),
      checkHabit: vi.fn(),
      deleteHabit: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
      getHabitStreak: vi.fn(),
      listTaskComments: vi.fn().mockResolvedValue([]),
      addHabitNote: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue(null),
      listActors: vi.fn().mockResolvedValue([]),
      createActor: vi.fn(),
      renameActor: vi.fn(),
      archiveActor: vi.fn(),
      unarchiveActor: vi.fn(),
      getIntegrationBinding: vi.fn(),
      updateIntegrationBinding: vi.fn(),
      getIntegrationBindingStatus: vi.fn(),
      listApprovals: vi.fn(),
      approveTaskDescription: vi.fn(),
      approveNoteContent: vi.fn(),
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
      assigneeActorIds: ["actor-user"],
      assigneeDisplayNames: ["Erik"],
      assignees: ["Erik"],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
      authorizedAssigneeActorIds: ["actor-user"],
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
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listRecurring: vi.fn(),
      getRecurring: vi.fn(),
      createRecurring: vi.fn(),
      updateRecurring: vi.fn(),
      deleteRecurring: vi.fn(),
      listIntegrationBindings: vi.fn(),
      createIntegrationBinding: vi.fn(),
      listHabits: vi.fn(),
      getHabit: vi.fn(),
      createHabit: vi.fn(),
      updateHabit: vi.fn(),
      checkHabit: vi.fn(),
      deleteHabit: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
      getHabitStreak: vi.fn(),
      listTaskComments: vi.fn().mockResolvedValue([]),
      addHabitNote: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue(null),
      listActors: vi.fn().mockResolvedValue([]),
      createActor: vi.fn(),
      renameActor: vi.fn(),
      archiveActor: vi.fn(),
      unarchiveActor: vi.fn(),
      getIntegrationBinding: vi.fn(),
      updateIntegrationBinding: vi.fn(),
      getIntegrationBindingStatus: vi.fn(),
      listApprovals: vi.fn(),
      approveTaskDescription: vi.fn(),
      approveNoteContent: vi.fn(),
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
      assigneeActorIds: ["actor-user"],
      assigneeDisplayNames: ["Erik"],
      assignees: ["Erik"],
      description: "Create the initial module layout",
      descriptionApproval: null,
      comments: [],
      outboundAssigneeWarnings: [],
    };
    const project: ProjectSummary = {
      id: "proj-1",
      name: "Foundation",
      status: "active",
      priority: "high",
      description: null,
      authorizedAssigneeActorIds: ["actor-user"],
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
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      listRecurring: vi.fn(),
      getRecurring: vi.fn(),
      createRecurring: vi.fn(),
      updateRecurring: vi.fn(),
      deleteRecurring: vi.fn(),
      listIntegrationBindings: vi.fn(),
      createIntegrationBinding: vi.fn(),
      listHabits: vi.fn(),
      getHabit: vi.fn(),
      createHabit: vi.fn(),
      updateHabit: vi.fn(),
      checkHabit: vi.fn(),
      deleteHabit: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
      getHabitStreak: vi.fn(),
      listTaskComments: vi.fn().mockResolvedValue([]),
      addHabitNote: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue([]),
      getNote: vi.fn().mockResolvedValue(null),
      listActors: vi.fn().mockResolvedValue([]),
      createActor: vi.fn(),
      renameActor: vi.fn(),
      archiveActor: vi.fn(),
      unarchiveActor: vi.fn(),
      getIntegrationBinding: vi.fn(),
      updateIntegrationBinding: vi.fn(),
      getIntegrationBindingStatus: vi.fn(),
      listApprovals: vi.fn(),
      approveTaskDescription: vi.fn(),
      approveNoteContent: vi.fn(),
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

  it("delegates deleteTask to the daemon client", async () => {
    const client = {
      deleteTask: vi.fn().mockResolvedValue({ taskId: "task-1", deleted: true }),
    };
    const taskService = createToduTaskService({ client: client as never });

    const result = await taskService.deleteTask("task-1");

    expect(result).toEqual({ taskId: "task-1", deleted: true });
    expect(client.deleteTask).toHaveBeenCalledWith("task-1");
  });

  it("wraps daemon client errors for deleteTask", async () => {
    const client = {
      deleteTask: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "not-found",
          method: "task.delete",
          message: "Task not found",
        })
      ),
    };
    const taskService = createToduTaskService({ client: client as never });

    await expect(taskService.deleteTask("task-missing")).rejects.toThrow(ToduTaskServiceError);
    await expect(taskService.deleteTask("task-missing")).rejects.toMatchObject({
      operation: "deleteTask",
      causeCode: "not-found",
    });
  });

  it("delegates moveTask to the daemon client and hydrates project name", async () => {
    const targetTask = {
      id: "task-new",
      title: "Moved task",
      status: "active" as const,
      priority: "medium" as const,
      projectId: "proj-2",
      projectName: null,
      labels: [],
      assigneeActorIds: ["actor-reviewer"],
      assigneeDisplayNames: ["Reviewer"],
      assignees: ["Reviewer"],
      description: null,
      descriptionApproval: null,
      outboundAssigneeWarnings: [],
      comments: [],
    };
    const client = {
      moveTask: vi.fn().mockResolvedValue({ sourceTaskId: "task-1", targetTask }),
      getProject: vi.fn().mockResolvedValue({ id: "proj-2", name: "Target Project" }),
    };
    const taskService = createToduTaskService({ client: client as never });

    const result = await taskService.moveTask({ taskId: "task-1", targetProjectId: "proj-2" });

    expect(result.sourceTaskId).toBe("task-1");
    expect(result.targetTask.projectName).toBe("Target Project");
  });

  it("wraps daemon client errors for moveTask", async () => {
    const client = {
      moveTask: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "not-found",
          method: "task.move",
          message: "Task not found",
        })
      ),
    };
    const taskService = createToduTaskService({ client: client as never });

    await expect(
      taskService.moveTask({ taskId: "task-missing", targetProjectId: "proj-2" })
    ).rejects.toThrow(ToduTaskServiceError);
    await expect(
      taskService.moveTask({ taskId: "task-missing", targetProjectId: "proj-2" })
    ).rejects.toMatchObject({
      operation: "moveTask",
      causeCode: "not-found",
    });
  });
});
