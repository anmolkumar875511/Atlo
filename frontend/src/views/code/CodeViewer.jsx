import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { editorTheme } from './editorTheme.js';
import { languageFor } from './languages.js';

function createState(content, path) {
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      EditorState.readOnly.of(true), // selectable and copyable, but not editable
      languageFor(path),
      editorTheme,
    ],
  });
}

// Read-only code view. `jumpId` changes every time the user asks to jump, so asking for the
// same line twice still scrolls again.
export default function CodeViewer({ content, path, line, jumpId }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current, state: createState('', '') });
    viewRef.current = view;
    return () => view.destroy();
  }, []);

  useEffect(() => {
    viewRef.current?.setState(createState(content, path));
  }, [content, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !line) return;
    const target = Math.min(Math.max(1, line), view.state.doc.lines);
    const position = view.state.doc.line(target).from;
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    });
  }, [content, path, line, jumpId]);

  return <div ref={hostRef} className="code-viewer" />;
}
