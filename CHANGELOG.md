# Changelog

All notable changes to this project are documented in this file.

## [0.2.1] - 2026-10-18

### Fixed

- 桌面端壁纸不显示：主题不再只通过 `webServer.tapIndex` 注入 HTTP 返回的 index.html，而是改用 `webserver/index-inject` 结构化注入行。WebServer 会把同一张注入表渲染进 Web 端 index，Electron 也会在启动时收取该表并应用到自己的本地 index，因此背景图、蒙版与标题特效在桌面端恢复；颜色本来就经客户端 token 生效，现在图层也齐了。
- Windows 标题栏布局（`data-windows-titlebar`）会把整个窗口 frame 涂成不透明的侧边栏底色，即使图层已注入也会被遮住；主题现在把该 frame 及其标题栏条改回半透明的 base 表面，壁纸在桌面端可见。
- 深色模式下运行期修改背景/蒙版颜色不立即生效：客户端把 `--columbina-bg-image`、`--columbina-mask-alpha`、`--columbina-mask-rgb` 写到 `<body>` 内联样式（而不是 `<html>`），避免被注入样式表中 `body[data-ds-dark-theme]` 的同名声明遮蔽。
- 清除自定义蒙版颜色后深色模式仍保留旧值：客户端现在始终写入当前配色的具体蒙版 RGB，而不是删除属性后回落到可能过期的静态样式。

### Changed

- `buildStaticStyle()` 保留为旧宿主 `tapIndex` 的回退；新增 `buildStaticInjections()` 生成 `{ kind: 'style' }` 与 `{ kind: 'script', placement: 'body' }` 行（与 DSH 自身主题的注入方式一致）。冒烟测试改为按 CSS 标记定位注入的样式。

## [0.2.0] - 2026-10-18

### Changed

- 适配 DeepSeek Harness `0.2.1-rc.2`（`cordis ^4.0.5`、`dsh-* ^0.2.0-rc.1`）。
- 设置改用 DSH 0.2 的插件 Config / settings forms 模型：`src/index.js` 导出的 `Config` 字段全部标记为 `volatile`，经 `ctx.settings.describe/update` 按插件条目 id 读写；删除了对已移除的 `ctx.settings.register` 与 `@deepseek-ai/dsh-client-ui-slots` 包的依赖（保留旧宿主上的 `register` 回退）。
- 设置卡片注册到 0.2 的两个插槽：`settings.plugins.tab`（设置 → 内置插件 → 哥伦比娅主题）与 `plugins.bundle.config`（插件页 `dsh-columbina-theme` 详情页）；旧版 `settings.plugin.item` 仍保留为回退。
- 设置改存于 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 的插件条目；首次启动时自动把旧 `settings.yaml` 中 `dsh-columbina-theme` 段落迁移过来（仅当该条目尚无用户配置）。
- 明暗切换的监听改为同时使用 `theme/change` 快照与 `data-ds-dark-theme` MutationObserver，修复订阅顺序导致深色模式下背景不切换的问题；卸载时释放 `overrideTokens` 图层。
- `cordis.patch.yml` 不再写入默认 config，默认值交给 Config schema，避免默认值挡住旧设置迁移。

### Fixed

- 0.2 下 `ctx.settings.register` 不存在导致插件加载失败的问题。
- 深色 / 浅色切换时 `--columbina-bg-image` 不跟着切换的问题。
- 设置卡片在插件详情页中的可读性（使用 `--dsw-alias-settings-card-fill` 作为卡片底色）。

## [0.1.0] - 2026-08-18

### Added

- 哥伦比娅主题插件首个版本。
- 背景预设与自定义背景：`assets/backgrounds/` 目录自动扫描（放入图片即成为预设），支持上传 PNG / JPEG / WebP / GIF 自定义背景（≤ 15MB）。
- 大图自动生成预览缩略图（> 512KB 的位图预设，640px JPEG，缓存于 `$DSH_HOME/storages/dsh-columbina-theme/thumbs/`）。
- 可调蒙版：0% = 原图效果（主界面面板通透度同步归零），100% = 完全覆盖为当前明暗主题底色。
- 浅色 / 深色双默认：背景（columbina-1 / columbina-2）与配色（字体、输入框、侧边栏、蒙版颜色）随明暗主题切换。
- 自定义颜色：蒙版、输入框、侧边栏、字体颜色均可单独设置（留空 = 跟随明暗主题默认色）。
- 选中会话标题特效：当前会话标题的蓝紫渐变文字 + 光晕（可开关）。
- 输入框固定 80% 不透明；侧边栏、设置面板、菜单、对话框保持不透明。
- 主题样式通过 `webServer.tapIndex` 注入每次页面响应，首帧即生效、无闪烁。
- 设置卡片（设置 → 插件 → 哥伦比娅主题）：预设网格、上传、蒙版滑块、四个颜色选择器、标题特效开关。

### Changed

- 移除早期内置的 6 张 SVG 预设背景。

### Fixed

- 蒙版为 0 时主界面面板残留半透明白膜导致"不完全透明"的问题（面板通透度改为跟随蒙版值）。
- 自定义颜色被直接拼入 `rgba(#hex, …)` 的无效 CSS（统一转换为 `r, g, b`）。
- 资源路由只识别 `.svg` 导致 jpg/png 预设 404 的问题。
