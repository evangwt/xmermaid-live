import { afterEach, describe, expect, it } from 'vitest';
import { createCodeEditor, type CodeEditor } from '../src/code-editor';

const editors: CodeEditor[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors.length = 0;
  document.body.replaceChildren();
});

describe('CodeMirror source editor', () => {
  it('does not emit controlled external value updates as user edits', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const changes: string[] = [];
    const editor = createCodeEditor({
      host,
      value: 'flowchart TD',
      language: 'mermaid',
      label: 'Current diagram',
      onChange: value => changes.push(value),
    });
    editors.push(editor);

    editor.setValue('flowchart TD\n  A --> B');
    expect(changes).toEqual([]);

    editor.view.dispatch({
      changes: { from: editor.view.state.doc.length, insert: '\n  B --> C' },
    });

    expect(changes).toEqual(['flowchart TD\n  A --> B\n  B --> C']);
  });
});
