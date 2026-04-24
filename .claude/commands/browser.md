# Browser Bridge — how to use

You have access to a real Chrome browser via the `browser-bridge` MCP server. All 18 tools are ready.

## Page tools

| Tool | What it does |
|------|-------------|
| `browser_screenshot` | PNG screenshot of the active tab |
| `browser_get_dom` | Compact DOM tree + CSS selectors for interactive elements |
| `browser_execute` | Run JavaScript; returns value, console output, errors, recent network |
| `browser_get_network` | Recent XHR/fetch requests |
| `browser_get_logs` | Console logs; pass `since` (Unix ms) for incremental |
| `browser_get_errors` | Uncaught JS errors and unhandled rejections |
| `browser_get_mutations` | DOM mutations; pass `since` for incremental |
| `browser_list_tabs` | All open tabs with IDs and URLs |
| `browser_switch_tab` | Switch active tab by ID |

## Extension development tools

| Tool | What it does |
|------|-------------|
| `browser_list_extension_targets` | List extension SWs/background pages with target IDs |
| `browser_get_sw_logs` | Console logs from an extension SW (needs target_id) |
| `browser_get_sw_errors` | JS errors from an extension SW (needs target_id) |
| `browser_execute_in_sw` | Run JS inside a SW context; async/await supported |
| `browser_get_extension_storage` | Read `chrome.storage.local` or `.sync` |
| `browser_set_extension_storage` | Write or clear extension storage |
| `browser_reload_extension` | Reload an extension; call list_extension_targets after for new target ID |
| `browser_send_message` | Send a message to an extension and return its response |
| `browser_open_popup` | Open a popup HTML as a regular tab |

## Standard workflow

**Inspect a web page:**
1. `browser_screenshot` — see what's on screen
2. `browser_get_dom` — find CSS selectors
3. `browser_execute` — interact with the page
4. `browser_screenshot` — verify the result

**Debug a Chrome extension:**
1. `browser_list_extension_targets` — find the SW target ID
2. `browser_get_sw_logs` — see what it's logging
3. `browser_execute_in_sw` — inspect internal state
4. `browser_send_message` — test its message handler

## Common JS patterns in browser_execute

```js
// Click a button
document.querySelector('#submit-btn').click()

// Fill a form field
document.querySelector('input[name="email"]').value = 'test@example.com'

// Read page data
return document.title + ' — ' + location.href

// Wait and check (wrap async in IIFE — top-level await is not supported)
return (async () => {
  await new Promise(r => setTimeout(r, 1000))
  return document.querySelector('.result')?.textContent
})()
```

## Rules and limitations

- `screenshot` / `get_dom` / `execute` only work on http/https tabs — they fail with a clear error on `chrome://` or `chrome-extension://` pages
- Extension SW tools only work on **Browser Bridge's own** SW targets — Chrome blocks CDP access to other extensions
- MV3 SWs go idle after ~30 s; call `list_extension_targets` again if a target ID stops responding
- Error "Chrome extension not connected" → ask the user to check `chrome://extensions/` and ensure Browser Bridge is enabled

## If extension is not connected

Tell the user:
1. Open Chrome and navigate to `chrome://extensions/`
2. Confirm **Browser Bridge** is listed and enabled
3. The extension auto-reconnects every 2 seconds — wait a moment and retry
