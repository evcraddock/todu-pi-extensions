import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  getDefaultCurrentTaskContextController,
  resetDefaultCurrentTaskContextController,
} from "./current-task-context";

const registerEvents = (pi: ExtensionAPI): void => {
  const currentTaskContext = getDefaultCurrentTaskContextController(pi);
  const restoreCurrentTaskContext = async (ctx: ExtensionContext): Promise<void> => {
    await currentTaskContext.restoreFromBranch(ctx);
  };

  pi.on("session_start", async (_event, ctx) => {
    await restoreCurrentTaskContext(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await restoreCurrentTaskContext(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await restoreCurrentTaskContext(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    await restoreCurrentTaskContext(ctx);
  });

  pi.on("session_shutdown", async () => {
    await resetDefaultCurrentTaskContextController();
  });
};

export { registerEvents };
