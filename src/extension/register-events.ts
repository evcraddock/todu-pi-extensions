import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  getDefaultCurrentTaskContextController,
  resetDefaultCurrentTaskContextController,
} from "./current-task-context";
import {
  getDefaultSyncStatusContextController,
  resetDefaultSyncStatusContextController,
} from "./sync-status-context";

const registerEvents = (pi: ExtensionAPI): void => {
  const currentTaskContext = getDefaultCurrentTaskContextController(pi);
  const syncStatusContext = getDefaultSyncStatusContextController(pi);
  const restoreUiContext = async (ctx: ExtensionContext): Promise<void> => {
    await Promise.all([currentTaskContext.restoreFromBranch(ctx), syncStatusContext.attach(ctx)]);
  };

  pi.on("session_start", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on("session_shutdown", async () => {
    await Promise.all([
      resetDefaultCurrentTaskContextController(),
      resetDefaultSyncStatusContextController(),
    ]);
  });
};

export { registerEvents };
