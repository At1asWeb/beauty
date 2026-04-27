// Tiny typed API client that forwards the Telegram initData string in
// the Authorization header on every call. Server validates the HMAC and
// rejects any request whose init data is missing or expired.

import { tg } from './telegram';

export type UserRole = 'client' | 'master' | 'admin';

export type User = {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  role: UserRole;
  is_blocked: boolean;
};

export type Me = {
  user: User;
  is_master: boolean;
  master_id: number | null;
  salon_name: string;
  salon_banner_url: string;
};

export type Category = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Service = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  duration_min: number;
  is_active: boolean;
};

export type Master = {
  id: number;
  user_id: number;
  display_name: string;
  bio: string | null;
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  booking_stopped: boolean;
  booking_stopped_reason: string | null;
  is_active: boolean;
};

export type Slot = { start_at: string; end_at: string };

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type Booking = {
  id: number;
  client_id: number;
  master_id: number;
  service_id: number;
  start_at: string;
  end_at: string;
  price_at_booking: number;
  status: BookingStatus;
  client_comment: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

export type ScheduleEntry = {
  id?: number;
  weekday: number | null;
  date: string | null;
  start_time: string;
  end_time: string;
  is_off: boolean;
};

export type Review = {
  id: number;
  booking_id: number;
  master_id: number;
  client_id: number;
  rating: number;
  text: string | null;
  created_at: string;
};

export type GalleryItem = {
  id: number;
  master_id: number | null;
  service_id: number | null;
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type MasterStats = {
  master_id: number;
  from_date: string;
  to_date: string;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  revenue: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init = tg()?.initData ?? '';
  const headers: Record<string, string> = {
    Authorization: `tma ${init}`,
  };
  // Dev fallback: when running outside Telegram, a `dev_user_id` local
  // storage entry impersonates a test user. Server still requires
  // DEV_MODE=true to accept this header.
  const devUserId = localStorage.getItem('dev_user_id');
  if (!init && devUserId) headers['X-Dev-User-Id'] = devUserId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') detail = data.detail;
    } catch {
      /* non-JSON body, keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),

  listCategories: () => request<Category[]>('GET', '/api/categories'),
  createCategory: (body: Partial<Category>) =>
    request<Category>('POST', '/api/categories', body),
  updateCategory: (id: number, body: Partial<Category>) =>
    request<Category>('PATCH', `/api/categories/${id}`, body),
  deleteCategory: (id: number) =>
    request<void>('DELETE', `/api/categories/${id}`),

  listServices: (categoryId?: number) =>
    request<Service[]>(
      'GET',
      categoryId ? `/api/services?category_id=${categoryId}` : '/api/services',
    ),
  createService: (body: Partial<Service>) =>
    request<Service>('POST', '/api/services', body),
  updateService: (id: number, body: Partial<Service>) =>
    request<Service>('PATCH', `/api/services/${id}`, body),
  deleteService: (id: number) =>
    request<void>('DELETE', `/api/services/${id}`),

  listMasters: (serviceId?: number) =>
    request<Master[]>(
      'GET',
      serviceId ? `/api/masters?service_id=${serviceId}` : '/api/masters',
    ),
  getMaster: (id: number) => request<Master>('GET', `/api/masters/${id}`),
  createMaster: (body: {
    tg_id: number;
    display_name: string;
    is_admin?: boolean;
    bio?: string;
    photo_url?: string;
  }) => request<Master>('POST', '/api/masters', body),
  updateMaster: (id: number, body: Partial<Master>) =>
    request<Master>('PATCH', `/api/masters/${id}`, body),
  deleteMaster: (id: number) =>
    request<void>('DELETE', `/api/masters/${id}`),
  setStopBooking: (
    id: number,
    body: { booking_stopped: boolean; booking_stopped_reason?: string | null },
  ) => request<Master>('POST', `/api/masters/${id}/stop-booking`, body),
  listMasterServices: (id: number) =>
    request<Service[]>('GET', `/api/masters/${id}/services`),
  addMasterService: (
    id: number,
    body: {
      service_id: number;
      price_override?: number | null;
      duration_override_min?: number | null;
    },
  ) => request<Service>('POST', `/api/masters/${id}/services`, body),
  removeMasterService: (masterId: number, serviceId: number) =>
    request<void>(
      'DELETE',
      `/api/masters/${masterId}/services/${serviceId}`,
    ),
  getSchedule: (id: number) =>
    request<ScheduleEntry[]>('GET', `/api/masters/${id}/schedule`),
  setSchedule: (id: number, entries: ScheduleEntry[]) =>
    request<ScheduleEntry[]>('PUT', `/api/masters/${id}/schedule`, {
      entries,
    }),
  getSlots: (masterId: number, serviceId: number, day: string) =>
    request<Slot[]>(
      'GET',
      `/api/masters/${masterId}/slots?service_id=${serviceId}&day=${day}`,
    ),
  getMasterReviews: (id: number) =>
    request<Review[]>('GET', `/api/masters/${id}/reviews`),
  getMasterStats: (id: number, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<MasterStats>('GET', `/api/masters/${id}/stats${suffix}`);
  },
  getClientNote: (masterId: number, clientId: number) =>
    request<{ id: number; text: string }>(
      'GET',
      `/api/masters/${masterId}/clients/${clientId}/note`,
    ),
  setClientNote: (masterId: number, clientId: number, text: string) =>
    request<{ id: number; text: string }>(
      'PUT',
      `/api/masters/${masterId}/clients/${clientId}/note`,
      { text },
    ),
  listBlocks: (masterId: number) =>
    request<{ id: number; client_id: number; reason: string | null }[]>(
      'GET',
      `/api/masters/${masterId}/blocks`,
    ),
  blockClient: (masterId: number, clientId: number, reason?: string) => {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return request<unknown>(
      'POST',
      `/api/masters/${masterId}/blocks/${clientId}${qs}`,
    );
  },
  unblockClient: (masterId: number, clientId: number) =>
    request<void>(
      'DELETE',
      `/api/masters/${masterId}/blocks/${clientId}`,
    ),

  createBooking: (body: {
    master_id: number;
    service_id: number;
    start_at: string;
    client_comment?: string;
  }) => request<Booking>('POST', '/api/bookings', body),
  myBookings: (upcomingOnly = false) =>
    request<Booking[]>(
      'GET',
      upcomingOnly ? '/api/bookings/my?upcoming_only=true' : '/api/bookings/my',
    ),
  masterBookings: (
    masterId: number,
    params: { status?: BookingStatus; from?: string; to?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<Booking[]>(
      'GET',
      `/api/bookings/master/${masterId}${suffix}`,
    );
  },
  updateBooking: (
    id: number,
    body: { status: BookingStatus; cancellation_reason?: string },
  ) => request<Booking>('PATCH', `/api/bookings/${id}`, body),

  createReview: (body: {
    booking_id: number;
    rating: number;
    text?: string;
  }) => request<Review>('POST', '/api/reviews', body),

  listGallery: (masterId?: number) =>
    request<GalleryItem[]>(
      'GET',
      masterId ? `/api/gallery?master_id=${masterId}` : '/api/gallery',
    ),
  addGalleryItem: (body: {
    image_url: string;
    caption?: string;
    master_id?: number;
    service_id?: number;
    sort_order?: number;
  }) => request<GalleryItem>('POST', '/api/gallery', body),
  deleteGalleryItem: (id: number) =>
    request<void>('DELETE', `/api/gallery/${id}`),

  listUsers: () => request<User[]>('GET', '/api/admin/users'),
  changeUserRole: (userId: number, role: UserRole) =>
    request<User>(
      'PATCH',
      `/api/admin/users/${userId}/role?role=${role}`,
    ),
  createBroadcast: (text: string) =>
    request<{ id: number; sent_count: number; failed_count: number }>(
      'POST',
      '/api/admin/broadcasts',
      { text },
    ),
};
