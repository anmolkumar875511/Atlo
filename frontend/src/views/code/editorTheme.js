import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme(
  {
    '&': { height: '100%', color: '#cdc6b4', backgroundColor: '#0d0c10', fontSize: '12px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
    '.cm-gutters': { color: '#5c584e', backgroundColor: '#08070a', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgb(201 162 75 / 12%)' },
    '.cm-activeLineGutter': { color: '#c9a24b', backgroundColor: 'rgb(201 162 75 / 16%)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgb(201 162 75 / 30%)',
    },
    '.cm-cursor': { borderLeftColor: '#c9a24b' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword], color: '#c9a24b' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#7f9c8a' },
  { tag: [t.number, t.bool, t.null], color: '#b07a42' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6b675d', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#e2c98a' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: '#f1ebdb' },
  { tag: [t.typeName, t.className, t.namespace], color: '#6d8fb3' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#8f8a7d' },
  { tag: [t.tagName, t.heading], color: '#c9a24b' },
  { tag: [t.attributeName, t.propertyName], color: '#cdc6b4' },
  { tag: t.invalid, color: '#b0304a' },
]);

export const editorTheme = [theme, syntaxHighlighting(highlight)];
