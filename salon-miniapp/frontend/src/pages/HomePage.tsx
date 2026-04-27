import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState, Row, Section, Spinner, Stars } from '../components/Ui';
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
    <div className="pt-3">
      <header className="px-4 mb-4">
        <div className="bg-gradient-to-br from-tg-button/30 to-tg-sectionBg rounded-2xl p-5">
          <h1 className="text-xl font-semibold leading-tight">
            {me.salon_name}
          </h1>
          <p className="text-tg-hint text-[13px] mt-1">
            Запись в салон 24/7. Выберите услугу и мастера.
          </p>
        </div>
      </header>

      <Section title="Категории услуг">
        {categories === null ? (
          <Spinner />
        ) : categories.length === 0 ? (
          <EmptyState text="Категории ещё не заведены" />
        ) : (
          categories.map((c) => (
            <Row
              key={c.id}
              onClick={() => nav(`/category/${c.id}`)}
              trailing={<span>›</span>}
            >
              <div className="font-medium">
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </div>
              {c.description && (
                <div className="text-tg-hint text-[13px] mt-0.5">
                  {c.description}
                </div>
              )}
            </Row>
          ))
        )}
      </Section>

      <Section title="Наши мастера">
        {masters === null ? (
          <Spinner />
        ) : masters.length === 0 ? (
          <EmptyState text="Мастера скоро появятся" />
        ) : (
          masters.map((m) => (
            <Row
              key={m.id}
              onClick={() => nav(`/master/${m.id}`)}
              trailing={<span>›</span>}
            >
              <div className="font-medium">{m.display_name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Stars rating={m.rating_avg} count={m.rating_count} />
                {m.booking_stopped && (
                  <span className="text-[11px] text-red-400">
                    запись приостановлена
                  </span>
                )}
              </div>
            </Row>
          ))
        )}
      </Section>

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
                className="aspect-square rounded-lg overflow-hidden bg-tg-secondaryBg"
              >
                <img
                  src={g.image_url}
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
