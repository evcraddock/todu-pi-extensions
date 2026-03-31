import { describe, expect, it, vi } from "vitest";

import type { RecurringTemplateSummary } from "@/domain/recurring";
import type { ProjectService } from "@/services/project-service";
import type { RecurringService } from "@/services/recurring-service";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";
import {
  createToduRecurringService,
  ToduRecurringServiceError,
} from "@/services/todu/todu-recurring-service";

const createRecurringSummary = (
  overrides: Partial<RecurringTemplateSummary> = {}
): RecurringTemplateSummary => ({
  id: "rec-1",
  title: "Weekly review",
  projectId: "proj-1",
  projectName: null,
  priority: "medium",
  schedule: "FREQ=WEEKLY;BYDAY=FR",
  timezone: "UTC",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-06",
  missPolicy: "accumulate",
  paused: false,
  ...overrides,
});

describe("createToduRecurringService", () => {
  it("delegates recurring reads and mutations to the daemon client", async () => {
    const recurringTemplates = [createRecurringSummary()];
    const createdTemplate = {
      ...createRecurringSummary({ id: "rec-2", title: "Daily standup" }),
      description: null,
      labels: [],
      skippedDates: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };
    const updatedTemplate = {
      ...createRecurringSummary({ title: "Updated review", priority: "high", paused: true }),
      description: "Updated from tests",
      labels: [],
      skippedDates: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    };
    const client = {
      listRecurring: vi.fn().mockResolvedValue(recurringTemplates),
      getRecurring: vi.fn().mockResolvedValue(createdTemplate),
      createRecurring: vi.fn().mockResolvedValue(createdTemplate),
      updateRecurring: vi.fn().mockResolvedValue(updatedTemplate),
      deleteRecurring: vi.fn().mockResolvedValue({ recurringId: "rec-1", deleted: true }),
      listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "Todu Pi Extensions" }]),
      getProject: vi.fn().mockResolvedValue({
        id: "proj-1",
        name: "Todu Pi Extensions",
        status: "active",
        priority: "medium",
        description: null,
      }),
    } as unknown as {
      listRecurring: RecurringService["listRecurring"];
      getRecurring: RecurringService["getRecurring"];
      createRecurring: RecurringService["createRecurring"];
      updateRecurring: RecurringService["updateRecurring"];
      deleteRecurring: RecurringService["deleteRecurring"];
      listProjects: ProjectService["listProjects"];
      getProject: ProjectService["getProject"];
    };

    const recurringService = createToduRecurringService({ client: client as never });

    await expect(recurringService.listRecurring()).resolves.toEqual([
      createRecurringSummary({ projectName: "Todu Pi Extensions" }),
    ]);
    await expect(recurringService.getRecurring("rec-2")).resolves.toEqual({
      ...createdTemplate,
      projectName: "Todu Pi Extensions",
    });
    await expect(
      recurringService.createRecurring({
        title: "Daily standup",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).resolves.toEqual({
      ...createdTemplate,
      projectName: "Todu Pi Extensions",
    });
    await expect(
      recurringService.updateRecurring({ recurringId: "rec-1", paused: true })
    ).resolves.toEqual({
      ...updatedTemplate,
      projectName: "Todu Pi Extensions",
    });
    await expect(recurringService.deleteRecurring("rec-1")).resolves.toEqual({
      recurringId: "rec-1",
      deleted: true,
    });
  });

  it("wraps daemon client failures in a recurring-service error", async () => {
    const client = {
      listRecurring: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "validation",
          method: "recurring.list",
          message: "recurring.list failed (VALIDATION_ERROR): invalid recurring filter",
          details: { field: "search" },
        })
      ),
      getRecurring: vi.fn(),
      createRecurring: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "conflict",
          method: "recurring.create",
          message: "recurring.create failed (CONFLICT): duplicate recurring template",
          details: { title: "Weekly review" },
        })
      ),
      updateRecurring: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "not-found",
          method: "recurring.update",
          message: "recurring.update failed (NOT_FOUND): recurring template not found",
          details: { id: "rec-missing" },
        })
      ),
      deleteRecurring: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "unavailable",
          method: "recurring.delete",
          message: "recurring.delete failed (DAEMON_UNAVAILABLE): daemon unavailable",
          details: { socketPath: "/tmp/daemon.sock" },
        })
      ),
      listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockResolvedValue(null),
    } as never;

    const recurringService = createToduRecurringService({ client });

    await expect(recurringService.listRecurring()).rejects.toEqual(
      expect.objectContaining<ToduRecurringServiceError>({
        name: "ToduRecurringServiceError",
        operation: "listRecurring",
        causeCode: "validation",
        message:
          "listRecurring failed: recurring.list failed (VALIDATION_ERROR): invalid recurring filter",
      })
    );
    await expect(
      recurringService.createRecurring({
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).rejects.toEqual(
      expect.objectContaining<ToduRecurringServiceError>({
        name: "ToduRecurringServiceError",
        operation: "createRecurring",
        causeCode: "conflict",
        message:
          "createRecurring failed: recurring.create failed (CONFLICT): duplicate recurring template",
      })
    );
    await expect(
      recurringService.updateRecurring({ recurringId: "rec-missing", paused: true })
    ).rejects.toEqual(
      expect.objectContaining<ToduRecurringServiceError>({
        name: "ToduRecurringServiceError",
        operation: "updateRecurring",
        causeCode: "not-found",
        message:
          "updateRecurring failed: recurring.update failed (NOT_FOUND): recurring template not found",
      })
    );
    await expect(recurringService.deleteRecurring("rec-1")).rejects.toEqual(
      expect.objectContaining<ToduRecurringServiceError>({
        name: "ToduRecurringServiceError",
        operation: "deleteRecurring",
        causeCode: "unavailable",
        message:
          "deleteRecurring failed: recurring.delete failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );
  });
});
