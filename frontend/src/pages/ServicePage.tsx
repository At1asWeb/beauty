import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyState, Row, Section, Spinner, Stars } from '../components/Ui';
import { type Master, type Service, api } from '../lib/api';
import { formatDuration, formatPrice } from '../lib/format';

export default function ServicePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [service, setService] = useState<Service | null>(null);
  const [masters, setMasters] = useState<Master[] | null>(null);

  useEffect(() => {
    if (!id) return;
    const serviceId = Number(id);
    Promise.all([
      api.listServices().then((ss) => ss.find((s) => s.id === serviceId) ?? null),
      api.listMasters(serviceId),
    ]).then(([s, ms]) => {
      setService(s);
      setMasters(ms);
    });
  }, [id]);

  if (!service || masters === null) return <Spinner />;

  return (
    <div className="pt-3">
      <div className="px-4 mb-3">
        <button
          onClick={() => nav(-1)}
          className="text-tg-link text-[15px]"
        >
          ← Назад
        </button>
      </div>
      <Section>
        <div className="p-4">
          <h1 className="text-lg font-semibold">{service.name}</h1>
          <div className="flex gap-3 mt-2 text-tg-hint text-[14px]">
            <span>{formatPrice(service.price)}</span>
            <span>·</span>
            <span>{formatDuration(service.duration_min)}</span>
          </div>
          {service.description && (
            <p className="text-[14px] text-tg-text mt-3">
              {service.description}
            </p>
          )}
        </div>
      </Section>

      <Section title="Выберите мастера">
        {masters.length === 0 ? (
          <EmptyState text="Нет мастеров, оказывающих эту услугу" />
        ) : (
          masters.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                m.booking_stopped
                  ? null
                  : nav(`/service/${service.id}/master/${m.id}`)
              }
              disabled={m.booking_stopped}
              className={
                'w-full text-left px-4 py-3 flex items-center gap-3 ' +
                (m.booking_stopped
                  ? 'opacity-60 cursor-default'
                  : 'active:bg-tg-secondaryBg')
              }
            >
              <div className="w-12 h-12 rounded-full overflow-hidden bg-tg-secondaryBg shrink-0">
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[20px] text-tg-hint">
                    ✂︎
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.display_name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Stars rating={m.rating_avg} count={m.rating_count} />
                  {m.booking_stopped && (
                    <span className="text-[11px] text-red-600">
                      запись приостановлена
                    </span>
                  )}
                </div>
              </div>
              <span className="text-tg-hint">
                {m.booking_stopped ? '🛑' : '›'}
              </span>
            </button>
          ))
        )}
      </Section>
    </div>
  );
}
