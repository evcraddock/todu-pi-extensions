import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getDefaultCurrentTaskContextController } from "./current-task-context";

const registerUi = (pi: ExtensionAPI): void => {
  getDefaultCurrentTaskContextController(pi);
};

export { registerUi };
