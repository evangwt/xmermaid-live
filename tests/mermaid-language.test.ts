import { describe, expect, it } from 'vitest';
import { tokenizeMermaid } from '../src/mermaid-language';

describe('Mermaid lexical highlighting', () => {
  it('classifies declarations, arrows, labels, strings, numbers, and comments', () => {
    expect(tokenizeMermaid('flowchart TD\n  A -->|go| B["Node"]\n  value: 2 %% note')).toEqual(expect.arrayContaining([
      ['flowchart', 'keyword'],
      ['-->', 'operator'],
      ['"Node"', 'string'],
      ['2', 'number'],
      ['%% note', 'comment'],
    ]));
  });
});
