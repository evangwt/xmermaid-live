export const SAMPLE_DOCUMENT = `# xmermaid live examples

## Flowchart: top-down fan-out

~~~mermaid
flowchart TD
  Christmas[Christmas] -->|Get money| Shopping(Go shopping)
  Shopping --> Decision{Let me think}
  Decision -->|Laptop| Laptop[Laptop]
  Decision -->|iPhone| Phone[iPhone]
  Decision -->|Car| Car[Car]
  Laptop --> Compare[Compare options]
  Phone --> Compare
  Car --> Compare
  Compare --> Checkout[Checkout]
~~~

## Flowchart: left-to-right pipeline

~~~mermaid
flowchart LR
  Document --> Parser[Parse document]
  Parser --> List[Diagram list]
  List --> Editor
  Editor --> WASM
  WASM --> SVG[SVG preview]
~~~

## Sequence

~~~mermaid
sequenceDiagram
  participant Client
  participant Gateway
  participant Catalog
  participant Payments
  Client->>+Gateway: Create checkout
  Gateway->>+Catalog: Reserve inventory
  Catalog-->>-Gateway: Reserved
  Note right of Gateway: Validate cart and totals
  alt Payment approved
    Gateway->>+Payments: Capture payment
    Payments-->>-Gateway: Receipt
    Gateway-->>-Client: Confirmation
  else Rejected
    Gateway-->>Client: Retry payment
  end
~~~

## Class

~~~mermaid
classDiagram
  class Account
  class Customer
  class Order
  class Animal
  class Duck
  Account <|-- Customer
  Order --> Customer
  Animal <|-- Duck
~~~

## State

~~~mermaid
stateDiagram-v2
  Draft --> Reviewing : submit
  Reviewing --> Approved : approve
  Reviewing --> Draft : request changes
  Approved --> Published : publish
  Published --> Archived : retire
~~~

## Entity relationship

~~~mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_LINE : contains
  PRODUCT ||--o{ ORDER_LINE : appears in
~~~

## User journey

~~~mermaid
journey
  title Checkout
  section Explore
    Find product: 5: Buyer
    Compare options: 4: Buyer
  section Purchase
    Pay securely: 4: Buyer, Store
    Confirm order: 5: Buyer, Store
  section Retain
    Track delivery: 4: Buyer, Support
    Request a return: 3: Buyer, Support
~~~

## Gantt

~~~mermaid
gantt
  section Discovery
  Research : 2026-07-28, 2d
  Validate : 2026-07-30, 2d
  section Delivery
  Build : 2026-08-01, 3d
  Review : 2026-08-04, 2d
~~~

## Pie

~~~mermaid
pie title Deployment
  "Passed" : 62
  "Running" : 20
  "Queued" : 10
  "Blocked" : 8
~~~

## Quadrant chart

~~~mermaid
quadrantChart
  title Reach and engagement
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  Campaign A: [0.25, 0.75]
  Campaign B: [0.70, 0.80]
  Campaign C: [0.30, 0.30]
  Campaign D: [0.80, 0.25]
~~~

## Requirement

~~~mermaid
requirementDiagram
  requirement Login {
    id: 1
    text: User must log in
    risk: high
    verifymethod: test
  }
  functionalRequirement Authenticate {
    text: Validate credentials
  }
  functionalRequirement RecoverAccount {
    text: Restore access securely
  }
  Login - satisfies -> Authenticate
~~~

## Git graph

~~~mermaid
gitGraph
  commit id: "ZERO" tag: "v0.1.0"
  branch develop
  checkout develop
  commit id: "FEATURE"
  checkout main
  branch release
  checkout release
  commit id: "HARDENING"
  checkout main
  merge develop id: "RELEASE" tag: "v1.0.0"
~~~

## C4 context

~~~mermaid
C4Context
  title Internet Banking
  Person(customer, "Customer")
  System(banking, "Internet Banking")
  System_Ext(email, "E-mail system")
  System_Ext(identity, "Identity provider")
  Rel(customer, banking, "Uses")
  Rel(banking, identity, "Authenticates with")
  Rel(banking, email, "Sends mail")
~~~

## Mindmap

~~~mermaid
mindmap
  Root
    Product
      Editor
      Preview
      Export
    Renderer
      Parser
      Layout
~~~

## Timeline

~~~mermaid
timeline
  title Product history
  2024 : First release
       : Team grows
  2025 : Global launch
       : Collaboration arrives
  2026 : Enterprise rollout
~~~

## ZenUML

~~~mermaid
zenuml
  Alice->Bob: Authenticate
  Bob->Payments: Charge
  Payments-->Bob: Receipt
  Bob-->Alice: Token
~~~

## Sankey

~~~mermaid
sankey
Source,Qualified,36
Source,Nurture,24
Qualified,Won,18
Qualified,Nurture,18
Nurture,Won,12
Nurture,Lost,30
~~~

## XY chart

~~~mermaid
xychart-beta
  title "Quarterly revenue"
  x-axis [Q1, Q2, Q3, Q4]
  y-axis "Revenue" 0 --> 100
  bar [20, 40, 55, 70]
  line [30, 50, 65, 82]
~~~

## Block diagram

~~~mermaid
block-beta
  columns 4
  Browser Editor Renderer Export
  Document:2 Preview:2
  Browser --> Editor
  Editor --> Renderer
  Renderer --> Export
~~~

## Packet

~~~mermaid
packet
title UDP Packet
+16: "Source Port"
+16: "Destination Port"
32-47: "Length"
48-63: "Checksum"
64-95: "Data (variable length)"
+8: "Flags"
+24: "Payload"
~~~

## Kanban

~~~mermaid
kanban
  backlog[Backlog]
    write[Write documentation]
    model[Model data]
  doing[In progress]
    ship[Ship renderer]
    review[Review output]
  done[Done]
    test[Run tests]
    release[Release sample]
~~~

## Architecture

~~~mermaid
architecture-beta
  service web(server)[Web]
  service db(database)[Database]
  service api(server)[API]
  service worker(server)[Worker]
  web:R --> L:api
  api:R --> L:worker
  worker:R --> L:db
~~~

## Radar

~~~mermaid
radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"], ambiance["Ambiance"], speed["Speed"]
  curve a["Restaurant A"]{4, 3, 2, 4, 3}
  curve b["Restaurant B"]{3, 4, 3, 3, 5}
  curve c["Restaurant C"]{5, 2, 4, 4, 2}
  min 0
  max 5
~~~

## Event modeling

~~~mermaid
eventmodeling
  tf 01 ui CartUI
  tf 02 cmd AddItem
  tf 03 evt ItemAdded
  tf 04 readmodel CartSummary
  rf 05 evt External.InventoryChanged
  timeframe 06 cmd PlaceOrder
  timeframe 07 evt OrderPlaced
~~~

## Treemap

~~~mermaid
treemap-beta
"Platform"
    "Editor": 28
    "Renderer": 36
    "Export": 18
"Operations"
    "Monitoring": 20
    "Support": 14
"Growth"
    "Onboarding": 16
    "Docs": 12
~~~

## Venn

~~~mermaid
venn-beta
  title "Team overlap"
  set Frontend
  set Backend
  set Platform
  union Frontend,Backend["APIs"]
  union Backend,Platform["Delivery"]
~~~

## Ishikawa

~~~mermaid
ishikawa-beta
  Blurry Photo
  Process
    Out of focus
    Shutter speed too slow
  Equipment
    Lens
      Dirty lens
    Sensor
      High noise
  Environment
    Low light
    Moving subject
~~~

## Wardley map

~~~mermaid
wardley-beta
title Checkout value chain
anchor Customer [0.95, 0.70]
component Storefront [0.78, 0.78]
component Checkout [0.64, 0.62]
component Payment [0.48, 0.42]
component Ledger [0.30, 0.24]
Customer -> Storefront
Storefront -> Checkout
Checkout -> Payment
Payment -> Ledger
~~~

## Cynefin

~~~mermaid
cynefin-beta
title Incident Response

complex
"Investigate root cause"
"Probe and learn"

complicated
"Expert review needed"
"Analyze with specialists"

clear
"Run a standard procedure"
"Automate the response"

chaotic
"Stabilize immediately"
"Act before analysis"

confusion
"Unknown failure mode"

complex --> complicated : "Pattern identified"
clear --> chaotic : "Complacency"
~~~

## Tree view

~~~mermaid
tree
  Product
    Desktop
      macOS
      Windows
    Mobile
      iOS
      Android
    Web
      Command palette
~~~

## Swimlanes

~~~mermaid
swimlane-beta LR
  subgraph Customer
    request[Request service]
    receive[Receive update]
  end

  subgraph Support
    triage[Triage request]
    answer[Send answer]
  end

  subgraph Engineering
    investigate[Investigate issue]
    fix[Deliver fix]
  end

  request --> triage
  triage -->|Known issue| answer
  triage -->|New issue| investigate
  investigate --> fix
  fix --> answer
  answer --> receive
~~~
`.replaceAll('~~~', '\`\`\`');
