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
      },
      "models": {
        "auto": { "name": "Cursor Auto" },
        "gpt-5": { "name": "Cursor GPT-5 (alias -> gpt-5.2)" },
        "gpt-5.2": { "name": "Cursor GPT-5.2" },
        "sonnet-4": { "name": "Cursor Sonnet 4 (alias -> sonnet-4.5)" },
        "sonnet-4.5": { "name": "Cursor Sonnet 4.5" },
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
- Method: `Login via cursor-agent (opens browser)`

## Run

```bash
opencode run "decime hola" --model cursor/gpt-5.2
opencode run "listame los archivos del repo" --model cursor/auto
```

## Notes

- Tool-calling is best-effort and works with OpenCode tools.

## License

ISC
