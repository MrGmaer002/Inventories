import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.ts';
import en from './en.ts';

export type Dictionary = typeof ar;

const STORAGE_KEY = 'pancafe_lang';

export function savedLang(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en }
  },
  lng: savedLang(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnNull: false
});

export function switchLanguage(lang: 'ar' | 'en'): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  void i18n.changeLanguage(lang);
}

// Apply direction on first load (before React mounts).
document.documentElement.lang = i18n.language;
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';

export default i18n;
