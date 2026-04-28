from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..models import Booking, BookingStatus, Master, Service, User
from .bot import escape_html, send_message


def _fmt_dt(dt: datetime) -> str:
    # Bookings are stored in UTC; in a single-salon setup we display
    # them verbatim (wall clock). If you deploy in another timezone,
    # convert here (e.g. via `zoneinfo.ZoneInfo("Europe/Moscow")`).
    return dt.strftime("%d.%m.%Y %H:%M")


async def _load_full(session: AsyncSession, booking_id: int) -> Booking | None:
    q = (
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.master).selectinload(Master.user),
            selectinload(Booking.service).selectinload(Service.category),
        )
    )
    return (await session.execute(q)).scalar_one_or_none()


async def notify_booking_created(session: AsyncSession, booking_id: int) -> None:
    b = await _load_full(session, booking_id)
    if b is None:
        return
    settings = get_settings()
    salon = escape_html(settings.salon_name)
    when = escape_html(_fmt_dt(b.start_at))
    service = escape_html(b.service.name)

    # Notify master
    master_msg = (
        f"🗓 <b>{salon}</b>\n"
        f"Новая заявка на запись.\n"
        f"Клиент: {escape_html(_full_name(b.client))}"
        f"{_username_tail(b.client)}\n"
        f"Услуга: {service}\n"
        f"Время: <b>{when}</b>\n"
        f"Статус: ожидает подтверждения."
    )
    await send_message(b.master.user.tg_id, master_msg)

    # Notify client
    client_msg = (
        f"🗓 <b>{salon}</b>\n"
        f"Вы записаны к мастеру "
        f"<b>{escape_html(b.master.display_name)}</b>.\n"
        f"Услуга: {service}\n"
        f"Время: <b>{when}</b>\n"
        f"Ожидайте подтверждения от мастера."
    )
    await send_message(b.client.tg_id, client_msg)


async def notify_booking_reminder(
    session: AsyncSession, booking_id: int
) -> None:
    """Notify both the client and the master that a visit is coming up.

    Triggered by the background scheduler `REMINDER_HOURS_BEFORE` hours
    before `start_at`. We only send for confirmed bookings.
    """
    b = await _load_full(session, booking_id)
    if b is None:
        return
    settings = get_settings()
    salon = escape_html(settings.salon_name)
    when = escape_html(_fmt_dt(b.start_at))
    service = escape_html(b.service.name)
    master_name = escape_html(b.master.display_name)

    client_msg = (
        f"⏰ <b>{salon}</b>\n"
        f"Напоминаем: вас ждут к мастеру <b>{master_name}</b>.\n"
        f"Услуга: {service}\n"
        f"Время: <b>{when}</b>"
    )
    await send_message(b.client.tg_id, client_msg)

    master_msg = (
        f"⏰ <b>{salon}</b>\n"
        f"Скоро запись клиента "
        f"<b>{escape_html(_full_name(b.client))}</b>"
        f"{_username_tail(b.client)}.\n"
        f"Услуга: {service}\n"
        f"Время: <b>{when}</b>"
    )
    await send_message(b.master.user.tg_id, master_msg)


async def notify_booking_status_change(
    session: AsyncSession, booking_id: int, actor: User
) -> None:
    b = await _load_full(session, booking_id)
    if b is None:
        return
    settings = get_settings()
    salon = escape_html(settings.salon_name)
    when = escape_html(_fmt_dt(b.start_at))
    service = escape_html(b.service.name)
    master_name = escape_html(b.master.display_name)

    if b.status == BookingStatus.CONFIRMED:
        text = (
            f"✅ <b>{salon}</b>\n"
            f"Мастер {master_name} подтвердил запись.\n"
            f"Услуга: {service}\n"
            f"Время: <b>{when}</b>"
        )
        await send_message(b.client.tg_id, text)
    elif b.status == BookingStatus.CANCELLED:
        reason = (
            escape_html(b.cancellation_reason)
            if b.cancellation_reason
            else "—"
        )
        if actor.id == b.client_id:
            # Client cancelled; tell master.
            text = (
                f"❌ <b>{salon}</b>\n"
                f"Клиент {escape_html(_full_name(b.client))} отменил запись.\n"
                f"Услуга: {service}\n"
                f"Время: <b>{when}</b>\n"
                f"Причина: {reason}"
            )
            await send_message(b.master.user.tg_id, text)
        else:
            text = (
                f"❌ <b>{salon}</b>\n"
                f"Запись к мастеру {master_name} отменена.\n"
                f"Услуга: {service}\n"
                f"Время: <b>{when}</b>\n"
                f"Причина: {reason}"
            )
            await send_message(b.client.tg_id, text)
    elif b.status == BookingStatus.COMPLETED:
        text = (
            f"🌟 <b>{salon}</b>\n"
            f"Визит завершён — спасибо!\n"
            f"Услуга: {service}\n"
            f"Будем рады отзыву о мастере {master_name}."
        )
        await send_message(b.client.tg_id, text)


def _full_name(u: User) -> str:
    parts = [u.first_name]
    if u.last_name:
        parts.append(u.last_name)
    return " ".join(p for p in parts if p).strip() or (u.username or str(u.tg_id))


def _username_tail(u: User) -> str:
    return f" (@{u.username})" if u.username else ""
