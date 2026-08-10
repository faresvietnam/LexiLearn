import {getSupabaseClient} from '../../lib/supabase';
import {SentenceCard} from '../../types';
import type {AutomaticRating} from '../scheduling/automaticRating';
import {
  scheduleCard,
  type LearningCardFsrsRow,
  type LearningCardScheduleUpdate,
} from '../scheduling/fsrsScheduler';
import {PersistenceResult} from './settingsRepository';

const LOAD_ERROR = 'Không thể tải danh sách câu. Vui lòng thử lại.';
const SAVE_ERROR = 'Không thể lưu câu. Vui lòng thử lại.';
const DELETE_ERROR = 'Không thể xoá câu. Vui lòng thử lại.';
const REVIEW_ERROR = 'Không thể lưu kết quả ôn tập. Vui lòng thử lại.';

const SENTENCE_CARD_SELECT = `
  id, image_url, image_object_key, english_sentence, vietnamese_sentence,
  created_at, next_review_at, last_reviewed_at, review_interval_days,
  fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty,
  fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps,
  fsrs_lapses, fsrs_retrievability
`;

const FSRS_ROW_SELECT = `
  id, next_review_at, last_reviewed_at, fsrs_state_version, fsrs_state,
  fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days,
  fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability
`;

type SentenceCardRow = {
  id: string;
  image_url: string;
  image_object_key: string;
  english_sentence: string;
  vietnamese_sentence: string;
  created_at: string;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_interval_days: number;
  fsrs_state_version: 1;
  fsrs_state: number;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_learning_steps: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_retrievability: number;
};

function mapSentenceCardRow(row: SentenceCardRow): SentenceCard {
  return {
    id: row.id,
    imageUrl: row.image_url,
    imageObjectKey: row.image_object_key,
    englishSentence: row.english_sentence,
    vietnameseSentence: row.vietnamese_sentence,
    createdAt: row.created_at,
    nextReviewDate: row.next_review_at,
    ...(row.last_reviewed_at ? {lastReviewedDate: row.last_reviewed_at} : {}),
    reviewIntervalDays: row.review_interval_days,
    fsrsState: row.fsrs_state as SentenceCard['fsrsState'],
    fsrsStability: row.fsrs_stability,
    fsrsDifficulty: row.fsrs_difficulty,
    fsrsElapsedDays: row.fsrs_elapsed_days,
    fsrsScheduledDays: row.fsrs_scheduled_days,
    fsrsLearningSteps: row.fsrs_learning_steps,
    fsrsReps: row.fsrs_reps,
    fsrsLapses: row.fsrs_lapses,
    fsrsRetrievability: row.fsrs_retrievability,
  };
}

export type SentenceCardInput = {
  imageUrl: string;
  imageObjectKey: string;
  englishSentence: string;
  vietnameseSentence: string;
};

export async function loadSentenceCards(
  userId: string,
): Promise<PersistenceResult<SentenceCard[]>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: LOAD_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .select(SENTENCE_CARD_SELECT)
    .eq('owner_user_id', userId)
    .order('next_review_at', {ascending: true});

  return error || !data
    ? {data: null, error: LOAD_ERROR}
    : {data: (data as unknown as SentenceCardRow[]).map(mapSentenceCardRow), error: null};
}

export async function createSentenceCard(
  userId: string,
  input: SentenceCardInput,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SAVE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .insert({
      owner_user_id: userId,
      image_url: input.imageUrl,
      image_object_key: input.imageObjectKey,
      english_sentence: input.englishSentence.trim(),
      vietnamese_sentence: input.vietnameseSentence.trim(),
    })
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: SAVE_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}

export async function updateSentenceCard(
  userId: string,
  id: string,
  input: SentenceCardInput,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SAVE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .update({
      image_url: input.imageUrl,
      image_object_key: input.imageObjectKey,
      english_sentence: input.englishSentence.trim(),
      vietnamese_sentence: input.vietnameseSentence.trim(),
    })
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: SAVE_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}

export async function deleteSentenceCard(
  userId: string,
  id: string,
): Promise<PersistenceResult<true>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: DELETE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('id');

  return error || !data?.length
    ? {data: null, error: DELETE_ERROR}
    : {data: true, error: null};
}

function toSentenceScheduleUpdate(schedule: LearningCardScheduleUpdate) {
  return {
    next_review_at: schedule.next_review_at,
    last_reviewed_at: schedule.last_reviewed_at,
    review_interval_days: schedule.review_interval_days,
    fsrs_state_version: schedule.fsrs_state_version,
    fsrs_state: schedule.fsrs_state,
    fsrs_stability: schedule.fsrs_stability,
    fsrs_difficulty: schedule.fsrs_difficulty,
    fsrs_elapsed_days: schedule.fsrs_elapsed_days,
    fsrs_scheduled_days: schedule.fsrs_scheduled_days,
    fsrs_learning_steps: schedule.fsrs_learning_steps,
    fsrs_reps: schedule.fsrs_reps,
    fsrs_lapses: schedule.fsrs_lapses,
    fsrs_retrievability: schedule.fsrs_retrievability,
  };
}

export async function submitSentenceReview(
  userId: string,
  id: string,
  rating: AutomaticRating,
  reviewedAt: Date,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: REVIEW_ERROR};

  const {data: row, error: readError} = await client
    .from('sentence_cards')
    .select(FSRS_ROW_SELECT)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .single();
  if (readError || !row) return {data: null, error: REVIEW_ERROR};

  const {persistence} = scheduleCard(
    row as unknown as LearningCardFsrsRow,
    rating,
    reviewedAt,
  );

  const {data, error} = await client
    .from('sentence_cards')
    .update(toSentenceScheduleUpdate(persistence))
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: REVIEW_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}
