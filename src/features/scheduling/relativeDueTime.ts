export function formatRelativeDueTime(
  dueAt: Date | string,
  now = new Date(),
): string {
  const differenceMs = new Date(dueAt).getTime() - now.getTime();
  const absoluteMs = Math.abs(differenceMs);

  if (absoluteMs < 60_000) return 'now';

  const units = absoluteMs < 60 * 60_000
    ? {value: Math.round(absoluteMs / 60_000), label: 'minute'}
    : absoluteMs < 24 * 60 * 60_000
      ? {value: Math.round(absoluteMs / (60 * 60_000)), label: 'hour'}
      : {value: Math.round(absoluteMs / (24 * 60 * 60_000)), label: 'day'};
  const amount = `${units.value} ${units.label}${units.value === 1 ? '' : 's'}`;

  return differenceMs > 0 ? `in ${amount}` : `${amount} ago`;
}

const dateKey = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);

export function formatComeBackAt(target: Date, now: Date, timezone = 'Asia/Ho_Chi_Minh'): string {
  const time = new Intl.DateTimeFormat('vi-VN', {timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(target);
  const isToday = dateKey(target, timezone) === dateKey(now, timezone);
  const datePart = isToday
    ? ''
    : ` ngày ${new Intl.DateTimeFormat('vi-VN', {timeZone: timezone, day: '2-digit', month: '2-digit'}).format(target)}`;
  return `Hãy quay lại lúc ${time}${datePart}`;
}
