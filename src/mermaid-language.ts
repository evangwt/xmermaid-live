import { LanguageSupport, StreamLanguage, type StringStream } from '@codemirror/language';

export type MermaidTokenKind = 'keyword' | 'operator' | 'string' | 'number' | 'comment' | 'variableName' | 'atom';
export type MermaidToken = readonly [text: string, kind: MermaidTokenKind];

const DECLARATIONS = new Set([
  'architecture-beta', 'block-beta', 'c4context', 'c4container', 'c4component', 'c4dynamic', 'classdiagram',
  'cynefin-beta', 'erdiagram', 'eventmodeling', 'flowchart', 'gantt', 'gitgraph', 'graph', 'ishikawa', 'journey',
  'kanban', 'mindmap', 'packet', 'pie', 'quadrantchart', 'radar-beta', 'requirementdiagram', 'sankey', 'sequencediagram',
  'statediagram', 'stateDiagram-v2'.toLowerCase(), 'swimlane-beta', 'timeline', 'tree', 'treemap-beta', 'venn-beta', 'wardley-beta',
  'xychart-beta', 'zenuml',
]);

const KEYWORDS = new Set([
  'accdescription', 'accicon', 'actor', 'alt', 'anchor', 'and', 'as', 'autonumber', 'branch', 'class', 'click', 'columns',
  'component', 'container', 'critical', 'deactivate', 'else', 'end', 'endwhile', 'entity', 'external_system', 'for', 'group',
  'height', 'include', 'loop', 'namespace', 'note', 'opt', 'option', 'par', 'participant', 'person', 'rect', 'relationship',
  'requirement', 'section', 'service', 'subgraph', 'system', 'title', 'try', 'union', 'width', 'while',
]);

const OPERATOR = /^(?:<\|--|--\|>|<-->|-->>|-->|==>|-.->|---|--|->>|->|=>|\|\|--o\{|\|\|--\|\{|\}\|--\|\{|\}\|--o\{|-\s+(?:satisfies|verifies)\s+->)/;
const STRING = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
const NUMBER = /^\d+(?:\.\d+)?/;
const WORD = /^[A-Za-z_][\w-]*/;

export function tokenizeMermaid(source: string): MermaidToken[] {
  const tokens: MermaidToken[] = [];
  let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset);
    if (/^\s+/.test(rest)) {
      offset += rest.match(/^\s+/)![0].length;
      continue;
    }
    const token = nextToken(rest);
    if (!token) {
      offset += 1;
      continue;
    }
    tokens.push(token);
    offset += token[0].length;
  }
  return tokens;
}

const mermaid = StreamLanguage.define({
  name: 'mermaid',
  token(stream: StringStream): MermaidTokenKind | null {
    if (stream.eatSpace()) return null;
    const token = nextToken(stream.string.slice(stream.pos));
    if (!token) {
      stream.next();
      return null;
    }
    stream.pos += token[0].length;
    return token[1];
  },
});

export function mermaidLanguage(): LanguageSupport {
  return new LanguageSupport(mermaid);
}

function nextToken(source: string): MermaidToken | null {
  const comment = source.match(/^%%[^\n]*/);
  if (comment) return [comment[0], 'comment'];
  const string = source.match(STRING);
  if (string) return [string[0], 'string'];
  const operator = source.match(OPERATOR);
  if (operator) return [operator[0], 'operator'];
  const number = source.match(NUMBER);
  if (number) return [number[0], 'number'];
  const word = source.match(WORD);
  if (!word) return null;
  const lower = word[0].toLowerCase();
  if (DECLARATIONS.has(lower) || KEYWORDS.has(lower)) return [word[0], 'keyword'];
  if (lower === 'true' || lower === 'false' || lower === 'null') return [word[0], 'atom'];
  return [word[0], 'variableName'];
}
