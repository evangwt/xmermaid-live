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

// A line that opens with an edge operator cannot be diagram content — every
// edge needs a left-hand node — so prose such as "-> see the appendix" ends a
// bare block instead of being swallowed. A bare "--" is deliberately excluded:
// state diagrams use it as a concurrent-region separator.
const EDGE_LEAD_PATTERN = /^(?:-->|->|==|-\.|:::)/;

// A markdown blockquote marker ("`>`", "`>>`", "`> >`") plus the single optional
// space markdown consumes. Quoted content is analysed de-quoted (see dequoteText)
// so a diagram pasted inside a quote is recognized like any other.
const QUOTE_MARKER_PATTERN = /^[ \t]*(?:>[ \t]?)+/;

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
  // Quoted content is analysed de-quoted so a diagram pasted inside a blockquote
  // is recognized; ranges are then mapped back onto the original text.
  const dequoted = dequoteText(text);
  if (dequoted === null) return extractFromText(text);

  const document = extractFromText(dequoted.text);
  const lineStarts = lineStartOffsets(text);
  return {
    text,
    diagrams: document.diagrams.map(diagram => ({
      ...diagram,
      range: remapRange(diagram.range, dequoted, lineStarts),
    })),
    diagnostics: document.diagnostics.map(diagnostic => (
      diagnostic.range === null
        ? diagnostic
        : { ...diagnostic, range: remapRange(diagnostic.range, dequoted, lineStarts) }
    )),
  };
}

function extractFromText(text: string): DiagramDocument {
  const strict = extractStrictDiagrams(text);
  const lineStarts = lineStartOffsets(text);
  const lines = textLines(text);

  // Upstream reports a whole-document raw block for content that merely opens
  // with a diagram header, which the line scan below partitions better: exact
  // fences stay authoritative and loose candidates only fill the gaps.
  const strictCandidates: DiagramCandidate[] = strict.diagrams
    .filter(diagram => diagram.origin === 'markdown-fence')
    .map(diagram => ({
      startOffset: diagram.range.startOffset,
      endOffset: diagram.range.endOffset,
      source: diagram.source,
      origin: diagram.origin,
      language: diagram.language,
    }));

  const loose = [...looseFenceCandidates(text, lines), ...rawBlockCandidates(text, lines)];

  // A declared fence the loose layer split into several diagrams (one ```mermaid
  // fence holding two) must replace upstream's single whole-fence block, or the
  // merge would keep them glued into one diagram that cannot render.
  const candidates = strictCandidates.filter(
    accepted => loose.filter(candidate => overlaps(accepted, candidate)).length < 2,
  );
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
  const nextText = spliceDiagramSource(text, diagram, nextSource);
  return { text: nextText, document: extractDiagrams(nextText) };
}

// The text splice alone, without the (linear but full) re-extraction that
// follows an edit. The app uses this to keep a keystroke cheap on long
// documents and defer the scan until typing pauses.
export function spliceDiagramSource(
  text: string,
  diagram: DiagramBlock,
  nextSource: string,
): string {
  return [
    text.slice(0, diagram.range.startOffset),
    quoteAwareReplacement(text, diagram.range.startOffset, nextSource),
    text.slice(diagram.range.endOffset),
  ].join('');
}

// True when the text under a diagram's range still holds that diagram's source,
// blockquote markers aside. The deferred edit path splices ranges without
// re-extracting in between, so it must confirm the range has not drifted before
// trusting it — a stale range would write the previous source's leftovers back
// into the document.
export function diagramRangeHoldsSource(
  text: string,
  range: { startOffset: number; endOffset: number },
  source: string,
): boolean {
  if (range.startOffset < 0 || range.endOffset > text.length || range.startOffset >= range.endOffset) {
    return false;
  }
  return dequoteSegment(text.slice(range.startOffset, range.endOffset)) === source;
}

// Strips the blockquote markers that a quoted diagram carries on every line but
// its first (the first line's marker sits before the range, see above).
function dequoteSegment(slice: string): string {
  return slice
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.replace(QUOTE_MARKER_PATTERN, '')))
    .join('\n');
}

// A diagram recognized inside a blockquote keeps its marker on edit: the first
// line's marker sits before the range, so only the following lines are re-prefixed.
function quoteAwareReplacement(text: string, startOffset: number, nextSource: string): string {
  const lineStart = text.lastIndexOf('\n', startOffset - 1) + 1;
  const prefix = text.slice(lineStart, startOffset);
  const marker = QUOTE_MARKER_PATTERN.exec(prefix)?.[0];
  if (!marker || marker !== prefix) return nextSource;
  return nextSource
    .split('\n')
    .map((line, index) => {
      if (index === 0) return line;
      if (line === '') return marker.trimEnd();
      return `${marker}${line}`;
    })
    .join('\n');
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
    let closerIndex = lines.length;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      if (closesFence(lines[probe]!.trimmed, marker)) {
        contentEnd = lines[probe]!.start;
        closerIndex = probe;
        break;
      }
    }

    candidates.push(...fenceCandidates(
      text, contentStart, contentEnd, language, lines, index + 1, closerIndex,
    ));
    if (closerIndex >= lines.length) break;
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

function fenceCandidates(
  text: string,
  contentStart: number,
  contentEnd: number,
  language: string,
  lines: TextLine[],
  bodyStart: number,
  bodyEnd: number,
): DiagramCandidate[] {
  const content = text.slice(contentStart, contentEnd);
  if (content.trim() === '') return [];

  const fenceLanguage = language === 'xmermaid' ? 'xmermaid' : 'mermaid';
  if (DIAGRAM_FENCE_LANGUAGES.has(language)) {
    return declaredFenceCandidates(text, contentStart, contentEnd, fenceLanguage, lines, bodyStart, bodyEnd);
  }

  // A neutral fence may quote several diagrams (a stray ``` line in prose looks
  // like an opener), so only single-diagram content is inferred.
  const source = content.trim();
  const detected = NEUTRAL_FENCE_LANGUAGES.has(language)
    && detectDiagramType(source) !== 'unknown'
    && countDiagramHeaders(source) === 1;
  if (!detected) return [];

  return [{
    startOffset: contentStart + (content.length - content.trimStart().length),
    endOffset: contentEnd - (content.length - content.trimEnd().length),
    source,
    origin: 'markdown-fence',
    language: fenceLanguage,
  }];
}

// A ```mermaid fence is declared to hold a diagram, but one fence can carry
// several: split at each clean header so every diagram renders on its own
// instead of the whole fence being parsed as one diagram that cannot render.
// Splitting is all-or-nothing: if any piece would be a lone line (more likely a
// node id than a one-line diagram) the fence is left whole, as before.
function declaredFenceCandidates(
  text: string,
  contentStart: number,
  contentEnd: number,
  language: 'mermaid' | 'xmermaid',
  lines: TextLine[],
  bodyStart: number,
  bodyEnd: number,
): DiagramCandidate[] {
  const whole = (): DiagramCandidate[] => {
    const candidate = trimmedCandidate(text, contentStart, contentEnd, language);
    return candidate ? [candidate] : [];
  };

  const boundaries = [contentStart];
  for (let index = bodyStart; index < bodyEnd; index += 1) {
    const line = lines[index]!;
    if (line.start > contentStart && isCleanDiagramHeader(line.raw)) boundaries.push(line.start);
  }
  if (boundaries.length === 1) return whole();

  const segments = boundaries.map((start, index) => ({
    start,
    end: index + 1 < boundaries.length ? boundaries[index + 1]! : contentEnd,
  }));
  const splittable = segments.every(
    (segment, index) => index === 0 || countNonBlankLines(text, segment.start, segment.end) >= 2,
  );
  if (!splittable) return whole();

  const candidates: DiagramCandidate[] = [];
  let pending: number | null = null;
  for (const segment of segments) {
    const trimmed = text.slice(segment.start, segment.end).trim();
    // A chunk with no header of its own (a leading %% comment or front matter)
    // folds into the diagram that follows.
    if (trimmed === '' || detectDiagramType(trimmed) === 'unknown') {
      pending ??= segment.start;
      continue;
    }
    const candidate = trimmedCandidate(text, pending ?? segment.start, segment.end, language);
    pending = null;
    if (candidate) candidates.push(candidate);
  }
  return candidates.length > 0 ? candidates : whole();
}

// A line that opens a new diagram inside a declared fence: at column zero, a
// recognized diagram header, and free of edge operators — so a flowchart node
// named "sequenceDiagram" written as "sequenceDiagram --> B" stays a node.
const FENCE_HEADER_OPERATOR_PATTERN = /-->|->|==|-\.|:::/;
function isCleanDiagramHeader(raw: string): boolean {
  if (/^[ \t]/.test(raw)) return false;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.startsWith('%%')) return false;
  if (FENCE_HEADER_OPERATOR_PATTERN.test(trimmed)) return false;
  return detectDiagramType(trimmed) !== 'unknown';
}

function countNonBlankLines(text: string, start: number, end: number): number {
  let count = 0;
  for (const line of text.slice(start, end).split('\n')) {
    if (line.trim() !== '') count += 1;
  }
  return count;
}

function trimmedCandidate(
  text: string,
  start: number,
  end: number,
  language: 'mermaid' | 'xmermaid',
): DiagramCandidate | null {
  const content = text.slice(start, end);
  const source = content.trim();
  if (source === '') return null;
  return {
    startOffset: start + (content.length - content.trimStart().length),
    endOffset: end - (content.length - content.trimEnd().length),
    source,
    origin: 'markdown-fence',
    language,
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
  return HARD_STOP_PATTERN.test(line.trimmed) || EDGE_LEAD_PATTERN.test(line.trimmed);
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

// De-quoted view of the text: `text` has blockquote markers stripped, and
// `lines` records where each de-quoted line starts in the original so ranges can
// be mapped back. Only built when some line actually carries a marker.
interface DequoteResult {
  text: string;
  lines: Array<{ normStart: number; origStart: number }>;
}

interface MappableRange {
  startOffset: number;
  endOffset: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

function dequoteText(text: string): DequoteResult | null {
  if (!/^[ \t]*>/m.test(text)) return null;

  const lines: DequoteResult['lines'] = [];
  const parts: string[] = [];
  let normLength = 0;
  let lineStart = 0;
  for (;;) {
    let lineEnd = text.indexOf('\n', lineStart);
    const hasNewline = lineEnd >= 0;
    if (!hasNewline) lineEnd = text.length;
    const raw = text.slice(lineStart, lineEnd);
    const marker = QUOTE_MARKER_PATTERN.exec(raw)?.[0] ?? '';
    const content = raw.slice(marker.length);
    lines.push({ normStart: normLength, origStart: lineStart + marker.length });
    parts.push(content);
    normLength += content.length;
    if (!hasNewline) break;
    parts.push('\n');
    normLength += 1;
    lineStart = lineEnd + 1;
  }
  return { text: parts.join(''), lines };
}

// De-quoted offset -> original offset, by binary search over line starts.
function mapOffset(dequoted: DequoteResult, offset: number): number {
  const { text, lines } = dequoted;
  if (lines.length === 0) return offset;
  if (offset >= text.length) {
    const last = lines[lines.length - 1]!;
    return last.origStart + (text.length - last.normStart);
  }
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((lines[middle]?.normStart ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const line = lines[Math.max(0, high)]!;
  return line.origStart + (offset - line.normStart);
}

function remapRange<T extends MappableRange>(
  range: T,
  dequoted: DequoteResult,
  lineStarts: number[],
): T {
  const startOffset = mapOffset(dequoted, range.startOffset);
  const endOffset = mapOffset(dequoted, range.endOffset);
  const start = sourcePosition(lineStarts, startOffset);
  const end = sourcePosition(lineStarts, endOffset);
  return {
    ...range,
    startOffset,
    endOffset,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
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
