# OpenCU 2.0.6

- 为真实 REA 地址建议补齐当前会话的 ThreadScope／RouteScope，修复该建议入口触发的 `Missing scope instance`。
- 保留选择建议、Escape 关闭、继续编辑和组件卸载行为。
- 分别提供 `2.0.6-dsh.0.2.1-rc.1` 与 `2.0.6-dsh.0.2.1-rc.2`，保留原有 Helper 与扩展身份。

- Supplies the current conversation's ThreadScope/RouteScope to the original REA address suggestions, fixing `Missing scope instance` in that suggestion entry.
- Preserves suggestion selection, Escape dismissal, continued editing and component teardown.

[下载、完整双语更新说明与安装](docs/releases.md)

# OpenCU 2.0.3

- 隔离电脑 JavaScript 执行，保持停止、会话绑定与故障恢复。
- 修复 Windows／Linux 持键、持鼠与移动操作的一致性。
- 修复断线释放、迟到观察及共享文档服务保存／释放顺序，失败后保留编辑状态并可重试。
- 分别提供 `2.0.3-dsh.0.2.1-rc.1` 与 `2.0.3-dsh.0.2.1-rc.2`，保留签名 Helper 与扩展身份。

[下载、完整双语更新说明与安装](docs/releases.md)

# OpenCU 2.0.2

- 审批绑定请求目标身份，防止应用或标签页变化后复用旧授权。
- 修复控制器、macOS Helper 与 MV3 扩展观察等待的取消，停止时释放持键与持鼠并隔离迟到响应。
- 保持浏览器截图与观察信息一致；结果不明的输入不自动重放。
- 修复 Chrome／Edge 连接设置说明被挤成单字窄列的问题，安装与配对步骤改为上下排列。
- 固化 rc.1／rc.2 完整 SDK、前端及根 npm 锁，构建强制冻结并核对实际安装版本。
- 分别发布 `2.0.2-dsh.0.2.1-rc.1` 与 `2.0.2-dsh.0.2.1-rc.2`，保留已签名 macOS Helper。

[下载、完整双语更新说明与安装](docs/releases.md)

## 2.0.1

- 浏览器扩展的单次状态查询复用工具栏与扩展列表中的同一图标结果，后续查询仍重新读取，保留图标更新与失败重试。

# OpenCU 2.0.0

- 重写电脑与浏览器控制，统一持久 JavaScript 入口、语义观察、差分与定位器。
- 集成真实浏览器、批注与监看组件，保留后台操作及目标归属保护。
- 修复异步预览、macOS 截图重试、后台按钮及 Helper 执行权限。
- 分别发布 `2.0.0-dsh.0.2.1-rc.1` 与 `2.0.0-dsh.0.2.1-rc.2`，使用匹配宿主 SDK 和构建。
- 2.0 为重写系列公开版本；本地 0.1.x 候选纳入本次发行，旧 1.x 固定发行保留。

[下载与安装](docs/releases.md)
