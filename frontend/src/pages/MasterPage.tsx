import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  EmptyState,
  Row,
  Section,
  Spinner,
  Stars,
} from '../components/Ui';
import {
  type GalleryItem,
  type Master,
  type Me,
  type Review,
  type Service,
  api,
} from '../lib/api';
import { formatDate, formatDuration, formatPrice } from '../lib/format';

export default function MasterPage({ me: _me }: { me: Me }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [master, setMaster] = useState<Master | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    if (!id) return;
    const masterId = Number(id);
    api.getMaster(masterId).then(setMaster);
    api.listMasterServices(masterId).then(setServices);
    api.getMasterReviews(masterId).then(setReviews);
    api.listGallery(masterId).then(setGallery);
  }, [id]);

  if (!master) return <Spinner />;

  return (
    <div className="pt-3">
      <div className="px-4 mb-3">
        <button onClick={() => nav(-1)} className="text-tg-link text-[15px]">
          ← Назад
        </button>
      </div>

      <Section>
        <div className="p-4">
          <div className="flex items-center gap-3">
            {master.photo_url && (
              <img
                src={master.photo_url}
                alt={master.display_name}
                className="w-16 h-16 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-lg font-semibold">{master.display_name}</h1>
              <Stars rating={master.rating_avg} count={master.rating_count} />
            </div>
          </div>
          {master.bio && (
            <p className="mt-3 text-[14px] text-tg-text">{master.bio}</p>
          )}
          {master.booking_stopped && (
            <p className="mt-3 text-[13px] text-red-300">
              Запись временно приостановлена
              {master.booking_stopped_reason
                ? `: ${master.booking_stopped_reason}`
                : ''}
            </p>
          )}
        </div>
      </Section>

      <Section title="Услуги мастера">
        {services === null ? (
          <Spinner />
        ) : services.length === 0 ? (
          <EmptyState text="Услуги не указаны" />
        ) : (
          services.map((s) => (
            <Row
              key={s.id}
              onClick={() => nav(`/service/${s.id}/master/${master.id}`)}
              disabled={master.booking_stopped}
              trailing={
                <div className="text-right">
                  <div>{formatPrice(s.price)}</div>
                  <div className="text-[11px] text-tg-hint">
                    {formatDuration(s.duration_min)}
                  </div>
                </div>
              }
            >
              <div className="font-medium">{s.name}</div>
            </Row>
          ))
        )}
      </Section>

      <Section title="Галерея работ">
        {gallery === null ? (
          <Spinner />
        ) : gallery.length === 0 ? (
          <EmptyState text="Пока пусто" />
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

      <Section title="Отзывы">
        {reviews === null ? (
          <Spinner />
        ) : reviews.length === 0 ? (
          <EmptyState text="Отзывов пока нет" />
        ) : (
          reviews.map((r) => (
            <div
              key={r.id}
              className="px-4 py-3 text-[14px]"
            >
              <div className="flex items-center gap-2">
                <Stars rating={r.rating} />
                <span className="text-tg-hint text-[12px]">
                  {formatDate(r.created_at)}
                </span>
              </div>
              {r.text && <p className="mt-1">{r.text}</p>}
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
