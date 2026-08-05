# xmermaid Live

[English](README.md) | [简体中文](README.zh-CN.md)

[![GitHub Pages](https://img.shields.io/github/actions/workflow/status/evangwt/xmermaid-live/deploy-pages.yml?branch=main&label=GitHub%20Pages&logo=github)](https://github.com/evangwt/xmermaid-live/actions/workflows/deploy-pages.yml)
[![在线编辑器](https://img.shields.io/badge/try-live%20editor-0b7a53?logo=githubpages)](https://evangwt.github.io/xmermaid-live/)
[![xmermaid npm](https://img.shields.io/npm/v/%40evangwt%2Fxmermaid?label=%40evangwt%2Fxmermaid&logo=npm)](https://www.npmjs.com/package/@evangwt/xmermaid)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-0b7a53.svg)](LICENSE)

**基于 [@evangwt/xmermaid](https://www.npmjs.com/package/@evangwt/xmermaid) 的纯前端 Mermaid 图表工作台。** 可直接粘贴 Markdown、提取多个图表、编辑源码、查看兼容性诊断、预览原生 SVG，并支持导出和分享；用户文档始终留在浏览器中，不会上传到服务器。

<p>
  <a href="https://evangwt.github.io/xmermaid-live/"><strong>打开在线编辑器</strong></a>
  &nbsp;|&nbsp;
  <a href="https://github.com/evangwt/xmermaid"><strong>查看渲染器</strong></a>
</p>

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 纯浏览器运行 | 静态站点，无后端、无文档上传。 |
| 多图表工作流 | 从一份文档中提取、选择、编辑并预览多个 Mermaid 或 xmermaid 代码块。 |
| 明确兼容性反馈 | 展示渲染器实际支持边界及可复制的诊断信息。 |
| 可携带输出 | 使用安全的 URL hash 分享，或导出 SVG，不上传用户内容。 |

> **隐私：** xmermaid Live 是客户端应用。图表源码只留在浏览器中：工作区会缓存在本地存储，也可选择编码到 URL hash；内容绝不会上传到本项目或任何服务器。清除该站点的浏览器数据即可删除本地缓存。

## 环境要求

- Node.js 22 或更高版本
- 用于端到端验证的 Chrome/Chromium、Firefox 和 WebKit

## 本地开发

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

粘贴包含一个或多个 `mermaid` / `xmermaid` 围栏代码块的 Markdown。只由一个已识别原始 Mermaid 图表组成的文档也受支持。xmermaid 通过自身支持契约发现 Mermaid 11.16.0 图表目录（30 个有文档的图表族）；当前部分原生渲染支持的标识为：`flowchart`、`swimlanes`、`sequence`、`class`、`state`、`er`、`user-journey`、`gantt`、`pie`、`quadrant`、`requirement`、`gitgraph`、`c4`、`mindmap`、`timeline`、`zenuml`、`sankey`、`xychart`、`block`、`packet`、`kanban`、`architecture`、`radar`、`event-modeling`、`treemap`、`venn`、`ishikawa`、`wardley`、`cynefin` 和 `treeview`。计划中的图表族仍可选择，并会提供诊断与可复制的复现源码。

完整文档编辑导致图表列表变化时，选择状态会通过未变化的开头/结尾图表映射；当一段内容中存在重复或复杂重排时，会尽力保持相对序号。

## 工作台操作

在桌面端，可拖动任意分隔栏调整图表列表、编辑器和预览区的尺寸；聚焦分隔栏后可用方向键精确调整，按住 `Shift` 增大步进，双击可恢复默认布局。可折叠列表而不丢失当前图表。

预览控制只改变本地视图：缩放范围为 25% 至 400%，适配预览会恢复合适的视图，浏览器阻止全屏时会回退到应用内最大化预览。面板布局会本地保存；预览缩放和平移会在刷新后重置，且不会进入分享链接。

在紧凑布局下，图表、编辑和预览会移至底部导航；分享和导出位于更多菜单；图表样式会以全高面板打开，完成后返回之前的面板。

## 验证

```bash
npm run verify
```

验证套件包含单元测试、类型检查、生产构建、真实 WASM 和浏览器检查。所有场景均在 Chrome/Chromium 运行；核心编辑流程及根路径/子路径部署冒烟测试也在 Firefox 和 WebKit 运行。

浏览器容量契约覆盖 1,000 个 Mermaid 图表的同步提取和列表更新，在验证环境中须少于 1.5 秒。这不是增量解析器；更大的文档在提取和 WASM 渲染期间仍可能阻塞浏览器主线程。

## 静态部署

### GitHub Pages

公开站点为 <https://evangwt.github.io/xmermaid-live/>。工作流 `.github/workflows/deploy-pages.yml` 会在每次推送到 `main` 时构建和部署，也可在 Actions 页面手动运行。

首次部署前，在 GitHub 的 **Settings -> Pages** 中把 **Build and deployment -> Source** 设为 **GitHub Actions**。

### 搜索与 AI 检索

静态首页提供中英文元数据、如实描述的 SoftwareApplication 结构化数据、站点地图、爬虫规则和 `llms.txt`。这些文件说明了浏览器端 Mermaid 编辑器、实际运行时支持边界，以及不上传用户文档这一事实。

```bash
npm run build
```

将生成的 `dist/` 目录部署到任意静态托管服务。资源使用相对 URL，因此同一输出既可部署到域名根路径，也可部署到 `/xmermaid-live/` 等子路径。构建完成后不需要服务器 API、Node 进程或 Rust 工具链。

用户文档仅保留在浏览器内存、本地存储和可选 URL hash 状态中，应用不会上传文本内容。清除该站点的浏览器数据即可删除本地缓存。

分享链接限制为 50,000 个字符的编码 URL hash。更长的文档仍可编辑和导出，但应用不会将其放入地址栏，因为浏览器和托管服务的 URL 限制并不一致。

## xmermaid 依赖

构建从 `registry.npmjs.org` 安装精确版本 `@evangwt/xmermaid@0.1.10`。npm 发布包携带关联公开 [xmermaid 仓库](https://github.com/evangwt/xmermaid)的签名 provenance，因此本仓库不再重复提交包归档。

## 开源许可

MIT。完整文本见 [LICENSE](LICENSE)。
