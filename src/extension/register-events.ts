import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import {
  getDefaultCurrentTaskContextController,
  resetDefaultCurrentTaskContextController,
} from "./current-task-context";
import { createPickupTaskInputHandler } from "./pickup-task-input";
import { resetDefaultTaskBrowseFilterContextController } from "./task-browse-filter-context";

const registerEvents = (pi: ExtensionAPI): void => {
  const currentTaskContext = getDefaultCurrentTaskContextController(pi);
  const taskServiceRuntime = getDefaultToduTaskServiceRuntime();
  const restoreUiContext = async (ctx: ExtensionContext): Promise<void> => {
    await currentTaskContext.restoreFromBranch(ctx);
  };

  pi.on("session_start", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await restoreUiContext(ctx);
  });

  pi.on(
    "input",
    createPickupTaskInputHandler({
      getTaskService: () => taskServiceRuntime.ensureConnected(),
      setCurrentTask: (ctx, task) => currentTaskContext.setCurrentTask(ctx, task),
    })
  );

  pi.on("session_shutdown", async () => {
    await Promise.all([
      resetDefaultCurrentTaskContextController(),
      resetDefaultTaskBrowseFilterContextController(),
    ]);
  });
};

export { registerEvents };
