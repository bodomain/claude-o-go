import { readFileSync } from "node:fs"

const endpoint = "https://opencode.ai/zen/go/v1/messages"
const model = process.env.OPENCODE_GO_MODEL || "qwen3.7-plus"

function readOpenCodeGoApiKey() {
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY

  const env = readFileSync(".env", "utf8")

  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const equals = trimmed.indexOf("=")
    if (equals === -1) return trimmed

    const name = trimmed.slice(0, equals).trim()
    const value = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "")
    if (name === "OPENCODE_GO_API_KEY") return value
  }

  throw new Error("Missing OpenCode Go API key. Put it in .env or OPENCODE_GO_API_KEY.")
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": readOpenCodeGoApiKey(),
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: "Write a tiny Go function that reverses a string, then explain it briefly.",
      },
    ],
  }),
})

const json = await response.json()

if (!response.ok) {
  console.error(JSON.stringify(json, null, 2))
  process.exit(1)
}

const text = json.content
  ?.filter((part) => part.type === "text")
  .map((part) => part.text)
  .join("\n")

console.log(text || JSON.stringify(json, null, 2))
