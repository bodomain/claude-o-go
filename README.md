# OpenCode Go With Claude Code

This directory contains two examples:

- `claude-code-opencode-go` runs the real Claude Code CLI with OpenCode Go as the Anthropic-compatible backend.
- `opencode-go-claude-example.mjs` is a direct API example for the same `/messages` endpoint.

For a full walkthrough of how this works, read `TUTORIAL.md`.
Eine deutsche Version gibt es in `TUTORIAL.de.md`.

OpenCode Go does not provide Claude models. It provides open coding models, and several of them are exposed through a Claude-compatible `/messages` API. The default model here is `qwen3.7-plus`.

## Claude Code Backend

The launcher reads the OpenCode Go key from `.env`, starts a local proxy at `http://127.0.0.1:4141`, sets `ANTHROPIC_BASE_URL` to that proxy, and starts `claude`.

The proxy is needed because Claude Code validates Claude model names locally. Claude Code can keep using its normal `sonnet` alias, while the proxy rewrites the upstream request to an OpenCode Go model like `qwen3.7-plus`.

By default it adds `--bare`, which makes Claude Code use API-key auth directly and skip OAuth/keychain/background traffic. To run full Claude Code startup behavior anyway:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=0 ./claude-code-opencode-go
```

Make it executable once:

```sh
chmod +x claude-code-opencode-go
```

Run Claude Code interactively:

```sh
./claude-code-opencode-go
```

Run a single prompt:

```sh
./claude-code-opencode-go -p "Explain this repository in one paragraph."
```

Use a different OpenCode Go model:

```sh
OPENCODE_GO_MODEL=minimax-m3 ./claude-code-opencode-go
```

The launcher passes Claude Code's normal `sonnet` model alias, then the local proxy rewrites that request to `OPENCODE_GO_MODEL`. You can change the Claude Code-facing alias with `CLAUDE_CODE_MODEL_ALIAS`, but `sonnet` is the safest default because Claude Code already accepts it.

## Direct API Example

The `.env` file in this directory already contains the OpenCode Go API key as a bare token. The example also supports this named format:

```sh
OPENCODE_GO_API_KEY=sk-...
```

Run the example:

```sh
npm start
```

Use a different Claude-compatible OpenCode Go model:

```sh
OPENCODE_GO_MODEL=minimax-m3 npm start
```

Models documented for the Claude-style endpoint include:

- `minimax-m3`
- `minimax-m2.7`
- `minimax-m2.5`
- `qwen3.7-max`
- `qwen3.7-plus`
- `qwen3.6-plus`
# claude-o-go
