import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { mermaidLanguage } from './mermaid-language';

export type EditorLanguage = 'markdown' | 'mermaid';

export interface CodeEditorOptions {
  host: HTMLElement;
  value: string;
  language: EditorLanguage;
  label: string;
  disabled?: boolean;
  onChange(value: string): void;
}

export interface CodeEditor {
  view: EditorView;
  setValue(value: string): void;
  setLabel(label: string): void;
  setDisabled(disabled: boolean): void;
  focus(): void;
  destroy(): void;
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--surface-editor)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '13px', lineHeight: '1.72' },
  '.cm-content': { minHeight: '100%', padding: '16px', caretColor: 'var(--focus)' },
  '.cm-gutters': { border: '0', color: 'var(--text-muted)', backgroundColor: 'var(--surface-editor)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--surface-raised) 62%, transparent)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--focus)' },
  '&.cm-focused': { outline: '3px solid var(--focus)', outlineOffset: '-3px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-soft)' },
});

const editorHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: tags.operator, color: 'var(--syntax-operator)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.variableName, color: 'var(--syntax-variable)' },
  { tag: tags.heading, color: 'var(--syntax-heading)', fontWeight: '700' },
]);

export function createCodeEditor(options: CodeEditorOptions): CodeEditor {
  const editable = new Compartment();
  let syncing = false;
  const view = new EditorView({
    state: EditorState.create({
      doc: options.value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': options.label, 'aria-multiline': 'true' }),
        editable.of(EditorView.editable.of(!options.disabled)),
        editorTheme,
        syntaxHighlighting(editorHighlight),
        languageExtension(options.language),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !syncing) options.onChange(update.state.doc.toString());
        }),
      ],
    }),
    parent: options.host,
  });

  return {
    view,
    setValue(value) {
      if (value === view.state.doc.toString()) return;
      syncing = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      syncing = false;
    },
    setLabel(label) {
      view.contentDOM.setAttribute('aria-label', label);
    },
    setDisabled(disabled) {
      view.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!disabled)) });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}

function languageExtension(language: EditorLanguage) {
  if (language === 'mermaid') return mermaidLanguage();
  return markdown({
    codeLanguages: [LanguageDescription.of({ name: 'mermaid', alias: ['mmd'], support: mermaidLanguage() })],
  });
}
