# claude-o-go

Run the **Claude Code harness** with an **OpenCode Go backend**.

This lets you keep the Claude Code CLI experience — the terminal UI, tools, prompt handling, file edits, and agent workflow — while the actual model responses come from OpenCode Go instead of Anthropic's Claude API.

## What is the harness, what is the backend

- **Claude Code** is the *harness*: the CLI, the REPL, tool calling, file editing, permissions, and the agent loop. It expects to talk to an Anthropic-compatible `/v1/messages` endpoint.
- **OpenCode Go** is the *backend*: the actual model that generates responses. OpenCode Go does not provide Claude models. It provides open coding models (e.g. `qwen3.7-plus`, `minimax-m3`), exposed through a Claude-compatible `/messages` API.

`claude-o-go` glues the two together: it points Claude Code at a small local proxy, and the proxy forwards each request to OpenCode Go with the model name rewritten. Claude Code keeps thinking it is talking to `sonnet`; OpenCode Go actually answers.

## What is in this directory

- `claude-o-go` — the launcher. Starts the local proxy, sets `ANTHROPIC_BASE_URL`, and runs `claude`. This is what you run instead of `claude`.
- `opencode-go-claude-proxy.mjs` — the local proxy that rewrites the model name and forwards requests to OpenCode Go.
- `opencode-go-claude-example.mjs` — a direct API example that calls the same `/messages` endpoint without Claude Code.
- `.env` — your OpenCode Go API key.

For a full walkthrough, read `TUTORIAL.md`. Eine deutsche Version gibt es in `TUTORIAL.de.md`.

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
8. The proxy passes the response back to Claude Code, which renders it in the CLI.

The proxy is needed because Claude Code validates Claude model names locally and rejects names like `qwen3.7-plus` before any request is sent. With the proxy, Claude Code keeps using `sonnet`, and the rewrite happens on the way out.

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

Optionally export the API key in your shell profile instead of keeping it in `.env`:

```sh
export OPENCODE_GO_API_KEY="sk-..."
```

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

## Available OpenCode Go models

Models documented for the Claude-style endpoint include:

- `minimax-m3`
- `minimax-m2.7`
- `minimax-m2.5`
- `qwen3.7-max`
- `qwen3.7-plus`
- `qwen3.6-plus`

The default is `qwen3.7-plus`. Override it with `OPENCODE_GO_MODEL`.
