# claude-o-go

Run the **Claude Code harness** with an **OpenCode Go backend**.

This lets you keep the Claude Code CLI experience — the terminal UI, tools, prompt handling, file edits, and agent workflow — while the actual model responses come from OpenCode Go instead of Anthropic's Claude API.

## What is the harness, what is the backend

- **Claude Code** is the *harness*: the CLI, the REPL, tool calling, file editing, permissions, and the agent loop. It expects to talk to an Anthropic-compatible `/v1/messages` endpoint.
- **OpenCode Go** is the *backend* — but it is a **routing and billing layer, not a model host**. One OpenCode Go subscription gives you a single Anthropic-compatible endpoint, but the actual inference is routed to each model vendor's own API: Qwen models run on Alibaba's API, MiniMax on MiniMax's API, Kimi on Moonshot AI's API, DeepSeek on DeepSeek's API, GLM on Z.ai's API (Zhipu AI), and so on. You pay OpenCode; OpenCode pays the upstream providers. Think of it like OpenRouter — aggregation, not hosting.

OpenCode Go does not provide Claude models. It provides open coding models (e.g. `qwen3.7-plus`, `minimax-m3`, `glm-5.2`), exposed through a Claude-compatible `/messages` API. Because each upstream vendor implements that Anthropic-compatible endpoint independently, maturity varies — see the compatibility table below.

`claude-o-go` glues the two together: it points Claude Code at a small local proxy, and the proxy forwards each request to OpenCode Go with the model name rewritten. Claude Code keeps thinking it is talking to `sonnet`; OpenCode Go actually answers.

## What is in this directory

- `claude-o-go` — the launcher. Starts the local proxy, sets `ANTHROPIC_BASE_URL`, and runs `claude`. This is what you run instead of `claude`.
- `opencode-go-claude-proxy.mjs` — the local proxy that rewrites the model name, forwards requests to OpenCode Go, and streams responses back to Claude Code.
- `opencode-go-claude-example.mjs` — a direct API example that calls the same `/messages` endpoint without Claude Code.
- `.env` — your OpenCode Go API key.

For a full walkthrough, read `TUTORIAL.md`. Eine deutsche Version gibt es in `TUTORIAL.de.md`.
Typeset versions are available as `TUTORIAL.tex` / `TUTORIAL.pdf` and `TUTORIAL.de.tex` / `TUTORIAL.de.pdf`.

## Quick start

Make the launcher executable once:

```sh
chmod +x claude-o-go
```

Run Claude Code interactively (with the OpenCode Go backend):

```sh
./claude-o-go
```

Run a single prompt:

```sh
./claude-o-go -p "Explain this repository in one paragraph."
```

Use a different OpenCode Go model:

```sh
OPENCODE_GO_MODEL=minimax-m3 ./claude-o-go
```

## How the harness and backend connect

1. `claude-o-go` reads your OpenCode Go key from `.env` (or `$OPENCODE_GO_API_KEY`).
2. It starts the local proxy at `http://127.0.0.1:4141`.
3. It sets `ANTHROPIC_BASE_URL` to that proxy, so Claude Code sends all requests there.
4. It starts `claude --bare --model sonnet`. `sonnet` is a model name Claude Code already accepts locally.
5. Claude Code (the harness) sends a `POST /v1/messages` request to the proxy.
6. The proxy rewrites `model` in the body from `sonnet` to the OpenCode Go model (e.g. `qwen3.7-plus`) and forwards it to `https://opencode.ai/zen/go/v1/messages`.
7. OpenCode Go (the backend) runs the model and returns the response.
8. The proxy streams the response back to Claude Code, which renders it in the CLI.

The proxy is needed because Claude Code validates Claude model names locally and rejects names like `qwen3.7-plus` before any request is sent. With the proxy, Claude Code keeps using `sonnet`, and the rewrite happens on the way out.

The proxy handles long streaming responses with Node stream backpressure and aborts the upstream request if Claude Code closes the local connection. That prevents transient client-side interruptions from taking down the proxy process.

By default the launcher adds `--bare`, which makes Claude Code use API-key auth directly and skip OAuth/keychain/background traffic. To run full Claude Code startup behavior anyway:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=0 ./claude-o-go
```

The launcher passes Claude Code's normal `sonnet` model alias, then the local proxy rewrites that request to `OPENCODE_GO_MODEL`. You can change the Claude Code-facing alias with `CLAUDE_CODE_MODEL_ALIAS`, but `sonnet` is the safest default because Claude Code already accepts it.

## Run `claude-o-go` From Anywhere

You don't need to copy this repo into every project. Install it once and call `claude-o-go` from any directory.

One-time setup (symlink into a directory on your `PATH`):

```sh
mkdir -p ~/.local/bin
ln -s /home/user/Desktop/opencode-go-w-claude/claude-o-go ~/.local/bin/claude-o-go
```

Make sure `~/.local/bin` is on your `PATH` (add `export PATH="$HOME/.local/bin:$PATH"` to your `~/.bashrc` / `~/.zshrc` if needed).

The launcher resolves its own symlink with `readlink -f`, so it always finds the `.env` and proxy next to the real install — no matter where you call it from.

Then from any project:

```sh
cd /path/to/any/project
claude-o-go
```

Optionally export the API key and model in your shell profile instead of keeping them in `.env` / the launcher:

```sh
export OPENCODE_GO_API_KEY="sk-..."
export OPENCODE_GO_MODEL="qwen3.7-plus"
```

The model is no longer hardcoded in `claude-o-go` — set it once in `~/.bashrc` / `~/.zshrc` and the launcher picks it up. You can still override it per-invocation with `OPENCODE_GO_MODEL=minimax-m3 claude-o-go`.

## Direct API Example (no harness)

To test the backend without the Claude Code harness, run the direct example:

```sh
npm start
```

That runs `node opencode-go-claude-example.mjs`, which calls the OpenCode Go `/messages` endpoint directly. Useful for verifying your key and model work.

The `.env` file in this directory already contains the OpenCode Go API key as a bare token. The example also supports this named format:

```sh
OPENCODE_GO_API_KEY=sk-...
```

Use a different Claude-compatible OpenCode Go model:

```sh
OPENCODE_GO_MODEL=minimax-m3 npm start
```

## Local Checks

Run the syntax checks before pushing changes:

```sh
npm run check
```

This checks both the direct API example and the local Claude proxy.

## Available OpenCode Go models

OpenCode Go routes to each vendor's own API. The model `id` you pass to `OPENCODE_GO_MODEL` is what OpenCode Go expects; the upstream provider is shown for context:

| Model `id` | Upstream provider | Works with Claude Code harness? |
|---|---|---|
| `qwen3.7-plus` | Alibaba (Qwen) | ✅ Yes |
| `qwen3.7-max` | Alibaba (Qwen) | ✅ Likely (same shim as qwen3.7-plus) |
| `qwen3.6-plus` | Alibaba (Qwen) | ✅ Likely |
| `qwen3.5-plus` | Alibaba (Qwen) | ✅ Likely |
| `minimax-m3` | MiniMax | ✅ Yes |
| `minimax-m2.7` | MiniMax | ✅ Likely |
| `minimax-m2.5` | MiniMax | ✅ Likely |
| `glm-5.2` | Z.ai (Zhipu AI) | ❌ No — `Invalid API parameter` on Claude Code's tool payload |
| `glm-5.1` | Z.ai (Zhipu AI) | ❌ No — same as glm-5.2 |
| `glm-5` | Z.ai (Zhipu AI) | ❌ Likely no |
| `kimi-k2.7-code` | Moonshot AI | ❌ No — rejects Claude Code's tool `function name` format |
| `kimi-k2.6` | Moonshot AI | ❌ Likely no |
| `kimi-k2.5` | Moonshot AI | ❌ Likely no |
| `deepseek-v4-pro` | DeepSeek | ❌ No — rejects `tools[0].function` (expects OpenAI tool shape) |
| `deepseek-v4-flash` | DeepSeek | ❌ Likely no |
| `mimo-v2-pro` | Xiaomi (MiMo) | ⚠️ Unknown — test before relying on it |
| `mimo-v2-omni` | Xiaomi (MiMo) | ⚠️ Unknown |
| `mimo-v2.5-pro` | Xiaomi (MiMo) | ⚠️ Unknown |
| `mimo-v2.5` | Xiaomi (MiMo) | ⚠️ Unknown |
| `hy3-preview` | (preview model) | ⚠️ Unknown |

**Why some don't work with the Claude Code harness:** Claude Code sends an Anthropic-style request including tools (`tools: [{name, description, input_schema}]`), `cache_control`, `tool_choice`, and `anthropic-beta` headers. Qwen's and MiniMax's Anthropic-compatible shims accept that full payload. DeepSeek's and Moonshot's shims expect the OpenAI tool shape instead, and Z.ai's newer endpoint rejects some of Claude Code's extra parameters. The failing models still work against the raw `/messages` endpoint for plain text — it is specifically Claude Code's tool-calling schema that the upstream shims don't fully translate yet.

**Practical recommendation:** set your shell profile to a known-working model:

```sh
export OPENCODE_GO_MODEL="qwen3.7-plus"   # or minimax-m3
```

The model is no longer hardcoded in `claude-o-go` — set it in your shell profile (e.g. `export OPENCODE_GO_MODEL=qwen3.7-plus` in `~/.bashrc`). Override per-invocation with `OPENCODE_GO_MODEL=minimax-m3 claude-o-go`.
