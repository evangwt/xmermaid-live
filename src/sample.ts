export const SAMPLE_DOCUMENT = `# xmermaid live, drawn by its own renderer

Every diagram below is the tour: one product, thirty-odd views, all drawn by the renderer you are about to use.

## 01 · What happens when you paste

~~~mermaid
flowchart TD
  Paste["You paste a document"] --> Extract["Extractor scans it"]
  Extract --> Found{How many diagrams?}
  Found -->|one| Solo["Single-diagram view"]
  Found -->|a few| List["Selectable list"]
  Found -->|hundreds| Virtual["Virtualized list"]
  Solo --> Edit
  List --> Edit["Edit any diagram"]
  Virtual --> Edit
  Edit --> Preview["Live SVG preview"]
  Preview --> Export["Export or share"]
  classDef flow fill:#eef7ff,stroke:#2b6cb0,color:#1a365d
  classDef win fill:#f0fff4,stroke:#38a169,color:#22543d
  class Paste,Extract flow
  class Preview,Export win
~~~

## 02 · The syntax AI writes

HTML labels, line breaks, Markdown strings, edge IDs, quoted labels, and classDef cosmetics — paste AI output and it renders.

~~~mermaid
flowchart TD
  Start(["User asks an AI<br/>for an architecture"]) --> Answer["AI replies with<br/><b>Mermaid text</b>"]
  Answer --> Paste[Paste into xmermaid]
  Paste e1@--> Check{Renders?}
  Check -->|"yes, <br/>labels included"| Ship["fa:fa-rocket Ship it"]
  Check -->|no| Report["\`**file an issue** with the source\`"]
  User & Paste --> Share[Share the URL hash]
  classDef accent fill:#eef7ff,stroke:#2b6cb0,color:#1a365d,font-size:14px
  classDef good fill:#f0fff4,stroke:#38a169,color:#22543d
  class Start,Answer accent
  class Ship good
~~~

## 03 · The render pipeline

~~~mermaid
flowchart LR
  Source --> Lexer
  Lexer --> Parser
  Parser --> AST[Diagram AST]
  AST --> Layout
  Layout --> Draw[WASM layout]
  Draw --> SVG[SVG preview]
~~~

## 04 · The share handshake

~~~mermaid
sequenceDiagram
  autonumber
  participant You
  participant Workbench
  participant Renderer
  participant Hash
  You->>+Workbench: Click Share
  Workbench->>+Renderer: Current diagram source
  Renderer-->>-Workbench: Verified renderable
  rect rgb(235, 244, 255)
    Workbench->>+Hash: Encode document
    Hash-->>-Workbench: URL-safe hash
  end
  Workbench-->>-You: Link copied
  Note right of Hash: Nothing leaves the browser
~~~

## 05 · The editor object model

~~~mermaid
classDiagram
  class Workspace
  class Document
  class Diagram
  class Preview
  class Exporter
  Workspace o-- Document
  Document *-- Diagram : contains
  Diagram --> Preview : renders into
  Preview --> Exporter
  classDef core fill:#eef7ff,stroke:#2b6cb0,color:#1a365d
  classDef edge fill:#fffbeb,stroke:#d69e2e,color:#744210
  class Workspace,Document core
  class Preview,Exporter edge
~~~

## 06 · A diagram's life

~~~mermaid
stateDiagram-v2
  [*] --> Pasted
  Pasted --> Extracted : scan
  Extracted --> Editing
  Editing --> Previewing
  Previewing --> Editing : tweak
  Previewing --> Shared : share
  Previewing --> Exported : export
  Shared --> [*]
  Exported --> [*]
  note right of Previewing : zoom and pan stay local
~~~

## 07 · Workspace storage

~~~mermaid
erDiagram
  WORKSPACE ||--o{ DOCUMENT : keeps
  DOCUMENT ||--o{ DIAGRAM : contains
  DIAGRAM ||--o{ DIAGRAM_VERSION : snapshots
  WORKSPACE {
    string id PK
    string locale
  }
  DOCUMENT {
    string id PK
    text raw
    int diagram_count
  }
  DIAGRAM {
    string id PK
    string family
    text source
  }
~~~

## 08 · First five minutes

~~~mermaid
journey
  title First five minutes
  section Discover
    Open the editor: 5: Visitor
    Read the support banner: 3: Visitor
  section Paste
    Drop in an AI answer: 5: Visitor
    Watch the list fill up: 5: Visitor
  section Ship
    Tweak one label: 4: Visitor
    Export the SVG: 5: Visitor
~~~

## 09 · Renderer roadmap

~~~mermaid
gantt
  title Renderer roadmap
  dateFormat YYYY-MM-DD
  excludes weekends
  section Shipped
    HTML label sanitization :done, 2026-09-14, 4d
    Edge ID parsing :done, 2026-09-16, 3d
  section Now
    Per-node font sizing :active, 2026-09-21, 5d
  section Next
    Class-diagram cssClass styling :2026-09-28, 4d
    Release v0.5 :milestone, 2026-10-02, 0d
~~~

## 10 · Export choices

~~~mermaid
pie showData title Export choices
  "SVG file" : 46
  "PNG image" : 27
  "Share link" : 19
  "Copy source" : 8
~~~

## 11 · Feature bets

~~~mermaid
quadrantChart
  title Feature bets
  x-axis Internal complexity --> User visible value
  y-axis Low delight --> High delight
  quadrant-1 Do now
  quadrant-2 Plan
  quadrant-3 Skip
  quadrant-4 Maybe
  HTML labels: [0.35, 0.90]
  Edge IDs: [0.30, 0.60]
  Per-node fonts: [0.50, 0.50]
  PDF export: [0.85, 0.20]
~~~

## 12 · Privacy requirements

~~~mermaid
requirementDiagram
  requirement LocalOnly {
    id: 1
    text: Diagrams never leave the browser
    risk: high
    verifymethod: inspection
  }
  functionalRequirement HashShare {
    text: Share links encode state in the URL hash
  }
  functionalRequirement SvgExport {
    text: Export without a network call
  }
  LocalOnly - contains -> HashShare
  LocalOnly - contains -> SvgExport
~~~

## 13 · Release history

~~~mermaid
gitGraph
  commit id: "v0.1.0"
  branch workbench
  checkout workbench
  commit id: "compact panes"
  commit id: "locales"
  checkout main
  merge workbench id: "v0.2.0" tag: "v0.2.0"
  commit id: "gantt pie journey" type: HIGHLIGHT
  branch ai-syntax
  checkout ai-syntax
  commit id: "sanitize labels"
  commit id: "edge ids"
  checkout main
  merge ai-syntax id: "v0.4.0" tag: "v0.4.0"
~~~

## 14 · System context

~~~mermaid
C4Context
  title xmermaid live context
  Person(visitor, "Visitor")
  System(workbench, "xmermaid live", "Static browser workbench")
  System_Ext(registry, "npm registry", "Serves @evangwt/xmermaid")
  System_Ext(pages, "GitHub Pages", "Hosts the static build")
  Rel(visitor, workbench, "Pastes and exports")
  Rel(workbench, registry, "Loads renderer updates")
~~~

## 15 · Feature map

~~~mermaid
mindmap
  root((xmermaid live))
    Editing
      ::icon(fa fa-code)
      Source editor
      Visual flowchart edits
    Rendering
      ::icon(fa fa-bolt)
      Thirty families
      WASM layout
    Output
      ::icon(fa fa-rocket)
      SVG export
      Share hash
~~~

## 16 · What landed when

~~~mermaid
timeline
  title What landed when
  0.2 : Compact workbench
       : More locales
  0.3 : Gantt, pie, journey
  0.4 : AI-syntax support
       : Class-diagram classDef
~~~

## 17 · A render session

~~~mermaid
zenuml
  Browser->Parser: feed source
  Parser->Layout: hand over AST
  Layout-->Parser: positioned nodes
  Parser-->Browser: ready to draw
~~~

## 18 · Where diagrams come from

~~~mermaid
sankey
AI chat,Flowchart,42
AI chat,Sequence,18
Docs,Flowchart,15
Docs,Mindmap,9
Wikis,Sequence,7
Wikis,Gantt,5
Flowchart,Rendered,52
Sequence,Rendered,25
Mindmap,Rendered,9
Gantt,Rendered,5
~~~

## 19 · Extraction latency

~~~mermaid
xychart-beta
  title "Extraction latency by document size"
  x-axis [100, 250, 500, 1000]
  y-axis "milliseconds" 0 --> 1600
  bar [48, 121, 266, 610]
  line [60, 150, 330, 760]
~~~

## 20 · Workbench layout

~~~mermaid
block-beta
  columns 3
  List["Diagram list"] Editor["Source editor"] Preview["SVG preview"]
  State["Document state"]:3
  List --> Editor
  Editor --> Preview
~~~

## 21 · Share hash payload

~~~mermaid
packet
title Share hash payload
+8: "Format version"
+8: "Diagram count"
+16: "Source length"
+32: "Checksum"
64-127: "Compressed source"
~~~

## 22 · Renderer backlog

~~~mermaid
kanban
  done[Shipped]
    html[HTML label sanitization]
    edgeids[Edge ID parsing]
    classdef[Class-diagram classDef]@{ ticket: XM-198 }
  doing[In progress]
    fonts[Per-node font sizing]@{ ticket: XM-240 }
  next[Next up]
    theming[Theme variables]
    pdf[PDF export]
~~~

## 23 · Deployment

~~~mermaid
architecture-beta
  group edge(system)[Static delivery]
  service pages(server)[GitHub Pages] in edge
  service workbench(server)[Workbench] in edge
  service registry(database)[npm registry]
  workbench:R --> L:pages
  workbench:T --> B:registry
~~~

## 24 · Renderer radar

~~~mermaid
radar-beta
  title Renderer comparison
  axis aisyntax["AI syntax"], families["Families"], fidelity["Fidelity"], speed["Speed"], safety["Safety"]
  curve xm["xmermaid"]{5, 4, 4, 5, 5}
  curve mj["mermaid.js"]{3, 5, 5, 3, 3}
  min 0
  max 5
~~~

## 25 · Paste to preview

~~~mermaid
eventmodeling
  tf 01 ui PasteSurface
  tf 02 cmd ExtractDiagrams
  tf 03 evt DiagramsExtracted
  tf 04 readmodel DiagramList
  rf 05 evt External.RendererUpdate
  timeframe 06 cmd SelectDiagram
  timeframe 07 evt PreviewUpdated
~~~

## 26 · Bundle composition

~~~mermaid
treemap-beta
"SDK"
    "WASM module": 1327
    "Editor": 96
    "Renderer": 74
"App"
    "Workbench": 118
    "Extractor": 64
    "Styles": 38
~~~

## 27 · Who renders what

~~~mermaid
venn-beta
  title "Who renders what"
  set Mermaid
  set AI
  set Native
  union Mermaid,AI["the messy middle"]
  union AI,Native["our sweet spot"]
~~~

## 28 · Why renders fail

~~~mermaid
ishikawa-beta
  Blank preview
  Parser
    Unterminated label
    Unknown family
  Layout
    Degenerate bounds
  Network
    Missing wasm asset
  Source
    Not Mermaid at all
~~~

## 29 · Value chain

~~~mermaid
wardley-beta
title Paste to published diagram
anchor Author [0.95, 0.80]
component Editor [0.74, 0.75]
component Extractor [0.62, 0.68]
component Renderer [0.42, 0.55]
component WASM [0.24, 0.35]
Author -> Editor
Editor -> Extractor
Extractor -> Renderer
Renderer -> WASM
~~~

## 30 · Handling unsupported syntax

~~~mermaid
cynefin-beta
title When a diagram will not render

clear
"Fix the quoted label"

complicated
"Read the diagnostic range"

complex
"Probe with a minimal source"

chaotic
"Redraw by hand right now"

confusion
"Unknown family entirely"

clear --> complex : "Still failing"
complex --> chaotic : "Deadline"
~~~

## 31 · Docs map

~~~mermaid
tree
  xmermaid live
    Getting started
      Paste or type
      Select a diagram
    Reference
      Support matrix
      Diagnostics
      Security policy
~~~

## 32 · Issue triage

~~~mermaid
swimlane-beta LR
  subgraph You
    report[Hit a rough edge]
    verify[Verify the fix]
  end

  subgraph Maintainers
    triage[Reproduce with source]
    fix[Ship a renderer fix]
  end

  report --> triage
  triage -->|supported gap| fix
  triage -->|works as documented| report
  fix --> verify
~~~

## 33 · Without fences

Bare diagram statements in prose are recognized too - no fence required. This one is not inside a fence:

flowchart TD
  Bare[Bare in prose] --> Recognized[Recognized anyway]
  Recognized --> Drawn[Drawn by the same renderer]
`.replaceAll('~~~', '\`\`\`');
