# reqpad

只做一件事的本地 HTTP 客户端：**发请求、看响应**。零依赖、无构建、离线可用。

请求由本地 Node 的 `http/https` 发出（不是浏览器 `fetch`），所以**没有跨域限制**，能直接打
`http://127.0.0.1:8080` 这类本地后端。

> 这不是 Postman 的分支、修改版或换皮，代码从零写的，也没有包含 Postman 的任何代码、图标或资源。
> 名字和 UI 都与 Postman 无关联，未获其背书。

## 环境要求

- Node.js >= 18（`node -v` 看一眼）
- macOS 桌面版额外需要 Xcode Command Line Tools（`xcode-select --install`）

## 安装

### macOS（桌面应用，双击启动）

```bash
git clone <this repo> reqpad && cd reqpad
./macos/build.sh --install      # 编译并装到 ~/Applications/reqpad.app
open ~/Applications/reqpad.app
```

应用自己会挑一个空闲端口、拉起内置的 Node 服务，关掉窗口这两个进程一起退出。

### macOS / Linux / Windows（命令行，任意平台）

```bash
node server.mjs          # 默认 4599
# 浏览器打开 http://127.0.0.1:4599
```

Windows 双击 `start.bat`；macOS 双击 `start.command`（首次可能要在「系统设置 → 隐私与安全性」里放行）。

换端口：`PORT=8080 node server.mjs`（Windows: `set PORT=8080 && node server.mjs`）。

## 用法

- 选方法、填 URL、点 **Send**（或 `Ctrl/Cmd + Enter`）。
- **Params**：URL 里的 `?a=1&b=2` 自动拆成可编辑行；取消勾选的行不拼进 URL，也就不会发出去。
- **Headers**：key/value 逐行编辑，空值不发。
- **Body**：5 种类型
  - `none` — 不带 body
  - `form-data` — 每行可选 text / file，文件按 multipart 上传
  - `x-www-form-urlencoded` — 表格自动序列化成 query
  - `raw` — JSON / Text / XML / HTML，按格式自动设 Content-Type
  - `binary` — 单个文件按原始字节发

  GET / HEAD 无论选哪种都不发 body；手写了 Content-Type 就以你写的为准。
- 左侧集合树：按集合 → 文件夹（按名字排序）分组，点一条直接回填方法、URL、Headers、Body。
- **导入**：支持 Postman 的 `backup-*.json`（App 内自动备份）和标准 `.postman_collection.json`（v2.x 导出），
  同集合重复导入只补新请求。环境变量一并导入，右上角可选，`{{baseUrl}}` 这类占位符发送前替换。
- 响应区：状态码（带颜色）、耗时、大小、跳转次数；Body 自动美化 JSON，可切原始文本；Headers 看原始响应头。

集合与环境存在 `~/.reqpad/collections.json` 和 `environments.json`，换浏览器、清缓存、重启进程都还在。

## 实现要点

| 点 | 做法 |
|---|---|
| 不受跨域限制 | 页面 `fetch('/api/send')` → Node 用 `http.request/https.request` 发真请求 |
| 跳转 | 默认跟随，最多 10 跳并记录每一跳；303 与 301/302 上的 POST 退化成 GET |
| 压缩 | 自带 `accept-encoding: gzip, deflate, br`，zlib/brotli 解压，deflate 兼容裸流 |
| 中文/二进制 | 能 UTF-8 往返才当文本，否则回 base64，不出现乱码 |
| 超时 | 单请求 30s |
| 安全 | 只监听 `127.0.0.1`；只允许 http/https，`file:` 之类直接拒绝 |
| 孤儿进程 | 桌面版给子进程设 `REQPAD_PARENT_WATCH=1`，父进程被强杀后子进程 1 秒内自行退出 |

## 验证过的

```
GET  http://127.0.0.1:4598/echo          -> 200，自定义 header 透传
POST 同上，body {"hello":"世界"}          -> 200，回显 body 与 content-type 一致
GET  /gzip                                -> 200，解压后是明文 JSON
GET  /redirect                            -> 200，redirects: [{302 → /echo}]
GET  file:///etc/passwd                   -> 400 unsupported scheme
无头浏览器点击 Send                        -> 200 OK / 17ms / 226B / 5 个响应头
Params: ?a=1&b=2 → 2 行；取消 a → 服务端收到 /echo?b=2；新增 c=3 → URL 变 ?b=2&c=3
Body urlencoded   -> 服务端收到 a=1&b=2，Content-Type 正确
Body raw(XML)     -> 服务端收到 <a>1</a> + application/xml
Body form-data    -> 服务端收到 multipart，含 name="name" 与 boundary
Body binary       -> content-length 与文件字节数一致
Body GET+body     -> 服务端收不到 body，残留 content-length 被清掉
导入 Postman 备份（2 份）                  -> 18 集合 / 71 请求 / 2 环境，点击可回填
macOS 应用正常退出                         -> 无残留 node 子进程
```

## 目录

```
server.mjs              静态服务 + /api/send 请求执行器 + /api/history
public/                 页面（index.html / app.js / style.css，无框架）
macos/main.swift        WKWebView 外壳
macos/build.sh          编译并可选安装到 ~/Applications
tools/echo-server.mjs   本地靶子（/echo /redirect /gzip /slow）
tools/cdp-smoke.mjs     无头浏览器点一次 Send 的端到端冒烟
tools/cdp-params.mjs    Params 表的端到端检查
tools/cdp-body.mjs      Body 五种类型的端到端检查
tools/cdp-shot.mjs      跑一段 JS 后截图，用于 UI 验收
tools/asar.mjs          只读 asar 解析（分析 Electron 应用时顺手写的，与本项目无关）
```

## 没做

集合、环境变量、Cookie 罐、multipart 文件上传、鉴权助手、代理抓包、Windows 桌面壳。
需要哪个再加，都是独立的小块。

## License

MIT，见 [LICENSE](LICENSE)。
