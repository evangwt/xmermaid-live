export const SAMPLE_DOCUMENT = `# xmermaid live

\`\`\`mermaid
flowchart TD
  Start[Paste text] --> Extract[Find diagrams]
  Extract --> Preview[Preview one]
\`\`\`

\`\`\`mermaid
flowchart LR
  Document --> List
  List --> Editor
  Editor --> WASM
\`\`\`
`;
