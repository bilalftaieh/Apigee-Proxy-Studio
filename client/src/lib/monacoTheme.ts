import type { BeforeMount } from '@monaco-editor/react';

export const defineApigeeTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('apigee-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#10131c',
      'editor.lineHighlightBackground': '#161a2560',
      'editorLineNumber.foreground': '#5c6478',
      'editorGutter.background': '#10131c',
    },
  });
};
