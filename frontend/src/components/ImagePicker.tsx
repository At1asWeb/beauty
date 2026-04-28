import { useRef, useState } from 'react';

import { ApiError, api } from '../lib/api';
import { tg } from '../lib/telegram';

/** Image input that accepts a URL or a direct file upload.
 *
 * On upload the file is sent to `POST /api/uploads`; the returned URL
 * is then placed into `value` so the parent form just stores a string
 * regardless of where the image originated.
 */
export function ImagePicker({
  value,
  onChange,
  placeholder,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const out = await api.uploadFile(file);
      onChange(out.url);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Не удалось загрузить файл: ${msg}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {value ? (
          <img
            src={api.resolveAsset(value)}
            alt=""
            className="w-12 h-12 rounded-lg object-cover bg-tg-secondaryBg shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-tg-secondaryBg flex items-center justify-center text-tg-hint text-[20px] shrink-0">
            🖼
          </div>
        )}
        <input
          className="flex-1 min-w-0 bg-tg-sectionBg border border-tg-separator rounded-xl px-3 py-2 text-[15px] text-tg-text placeholder-tg-hint focus:outline-none focus:border-tg-link"
          type="text"
          value={value}
          placeholder={placeholder ?? 'URL или загрузите файл'}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 rounded-full text-[13px] bg-tg-secondaryBg text-tg-text disabled:opacity-50"
        >
          {busy ? 'Загрузка…' : '📷 Загрузить с устройства'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-full text-[13px] text-red-600"
          >
            убрать
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      {hint && <div className="text-[12px] text-tg-hint">{hint}</div>}
    </div>
  );
}
