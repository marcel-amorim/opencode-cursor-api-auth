import { loginLocal } from "./local.js";
import { loginAgent } from "./agent.js";
import type { CursorAuthResult } from "./types.js";
import { CursorAuthError } from "../plugin/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("auth");

function toFailureReason(reason: string | undefined): string {
  return reason && reason.trim().length > 0 ? reason.trim() : "Unknown error";
}

export function buildAuthFailureMessage(localError: string | undefined, agentError: string | undefined): string {
  return [
    "No authentication found.",
    `Checked Local DB: ${toFailureReason(localError)}`,
    `Checked Agent Config: ${toFailureReason(agentError)}`,
  ].join("\n");
}

export async function getCursorAuth(): Promise<CursorAuthResult> {
  const localResult = await loginLocal();
  if (localResult.type === "success") {
    log.debug("Authenticated via local Cursor database", { source: localResult.source });
    return localResult;
  }

  const agentResult = await loginAgent();
  if (agentResult.type === "success") {
    log.debug("Authenticated via cursor-agent auth file", { source: agentResult.source });
    return agentResult;
  }

  const error = new CursorAuthError(
    buildAuthFailureMessage(localResult.error, agentResult.error),
    {
      localError: localResult.error,
      agentError: agentResult.error,
    },
  );
  log.warn("Authentication lookup failed", { error: error.message });

  return {
    type: "failed",
    error: error.message,
  };
}
