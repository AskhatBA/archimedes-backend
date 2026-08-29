import { ProgramOrderCategory } from '@prisma/client';

import { config } from '@/config';
import { sendMail } from '@/infrastructure/mail';

import type { ProgramOrderEmailData } from './program-orders.dto';

const CATEGORY_LABELS: Record<ProgramOrderCategory, string> = {
  [ProgramOrderCategory.MED_PLAN]: 'Мед. план',
  [ProgramOrderCategory.CHECKUP]: 'Чек-ап',
};

/** Заявка приходит операторам в Алматы, а сервер живёт в UTC. */
const CLINIC_TIME_ZONE = 'Asia/Almaty';

const formatMoney = (amount: number): string =>
  `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} ₸`;

const formatDateTime = (date: Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: CLINIC_TIME_ZONE,
  }).format(date);

/** Titles and comments are patient/catalogue text, so they are escaped before HTML. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface Row {
  label: string;
  value: string;
}

const orderRows = (order: ProgramOrderEmailData): Row[] => {
  const rows: Row[] = [
    { label: 'Заявка №', value: order.id },
    { label: 'Дата', value: formatDateTime(order.createdAt) },
    { label: 'Пациент', value: order.patientName ?? '—' },
    { label: 'ИИН', value: order.patientIin ?? '—' },
    { label: 'Телефон аккаунта', value: order.patientPhone },
    { label: 'Телефон для связи', value: order.contactPhone ?? order.patientPhone },
    { label: 'Сумма', value: formatMoney(order.total) },
    { label: 'Платёж', value: order.paymentId },
  ];

  if (order.comment) {
    rows.push({ label: 'Комментарий', value: order.comment });
  }

  return rows;
};

const buildText = (order: ProgramOrderEmailData): string => {
  const details = orderRows(order)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n');

  const items = order.items
    .map(
      (item, index) =>
        `${index + 1}. [${CATEGORY_LABELS[item.category]}] ${item.title} — ${formatMoney(item.price)}`
    )
    .join('\n');

  return [
    'Новая оплаченная заявка на платную программу.',
    '',
    details,
    '',
    'Состав заявки:',
    items,
    '',
    `Итого: ${formatMoney(order.total)}`,
  ].join('\n');
};

const buildHtml = (order: ProgramOrderEmailData): string => {
  const details = orderRows(order)
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;"><b>${escapeHtml(value)}</b></td></tr>`
    )
    .join('');

  const items = order.items
    .map(
      (item) =>
        `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #eee;">` +
        `${escapeHtml(CATEGORY_LABELS[item.category])}</td>` +
        `<td style="padding:6px 12px 6px 0;border-bottom:1px solid #eee;">` +
        `${escapeHtml(item.title)}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">` +
        `${escapeHtml(formatMoney(item.price))}</td></tr>`
    )
    .join('');

  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">',
    '<h2 style="margin:0 0 16px;font-size:18px;">Новая заявка на платную программу</h2>',
    `<table style="border-collapse:collapse;margin-bottom:20px;">${details}</table>`,
    '<table style="border-collapse:collapse;width:100%;max-width:640px;">',
    '<thead><tr>',
    '<th style="text-align:left;padding:0 12px 6px 0;color:#666;font-weight:normal;">Категория</th>',
    '<th style="text-align:left;padding:0 12px 6px 0;color:#666;font-weight:normal;">Программа</th>',
    '<th style="text-align:right;padding:0 0 6px;color:#666;font-weight:normal;">Цена</th>',
    '</tr></thead>',
    `<tbody>${items}</tbody>`,
    '<tfoot><tr>',
    '<td colspan="2" style="padding:10px 12px 0 0;text-align:right;">Итого</td>',
    `<td style="padding:10px 0 0;text-align:right;white-space:nowrap;"><b>${escapeHtml(
      formatMoney(order.total)
    )}</b></td>`,
    '</tr></tfoot>',
    '</table>',
    '</div>',
  ].join('');
};

/**
 * Письмо с заявкой операторам клиники.
 *
 * Вызывается только из воркера очереди `program-order-email` — SMTP медленный и
 * внешний, в обработчике платежа ему делать нечего. Ошибка пробрасывается, чтобы
 * BullMQ повторил попытку.
 */
export const sendProgramOrderEmail = async (order: ProgramOrderEmailData): Promise<void> => {
  const patient = order.patientName ?? order.patientPhone;

  await sendMail({
    to: config.mail.programOrderRecipients,
    subject: `Новая заявка на платную программу — ${patient} — ${formatMoney(order.total)}`,
    text: buildText(order),
    html: buildHtml(order),
  });
};
