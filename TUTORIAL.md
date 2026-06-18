# Using Claude Code With OpenCode Go as the Backend

This tutorial explains the setup in this directory and why it works.

The goal is to use the Claude Code CLI experience, but send model requests to OpenCode Go instead of Anthropic's Claude API.

## What You Have

This directory contains:

- `.env`: your OpenCode Go API key
- `claude-o-go`: the launcher script you run instead of `claude`
- `opencode-go-claude-proxy.mjs`: a tiny local proxy between Claude Code and OpenCode Go
- `opencode-go-claude-example.mjs`: a direct API example that calls OpenCode Go without Claude Code

The normal command is:

```sh
cd /home/user/Desktop/opencode-go-w-claude
./claude-o-go
```

For a one-shot prompt:

```sh
./claude-o-go -p "Reply with exactly: OK"
```

## Run `claude-o-go` From Anywhere

You do not need to `cd` into this directory every time, and you do not need to copy this repo into each new project. Install it once and use `claude-o-go` from any project directory.

### One-time setup

Make the launcher executable (if it isn't already):

```sh
chmod +x /home/user/Desktop/opencode-go-w-claude/claude-o-go
```

Create a symlink in a directory that is already on your `PATH` (for example `~/.local/bin`):

```sh
mkdir -p ~/.local/bin
ln -s /home/user/Desktop/opencode-go-w-claude/claude-o-go ~/.local/bin/claude-o-go
```

Make sure `~/.local/bin` is on your `PATH`. Add this to `~/.bashrc` or `~/.zshrc` if needed:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Then reload your shell:

```sh
source ~/.bashrc   # or: source ~/.zshrc
```

### Why this works

The launcher resolves its own symlink with `readlink -f`, so it always `cd`s into the real install directory (`/home/user/Desktop/opencode-go-w-claude`). That is where `.env` (your API key) and `opencode-go-claude-proxy.mjs` (the proxy) live. So the launcher works no matter which directory you call it from.

### Optional: export the API key in your shell profile

If you would rather not keep the key in `.env`, you can export it once in `~/.bashrc` / `~/.zshrc`:

```sh
export OPENCODE_GO_API_KEY="sk-..."
```

The launcher picks up `OPENCODE_GO_API_KEY` from the environment and skips reading `.env`.

### Daily usage

From any project directory:

```sh
cd /path/to/any/project
claude-o-go
```

Or as a one-shot:

```sh
claude-o-go -p "Explain this repository in one paragraph."
```

Switch models:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go
```

### Updating

To update, just `git pull` (or replace the files) inside `/home/user/Desktop/opencode-go-w-claude`. The symlink keeps pointing at the launcher, so nothing else needs to change.

## Why a Proxy Is Needed

OpenCode Go exposes several models through an Anthropic-compatible Messages API.

For example, OpenCode Go accepts models like:

```text
qwen3.7-plus
minimax-m3
qwen3.7-max
```

Claude Code, however, validates model names locally before sending requests. If you try to run Claude Code directly with an OpenCode Go model:

```sh
ANTHROPIC_BASE_URL=https://opencode.ai/zen/go/v1 \
ANTHROPIC_API_KEY=... \
claude --model qwen3.7-plus
```

Claude Code rejects it before the request is useful, because `qwen3.7-plus` is not one of Claude Code's known Claude model names.

The proxy solves this by letting Claude Code think it is using a normal Claude alias such as `sonnet`, while the proxy rewrites the outgoing request to use an OpenCode Go model.

## Request Flow

When you run:

```sh
./claude-o-go -p "Reply with exactly: OK"
```

this happens:

1. `claude-o-go` reads the OpenCode Go API key from `.env`.
2. It starts the local proxy:

   ```text
   http://127.0.0.1:4141
   ```

3. It sets Claude Code's API base URL:

   ```sh
   ANTHROPIC_BASE_URL=http://127.0.0.1:4141
   ```

4. It starts Claude Code with the accepted local alias:

   ```sh
   claude --bare --model sonnet
   ```

5. Claude Code sends a request to:

   ```text
   http://127.0.0.1:4141/v1/messages
   ```

6. The proxy changes the request body model from Claude's model name to the OpenCode Go model:

   ```json
   {
     "model": "qwen3.7-plus"
   }
   ```

7. The proxy forwards the request to:

   ```text
   https://opencode.ai/zen/go/v1/messages
   ```

8. OpenCode Go returns the model response.
9. The proxy sends that response back to Claude Code.

So Claude Code still provides the CLI, tools, prompt handling, and workflow, but OpenCode Go provides the model response.

## Important Files

### `claude-o-go`

This is the launcher.

It does four important things:

```sh
export OPENCODE_GO_API_KEY="$api_key"
export OPENCODE_GO_MODEL="$model"
export ANTHROPIC_BASE_URL="http://127.0.0.1:${proxy_port}"
claude --bare --model "$claude_model_alias" "$@"
```

By default:

- `OPENCODE_GO_MODEL=qwen3.7-plus`
- `OPENCODE_GO_PROXY_PORT=4141`
- `CLAUDE_CODE_MODEL_ALIAS=sonnet`
- `CLAUDE_CODE_OPENCODE_GO_BARE=1`

`--bare` is useful here because it tells Claude Code to use direct API-key auth and skip unrelated OAuth/keychain/background startup behavior.

### `opencode-go-claude-proxy.mjs`

This is the local proxy.

Its main job is in this line:

```js
body.model = model
```

That replaces Claude Code's model with the OpenCode Go model before forwarding the request.

It also implements a few small endpoints Claude Code probes, such as:

```text
HEAD /
HEAD /v1
GET /v1/models
POST /v1/messages/count_tokens
POST /v1/messages
```

The real generation request is:

```text
POST /v1/messages
```

## How to Verify You Are Using OpenCode Go

Run:

```sh
./claude-o-go -p "Reply with exactly: OK"
```

Look for proxy log lines like:

```text
OpenCode Go Claude proxy listening on http://127.0.0.1:4141/v1 -> qwen3.7-plus
POST /v1/messages
POST /messages -> 200 as qwen3.7-plus
OK
```

The key line is:

```text
POST /messages -> 200 as qwen3.7-plus
```

That means:

- Claude Code sent a request to the local proxy.
- The proxy forwarded it to OpenCode Go.
- OpenCode Go returned HTTP `200`.
- The upstream model was `qwen3.7-plus`.

Claude Code itself may still display `sonnet`. That is expected. `sonnet` is the Claude Code-facing alias. The proxy log shows the actual upstream OpenCode Go model.

## Changing the OpenCode Go Model

Use `OPENCODE_GO_MODEL`:

```sh
OPENCODE_GO_MODEL=minimax-m3 ./claude-o-go
```

Verify it with:

```sh
OPENCODE_GO_MODEL=minimax-m3 ./claude-o-go -p "Reply with exactly: OK"
```

Expected proxy log:

```text
POST /messages -> 200 as minimax-m3
```

## Changing the Local Proxy Port

If port `4141` is already in use:

```sh
OPENCODE_GO_PROXY_PORT=4142 ./claude-o-go
```

The launcher will set:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:4142
```

## Disabling Bare Mode

Bare mode is the default:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=1
```

To run Claude Code with its fuller startup behavior:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=0 ./claude-o-go
```

For this backend experiment, bare mode is usually better.

## Direct API Test Without Claude Code

You can also call OpenCode Go directly:

```sh
npm start
```

That runs:

```sh
node opencode-go-claude-example.mjs
```

This bypasses Claude Code entirely and proves that your OpenCode Go key and model work against the Anthropic-compatible endpoint.

## Common Problems

### `There's an issue with the selected model`

If you see this with a raw OpenCode Go model like `qwen3.7-plus`, Claude Code is validating the model locally.

Use the launcher:

```sh
./claude-o-go
```

Do not call `claude --model qwen3.7-plus` directly.

### Double `/v1/v1/messages`

`ANTHROPIC_BASE_URL` should point to the proxy root:

```sh
http://127.0.0.1:4141
```

It should not include `/v1`, because Claude Code appends `/v1/messages` itself.

### Claude Code Shows `sonnet`

That is expected.

Claude Code sees:

```text
sonnet
```

OpenCode Go receives:

```text
qwen3.7-plus
```

The proxy log is the source of truth.

## Mental Model

Think of the setup like this:

```text
Claude Code CLI
  thinks model = sonnet
  sends Anthropic request
        |
        v
Local proxy
  rewrites model = qwen3.7-plus
  forwards request
        |
        v
OpenCode Go
  runs the actual model
  returns response
        |
        v
Claude Code CLI
  displays the answer
```

The Claude Code user experience stays the same, but the model backend is OpenCode Go.
