# Claude Code mit OpenCode Go als Backend verwenden

Dieses Tutorial erklaert den Aufbau in diesem Verzeichnis und warum er funktioniert.

Das Ziel ist: Du nutzt weiterhin die Claude Code CLI, aber die Modellanfragen gehen an OpenCode Go statt an die Anthropic Claude API.

## Was hier vorhanden ist

Dieses Verzeichnis enthaelt:

- `.env`: dein OpenCode Go API Key
- `claude-o-go`: das Launcher-Skript, das du statt `claude` startest
- `opencode-go-claude-proxy.mjs`: ein kleiner lokaler Proxy zwischen Claude Code und OpenCode Go
- `opencode-go-claude-example.mjs`: ein direktes API-Beispiel, das OpenCode Go ohne Claude Code aufruft

Der normale Startbefehl ist:

```sh
cd /home/user/Desktop/opencode-go-w-claude
./claude-o-go
```

Fuer einen einzelnen Prompt:

```sh
./claude-o-go -p "Reply with exactly: OK"
```

## `claude-o-go` von ueberall starten

Du musst nicht jedes Mal in dieses Verzeichnis `cd`-en, und du musst dieses Repo auch nicht in jedes neue Projekt kopieren. Installiere es einmal und nutze `claude-o-go` aus jedem Projektverzeichnis heraus.

### Einmalige Einrichtung

Mache den Launcher ausfuehrbar (falls noch nicht geschehen):

```sh
chmod +x /home/user/Desktop/opencode-go-w-claude/claude-o-go
```

Erzeuge einen Symlink in einem Verzeichnis, das bereits auf deinem `PATH` liegt (zum Beispiel `~/.local/bin`):

```sh
mkdir -p ~/.local/bin
ln -s /home/user/Desktop/opencode-go-w-claude/claude-o-go ~/.local/bin/claude-o-go
```

Stelle sicher, dass `~/.local/bin` auf deinem `PATH` liegt. Fuege dies zu `~/.bashrc` oder `~/.zshrc` hinzu, falls noetig:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Dann lade die Shell neu:

```sh
source ~/.bashrc   # bzw.: source ~/.zshrc
```

`ln -s` erzeugt einen symbolischen Link (Symlink), also einen Verweis auf die Originaldatei. Das `s` steht fuer "symbolic".

### Warum das funktioniert

Der Launcher loest seinen eigenen Symlink mit `readlink -f` auf und findet dadurch das echte Installationsverzeichnis (`/home/user/Desktop/opencode-go-w-claude`). Dort liegen `.env` (dein API-Key) und `opencode-go-claude-proxy.mjs` (der Proxy). Claude Code selbst startet wieder in dem Verzeichnis, aus dem du `claude-o-go` aufgerufen hast, sodass dein aktuelles Projekt das Arbeitsverzeichnis bleibt.

### Optional: API-Key und Modell in der Shell-Profile exportieren

Wenn du den Key nicht in `.env` liegen haben willst, kannst du ihn einmal in `~/.bashrc` / `~/.zshrc` exportieren:

```sh
export OPENCODE_GO_API_KEY="sk-..."
export OPENCODE_GO_MODEL="qwen3.7-plus"
```

Der Launcher nimmt `OPENCODE_GO_API_KEY` aus der Umgebung und ueberspringt das Lesen von `.env`. Das Modell ist nicht mehr in `claude-o-go` fest codiert — definiere es hier in deiner Shell-Profile, damit es ueberall gilt.

### Taegliche Nutzung

Aus jedem Projektverzeichnis:

```sh
cd /pfad/zu/einem/projekt
claude-o-go
```

Oder als einzelnen Prompt:

```sh
claude-o-go -p "Explain this repository in one paragraph."
```

Modell wechseln:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go
```

### Updates

Um zu aktualisieren, mache einfach ein `git pull` (oder ersetze die Dateien) in `/home/user/Desktop/opencode-go-w-claude`. Der Symlink zeigt weiterhin auf den Launcher, sonst muss nichts geaendert werden.

## Warum ein Proxy noetig ist

OpenCode Go stellt mehrere Modelle ueber eine Anthropic-kompatible Messages API bereit.

OpenCode Go ist eine **Routing- und Abrechnungsschicht, kein Modell-Host**. Ein Abonnement gibt dir einen einzigen Anthropic-kompatiblen Endpoint, aber jede Anfrage wird an die API des jeweiligen Modell-Anbieters weitergeleitet: Qwen-Modelle laufen auf Alibabas API, MiniMax auf MiniMax' API, Kimi auf Moonshot AIs API, DeepSeek auf DeepSeeks API, GLM auf Z.ais API (Zhipu AI). Du zahlst an OpenCode; OpenCode zahlt an die Upstream-Anbieter. Stell es dir wie OpenRouter vor — Aggregation, kein Hosting.

OpenCode Go akzeptiert zum Beispiel Modelle wie:

```text
qwen3.7-plus
minimax-m3
qwen3.7-max
```

Claude Code validiert Modellnamen aber lokal, bevor es Requests abschickt. Wenn du Claude Code direkt mit einem OpenCode Go Modell startest:

```sh
ANTHROPIC_BASE_URL=https://opencode.ai/zen/go/v1 \
ANTHROPIC_API_KEY=... \
claude --model qwen3.7-plus
```

dann lehnt Claude Code den Aufruf ab, bevor der Request sinnvoll beim Backend ankommt. Der Grund: `qwen3.7-plus` ist kein Claude-Modellname, den Claude Code kennt.

Der Proxy loest das Problem, indem Claude Code lokal weiterhin glaubt, ein normales Claude-Alias wie `sonnet` zu verwenden. Der Proxy schreibt den ausgehenden Request dann so um, dass tatsaechlich ein OpenCode Go Modell verwendet wird.

## Exkurs: Localhost, Ports und Prozesse

Networking beginnt mit einer einfachen Frage: wohin soll ein Client verbinden?

- `127.0.0.1` bedeutet localhost. Die Adresse zeigt auf dieselbe Maschine.
- Ein Port waehlt einen konkreten lauschenden Prozess auf dieser Maschine aus. In diesem Projekt ist der Standard-Port `4141`.
- Ein Server bindet sich an Adresse und Port. Der Proxy bindet sich an `127.0.0.1:4141`.
- Ein Client verbindet sich zu dieser Adresse und diesem Port. Claude Code verbindet sich zu `http://127.0.0.1:4141`.

In der Praxis:

```text
Claude Code Prozess
  verbindet zu 127.0.0.1:4141

Node Proxy Prozess
  lauscht auf 127.0.0.1:4141
  verbindet nach aussen zu opencode.ai:443
```

Der Proxy lauscht nur auf localhost, nicht auf `0.0.0.0`. Das ist wichtig: `127.0.0.1` ist nur von deiner eigenen Maschine erreichbar. `0.0.0.0` wuerde den Listener auf allen Netzwerkinterfaces anbieten.

Nuetzliche Admin-Checks:

```sh
ss -ltnp | grep 4141
lsof -iTCP:4141 -sTCP:LISTEN
```

Diese Befehle beantworten: welcher Prozess lauscht auf diesem Port?

## Exkurs: HTTP-Proxy vs Backend

Claude Code ist der Client. OpenCode Go ist das Upstream-Backend. Das lokale Node-Skript ist ein Proxy.

Ein Proxy nimmt einen Request von einer Seite an und sendet einen verwandten Request an eine andere Seite. Er kann den groessten Teil des Requests unveraendert lassen, einzelne Felder umschreiben und danach die Antwort zurueckreichen.

In diesem Projekt macht der Proxy drei wichtige Dinge:

1. Er nimmt Claude Codes Anthropic-Request unter `/v1/messages` an.
2. Er schreibt `body.model` von Claudes lokalem Alias auf das OpenCode-Go-Modell um.
3. Er leitet den Request an OpenCode Go weiter und streamt die Antwort zurueck.

Deshalb ist der Proxy kein Modell-Host. Er erzeugt keine Tokens. Er ist Glue-Code zwischen zwei APIs, die fast, aber nicht perfekt, kompatibel sind.

## Modell-Kompatibilitaet mit dem Claude Code Harness

Weil jeder Upstream-Anbieter seinen eigenen Anthropic-kompatiblen Endpoint implementiert, variiert die Reife. Claude Code sendet einen vollen Anthropic-Payload — Tools (`tools: [{name, description, input_schema}]`), `cache_control`, `tool_choice`, `anthropic-beta`-Header. Manche Anbieter-Shims akzeptieren das; andere erwarten die OpenAI-Tool-Form oder lehnen zusaetzliche Parameter ab.

Getestet durch den vollen `claude-o-go`-Ablauf:

| Modell `id` | Upstream-Anbieter | Funktioniert mit Claude Code Harness? |
|---|---|---|
| `qwen3.7-plus` | Alibaba (Qwen) | ✅ Ja |
| `minimax-m3` | MiniMax | ✅ Ja |
| `glm-5.2` | Z.ai (Zhipu AI) | ❌ Nein — `Invalid API parameter` |
| `glm-5.1` | Z.ai (Zhipu AI) | ❌ Nein — wie glm-5.2 |
| `kimi-k2.7-code` | Moonshot AI | ❌ Nein — lehnt Tool-`function name`-Format ab |
| `deepseek-v4-pro` | DeepSeek | ❌ Nein — lehnt `tools[0].function` ab (erwartet OpenAI-Tool-Form) |

Modelle vom selben Anbieter verhalten sich meistens wie das getestete. Ungetestete Modelle (`mimo-*`, `hy3-preview`, aeltere Qwen/MiniMax/Kimi/DeepSeek-Versionen) — erst testen, bevor du dich darauf verlaesst.

Die fehlschlagenden Modelle funktionieren trotzdem gegen den rohen `/messages`-Endpoint fuer reinen Text (siehe `npm start`). Es ist spezifisch das Tool-Calling-Schema von Claude Code, das die Upstream-Shims noch nicht vollstaendig uebersetzen.

**Praktische Empfehlung:** setze in deiner Shell-Profile ein bekannt funktionierendes Modell:

```sh
export OPENCODE_GO_MODEL="qwen3.7-plus"   # oder minimax-m3
```

## Request-Ablauf

Wenn du Folgendes ausfuehrst:

```sh
./claude-o-go -p "Reply with exactly: OK"
```

passiert das:

1. `claude-o-go` liest den OpenCode Go API Key aus `.env`.
2. Das Skript startet den lokalen Proxy:

   ```text
   http://127.0.0.1:4141
   ```

3. Es setzt Claude Codes API Base URL:

   ```sh
   ANTHROPIC_BASE_URL=http://127.0.0.1:4141
   ```

4. Es startet Claude Code mit einem lokal akzeptierten Alias:

   ```sh
   claude --bare --model sonnet
   ```

5. Claude Code sendet einen Request an:

   ```text
   http://127.0.0.1:4141/v1/messages
   ```

6. Der Proxy aendert im Request Body das Modell von Claudes Modellname auf das OpenCode Go Modell:

   ```json
   {
     "model": "qwen3.7-plus"
   }
   ```

7. Der Proxy leitet den Request weiter an:

   ```text
   https://opencode.ai/zen/go/v1/messages
   ```

8. OpenCode Go gibt die Modellantwort zurueck.
9. Der Proxy gibt diese Antwort an Claude Code zurueck.

Claude Code liefert also weiterhin CLI, Tools, Prompt-Verarbeitung und Workflow. Die eigentliche Modellantwort kommt aber von OpenCode Go.

## Exkurs: Streaming, SSE und Backpressure

LLM-Antworten werden normalerweise gestreamt. Das Backend wartet nicht, bis die komplette Antwort fertig ist, sondern sendet kleine Chunks, sobald sie verfuegbar sind.

Ein haeufiges Web-Muster dafuer ist SSE: Server-Sent Events. Ein SSE-Stream ist weiterhin HTTP, aber der Response Body bleibt offen und sendet ueber Zeit Events:

```text
data: {"type":"content_block_delta","text":"hello"}

data: {"type":"content_block_delta","text":" world"}

data: [DONE]
```

Backpressure bedeutet, dass der Empfaenger Daten nicht immer so schnell verarbeiten kann, wie der Sender sie schreibt. In Node gibt `response.write(chunk)` `false` zurueck, wenn der Ausgabepuffer voll ist. Korrekte Proxy-Logik wartet dann auf `drain`, bevor sie weiterschreibt. Das verhindert Speicherwachstum und instabile lange Streams.

In diesem Projekt:

- Claude Code liest vom lokalen Proxy.
- Der Proxy liest von OpenCode Go.
- Der Proxy schreibt Chunks an Claude Code und beachtet dabei Node-Stream-Backpressure.
- Wenn Claude Code die lokale Verbindung schliesst, bricht der Proxy den Upstream-Request ab.

Darum ist Stream-Handling empfindlicher als ein einfacher JSON-Request. Ein normaler Request hat eine Antwort. Ein Stream ist ein laufendes Gespraech zwischen Sockets.

## Exkurs: Haeufige Netzwerkfehler

Diese Fehlernamen gehoeren zum praktischen Admin-Wortschatz:

| Fehler | Bedeutung | Typische Ursache in diesem Projekt |
|---|---|---|
| `ECONNREFUSED` | Niemand hat die Verbindung angenommen | Falscher Port, Proxy nicht gestartet, Upstream nicht erreichbar |
| `ECONNRESET` | Die Gegenseite hat eine bestehende Verbindung zurueckgesetzt | Upstream hat den Socket mitten im Stream geschlossen |
| `UND_ERR_SOCKET` | Nodes Undici-HTTP-Client sah einen Socket-Fehler | Meist dieselbe Klasse wie Reset oder kaputter Stream |
| `ETIMEDOUT` | Verbindung oder Antwort dauerte zu lange | Netzwerkpfad oder Backend zu langsam |
| `AbortError` | Wir haben den Request absichtlich abgebrochen | Claude Code hat die lokale Verbindung geschlossen |

Praktische Regel: Retry vor dem Senden der Response-Header; nach Streaming-Beginn den Stream sauber mit einem Error-Event beenden. Sobald Header und Teilinhalt gesendet wurden, kann der Proxy daraus keine normale JSON-`502`-Antwort mehr machen.

## Wichtige Dateien

### `claude-o-go`

Das ist der Launcher.

Er macht vier wichtige Dinge:

```sh
export OPENCODE_GO_API_KEY="$api_key"
export OPENCODE_GO_MODEL="$model"
export ANTHROPIC_BASE_URL="http://127.0.0.1:${proxy_port}"
claude --bare --model "$claude_model_alias" "$@"
```

Standardwerte / erforderliche Env:

- `OPENCODE_GO_MODEL` — **erforderlich**, kein fest codierter Default. Definiere es in `~/.bashrc` / `~/.zshrc` (z. B. `export OPENCODE_GO_MODEL=qwen3.7-plus`). Pro Aufruf ueberschreibbar.
- `OPENCODE_GO_PROXY_PORT=4141`
- `OPENCODE_GO_UPSTREAM_RETRIES=2`
- `CLAUDE_CODE_MODEL_ALIAS=sonnet`
- `CLAUDE_CODE_OPENCODE_GO_BARE=1`

`--bare` ist hier sinnvoll, weil Claude Code dann direkte API-Key-Authentifizierung nutzt und unnoetiges OAuth-, Keychain- und Hintergrundverhalten beim Start ueberspringt.

### `opencode-go-claude-proxy.mjs`

Das ist der lokale Proxy.

Seine wichtigste Aufgabe steckt in dieser Zeile:

```js
body.model = model
```

Dadurch wird Claude Codes Modellname durch das OpenCode Go Modell ersetzt, bevor der Request weitergeleitet wird.

Bei Generierungsrequests streamt der Proxy die Antwort von OpenCode Go zurueck an Claude Code. Er beachtet Node-Stream-Backpressure, bricht den Upstream-Request ab, wenn Claude Code die lokale Verbindung schliesst, wiederholt retrybare Upstream-Verbindungsfehler vor dem Senden der Response-Header und wandelt Upstream-Resets mitten im Stream in ein sauberes Streaming-Error-Event um, statt den Proxy-Prozess zu beenden.

Der Proxy implementiert ausserdem ein paar kleine Endpunkte, die Claude Code beim Start oder waehrend der Nutzung abfragt:

```text
HEAD /
HEAD /v1
GET /v1/models
POST /v1/messages/count_tokens
POST /v1/messages
```

Der eigentliche Generierungsrequest ist:

```text
POST /v1/messages
```

## Lokale Checks

Vor dem Push ausfuehren:

```sh
npm run check
```

Das prueft die Syntax von `opencode-go-claude-example.mjs` und `opencode-go-claude-proxy.mjs`.

## Pruefen, ob wirklich OpenCode Go verwendet wird

Starte:

```sh
OPENCODE_GO_PROXY_LOG=1 ./claude-o-go -p "Reply with exactly: OK"
```

Proxy-Request-Logs sind im normalen Betrieb ausgeblendet, damit Claude Codes TUI sauber bleibt. Mit `OPENCODE_GO_PROXY_LOG=1` achte auf Zeilen wie:

```text
OpenCode Go Claude proxy listening on http://127.0.0.1:4141/v1 -> qwen3.7-plus
POST /v1/messages
POST /messages -> 200 as qwen3.7-plus
OK
```

Die wichtigste Zeile ist:

```text
POST /messages -> 200 as qwen3.7-plus
```

Das bedeutet:

- Claude Code hat einen Request an den lokalen Proxy geschickt.
- Der Proxy hat ihn an OpenCode Go weitergeleitet.
- OpenCode Go hat HTTP `200` zurueckgegeben.
- Das tatsaechliche Upstream-Modell war `qwen3.7-plus`.

Claude Code selbst kann weiterhin `sonnet` anzeigen. Das ist erwartet. `sonnet` ist nur das Alias, das Claude Code lokal sieht. Wenn Debug-Logging aktiv ist, zeigt das Proxy-Log das echte OpenCode Go Upstream-Modell.

## OpenCode Go Modell wechseln

Das Modell steht in deiner Shell-Profile (`~/.bashrc` / `~/.zshrc`):

```sh
export OPENCODE_GO_MODEL=qwen3.7-plus
```

Fuer einen einzelnen Lauf kannst du es inline ueberschreiben:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go
```

Pruefe es mit:

```sh
OPENCODE_GO_MODEL=minimax-m3 claude-o-go -p "Reply with exactly: OK"
```

Erwartetes Proxy-Log:

```text
POST /messages -> 200 as minimax-m3
```

## Lokalen Proxy-Port wechseln

Wenn Port `4141` schon belegt ist:

```sh
OPENCODE_GO_PROXY_PORT=4142 ./claude-o-go
```

Der Launcher setzt dann:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:4142
```

## Bare Mode deaktivieren

Bare Mode ist standardmaessig aktiv:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=1
```

Wenn du Claude Code mit seinem vollstaendigeren Startverhalten ausfuehren willst:

```sh
CLAUDE_CODE_OPENCODE_GO_BARE=0 ./claude-o-go
```

Fuer dieses Backend-Experiment ist Bare Mode meistens die bessere Wahl.

## Direkter API-Test ohne Claude Code

Du kannst OpenCode Go auch direkt aufrufen:

```sh
npm start
```

Das startet:

```sh
node opencode-go-claude-example.mjs
```

Damit umgehst du Claude Code komplett und pruefst nur, ob dein OpenCode Go Key und dein Modell mit dem Anthropic-kompatiblen Endpoint funktionieren.

## Haeufige Probleme

### Proxy-Logs erscheinen in Claude Codes TUI

Normale Request-Logs sind standardmaessig ausgeblendet. Zum Debuggen:

```sh
OPENCODE_GO_PROXY_LOG=1 claude-o-go
```

Im normalen Betrieb unset lassen, damit die TUI sauber bleibt.

### `There's an issue with the selected model`

Wenn diese Meldung mit einem rohen OpenCode Go Modell wie `qwen3.7-plus` erscheint, validiert Claude Code das Modell lokal.

Nutze den Launcher:

```sh
./claude-o-go
```

Starte nicht direkt:

```sh
claude --model qwen3.7-plus
```

### Doppeltes `/v1/v1/messages`

`ANTHROPIC_BASE_URL` muss auf die Proxy-Wurzel zeigen:

```sh
http://127.0.0.1:4141
```

Sie darf nicht `/v1` enthalten, weil Claude Code selbst `/v1/messages` anhaengt.

### Claude Code zeigt `sonnet`

Das ist erwartet.

Claude Code sieht:

```text
sonnet
```

OpenCode Go erhaelt:

```text
qwen3.7-plus
```

Das Proxy-Log ist die Quelle der Wahrheit.

## Mentales Modell

Stell dir den Aufbau so vor:

```text
Claude Code CLI
  glaubt Modell = sonnet
  sendet Anthropic Request
        |
        v
Lokaler Proxy
  schreibt Modell um = qwen3.7-plus
  leitet Request weiter
        |
        v
OpenCode Go
  fuehrt das echte Modell aus
  gibt Antwort zurueck
        |
        v
Claude Code CLI
  zeigt die Antwort an
```

Die Claude Code User Experience bleibt gleich, aber das Modell-Backend ist OpenCode Go.
