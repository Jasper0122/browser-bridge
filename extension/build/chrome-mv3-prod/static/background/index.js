var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,r,n,a,o){var i="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},s="function"==typeof i[a]&&i[a],l=s.cache||{},u="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function c(e,r){if(!l[e]){if(!t[e]){var n="function"==typeof i[a]&&i[a];if(!r&&n)return n(e,!0);if(s)return s(e,!0);if(u&&"string"==typeof e)return u(e);var o=Error("Cannot find module '"+e+"'");throw o.code="MODULE_NOT_FOUND",o}g.resolve=function(r){var n=t[e][1][r];return null!=n?n:r},g.cache={};var d=l[e]=new c.Module(e);t[e][0].call(d.exports,g,d,d.exports,this)}return l[e].exports;function g(e){var t=g.resolve(e);return!1===t?{}:c(t)}}c.isParcelRequire=!0,c.Module=function(e){this.id=e,this.bundle=c,this.exports={}},c.modules=t,c.cache=l,c.parent=s,c.register=function(e,r){t[e]=[function(e,t){t.exports=r},{}]},Object.defineProperty(c,"root",{get:function(){return i[a]}}),i[a]=c;for(var d=0;d<r.length;d++)c(r[d]);if(n){var g=c(n);"object"==typeof exports&&"undefined"!=typeof module?module.exports=g:"function"==typeof e&&e.amd?e(function(){return g}):o&&(this[o]=g)}}({kgW6q:[function(e,t,r){e("../../../background")},{"../../../background":"8VaxY"}],"8VaxY":[function(e,t,r){let n=new Set,a=new Set;function o(e){return!!e&&!e.startsWith("chrome://")&&!e.startsWith("chrome-extension://")&&!e.startsWith("about:")&&!e.startsWith("devtools://")}async function i(e){n.has(e)||(await chrome.debugger.attach({tabId:e},"1.3"),n.add(e),await chrome.debugger.sendCommand({tabId:e},"Network.enable",{}),await chrome.debugger.sendCommand({tabId:e},"Page.enable",{}),await chrome.debugger.sendCommand({tabId:e},"Runtime.enable",{}))}async function s(e){n.has(e)&&(n.delete(e),await chrome.debugger.detach({tabId:e}).catch(()=>{}))}async function l(e,t,r={}){return await i(e),chrome.debugger.sendCommand({tabId:e},t,r)}async function u(e){if(a.has(e))return;let t=await chrome.debugger.getTargets(),r=t.find(t=>t.id===e),n=r?.url??"";if(n.startsWith("chrome-extension://")&&!n.startsWith(`chrome-extension://${chrome.runtime.id}/`))throw Error("Cannot attach debugger to a different extension's context (Chrome security restriction). Tools that use swAttach (get_sw_logs, get_sw_errors, execute_in_sw, get/set_extension_storage) only work on this extension's own targets.");await chrome.debugger.attach({targetId:e},"1.3"),a.add(e),await chrome.debugger.sendCommand({targetId:e},"Runtime.enable",{})}chrome.debugger.onDetach.addListener(e=>{e.tabId&&n.delete(e.tabId),e.targetId&&a.delete(e.targetId)});let c=new Map,d=new Map,g=new Map,m=new Map,h=new Map,f=new Map;function p(e){d.delete(e),g.delete(e)}function w(e){return(e??[]).map(e=>void 0!==e.value?String(e.value):e.description??e.type??"").join(" ")}function y(e){return e.stackTrace?.callFrames?.slice(0,5).map(e=>`    at ${e.functionName||"(anonymous)"} (${e.url}:${e.lineNumber}:${e.columnNumber})`).join("\n")}chrome.debugger.onEvent.addListener((e,t,r)=>{let n=e.tabId,a=e.targetId;if(a&&!n){if("Runtime.consoleAPICalled"===t){let e=h.get(a)??[];e.push({level:r.type,text:w(r.args),ts:Math.round(1e3*r.timestamp)}),e.length>500&&e.shift(),h.set(a,e)}if("Runtime.exceptionThrown"===t){let e=r.exceptionDetails,t=f.get(a)??[];t.push({message:e.exception?.description??e.text??"Unknown error",url:e.url??"",line:e.lineNumber??0,stack:y(e),ts:Math.round(1e3*r.timestamp)}),t.length>100&&t.shift(),f.set(a,t)}return}if(n){if("Network.requestWillBeSent"===t&&m.set(r.requestId,{tabId:n,method:r.request.method,url:r.request.url}),"Network.responseReceived"===t){let e=m.get(r.requestId);if(!e||e.tabId!==n)return;let t=c.get(n)??[];t.push({method:e.method,url:r.response.url,status:r.response.status}),t.length>100&&t.shift(),c.set(n,t),m.delete(r.requestId)}if("Runtime.consoleAPICalled"===t){let e=d.get(n)??[];e.push({level:r.type,text:w(r.args),ts:Math.round(1e3*r.timestamp)}),e.length>500&&e.shift(),d.set(n,e)}if("Runtime.exceptionThrown"===t){let e=r.exceptionDetails,t=g.get(n)??[];t.push({message:e.exception?.description??e.text??"Unknown error",url:e.url??"",line:e.lineNumber??0,stack:y(e),ts:Math.round(1e3*r.timestamp)}),t.length>100&&t.shift(),g.set(n,t)}"Page.frameNavigated"!==t||r.frame.parentId||(p(n),c.delete(n))}});let b=`
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
`;async function _(e){if(n.has(e))try{await chrome.debugger.sendCommand({tabId:e},"Runtime.evaluate",{expression:b,awaitPromise:!1})}catch{}}let v=`
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
})()`;async function x(){let[e]=await chrome.tabs.query({active:!0,lastFocusedWindow:!0});if(!e?.id)throw Error("No active tab found");return e}let N={screenshot:async()=>{let e=await x();if(!o(e.url))throw Error(`Cannot capture screenshot of this page (${e.url?.split("?")[0]??"unknown"}) \u2014 switch to an http/https tab first`);let{data:t}=await l(e.id,"Page.captureScreenshot",{format:"png",quality:80});return{url:e.url??"",title:e.title??"",data:t}},get_dom:async()=>{let e=await x();if(!o(e.url))throw Error(`Cannot inspect DOM of this page (${e.url?.split("?")[0]??"unknown"}) \u2014 switch to an http/https tab first`);let{result:t}=await l(e.id,"Runtime.evaluate",{expression:v,returnByValue:!0,awaitPromise:!0});return t.value},execute:async({code:e})=>{let t=await x();if(!o(t.url))throw Error(`Cannot execute JavaScript on this page (${t.url?.split("?")[0]??"unknown"}) \u2014 switch to an http/https tab first`);let r=`(function() {
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
    var __result = (function() { ${e} })();
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
})()`,{result:n,exceptionDetails:a}=await l(t.id,"Runtime.evaluate",{expression:r,returnByValue:!0,awaitPromise:!0}),i=n.value??{},s=c.get(t.id)??[];return{returnValue:i.returnValue??null,error:i.error??a?.text??null,consoleOutput:i.consoleLogs??[],networkRequests:s.slice(-10)}},get_network:async()=>{let e=await x();return{requests:c.get(e.id)??[]}},get_logs:async({since:e}={})=>{let t=await x(),r=d.get(t.id)??[],n=void 0!==e?r.filter(t=>t.ts>Number(e)):r;return{logs:n}},get_errors:async()=>{let e=await x();return{errors:g.get(e.id)??[]}},get_mutations:async({since:e}={})=>{let t=await x();await i(t.id);let r=void 0!==e?`(window.__bridgeMutations || []).filter(function(m){return m.ts > ${Number(e)}})`:"window.__bridgeMutations || []",{result:n}=await l(t.id,"Runtime.evaluate",{expression:r,returnByValue:!0,awaitPromise:!1});return{mutations:n.value}},list_tabs:async()=>{let e=await chrome.tabs.query({});return{tabs:e.map(e=>({id:e.id,title:e.title??"",url:e.url??"",active:e.active}))}},switch_tab:async({tabId:e})=>{await chrome.tabs.update(Number(e),{active:!0});let t=await chrome.tabs.get(Number(e));return{id:t.id,title:t.title??"",url:t.url??""}},list_extension_targets:async()=>{let e=await chrome.debugger.getTargets(),t=e.filter(e=>(e.url??"").startsWith("chrome-extension://")||"service_worker"===e.type);return{targets:t.map(e=>({targetId:e.id,type:e.type,title:e.title??"",url:e.url??"",attached:a.has(e.id)}))}},get_sw_logs:async({targetId:e,since:t})=>{let r=String(e);await u(r);let n=h.get(r)??[],a=void 0!==t?n.filter(e=>e.ts>Number(t)):n;return{logs:a}},get_sw_errors:async({targetId:e})=>{let t=String(e);return await u(t),{errors:f.get(t)??[]}},execute_in_sw:async({targetId:e,code:t})=>{let r=String(e);await u(r);let n=`(async () => { try { const r = await (async function() { ${t} })(); return { ok: true, value: r !== undefined ? r : null }; } catch(e) { return { ok: false, error: e.message }; } })()`,{result:a,exceptionDetails:o}=await chrome.debugger.sendCommand({targetId:r},"Runtime.evaluate",{expression:n,returnByValue:!0,awaitPromise:!0});if(o)return{returnValue:null,error:o.text??"Evaluation failed"};let i=a?.value;return i?.ok?{returnValue:i.value??null,error:null}:{returnValue:null,error:i?.error??"Unknown error"}},get_extension_storage:async({targetId:e,storageArea:t})=>{let r=String(e);await u(r);let{result:n,exceptionDetails:a}=await chrome.debugger.sendCommand({targetId:r},"Runtime.evaluate",{expression:`chrome.storage.${"sync"===t?"sync":"local"}.get(null)`,returnByValue:!0,awaitPromise:!0});return a?{storage:null,error:a.text??"Failed to read storage"}:{storage:n?.value??null,error:null}},reload_extension:async({targetId:e})=>{let t=String(e),r=await chrome.debugger.getTargets(),n=r.find(e=>e.id===t);if(!n?.url)throw Error("Target not found");let o=n.url.match(/^chrome-extension:\/\/([a-z]{32})\//);if(!o)throw Error("Could not extract extension ID from target URL");let i=o[1];return await chrome.management.setEnabled(i,!1),await chrome.management.setEnabled(i,!0),a.delete(t),{success:!0,extensionId:i}},set_extension_storage:async({targetId:e,data:t,storageArea:r,clear:n})=>{let a=String(e);await u(a);let o="sync"===r?"sync":"local";if(n){let{exceptionDetails:e}=await chrome.debugger.sendCommand({targetId:a},"Runtime.evaluate",{expression:`chrome.storage.${o}.clear()`,returnByValue:!0,awaitPromise:!0});return e?{success:!1,error:e.text??"Failed to clear storage"}:{success:!0,cleared:!0}}let i=JSON.stringify(t??{}),{exceptionDetails:s}=await chrome.debugger.sendCommand({targetId:a},"Runtime.evaluate",{expression:`chrome.storage.${o}.set(${i})`,returnByValue:!0,awaitPromise:!0});return s?{success:!1,error:s.text??"Failed to set storage"}:{success:!0}},send_message:async({extensionId:e,message:t})=>{let r=String(e),n=t??{},a=await new Promise(e=>{let t=setTimeout(()=>e({error:"Timeout: no response within 10s"}),1e4);try{chrome.runtime.sendMessage(r,n,r=>{clearTimeout(t),chrome.runtime.lastError?e({error:chrome.runtime.lastError.message}):e({response:void 0!==r?r:null})})}catch(r){clearTimeout(t),e({error:r.message})}});return a},open_popup:async({extensionId:e,popupPath:t})=>{let r=`chrome-extension://${String(e)}/${String(t??"popup.html")}`,n=await chrome.tabs.create({url:r,active:!0});return{tabId:n.id,url:r}}},k=null,S=null;function C(){S&&(clearTimeout(S),S=null),k?.readyState!==WebSocket.OPEN&&k?.readyState!==WebSocket.CONNECTING&&((k=new WebSocket("ws://127.0.0.1:9988")).onopen=()=>console.log("[bridge] Connected to MCP server"),k.onmessage=async e=>{let t;try{t=JSON.parse(e.data)}catch{return}let r=N[t.tool];if(!r){k?.send(JSON.stringify({id:t.id,error:`Unknown tool: ${t.tool}`}));return}try{let e=await r(t.params??{});k?.send(JSON.stringify({id:t.id,result:e}))}catch(e){k?.send(JSON.stringify({id:t.id,error:e instanceof Error?e.message:String(e)}))}},k.onclose=()=>{k=null,S=setTimeout(C,2e3)},k.onerror=()=>k?.close())}chrome.tabs.onUpdated.addListener(async(e,t,r)=>{"loading"===t.status&&o(r.url)&&(n.has(e)&&(n.delete(e),await chrome.debugger.detach({tabId:e}).catch(()=>{})),p(e),c.delete(e),await i(e).catch(()=>{})),"complete"===t.status&&n.has(e)&&await _(e)}),chrome.tabs.query({},e=>{Promise.all(e.filter(e=>void 0!==e.id&&o(e.url)).map(e=>i(e.id).then(()=>_(e.id)).catch(()=>{})))}),chrome.alarms.create("keepalive",{periodInMinutes:.4}),chrome.alarms.onAlarm.addListener(e=>{"keepalive"===e.name&&C()}),C(),chrome.tabs.onRemoved.addListener(e=>{s(e),c.delete(e),d.delete(e),g.delete(e)})},{}]},["kgW6q"],"kgW6q","parcelRequireec38"),globalThis.define=t;