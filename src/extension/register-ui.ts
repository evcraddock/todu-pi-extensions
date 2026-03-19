import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { getDefaultCurrentTaskContextController } from "./current-task-context";

const registerUi = (pi: ExtensionAPI): void => {
  getDefaultCurrentTaskContextController(pi);
};

export { registerUi };
