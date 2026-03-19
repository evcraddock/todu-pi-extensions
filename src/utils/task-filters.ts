import type { TaskFilter } from "../domain/task";

const mergeTaskFilter = (baseFilter: TaskFilter, overrideFilter: TaskFilter = {}): TaskFilter => ({
  ...baseFilter,
  ...overrideFilter,
  statuses: overrideFilter.statuses ?? baseFilter.statuses,
  priorities: overrideFilter.priorities ?? baseFilter.priorities,
});

export { mergeTaskFilter };
