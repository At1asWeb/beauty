import { useEffect, useState } from 'react';

import { ImagePicker } from '../components/ImagePicker';
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

/** Run a delete that may refuse with 409 because of dependent rows.
 *
 * On 409 we ask the admin once more with the server-supplied reason and,
 * if confirmed, retry with the same operation called with `force=true`.
 */
function handleDeleteWithForce(
  attempt: (force: boolean) => Promise<unknown>,
  done: () => void,
) {
  return attempt(false)
    .then(() => {
      haptic('success');
      done();
    })
    .catch((err) => {
      if (err instanceof ApiError && err.status === 409) {
        if (!confirm(`${err.detail}\n\nУдалить вместе с записями?`)) return;
        return attempt(true)
          .then(() => {
            haptic('success');
            done();
          })
          .catch((err2) => {
            const msg2 =
              err2 instanceof ApiError ? err2.detail : String(err2);
            tg()?.showAlert(`Ошибка: ${msg2}`);
          });
      }
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    });
}

function CategoriesTab() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    api.listCategories().then(setCats);
  };
  useEffect(() => {
    load();
  }, []);

  const add = () => {
    if (!name.trim()) return;
    handle(
      api.createCategory({
        name,
        icon: icon || null,
        photo_url: photoUrl || null,
        sort_order: 0,
      }),
      () => {
        setName('');
        setIcon('');
        setPhotoUrl('');
        load();
      },
    );
  };

  const remove = (id: number) => {
    if (!confirm('Удалить категорию?')) return;
    handleDeleteWithForce((force) => api.deleteCategory(id, force), load);
  };

  return (
    <>
      <Section title="Новая категория">
        <div className="p-3 space-y-3">
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
          <div>
            <div className="text-[13px] text-tg-hint mb-2">Фото категории</div>
            <ImagePicker
              value={photoUrl}
              onChange={setPhotoUrl}
              hint="Можно вставить URL или загрузить фото с устройства."
            />
          </div>
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
            <div
              key={c.id}
              className="border-b border-tg-separator last:border-0"
            >
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-tg-secondaryBg shrink-0">
                  {c.photo_url ? (
                    <img
                      src={api.resolveAsset(c.photo_url)}
                      alt={c.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[20px] text-tg-hint">
                      {c.icon ?? '✨'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {c.icon ? `${c.icon} ` : ''}
                    {c.name}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() =>
                      setEditingId(editingId === c.id ? null : c.id)
                    }
                    className="text-tg-link text-[13px]"
                  >
                    {editingId === c.id ? 'свернуть' : 'фото'}
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-red-600 text-[13px]"
                  >
                    удалить
                  </button>
                </div>
              </div>
              {editingId === c.id && (
                <CategoryPhotoEditor category={c} onChanged={load} />
              )}
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function CategoryPhotoEditor({
  category,
  onChanged,
}: {
  category: Category;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(category.photo_url ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateCategory(category.id, {
        photo_url: value || null,
      });
      haptic('success');
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pb-3 space-y-2">
      <ImagePicker value={value} onChange={setValue} />
      <Button onClick={save} disabled={saving}>
        {saving ? 'Сохраняем…' : 'Сохранить фото'}
      </Button>
    </div>
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
    handleDeleteWithForce((force) => api.deleteService(id, force), load);
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
                  className="text-red-600"
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
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [tgId, setTgId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pickedCategoryIds, setPickedCategoryIds] = useState<Set<number>>(
    new Set(),
  );
  const [editingMasterId, setEditingMasterId] = useState<number | null>(null);

  const load = () => {
    api.listMasters().then(setMasters);
    api.listCategories().then(setCategories);
  };
  useEffect(load, []);

  const togglePicked = (id: number) => {
    setPickedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = () => {
    const numericId = Number(tgId);
    if (!numericId || !name.trim()) return;
    api
      .createMaster({
        tg_id: numericId,
        display_name: name,
        bio: bio || undefined,
        photo_url: photoUrl || undefined,
        is_admin: isAdmin,
      })
      .then(async (created) => {
        // Link the master to each picked category. Master then implicitly
        // performs every active service inside those categories.
        for (const cid of pickedCategoryIds) {
          await api.addMasterCategory(created.id, cid);
        }
        haptic('success');
        setTgId('');
        setName('');
        setBio('');
        setPhotoUrl('');
        setIsAdmin(false);
        setPickedCategoryIds(new Set());
        load();
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.detail : String(err);
        tg()?.showAlert(`Ошибка: ${msg}`);
      });
  };

  const remove = (id: number) => {
    if (!confirm('Удалить мастера?')) return;
    handle(api.deleteMaster(id), load);
  };

  return (
    <>
      <Section
        title="Добавить мастера"
        footer="Telegram ID мастера → имя → фото → отметьте категории. Мастер автоматически будет выполнять все услуги в выбранных категориях."
      >
        <div className="p-3 space-y-3">
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
          <div>
            <div className="text-[13px] text-tg-hint mb-2">Фото мастера</div>
            <ImagePicker value={photoUrl} onChange={setPhotoUrl} />
          </div>
          <TextArea value={bio} onChange={setBio} placeholder="О мастере" />
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            Назначить администратором
          </label>

          {categories && categories.length > 0 && (
            <div className="pt-2">
              <div className="text-[13px] text-tg-hint mb-2">
                Категории мастера
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => togglePicked(c.id)}
                    className={
                      'px-3 py-1.5 rounded-full text-[13px] border transition-colors ' +
                      (pickedCategoryIds.has(c.id)
                        ? 'bg-tg-button text-tg-buttonText border-tg-button'
                        : 'bg-white text-tg-text border-tg-separator')
                    }
                  >
                    {c.icon ? `${c.icon} ` : ''}
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
            <div key={m.id} className="border-b border-tg-separator last:border-0">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-tg-secondaryBg shrink-0">
                  {m.photo_url ? (
                    <img
                      src={api.resolveAsset(m.photo_url)}
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
                  <div className="text-tg-hint text-[12px]">
                    Рейтинг {m.rating_avg.toFixed(1)} · {m.rating_count} отзывов
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() =>
                      setEditingMasterId(
                        editingMasterId === m.id ? null : m.id,
                      )
                    }
                    className="text-tg-link text-[13px]"
                  >
                    {editingMasterId === m.id ? 'свернуть' : 'категории'}
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="text-red-600 text-[13px]"
                  >
                    удалить
                  </button>
                </div>
              </div>
              {editingMasterId === m.id && categories && (
                <MasterCategoriesEditor
                  master={m}
                  allCategories={categories}
                  onChanged={load}
                />
              )}
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function MasterCategoriesEditor({
  master,
  allCategories,
  onChanged,
}: {
  master: Master;
  allCategories: Category[];
  onChanged: () => void;
}) {
  const [active, setActive] = useState<Set<number> | null>(null);

  useEffect(() => {
    api.listMasterCategories(master.id).then((list) => {
      setActive(new Set(list.map((c) => c.id)));
    });
  }, [master.id]);

  if (active === null) return <Spinner />;

  const toggle = async (cid: number) => {
    const next = new Set(active);
    try {
      if (next.has(cid)) {
        await api.removeMasterCategory(master.id, cid);
        next.delete(cid);
      } else {
        await api.addMasterCategory(master.id, cid);
        next.add(cid);
      }
      setActive(next);
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      tg()?.showAlert(`Ошибка: ${msg}`);
    }
  };

  return (
    <div className="px-4 pb-3">
      <div className="text-[12px] text-tg-hint mb-2">
        Нажмите, чтобы привязать или отвязать категорию. Мастер будет
        выполнять все услуги в отмеченных категориях.
      </div>
      <div className="flex flex-wrap gap-2">
        {allCategories.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            className={
              'px-3 py-1.5 rounded-full text-[13px] border transition-colors ' +
              (active.has(c.id)
                ? 'bg-tg-button text-tg-buttonText border-tg-button'
                : 'bg-white text-tg-text border-tg-separator')
            }
          >
            {c.icon ? `${c.icon} ` : ''}
            {c.name}
          </button>
        ))}
      </div>
      {allCategories.length === 0 && (
        <div className="text-[13px] text-tg-hint">
          Сначала создайте категории во вкладке «Категории».
        </div>
      )}
    </div>
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
        <div className="p-3 space-y-3">
          <ImagePicker
            value={url}
            onChange={setUrl}
            hint="Можно вставить URL или загрузить фото с устройства."
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
                    src={api.resolveAsset(g.image_url)}
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
