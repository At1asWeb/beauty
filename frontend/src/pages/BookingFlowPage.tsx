import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Button,
  EmptyState,
  Input,
  Row,
  Section,
  Spinner,
  TextArea,
} from '../components/Ui';
import {
  ApiError,
  type Master,
  type Me,
  type Service,
  type Slot,
  api,
} from '../lib/api';
import { formatDuration, formatPrice, formatTime, toLocalDateInputValue } from '../lib/format';
import { haptic, tg } from '../lib/telegram';

export default function BookingFlowPage({ me: _me }: { me: Me }) {
  const { serviceId, masterId } = useParams();
  const nav = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [master, setMaster] = useState<Master | null>(null);
  const [day, setDay] = useState<string>(toLocalDateInputValue(new Date()));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [slotsRetry, setSlotsRetry] = useState(0);
  const today = toLocalDateInputValue(new Date());

  useEffect(() => {
    if (!serviceId || !masterId) return;
    let active = true;
    setService(null);
    setMaster(null);
    setDetailsError(false);
    Promise.all([api.listServices(), api.getMaster(Number(masterId))])
      .then(([services, m]) => {
        if (!active) return;
        const s = services.find((x) => x.id === Number(serviceId));
        if (!s) {
          setDetailsError(true);
          return;
        }
        setService(s);
        setMaster(m);
      })
      .catch(() => {
        if (active) setDetailsError(true);
      });
    return () => {
      active = false;
    };
  }, [serviceId, masterId, detailsRetry]);

  useEffect(() => {
    let active = true;
    setSelectedSlot(null);
    setSlots(null);
    setSlotsError(false);
    if (!serviceId || !masterId || !day) return;
    api.getSlots(Number(masterId), Number(serviceId), day)
      .then((available) => {
        if (active) setSlots(available);
      })
      .catch(() => {
        if (active) setSlotsError(true);
      });
    return () => {
      active = false;
    };
  }, [serviceId, masterId, day, slotsRetry]);

  const grouped = useMemo(() => {
    if (!slots) return null;
    const morning: Slot[] = [];
    const day_: Slot[] = [];
    const evening: Slot[] = [];
    for (const s of slots) {
      const h = new Date(s.start_at).getHours();
      if (h < 12) morning.push(s);
      else if (h < 17) day_.push(s);
      else evening.push(s);
    }
    return { morning, day: day_, evening };
  }, [slots]);

  if (detailsError)
    return (
      <div className="p-4 text-tg-text" role="alert">
        Не удалось загрузить услугу или мастера.
        <button className="block mt-2 text-tg-link" onClick={() => setDetailsRetry((n) => n + 1)}>
          Повторить
        </button>
      </div>
    );
  if (!service || !master) return <Spinner />;

  const submit = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.createBooking({
        master_id: master.id,
        service_id: service.id,
        start_at: selectedSlot,
        client_comment: comment || undefined,
      });
      haptic('success');
      if (tg()?.initData) {
        tg()?.showAlert('Заявка отправлена. Ожидайте подтверждения мастера.', () =>
          nav('/history'),
        );
      } else {
        nav('/history');
      }
    } catch (err) {
      haptic('error');
      const msg = err instanceof ApiError ? err.detail : String(err);
      setSubmitError(`Не удалось создать запись: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-3 pb-24">
      <div className="px-4 mb-3">
        <button
          onClick={() => nav(-1)}
          className="text-tg-link text-[15px]"
        >
          ← Назад
        </button>
      </div>

      <Section>
        <div className="p-4 space-y-1">
          <div className="font-medium">{master.display_name}</div>
          <div className="text-tg-hint text-[14px]">{service.name}</div>
          <div className="text-tg-hint text-[13px]">
            {formatPrice(service.price)} · {formatDuration(service.duration_min)}
          </div>
        </div>
      </Section>

      <Section title="Дата">
        <div className="p-3">
          <Input
            type="date"
            value={day}
            onChange={(value) => setDay(value && value < today ? today : value)}
            min={today}
          />
        </div>
      </Section>

      <Section title="Время">
        {!day ? (
          <EmptyState text="Выберите дату, чтобы увидеть свободное время" />
        ) : slotsError ? (
          <div className="p-4 text-[14px] text-tg-text" role="alert">
            Не удалось загрузить свободное время.
            <button className="block mt-2 text-tg-link" onClick={() => setSlotsRetry((n) => n + 1)}>
              Повторить
            </button>
          </div>
        ) : slots === null ? (
          <Spinner />
        ) : slots.length === 0 ? (
          <EmptyState text="На эту дату нет свободных слотов" />
        ) : (
          <div className="p-3 space-y-3">
            {grouped && (
              <>
                {grouped.morning.length > 0 && (
                  <SlotGroup
                    title="Утро"
                    slots={grouped.morning}
                    selected={selectedSlot}
                    onPick={setSelectedSlot}
                  />
                )}
                {grouped.day.length > 0 && (
                  <SlotGroup
                    title="День"
                    slots={grouped.day}
                    selected={selectedSlot}
                    onPick={setSelectedSlot}
                  />
                )}
                {grouped.evening.length > 0 && (
                  <SlotGroup
                    title="Вечер"
                    slots={grouped.evening}
                    selected={selectedSlot}
                    onPick={setSelectedSlot}
                  />
                )}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Комментарий (необязательно)">
        <div className="p-3">
          <TextArea
            value={comment}
            onChange={setComment}
            placeholder="Например: аллергия на определённые средства"
          />
        </div>
      </Section>

      <div className="px-3 mt-4">
        {submitError && (
          <p className="text-red-600 text-[14px] mb-2" role="alert">{submitError}</p>
        )}
        <Button onClick={submit} disabled={!selectedSlot || submitting}>
          {submitting ? 'Отправляем…' : 'Записаться'}
        </Button>
      </div>
    </div>
  );
}

function SlotGroup({
  title,
  slots,
  selected,
  onPick,
}: {
  title: string;
  slots: Slot[];
  selected: string | null;
  onPick: (iso: string) => void;
}) {
  return (
    <div>
      <div className="text-tg-hint text-[12px] uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((s) => {
          const isSelected = selected === s.start_at;
          return (
            <button
              key={s.start_at}
              onClick={() => onPick(s.start_at)}
              className={
                'py-2 rounded-lg text-[14px] transition-colors ' +
                (isSelected
                  ? 'bg-tg-button text-tg-buttonText'
                  : 'bg-tg-secondaryBg text-tg-text')
              }
            >
              {formatTime(s.start_at)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Using _me reference to satisfy TS unused-var even with strict config off.
void BookingFlowPage;
