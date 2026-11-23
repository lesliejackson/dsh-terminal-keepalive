# 终端常驻（`@local/dsh-terminal-keepalive`）

让 DeepSeek Harness 右侧栏的终端在切换页签与会话时保留 xterm。空闲终端切回来可以直接继续使用。隐藏的终端如果继续输出，插件会暂停客户端的输出连接，切回来时读取 Host 的最新屏幕快照。

## 背景

右侧栏的 `terminal` 页签类型没有声明 `keepMounted`，所以 docking kit 在页签隐藏时把终端 body 卸载掉。切回来时会新建 xterm、重新 attach 到 Host 终端，并把整个屏幕（含最多 1000 行回滚）序列化重放一遍；跑全屏 TUI（`claude`、`codebuddy`、`vim`）或长输出时，这就是肉眼可见的“白闪 + 刷新 + 卡一下”。

## 实现

- **浏览器半侧**（`client.js`）包装官方 `terminal` 页签的组件，在包装生效后打开 `keepMounted`。停用插件时移除包装并恢复原来的标志。
- 页签隐藏期间如果没有收到新输出，现有连接会保留。收到新的屏幕帧后，插件通过官方终端视图的卸载回调释放客户端的输出连接。Host 上的 PTY 继续运行。
- 页签重新可见时，暂停过的视图走官方连接流程，用 Host 快照同步仍在挂载的 xterm。主题、快捷键、关闭终端和 Agent 终端工具由 DSH 处理。
- **Host 半侧**（`index.js`）没有行为，只为让 bundle 承载客户端插件。

## 安装

- 本机（开发目录）：**插件 → 添加插件 → 本地目录**，选本目录；或
  ```sh
  dsh plugin --profile desktop add "file:<本目录绝对路径>"
  ```
- 其他机器：用 `dist/` 里的 tarball（`dsh plugin add "…/local-dsh-terminal-keepalive-1.0.1.tgz"`），或用 Git 地址安装。
- 装完刷新一次页面（新 bundle 通常会通过 client graph 即时接入；刷新是兜底），不需要重启应用，也没有需要配置的项。

## 验证

1. 打开右侧栏终端，等输出停下来。切到文件页签或另一个会话后再回来，检查屏幕和回滚位置是否保留。
2. 让终端持续输出，再切走并返回。检查程序是否仍在运行，屏幕是否同步到最新输出。
3. 关闭终端页签，检查 Host 进程是否照常结束。

## 限制

- 隐藏的终端仍保留 xterm 和所属侧栏视图，占用相应内存。输出连接暂停后，切回可能短暂显示 `connecting`，Host 快照也可能改变原来的回滚位置。
- `keepMounted` 在公开 API 里是**按类型**的布尔量，无法只保留“最后一个”终端页签；按实例粒度的上限需要上游 dockkit 支持。
- 依赖 `sidebarRightTabs` 的 `keepMounted`、`slots` 的同键优先级和官方终端视图的 `mount` 清理回调。
- 只影响右侧栏的 `terminal` 类型；`dsh-better-sidebar` 的底部工作台终端是另一套实现，不受影响。

## 兼容性

针对 DSH 0.2.2-rc.5 的客户端接口开发。`terminal` 类型由 `@deepseek-ai/dsh-client-ui-sidebar-terminal` 提供，`keepMounted` 由 `@deepseek-ai/dsh-client-ui-sidebar-right` 的页签注册表消费。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半边：无行为，仅承载客户端插件 |
| `client.js` | 保留终端组件，暂停隐藏终端的持续输出 |
| `cordis.patch.yml` | 插入 `terminal-keepalive` 这一行 |
| `locale/{en,zh}.json` | 插件页的标题与描述 |
| `icon.svg` | 插件页图标 |
| `assets/icon-180.png` | 市场卡片图标（180×180） |

MIT License。
