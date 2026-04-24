# Browser Bridge

Chrome Extension + local MCP server that lets Claude Code see and control a real browser.

## Architecture

```
Claude Code  ←→  MCP Server (Node, stdio)  ←→  Chrome Extension (WebSocket :9988)  ←→  Chrome
```

- `mcp-server/` — Node.js MCP server; speaks MCP to Claude Code via stdio, bridges to the extension via WebSocket on 127.0.0.1:9988
- `extension/` — Plasmo MV3 Chrome extension; uses Chrome DevTools Protocol (CDP) for all browser operations

## I have browser tools available

The `browser-bridge` MCP server is configured. All 18 tools are ready to use.

### Page tools

| Tool | Description |
|------|-------------|
| `browser_screenshot` | PNG screenshot of the active tab |
| `browser_get_dom` | Compact DOM tree + CSS selectors for interactive elements |
| `browser_execute` | Run JS in the active tab; returns value, console output, errors, recent network |
| `browser_get_network` | Recent XHR/fetch requests (method, status, URL) |
| `browser_get_logs` | Console log/warn/error/info; pass `since` (Unix ms) for incremental polling |
| `browser_get_errors` | Uncaught JS errors and unhandled promise rejections |
| `browser_get_mutations` | DOM mutations (childList, attributes); pass `since` for incremental |
| `browser_list_tabs` | All open tabs with IDs, titles, URLs |
| `browser_switch_tab` | Make a tab active by tab ID |

### Extension development tools

| Tool | Description |
|------|-------------|
| `browser_list_extension_targets` | List all extension SW / background page targets and their IDs |
| `browser_get_sw_logs` | Console logs from an extension service worker |
| `browser_get_sw_errors` | JS errors from an extension service worker |
| `browser_execute_in_sw` | Execute JS inside a service worker; async/await supported |
| `browser_get_extension_storage` | Read `chrome.storage.local` or `.sync` |
| `browser_set_extension_storage` | Write key-value pairs (or clear) an extension's storage |
| `browser_reload_extension` | Reload an extension via `chrome.management.setEnabled(false/true)` |
| `browser_send_message` | Send `chrome.runtime.sendMessage` to an extension; returns its response |
| `browser_open_popup` | Open a popup HTML as a regular tab so it stays visible |

## Default approach for any page task

1. `browser_screenshot` — see the page
2. `browser_get_dom` — find selectors
3. `browser_execute` — interact
4. `browser_screenshot` — verify

## Extension debugging workflow

1. `browser_list_extension_targets` — get the SW's `target_id`
2. `browser_get_sw_logs` / `browser_execute_in_sw` — inspect state
3. `browser_send_message` — communicate with its message handler

## Important rules

- `browser_execute` does not support top-level `await`. Wrap async code in an IIFE: `(async () => { ... })()`
- `screenshot` / `get_dom` / `execute` require an http/https tab to be active — they throw a clear error on `chrome://` or `chrome-extension://` tabs
- Extension SW tools (`get_sw_logs`, `execute_in_sw`, `get_extension_storage`, `set_extension_storage`) **only work on Browser Bridge's own targets** — Chrome blocks CDP access to other extensions' contexts
- MV3 SWs go idle after ~30 s; call `browser_list_extension_targets` again if a target ID stops working
- If tools fail with "Chrome extension not connected" → user needs to open Chrome and check `chrome://extensions/`

## Build & run

```bash
# MCP server
cd mcp-server && npm install && npm run build
node dist/index.js   # Claude Code starts this automatically via MCP config

# Extension (requires Node v20+)
cd extension && npm install && npm run build
# Load extension/build/chrome-mv3-prod/ in chrome://extensions/ as unpacked
```
