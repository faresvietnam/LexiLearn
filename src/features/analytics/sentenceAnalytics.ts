export type StudyAttemptAnalyticsRow = {
  sentence_key: string | null;
  is_correct: boolean;
  first_attempt: boolean;
  response_time_ms: number | null;
  created_at: string;
};

export type SentenceAnalytics = {
  sentenceKey: string;
  attempts: number;
  correctAttempts: number;
  accuracy: number;
  firstAttemptCorrect: number;
  averageResponseTimeMs: number | null;
  lastSeenAt: string;
};

export function aggregateSentenceAnalytics(
  rows: StudyAttemptAnalyticsRow[],
): SentenceAnalytics[] {
  const grouped = new Map<string, {
    attempts: number;
    correctAttempts: number;
    firstAttempts: number;
    firstCorrect: number;
    responseTimeTotal: number;
    responseTimeCount: number;
    lastSeenAt: string;
  }>();

  rows.forEach((row) => {
    const key = row.sentence_key?.trim();
    if (!key) return;
    const current = grouped.get(key) ?? {
      attempts: 0,
      correctAttempts: 0,
      firstAttempts: 0,
      firstCorrect: 0,
      responseTimeTotal: 0,
      responseTimeCount: 0,
      lastSeenAt: row.created_at,
    };
    current.attempts += 1;
    if (row.is_correct) current.correctAttempts += 1;
    if (row.first_attempt) {
      current.firstAttempts += 1;
      if (row.is_correct) current.firstCorrect += 1;
    }
    if (typeof row.response_time_ms === 'number' && row.response_time_ms >= 0) {
      current.responseTimeTotal += row.response_time_ms;
      current.responseTimeCount += 1;
    }
    if (row.created_at > current.lastSeenAt) current.lastSeenAt = row.created_at;
    grouped.set(key, current);
  });

  return Array.from(grouped, ([sentenceKey, value]) => ({
    sentenceKey,
    attempts: value.attempts,
    correctAttempts: value.correctAttempts,
    accuracy: Math.round((value.correctAttempts / value.attempts) * 100),
    firstAttemptCorrect: value.firstAttempts > 0
      ? Math.round((value.firstCorrect / value.firstAttempts) * 100)
      : 0,
    averageResponseTimeMs: value.responseTimeCount > 0
      ? Math.round(value.responseTimeTotal / value.responseTimeCount)
      : null,
    lastSeenAt: value.lastSeenAt,
  })).sort((left, right) => (
    left.accuracy - right.accuracy
    || right.attempts - left.attempts
    || left.sentenceKey.localeCompare(right.sentenceKey)
  ));
}
