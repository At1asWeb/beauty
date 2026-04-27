import { useEffect, useState } from 'react';

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
  type Category,
  type GalleryItem,
  type Master,
  type Me,
  type Service,
  api,
} from '../lib/api';
import { formatPrice } from '../lib/format';
import { haptic, tg } from '../lib/telegram';

type Tab = 'categories' | 'services' | 'masters' | 'gallery' | 'broadcast';

export default function AdminPage({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>('categories');

  if (me.user.role !== 'admin') {
    return (
      <div className="p-6 text-tg-hint">
        Эта страница доступна только администратору.
      </div>
    );
  }

  return (
    <div className="pt-3 pb-4">
      <h1 className="px-4 text-lg font-semibold mb-3">Администрирование</h1>
      <div className="px-3 mb-3 flex overflow-x-auto gap-2 text-[13px]">
        {(
          [
            ['categories', 'Категории'],
            ['services', 'Услуги'],
            ['masters', 'Мастера'],
            ['gallery', 'Галерея'],
            ['broadcast', 'Рассылка'],
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

      {tab === 'categories' && <CategoriesTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'masters' && <MastersTab />}
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'broadcast' && <BroadcastTab />}
    </div>
  );
}

function handle<T>(p: Promise<T>, done: () => void) {
  return p
    .then(() => {
      haptic('success');
      done();
    })
    .catch((err) => {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    });
}

function CategoriesTab() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  const load = () => {
    api.listCategories().then(setCats);
  };
  useEffect(() => {
    load();
  }, []);

  const add = () => {
    if (!name.trim()) return;
    handle(
      api.createCategory({ name, icon: icon || null, sort_order: 0 }),
      () => {
        setName('');
        setIcon('');
        load();
      },
    );
  };

  const remove = (id: number) => {
    if (!confirm('Удалить категорию?')) return;
    handle(api.deleteCategory(id), load);
  };

  return (
    <>
      <Section title="Новая категория">
        <div className="p-3 space-y-2">
          <Input
            value={name}
            onChange={setName}
            placeholder="Название, напр. «Маникюр»"
          />
          <Input
            value={icon}
            onChange={setIcon}
            placeholder="Эмодзи-иконка (необязательно)"
          />
          <Button onClick={add}>Добавить</Button>
        </div>
      </Section>
      <Section title="Все категории">
        {cats === null ? (
          <Spinner />
        ) : cats.length === 0 ? (
          <EmptyState text="Пока нет категорий" />
        ) : (
          cats.map((c) => (
            <Row
              key={c.id}
              trailing={
                <button
                  onClick={() => remove(c.id)}
                  className="text-red-300"
                >
                  удалить
                </button>
              }
            >
              <div className="font-medium">
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </div>
            </Row>
          ))
        )}
      </Section>
    </>
  );
}

function ServicesTab() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [svs, setSvs] = useState<Service[] | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('0');
  const [duration, setDuration] = useState('60');
  const [categoryId, setCategoryId] = useState<number | ''>('');

  const load = () => {
    api.listCategories().then((r) => {
      setCats(r);
      if (r.length > 0 && categoryId === '') setCategoryId(r[0].id);
    });
    api.listServices().then(setSvs);
  };
  useEffect(load, []);

  const add = () => {
    if (!name.trim() || categoryId === '') return;
    handle(
      api.createService({
        category_id: Number(categoryId),
        name,
        price: Number(price) || 0,
        duration_min: Number(duration) || 60,
      }),
      () => {
        setName('');
        setPrice('0');
        setDuration('60');
        load();
      },
    );
  };

  const remove = (id: number) => {
    if (!confirm('Удалить услугу?')) return;
    handle(api.deleteService(id), load);
  };

  return (
    <>
      <Section title="Новая услуга">
        <div className="p-3 space-y-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="w-full bg-tg-sectionBg border border-tg-separator rounded-xl px-3 py-2 text-[15px] text-tg-text"
          >
            {(cats ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input value={name} onChange={setName} placeholder="Название" />
          <Input
            type="number"
            value={price}
            onChange={setPrice}
            placeholder="Цена, ₽"
          />
          <Input
            type="number"
            value={duration}
            onChange={setDuration}
            placeholder="Длительность, мин"
          />
          <Button onClick={add}>Добавить</Button>
        </div>
      </Section>
      <Section title="Все услуги">
        {svs === null ? (
          <Spinner />
        ) : svs.length === 0 ? (
          <EmptyState text="Пока нет услуг" />
        ) : (
          svs.map((s) => (
            <Row
              key={s.id}
              trailing={
                <button
                  onClick={() => remove(s.id)}
                  className="text-red-300"
                >
                  удалить
                </button>
              }
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-tg-hint text-[12px]">
                {formatPrice(s.price)} · {s.duration_min} мин
              </div>
            </Row>
          ))
        )}
      </Section>
    </>
  );
}

function MastersTab() {
  const [masters, setMasters] = useState<Master[] | null>(null);
  const [tgId, setTgId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const load = () => {
    api.listMasters().then(setMasters);
  };
  useEffect(load, []);

  const add = () => {
    const numericId = Number(tgId);
    if (!numericId || !name.trim()) return;
    handle(
      api.createMaster({
        tg_id: numericId,
        display_name: name,
        bio: bio || undefined,
        is_admin: isAdmin,
      }),
      () => {
        setTgId('');
        setName('');
        setBio('');
        setIsAdmin(false);
        load();
      },
    );
  };

  const remove = (id: number) => {
    if (!confirm('Удалить мастера?')) return;
    handle(api.deleteMaster(id), load);
  };

  return (
    <>
      <Section
        title="Добавить мастера"
        footer="Введите Telegram ID пользователя — он появится в списке мастеров после того как откроет мини-приложение."
      >
        <div className="p-3 space-y-2">
          <Input
            type="number"
            value={tgId}
            onChange={setTgId}
            placeholder="Telegram ID"
          />
          <Input
            value={name}
            onChange={setName}
            placeholder="Отображаемое имя"
          />
          <TextArea value={bio} onChange={setBio} placeholder="О мастере" />
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            Назначить администратором
          </label>
          <Button onClick={add}>Добавить</Button>
        </div>
      </Section>
      <Section title="Все мастера">
        {masters === null ? (
          <Spinner />
        ) : masters.length === 0 ? (
          <EmptyState text="Мастеров нет" />
        ) : (
          masters.map((m) => (
            <Row
              key={m.id}
              trailing={
                <button
                  onClick={() => remove(m.id)}
                  className="text-red-300"
                >
                  удалить
                </button>
              }
            >
              <div className="font-medium">{m.display_name}</div>
              <div className="text-tg-hint text-[12px]">
                Рейтинг {m.rating_avg.toFixed(1)} · {m.rating_count} отзывов
              </div>
            </Row>
          ))
        )}
      </Section>
    </>
  );
}

function GalleryTab() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');

  const load = () => {
    api.listGallery().then(setItems);
  };
  useEffect(load, []);

  const add = () => {
    if (!url.trim()) return;
    handle(
      api.addGalleryItem({
        image_url: url,
        caption: caption || undefined,
      }),
      () => {
        setUrl('');
        setCaption('');
        load();
      },
    );
  };

  const remove = (id: number) => {
    if (!confirm('Удалить изображение?')) return;
    handle(api.deleteGalleryItem(id), load);
  };

  return (
    <>
      <Section title="Добавить в галерею">
        <div className="p-3 space-y-2">
          <Input
            value={url}
            onChange={setUrl}
            placeholder="URL изображения (https://…)"
          />
          <Input
            value={caption}
            onChange={setCaption}
            placeholder="Подпись (необязательно)"
          />
          <Button onClick={add}>Добавить</Button>
        </div>
      </Section>
      <Section title="Галерея">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState text="Пусто" />
        ) : (
          <div className="p-2 grid grid-cols-3 gap-2">
            {items.map((g) => (
              <div key={g.id} className="relative">
                <div className="aspect-square rounded-lg overflow-hidden bg-tg-secondaryBg">
                  <img
                    src={g.image_url}
                    alt={g.caption ?? ''}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => remove(g.id)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-[11px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function BroadcastTab() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    if (!confirm('Отправить сообщение всем пользователям?')) return;
    setSending(true);
    try {
      const res = await api.createBroadcast(text);
      haptic('success');
      tg()?.showAlert(
        `Рассылка завершена: отправлено ${res.sent_count}, ошибок ${res.failed_count}`,
      );
      setText('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Section
      title="Рассылка"
      footer="Сообщение получат все зарегистрированные пользователи (кроме заблокированных)."
    >
      <div className="p-3 space-y-2">
        <TextArea
          rows={5}
          value={text}
          onChange={setText}
          placeholder="Текст сообщения"
        />
        <Button onClick={send} disabled={sending || !text.trim()}>
          {sending ? 'Отправляем…' : 'Отправить всем'}
        </Button>
      </div>
    </Section>
  );
}
