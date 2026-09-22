# xmermaid Live

[English](README.md) | [简体中文](README.zh-CN.md)

[![GitHub Pages](https://img.shields.io/github/actions/workflow/status/evangwt/xmermaid-live/deploy-pages.yml?branch=main&label=GitHub%20Pages&logo=github)](https://github.com/evangwt/xmermaid-live/actions/workflows/deploy-pages.yml)
[![在线编辑器](https://img.shields.io/badge/try-live%20editor-0b7a53?logo=githubpages)](https://evangwt.github.io/xmermaid-live/)
[![xmermaid npm](https://img.shields.io/npm/v/%40evangwt%2Fxmermaid?label=%40evangwt%2Fxmermaid&logo=npm)](https://www.npmjs.com/package/@evangwt/xmermaid)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-0b7a53.svg)](LICENSE)

**粘贴你的 AI 聊天记录，得到全部图表。** [@evangwt/xmermaid](https://www.npmjs.com/package/@evangwt/xmermaid) Rust/WASM 渲染器的工作台 —— 无需账号、没有服务器、不做上传。

![xmermaid Live 工作台从一篇 Markdown 文档中提取出两张流程图](https://raw.githubusercontent.com/evangwt/xmermaid-live/main/docs/assets/hero-workbench.png)

<p>
  <a href="https://evangwt.github.io/xmermaid-live/"><strong>打开在线编辑器</strong></a>
  &nbsp;|&nbsp;
  <a href="https://github.com/evangwt/xmermaid"><strong>查看渲染器</strong></a>
</p>

## 为什么选择 xmermaid Live？

- **每张图都提取，而非只有一张** —— 围栏、未闭合、散文中的裸图表，一次遍历全部识别（验证环境中 1,000 张图表少于 1.5 秒）
- **对 AI 语法友好** —— 与渲染器同一套清洗：HTML 标签、Markdown 字符串、装饰性 `classDef` 都能渲染
- **逐图表的诚实反馈** —— 真实支持状态、可复制诊断、复现源码
- **架构级隐私** —— 纯静态站点，工作区只留在你的浏览器里
- **输出可携带** —— SVG/PNG 导出；分享链接走 URL hash（上限 50,000 字符）

> **隐私：** 纯客户端。图表源码缓存在本地存储，可选编码进 URL hash —— 绝不上传到本项目或任何服务器。清除该站点的浏览器数据即可删除缓存。

## 背后的渲染器

[`@evangwt/xmermaid`](https://github.com/evangwt/xmermaid) 之上的一层轻量静态外壳：Rust/WASM 渲染器，机器可读矩阵覆盖 Mermaid 11.16.0 目录（30 个有文档图表族）。User Journey、Gantt、Pie 完全支持；其余渲染有文档的子集。

完整契约见[渲染器 README](https://github.com/evangwt/xmermaid#what-renders-today)。

## 工作台

- **三栏布局随你调整** —— 可拖拽分隔栏、键盘微调，布局本地保存
- **预览控制只影响本地** —— 缩放 25%–400%、适配、全屏；缩放与平移不进入分享链接
- **小屏适配** —— 移动端底部导航；分享/导出在更多菜单
- **诚实的可视化编辑** —— AST 校验管道，先经解析与渲染验证再写回源码；class 样式源码保持只读

## 本地开发

- Node.js 22+；Chrome/Chromium、Firefox、WebKit 用于验证

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

构建固定精确的 `@evangwt/xmermaid` 版本 —— 已发布版本取自 `registry.npmjs.org`；尚未 `npm publish` 的版本可固定被 gitignore 的 `vendor/evangwt-xmermaid-<version>.tgz`。

## 验证

```bash
npm run verify
```

单元测试、类型检查、生产构建、真实 WASM 与浏览器检查。所有场景在 Chrome/Chromium 运行；核心编辑流程与部署冒烟也在 Firefox 和 WebKit 运行。

容量契约：验证环境中 1,000 张 Mermaid 图表的同步提取与列表更新少于 1.5 秒。这不是增量解析器 —— 更大的文档仍可能阻塞主线程。

### 图表矩阵

```bash
npm run serve:test &
npm run test:diagrams -- --browser=chromium --runs=2
```

为每个图表族渲染一个复杂示例（`scripts/diagram-matrix/examples.mjs`）并截图预览；报告写入 `output/diagram-matrix/<browser>/`。同样运行在 CI（`.github/workflows/diagram-matrix.yml`）。

`scripts/diagram-matrix/REPORT.md` 记录支持边界与已知上游缺陷。

## 部署

**GitHub Pages** —— <https://evangwt.github.io/xmermaid-live/>。`.github/workflows/deploy-pages.yml` 在每次推送到 `main` 时部署。首次部署前，将 **Settings → Pages → Build and deployment → Source** 设为 **GitHub Actions**。

**任意静态托管：**

```bash
npm run build
```

`dist/` 使用相对 URL —— 可部署在域名根路径或 `/xmermaid-live/` 等子路径。构建后无需服务器 API、Node 进程或 Rust 工具链。

分享链接上限 50,000 字符的 URL hash；更长的文档仍可编辑导出，但不会进入地址栏。

**搜索与 AI 检索** —— 首页内置中英文元数据、如实描述的 SoftwareApplication 结构化数据、站点地图、爬虫规则与 `llms.txt`。

## 许可证

MIT。完整文本见 [LICENSE](LICENSE)。
