# 图表类型全量渲染测试报告（xmermaid-live + @evangwt/xmermaid 0.3.0）

日期：2026-09-09 ~ 09-10 · 环境：本仓库生产构建 + `npm run serve:test` + Playwright（Chromium / Firefox / WebKit），应用默认主题。

## 迭代历史

- **迭代 1（测试与识别）**：为 `DIAGRAM_CATALOG` 全部 30 个图表家族编写复杂示例，通过真实应用 UI 渲染并逐一目检 → 30/30 出图，识别出 12 类渲染缺陷。
- **迭代 2（修复与重测）**：探测可用替代语法 + 修复应用代码 → 全量重测 + 目检确认。恢复了 flowchart（`linkStyle default`）、architecture（junction + 带端口箭头）两个家族的完整复杂示例；修复了 C4 空白预览。
- **迭代 3（审查与加固）**：对迭代 2 的修复、脚本与报告做敌意审查，发现 1 处错误归因（已实验证伪并修正）与若干工程缺陷（假设未声明、失败原因被回退机制吞掉、修复无 CI 防线、单浏览器验证、产物未受版本控制），全部落地修复（见下）。

## 最终状态（迭代 3 验收）

- **渲染矩阵**：30/30 家族渲染成功、类型识别正确。稳定性：chromium 连续 3 轮全绿；firefox、webkit 各 1 轮全绿。三引擎 variant 分布一致（complex 28 / fallback 2：mindmap、zenuml——受上游缺陷所限的最复杂可渲染形式）。
- **C4 修复跨引擎生效**：三引擎 viewBox 均为 `958.55×356`，71% 缩放完整可见；离群坐标元素计数 0。
- **质量门**：单元测试 134/134（preview-svg 10 个用例）、typecheck 通过、e2e 149/149。

## 迭代 2/3 的修复内容

| 问题 | 修复 | 验证 |
| --- | --- | --- |
| C4 预览 fit=1% 画布全白（渲染器把未连接 `Deployment_Node` 的标签放到 `Number.MAX_VALUE`，bbox 撑到 33M px） | `src/preview-svg.ts`：① 清理坐标超过 100 万或非法的 `text` 元素；② viewBox 超过 10 万像素视为病态，用内容实测边界重建；③ 测量时只取 svg 根的**直接子元素**（`getBBox` 返回自身用户空间，深后代混坐标系），并排除超出可信限的元素 | C4 viewBox `33554520×33554440` → `958.55×356`，71% 完整可见（`output/diagram-matrix/chromium/run3/c4.png`）；jsdom 单测 10 个（新增 7）；三引擎矩阵确认 |
| flowchart `linkStyle 0 …` 渲染失败 | 探测发现 `linkStyle default …` 可用（按索引写法被渲染器拒绝），示例改用 default | flowchart 复杂版，边线全部蓝色 2px（`chromium/run3/flowchart.png`） |
| architecture junction 渲染失败 | 探测发现 junction 需配带端口箭头（`api:R --> L:bus`）；裸 `<-->` 会挂起渲染（见下），示例去除 | architecture 复杂版，junction 渲染为节点（`chromium/run3/architecture.png`） |
| 上一轮引入的 c4 重复元素 id | 删除重复的 `ContainerDb(cache, …)` | c4 复杂版稳定渲染 |

## 审查修正记录

- **错误归因修正**：早先报告称「junction + 双向箭头同图 → 渲染无限挂起」。`probes/probe16.mjs` 的 2×2 隔离矩阵证明：**裸 `<-->`（不带端口）单独即无限挂起，与 junction 无关**（裸 ± junction 均挂起 2/2；带端口 `search:R <--> L:db` + junction 正常 2/2）。junction 无辜。
- **措辞修正**：「mindmap 任意图标写法均整图失败」→「实测的 12 种常见写法（名称 × `fa fa-`/`fa:fa-`/裸名 三种前缀）均失败」。

## 渲染器缺陷清单（@evangwt/xmermaid 0.3.0，npm 最新版，根因在上游）

1. architecture 裸双向箭头 `<-->`（不带端口）→ 渲染无限挂起（promise 永不完成），与 junction 无关。复现：`probes/probe16.mjs`。
2. C4 未连接 `Deployment_Node` 标签坐标 = `1.7976931348623157e+308`。取证：`probes/probe15.mjs`。应用已在 `src/preview-svg.ts` 防御。
3. class 成员块吞掉其后的全部语句；命名空间体内不允许成员行/分类符。复现：`probes/probe4.mjs`、`probe5.mjs`。
4. sequence `<-->`：带标签产生幽灵参与者（`A <`），无标签整图解析失败。复现：`probes/probe4.mjs`。
5. mindmap `::icon()` 实测的 12 种常见写法（名称 × `fa fa-`/`fa:fa-`/裸名 前缀）均整图失败。复现：`probes/probe9.mjs`。
6. flowchart 按索引 `linkStyle` 失败（仅 `default` 关键字可用）；小尺寸双圆节点文字压环。
7. gantt `title` 与日期轴缺失；timeline `section` 丢弃；user-journey 布局退化为单行条带。
8. zenuml 声明（participant/actor）与块语法整图失败；可渲染形式退化为参与者图布局，同对参与者多条消息标签重叠。
9. ishikawa 密集原因标签重叠不可读；venn/cynefin/swimlanes/requirement/radar/pie/gitgraph/treeview 存在文字重叠或裁切类小问题。

## 30 个家族最终状态（chromium run3；firefox/webkit 分布一致）

| 家族 | 用例 | 状态 | 备注 |
| --- | --- | --- | --- |
| flowchart | 复杂版（linkStyle default） | ✅ | 形状/子图/classDef/`&`链/实体编码/扩展边全渲染 |
| swimlanes | 复杂版 | ✅ | 边标签被节点部分遮挡 |
| sequence | 复杂版 | ✅ | autonumber/box/rect/alt/loop/par/critical/break/destroy 全渲染 |
| class | 复杂版 | ✅ | 命名空间/8 关系/样式/成员块（置尾） |
| state | 复杂版 | ✅ | choice/fork/join 需空格写法 `<< choice >>` |
| er | 复杂版 | ✅ | 优秀 |
| user-journey | 复杂版 | ✅ | 布局退化为条带（上游） |
| gantt | 复杂版 | ✅ | `title`/日期轴缺失（上游） |
| pie | 复杂版 | ✅ | 图例被饼体遮挡 |
| quadrant | 复杂版 | ✅ | 优秀 |
| requirement | 复杂版 | ✅ | 良好 |
| gitgraph | 复杂版 | ✅ | 分支/合并/cherry-pick/HIGHLIGHT 正确 |
| c4 | 复杂版 | ✅ | **已修复**：三引擎完整可见 |
| mindmap | 回退版（无 `::icon`） | ✅ | attempt 记录完整呈现失败链 |
| timeline | 复杂版 | ✅ | `section` 被上游丢弃 |
| zenuml | 回退版（纯消息） | ✅ | 声明/块上游不支持 |
| sankey | 复杂版 | ✅ | 优秀 |
| xychart | 复杂版 | ✅ | 良好 |
| block | 复杂版 | ✅ | 良好 |
| packet | 复杂版 | ✅ | 优秀 |
| kanban | 复杂版 | ✅ | 优秀（ticket 元数据） |
| architecture | 复杂版（junction + 端口箭头） | ✅ | **已修复** |
| radar | 复杂版 | ✅ | 优秀 |
| event-modeling | 复杂版 | ✅ | 泳道 + 9 帧完整 |
| treemap | 复杂版 | ✅ | 优秀 |
| venn | 复杂版 | ✅ | 并集标签轻微重叠 |
| ishikawa | 复杂版 | ✅ | 原因标签大面积重叠（上游） |
| wardley | 复杂版 | ✅ | 优秀 |
| cynefin | 复杂版 | ✅ | 中心转换标签轻微重叠 |
| treeview | 复杂版 | ✅ | 顶部节点轻微裁切 |

## 质量门（迭代 3 验收）

- 渲染矩阵：chromium ×3、firefox ×1、webkit ×1，全部 30/30（`npm run test:diagrams -- --browser=<name> --runs=<n>`）
- 单元测试 `npm test`：134/134（preview-svg 10 个用例）
- 类型检查 `npm run typecheck`：✅
- e2e `npm run test:e2e`：149/149
- CI：`.github/workflows/diagram-matrix.yml`（每周一 03:00 UTC + 手动触发，三浏览器矩阵，产物上传）

## 产物与位置

- `scripts/diagram-matrix/examples.mjs` — 30 个复杂示例 + 4 个回退示例（受版本控制）
- `scripts/diagram-matrix/render-matrix.mjs` — 批量渲染 runner（多浏览器、attempt 全记录、complex 失败先重试一次）
- `scripts/diagram-matrix/probes/` — 16 个探针脚本，每条上游缺陷结论的最小复现
- `scripts/diagram-matrix/REPORT.md` — 本报告（受版本控制）
- `output/diagram-matrix/<browser>/run<k>/` — 截图与 SVG 产物；`output/diagram-matrix/<browser>/report-run<k>.json` — 结构化报告（含每次 attempt 的状态与诊断）
