import { describe, expect, it, vi } from "vitest";

import {
  createInMemoryTaskBrowseFilterStore,
  createTaskBrowseFilterState,
  persistTaskBrowseFilterState,
  restoreTaskBrowseFilterState,
  TASK_BROWSE_FILTER_ENTRY_TYPE,
} from "@/services/task-browse-filter-store";

describe("task browse filter store", () => {
  it("tracks saved browse filter state in memory", () => {
    const store = createInMemoryTaskBrowseFilterStore();

    store.replaceState(
      createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: "active",
        priority: "high",
        projectId: "proj-1",
        projectName: "Todu Pi Extensions",
      })
    );

    expect(store.getState()).toEqual({
      hasSavedFilter: true,
      status: "active",
      priority: "high",
      projectId: "proj-1",
      projectName: "Todu Pi Extensions",
    });

    store.clear();

    expect(store.getState()).toEqual({
      hasSavedFilter: false,
      status: null,
      priority: null,
      projectId: null,
      projectName: null,
    });
  });

  it("restores the latest persisted browse filter from session entries", () => {
    expect(
      restoreTaskBrowseFilterState([
        {
          type: "custom",
          customType: TASK_BROWSE_FILTER_ENTRY_TYPE,
          data: {
            hasSavedFilter: true,
            status: "waiting",
            priority: null,
            projectId: "proj-1",
            projectName: "Foundation",
          },
        },
        {
          type: "custom",
          customType: TASK_BROWSE_FILTER_ENTRY_TYPE,
          data: {
            hasSavedFilter: true,
            status: "done",
            priority: "medium",
            projectId: "proj-2",
            projectName: "Todu Pi Extensions",
          },
        },
      ])
    ).toEqual({
      hasSavedFilter: true,
      status: "done",
      priority: "medium",
      projectId: "proj-2",
      projectName: "Todu Pi Extensions",
    });
  });

  it("persists browse filter state through appendEntry", () => {
    const appendEntry = vi.fn();

    persistTaskBrowseFilterState(
      appendEntry,
      createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: "active",
        priority: null,
        projectId: "proj-1",
        projectName: "Todu Pi Extensions",
      })
    );

    expect(appendEntry).toHaveBeenCalledWith(TASK_BROWSE_FILTER_ENTRY_TYPE, {
      hasSavedFilter: true,
      status: "active",
      priority: null,
      projectId: "proj-1",
      projectName: "Todu Pi Extensions",
    });
  });
});
