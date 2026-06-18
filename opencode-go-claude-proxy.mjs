import http from "node:http"

const apiKey = process.env.OPENCODE_GO_API_KEY
const model = process.env.OPENCODE_GO_MODEL || "qwen3.7-plus"
const upstream = process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1"
const port = Number(process.env.OPENCODE_GO_PROXY_PORT || 4141)

if (!apiKey) {
  console.error("OPENCODE_GO_API_KEY is required.")
  process.exit(1)
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
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

async function proxyMessages(request, response, suffix) {
  const rawBody = await readBody(request)
  const body = rawBody ? JSON.parse(rawBody) : {}
  body.model = model

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": request.headers["anthropic-version"] || "2023-06-01",
  }

  if (request.headers["anthropic-beta"]) {
    headers["anthropic-beta"] = request.headers["anthropic-beta"]
  }

  const upstreamResponse = await fetch(`${upstream}${suffix}`, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  })

  console.error(`${request.method} ${suffix} -> ${upstreamResponse.status} as ${model}`)

  response.writeHead(upstreamResponse.status, {
    "content-type": upstreamResponse.headers.get("content-type") || "application/json",
  })

  if (upstreamResponse.body) {
    for await (const chunk of upstreamResponse.body) response.write(chunk)
  }
  response.end()
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`)
    console.error(`${request.method} ${url.pathname}`)

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
      return proxyMessages(request, response, "/messages")
    }

    sendJson(response, 404, { error: { message: `Unsupported path: ${url.pathname}` } })
  } catch (error) {
    sendJson(response, 500, { error: { message: error.message } })
  }
})

server.listen(port, "127.0.0.1", () => {
  console.error(`OpenCode Go Claude proxy listening on http://127.0.0.1:${port}/v1 -> ${model}`)
})
