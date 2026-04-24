# Browser Bridge

Let Claude Code see and control your real Chrome browser.

Claude Code normally has no eyes — it can't see what's on screen or interact with live web pages. Browser Bridge fixes that by connecting Claude Code to your actual Chrome browser via a local MCP server and a Chrome extension.

```
Claude Code  ←→  MCP Server (Node.js, stdio)  ←→  Chrome Extension (WebSocket :9988)  ←→  Chrome
```

## What you can do

- **Screenshot** any open tab — Claude sees the page visually
- **Read the DOM** — get a compact tree + CSS selectors for every interactive element
- **Execute JavaScript** — click buttons, fill forms, read page state
- **Capture network traffic** — XHR/fetch requests with method, status, URL
- **Stream console logs and JS errors** in real time
- **Observe DOM mutations** as they happen
- **Debug Chrome extensions** — read SW logs, execute code in service workers, read/write storage, send messages, reload extensions

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | **v20+** | Required for the MCP server and for building the extension |
| Chrome | any recent | The extension targets Chrome MV3 |
| Claude Code | latest | The CLI that hosts MCP servers |

---

## Installation

### Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/browser-bridge.git
cd browser-bridge
```

### Step 2 — Build and install the MCP server

```bash
cd mcp-server
npm install
npm run build       # compiles TypeScript → dist/index.js
cd ..
```

### Step 3 — Register the MCP server with Claude Code

Run this once from any directory (replace the path with your actual clone location):

```bash
claude mcp add browser-bridge node /absolute/path/to/browser-bridge/mcp-server/dist/index.js
```

**Windows example:**
```bash
claude mcp add browser-bridge node "C:\Users\you\browser-bridge\mcp-server\dist\index.js"
```

**Mac/Linux example:**
```bash
claude mcp add browser-bridge node /home/you/browser-bridge/mcp-server/dist/index.js
```

Verify it was added:
```bash
claude mcp list
```

### Step 4 — Load the Chrome extension

**Option A — use the pre-built extension (easiest)**

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the folder: `browser-bridge/extension/build/chrome-mv3-prod/`

**Option B — build from source**

```bash
cd extension
npm install
npm run build       # outputs to build/chrome-mv3-prod/
```

Then load `extension/build/chrome-mv3-prod/` as above.

### Step 5 — Verify

Open Claude Code in any project and run:

```
/browser
```

Or just ask Claude to take a screenshot — it will call `browser_screenshot` automatically.

If it works, you'll see a PNG of your current Chrome tab.

---

## Tool Reference

All 18 tools are available as `browser_*` in Claude Code once the MCP server is registered.

### Page tools

| Tool | Description |
|------|-------------|
| `browser_screenshot` | PNG screenshot of the active tab |
| `browser_get_dom` | Compact DOM tree + CSS selectors for interactive elements |
| `browser_execute` | Run JavaScript; returns return value, console output, errors, recent network |
| `browser_get_network` | Recent XHR/fetch requests (method, status, URL) |
| `browser_get_logs` | Console log/warn/error/info output; pass `since` (Unix ms) for incremental |
| `browser_get_errors` | Uncaught JS errors and unhandled promise rejections |
| `browser_get_mutations` | DOM mutations (nodes added/removed, attributes changed); pass `since` for incremental |
| `browser_list_tabs` | All open tabs with IDs, titles, URLs |
| `browser_switch_tab` | Make a tab active by tab ID |

### Extension development tools

| Tool | Description |
|------|-------------|
| `browser_list_extension_targets` | List all Chrome extension SWs and background pages with their target IDs |
| `browser_get_sw_logs` | Console logs from an extension service worker (requires target ID) |
| `browser_get_sw_errors` | JS errors from an extension service worker (requires target ID) |
| `browser_execute_in_sw` | Execute JavaScript inside a service worker context; async/await supported |
| `browser_get_extension_storage` | Read `chrome.storage.local` or `.sync` from an extension |
| `browser_set_extension_storage` | Write key-value pairs (or clear) an extension's storage |
| `browser_reload_extension` | Disable + re-enable an extension via `chrome.management`; gets a new target ID after |
| `browser_send_message` | Send `chrome.runtime.sendMessage` to an extension and return its response |
| `browser_open_popup` | Open an extension's popup HTML as a regular tab so it stays visible |

> **Extension tool workflow:** `browser_list_extension_targets` → get `target_id` → use the other tools

---

## Known Limitations

**Chrome security model — cross-extension debugging**

The extension SW tools (`get_sw_logs`, `get_sw_errors`, `execute_in_sw`, `get_extension_storage`, `set_extension_storage`) use Chrome DevTools Protocol to attach to service worker contexts. Chrome **blocks** CDP attachment to other extensions' contexts. These tools only work on Browser Bridge's own targets. For other extensions, use `browser_send_message` to communicate if the target extension exposes an `onMessageExternal` listener.

**chrome:// and chrome-extension:// tabs**

`browser_screenshot`, `browser_get_dom`, and `browser_execute` require an http/https tab to be active. Chrome's security model prevents CDP access to browser-internal pages.

**MV3 service workers go idle**

Chrome MV3 service workers terminate after ~30 seconds of inactivity. When that happens, `browser_list_extension_targets` must be called again to get the new target ID — the old one is no longer valid.

---

## Building from source

```bash
# MCP server (TypeScript → dist/index.js)
cd mcp-server
npm install
npm run build

# Extension (TypeScript + Plasmo → extension/build/chrome-mv3-prod/)
cd extension
npm install
npm run build       # requires Node v20+
```

The compiled extension lives at `extension/build/chrome-mv3-prod/`. Load that folder in `chrome://extensions/` as an unpacked extension.

---

## For Claude Code (AI context)

> This section is for the AI assistant reading this file.

The `browser-bridge` MCP server is configured and the Chrome extension is loaded. You have access to the 18 tools listed above.

**Default workflow for any page task:**
1. `browser_screenshot` — see what's on screen
2. `browser_get_dom` — find CSS selectors for elements you need to interact with
3. `browser_execute` — click, type, read values
4. `browser_screenshot` — verify the result

**For extension debugging:**
1. `browser_list_extension_targets` — find the extension's service worker target ID
2. `browser_get_sw_logs` / `browser_execute_in_sw` — inspect its state
3. `browser_send_message` — communicate with its message handler

**Rules:**
- Always screenshot first before attempting to interact with a page
- `browser_execute` does not support top-level `await` — wrap async code in an IIFE: `(async () => { ... })()`
- If tools fail with "Chrome extension not connected" — the extension's WebSocket to the MCP server is down; tell the user to check `chrome://extensions/` and ensure Browser Bridge is enabled
- Extension SW tools only work on Browser Bridge's own targets; other extensions' contexts are blocked by Chrome security

---

## License

MIT
