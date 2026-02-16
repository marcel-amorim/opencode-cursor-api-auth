function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeModelIds(models: string[]): string[] {
  return [...new Set(models.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function formatModelName(modelId: string): string {
  const formatted = modelId
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll("/", " ")
    .trim();

  if (formatted.length === 0) {
    return modelId;
  }

  return formatted
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function modelRecordFor(modelId: string): Record<string, unknown> {
  return {
    name: `Cursor ${formatModelName(modelId)}`,
  };
}

export function mergeModelIds(params: { userModels: string[]; discoveredModels: string[]; defaultModels: string[] }): string[] {
  const merged = [...params.defaultModels, ...params.discoveredModels, ...params.userModels];
  const normalized = normalizeModelIds(merged);
  if (!normalized.includes("auto")) {
    normalized.unshift("auto");
  }
  return normalized;
}

export function mergeProviderModels(
  userModels: Record<string, unknown> | undefined,
  discoveredModels: string[],
  defaultModels: string[],
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {};

  for (const modelId of normalizeModelIds(defaultModels)) {
    merged[modelId] = modelRecordFor(modelId);
  }

  for (const modelId of normalizeModelIds(discoveredModels)) {
    merged[modelId] = modelRecordFor(modelId);
  }

  if (isRecord(userModels)) {
    for (const [modelId, definition] of Object.entries(userModels)) {
      if (isRecord(definition)) {
        merged[modelId] = definition;
      }
    }
  }

  if (!merged.auto) {
    merged.auto = modelRecordFor("auto");
  }

  return merged;
}
