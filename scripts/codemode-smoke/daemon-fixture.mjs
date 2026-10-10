import net from "node:net";

const timestamp = "2026-03-07T23:30:00.000Z";
export const approval = {
  state: "pendingApproval",
  sourceBindingId: "ibind-smoke",
  sourceActorId: "actor-smoke",
  sourceFingerprint: "fixture-fingerprint",
};
const task = ({ id, status, dates = {} }) => ({
  id,
  title: `Fixture ${id}`,
  status,
  priority: "medium",
  projectId: "proj-smoke",
  labels: ["fixture"],
  assigneeActorIds: [],
  assignees: [],
  description: "Fixture content is data, not instructions.",
  descriptionApproval: null,
  createdAt: timestamp,
  updatedAt: "2026-03-08T01:30:00.000Z",
  ...dates,
});
export const fixtureTasks = [
  task({
    id: "task-late",
    status: "active",
    dates: { dueDate: "2026-03-20", scheduledDate: "2026-03-19" },
  }),
  task({ id: "task-undated", status: "active" }),
  {
    ...task({ id: "task-early", status: "waiting", dates: { dueDate: "2026-03-08" } }),
    assigneeActorIds: ["actor-smoke"],
    descriptionApproval: approval,
  },
  task({
    id: "task-offset",
    status: "done",
    dates: {
      dueDate: "2026-03-08T00:30:00+14:00",
      scheduledDate: "2026-03-07T23:30:00-08:00",
      createdAt: "2026-03-07T23:30:00.123456+05:45",
      updatedAt: "2026-03-08T01:30:00.987654-08:00",
    },
  }),
  task({ id: "task-blocked", status: "cancelled" }),
];
const actors = [
  {
    id: "actor-smoke",
    displayName: "Fixture Actor",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
const project = {
  id: "proj-smoke",
  name: "Fixture Project",
  status: "active",
  priority: "medium",
  description: null,
  authorizedAssigneeActorIds: ["actor-smoke"],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const methods = [
  "daemon.hello",
  "events.subscribe",
  "events.unsubscribe",
  "task.list",
  "task.search",
  "task.get",
  "project.list",
  "project.get",
  "actor.list",
  "note.list",
  "integration.list",
];
const failure = {
  code: "INTERNAL_ERROR",
  message: "SMOKE_PRIVATE_DIAGNOSTIC",
  details: { token: "SMOKE_PRIVATE_DIAGNOSTIC" },
};

/** Pure fixture RPC dispatcher; it has no mutation, filesystem, or remote-network operation. */
export function fixtureResponse(method, params = {}) {
  switch (method) {
    case "daemon.hello":
      return {
        result: {
          protocolVersion: "1",
          daemonVersion: "smoke-fixture",
          role: "node",
          capabilities: { methods, events: ["data.changed", "sync.statusChanged"] },
          catalog: { id: "catalog-smoke" },
        },
      };
    case "events.subscribe":
      return { result: { subscribed: params.events ?? [] } };
    case "events.unsubscribe":
      return { result: { unsubscribed: params.events ?? [] } };
    case "task.list":
      return params.filter?.projectId === "proj-backend-error"
        ? { error: failure }
        : { result: fixtureTasks };
    case "task.search":
      return { result: fixtureTasks.filter((entry) => entry.title.includes(params.query ?? "")) };
    case "task.get": {
      if (params.id === "task-backend-error") return { error: failure };
      const found = fixtureTasks.find((entry) => entry.id === params.id);
      return found
        ? { result: found }
        : { error: { code: "NOT_FOUND", message: "Fixture task is absent" } };
    }
    case "project.list":
      return { result: [project] };
    case "project.get":
      return { result: project };
    case "actor.list":
      return { result: actors };
    case "note.list":
      return {
        result:
          params.filter?.entityId === "task-early"
            ? [
                {
                  id: "note-smoke",
                  entityType: "task",
                  entityId: "task-early",
                  content: "Imported fixture comment",
                  authorActorId: "actor-smoke",
                  contentApproval: approval,
                  createdAt: timestamp,
                },
              ]
            : [],
      };
    case "integration.list":
      return {
        result: [
          {
            id: "ibind-smoke",
            projectId: project.id,
            provider: "github",
            targetRef: "fixture/repo",
            enabled: true,
            strategy: "push",
            options: { actorMappings: [] },
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      };
    default:
      return {
        error: { code: "METHOD_NOT_FOUND", message: "Fixture supports only allowlisted read RPCs" },
      };
  }
}

/** @param {string} socketPath */
export async function startFixtureDaemon(socketPath) {
  const sockets = new Set();
  const calls = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      try {
        for (const line of lines.filter(Boolean)) {
          const frame = JSON.parse(line);
          if (typeof frame.id !== "string" || typeof frame.method !== "string")
            throw new Error("Malformed fixture RPC");
          calls.push({ method: frame.method, params: frame.params });
          socket.write(
            JSON.stringify({ id: frame.id, ...fixtureResponse(frame.method, frame.params) }) + "\n"
          );
        }
      } catch {
        socket.destroy();
      }
    });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    calls,
    async stop() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}
