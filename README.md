# 终端常驻（`@local/dsh-terminal-keepalive`）

让 DeepSeek Harness 右侧栏的终端在切换页签与会话时保持挂载：切走不再是卸载，切回来不再重建 xterm、不再重放整屏快照 —— 切换变成一次显示/隐藏。

## 背景

右侧栏的 `terminal` 页签类型没有声明 `keepMounted`，所以 docking kit 在页签隐藏时把终端 body 卸载掉。切回来时会新建 xterm、重新 attach 到 Host 终端，并把整个屏幕（含最多 1000 行回滚）序列化重放一遍；跑全屏 TUI（`claude`、`codebuddy`、`vim`）或长输出时，这就是肉眼可见的“白闪 + 刷新 + 卡一下”。

## 实现

- **浏览器半侧**（`client.js`）拿到客户端服务 `ctx.sidebarRightTabs`，把 `terminal` 类型的 `keepMounted` 置为 `true`：
  - 已经注册的类型：就地改标志，再 `refresh()` 让屏幕上的页签重新读取；
  - 之后才注册的类型：在包装过的 `register` 里注册前补上；
  - 卸载/停用插件：恢复原始 `register` 与所有被改过的标志（包括插件生效期间新注册的定义）。
- 不动 PTY、输出流、xterm、主题和 Agent 终端工具；终端进程与官方实现完全一致。
- `KINDS` 常量列出要常驻的页签类型，默认只有 `terminal`；要连文件预览之类一起常驻，改这一行即可。
- **Host 半侧**（`index.js`）没有行为，只为让 bundle 承载客户端插件。

## 安装

- 本机（开发目录）：**插件 → 添加插件 → 本地目录**，选本目录；或
  ```sh
  dsh plugin --profile desktop add "file:<本目录绝对路径>"
  ```
- 其他机器：用 `dist/` 里的 tarball（`dsh plugin add "…/local-dsh-terminal-keepalive-1.0.0.tgz"`），或推到 git 后用 git spec 安装。
- 装完刷新一次页面（新 bundle 通常会通过 client graph 即时接入；刷新是兜底），不需要重启应用，也没有需要配置的项。

## 验证

1. 打开右侧栏终端，刷满一屏输出，或起一个全屏 TUI；
2. 切到文件/浏览器页签，再切回终端：没有白闪、没有 `connecting`，回滚内容和程序状态都在；
3. 切到另一个会话再切回：同样保持；
4. 关闭终端页签：进程照常结束，行为与出厂一致。

## 限制

- 隐藏的终端仍挂在 Host 上、仍接收输出、仍持有输入控制权，并常驻一份 xterm 实例（内存与少量 CPU）。终端开得多时，关掉不用的页签。
- `keepMounted` 在公开 API 里是**按类型**的布尔量，无法只保留“最后一个”终端页签；按实例粒度的上限需要上游 dockkit 支持。
- 依赖客户端服务 `sidebarRightTabs` 的 `register` / `get` / `refresh` 与页签类型字段 `keepMounted`。DSH 升级改动这些接口时，插件会打印一条 `console.warn` 并保持出厂行为，需要更新本插件。
- 只影响右侧栏的 `terminal` 类型；`dsh-better-sidebar` 的底部工作台终端是另一套实现，不受影响。

## 兼容性

随 DSH 0.2.2-rc.5 开发与验证（Desktop / Web）。`terminal` 类型由 `@deepseek-ai/dsh-client-ui-sidebar-terminal` 提供，`keepMounted` 由 `@deepseek-ai/dsh-client-ui-sidebar-right` 的页签注册表消费。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半边：无行为，仅承载客户端插件 |
| `client.js` | 页签注册表包装：把 `terminal` 类型的 `keepMounted` 打开并在卸载时还原 |
| `cordis.patch.yml` | 插入 `terminal-keepalive` 这一行 |
| `locale/{en,zh}.json` | 插件页的标题与描述 |
| `icon.svg` | 插件页图标 |
| `assets/icon-180.png` | 市场卡片图标（180×180） |

MIT License。
