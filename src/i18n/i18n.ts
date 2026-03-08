import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from './translations';

// Suppress i18next/Locize promo (i18next uses console.info for this)
const _info = console.info;
console.info = (...args: unknown[]) => {
  const hasLocize = args.some((a) => typeof a === 'string' && (a as string).includes('Locize'));
  if (hasLocize) return;
  _info.apply(console, args);
};

i18n
  .use(initReactI18next)
  .init({
    resources: translations,
    lng: 'he',
    fallbackLng: 'he',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
