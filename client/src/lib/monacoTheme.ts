import type { BeforeMount } from '@monaco-editor/react';

/**
 * The editor has to be the same surface as everything around it — a dark well
 * cut into a light pane reads as a screenshot pasted into the app, not as the
 * file you are editing.
 *
 * The token colours are the studio's own category and state inks rather than a
 * stock light theme's, so XML in Monaco matches the XML rendered everywhere
 * else: tags in the extension purple, attribute names in the success green,
 * values in the error red. Those three are far enough apart in hue and dark
 * enough on white to stay legible for the common colour-vision deficiencies,
 * which a stock theme's pale blues and yellows are not.
 *
 * The theme id keeps its old name: it is referenced from eight call sites, and
 * renaming it buys nothing but eight edits and a chance to miss one.
 */
export const defineApigeeTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('apigee-dark', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag', foreground: '8430CE' },
      { token: 'tag.xml', foreground: '8430CE' },
      { token: 'metatag', foreground: '80868B' },
      { token: 'metatag.xml', foreground: '80868B' },
      { token: 'metatag.content.xml', foreground: '80868B' },
      { token: 'attribute.name', foreground: '137333' },
      { token: 'attribute.name.xml', foreground: '137333' },
      { token: 'attribute.value', foreground: 'C5221F' },
      { token: 'attribute.value.xml', foreground: 'C5221F' },
      { token: 'string', foreground: 'C5221F' },
      { token: 'comment', foreground: '80868B', fontStyle: 'italic' },
      { token: 'delimiter', foreground: '5F6368' },
      { token: 'keyword', foreground: '1A73E8' },
      { token: 'number', foreground: '0B7C8C' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#202124',
      /* Barely there: at this density a strong current-line band is the loudest
         thing in the pane and competes with the selected policy row beside it. */
      'editor.lineHighlightBackground': '#f8f9fa',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#bdc1c6',
      'editorLineNumber.activeForeground': '#5f6368',
      'editorGutter.background': '#ffffff',
      'editorIndentGuide.background': '#f1f3f4',
      'editorIndentGuide.activeBackground': '#dadce0',
      'editor.selectionBackground': '#d2e3fc',
      'editor.inactiveSelectionBackground': '#e8f0fe',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#dadce0',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#dadce0',
      'editorSuggestWidget.selectedBackground': '#e8f0fe',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#dadce0',
      'editorBracketMatch.background': '#e8f0fe',
      'editorBracketMatch.border': '#1a73e8',
      'editorError.foreground': '#d93025',
      'editorWarning.foreground': '#e37400',
      'scrollbarSlider.background': '#dadce080',
      'scrollbarSlider.hoverBackground': '#c9ccd1',
      'scrollbarSlider.activeBackground': '#aeb2b8',
      /* Diff views: the same green/red fills the AI review panel proposes with. */
      'diffEditor.insertedTextBackground': '#e6f4ea90',
      'diffEditor.removedTextBackground': '#fce8e690',
    },
  });
};
