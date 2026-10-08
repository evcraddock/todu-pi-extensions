import {
  stripTerminalSequences,
  visibleWidth,
  type SelectItem,
  type SelectListTheme,
} from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";

import { createTaskList } from "@/ui/components/task-list";

const identity = (text: string): string => text;
const theme: SelectListTheme = {
  selectedPrefix: identity,
  selectedText: identity,
  description: identity,
  scrollInfo: identity,
  noMatch: identity,
};

const createItems = (count = 1): SelectItem[] =>
  Array.from({ length: count }, (_, index) => ({
    value: `task:${index}`,
    label: `Task ${index}`,
    description: "active • high • Todu Pi Extensions",
  }));

const createList = (items = createItems(), maxVisible = 6) => {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  const list = createTaskList({ items, maxVisible, theme, onSelect, onCancel });
  return { list, onSelect, onCancel };
};

describe("createTaskList", () => {
  it("renders the title and metadata on separate lines", () => {
    const { list } = createList();

    expect(list.render(100)).toEqual(["→ Task 0", "  active • high • Todu Pi Extensions"]);
  });

  it("uses all available columns after the selection prefix", () => {
    const title = "T".repeat(150);
    const { list } = createList([
      { value: "task:0", label: title, description: "active • high • project" },
    ]);

    for (const width of [40, 80, 120]) {
      const lines = list.render(width);
      expect(stripTerminalSequences(lines[0])).toBe(`→ ${"T".repeat(width - 2)}`);
      expect(lines[1]).toBe("  active • high • project");
    }
  });

  it("keeps titles and metadata single-line even when their values contain newlines", () => {
    const { list } = createList([
      {
        value: "task:0",
        label: "First\r\nSecond",
        description: "active\nhigh\rproject",
      },
    ]);

    expect(list.render(80)).toEqual(["→ First Second", "  active high project"]);
  });

  it("fits narrow terminals and handles ANSI colors, wide and combining characters", () => {
    const { list } = createList([
      {
        value: "task:0",
        label: "\u001b[31m界🙂e\u0301 repeated title\u001b[0m",
        description: "active • high • 项目🙂".repeat(3),
      },
    ]);

    for (const width of [0, 1, 2, 3, 10, 20, 40]) {
      const lines = list.render(width);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        expect(line).not.toMatch(/[\r\n]/);
      }
    }
  });

  it("delegates selection, wrapping and cancellation to SelectList", () => {
    const items = createItems(3);
    const { list, onSelect, onCancel } = createList(items);

    list.handleInput?.("\u001b[B");
    expect(list.render(80)[2]).toBe("→ Task 1");
    list.handleInput?.("\r");
    expect(onSelect).toHaveBeenLastCalledWith(items[1]);

    list.handleInput?.("\u001b[A");
    list.handleInput?.("\u001b[A");
    expect(list.render(80)[4]).toBe("→ Task 2");
    list.handleInput?.("\u001b[B");
    expect(list.render(80)[0]).toBe("→ Task 0");

    list.handleInput?.("\u001b");
    list.handleInput?.("\u0003");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("scrolls whole two-line rows and keeps the selected task visible", () => {
    const { list, onSelect } = createList(createItems(10), 3);

    expect(list.render(80)).toEqual([
      "→ Task 0",
      "  active • high • Todu Pi Extensions",
      "  Task 1",
      "  active • high • Todu Pi Extensions",
      "  Task 2",
      "  active • high • Todu Pi Extensions",
      "  (1/10)",
    ]);

    for (let index = 0; index < 5; index += 1) list.handleInput?.("\u001b[B");
    expect(list.render(80)).toEqual([
      "  Task 4",
      "  active • high • Todu Pi Extensions",
      "→ Task 5",
      "  active • high • Todu Pi Extensions",
      "  Task 6",
      "  active • high • Todu Pi Extensions",
      "  (6/10)",
    ]);
    list.handleInput?.("\r");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "task:5" }));
  });

  it("styles each row at render time and supports invalidation", () => {
    let color = "accent";
    const list = createTaskList({
      items: createItems(2),
      maxVisible: 6,
      theme: {
        ...theme,
        selectedPrefix: (text) => `[${color}]${text}`,
        selectedText: (text) => `[${color}]${text}`,
        description: (text) => `[muted]${text}`,
      },
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(list.render(80)).toEqual([
      "[accent]→ [accent]Task 0",
      "[muted]  active • high • Todu Pi Extensions",
      "  Task 1",
      "[muted]  active • high • Todu Pi Extensions",
    ]);
    color = "new-accent";
    list.invalidate();
    expect(list.render(80)[0]).toBe("[new-accent]→ [new-accent]Task 0");
  });
});
