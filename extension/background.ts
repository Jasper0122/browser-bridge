// Browser Bridge — background service worker
// Connects to local MCP server via WebSocket, executes browser tool commands.

const WS_URL = "ws://127.0.0.1:9988"
const RECONNECT_DELAY = 2000

// ─── CDP helpers ─────────────────────────────────────────────────────────────

const attached        = new Set<number>()
const attachedTargets = new Set<string>()

function isAttachable(url?: string): boolean {
  if (!url) return false
  return !url.startsWith("chrome://") &&
         !url.startsWith("chrome-extension://") &&
         !url.startsWith("about:") &&
         !url.startsWith("devtools://")
}

async function cdpAttach(tabId: number) {
  if (attached.has(tabId)) return
  await chrome.debugger.attach({ tabId }, "1.3")
  attached.add(tabId)
  await chrome.debugger.sendCommand({ tabId }, "Network.enable", {})
  await chrome.debugger.sendCommand({ tabId }, "Page.enable", {})
  await chrome.debugger.sendCommand({ tabId }, "Runtime.enable", {})
}

async function cdpDetach(tabId: number) {
  if (!attached.has(tabId)) return
  attached.delete(tabId)
  await chrome.debugger.detach({ tabId }).catch(() => {})
}

chrome.debugger.onDetach.addListener((debuggee: any) => {
  if (debuggee.tabId)    attached.delete(debuggee.tabId)
  if (debuggee.targetId) attachedTargets.delete(debuggee.targetId)
})

async function cdpSend<T = unknown>(tabId: number, method: string, params: object = {}): Promise<T> {
  await cdpAttach(tabId)
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>
}

async function swAttach(targetId: string) {
  if (attachedTargets.has(targetId)) return
  // Chrome blocks cross-extension CDP access — detect early for a clear error
  const targets: chrome.debugger.TargetInfo[] = await chrome.debugger.getTargets()
  const target = targets.find(t => t.id === targetId)
  const url = target?.url ?? ""
  if (url.startsWith("chrome-extension://") && !url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    throw new Error(
      `Cannot attach debugger to a different extension's context (Chrome security restriction). ` +
      `Tools that use swAttach (get_sw_logs, get_sw_errors, execute_in_sw, get/set_extension_storage) ` +
      `only work on this extension's own targets.`
    )
  }
  await chrome.debugger.attach({ targetId } as any, "1.3")
  attachedTargets.add(targetId)
  await chrome.debugger.sendCommand({ targetId } as any, "Runtime.enable", {})
}

// ─── Per-tab buffers ──────────────────────────────────────────────────────────

type NetEntry   = { method: string; url: string; status: number; body?: string }
type LogEntry   = { level: string; text: string; ts: number }
type ErrorEntry = { message: string; url: string; line: number; stack?: string; ts: number }

const networkCaptures = new Map<number, NetEntry[]>()
const consoleLogs     = new Map<number, LogEntry[]>()
const pageErrors      = new Map<number, ErrorEntry[]>()
const pendingRequests = new Map<string, { tabId: number; method: string; url: string }>()
const swLogs          = new Map<string, LogEntry[]>()
const swErrors        = new Map<string, ErrorEntry[]>()

function clearTabBuffers(tabId: number) {
  consoleLogs.delete(tabId)
  pageErrors.delete(tabId)
  // keep networkCaptures — caller decides
}

// ─── CDP event handler ────────────────────────────────────────────────────────

function parseLogText(args: any[]): string {
  return (args ?? [])
    .map((a: any) => a.value !== undefined ? String(a.value) : (a.description ?? a.type ?? ""))
    .join(" ")
}

function parseStack(exceptionDetails: any): string | undefined {
  return (exceptionDetails.stackTrace?.callFrames as any[] | undefined)
    ?.slice(0, 5)
    .map((f: any) => `    at ${f.functionName || "(anonymous)"} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
    .join("\n")
}

chrome.debugger.onEvent.addListener((debuggee: any, method, params: any) => {
  const tabId:    number | undefined = debuggee.tabId
  const targetId: string | undefined = debuggee.targetId

  // ── Service-worker / extension target events ──────────────────────────────
  if (targetId && !tabId) {
    if (method === "Runtime.consoleAPICalled") {
      const logs = swLogs.get(targetId) ?? []
      logs.push({ level: params.type as string, text: parseLogText(params.args), ts: Math.round((params.timestamp as number) * 1000) })
      if (logs.length > 500) logs.shift()
      swLogs.set(targetId, logs)
    }
    if (method === "Runtime.exceptionThrown") {
      const ex = params.exceptionDetails as any
      const errors = swErrors.get(targetId) ?? []
      errors.push({
        message: ex.exception?.description ?? ex.text ?? "Unknown error",
        url: ex.url ?? "",
        line: ex.lineNumber ?? 0,
        stack: parseStack(ex),
        ts: Math.round((params.timestamp as number) * 1000),
      })
      if (errors.length > 100) errors.shift()
      swErrors.set(targetId, errors)
    }
    return
  }

  if (!tabId) return

  // ── Network ──────────────────────────────────────────────────────────────
  if (method === "Network.requestWillBeSent") {
    pendingRequests.set(params.requestId, {
      tabId, method: params.request.method, url: params.request.url,
    })
  }

  if (method === "Network.responseReceived") {
    const pending = pendingRequests.get(params.requestId)
    if (!pending || pending.tabId !== tabId) return
    const captures = networkCaptures.get(tabId) ?? []
    captures.push({ method: pending.method, url: params.response.url, status: params.response.status })
    if (captures.length > 100) captures.shift()
    networkCaptures.set(tabId, captures)
    pendingRequests.delete(params.requestId)
  }

  // ── Console logs ──────────────────────────────────────────────────────────
  if (method === "Runtime.consoleAPICalled") {
    const logs = consoleLogs.get(tabId) ?? []
    logs.push({ level: params.type as string, text: parseLogText(params.args), ts: Math.round((params.timestamp as number) * 1000) })
    if (logs.length > 500) logs.shift()
    consoleLogs.set(tabId, logs)
  }

  // ── JS errors ─────────────────────────────────────────────────────────────
  if (method === "Runtime.exceptionThrown") {
    const ex = params.exceptionDetails as any
    const errors = pageErrors.get(tabId) ?? []
    errors.push({
      message: ex.exception?.description ?? ex.text ?? "Unknown error",
      url: ex.url ?? "",
      line: ex.lineNumber ?? 0,
      stack: parseStack(ex),
      ts: Math.round((params.timestamp as number) * 1000),
    })
    if (errors.length > 100) errors.shift()
    pageErrors.set(tabId, errors)
  }

  // ── Page navigation: clear stale per-page buffers, re-inject observer ─────
  if (method === "Page.frameNavigated" && !(params.frame as any).parentId) {
    clearTabBuffers(tabId)
    networkCaptures.delete(tabId)
  }
})

// ─── MutationObserver injection ───────────────────────────────────────────────

const MUTATION_SCRIPT = `
(function() {
  if (window.__bridgeMutations) return 'already';
  window.__bridgeMutations = [];
  new MutationObserver(function(records) {
    var ts = Date.now();
    records.forEach(function(r) {
      var t = r.target;
      var name = t.nodeName.toLowerCase();
      if (t.id) name += '#' + t.id;
      else if (typeof t.className === 'string' && t.className)
        name += '.' + t.className.trim().split(/\\s+/)[0];
      window.__bridgeMutations.push({
        type: r.type, target: name,
        added: r.addedNodes.length, removed: r.removedNodes.length,
        attr: r.attributeName || undefined, ts: ts
      });
    });
    if (window.__bridgeMutations.length > 500)
      window.__bridgeMutations = window.__bridgeMutations.slice(-500);
  }).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: false
  });
  return 'injected';
})()
`

async function injectMutationObserver(tabId: number) {
  if (!attached.has(tabId)) return
  try {
    await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
      expression: MUTATION_SCRIPT,
      awaitPromise: false,
    })
  } catch { /* page context may not be ready */ }
}

// ─── DOM serializer (runs in page context via CDP) ───────────────────────────

const DOM_SCRIPT = `
(function() {
  function serialize(node, depth) {
    if (depth > 5 || !node || node.nodeType !== 1) return ''
    const tag = node.tagName.toLowerCase()
    if (['script','style','svg','noscript','head'].includes(tag)) return ''
    const id   = node.id ? ' #' + node.id : ''
    const cls  = typeof node.className === 'string' && node.className
                   ? ' .' + node.className.trim().split(/\\s+/).slice(0,2).join('.') : ''
    const text = (node.childNodes.length === 1 && node.firstChild.nodeType === 3)
                   ? ' "' + node.textContent.trim().slice(0, 60) + '"' : ''
    const indent = '  '.repeat(depth)
    let out = indent + '<' + tag + id + cls + '>' + text + '\\n'
    for (const child of node.children) out += serialize(child, depth + 1)
    return out
  }
  const interactive = Array.from(
    document.querySelectorAll('a,button,input,select,textarea,[role="button"],[onclick]')
  ).slice(0, 60).map(el => {
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || el.value || el.placeholder || '').trim().slice(0, 60)
    const sel = el.id ? '#' + el.id
      : el.getAttribute('data-testid') ? '[data-testid="' + el.getAttribute('data-testid') + '"]'
      : el.getAttribute('name') ? '[name="' + el.getAttribute('name') + '"]'
      : el.getAttribute('aria-label') ? '[aria-label="' + el.getAttribute('aria-label') + '"]'
      : null
    return { tag, text, selector: sel }
  })
  return {
    url: location.href,
    title: document.title,
    dom: serialize(document.body, 0).slice(0, 8000),
    interactive
  }
})()`

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id) throw new Error("No active tab found")
  return tab as chrome.tabs.Tab & { id: number }
}

const handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {

  screenshot: async () => {
    const tab = await getActiveTab()
    if (!isAttachable(tab.url))
      throw new Error(`Cannot capture screenshot of this page (${tab.url?.split("?")[0] ?? "unknown"}) — switch to an http/https tab first`)
    const { data } = await cdpSend<{ data: string }>(tab.id, "Page.captureScreenshot", { format: "png", quality: 80 })
    return { url: tab.url ?? "", title: tab.title ?? "", data }
  },

  get_dom: async () => {
    const tab = await getActiveTab()
    if (!isAttachable(tab.url))
      throw new Error(`Cannot inspect DOM of this page (${tab.url?.split("?")[0] ?? "unknown"}) — switch to an http/https tab first`)
    const { result } = await cdpSend<{ result: { value: unknown } }>(
      tab.id, "Runtime.evaluate", { expression: DOM_SCRIPT, returnByValue: true, awaitPromise: true }
    )
    return result.value
  },

  execute: async ({ code }) => {
    const tab = await getActiveTab()
    if (!isAttachable(tab.url))
      throw new Error(`Cannot execute JavaScript on this page (${tab.url?.split("?")[0] ?? "unknown"}) — switch to an http/https tab first`)

    const wrappedCode = `(function() {
  var __logs = [];
  var __types = ['log','warn','error','info','debug'];
  var __orig = {};
  __types.forEach(function(t) {
    __orig[t] = console[t];
    console[t] = function() {
      var args = Array.prototype.slice.call(arguments).map(function(a) {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
      });
      __logs.push({ type: t, args: args });
      __orig[t].apply(console, arguments);
    };
  });
  function __restore() { __types.forEach(function(t) { console[t] = __orig[t]; }); }
  try {
    var __result = (function() { ${code} })();
    if (__result && typeof __result.then === 'function') {
      return __result
        .then(function(v) { __restore(); return { returnValue: v != null ? v : null, consoleLogs: __logs, error: null }; })
        .catch(function(e) { __restore(); return { returnValue: null, consoleLogs: __logs, error: e.message }; });
    }
    __restore();
    return { returnValue: __result != null ? __result : null, consoleLogs: __logs, error: null };
  } catch(e) {
    __restore();
    return { returnValue: null, consoleLogs: __logs, error: e.message };
  }
})()`

    const { result, exceptionDetails } = await cdpSend<{
      result: { value: unknown }; exceptionDetails?: { text: string }
    }>(tab.id, "Runtime.evaluate", { expression: wrappedCode, returnByValue: true, awaitPromise: true })

    const r = (result.value ?? {}) as { returnValue: unknown; consoleLogs: Array<{ type: string; args: string[] }>; error: string | null }
    const captures = networkCaptures.get(tab.id) ?? []
    return {
      returnValue: r.returnValue ?? null,
      error: r.error ?? exceptionDetails?.text ?? null,
      consoleOutput: r.consoleLogs ?? [],
      networkRequests: captures.slice(-10),
    }
  },

  get_network: async () => {
    const tab = await getActiveTab()
    return { requests: networkCaptures.get(tab.id) ?? [] }
  },

  get_logs: async ({ since } = {}) => {
    const tab = await getActiveTab()
    const logs = consoleLogs.get(tab.id) ?? []
    const filtered = since !== undefined ? logs.filter(l => l.ts > Number(since)) : logs
    return { logs: filtered }
  },

  get_errors: async () => {
    const tab = await getActiveTab()
    return { errors: pageErrors.get(tab.id) ?? [] }
  },

  get_mutations: async ({ since } = {}) => {
    const tab = await getActiveTab()
    await cdpAttach(tab.id)
    const expr = since !== undefined
      ? `(window.__bridgeMutations || []).filter(function(m){return m.ts > ${Number(since)}})`
      : `window.__bridgeMutations || []`
    const { result } = await cdpSend<{ result: { value: unknown } }>(
      tab.id, "Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false }
    )
    return { mutations: result.value }
  },

  list_tabs: async () => {
    const tabs = await chrome.tabs.query({})
    return {
      tabs: tabs.map(t => ({ id: t.id, title: t.title ?? "", url: t.url ?? "", active: t.active }))
    }
  },

  switch_tab: async ({ tabId }) => {
    await chrome.tabs.update(Number(tabId), { active: true })
    const tab = await chrome.tabs.get(Number(tabId))
    return { id: tab.id, title: tab.title ?? "", url: tab.url ?? "" }
  },

  list_extension_targets: async () => {
    const targets: chrome.debugger.TargetInfo[] = await chrome.debugger.getTargets()
    const filtered = targets.filter(t =>
      (t.url ?? "").startsWith("chrome-extension://") ||
      t.type === "service_worker"
    )
    return {
      targets: filtered.map(t => ({
        targetId: t.id,
        type:     t.type,
        title:    t.title ?? "",
        url:      t.url ?? "",
        attached: attachedTargets.has(t.id),
      }))
    }
  },

  get_sw_logs: async ({ targetId, since }) => {
    const tid = String(targetId)
    await swAttach(tid)
    const logs = swLogs.get(tid) ?? []
    const filtered = since !== undefined ? logs.filter(l => l.ts > Number(since)) : logs
    return { logs: filtered }
  },

  get_sw_errors: async ({ targetId }) => {
    const tid = String(targetId)
    await swAttach(tid)
    return { errors: swErrors.get(tid) ?? [] }
  },

  execute_in_sw: async ({ targetId, code }) => {
    const tid = String(targetId)
    await swAttach(tid)
    const expr = `(async () => { try { const r = await (async function() { ${code} })(); return { ok: true, value: r !== undefined ? r : null }; } catch(e) { return { ok: false, error: e.message }; } })()`
    const { result, exceptionDetails } = await chrome.debugger.sendCommand(
      { targetId: tid } as any,
      "Runtime.evaluate",
      { expression: expr, returnByValue: true, awaitPromise: true }
    ) as any
    if (exceptionDetails) return { returnValue: null, error: exceptionDetails.text ?? "Evaluation failed" }
    const val = result?.value as { ok: boolean; value?: unknown; error?: string }
    return val?.ok ? { returnValue: val.value ?? null, error: null } : { returnValue: null, error: val?.error ?? "Unknown error" }
  },

  get_extension_storage: async ({ targetId, storageArea }) => {
    const tid = String(targetId)
    await swAttach(tid)
    const area = storageArea === "sync" ? "sync" : "local"
    const { result, exceptionDetails } = await chrome.debugger.sendCommand(
      { targetId: tid } as any,
      "Runtime.evaluate",
      { expression: `chrome.storage.${area}.get(null)`, returnByValue: true, awaitPromise: true }
    ) as any
    if (exceptionDetails) return { storage: null, error: exceptionDetails.text ?? "Failed to read storage" }
    return { storage: result?.value ?? null, error: null }
  },

  reload_extension: async ({ targetId }) => {
    const tid = String(targetId)
    const targets: chrome.debugger.TargetInfo[] = await chrome.debugger.getTargets()
    const target = targets.find(t => t.id === tid)
    if (!target?.url) throw new Error("Target not found")
    const match = target.url.match(/^chrome-extension:\/\/([a-z]{32})\//)
    if (!match) throw new Error("Could not extract extension ID from target URL")
    const extensionId = match[1]
    await chrome.management.setEnabled(extensionId, false)
    await chrome.management.setEnabled(extensionId, true)
    attachedTargets.delete(tid)
    return { success: true, extensionId }
  },

  set_extension_storage: async ({ targetId, data, storageArea, clear }) => {
    const tid = String(targetId)
    await swAttach(tid)
    const area = storageArea === "sync" ? "sync" : "local"
    if (clear) {
      const { exceptionDetails } = await chrome.debugger.sendCommand(
        { targetId: tid } as any, "Runtime.evaluate",
        { expression: `chrome.storage.${area}.clear()`, returnByValue: true, awaitPromise: true }
      ) as any
      if (exceptionDetails) return { success: false, error: exceptionDetails.text ?? "Failed to clear storage" }
      return { success: true, cleared: true }
    }
    const json = JSON.stringify(data ?? {})
    const { exceptionDetails } = await chrome.debugger.sendCommand(
      { targetId: tid } as any, "Runtime.evaluate",
      { expression: `chrome.storage.${area}.set(${json})`, returnByValue: true, awaitPromise: true }
    ) as any
    if (exceptionDetails) return { success: false, error: exceptionDetails.text ?? "Failed to set storage" }
    return { success: true }
  },

  send_message: async ({ extensionId, message }) => {
    const eid = String(extensionId)
    const msg = message ?? {}
    const result = await new Promise<{ response?: unknown; error?: string }>((resolve) => {
      const timer = setTimeout(() => resolve({ error: "Timeout: no response within 10s" }), 10_000)
      try {
        chrome.runtime.sendMessage(eid, msg, (response) => {
          clearTimeout(timer)
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message })
          } else {
            resolve({ response: response !== undefined ? response : null })
          }
        })
      } catch (e: any) {
        clearTimeout(timer)
        resolve({ error: e.message })
      }
    })
    return result
  },

  open_popup: async ({ extensionId, popupPath }) => {
    const url = `chrome-extension://${String(extensionId)}/${String(popupPath ?? "popup.html")}`
    const tab = await chrome.tabs.create({ url, active: true })
    return { tabId: tab.id, url }
  },
}

// ─── WebSocket client ─────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return

  ws = new WebSocket(WS_URL)

  ws.onopen = () => console.log("[bridge] Connected to MCP server")

  ws.onmessage = async (event) => {
    let msg: { id: string; tool: string; params: Record<string, unknown> }
    try { msg = JSON.parse(event.data) } catch { return }

    const handler = handlers[msg.tool]
    if (!handler) {
      ws?.send(JSON.stringify({ id: msg.id, error: `Unknown tool: ${msg.tool}` }))
      return
    }

    try {
      const result = await handler(msg.params ?? {})
      ws?.send(JSON.stringify({ id: msg.id, result }))
    } catch (err) {
      ws?.send(JSON.stringify({ id: msg.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  ws.onclose = () => { ws = null; reconnectTimer = setTimeout(connect, RECONNECT_DELAY) }
  ws.onerror = () => ws?.close()
}

// ─── Tab lifecycle: early attach ──────────────────────────────────────────────

// On navigation: re-attach fresh session, clear stale buffers, re-inject observer on load
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "loading" && isAttachable(tab.url)) {
    // Detach old session so we can re-attach cleanly for the new page
    if (attached.has(tabId)) {
      attached.delete(tabId)
      await chrome.debugger.detach({ tabId }).catch(() => {})
    }
    clearTabBuffers(tabId)
    networkCaptures.delete(tabId)
    await cdpAttach(tabId).catch(() => {})
  }
  if (info.status === "complete" && attached.has(tabId)) {
    await injectMutationObserver(tabId)
  }
})

// On extension startup: attach to all already-open tabs and inject observer
chrome.tabs.query({}, (tabs) => {
  Promise.all(
    tabs
      .filter(t => t.id !== undefined && isAttachable(t.url))
      .map(t => cdpAttach(t.id!).then(() => injectMutationObserver(t.id!)).catch(() => {}))
  )
})

// ─── Keep-alive (MV3 service workers die after ~30s idle) ─────────────────────

chrome.alarms.create("keepalive", { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") connect()
})

// ─── Start ────────────────────────────────────────────────────────────────────

connect()

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  cdpDetach(tabId)
  networkCaptures.delete(tabId)
  consoleLogs.delete(tabId)
  pageErrors.delete(tabId)
})
