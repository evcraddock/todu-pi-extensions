import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getDefaultCurrentTaskContextController } from "./current-task-context";
import { getDefaultSyncStatusContextController } from "./sync-status-context";

const registerUi = (pi: ExtensionAPI): void => {
  getDefaultCurrentTaskContextController(pi);
  getDefaultSyncStatusContextController(pi);
};

export { registerUi };
