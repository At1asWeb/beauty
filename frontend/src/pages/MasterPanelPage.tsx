import { useEffect, useMemo, useState } from 'react';

import {
  Button,
  EmptyState,
  Input,
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
  type MasterStats,
  type Me,
  type ScheduleEntry,
  type Service,
  api,
} from '../lib/api';
import {
  WEEKDAYS_RU,
  formatDateTime,
  formatPrice,
} from '../lib/format';
import { haptic, tg } from '../lib/telegram';

type Tab = 'bookings' | 'schedule' | 'services' | 'clients' | 'stats';

export default function MasterPanelPage({
  me,
  onChange,
}: {
  me: Me;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>('bookings');
  const [master, setMaster] = useState<Master | null>(null);

  useEffect(() => {
    if (me.master_id === null) return;
    api.getMaster(me.master_id).then(setMaster);
  }, [me.master_id]);

  if (me.master_id === null) {
    return (
      <div className="p-6 text-tg-text">
        <h1 className="text-lg font-semibold mb-2">Панель мастера</h1>
        <p className="text-tg-hint text-[14px]">
          Вы ещё не привязаны к профилю мастера. Попросите администратора
          добавить вас через админ-панель.
        </p>
      </div>
    );
  }

  if (!master) return <Spinner />;

  const refreshMaster = () => {
    if (me.master_id !== null) api.getMaster(me.master_id).then(setMaster);
    onChange();
  };

  return (
    <div className="pt-3 pb-4">
      <Section>
        <div className="p-4">
          <h1 className="text-lg font-semibold">{master.display_name}</h1>
          <div className="flex items-center gap-2 text-tg-hint text-[13px] mt-0.5">
            <span>Панель мастера</span>
            {master.booking_stopped && (
              <span className="text-red-600">· запись приостановлена</span>
            )}
          </div>
        </div>
        <div className="p-3">
          <StopBookingToggle master={master} onChange={refreshMaster} />
        </div>
      </Section>

      <div className="px-3 mb-3 flex overflow-x-auto gap-2 text-[13px]">
        {(
          [
            ['bookings', 'Записи'],
            ['schedule', 'Расписание'],
            ['services', 'Услуги'],
            ['clients', 'Клиенты'],
            ['stats', 'Статистика'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'px-3 py-1.5 rounded-full whitespace-nowrap ' +
              (tab === t
                ? 'bg-tg-button text-tg-buttonText'
                : 'bg-tg-secondaryBg text-tg-text')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsTab masterId={master.id} />}
      {tab === 'schedule' && <ScheduleTab masterId={master.id} />}
      {tab === 'services' && <ServicesTab masterId={master.id} />}
      {tab === 'clients' && <ClientsTab masterId={master.id} />}
      {tab === 'stats' && <StatsTab masterId={master.id} />}
    </div>
  );
}

function StopBookingToggle({
  master,
  onChange,
}: {
  master: Master;
  onChange: () => void;
}) {
  const [reason, setReason] = useState(master.booking_stopped_reason ?? '');
  const toggle = async () => {
    try {
      await api.setStopBooking(master.id, {
        booking_stopped: !master.booking_stopped,
        booking_stopped_reason: !master.booking_stopped ? reason || null : null,
      });
      haptic('success');
      onChange();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };
  return (
    <div className="space-y-2">
      {!master.booking_stopped && (
        <Input
          value={reason}
          onChange={setReason}
          placeholder="Причина остановки (необязательно)"
        />
      )}
      <Button
        kind={master.booking_stopped ? 'primary' : 'danger'}
        onClick={toggle}
      >
        {master.booking_stopped
          ? 'Возобновить приём записей'
          : 'Остановить приём записей'}
      </Button>
    </div>
  );
}

function BookingsTab({ masterId }: { masterId: number }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [services, setServices] = useState<Record<number, Service>>({});

  const load = () => {
    api.masterBookings(masterId).then(setBookings);
    api.listServices().then((arr) => {
      const map: Record<number, Service> = {};
      for (const s of arr) map[s.id] = s;
      setServices(map);
    });
  };

  useEffect(load, [masterId]);

  const act = async (
    b: Booking,
    status: 'confirmed' | 'cancelled' | 'completed' | 'no_show',
  ) => {
    let reason: string | undefined;
    if (status === 'cancelled') {
      reason = prompt('Причина отмены?') ?? '';
      if (!reason) return;
    }
    try {
      await api.updateBooking(b.id, {
        status,
        cancellation_reason: reason,
      });
      haptic('success');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  if (bookings === null) return <Spinner />;
  if (bookings.length === 0) return <EmptyState text="Записей нет" />;

  return (
    <Section title="Все записи">
      {bookings.map((b) => {
        const s = services[b.service_id];
        return (
          <Row key={b.id} trailing={<StatusBadge status={b.status} />}>
            <div className="font-medium">{s?.name ?? 'Услуга'}</div>
            <div className="text-tg-hint text-[13px] mt-0.5">
              {formatDateTime(b.start_at)} · {formatPrice(b.price_at_booking)}
            </div>
            {b.client_comment && (
              <div className="text-[12px] text-tg-hint mt-1">
                Клиент: {b.client_comment}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
              {b.status === 'pending' && (
                <button
                  onClick={() => act(b, 'confirmed')}
                  className="text-green-600"
                >
                  Подтвердить
                </button>
              )}
              {(b.status === 'pending' || b.status === 'confirmed') && (
                <button
                  onClick={() => act(b, 'cancelled')}
                  className="text-red-600"
                >
                  Отменить
                </button>
              )}
              {(b.status === 'pending' || b.status === 'confirmed') && (
                <button
                  onClick={() => act(b, 'completed')}
                  className="text-tg-link"
                >
                  Завершить
                </button>
              )}
              {(b.status === 'pending' || b.status === 'confirmed') && (
                <button
                  onClick={() => act(b, 'no_show')}
                  className="text-tg-hint"
                >
                  Не пришёл
                </button>
              )}
            </div>
          </Row>
        );
      })}
    </Section>
  );
}

function ScheduleTab({ masterId }: { masterId: number }) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);

  useEffect(() => {
    api.getSchedule(masterId).then(setEntries);
  }, [masterId]);

  const setWeekdayHours = (weekday: number, start: string, end: string, off: boolean) => {
    if (!entries) return;
    const filtered = entries.filter((e) => e.weekday !== weekday);
    const next: ScheduleEntry[] = off
      ? [
          ...filtered,
          {
            weekday,
            date: null,
            start_time: start,
            end_time: end || '23:59',
            is_off: true,
          },
        ]
      : [
          ...filtered,
          {
            weekday,
            date: null,
            start_time: start,
            end_time: end,
            is_off: false,
          },
        ];
    setEntries(next);
  };

  const save = async () => {
    if (!entries) return;
    try {
      const saved = await api.setSchedule(masterId, entries);
      setEntries(saved);
      haptic('success');
      tg()?.showAlert('Расписание сохранено');
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  if (entries === null) return <Spinner />;

  return (
    <>
      <Section title="Недельный график">
        {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
          const row = entries.find((e) => e.weekday === wd) ?? {
            weekday: wd,
            date: null,
            start_time: '10:00',
            end_time: '20:00',
            is_off: true,
          };
          return (
            <div key={wd} className="p-3 space-y-2">
              <div className="flex items-center justify-between text-[14px]">
                <span>{WEEKDAYS_RU[wd]}</span>
                <label className="flex items-center gap-2 text-[13px] text-tg-hint">
                  <input
                    type="checkbox"
                    checked={row.is_off}
                    onChange={(e) =>
                      setWeekdayHours(
                        wd,
                        row.start_time,
                        row.end_time,
                        e.target.checked,
                      )
                    }
                  />
                  выходной
                </label>
              </div>
              {!row.is_off && (
                <div className="flex gap-2 items-center">
                  <Input
                    type="time"
                    value={row.start_time}
                    onChange={(v) =>
                      setWeekdayHours(wd, v, row.end_time, false)
                    }
                  />
                  <span className="text-tg-hint">—</span>
                  <Input
                    type="time"
                    value={row.end_time}
                    onChange={(v) =>
                      setWeekdayHours(wd, row.start_time, v, false)
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </Section>
      <div className="px-3">
        <Button onClick={save}>Сохранить</Button>
      </div>
    </>
  );
}

function ServicesTab({ masterId }: { masterId: number }) {
  const [mine, setMine] = useState<Service[] | null>(null);
  const [all, setAll] = useState<Service[] | null>(null);

  const load = () => {
    api.listMasterServices(masterId).then(setMine);
    api.listServices().then(setAll);
  };
  useEffect(load, [masterId]);

  const toggleService = async (s: Service) => {
    const already = mine?.some((m) => m.id === s.id);
    try {
      if (already) await api.removeMasterService(masterId, s.id);
      else await api.addMasterService(masterId, { service_id: s.id });
      haptic('success');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  if (mine === null || all === null) return <Spinner />;

  return (
    <Section title="Какие услуги оказываю">
      {all.length === 0 ? (
        <EmptyState text="Администратор ещё не завёл услуг" />
      ) : (
        all.map((s) => {
          const on = mine.some((m) => m.id === s.id);
          return (
            <Row
              key={s.id}
              onClick={() => toggleService(s)}
              trailing={
                <span className={on ? 'text-green-600' : 'text-tg-hint'}>
                  {on ? '✓' : '+'}
                </span>
              }
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-tg-hint text-[12px]">
                {formatPrice(s.price)} · {s.duration_min} мин
              </div>
            </Row>
          );
        })
      )}
    </Section>
  );
}

function ClientsTab({ masterId }: { masterId: number }) {
  const [blocks, setBlocks] = useState<
    { id: number; client_id: number; reason: string | null }[] | null
  >(null);

  const load = () => {
    api.listBlocks(masterId).then(setBlocks);
  };
  useEffect(load, [masterId]);

  const block = async () => {
    const raw = prompt('Введите внутренний ID клиента для блокировки');
    if (!raw) return;
    const id = Number(raw);
    if (!id) return;
    const reason = prompt('Причина (необязательно)') ?? undefined;
    try {
      await api.blockClient(masterId, id, reason);
      haptic('success');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  const unblock = async (clientId: number) => {
    try {
      await api.unblockClient(masterId, clientId);
      haptic('success');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  if (blocks === null) return <Spinner />;

  return (
    <>
      <Section title="Заблокированные клиенты" footer="ID клиента видно в списке записей (client_id).">
        {blocks.length === 0 ? (
          <EmptyState text="Нет заблокированных клиентов" />
        ) : (
          blocks.map((b) => (
            <Row
              key={b.id}
              onClick={() => unblock(b.client_id)}
              trailing={<span className="text-red-600">Разблокировать</span>}
            >
              <div className="font-medium">Клиент #{b.client_id}</div>
              {b.reason && (
                <div className="text-tg-hint text-[12px]">{b.reason}</div>
              )}
            </Row>
          ))
        )}
      </Section>
      <div className="px-3">
        <Button kind="ghost" onClick={block}>
          Заблокировать клиента
        </Button>
      </div>
    </>
  );
}

function StatsTab({ masterId }: { masterId: number }) {
  const [stats, setStats] = useState<MasterStats | null>(null);
  useEffect(() => {
    api.getMasterStats(masterId).then(setStats);
  }, [masterId]);

  if (!stats) return <Spinner />;
  return (
    <Section title={`Статистика за последние 30 дней`}>
      <div className="p-4 grid grid-cols-2 gap-3 text-[14px]">
        <StatItem label="Всего записей" value={String(stats.total_bookings)} />
        <StatItem
          label="Выполнено"
          value={String(stats.completed_bookings)}
        />
        <StatItem
          label="Отменено"
          value={String(stats.cancelled_bookings)}
        />
        <StatItem label="Доход" value={formatPrice(stats.revenue)} />
      </div>
    </Section>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tg-secondaryBg rounded-xl p-3">
      <div className="text-[11px] text-tg-hint">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

// Keep memoized unused var happy.
useMemo;
