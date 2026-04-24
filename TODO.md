# Browser Bridge — 最终功能补全清单

## 现有工具（15 个）

### 页面工具
- browser_screenshot — 截图
- browser_get_dom — 紧凑 DOM + 可交互元素
- browser_execute — 在页面执行 JS，含 console 捕获
- browser_get_network — XHR/Fetch 请求
- browser_get_logs — 页面 console 日志（支持 since）
- browser_get_errors — 页面 JS 错误
- browser_get_mutations — DOM 变更监听
- browser_list_tabs — 列出所有标签页
- browser_switch_tab — 切换标签页

### 扩展开发工具
- browser_list_extension_targets — 列出所有扩展 SW/页面目标
- browser_get_sw_logs — SW console 日志
- browser_get_sw_errors — SW JS 错误
- browser_execute_in_sw — 在 SW 执行 JS
- browser_get_extension_storage — 读 storage.local / .sync
- browser_reload_extension — 重载扩展（setEnabled false→true）

## 待新增（3 个，最终一次）

### 1. browser_set_extension_storage
**为什么必要**：现在只能读 storage，无法写。调试时常需要预设状态、清空数据、模拟首次安装。
**参数**：target_id, data (object), storage_area? (local/sync，默认 local)
**实现**：在 SW 执行 `chrome.storage.{area}.set(data)`
**注意**：data 为空对象 {} 不清空，清空用 `chrome.storage.{area}.clear()`，所以加一个 clear? boolean

### 2. browser_send_message
**为什么必要**：测试扩展消息 API 是开发中最核心的操作。现在只能间接通过 execute_in_sw 手写 sendMessage，且拿不到响应。
**参数**：extension_id (扩展 ID，非 target_id), message (any object)
**实现**：在 Browser Bridge SW 调 `chrome.runtime.sendMessage(extensionId, message)` 并 await 响应
**注意**：需要目标扩展的 onMessage 返回 true 才能异步响应，超时用 10s

### 3. browser_open_popup
**为什么必要**：Popup 失焦即关，Claude 无法截图。把 popup HTML 作为普通标签页打开，可正常截图、get_dom、execute。
**参数**：extension_id, popup_path? (默认 popup.html)
**实现**：`chrome.tabs.create({ url: "chrome-extension://{id}/{path}", active: true })`，返回 tab_id

## 实现边界
- set_extension_storage 的 clear 参数优先于 data（clear=true 时忽略 data）
- send_message 超时 10s，错误时返回 error 字段而非抛出
- open_popup 不验证 popup_path 是否存在，由 Chrome 报 404
- 不再新增其他工具
