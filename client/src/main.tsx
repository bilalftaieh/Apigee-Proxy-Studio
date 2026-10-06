import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './lib/log/logger';
// Before anything that can mount an editor: @monaco-editor/react resolves its
// Monaco once, on the first mount, and whichever way it resolved is the one the
// whole session uses. See lib/monacoSetup.ts.
import './lib/monacoSetup';
import './styles/theme.css';
import './styles/app.css';

// Before React mounts, so an error thrown during the very first render is
// caught by the window handler rather than lost.
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
