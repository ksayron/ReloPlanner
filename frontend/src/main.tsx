import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import App from './App';
import { appTheme } from './theme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
