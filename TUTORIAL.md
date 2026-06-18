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

The launcher resolves its own symlink with `readlink -f`, so it can find the real install directory (`/home/user/Desktop/opencode-go-w-claude`). That is where `.env` (your API key) and `opencode-go-claude-proxy.mjs` (the proxy) live. Claude Code itself starts back in the directory where you ran `claude-o-go`, so the current project remains the working directory.

### Optional: export the API key and model in your shell profile

If you would rather not keep the key in `.env`, you can export it once in `~/.bashrc` / `~/.zshrc`:

```sh
export OPENCODE_GO_API_KEY="sk-..."
export OPENCODE_GO_MODEL="qwen3.7-plus"
```

The launcher picks up `OPENCODE_GO_API_KEY` from the environment and skips reading `.env`. The model is no longer hardcoded in `claude-o-go` — define it here in your shell profile so it applies everywhere.

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

OpenCode Go is a **routing and billing layer, not a model host**. One subscription gives you a single Anthropic-compatible endpoint, but each request is routed to the model vendor's own API: Qwen models run on Alibaba's API, MiniMax on MiniMax's API, Kimi on Moonshot AI's API, DeepSeek on DeepSeek's API, GLM on Z.ai's API (Zhipu AI). You pay OpenCode; OpenCode pays the upstream providers. Think of it like OpenRouter — aggregation, not hosting.

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

## Theory Excursion: Localhost, Ports, and Processes

Networking starts with a simple address: where should a client connect?

- `127.0.0.1` means localhost. It points back to the same machine.
- A port selects one listening process on that machine. In this project the default proxy port is `4141`.
- A server binds to an address and port. The proxy binds to `127.0.0.1:4141`.
- A client connects to that address and port. Claude Code connects to `http://127.0.0.1:4141`.

In practice:

```text
Claude Code process
  connects to 127.0.0.1:4141

Node proxy process
  listens on 127.0.0.1:4141
  connects outward to opencode.ai:443
```

The proxy only listens on localhost, not on `0.0.0.0`. That matters: `127.0.0.1` is reachable only from your own machine, while `0.0.0.0` would expose the listener on all network interfaces.

Useful admin checks:

```sh
ss -ltnp | grep 4141
lsof -iTCP:4141 -sTCP:LISTEN
```

These commands answer: which process is listening on this port?

## Theory Excursion: HTTP Proxy vs Backend

Claude Code is the client. OpenCode Go is the upstream backend. The local Node script is a proxy.

A proxy receives a request from one side and sends a related request to another side. It can preserve most of the request, rewrite selected fields, and then relay the response.

In this project the proxy does three important things:

1. It accepts Claude Code's Anthropic-style request at `/v1/messages`.
2. It rewrites `body.model` from Claude's local alias to the OpenCode Go model.
3. It forwards the request to OpenCode Go and streams the response back.

That is why the proxy is not a model host. It does not generate tokens. It is glue code between two APIs that are almost, but not perfectly, compatible.

## Model Compatibility With the Claude Code Harness

Because each upstream vendor implements its own Anthropic-compatible endpoint, maturity varies. Claude Code sends a full Anthropic-style payload — tools (`tools: [{name, description, input_schema}]`), `cache_control`, `tool_choice`, `anthropic-beta` headers. Some vendors' shims accept that; others expect the OpenAI tool shape or reject extra parameters.

Tested through the full `claude-o-go` flow:

| Model `id` | Upstream provider | Works with Claude Code harness? |
|---|---|---|
| `qwen3.7-plus` | Alibaba (Qwen) | ✅ Yes |
| `minimax-m3` | MiniMax | ✅ Yes |
| `glm-5.2` | Z.ai (Zhipu AI) | ❌ No — `Invalid API parameter` |
| `glm-5.1` | Z.ai (Zhipu AI) | ❌ No — same as glm-5.2 |
| `kimi-k2.7-code` | Moonshot AI | ❌ No — rejects tool `function name` format |
| `deepseek-v4-pro` | DeepSeek | ❌ No — rejects `tools[0].function` (expects OpenAI tool shape) |

Models from the same vendor generally behave the same as the tested one. Unverified models (`mimo-*`, `hy3-preview`, older Qwen/MiniMax/Kimi/DeepSeek versions) — test before relying on them.

The failing models still work against the raw `/messages` endpoint for plain text (see `npm start`). It is specifically Claude Code's tool-calling schema that the upstream shims don't fully translate yet.

**Practical recommendation:** set your shell profile to a known-working model:

```sh
export OPENCODE_GO_MODEL="qwen3.7-plus"   # or minimax-m3
```

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

## Theory Excursion: Streaming, SSE, and Backpressure

LLM responses are usually streamed. The backend does not wait until the whole answer is complete; it sends small chunks as they become available.

The common web pattern for this is SSE: Server-Sent Events. An SSE stream is still HTTP, but the response body stays open and sends events over time:

```text
data: {"type":"content_block_delta","text":"hello"}

data: {"type":"content_block_delta","text":" world"}

data: [DONE]
```

Backpressure means the receiver cannot always consume data as fast as the sender writes it. In Node, `response.write(chunk)` returns `false` when the outgoing buffer is full. Correct proxy code waits for `drain` before continuing. That prevents memory growth and unstable long-running streams.

In this project:

- Claude Code reads from the local proxy.
- The proxy reads from OpenCode Go.
- The proxy writes chunks to Claude Code while respecting Node stream backpressure.
- If Claude Code closes the local connection, the proxy aborts the upstream request.

This is why stream handling is more delicate than a simple JSON request. A normal request has one response body. A stream is an ongoing conversation between sockets.

## Theory Excursion: Common Network Errors

These error names are useful admin vocabulary:

| Error | Meaning | Typical cause in this project |
|---|---|---|
| `ECONNREFUSED` | Nothing accepted the connection | Wrong port, proxy not running, upstream unreachable |
| `ECONNRESET` | The other side reset an existing connection | Upstream closed the socket mid-stream |
| `UND_ERR_SOCKET` | Node's Undici HTTP client saw a socket failure | Usually the same class as a reset or broken stream |
| `ETIMEDOUT` | Connection or response took too long | Network path or backend too slow |
| `AbortError` | We intentionally aborted the request | Claude Code closed the local connection |

The practical rule: retry before response headers are sent; after streaming has started, finish the stream cleanly with an error event. Once headers and partial content have been sent, the proxy cannot turn the response into a normal JSON `502`.

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

Defaults / required env:

- `OPENCODE_GO_MODEL` — **required**, no hardcoded default. Set it in `~/.bashrc` / `~/.zshrc` (e.g. `export OPENCODE_GO_MODEL=qwen3.7-plus`). Can be overridden per-invocation.
- `OPENCODE_GO_PROXY_PORT=4141`
- `OPENCODE_GO_UPSTREAM_RETRIES=2`
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

For generation requests, the proxy streams OpenCode Go's response back to Claude Code. It handles Node stream backpressure, aborts the upstream request if Claude Code closes the local connection, retries retryable upstream connection failures before response headers are sent, and turns mid-stream upstream resets into a clean streaming error event instead of crashing the proxy process.

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

## Local Checks

Before pushing changes, run:

```sh
npm run check
```

That syntax-checks both `opencode-go-claude-example.mjs` and `opencode-go-claude-proxy.mjs`.

## How to Verify You Are Using OpenCode Go

Run:

```sh
OPENCODE_GO_PROXY_LOG=1 ./claude-o-go -p "Reply with exactly: OK"
```

Proxy request logs are hidden during normal use so Claude Code's TUI stays clean. With `OPENCODE_GO_PROXY_LOG=1`, look for lines like:

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

Claude Code itself may still display `sonnet`. That is expected. `sonnet` is the Claude Code-facing alias. When debug logging is enabled, the proxy log shows the actual upstream OpenCode Go model.

## Changing the OpenCode Go Model

The model is set in your shell profile (`~/.bashrc` / `~/.zshrc`):

```sh
export OPENCODE_GO_MODEL=qwen3.7-plus
```

To use a different model for a single run, override it inline:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go
```

Verify it with:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go -p "Reply with exactly: OK"
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

### Proxy Logs Show Up in Claude Code's TUI

Routine request logs are hidden by default. For debugging:

```sh
OPENCODE_GO_PROXY_LOG=1 claude-o-go
```

In normal use, leave that unset so the TUI stays clean.

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
