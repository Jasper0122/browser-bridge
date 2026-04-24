import { randomUUID } from "crypto"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { WebSocketServer, WebSocket } from "ws"
import { z } from "zod"

const WS_PORT = 9988
const TIMEOUT_MS = 30_000

// ─── WebSocket bridge to Chrome extension ────────────────────────────────────

let ext: WebSocket | null = null

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
const pending = new Map<string, Pending>()

const wss = new WebSocketServer({ host: "127.0.0.1", port: WS_PORT })

wss.on("connection", (ws) => {
  ext = ws
  process.stderr.write("[bridge] Extension connected\n")

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { id: string; result?: unknown; error?: string }
      const p = pending.get(msg.id)
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result)
    } catch { /* ignore malformed */ }
  })

  ws.on("close", () => {
    ext = null
    process.stderr.write("[bridge] Extension disconnected\n")
  })
})

process.stderr.write(`[bridge] Waiting for extension on ws://127.0.0.1:${WS_PORT}\n`)

function call(tool: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!ext || ext.readyState !== WebSocket.OPEN)
    throw new Error("Chrome extension not connected — make sure the Browser Bridge extension is installed and a tab is open.")

  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timeout: extension did not respond within ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    ext!.send(JSON.stringify({ id, tool, params }))
  })
}

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new McpServer({ name: "browser-bridge", version: "0.2.0" })

server.tool(
  "browser_screenshot",
  "Take a screenshot of the active browser tab. Returns the page URL and a PNG image.",
  {},
  async () => {
    const r = await call("screenshot") as { url: string; title: string; data: string }
    return {
      content: [
        { type: "text" as const, text: `Page: ${r.title}\nURL: ${r.url}` },
        { type: "image" as const, data: r.data, mimeType: "image/png" },
      ],
    }
  }
)

server.tool(
  "browser_get_dom",
  "Get a compact, readable representation of the current page DOM including interactive elements and their selectors.",
  {},
  async () => {
    const r = await call("get_dom") as { url: string; title: string; dom: string; interactive: unknown[] }
    const interactiveText = (r.interactive as Array<{ tag: string; text?: string; selector?: string }>)
      .filter(el => el.selector)
      .slice(0, 30)
      .map(el => `  ${el.tag} "${el.text ?? ""}" → ${el.selector}`)
      .join("\n")
    return {
      content: [{
        type: "text" as const,
        text: `Page: ${r.title}\nURL: ${r.url}\n\n--- DOM ---\n${r.dom}\n--- Interactive Elements ---\n${interactiveText}`,
      }],
    }
  }
)

server.tool(
  "browser_execute",
  "Execute JavaScript in the active tab and return the result, console output, and any errors.",
  { code: z.string().describe("JavaScript code to execute in the page context") },
  async ({ code }) => {
    const r = await call("execute", { code }) as {
      returnValue: unknown; error: string | null
      consoleOutput: Array<{ type: string; args: string[] }>
      networkRequests: Array<{ method: string; url: string; status: number }>
    }
    const lines: string[] = []
    if (r.error) lines.push(`❌ Error: ${r.error}`)
    if (r.returnValue !== null && r.returnValue !== undefined)
      lines.push(`→ ${JSON.stringify(r.returnValue).slice(0, 500)}`)
    if (r.consoleOutput?.length) {
      lines.push(`Console (${r.consoleOutput.length}):`)
      r.consoleOutput.slice(0, 10).forEach(c => lines.push(`  [${c.type}] ${c.args.join(" ").slice(0, 200)}`))
    }
    if (r.networkRequests?.length) {
      lines.push(`Network (${r.networkRequests.length} captured):`)
      r.networkRequests.slice(0, 5).forEach(n => lines.push(`  ${n.method} ${n.status} ${n.url.slice(0, 100)}`))
    }
    return { content: [{ type: "text" as const, text: lines.join("\n") || "✓ Done (no output)" }] }
  }
)

server.tool(
  "browser_get_network",
  "Get recent XHR/Fetch network requests captured from the active tab. Monitoring starts automatically when the extension attaches — no page reload needed.",
  {},
  async () => {
    const r = await call("get_network") as { requests: Array<{ method: string; url: string; status: number; body?: string }> }
    if (!r.requests?.length)
      return { content: [{ type: "text" as const, text: "No requests captured yet. Navigate to a page to start capturing." }] }
    const text = r.requests
      .slice(-20)
      .map(req => `${req.method} ${req.status} ${req.url}\n${req.body ? "  " + req.body.slice(0, 300) : ""}`)
      .join("\n\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_get_logs",
  "Get console.log/warn/error/info/debug output captured from the active tab since the extension attached. Pass 'since' (Unix ms) to fetch only new entries since a previous call.",
  { since: z.number().optional().describe("Unix timestamp in ms — only return entries after this time") },
  async ({ since }) => {
    const r = await call("get_logs", since !== undefined ? { since } : {}) as {
      logs: Array<{ level: string; text: string; ts: number }>
    }
    if (!r.logs?.length)
      return { content: [{ type: "text" as const, text: "No console logs captured yet." }] }
    const text = r.logs
      .map(l => `[${new Date(l.ts).toISOString().slice(11, 23)}] [${l.level}] ${l.text}`)
      .join("\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_get_errors",
  "Get JavaScript errors and unhandled promise rejections thrown on the active tab since the extension attached.",
  {},
  async () => {
    const r = await call("get_errors") as {
      errors: Array<{ message: string; url: string; line: number; stack?: string; ts: number }>
    }
    if (!r.errors?.length)
      return { content: [{ type: "text" as const, text: "No errors captured." }] }
    const text = r.errors
      .map(e =>
        `[${new Date(e.ts).toISOString().slice(11, 23)}] ${e.message}\n  ${e.url}:${e.line}${e.stack ? "\n" + e.stack : ""}`
      )
      .join("\n\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_get_mutations",
  "Get DOM mutations (nodes added/removed, attributes changed) observed in the active tab. Pass 'since' (Unix ms) to fetch only changes after a previous snapshot.",
  { since: z.number().optional().describe("Unix timestamp in ms — only return mutations after this time") },
  async ({ since }) => {
    const r = await call("get_mutations", since !== undefined ? { since } : {}) as {
      mutations: Array<{ type: string; target: string; added: number; removed: number; attr?: string; ts: number }>
    }
    if (!r.mutations?.length)
      return { content: [{ type: "text" as const, text: "No DOM mutations captured yet. The observer is injected automatically after page load." }] }
    const text = r.mutations.slice(-100).map(m => {
      const parts = [`[${new Date(m.ts).toISOString().slice(11, 23)}] ${m.type} <${m.target}>`]
      if (m.added)   parts.push(`+${m.added}`)
      if (m.removed) parts.push(`-${m.removed}`)
      if (m.attr)    parts.push(`@${m.attr}`)
      return parts.join(" ")
    }).join("\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_list_tabs",
  "List all open browser tabs with their IDs, titles, and URLs.",
  {},
  async () => {
    const r = await call("list_tabs") as { tabs: Array<{ id: number; title: string; url: string; active: boolean }> }
    const text = r.tabs
      .map(t => `${t.active ? "▶" : " "} [${t.id}] ${t.title}\n    ${t.url}`)
      .join("\n")
    return { content: [{ type: "text" as const, text: text || "No tabs found" }] }
  }
)

server.tool(
  "browser_switch_tab",
  "Switch the active browser tab by tab ID. Use browser_list_tabs first to get tab IDs.",
  { tab_id: z.number().describe("The tab ID to switch to") },
  async ({ tab_id }) => {
    const r = await call("switch_tab", { tabId: tab_id }) as { id: number; title: string; url: string }
    return { content: [{ type: "text" as const, text: `Switched to: ${r.title}\n${r.url}` }] }
  }
)

server.tool(
  "browser_list_extension_targets",
  "List all Chrome extension background service workers and extension pages available for debugging. Returns target IDs to use with browser_get_sw_logs and browser_get_sw_errors.",
  {},
  async () => {
    const r = await call("list_extension_targets") as {
      targets: Array<{ targetId: string; type: string; title: string; url: string; attached: boolean }>
    }
    if (!r.targets?.length)
      return { content: [{ type: "text" as const, text: "No extension targets found. Make sure the extension is installed and active." }] }
    const text = r.targets
      .map(t => `${t.attached ? "●" : "○"} [${t.targetId}]\n  type: ${t.type}\n  ${t.title || "(no title)"}\n  ${t.url}`)
      .join("\n\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_get_sw_logs",
  "Get console logs from a Chrome extension background service worker or extension page. Use browser_list_extension_targets first to get the target ID. Attaches the debugger automatically on first call.",
  {
    target_id: z.string().describe("Extension target ID from browser_list_extension_targets"),
    since: z.number().optional().describe("Unix timestamp in ms — only return entries after this time"),
  },
  async ({ target_id, since }) => {
    const r = await call("get_sw_logs", since !== undefined ? { targetId: target_id, since } : { targetId: target_id }) as {
      logs: Array<{ level: string; text: string; ts: number }>
    }
    if (!r.logs?.length)
      return { content: [{ type: "text" as const, text: "No logs captured yet — debugger just attached, trigger some activity in the extension and retry." }] }
    const text = r.logs
      .map(l => `[${new Date(l.ts).toISOString().slice(11, 23)}] [${l.level}] ${l.text}`)
      .join("\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_get_sw_errors",
  "Get JavaScript errors and unhandled promise rejections from a Chrome extension background service worker. Use browser_list_extension_targets first to get the target ID.",
  { target_id: z.string().describe("Extension target ID from browser_list_extension_targets") },
  async ({ target_id }) => {
    const r = await call("get_sw_errors", { targetId: target_id }) as {
      errors: Array<{ message: string; url: string; line: number; stack?: string; ts: number }>
    }
    if (!r.errors?.length)
      return { content: [{ type: "text" as const, text: "No errors captured." }] }
    const text = r.errors
      .map(e =>
        `[${new Date(e.ts).toISOString().slice(11, 23)}] ${e.message}\n  ${e.url}:${e.line}${e.stack ? "\n" + e.stack : ""}`
      )
      .join("\n\n")
    return { content: [{ type: "text" as const, text }] }
  }
)

server.tool(
  "browser_execute_in_sw",
  "Execute JavaScript in a Chrome extension service worker context and return the result. Use browser_list_extension_targets first to get the target ID. Async/await is supported. Useful for inspecting extension state, calling internal APIs, or reading storage.",
  {
    target_id: z.string().describe("Extension target ID from browser_list_extension_targets"),
    code: z.string().describe("JavaScript code to execute in the service worker context (async/await supported)"),
  },
  async ({ target_id, code }) => {
    const r = await call("execute_in_sw", { targetId: target_id, code }) as {
      returnValue: unknown; error: string | null
    }
    const lines: string[] = []
    if (r.error) lines.push(`Error: ${r.error}`)
    if (r.returnValue !== null && r.returnValue !== undefined)
      lines.push(`→ ${JSON.stringify(r.returnValue, null, 2).slice(0, 2000)}`)
    return { content: [{ type: "text" as const, text: lines.join("\n") || "Done (no output)" }] }
  }
)

server.tool(
  "browser_get_extension_storage",
  "Read chrome.storage.local or chrome.storage.sync data from a Chrome extension. Use browser_list_extension_targets first to get the target ID.",
  {
    target_id: z.string().describe("Extension target ID from browser_list_extension_targets"),
    storage_area: z.enum(["local", "sync"]).optional().describe("Storage area to read (default: local)"),
  },
  async ({ target_id, storage_area }) => {
    const r = await call("get_extension_storage", {
      targetId: target_id,
      storageArea: storage_area ?? "local",
    }) as { storage: unknown; error: string | null }
    if (r.error) return { content: [{ type: "text" as const, text: `Error: ${r.error}` }] }
    const text = JSON.stringify(r.storage, null, 2)
    return { content: [{ type: "text" as const, text: text === "null" ? "(empty)" : text }] }
  }
)

server.tool(
  "browser_reload_extension",
  "Reload a Chrome extension by disabling and re-enabling it via chrome.management. Works with any extension page target (service worker, popup, or background page). The extension restarts and gets a new target ID — use browser_list_extension_targets again after reloading.",
  { target_id: z.string().describe("Extension target ID from browser_list_extension_targets") },
  async ({ target_id }) => {
    await call("reload_extension", { targetId: target_id })
    return { content: [{ type: "text" as const, text: "Extension reloaded. Use browser_list_extension_targets to get the new target ID." }] }
  }
)

server.tool(
  "browser_set_extension_storage",
  "Write key-value pairs to chrome.storage.local or chrome.storage.sync for a Chrome extension. Pass clear=true to wipe the entire storage area instead. Use browser_list_extension_targets first to get the target ID.",
  {
    target_id: z.string().describe("Extension target ID from browser_list_extension_targets"),
    data: z.record(z.unknown()).optional().describe("Key-value pairs to write into storage"),
    storage_area: z.enum(["local", "sync"]).optional().describe("Storage area (default: local)"),
    clear: z.boolean().optional().describe("If true, wipe the entire storage area (ignores data)"),
  },
  async ({ target_id, data, storage_area, clear }) => {
    const r = await call("set_extension_storage", {
      targetId: target_id,
      data: data ?? {},
      storageArea: storage_area ?? "local",
      clear: clear ?? false,
    }) as { success: boolean; cleared?: boolean; error?: string }
    if (!r.success) return { content: [{ type: "text" as const, text: `Error: ${r.error}` }] }
    const msg = r.cleared ? "Storage cleared." : `Written: ${JSON.stringify(data ?? {}, null, 2)}`
    return { content: [{ type: "text" as const, text: msg }] }
  }
)

server.tool(
  "browser_send_message",
  "Send a chrome.runtime.sendMessage to a Chrome extension and return its response. The target extension must have an onMessage listener that calls sendResponse or returns a Promise. Use the extension ID (32-char string from the chrome-extension:// URL), not the target ID.",
  {
    extension_id: z.string().describe("Extension ID (e.g. iebafojjljifdamkfgefgpcemjmfmefo)"),
    message: z.record(z.unknown()).describe("Message object to send to the extension"),
  },
  async ({ extension_id, message }) => {
    const r = await call("send_message", { extensionId: extension_id, message }) as {
      response?: unknown; error?: string
    }
    if (r.error) return { content: [{ type: "text" as const, text: `Error: ${r.error}` }] }
    const text = r.response !== undefined && r.response !== null
      ? JSON.stringify(r.response, null, 2)
      : "(no response)"
    return { content: [{ type: "text" as const, text: `Response:\n${text}` }] }
  }
)

server.tool(
  "browser_open_popup",
  "Open a Chrome extension's popup HTML as a regular tab so it stays visible. Popup windows close on focus loss; opening as a tab avoids this. Returns the new tab ID. Note: browser_screenshot and browser_get_dom cannot inspect chrome-extension:// tabs — switch to an http/https tab to use those tools.",
  {
    extension_id: z.string().describe("Extension ID (e.g. iebafojjljifdamkfgefgpcemjmfmefo)"),
    popup_path: z.string().optional().describe("Path to the popup HTML file (default: popup.html)"),
  },
  async ({ extension_id, popup_path }) => {
    const r = await call("open_popup", { extensionId: extension_id, popupPath: popup_path ?? "popup.html" }) as {
      tabId: number; url: string
    }
    return { content: [{ type: "text" as const, text: `Opened popup as tab ${r.tabId}:\n${r.url}\n\nUse browser_screenshot or browser_get_dom to inspect it.` }] }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
