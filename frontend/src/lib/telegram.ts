// Lightweight wrappers around the Telegram Web Apps SDK. We attach to
// the globally injected `window.Telegram.WebApp` from telegram-web-app.js
// so the app also works for non-Telegram browsers (dev mode).

type ThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  section_separator_color?: string;
};

type WebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  colorScheme?: 'light' | 'dark';
  themeParams?: ThemeParams;
  ready(): void;
  expand(): void;
  onEvent(type: string, cb: () => void): void;
  showAlert(msg: string, cb?: () => void): void;
  showConfirm(msg: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: {
    notificationOccurred(kind: 'error' | 'success' | 'warning'): void;
    impactOccurred(kind: 'light' | 'medium' | 'heavy'): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  MainButton?: {
    setText(t: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setParams(p: { text?: string; is_active?: boolean; color?: string }): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export const tg = (): WebApp | undefined => window.Telegram?.WebApp;

function applyTheme(): void {
  const w = tg();
  if (!w?.themeParams) return;
  const root = document.documentElement;
  const p = w.themeParams;
  const set = (k: string, v: string | undefined) => {
    if (v) root.style.setProperty(k, v);
  };
  set('--tg-bg', p.bg_color);
  set('--tg-text', p.text_color);
  set('--tg-hint', p.hint_color);
  set('--tg-link', p.link_color);
  set('--tg-button', p.button_color);
  set('--tg-button-text', p.button_text_color);
  set('--tg-secondary-bg', p.secondary_bg_color);
  set('--tg-section-bg', p.section_bg_color);
  set('--tg-separator', p.section_separator_color);
}

export function initTelegram(): void {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand();
  applyTheme();
  w.onEvent('themeChanged', applyTheme);
}

export function haptic(kind: 'success' | 'error' | 'warning'): void {
  tg()?.HapticFeedback?.notificationOccurred(kind);
}
