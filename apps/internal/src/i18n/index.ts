import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
