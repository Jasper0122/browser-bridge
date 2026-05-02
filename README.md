<div align="center">

# Browser Bridge

**Give Claude Code eyes and hands inside your real Chrome browser.**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![MCP](https://img.shields.io/badge/Claude_Code-MCP-blueviolet?style=flat-square)](https://docs.anthropic.com/en/docs/claude-code/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Features](#features) · [Comparison](#how-it-compares) · [Install](#installation) · [Tools](#tool-reference) · [Extension Debugging](#extension-development)

</div>

---

Most browser automation tools spin up a **separate sandboxed browser** — meaning no saved logins, no cookies, no extensions, no existing tabs. Browser Bridge is different.

It connects Claude Code directly to the Chrome window already open on your screen. Screenshots, JS execution, live console logs, network traffic, DOM mutations, and a full suite of Chrome extension debugging tools — all through 18 native MCP tools, no CLI wrappers needed.

```
Claude Code  ←→  MCP Server (Node.js, stdio)  ←→  Chrome Extension (WebSocket :9988)  ←→  Your Chrome
```

---

## Why Browser Bridge

**Your browser, not a sandboxed copy.** Already logged into GitHub, Notion, your internal dashboard? Claude works in that exact session. No re-authentication, no cookie-import gymnastics.

**The only AI tool with Chrome extension debugging.** Nine dedicated tools let Claude read service worker logs, execute code in SW contexts, inspect `chrome.storage`, send messages between extensions, and reload extensions — all without opening DevTools manually.

**Full observability stack.** Beyond just screenshots, Claude can stream console output, capture XHR/fetch requests, observe DOM mutations in real time, and surface unhandled JS errors — making it genuinely useful for debugging, not just clicking around.

---

## How It Compares

| Capability | **Browser Bridge** | Playwright MCP | browser-use | dev-browser | Stagehand |
|---|:---:|:---:|:---:|:---:|:---:|
| Claude Code MCP native | ✅ | ✅ | ✅ | ❌ CLI only | ❌ SDK only |
| Uses your real Chrome + sessions | ✅ | ⚠️ profile | ⚠️ profile | ⚠️ remote port | ❌ |
| Screenshot | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execute JavaScript in page | ✅ | ✅ | ❌ | ✅ sandboxed | ✅ |
| Console log streaming | ✅ | ✅ | ❌ | ❌ | ❌ |
| Network request capture | ✅ | ✅ | ❌ | ❌ | ❌ |
| DOM mutation observer | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Chrome extension debugging** | ✅ 9 tools | ❌ | ❌ | ❌ | ❌ |
| Tab list + switching | ✅ | ✅ | ❌ | ❌ | ❌ |
| No separate browser install | ✅ | ❌ Playwright | ❌ Chromium | ❌ Playwright | ❌ Browserbase |
| Zero config — attach to running Chrome | ✅ | ❌ | ❌ | ⚠️ | ❌ |

> ⚠️ = partial support with extra setup steps

---

## Features

### Page Interaction
- **Screenshot** any tab — Claude sees the page as a PNG
- **DOM tree** — compact readable structure with CSS selectors for every interactive element
- **Execute JavaScript** — run arbitrary code, get return value, console output, and recent network in one call
- **Network capture** — XHR/fetch requests with method, status, URL, response body
- **Console streaming** — log/warn/error/info with timestamps; pass `since` for incremental polling
- **JS error tracking** — uncaught exceptions and unhandled promise rejections
- **DOM mutations** — childList and attribute changes as they happen; pass `since` for diffs
- **Tab management** — list all open tabs, switch active tab by ID

### Chrome Extension Development
Nine tools purpose-built for extension authors:
- List all extension service workers and background pages
- Stream console logs and JS errors from extension SWs
- Execute JavaScript inside a service worker context (async/await supported)
- Read and write `chrome.storage.local` / `.sync`
- Send `chrome.runtime.sendMessage` and capture the response
- Reload an extension without touching DevTools
- Open extension popups as pinned tabs so they don't close on focus loss

---

## Installation

**Prerequisites:** Node.js 20+, Chrome (any recent version), Claude Code CLI

### 1 — Clone and build the MCP server

```bash
git clone https://github.com/Jasper0122/browser-bridge.git
cd browser-bridge/mcp-server
npm install
npm run build
```

### 2 — Register with Claude Code

```bash
# macOS / Linux
claude mcp add browser-bridge node /absolute/path/to/browser-bridge/mcp-server/dist/index.js

# Windows
claude mcp add browser-bridge node "C:\path\to\browser-bridge\mcp-server\dist\index.js"
```

Verify:
```bash
claude mcp list
```

### 3 — Load the Chrome extension

**Option A — pre-built (fastest)**

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `browser-bridge/extension/build/chrome-mv3-prod/`

**Option B — build from source**

```bash
cd browser-bridge/extension
npm install
npm run build   # requires Node 20+
```
Then load `extension/build/chrome-mv3-prod/` as above.

### 4 — Verify

Open any project in Claude Code and ask:

```
Take a screenshot of my current browser tab.
```

You should see a PNG of whatever Chrome tab is active. Done.

---

## Tool Reference

All 18 tools are registered as `browser_*` in Claude Code once the MCP server is connected.

<details>
<summary><strong>Page tools (9)</strong></summary>

| Tool | Description |
|------|-------------|
| `browser_screenshot` | PNG screenshot of the active tab |
| `browser_get_dom` | Compact DOM tree + CSS selectors for up to 30 interactive elements |
| `browser_execute` | Run JavaScript; returns value, console output, errors, recent network |
| `browser_get_network` | Last 20 XHR/fetch requests (method, status, URL, body) |
| `browser_get_logs` | Console output; pass `since` (Unix ms) for incremental polling |
| `browser_get_errors` | Uncaught JS errors and unhandled rejections with stack traces |
| `browser_get_mutations` | DOM mutations; pass `since` for delta since last check |
| `browser_list_tabs` | All open tabs with IDs, titles, URLs |
| `browser_switch_tab` | Activate a tab by ID |

</details>

<details>
<summary><strong>Extension development tools (9)</strong></summary>

| Tool | Description |
|------|-------------|
| `browser_list_extension_targets` | List all extension service workers and background pages |
| `browser_get_sw_logs` | Console logs from an extension service worker |
| `browser_get_sw_errors` | JS errors from an extension service worker |
| `browser_execute_in_sw` | Execute JavaScript in a service worker context |
| `browser_get_extension_storage` | Read `chrome.storage.local` or `.sync` |
| `browser_set_extension_storage` | Write key-value pairs or clear a storage area |
| `browser_reload_extension` | Reload an extension via `chrome.management` |
| `browser_send_message` | Send `chrome.runtime.sendMessage` and return the response |
| `browser_open_popup` | Open an extension popup as a pinned tab |

**Workflow:** `browser_list_extension_targets` → get `target_id` → use the other tools

</details>

---

## Extension Development

Browser Bridge is the only AI tool purpose-built for Chrome extension authors. Typical workflow:

```
1. browser_list_extension_targets   → find your extension's service worker target ID
2. browser_get_sw_logs              → see what's being logged
3. browser_execute_in_sw            → inspect or mutate internal state
4. browser_get_extension_storage    → verify storage contents
5. browser_send_message             → test your message handler
6. browser_reload_extension         → reload and repeat
```

Claude can run this entire loop autonomously — no DevTools window required.

---

## Known Limitations

**Cross-extension CDP access is blocked by Chrome.**
`get_sw_logs`, `execute_in_sw`, `get_extension_storage`, and `set_extension_storage` can only target Browser Bridge's own contexts. For other extensions, use `browser_send_message` if the target exposes `onMessageExternal`.

**`chrome://` and `chrome-extension://` tabs.**
`screenshot`, `get_dom`, and `execute` require an `http://` or `https://` tab. Chrome's security model blocks CDP access to browser-internal pages.

**MV3 service workers go idle.**
Chrome terminates MV3 service workers after ~30 seconds of inactivity. If a target ID stops responding, call `browser_list_extension_targets` again to get the new one.

---

## Architecture

```
┌─────────────────┐   stdio/MCP   ┌──────────────────────┐
│   Claude Code   │ ◄───────────► │  MCP Server (Node.js) │
└─────────────────┘               └──────────┬───────────┘
                                             │ WebSocket :9988
                                  ┌──────────▼───────────┐
                                  │  Chrome Extension     │
                                  │  (MV3, CDP)           │
                                  └──────────┬───────────┘
                                             │ Chrome DevTools Protocol
                                  ┌──────────▼───────────┐
                                  │  Your Chrome Browser  │
                                  │  (tabs, extensions,   │
                                  │   sessions, storage)  │
                                  └──────────────────────┘
```

The MCP server speaks the MCP protocol to Claude Code over stdio. It exposes a WebSocket server on `127.0.0.1:9988` that the Chrome extension connects to. Every tool call becomes a JSON message round-trip through that WebSocket to the extension, which uses the Chrome DevTools Protocol to carry out the operation and return the result.

---

## License

MIT
