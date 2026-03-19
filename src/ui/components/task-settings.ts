import type { TaskPriority, TaskStatus } from "@/domain/task";

export interface TaskSettingOption<TValue extends string> {
  label: string;
  value: TValue;
}

export const taskStatusOptions: TaskSettingOption<TaskStatus>[] = [
  { label: "Active", value: "active" },
  { label: "In Progress", value: "inprogress" },
  { label: "Waiting", value: "waiting" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
];

export const taskPriorityOptions: TaskSettingOption<TaskPriority>[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
