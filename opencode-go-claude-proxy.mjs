import http from "node:http"
import { once } from "node:events"

const apiKey = process.env.OPENCODE_GO_API_KEY
const model = process.env.OPENCODE_GO_MODEL || "qwen3.7-plus"
const upstream = process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1"
const port = Number(process.env.OPENCODE_GO_PROXY_PORT || 4141)
const upstreamRetries = Number(process.env.OPENCODE_GO_UPSTREAM_RETRIES || 2)
const proxyLog = process.env.OPENCODE_GO_PROXY_LOG === "1"

if (!apiKey) {
  console.error("OPENCODE_GO_API_KEY is required.")
  process.exit(1)
}

function log(message) {
  if (proxyLog) console.error(message)
}

function logError(message) {
  console.error(message)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })
}

function sendJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function errorMessage(error) {
  const cause = error.cause ? ` (${error.cause.code || error.cause.message})` : ""
  return `${error.message}${cause}`
}

function isRetryableUpstreamError(error) {
  const code = error.cause?.code || error.code
  return error.name !== "AbortError" && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_SOCKET"].includes(code)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeChunk(response, chunk) {
  if (response.destroyed || response.writableEnded) return false
  if (response.write(chunk)) return true

  await Promise.race([
    once(response, "drain"),
    once(response, "close"),
    once(response, "error"),
  ])

  return !response.destroyed && !response.writableEnded
}

async function writeStreamError(response, error) {
  if (response.destroyed || response.writableEnded) return

  const payload = JSON.stringify({
    type: "error",
    error: {
      type: "api_error",
      message: `OpenCode Go upstream stream ended unexpectedly: ${errorMessage(error)}`,
    },
  })

  await writeChunk(response, `event: error\ndata: ${payload}\n\n`)
  if (!response.writableEnded) response.end()
}

async function fetchUpstream(url, options) {
  let lastError

  for (let attempt = 1; attempt <= upstreamRetries + 1; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error

      if (options.signal.aborted || !isRetryableUpstreamError(error) || attempt > upstreamRetries) {
        throw error
      }

      const delayMs = 500 * attempt
      logError(`upstream fetch failed (${errorMessage(error)}), retrying in ${delayMs}ms (${attempt}/${upstreamRetries})`)
      await sleep(delayMs)
    }
  }

  throw lastError
}

async function proxyMessages(request, response, suffix) {
  const rawBody = await readBody(request)
  let body

  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return sendJson(response, 400, { error: { message: "Invalid JSON request body." } })
  }

  body.model = model
  const abortController = new AbortController()
  response.on("close", () => {
    if (!response.writableEnded) abortController.abort()
  })

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": request.headers["anthropic-version"] || "2023-06-01",
  }

  if (request.headers["anthropic-beta"]) {
    headers["anthropic-beta"] = request.headers["anthropic-beta"]
  }

  const upstreamResponse = await fetchUpstream(`${upstream}${suffix}`, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    signal: abortController.signal,
  })

  log(`${request.method} ${suffix} -> ${upstreamResponse.status} as ${model}`)

  response.writeHead(upstreamResponse.status, {
    "content-type": upstreamResponse.headers.get("content-type") || "application/json",
  })

  if (upstreamResponse.body) {
    try {
      for await (const chunk of upstreamResponse.body) {
        const stillConnected = await writeChunk(response, chunk)
        if (!stillConnected) {
          abortController.abort()
          return
        }
      }
    } catch (error) {
      if (abortController.signal.aborted || response.destroyed) return
      logError(`upstream stream failed: ${errorMessage(error)}`)
      await writeStreamError(response, error)
      return
    }
  }

  if (!response.writableEnded) response.end()
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`)
    log(`${request.method} ${url.pathname}`)

    if (request.method === "HEAD" && url.pathname === "/v1") {
      response.writeHead(200)
      return response.end()
    }

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
      return sendJson(response, 200, { ok: true, model })
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      return sendJson(response, 200, {
        data: [{ id: "claude-sonnet-4-6", type: "model", display_name: `OpenCode Go ${model}` }],
      })
    }

    if (request.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
      return sendJson(response, 200, { input_tokens: 1 })
    }

    if (request.method === "POST" && url.pathname === "/v1/messages") {
      await proxyMessages(request, response, "/messages")
      return
    }

    sendJson(response, 404, { error: { message: `Unsupported path: ${url.pathname}` } })
  } catch (error) {
    if (response.headersSent) {
      if (!response.destroyed) response.destroy(error)
      return
    }

    const status = error.name === "AbortError" ? 499 : 502
    sendJson(response, status, { error: { message: errorMessage(error) } })
  }
})

server.on("clientError", (error, socket) => {
  logError(`client error: ${error.message}`)
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
})

server.listen(port, "127.0.0.1", () => {
  log(`OpenCode Go Claude proxy listening on http://127.0.0.1:${port}/v1 -> ${model}`)
})
