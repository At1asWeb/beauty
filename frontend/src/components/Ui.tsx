import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/** Reusable section wrapper that matches Telegram's UI grouping. */
export function Section({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mb-5">
      {title && (
        <h2 className="text-[13px] uppercase text-tg-hint px-4 mb-1 tracking-wide">
          {title}
        </h2>
      )}
      <div className="bg-tg-sectionBg rounded-xl mx-3 overflow-hidden divide-y divide-tg-separator">
        {children}
      </div>
      {footer && (
        <p className="text-[12px] text-tg-hint px-4 mt-1">{footer}</p>
      )}
    </section>
  );
}

/** A single row inside a Section; chainable and clickable. */
export const Row = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  } & HTMLAttributes<HTMLButtonElement>
>(function Row({ children, trailing, onClick, disabled, ...rest }, ref) {
  const clickable = !!onClick && !disabled;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'w-full text-left px-4 py-3 flex items-center gap-3 text-[15px] ' +
        (clickable ? 'active:bg-tg-secondaryBg' : 'cursor-default') +
        (disabled ? ' opacity-60' : '')
      }
      {...rest}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && (
        <div className="text-tg-hint text-[14px] flex items-center gap-2 shrink-0">
          {trailing}
        </div>
      )}
    </button>
  );
});

/** Primary pill button, styled with Telegram's accent colour. */
export function Button({
  children,
  onClick,
  disabled,
  kind = 'primary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
}) {
  const base =
    'w-full rounded-xl py-3 font-medium text-[15px] disabled:opacity-50 transition-opacity';
  const cls =
    kind === 'primary'
      ? 'bg-tg-button text-tg-buttonText'
      : kind === 'danger'
      ? 'bg-red-500/90 text-white'
      : 'bg-tg-secondaryBg text-tg-text';
  return (
    <button type={type} className={`${base} ${cls}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Input(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'date' | 'time' | 'tel';
  step?: number;
  min?: number;
}) {
  return (
    <input
      className="w-full bg-tg-sectionBg border border-tg-separator rounded-xl px-3 py-2 text-[15px] text-tg-text placeholder-tg-hint focus:outline-none focus:border-tg-link"
      type={props.type ?? 'text'}
      step={props.step}
      min={props.min}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="w-full bg-tg-sectionBg border border-tg-separator rounded-xl px-3 py-2 text-[15px] text-tg-text placeholder-tg-hint focus:outline-none focus:border-tg-link resize-none"
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="stars">
      {'★★★★★'
        .split('')
        .slice(0, rounded)
        .map((s, i) => (
          <span key={`f-${i}`}>★</span>
        ))}
      {'☆☆☆☆☆'
        .split('')
        .slice(0, 5 - rounded)
        .map((s, i) => (
          <span key={`e-${i}`} className="text-tg-hint">
            ☆
          </span>
        ))}
      {count !== undefined && (
        <span className="ml-1 text-tg-hint text-[12px]">({count})</span>
      )}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center text-tg-hint text-[14px] px-6 py-10">
      {text}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-tg-hint text-[14px]">
      <span className="w-4 h-4 rounded-full border-2 border-tg-hint border-t-transparent animate-spin" />
      {label ?? 'Загрузка…'}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    pending: { t: 'Ожидает', c: 'bg-yellow-500/20 text-yellow-300' },
    confirmed: { t: 'Подтверждена', c: 'bg-green-500/20 text-green-300' },
    completed: { t: 'Завершена', c: 'bg-blue-500/20 text-blue-300' },
    cancelled: { t: 'Отменена', c: 'bg-red-500/20 text-red-300' },
    no_show: { t: 'Не пришёл', c: 'bg-gray-500/20 text-gray-300' },
  };
  const s = map[status] ?? { t: status, c: 'bg-gray-500/20 text-gray-300' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${s.c}`}>
      {s.t}
    </span>
  );
}
