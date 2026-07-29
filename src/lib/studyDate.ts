const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function getLocalDateTimeParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const values = Object.fromEntries(
    parts.map(({type, value}) => [type, value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function getStudyDate(
  instant: Date,
  timezone: string,
  boundary = '04:00',
): string {
  const [boundaryHour, boundaryMinute] = boundary
    .split(':')
    .map(Number);
  const local = getLocalDateTimeParts(instant, timezone);
  const isBeforeBoundary =
    local.hour < boundaryHour ||
    (local.hour === boundaryHour && local.minute < boundaryMinute);
  const localDate = Date.UTC(local.year, local.month - 1, local.day);
  const studyDate = isBeforeBoundary
    ? localDate - ONE_DAY_IN_MILLISECONDS
    : localDate;

  return new Date(studyDate).toISOString().slice(0, 10);
}
