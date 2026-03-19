import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCommands } from "@/extension/register-commands";
import { registerEvents } from "@/extension/register-events";
import { registerTools } from "@/extension/register-tools";
import { registerUi } from "@/extension/register-ui";

const toduPiExtensions = (pi: ExtensionAPI): void => {
  registerCommands(pi);
  registerTools(pi);
  registerUi(pi);
  registerEvents(pi);
};

export { toduPiExtensions };
export default toduPiExtensions;
