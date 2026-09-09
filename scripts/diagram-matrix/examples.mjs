// Complex example per diagram family from DIAGRAM_CATALOG (30 families).
// Each example exercises the broadest set of features the renderer's
// support contract marks as supported for that family.

export const EXAMPLES = {
  flowchart: `flowchart TD
  Start([Start process]) -->|validate| Input[(Input store)]
  Input -.->|optional| Check{{Check quality}}
  Check ==>|pass| Transform[[Transform data]]
  Check ==>|fail| Reject[/Reject record/]

  subgraph Pipeline[Transform pipeline]
    Transform --> Stage1[Trapezoid stage]
    Stage1 --> Merged(((Merge point)))
    Stage2 --> Merged
    Transform & Stage2 --> Merged
  end

  Merged -->|both paths| Decide{Ship it?}
  Decide -->|yes| Sub1[/Parallelogram note/]:::approved
  Decide -->|no| Back[(Archive)]

  Reject x--x Retry>Retry later]
  Retry ----> Input
  Decision2{{Second gate}} o--o Retry
  Sub1 <-->|sync| Sub2[Review board]

  Hero["Customer #9829; rank"] -->|fa:fa-car deliver| Gate

  Sub2 --> Expanded@{ shape: stadium, label: "All done" }
  long-node-id[Hyphenated node] --> Hero

  classDef approved fill:#1a7f4b,stroke:#0b4f2e,color:#ffffff
  classDef warm fill:#b45309,stroke:#7c2d12,color:#ffffff
  class Sub2,Expanded warm
  class Sub1 approved
  style Back fill:#7f1d1d,stroke:#450a0a,color:#ffffff
  linkStyle default stroke:#2563eb,stroke-width:2px
`,

  swimlanes: `swimlane-beta LR
  subgraph Customer
    request[Request service]
    provide[Provide details]
    receive[Receive update]
    confirm[Confirm resolution]
  end

  subgraph Support
    triage[Triage request]
    answer[Send answer]
    escalate[Escalate ticket]
  end

  subgraph Engineering
    investigate[Investigate issue]
    fix[Deliver fix]
  end

  request --> triage
  triage -->|needs info| provide
  provide --> triage
  triage -->|known issue| answer
  triage -->|new issue| investigate
  investigate -->|blocked| escalate
  escalate --> answer
  investigate --> fix
  fix --> answer
  answer --> receive
  receive --> confirm
`,

  sequence: `sequenceDiagram
  autonumber 5
  box rgb(48,86,144) Front office
    actor Client
    participant Gateway
  end
  box rgb(21,94,117) Back office
    participant Catalog
    participant Payments
  end

  Client->>+Gateway: Create checkout
  Gateway->>+Catalog: Reserve inventory
  Catalog-->>-Gateway: Reserved

  rect rgb(240,178,68)
    Note right of Gateway: Validate cart totals
    Gateway->>+Payments: Capture payment
    Payments-->>-Gateway: Receipt
  end

  alt Payment approved
    Gateway-->>Client: Confirmation email
  else Payment declined
    Gateway-->>-Client: Retry requested
    loop up to three attempts
      Client->>Gateway: Retry payment
      Gateway-->>Client: Outcome
    end
  end

  par audit trail
    Gateway-)Auditor: Emit event
  and metrics
    Gateway-)Metrics: Record latency
  end

  critical settlement
    Payments->>Bank: Transfer funds
    Bank-->>Payments: Settled
  end

  break fraud suspected
    Gateway--xClient: Block order
  end

  participant Watchtower
  Client->>Watchtower: Status query
  destroy Watchtower
  Client->>Gateway: Final ack
  Gateway-->>Client: Session closed
`,

  class: `classDiagram
  namespace Operations {
    class CronScheduler
    class Metrics
  }
  namespace Domain {
    class BatchTask
    class SqlStore
  }
  class Scheduler
  class Store
  class Runner
  class Task
  Scheduler : +schedule(task: Task) bool
  Runner : +execute(task: Task) Status
  Store : +save(task: Task) bool
  Task <|-- BatchTask : extends
  Runner *-- "1" Task : owns
  Scheduler o-- "many" Task : queues
  Runner ..> Store : depends on
  CronScheduler ..|> Scheduler : realizes
  SqlStore ..|> Store
  Runner --> "0..n" Metrics : reports to
  BatchTask -- SqlStore : persisted in
  style BatchTask fill:#1a7f4b,stroke:#0b4f2e,color:#ffffff
  style Scheduler fill:#b45309,stroke:#7c2d12,color:#ffffff
  class Task {
    << abstract >>
    +id: UUID
    #priority: int
    +validate() Result
  }
`,

  state: `stateDiagram-v2
  [*] --> Draft

  Draft --> Reviewing : submit
  Reviewing --> Draft : request changes

  state Reviewing {
    [*] --> Pending
    Pending --> InReview : assign reviewer
    InReview --> Pending : reassign
    InReview --> [*] : finish
  }

  state check << choice >>
  Reviewing --> check : verdict
  check --> Approved : approve
  check --> Draft : reject

  state fork_stage << fork >>
  state join_stage << join >>
  Approved --> fork_stage : publish prep
  fork_stage --> BuildAssets
  fork_stage --> RunChecks
  BuildAssets --> join_stage
  RunChecks --> join_stage
  join_stage --> Published

  Published --> Archived : retire
  Archived --> [*]

  note right of InReview
    Requires two reviewers
    before finishing
  end note
  note left of check : Default is reject
`,

  er: `erDiagram
  CUSTOMER {
    string id PK "auto generated"
    string name
    string email UK "login handle"
    datetime created_at
  }
  ORDER {
    string id PK
    string status "open, paid, shipped"
    decimal total
  }
  ORDER_LINE {
    string order_id PK, FK
    string product_id PK, FK
    int quantity
  }
  PRODUCT {
    string id PK
    string sku UK
    string title
    decimal price
  }
  WAREHOUSE {
    string id PK
    string region
  }
  SHIPMENT {
    string id PK
    string carrier
    date shipped_on
  }

  CUSTOMER ||--o{ ORDER : places
  CUSTOMER |o--o| ACCOUNT : may link
  ORDER ||--|{ ORDER_LINE : contains
  PRODUCT ||--o{ ORDER_LINE : appears in
  WAREHOUSE }o--|| PRODUCT : stocks
  ORDER }|..o{ SHIPMENT : fulfilled by
  WAREHOUSE ||--o{ SHIPMENT : dispatches
`,

  'user-journey': `journey
  title Online grocery shopping
  section Discover
    Browse catalog: 4: Shopper
    Search for items: 3: Shopper
    Compare prices: 4: Shopper, Market
  section Purchase
    Add to cart: 5: Shopper
    Apply coupons: 2: Shopper, Market
    Pay securely: 3: Shopper, Bank
    Confirm order: 5: Shopper, Market, Bank
  section Delivery
    Track parcel: 4: Shopper, Courier
    Receive goods: 5: Shopper, Courier
  section Aftercare
    Rate order: 3: Shopper
    Request refund: 1: Shopper, Support
    Get refund approved: 4: Support
`,

  gantt: `gantt
  title Platform release train
  dateFormat YYYY-MM-DD
  excludes weekends

  section Discovery
  Spec research      :done,    spec, 2026-08-03, 3d
  User interviews    :done,    talks, after spec, 4d
  Scope freeze       :milestone, after talks, 0d

  section Implementation
  Core parser        :active,  core, 2026-08-13, 5d
  Layout engine      :         layout, after core, 6d
  Export pipeline    :crit,    export, after layout, 4d
  Hardening buffer   :         buffer, after layout export, 3d

  section Release
  Beta rollout       :         beta, after export buffer, 3d
  Docs and guides    :         docs, after beta, 4d
  General availability : milestone, after docs, 0d
`,

  pie: `pie showData title Bug triage - August
  "Fixed" : 148
  "In progress" : 34
  "Needs triage" : 22
  "Blocked" : 9
  "Duplicate" : 15
  "Wont fix" : 6
  "Pending QA" : 27
  "Escalated" : 4
`,

  quadrant: `quadrantChart
  title Feature portfolio - reach vs effort
  x-axis Low reach --> High reach
  y-axis Low urgency --> High urgency
  quadrant-1 Invest now
  quadrant-2 Quick wins
  quadrant-3 Deprioritize
  quadrant-4 Schedule later
  Realtime collab: [0.72, 0.86]
  Offline export: [0.31, 0.64]
  Theme engine: [0.55, 0.42]
  Mobile layout: [0.83, 0.61]
  Legacy importer: [0.18, 0.22]
  Plugin API: [0.64, 0.74]
  Beta telemetry:::flagged: [0.44, 0.30]
  Share links: [0.66, 0.55] radius: 9, color: #2563eb, strokeColor: #1e3a8a, strokeWidth: 2

  classDef flagged radius: 12, color: #b91c1c, strokeColor: #7f1d1d, strokeWidth: 2
`,

  requirement: `requirementDiagram
  functionalRequirement auth_flow {
    id: 1
    text: Users authenticate with SSO
    risk: high
    verifymethod: test
  }
  requirement session_store {
    id: 2
    text: Sessions persist across restarts
    risk: low
    verifymethod: inspection
  }
  performanceRequirement latency_budget {
    id: 3
    text: Login completes under 800 ms
    risk: medium
    verifymethod: test
  }
  designConstraint token_format {
    id: 4
    text: Tokens must be RS256 JWTs
    risk: low
    verifymethod: analysis
  }
  interfaceRequirement audit_hook {
    id: 5
    text: Emit login events to SIEM
    risk: medium
    verifymethod: demonstration
  }

  auth_flow - satisfies -> token_format
  latency_budget - verifies -> auth_flow
  session_store - contains -> token_format
  audit_hook - traces -> auth_flow
  token_format - refines -> session_store
  auth_flow - derives -> session_store
`,

  gitgraph: `gitGraph
  commit id: "base" tag: "v0.9.0"
  commit id: "docs" type: HIGHLIGHT
  branch develop
  checkout develop
  commit id: "scaffold"
  commit id: "parser"
  branch feature/theme
  checkout feature/theme
  commit id: "tokens" tag: "rc1"
  commit id: "presets"
  checkout develop
  commit id: "layout-fix"
  checkout main
  merge develop id: "milestone" tag: "v1.0.0"
  checkout feature/theme
  commit id: "dark-mode"
  checkout main
  cherry-pick id: "dark-mode" tag: "hotfix"
  checkout develop
  merge feature/theme id: "integrate-theme"
  checkout main
  commit id: "release-notes" type: HIGHLIGHT
`,

  c4: `C4Container
  title Streaming platform - container view
  Person(subscriber, "Subscriber", "Watches content")
  System_Ext(identity, "Identity provider", "OIDC login")
  System_Boundary(platform, "Streaming platform")
  Container(web, "Web app", "TypeScript")
  Container(mobile, "Mobile app", "Kotlin")
  Container(api, "Public API", "Go")
  ContainerDb(catalog, "Catalog DB", "Postgres")
  Container(recs, "Recommender", "Python")
  Deployment_Node(edge, "Edge cluster")
  ContainerDb(cache, "Edge cache", "Redis")
  Rel(subscriber, web, "Watch and search")
  Rel(subscriber, mobile, "Watch on the go")
  Rel_Back(web, identity, "Authenticate via")
  Rel(api, identity, "Validate tokens")
  Rel(web, api, "GraphQL queries")
  Rel(mobile, api, "REST calls")
  Rel(api, catalog, "Read and write")
  Rel(recs, catalog, "Read titles")
  Rel_Right(recs, api, "Serve ranked lists")
  BiRel(web, mobile, "Continue-watching sync")
`,

  mindmap: `mindmap
  root((Observability))
    Ingest
      ::icon(fa fa-bolt)
      Collector
        id1[Batch writer]
        id2(Streaming reader)
    Storage
      id3[(Time-series DB)]
        Downsample job
        Retention policy
      id5{{Object store}}
    Analysis
      ::icon(fa fa-chart-line)
      Dashboards
        id6([Exec overview])
        id7(On-call board)
      Alerting
        id8(circuit breaker)
          Pager rules
          Silence windows
`,

  timeline: `timeline
  title Editor platform milestones
  section Foundation
    2023 : Prototype parser
         : WASM spike
         : First demo
    2024 : Public beta
         : Multi-diagram documents
  section Expansion
    2025 : Theme engine
         : Export pipeline
         : 30 diagram families
    2026 : Enterprise rollout
         : On-prem deployment
         : Audit hooks
`,

  zenuml: `zenuml
  actor Client
  participant Gateway
  participant AuthService
  participant SessionStore
  Client.login(credentials) {
    Gateway.validate(credentials) {
      AuthService.issueToken(credentials)
    }
  }
  Gateway->SessionStore: Persist session
  SessionStore-->Gateway: Session id
  Gateway->Client: Authenticated
  Client.refresh(token) {
    Gateway.verify(token) {
      AuthService.verifyToken(token)
    }
    Gateway.extend(token)
  }
  Gateway->SessionStore: Refresh expiry
  SessionStore-->Gateway: Confirmed
  Gateway-->Client: New token
  Client.logout {
    Gateway->SessionStore: Revoke session
  }
`,

  sankey: `sankey
Visitors,Signup page,820
Visitors,Pricing page,540
Visitors,Blog,610
Signup page,Trial account,430
Signup page,Newsletter,190
Pricing page,Trial account,260
Pricing page,Sales contact,120
Blog,Signup page,240
Blog,Newsletter,150
Trial account,Activated,300
Trial account,Churned,390
Sales contact,Activated,85
Activated,Power user,190
Activated,Churned,195
`,

  xychart: `xychart-beta
  title "Weekly active editors"
  x-axis "Week" [W1, W2, W3, W4, W5, W6]
  y-axis "Active editors" 0 --> 900
  bar [320, 410, 380, 520, 610, 730]
  line [290, 360, 420, 480, 590, 680]
`,

  block: `block-beta
  columns 3
  Proxy Cache Worker
  space:2 API
  Store:3
  Proxy --> Worker
  Cache --> Worker
  Worker --> API
  API --> Store
`,

  packet: `packet
title Hybrid telemetry frame
0-15: "Magic"
16-31: "Version"
32-39: "Header length"
40-47: "Flags"
48-63: "Checksum"
64-95: "Sequence number"
96-127: "Timestamp (unix seconds)"
128-159: "Route hint"
+8: "Compression"
+24: "Reserved"
`,

  kanban: `kanban
  discovery[Discovery]
    spike[WASM renderer spike]@{ ticket: PRD-101 }
    survey[Editor UX survey]@{ ticket: PRD-102 }
  building[In progress]
    catalog[Diagram catalog]@{ ticket: CORE-233 }
    diagnostics[Support diagnostics]@{ ticket: CORE-240 }
  review[Code review]
    export[SVG and PNG export]@{ ticket: CORE-198 }
  done[Done]
    theme[Theme engine]@{ ticket: CORE-150 }
    i18n[Locale switching]@{ ticket: CORE-171 }
`,

  architecture: `architecture-beta
  group edge(cloud)[Edge layer]
  group core(cloud)[Core services]

  service lb(server)[Load balancer] in edge
  service cdn(internet)[CDN] in edge
  service api(server)[Public API] in core
  service auth(lock)[Auth service] in core
  service search(search)[Search index] in core
  service db(database)[Primary DB] in core

  cdn:T --> B:lb
  lb:R --> L:api
  api:B --> T:auth
  api:B --> T:db
  auth:R --> L:db

  junction bus
  api:R --> L:bus
  bus:R --> L:search
  bus:B --> T:db
`,

  radar: `radar-beta
  title Renderer health scorecard
  axis quality["Correctness"], speed["Speed"], memory["Memory"], docs["Docs"], tests["Coverage"], ops["Ops readiness"]
  curve v03["v0.3 release"]{86, 71, 64, 58, 77, 52}
  curve main["main branch"]{90, 78, 70, 66, 84, 61}
  curve target["Year target"]{95, 88, 82, 85, 92, 80}
  min 0
  max 100
`,

  'event-modeling': `eventmodeling
  tf 01 ui SearchScreen
  tf 02 cmd SubmitQuery
  tf 03 evt QuerySubmitted
  tf 04 readmodel ResultList
  rf 05 evt External.CatalogUpdated
  timeframe 06 ui ProductDetail
  timeframe 07 cmd ReserveItem
  timeframe 08 evt ItemReserved
  timeframe 09 readmodel InventoryBoard
`,

  treemap: `treemap-beta
"Editor experience"
    "Canvas"
        "Pan and zoom": 14
        "Minimap": 6
    "Editor surface": 22
    "Style inspector": 11
"Rendering core"
    "Layout engine": 34
    "SVG output": 18
    "Theme engine": 12
"Platform"
    "Export pipeline": 16
    "Share links": 8
    "Localization": 7
`,

  venn: `venn-beta
  title "Skill overlap in the platform team"
  set Frontend
  set Backend
  set Infrastructure
  set Design
  union Frontend,Backend["Full-stack"]
  union Backend,Infrastructure["SRE craft"]
  union Frontend,Design["Design engineering"]
  union Infrastructure,Design["Tooling UX"]
`,

  ishikawa: `ishikawa-beta
  Deployments slower than 10 minutes
  Pipeline
    Serial build steps
    Cold dependency cache
      No warm artifact reuse
      Large base images
  Tooling
    Single monolithic bundle
    Unparallelized test shards
  Process
    Manual approval gates
      On-call unavailable
      Multi-region sign-off
  Environment
    Flaky runners
    Cross-region artifact sync
  People
    Sparse on-call rotation
    Reviewer bottleneck
`,

  wardley: `wardley-beta
title Subscription checkout value chain
anchor Subscriber [0.92, 0.62]
component Storefront [0.80, 0.80]
component Cart [0.72, 0.66]
component Pricing [0.62, 0.52]
component Payment [0.50, 0.38]
component Identity [0.44, 0.30]
component Ledger [0.30, 0.20]
component Tax tables [0.22, 0.12]
component Card networks [0.14, 0.08]
Subscriber -> Storefront
Storefront -> Cart
Cart -> Pricing
Pricing -> Payment
Payment -> Identity
Payment -> Card networks
Payment -> Ledger
Ledger -> Tax tables
Identity -> Ledger
`,

  cynefin: `cynefin-beta
title Incident response playbook

complex
"Run safe-to-fail probes"
"Convene swarm call"

complicated
"Page the domain expert"
"Analyze dashboards"

clear
"Follow the runbook"
"Rotate the failing node"

chaotic
"Roll back immediately"
"Page incident commander"

confusion
"Gather first responders"

complex --> clear : "Patterns stabilized"
complicated --> clear : "Cause identified"
chaotic --> complicated : "Service restored"
confusion --> complex : "Signal detected"
`,

  treeview: `tree
  Platform
    Editor
      Canvas
        Pan and zoom
        Minimap
      Text surface
        Syntax colors
        Autocomplete
    Renderer
      Parser
        Catalog detection
        Diagnostics
      Layout
        Direction engine
        Subgraph packing
    Delivery
      Export
        SVG writer
        PNG writer
      Share
        URL hash encoder
`,
};

// Simplified variants used only when a complex example fails to render.
// The analyzer in @evangwt/xmermaid is more conservative than the support
// matrix for some syntax (linkStyle, mindmap icons, ZenUML declarations,
// architecture junctions), so the render itself arbitrates.
export const FALLBACKS = {
  flowchart: EXAMPLES.flowchart
    .split('\n')
    .filter(line => !line.startsWith('  linkStyle '))
    .join('\n'),
  mindmap: EXAMPLES.mindmap
    .split('\n')
    .filter(line => !line.includes('::icon('))
    .join('\n'),
  zenuml: `zenuml
  Alice->Bob: Authenticate
  Bob->AuthService: Verify credentials
  AuthService-->Bob: Token issued
  Bob->SessionStore: Persist session
  SessionStore-->Bob: Session id
  Bob-->Alice: Authenticated
  Alice->Bob: Refresh token
  Bob->AuthService: Verify token
  AuthService-->Bob: Token valid
  Bob->SessionStore: Extend expiry
  SessionStore-->Bob: Confirmed
  Bob-->Alice: New token
  Alice->Bob: Logout
  Bob->SessionStore: Revoke session
  SessionStore-->Bob: Revoked
  Bob-->Alice: Signed out
`,
  architecture: `architecture-beta
  group edge(cloud)[Edge layer]
  group core(cloud)[Core services]

  service lb(server)[Load balancer] in edge
  service cdn(internet)[CDN] in edge
  service api(server)[Public API] in core
  service auth(lock)[Auth service] in core
  service search(search)[Search index] in core
  service db(database)[Primary DB] in core

  cdn:T --> B:lb
  lb:R --> L:api
  api:B --> T:auth
  api:B --> T:db
  auth:R --> L:db

  junction bus
  api:R --> L:bus
  bus:R --> L:search
  bus:B --> T:db
`,
};
