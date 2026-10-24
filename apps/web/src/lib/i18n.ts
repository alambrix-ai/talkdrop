/** Minimal i18n scaffolding (Phase 6). Expand with react-i18next catalogs later. */

export type Locale = 'en' | 'hi' | 'es' | 'ja' | 'fr';

const catalogs: Record<Locale, Record<string, string>> = {
  en: {
    'cta.start': 'Start a conversation',
    'lobby.ready': 'Ready when you are',
    'call.end': 'End',
    'call.next': 'Next',
  },
  hi: {
    'cta.start': 'बातचीत शुरू करें',
    'lobby.ready': 'जब आप तैयार हों',
    'call.end': 'समाप्त',
    'call.next': 'अगला',
  },
  es: {
    'cta.start': 'Empezar una conversación',
    'lobby.ready': 'Listo cuando tú lo estés',
    'call.end': 'Terminar',
    'call.next': 'Siguiente',
  },
  ja: {
    'cta.start': '会話を始める',
    'lobby.ready': '準備ができたら',
    'call.end': '終了',
    'call.next': '次へ',
  },
  fr: {
    'cta.start': 'Démarrer une conversation',
    'lobby.ready': 'Prêt quand vous l’êtes',
    'call.end': 'Terminer',
    'call.next': 'Suivant',
  },
};

let current: Locale = 'en';

export function setLocale(locale: Locale) {
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function t(key: string, locale: Locale = current): string {
  return catalogs[locale]?.[key] ?? catalogs.en[key] ?? key;
}

export function getLocale(): Locale {
  return current;
}
