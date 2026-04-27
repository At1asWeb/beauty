import { useEffect, useState } from 'react';

import {
  Button,
  EmptyState,
  Row,
  Section,
  Spinner,
  StatusBadge,
  TextArea,
} from '../components/Ui';
import {
  ApiError,
  type Booking,
  type Master,
  type Me,
  type Service,
  api,
} from '../lib/api';
import { formatDateTime, formatPrice } from '../lib/format';
import { haptic, tg } from '../lib/telegram';

export default function BookingHistoryPage({ me: _me }: { me: Me }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [masters, setMasters] = useState<Record<number, Master>>({});
  const [services, setServices] = useState<Record<number, Service>>({});
  const [reviewFor, setReviewFor] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const load = () => {
    api.myBookings().then(setBookings);
    api.listMasters().then((arr) => {
      const map: Record<number, Master> = {};
      for (const m of arr) map[m.id] = m;
      setMasters(map);
    });
    api.listServices().then((arr) => {
      const map: Record<number, Service> = {};
      for (const s of arr) map[s.id] = s;
      setServices(map);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (b: Booking) => {
    tg()?.showConfirm?.('Отменить запись?', async (ok) => {
      if (!ok) return;
      const reason =
        prompt('Причина отмены (не обязательно)?') ?? 'Отменено клиентом';
      try {
        await api.updateBooking(b.id, {
          status: 'cancelled',
          cancellation_reason: reason,
        });
        haptic('success');
        load();
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : String(err);
        tg()?.showAlert(`Ошибка: ${msg}`);
      }
    });
  };

  const submitReview = async () => {
    if (!reviewFor) return;
    try {
      await api.createReview({
        booking_id: reviewFor,
        rating: reviewRating,
        text: reviewText || undefined,
      });
      haptic('success');
      setReviewFor(null);
      setReviewText('');
      setReviewRating(5);
      tg()?.showAlert('Спасибо за отзыв!');
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  if (bookings === null) return <Spinner />;
  if (bookings.length === 0)
    return (
      <div className="pt-10">
        <EmptyState text="У вас пока нет записей" />
      </div>
    );

  const cancellable = (b: Booking) =>
    b.status === 'pending' || b.status === 'confirmed';

  return (
    <div className="pt-3">
      <Section title="Ваши записи">
        {bookings.map((b) => {
          const master = masters[b.master_id];
          const service = services[b.service_id];
          return (
            <Row
              key={b.id}
              trailing={<StatusBadge status={b.status} />}
            >
              <div className="font-medium">
                {service?.name ?? '—'} · {master?.display_name ?? '—'}
              </div>
              <div className="text-tg-hint text-[13px] mt-0.5">
                {formatDateTime(b.start_at)} · {formatPrice(b.price_at_booking)}
              </div>
              {b.cancellation_reason && (
                <div className="text-[12px] text-red-600 mt-1">
                  Причина отмены: {b.cancellation_reason}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {cancellable(b) && (
                  <button
                    onClick={() => cancel(b)}
                    className="text-[13px] text-red-600"
                  >
                    Отменить
                  </button>
                )}
                {b.status === 'completed' && (
                  <button
                    onClick={() => setReviewFor(b.id)}
                    className="text-[13px] text-tg-link"
                  >
                    Оставить отзыв
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </Section>

      {reviewFor !== null && (
        <Section title="Ваш отзыв">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1 text-2xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setReviewRating(n)}
                  className={n <= reviewRating ? 'text-yellow-400' : 'text-tg-hint'}
                >
                  ★
                </button>
              ))}
            </div>
            <TextArea
              value={reviewText}
              onChange={setReviewText}
              placeholder="Поделитесь впечатлениями"
            />
            <Button onClick={submitReview}>Отправить отзыв</Button>
            <button
              onClick={() => setReviewFor(null)}
              className="text-tg-hint text-[13px]"
            >
              Отмена
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
