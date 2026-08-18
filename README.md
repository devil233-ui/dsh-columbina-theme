<div align="center">

# DSH 哥伦比娅主题 🕊️

**为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 打造的原神角色「哥伦比娅」主题插件。**

背景、蒙版、配色——来自挪德卡莱的月光。

</div>

## 特性

- **浅色 / 深色双默认**：浅色模式默认背景 `columbina-1` + 浅色配色（字体 `#78007a`、输入框 `#c8d1fe`、侧边栏 `#e5eaff`）；深色模式默认背景 `columbina-2` + 深色配色（字体 `#acabf2`、输入框/侧边栏 `#140010`）。切换明暗模式时背景与配色一起切换。
- **可调蒙版**：0% = 背景原图效果（主界面面板通透度同步归零），越高越不透明，100% = 完全覆盖为当前明暗主题底色。
- **自定义颜色**：蒙版、输入框、侧边栏、字体颜色均可自定义（留空 = 跟随明暗主题默认色）。
- **自定义背景**：上传 PNG / JPEG / WebP / GIF 图片作为背景；放进 `assets/backgrounds/` 的任意图片自动成为预设。
- **选中会话标题特效**：当前会话标题使用蓝紫渐变文字与光晕。
- **通透的界面表面**：会话区、气泡等主内容表面的通透度跟随蒙版设置；输入框固定 80% 不透明；侧边栏与设置面板、菜单、对话框等浮层始终不透明，保证可读性。
- **首帧即生效**：主题样式通过 `webServer.tapIndex` 注入每次页面响应，加载无闪烁。

## 安装

前置条件：DeepSeek Harness（`dsh`）、Node.js ≥ 22、pnpm 在 PATH。

### 1. 完全退出 DSH

先关闭 DSH Host（不只是关闭浏览器标签页）。

### 2. 安装插件

从 GitHub / npm（发布后）：

```powershell
dsh plugin --profile web add github:hyposelen1a/dsh-columbina-theme
# 或发布到 npm 后：
dsh plugin --profile web add dsh-columbina-theme
```

本地开发调试（link 方式）：

```powershell
dsh plugin --profile web add link:C:/dsh/columbina-theme
```

也可以手动编辑 `$DSH_HOME/profiles/web/package.json`，把 `dsh-columbina-theme` 加入 `dependencies` 和 `dsh.profile.bundles`，然后在该目录执行 `pnpm install`。

### 3. 重启 DSH Web

重新启动 `dsh web`，并**硬刷新浏览器**（Ctrl+F5）。打开 **设置 → 插件 → 哥伦比娅主题** 即可配置。

### 临时禁用

不用卸载，编辑 `$DSH_HOME/profiles/web/cordis.patch.yml` 加两行并重启：

```yaml
- id: dsh-columbina-theme
  disabled: true
```

删除这两行（或改回 `false`）并重启，即可恢复启用。

## 使用

设置路径：**设置 → 插件 → 哥伦比娅主题**。

| 设置项 | 说明 |
| --- | --- |
| 背景预设 | 预设网格（随包附带的 columbina-1/2 + 你放进 `assets/backgrounds/` 的图片）；留空 = 自动（浅色 columbina-1 / 深色 columbina-2），再点一次当前项可恢复自动 |
| 上传自定义图片 | 上传 PNG/JPEG/WebP/GIF（≤ 15MB），自动切换为自定义背景 |
| 蒙版不透明度 | 0% = 原图效果（面板通透度同步归零），越高越不透明，100% = 完全覆盖为当前明暗主题底色 |
| 字体颜色 | 默认跟随明暗配色；选择后同时用于两种配色 |
| 蒙版颜色 | 自定义蒙版底色（留空 = 跟随明暗主题） |
| 输入框颜色 | 自定义输入框颜色（固定 80% 不透明；留空 = 跟随明暗主题） |
| 侧边栏颜色 | 自定义侧边栏颜色（始终不透明；留空 = 跟随明暗主题） |
| 选中会话标题特效 | 开关当前会话标题的渐变 + 光晕效果 |

设置保存在 `$DSH_HOME/settings.yaml`（`dsh-columbina-theme` 命名空间）；上传的自定义图片与预设缩略图缓存保存在 `$DSH_HOME/storages/dsh-columbina-theme/`。

### 添加自己的预设背景

把图片（`svg` / `png` / `jpg` / `jpeg` / `webp` / `gif`）放进插件的 `assets/backgrounds/` 目录，文件名只含字母、数字、`-`、`_`（如 `columbina-3.jpg`），重启 DSH 后自动出现在预设网格（id 用文件名，标签显示文件名），无需改代码。

> 位图（png/jpg/webp/gif）**超过 512KB** 时，设置网格自动使用服务端生成的预览缩略图（640px 宽 JPEG，缓存于 `$DSH_HOME/storages/dsh-columbina-theme/thumbs/`），点选作为背景时才加载原图；小图与 SVG 直接用原图。

## 开发

```text
src/index.js    Host 插件：设置注册、config/上传端点、预设/缩略图/自定义图片静态路由；
                webServer.tapIndex 把主题 <style> 注入每次 index.html（首帧即生效）
lib/client.js   浏览器插件：主题 token 覆盖（ctx.theme.overrideTokens）、
                --columbina-* 自定义属性、选中标题特效、设置卡片
assets/backgrounds/  预设背景目录：放入图片即自动成为新预设
cordis.patch.yml     bundle 补丁（向组合中插入插件条目）
scripts/smoke-test.mjs   端到端冒烟测试（需要 playwright-core 与系统 Edge/Chrome）
scripts/screenshot.mjs   生成 README 截图
```

主题在两端各有一份取值表（host 的 `SCHEME_DEFAULTS`/`surfaceTokens`/`labelTokens` 与 client 的 `buildTokens`），两者必须保持一致——host 负责首帧静态注入，client 负责运行期热更新（presenter 写入的 body 内联变量优先于静态样式表）。改动任何一边后重启 DSH Web 生效，并可用冒烟测试核对。

冒烟测试（需先启动一个测试实例）：

```powershell
# 在临时工作目录启动一个测试实例
cd C:\dsh\columbina-e2e-ws
dsh --profile web --port 0
# 另开一个终端，把输出里的 URL 传给脚本
$env:E2E_BASE = "http://127.0.0.1:<端口>"
node scripts/smoke-test.mjs
```

## 已知限制

- 选中会话标题特效依赖会话行的 DOM 结构（`role="treeitem"` + 标题 span 的 `_title` 类后缀），DSH 界面内部类名随版本变化时可能需要调整选择器。
- 表面透明度通过 CSS token 覆盖实现，DSH 版本升级后个别表面可能不再受控。
- 多实例共享 `$DSH_HOME/settings.yaml` 时，并发写入以最后一次为准。

## 素材版权说明

- 代码与程序生成的预设资源采用 [MIT](LICENSE) 许可。
- 随包附带的两张背景图 `columbina-1.png` / `columbina-2.png` 为**作者自备素材，版权归原作者所有**；若涉及米哈游《原神》官方素材或他人同人作品，请勿随仓库公开分发，或替换为你自己的原创图片后再发布（放进 `assets/backgrounds/` 即可，无需改代码）。详见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。

## 许可

MIT License。
