<div align="center">

# Browser Bridge

### MCP tools that connect coding agents to your real Chrome browser

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blueviolet?style=flat-square)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Give MCP-compatible coding agents screenshots, DOM access, JavaScript execution, console logs, network traces, and Chrome extension debugging inside the Chrome session you already use.**

[Quick Start](#quick-start) |
[Supported Agents](#supported-coding-agents) |
[Why](#why-browser-bridge) |
[Tools](#tool-reference) |
[Extension Debugging](#chrome-extension-debugging) |
[Architecture](#architecture)

</div>

---

Most browser automation tools launch a separate browser profile. That means no saved login, no existing tabs, no cookies, and no installed extensions.

**Browser Bridge attaches to your real Chrome window.** It exposes 18 MCP tools through a small local Node.js server and a Chrome MV3 extension, so your coding agent can inspect and operate the browser you are already using.

```text
MCP client
  -> Browser Bridge MCP server (Node.js / stdio)
  -> Chrome extension (WebSocket on 127.0.0.1:9988)
  -> Your Chrome tabs and extension contexts
```

## What You Can Do

- Capture screenshots from the active tab
- Read a compact DOM tree and selectors for interactive elements
- Execute JavaScript in the current page
- Inspect console logs, JavaScript errors, and network requests
- Observe DOM mutations after page load
- List and switch Chrome tabs
- Debug Chrome extension service workers and background pages
- Read/write `chrome.storage`, send runtime messages, and reload extensions

## How It Compares

| Capability | **Browser Bridge** | Playwright MCP | browser-use | Stagehand |
| --- | :---: | :---: | :---: | :---: |
| MCP-native tools | ✅ | ✅ | ⚠️ | ❌ |
| Uses your real Chrome session | ✅ | ⚠️ | ⚠️ | ❌ |
| Screenshot | ✅ | ✅ | ✅ | ✅ |
| DOM inspection | ✅ | ✅ | ⚠️ | ✅ |
| Execute JavaScript | ✅ | ✅ | ❌ | ✅ |
| Console log capture | ✅ | ✅ | ❌ | ❌ |
| Network request capture | ✅ | ✅ | ❌ | ❌ |
| DOM mutation observer | ✅ | ❌ | ❌ | ❌ |
| Tab list and switching | ✅ | ✅ | ❌ | ❌ |
| Chrome extension debugging | ✅ | ❌ | ❌ | ❌ |

> ✅ supported · ⚠️ partial or extra setup · ❌ not supported

## Quick Start

**Requirements**

- Node.js 20+
- Google Chrome
- An MCP-capable coding client, such as Claude Code

### 1. Install

```bash
git clone https://github.com/Jasper0122/browser-bridge.git
cd browser-bridge
node install.mjs
```

The installer builds the MCP server and Chrome extension, registers Claude Code when the `claude` CLI is available, and writes a reusable MCP config snippet to:

```text
.browser-bridge/mcp-config.json
```

### 2. Load the Chrome extension

Chrome requires one manual confirmation for unpacked extensions:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `browser-bridge/extension/build/chrome-mv3-prod/`

### 3. Verify

Open any normal `https://` page in Chrome, then ask your MCP client:

```text
Take a screenshot of my current browser tab.
```

If the bridge is connected, the client should receive a PNG screenshot of your active tab.

## Why Browser Bridge

| Need | Browser Bridge approach |
| --- | --- |
| Work inside logged-in websites | Uses your real Chrome session and current tabs |
| Debug frontend issues | Captures screenshots, DOM, console logs, network calls, JS errors, and mutations |
| Control browser state from an agent | Provides native MCP tools instead of shell wrappers |
| Debug Chrome extensions | Includes dedicated service worker, storage, runtime message, and reload tools |
| Avoid managing a separate browser | No Playwright browser install or disposable profile required |

## Supported Coding Agents

Browser Bridge is not tied to a single LLM product. It exposes a standard MCP server, so any coding agent with MCP support can connect to it.

| Support | Agents |
| --- | --- |
| ✅ Direct MCP setup | Claude Code, Cursor, Windsurf, Cline, Roo Code |
| ⚠️ Version/config dependent | Codex, Continue, other MCP-compatible agents |

Claude Code can be auto-registered by `node install.mjs`. Other clients can use the generated `.browser-bridge/mcp-config.json`. Codex support depends on preconfiguring Browser Bridge as an MCP server or plugin before the session starts.

## Tool Reference

Browser Bridge registers all tools with the `browser_` prefix.

### Page Tools

| Tool | Description |
| --- | --- |
| `browser_screenshot` | Capture a PNG screenshot of the active tab |
| `browser_get_dom` | Return compact DOM text and selectors for interactive elements |
| `browser_execute` | Run JavaScript in the active tab and return result, logs, errors, and recent network |
| `browser_get_network` | Return recent XHR/fetch requests |
| `browser_get_logs` | Return console output, optionally since a Unix timestamp in ms |
| `browser_get_errors` | Return uncaught errors and unhandled promise rejections |
| `browser_get_mutations` | Return observed DOM mutations, optionally since a timestamp |
| `browser_list_tabs` | List open tabs with IDs, titles, URLs, and active state |
| `browser_switch_tab` | Activate a tab by ID |

### Chrome Extension Tools

| Tool | Description |
| --- | --- |
| `browser_list_extension_targets` | List extension service workers and background pages |
| `browser_get_sw_logs` | Read console logs from an extension service worker or page |
| `browser_get_sw_errors` | Read JavaScript errors from an extension service worker |
| `browser_execute_in_sw` | Execute JavaScript inside a service worker context |
| `browser_get_extension_storage` | Read `chrome.storage.local` or `chrome.storage.sync` |
| `browser_set_extension_storage` | Write or clear extension storage |
| `browser_reload_extension` | Reload an extension through `chrome.management` |
| `browser_send_message` | Send `chrome.runtime.sendMessage` to an extension |
| `browser_open_popup` | Open an extension popup as a pinned tab |

## Chrome Extension Debugging

Browser Bridge is especially useful when building Chrome extensions. A typical loop:

```text
1. browser_list_extension_targets
2. browser_get_sw_logs
3. browser_execute_in_sw
4. browser_get_extension_storage
5. browser_send_message
6. browser_reload_extension
```

This lets your coding agent inspect service worker state, test message handlers, verify storage, and reload the extension without manually opening DevTools.

## Manual Setup

Use this if you do not want the installer to register anything automatically.

```bash
git clone https://github.com/Jasper0122/browser-bridge.git
cd browser-bridge/mcp-server
npm install
npm run build
```

Register the MCP server with your client. For Claude Code:

```bash
claude mcp add browser-bridge node /absolute/path/to/browser-bridge/mcp-server/dist/index.js
claude mcp list
```

For other MCP clients, use:

```json
{
  "mcpServers": {
    "browser-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/browser-bridge/mcp-server/dist/index.js"]
    }
  }
}
```

Then load the extension from:

```text
browser-bridge/extension/build/chrome-mv3-prod/
```

## Known Limitations

- `browser_screenshot`, `browser_get_dom`, and `browser_execute` work on normal `http://` and `https://` pages. Chrome blocks these operations on `chrome://` and most `chrome-extension://` pages.
- Chrome MV3 service workers can go idle. If a target disappears, call `browser_list_extension_targets` again.
- Some cross-extension debugging operations are restricted by Chrome. For third-party extensions, `browser_send_message` requires the target extension to expose a compatible message handler.
- The Chrome extension currently needs to be loaded manually as an unpacked extension.

## Architecture

```text
MCP client
  |
  | stdio / MCP
  v
Browser Bridge MCP server
  |
  | WebSocket ws://127.0.0.1:9988
  v
Browser Bridge Chrome extension
  |
  | Chrome extension APIs + Chrome DevTools Protocol
  v
Your Chrome browser
```

The MCP server exposes tools over stdio. The Chrome extension connects back to the local WebSocket server and performs browser operations through Chrome extension APIs and the Chrome DevTools Protocol.

## Development

```bash
# MCP server
cd mcp-server
npm install
npm run build

# Chrome extension
cd ../extension
npm install
npm run build
```

The extension build output is:

```text
extension/build/chrome-mv3-prod/
```

## License

MIT
