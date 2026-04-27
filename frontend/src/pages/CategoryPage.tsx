import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyState, Row, Section, Spinner } from '../components/Ui';
import { type Service, api } from '../lib/api';
import { formatDuration, formatPrice } from '../lib/format';

export default function CategoryPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [services, setServices] = useState<Service[] | null>(null);

  useEffect(() => {
    if (!id) return;
    api.listServices(Number(id)).then(setServices);
  }, [id]);

  return (
    <div className="pt-3">
      <div className="px-4 mb-3 flex items-center gap-2">
        <button
          onClick={() => nav(-1)}
          className="text-tg-link text-[15px]"
        >
          ← Назад
        </button>
      </div>
      <Section title="Услуги">
        {services === null ? (
          <Spinner />
        ) : services.length === 0 ? (
          <EmptyState text="В этой категории пока нет услуг" />
        ) : (
          services.map((s) => (
            <Row
              key={s.id}
              onClick={() => nav(`/service/${s.id}`)}
              trailing={
                <div className="text-right">
                  <div className="text-tg-text">{formatPrice(s.price)}</div>
                  <div className="text-[11px] text-tg-hint">
                    {formatDuration(s.duration_min)}
                  </div>
                </div>
              }
            >
              <div className="font-medium">{s.name}</div>
              {s.description && (
                <div className="text-tg-hint text-[13px] mt-0.5 line-clamp-2">
                  {s.description}
                </div>
              )}
            </Row>
          ))
        )}
      </Section>
    </div>
  );
}
