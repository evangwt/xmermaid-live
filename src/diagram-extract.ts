import { detectDiagramType } from '@evangwt/xmermaid';
import {
  extractDiagrams as extractStrictDiagrams,
  type DiagramBlock,
  type DiagramDocument,
  type DiagramOrigin,
  type ReplaceDiagramSourceResult,
} from '@evangwt/xmermaid/editor';

// Recognition on top of the strict upstream extractor: pasted content rarely
// arrives inside a well-formed ```mermaid fence, so besides the exact fences
// upstream matches we accept fence variants (unclosed, info strings, tildes,
// neutral languages) and bare diagram statements embedded in prose.
//
// Deliberate limits: block-beta rows of bare words, ZenUML control lines,
// ishikawa causes, and unindented tree children are indistinguishable from
// prose, and diagram content inside a non-neutral fence (```js) stays code.
//
// The scan runs on every keystroke and is linear; the e2e capacity test keeps
// a thousand-diagram document honest.

interface DiagramCandidate {
  startOffset: number;
  endOffset: number;
  source: string;
  origin: DiagramOrigin;
  language: 'mermaid' | 'xmermaid' | null;
}

interface TextLine {
  start: number;
  end: number;
  raw: string;
  indent: number;
  trimmed: string;
}

const FENCE_PATTERN = /^(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSER_PATTERN = /^(`{3,}|~{3,})$/;

// Only fences that quote content may have a diagram inferred from the content;
// ```js demo code stays code even when its first line reads like a diagram.
const NEUTRAL_FENCE_LANGUAGES = new Set(['', 'text', 'txt', 'md', 'markdown']);
const DIAGRAM_FENCE_LANGUAGES = new Set(['mermaid', 'xmermaid', 'mmd']);

// Lines that never belong to a bare diagram: headings, lists, quotes, rules, nested fences.
const HARD_STOP_PATTERN = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,}|-{3,}\s*$)/;

// Structural one-word lines: sequence block closers and cynefin section words.
const ALONE_WORD_PATTERN = /^(?:end|and|or|complex|complicated|clear|chaotic|confusion)$/;

// Zero-indent continuation hints, one pattern per family shape; keywords are
// case-sensitive like the Mermaid parser and take no colon, so prose such as
// "Title: the system" still ends a block.
const CONTINUATION_PATTERNS: readonly RegExp[] = [
  /^(?:subgraph|direction|classDef|class|style|click|linkStyle)\b(?!:)/, // flowchart structure
  /^(?:participant|actor|autonumber|activate|deactivate|note|alt|loop|opt|par|break|critical|box|else)\b(?!:)/, // sequence
  /^(?:title|accTitle|accDescr|dateFormat|section|hide|show)\b(?!:)/, // gantt / journey / timeline
  /^(?:commit|branch|merge|checkout|cherry-pick|showData|requirement)\b(?!:)/, // gitGraph / requirement
  /^(?:state|transition|package|enum)\b(?!:)/, // state / class
  /^(?:columns|component|anchor|axis|curve|union|timeframe)\b(?!:)/, // block / wardley / radar / venn / event-modeling
  /--|->|==|-\.|~~~|\[\*\]|:::/, // edges of every graph family
  /^[\p{L}_][\p{L}\p{N}_-]*\s*[\[\(\{]/u, // node declaration: word + bracket
  /\s:/, // "label : value"; the space keeps "Figure 1: overview" prose
  /^[+\-~#]\s*[\p{L}\p{N}(<]/u, // class members and packet "+N" rows
  /^\*\s*[\p{L}\p{N}_][^*]*$/u, // static member "*abstract()"; a second "*" means prose emphasis
  /^\d+\s*-\s*\d+\s*:/, // packet byte range "32-47: Length"
  /^<</, // class stereotype "<<interface>>"
  /^[{}]+$/, // attribute block braces (class / er / requirement)
  /^"[^"]*"\s*(?::|$)/, // quoted row (treemap / cynefin); no comma, so dialogue stays prose
  /^[\p{L}"][^,\n]*(?:\s*,\s*[^,\n]+)+\s*,\s*\d+\s*$/u, // sankey "A,B,36"
  /\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/, // quadrant float point (integers stay prose)
  /^quadrant-\d/, // quadrant section "quadrant-1 Expand"
  /:\s*\d+\s*:/, // journey rating "task: 5: actor"
  /^:\s/, // timeline continuation ": Team grows"
  /^set\s+[\p{L}_][\p{L}\p{N}_-]*$/u, // venn set
  /^service\s+[\p{L}_][\p{L}\p{N}_-]*\s*[\[\(]/u, // architecture service
  /^[tr]f\s+\d+/, // event-modeling row "tf 01 ui CartUI"
];

export function extractDiagrams(text: string): DiagramDocument {
  const strict = extractStrictDiagrams(text);
  const lineStarts = lineStartOffsets(text);
  const lines = textLines(text);

  // Upstream reports a whole-document raw block for content that merely opens
  // with a diagram header, which the line scan below partitions better: exact
  // fences stay authoritative and loose candidates only fill the gaps.
  const candidates: DiagramCandidate[] = strict.diagrams
    .filter(diagram => diagram.origin === 'markdown-fence')
    .map(diagram => ({
      startOffset: diagram.range.startOffset,
      endOffset: diagram.range.endOffset,
      source: diagram.source,
      origin: diagram.origin,
      language: diagram.language,
    }));

  const loose = [...looseFenceCandidates(text, lines), ...rawBlockCandidates(text, lines)];
  for (const candidate of loose) {
    if (!candidates.some(accepted => overlaps(accepted, candidate))) candidates.push(candidate);
  }

  candidates.sort((left, right) => left.startOffset - right.startOffset);
  const diagrams = candidates.map((candidate, index) => toDiagramBlock(candidate, index, lineStarts));
  return { text, diagrams, diagnostics: strict.diagnostics };
}

export function replaceDiagramSource(
  text: string,
  diagramId: string,
  nextSource: string,
  document: DiagramDocument,
): ReplaceDiagramSourceResult {
  const diagram = document.diagrams.find(item => item.id === diagramId);
  if (!diagram) {
    const nextDocument = extractDiagrams(text);
    nextDocument.diagnostics.push({
      code: 'diagram_not_found',
      message: `Diagram ${diagramId} was not found.`,
      severity: 'error',
      range: null,
    });
    return { text, document: nextDocument };
  }
  const nextText = [
    text.slice(0, diagram.range.startOffset),
    nextSource,
    text.slice(diagram.range.endOffset),
  ].join('');
  return { text: nextText, document: extractDiagrams(nextText) };
}

// Fence variants upstream misses: tildes, info strings, unclosed fences
// (which run to the end of the text), and neutral fences holding a diagram.
function looseFenceCandidates(text: string, lines: TextLine[]): DiagramCandidate[] {
  const candidates: DiagramCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opener = FENCE_PATTERN.exec(lines[index]!.trimmed);
    if (!opener) continue;

    const marker = opener[1]!;
    const language = fenceInfoLanguage(opener[2]!);
    const contentStart = Math.min(lines[index]!.end + 1, text.length);

    let contentEnd = text.length;
    let closerIndex = -1;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      if (closesFence(lines[probe]!.trimmed, marker)) {
        contentEnd = lines[probe]!.start;
        closerIndex = probe;
        break;
      }
    }

    const candidate = fenceCandidate(text, contentStart, contentEnd, language);
    if (candidate) candidates.push(candidate);
    if (closerIndex < 0) break;
    index = closerIndex;
  }
  return candidates;
}

// Bare diagram statements in prose: from a diagram header, collect lines while
// they read as diagram content; prose, markdown, or the next header ends it.
function rawBlockCandidates(text: string, lines: TextLine[]): DiagramCandidate[] {
  const candidates: DiagramCandidate[] = [];
  let insideFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (FENCE_PATTERN.test(line.trimmed)) {
      insideFence = !insideFence;
    } else if (!insideFence && isDiagramHeader(line)) {
      const last = scanRawBlockEnd(lines, index);
      if (last > index) candidates.push(rawCandidate(text, lines, index, last));
      index = last; // resume after the block; a lone header resumes below it
    }
  }
  return candidates;
}

function fenceCandidate(
  text: string,
  contentStart: number,
  contentEnd: number,
  language: string,
): DiagramCandidate | null {
  const content = text.slice(contentStart, contentEnd);
  const source = content.trim();
  if (source === '') return null;

  const declared = DIAGRAM_FENCE_LANGUAGES.has(language);
  // A neutral fence may quote several diagrams (a stray ``` line in prose looks
  // like an opener), so only single-diagram content is inferred.
  const detected = !declared
    && NEUTRAL_FENCE_LANGUAGES.has(language)
    && detectDiagramType(source) !== 'unknown'
    && countDiagramHeaders(source) === 1;
  if (!declared && !detected) return null;

  return {
    startOffset: contentStart + (content.length - content.trimStart().length),
    endOffset: contentEnd - (content.length - content.trimEnd().length),
    source,
    origin: 'markdown-fence',
    language: language === 'xmermaid' ? 'xmermaid' : 'mermaid',
  };
}

function rawCandidate(
  text: string,
  lines: TextLine[],
  headerIndex: number,
  lastIndex: number,
): DiagramCandidate {
  const first = extendRawStart(lines, headerIndex);
  const startLine = lines[first]!;
  const endLine = lines[lastIndex]!;
  const startOffset = startLine.start + startLine.indent;
  const endOffset = endLine.end - (endLine.raw.length - endLine.raw.trimEnd().length);
  return {
    startOffset,
    endOffset,
    source: text.slice(startOffset, endOffset),
    origin: 'raw-mermaid-block',
    language: null,
  };
}

function scanRawBlockEnd(lines: TextLine[], start: number): number {
  const headerIndent = lines[start]!.indent;
  let last = start;
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trimmed === '') {
      // A blank line continues the block only when the next content line does.
      let next = index + 1;
      while (next < lines.length && lines[next]!.trimmed === '') next += 1;
      if (next >= lines.length || endsRawBlock(lines[next]!, headerIndent)) break;
      index = next;
      continue;
    }
    if (endsRawBlock(line, headerIndent)) break;
    last = index;
    index += 1;
  }
  return last;
}

// Pull the immediately preceding %% comments and one front-matter block into
// the block so directives survive extraction.
function extendRawStart(lines: TextLine[], headerIndex: number): number {
  let start = headerIndex;
  while (start > 0 && lines[start - 1]!.trimmed.startsWith('%%')) start -= 1;

  // Front matter is a pair of `---` lines; a lone delimiter stays outside.
  if (start < 2 || lines[start - 1]!.trimmed !== '---') return start;
  let opener = start - 1;
  while (opener > 0 && lines[opener - 1]!.trimmed !== '' && lines[opener - 1]!.trimmed !== '---') {
    opener -= 1;
  }
  return lines[opener - 1]?.trimmed === '---' ? opener - 1 : start;
}

function endsRawBlock(line: TextLine, headerIndent: number): boolean {
  return isDiagramHeader(line) || isHardStop(line) || !continuesDiagram(line, headerIndent);
}

function isDiagramHeader(line: TextLine): boolean {
  return line.trimmed !== '' && detectDiagramType(line.trimmed) !== 'unknown';
}

function isHardStop(line: TextLine): boolean {
  return HARD_STOP_PATTERN.test(line.trimmed);
}

function continuesDiagram(line: TextLine, headerIndent: number): boolean {
  if (line.indent > headerIndent) return true;
  const trimmed = line.trimmed;
  if (ALONE_WORD_PATTERN.test(trimmed)) return true;
  if (trimmed.startsWith('%%')) return true;
  return CONTINUATION_PATTERNS.some(pattern => pattern.test(trimmed));
}

// ```mermaid {highlight} -> 'mermaid'; ``` {highlight} -> '' (neutral fence).
function fenceInfoLanguage(info: string): string {
  return (/^[A-Za-z0-9_-]*/.exec(info.trim())?.[0] ?? '').toLowerCase();
}

function closesFence(trimmed: string, marker: string): boolean {
  const closer = FENCE_CLOSER_PATTERN.exec(trimmed);
  return closer !== null && closer[1]![0] === marker[0] && closer[1]!.length >= marker.length;
}

function countDiagramHeaders(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '' && detectDiagramType(trimmed) !== 'unknown') count += 1;
  }
  return count;
}

function overlaps(left: DiagramCandidate, right: DiagramCandidate): boolean {
  return left.startOffset < right.endOffset && right.startOffset < left.endOffset;
}

function toDiagramBlock(candidate: DiagramCandidate, index: number, lineStarts: number[]): DiagramBlock {
  const start = sourcePosition(lineStarts, candidate.startOffset);
  const end = sourcePosition(lineStarts, candidate.endOffset);
  return {
    // Keep the upstream id scheme: share links and cached selections use it.
    id: `diagram-${index + 1}`,
    index,
    title: null,
    source: candidate.source,
    origin: candidate.origin,
    language: candidate.language,
    range: {
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
    },
    diagramType: detectDiagramType(candidate.source),
  };
}

function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

// Offset -> 1-based line/column, by binary search over line starts.
function sourcePosition(lineStarts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: offset - (lineStarts[lineIndex] ?? 0) + 1,
  };
}

function textLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  while (start <= text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const raw = text.slice(start, end);
    lines.push({
      start,
      end,
      raw,
      indent: raw.length - raw.trimStart().length,
      trimmed: raw.trim(),
    });
    if (end === text.length) break;
    start = end + 1;
  }
  return lines;
}
