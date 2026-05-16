import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import App from './App';
import { appTheme } from './theme';
import './i18n';
import './index.css';

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'reloplanner-color-scheme',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider
      theme={appTheme}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
