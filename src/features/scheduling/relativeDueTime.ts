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
