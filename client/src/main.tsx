import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import App from './App';
import { powerPlatformDarkTheme } from './theme/fluentTheme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={powerPlatformDarkTheme} className="min-h-screen bg-slate-950 text-slate-100">
      <App />
    </FluentProvider>
  </React.StrictMode>
);

