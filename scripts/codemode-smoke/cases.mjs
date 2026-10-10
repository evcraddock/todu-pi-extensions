// Fixed scripts, never model-generated code or user-supplied task IDs/state paths.
export const structuredReads = `// @options: {"timeout_ms": 20000}
const outcomes = await Promise.allSettled([
  tools.task_list({statuses:["active"],timezone:"UTC"}),
  tools.task_list({statuses:["waiting"],timezone:"UTC"}),
  tools.task_list({query:"Fixture",statuses:["active","waiting"],label:"fixture",timezone:"UTC"}),
]);
if (outcomes.some(o => o.status !== "fulfilled")) throw new Error("Parallel read rejected");
const lists = outcomes.map(o => o.value);
if (lists.some(r => typeof r !== "object" || !r.ok || !Array.isArray(r.data.tasks))) {
  throw new Error("Codemode did not receive structured task envelopes");
}
const merged = [...new Map(lists.flatMap(r => r.data.tasks).map(t => [t.id,t])).values()];
merged.sort((a,b) => a.dueDate === null ? (b.dueDate === null ? 0 : 1) : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate));
const [detail,offset] = await Promise.all([
  tools.task_show({taskId:"task-early"}), tools.task_show({taskId:"task-offset"}),
]);
if (typeof detail !== "object" || !detail.ok || typeof offset !== "object" || !offset.ok) {
  throw new Error("Codemode did not receive structured task details");
}
return {lists,ids:merged.map(t => t.id),detail,offset};`;

export const negativeReads = `// @options: {"timeout_ms": 20000}
const outcomes = await Promise.allSettled([
  tools.task_list({projectId:"proj-missing",timezone:"UTC"}),
  tools.task_show({taskId:"task-missing"}),
  tools.task_list({projectId:"proj-backend-error",timezone:"UTC"}),
  tools.task_show({taskId:"task-backend-error"}),
  tools.task_show({taskId:" "}),
]);
if (outcomes.some(o => o.status !== "fulfilled")) throw new Error("Expected resolved result envelopes");
return outcomes.map(o => o.value);`;

export const blockedRead = `// @options: {"timeout_ms": 20000}
const [outcome] = await Promise.allSettled([tools.task_show({taskId:"task-blocked"})]);
if (outcome.status !== "rejected") throw new Error("Nested hook did not block the fixture read");
return {rejected:true,reason:outcome.reason.message};`;
