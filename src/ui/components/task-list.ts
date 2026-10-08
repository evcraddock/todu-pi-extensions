import {
  type Component,
  type SelectItem,
  SelectList,
  type SelectListTheme,
  truncateToWidth,
} from "@earendil-works/pi-tui";

import type { TaskId, TaskSummary } from "../../domain/task";
import { formatTaskSummary } from "../../utils/task-format";

export interface TaskListItem {
  value: TaskId;
  label: string;
  description: string;
}

const createTaskListItem = (task: TaskSummary): TaskListItem => ({
  value: task.id,
  label: task.title,
  description: formatTaskSummary(task),
});

export interface TaskListOptions {
  items: SelectItem[];
  maxVisible: number;
  theme: SelectListTheme;
  onSelect: (item: SelectItem) => void;
  onCancel: () => void;
}

const normalizeToSingleLine = (text: string): string => text.replace(/[\r\n]+/g, " ").trim();

const createTaskList = ({
  items,
  maxVisible,
  theme,
  onSelect,
  onCancel,
}: TaskListOptions): Component => {
  // Keep Pi's selection/keybinding behavior; only the row layout is task-specific.
  const selection = new SelectList(items, maxVisible, theme);
  selection.onSelect = onSelect;
  selection.onCancel = onCancel;

  return {
    render: (width: number): string[] => {
      const selectedItem = selection.getSelectedItem();
      const selectedIndex = selectedItem === null ? 0 : items.indexOf(selectedItem);
      const startIndex = Math.max(
        0,
        Math.min(selectedIndex - Math.floor(maxVisible / 2), items.length - maxVisible)
      );
      const visibleItems = items.slice(startIndex, startIndex + maxVisible);
      const contentWidth = Math.max(0, width - 2);
      const lines = visibleItems.flatMap((item) => {
        const title = truncateToWidth(normalizeToSingleLine(item.label), contentWidth, "");
        const description = truncateToWidth(
          normalizeToSingleLine(item.description ?? ""),
          contentWidth,
          ""
        );
        const isSelected = item === selectedItem;
        return [
          truncateToWidth(
            isSelected ? theme.selectedPrefix("→ ") + theme.selectedText(title) : `  ${title}`,
            width,
            ""
          ),
          theme.description(truncateToWidth(`  ${description}`, width, "")),
        ];
      });

      if (items.length > maxVisible) {
        lines.push(
          theme.scrollInfo(truncateToWidth(`  (${selectedIndex + 1}/${items.length})`, width, ""))
        );
      }

      return lines;
    },
    invalidate: () => selection.invalidate(),
    handleInput: (data: string) => selection.handleInput(data),
  };
};

export { createTaskList, createTaskListItem };
