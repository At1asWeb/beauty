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

// We intentionally ignore Telegram's themeParams. The salon brand uses a
// fixed warm-beige + rose palette (defined in index.css) and we want it
// to look identical regardless of whether the user has light or dark
// Telegram. We still call ready()/expand() so the WebApp shows
// fullscreen, just without theme overrides.

export function initTelegram(): void {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand();
}

export function haptic(kind: 'success' | 'error' | 'warning'): void {
  tg()?.HapticFeedback?.notificationOccurred(kind);
}
