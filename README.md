# opencode-cursor-api-auth

Use local `cursor-agent` inside OpenCode.

Repository: `https://github.com/marcel-amorim/opencode-cursor-api-auth`
Forked from: `https://github.com/POSO-PocketSolutions/opencode-cursor-auth`

This plugin is for people who pay for Cursor (or have it paid for them) and want to use it from OpenCode without GitHub integration.

## Requirements

- An active **Cursor Pro** subscription (or equivalent).
- `cursor-agent` installed and logged in.
- `bun` installed.

## Important

- This plugin uses local `cursor-agent`, so it does not depend on Cursor GitHub integration.

## Install bun (macOS/Linux)

`curl -fsSL https://bun.sh/install | bash`

## Install

1) Install the plugin:

```bash
npm install opencode-cursor-api-auth
```

2) Add it to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-cursor-api-auth@1.0.0"
  ],
  "provider": {
    "cursor": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Cursor Agent (local)",
      "options": {
        "baseURL": "http://127.0.0.1:32123/v1"
      }
    }
  }
}
```

`provider.cursor.models` is optional. The plugin now performs startup model sync and injects runtime models automatically.

## Login

```bash
opencode auth login
```

- Select provider: `Other`
- Provider id: `cursor`
- Method: `Login via cursor-agent (opens browser)`

## Run

```bash
opencode run "decime hola" --model cursor/gpt-5.2
opencode run "listame los archivos del repo" --model cursor/auto
```

## Startup Model Sync

- On startup, the plugin tries to discover models from local Cursor state.
- If discovery fails, it falls back to cached models.
- If cache is missing/expired/invalid, it falls back to safe defaults.
- `cursor/auto` is always preserved.

Merge precedence is:

1. User-defined models in OpenCode config
2. Discovered or cached models
3. Safe defaults

## Environment Overrides

All env vars are optional.

| Variable | Default | Description |
|---|---|---|
| `CURSOR_PROVIDER_ID` | `cursor` | Provider id used by auth/chat hooks |
| `CURSOR_PROXY_HOST` | `127.0.0.1` | Proxy bind host |
| `CURSOR_PROXY_PORT` | `32123` | Proxy bind port |
| `CURSOR_PROXY_HEARTBEAT_MS` | `1000` | Streaming heartbeat interval |
| `CURSOR_LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `CURSOR_TOOL_AUTO_MODEL` | `sonnet-4.5-thinking` | Model used when tools are present and request model resolves to `auto` |
| `CURSOR_AGENT_TIMEOUT_MS` | `600000` | cursor-agent timeout in ms |
| `CURSOR_MODEL_ALIASES` | `{"gpt-5":"gpt-5.2","sonnet-4":"sonnet-4.5"}` | JSON object for alias mapping |
| `CURSOR_MODEL_DISCOVERY_ENABLED` | `true` | Enables startup model discovery |
| `CURSOR_MODEL_DISCOVERY_CACHE_PATH` | `.cursor-models-cache.json` | Cache file path (stored in `~/.opencode/` when relative, unless absolute) |
| `CURSOR_MODEL_DISCOVERY_CACHE_TTL_MS` | `86400000` | Cache ttl in ms |
| `CURSOR_FALLBACK_MODELS` | `auto,gpt-5.2,sonnet-4.5,sonnet-4.5-thinking` | JSON array or comma-separated fallback model ids |

## Optional Manual Overrides

You can still define explicit model metadata in OpenCode config. Those entries win over discovered and default models.

```json
{
  "provider": {
    "cursor": {
      "models": {
        "gpt-5.2": { "name": "My GPT 5.2 Label" },
        "custom-model": { "name": "Custom Cursor Model" }
      }
    }
  }
}
```

## Notes

- Tool-calling is best-effort and works with OpenCode tools.

## License

ISC
