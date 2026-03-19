import { describe, expect, it } from "vitest";

import { createTaskListItem } from "@/ui/components/task-list";

describe("task list UI scaffolding", () => {
  it("creates a list item view model from a task summary", () => {
    const item = createTaskListItem({
      id: "task-123",
      title: "Implement module layout",
      status: "active",
      priority: "high",
      projectId: "proj-1",
      projectName: "Foundation",
      labels: ["foundation"],
    });

    expect(item).toEqual({
      value: "task-123",
      label: "Implement module layout",
      description: "active • high • Foundation",
    });
  });
});
