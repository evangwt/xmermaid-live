export const SAMPLE_DOCUMENT = `# xmermaid live

\`\`\`mermaid
flowchart TD
  Start[Paste a document] --> Extract[Extract diagrams]
  Extract --> Preview[Preview selected diagram]
\`\`\`

\`\`\`mermaid
flowchart LR
  Document --> List
  List --> Editor
  Editor --> WASM
\`\`\`
`;
