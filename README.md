# opencode-cursor-api-auth

Use Cursor Cloud Agents API inside OpenCode.

Repository: `https://github.com/marcel-amorim/opencode-cursor-api-auth`

This plugin is for people who pay for Cursor (or have it paid for them) and want to use it from OpenCode with a Cursor API key.

## Requirements

- An active **Cursor Pro** subscription (or equivalent) to access Cursor Cloud Agents.
- A Cursor API key from Cursor Dashboard -> Integrations.
- `bun` installed.

## Important

- This plugin uses Cursor Cloud Agents (`/v0/agents`) and requires a git repository with a reachable `origin` remote.
- If your local checkout has no remote, set `CURSOR_SOURCE_REPOSITORY` and optionally `CURSOR_SOURCE_REF`.

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
      "name": "Cursor Cloud Agents API",
      "options": {
        "baseURL": "https://api.cursor.com/v1",
        "apiKey": "key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      },
      "models": {
        "auto": { "name": "Cursor Cloud Auto" },
        "gpt-5.2": { "name": "Cursor GPT-5.2 High" },
        "gpt-5.3-codex": { "name": "Cursor GPT-5.3 Codex High" },
        "opus-4.6": { "name": "Cursor Opus 4.6 High Thinking" },
        "sonnet-4.5-thinking": { "name": "Cursor Sonnet 4.5 Thinking" }
      }
    }
  }
}
```

## Login

```bash
opencode auth login
```

- Select provider: `Other`
- Provider id: `cursor`
- Method: `Manually enter Cursor API key`

## Run

```bash
opencode run "decime hola" --model cursor/gpt-5.2
opencode run "listame los archivos del repo" --model cursor/auto
```

## Notes

- Tool-calling is best-effort via structured prompt instructions.
- Cursor API key can be provided either in OpenCode auth login flow or in `provider.cursor.options.apiKey`.

## License

ISC
