import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import { getCursorPluginConfig } from "./config/loader.js";
import { buildRuntimeProviderModels, syncCursorModels } from "./cursor/model-sync.js";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  const modelSync = await syncCursorModels(directory, config);

  return {
    async config(opencodeConfig: any) {
      if (!config.modelDiscoveryEnabled || !isRecord(opencodeConfig)) {
        return;
      }

      let providers: Record<string, unknown>;
      if (isRecord(opencodeConfig.provider)) {
        providers = opencodeConfig.provider;
      } else {
        providers = {};
        opencodeConfig.provider = providers;
      }

      let providerConfig: Record<string, unknown>;
      if (isRecord(providers[config.providerId])) {
        providerConfig = providers[config.providerId] as Record<string, unknown>;
      } else {
        providerConfig = {};
        providers[config.providerId] = providerConfig;
      }

      const existingModels = isRecord(providerConfig.models) ? providerConfig.models : undefined;
      providerConfig.models = buildRuntimeProviderModels(existingModels, modelSync.models, config.fallbackModels);

      if (modelSync.warnings.length > 0) {
        log.warn("Startup model sync completed with warnings", {
          source: modelSync.source,
          warnings: modelSync.warnings,
        });
      }
    },

    auth: {
      provider: config.providerId,
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
      if (input.model.providerID !== config.providerId) {
        return;
      }

      output.options.baseURL = proxyBaseURL;
      output.options.apiKey = output.options.apiKey || "cursor-agent";
    },
  };
};
