import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import { CURSOR_PROVIDER_ID } from "./constants.js";
import { getCursorPluginConfig } from "./config/loader.js";
import { CursorCommandError } from "./plugin/errors.js";
import { ensureCursorProxyServer } from "./plugin/proxy.js";
import { parseCursorStreamLine } from "./plugin/stream.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("plugin");

interface ShellCommandResult {
  exitCode: number;
  text(): string;
}

interface ShellCommand {
  quiet(): ShellCommand;
  nothrow(): Promise<ShellCommandResult>;
}

interface ShellRunner {
  (strings: TemplateStringsArray, ...values: unknown[]): ShellCommand;
}

async function authorizeCursorAgent($: ShellRunner): Promise<{ type: "success"; key: string } | { type: "failed" }> {
  const check = await $`cursor-agent --version`.quiet().nothrow();
  if (check.exitCode !== 0) {
    const error = new CursorCommandError("cursor-agent --version", check.exitCode, {
      output: check.text(),
    });
    log.warn("cursor-agent is unavailable", { message: error.message });
    return { type: "failed" };
  }

  const whoami = await $`cursor-agent whoami`.quiet().nothrow();
  if (whoami.exitCode !== 0) {
    const error = new CursorCommandError("cursor-agent whoami", whoami.exitCode, {
      output: whoami.text(),
    });
    log.warn("cursor-agent whoami failed", { message: error.message });
    return { type: "failed" };
  }

  if (whoami.text().includes("Not logged in")) {
    const login = await $`cursor-agent login`.nothrow();
    if (login.exitCode !== 0) {
      const error = new CursorCommandError("cursor-agent login", login.exitCode, {
        output: login.text(),
      });
      log.warn("cursor-agent login failed", { message: error.message });
      return { type: "failed" };
    }
  }

  return {
    type: "success",
    key: "cursor-agent",
  };
}

export { parseCursorStreamLine, ensureCursorProxyServer };

export const CursorAuthPlugin: Plugin = async ({ $, directory }: PluginInput) => {
  const config = getCursorPluginConfig();
  const proxyBaseURL = await ensureCursorProxyServer(directory, config);

  return {
    auth: {
      provider: CURSOR_PROVIDER_ID,
      async loader(_getAuth: () => Promise<Auth>) {
        return {};
      },
      methods: [
        {
          label: "Login via cursor-agent (opens browser)",
          type: "api",
          authorize: async () => authorizeCursorAgent($ as unknown as ShellRunner),
        },
      ],
    },

    async "chat.params"(input, output) {
      if (input.model.providerID !== CURSOR_PROVIDER_ID) {
        return;
      }

      output.options.baseURL = proxyBaseURL;
      output.options.apiKey = output.options.apiKey || "cursor-agent";
    },
  };
};
