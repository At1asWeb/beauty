import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState, Section, Spinner, Stars } from '../components/Ui';
import {
  type Category,
  type GalleryItem,
  type Master,
  api,
} from '../lib/api';
import type { Me } from '../lib/api';

export default function HomePage({ me }: { me: Me }) {
  const nav = useNavigate();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [masters, setMasters] = useState<Master[] | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    api.listCategories().then(setCategories);
    api.listMasters().then(setMasters);
    api.listGallery().then(setGallery);
  }, []);

  return (
    <div className="pb-4">
      {/* ---- Hero banner with the salon photo ---- */}
      <header className="relative">
        <div className="aspect-[16/9] overflow-hidden">
          <img
            src={api.resolveAsset(me.salon_banner_url)}
            alt={me.salon_name}
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(43,31,23,0) 40%, rgba(43,31,23,0.55) 100%)',
            }}
          />
        </div>
        <div className="absolute bottom-0 inset-x-0 px-4 pb-4 text-white">
          <h1 className="text-[22px] font-semibold leading-tight drop-shadow">
            {me.salon_name}
          </h1>
          <p className="text-[13px] opacity-90 mt-0.5 drop-shadow">
            Запись 24/7. Выберите услугу и мастера.
          </p>
        </div>
      </header>

      {/* ---- Услуги (категории) ---- */}
      <Section title="Услуги">
        {categories === null ? (
          <Spinner />
        ) : categories.length === 0 ? (
          <EmptyState text="Категории ещё не заведены" />
        ) : (
          <div className="p-3 grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => nav(`/category/${c.id}`)}
                className="text-left bg-white rounded-2xl shadow-soft overflow-hidden active:scale-[0.98] transition-transform"
              >
                <div className="aspect-[4/3] bg-tg-secondaryBg overflow-hidden">
                  {c.photo_url ? (
                    <img
                      src={api.resolveAsset(c.photo_url)}
                      alt={c.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[34px] text-tg-hint">
                      {c.icon ?? '✨'}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-[15px] line-clamp-1">
                    {c.icon ? `${c.icon} ` : ''}
                    {c.name}
                  </div>
                  {c.description && (
                    <div className="text-tg-hint text-[12px] mt-1 line-clamp-2">
                      {c.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Наши мастера ---- */}
      <Section title="Наши мастера">
        {masters === null ? (
          <Spinner />
        ) : masters.length === 0 ? (
          <EmptyState text="Мастера скоро появятся" />
        ) : (
          <div className="px-3 pb-2 flex gap-3 overflow-x-auto -mx-1">
            {masters.map((m) => (
              <button
                key={m.id}
                onClick={() => nav(`/master/${m.id}`)}
                className="shrink-0 w-[150px] bg-white rounded-2xl shadow-soft overflow-hidden text-left active:scale-[0.98] transition-transform"
              >
                <div className="aspect-square bg-tg-secondaryBg overflow-hidden">
                  {m.photo_url ? (
                    <img
                      src={api.resolveAsset(m.photo_url)}
                      alt={m.display_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[42px] text-tg-hint">
                      ✂︎
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-[14px] line-clamp-1">
                    {m.display_name}
                  </div>
                  <div className="mt-1">
                    <Stars rating={m.rating_avg} count={m.rating_count} />
                  </div>
                  {m.booking_stopped && (
                    <div className="text-[11px] text-red-500 mt-1">
                      запись приостановлена
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Галерея работ ---- */}
      <Section title="Галерея работ">
        {gallery === null ? (
          <Spinner />
        ) : gallery.length === 0 ? (
          <EmptyState text="Галерея пока пуста" />
        ) : (
          <div className="p-2 grid grid-cols-3 gap-2">
            {gallery.map((g) => (
              <div
                key={g.id}
                className="aspect-square rounded-xl overflow-hidden bg-tg-secondaryBg shadow-soft"
              >
                <img
                  src={api.resolveAsset(g.image_url)}
                  alt={g.caption ?? ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
