import {
  Deck,
  ExampleSentence,
  MeaningCard,
  MemoryStrength,
  StudyScope,
  Tag,
  UserSettings,
  Word,
  WordApprovalStatus,
  WordPartType,
  WordStudyStatus,
} from '../../types';
import {getLearningStatus} from '../scheduling/fsrsStatus';

export type SettingsRow = {
  user_id: string;
  new_words_per_day: number;
  review_limit_per_day: number;
  hint_behavior: UserSettings['hintBehavior'];
  audio_autoplay: boolean;
  theme: UserSettings['theme'];
  language: UserSettings['language'];
  reduced_motion: boolean;
  char_diff_accessibility: boolean;
  gemini_api_key: string | null;
};

export type StudyScopeRow = {
  user_id: string;
  active_deck_ids: string[];
  excluded_tag_ids: string[];
  paused_word_ids: string[];
};

export type DeckRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  created_at: string;
};

export type TagRow = {
  id: string;
  name: string;
  color: string;
};

type LearningCardRow = {
  id: string;
  meaning_source_id: string;
  memory_strength: MemoryStrength;
  memory_score: number;
  review_interval_days: number;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  fsrs_state?: number;
  fsrs_stability?: number;
  fsrs_difficulty?: number;
  fsrs_elapsed_days?: number;
  fsrs_scheduled_days?: number;
  fsrs_learning_steps?: number;
  fsrs_reps?: number;
  fsrs_lapses?: number;
  fsrs_retrievability?: number;
  recognition_score?: number;
  recall_score?: number;
  spelling_score?: number;
  context_score?: number;
  word_structure_score?: number;
  response_time_sample_count?: number;
  response_time_average_ms?: number;
};

type GlobalExampleRow = {
  id: string;
  sentence: string;
  expected_answer: string;
  word_form: string | null;
  difficulty: ExampleSentence['difficulty'];
  status: string;
};

type GlobalMeaningRow = {
  id: string;
  meaning_vi: string;
  part_of_speech: string;
  display_order: number;
  status: string;
  global_examples: GlobalExampleRow[] | null;
};

type PrivateMeaningRow = {
  id: string;
  meaning_vi: string;
  part_of_speech: string;
  display_order: number;
};

type GlobalWordRow = {
  id: string;
  word: string;
  ipa: string | null;
  audio_url: string | null;
  image_url: string | null;
  status: string;
  created_by_admin_id: string | null;
  created_at: string;
  word_parts: Array<{
    id: string;
    text: string;
    type: WordPartType;
    meaning: string | null;
    position: number;
  }> | null;
  global_meanings: GlobalMeaningRow[] | null;
};

type PrivateWordRow = {
  id: string;
  owner_user_id: string;
  word: string;
  ipa: string | null;
  audio_url: string | null;
  image_url: string | null;
  image_object_key?: string | null;
  submission_version?: number;
  status: 'pending' | 'rejected' | 'approved' | 'archived';
  admin_comment: string | null;
  created_at: string;
  private_meanings: PrivateMeaningRow[] | null;
};

export type VocabularyRow = {
  id: string;
  deck_id: string | null;
  study_status: WordStudyStatus;
  added_at: string;
  personal_word_tags: Array<{tag_id: string}> | null;
  learning_cards: LearningCardRow[] | null;
  global_words: GlobalWordRow | null;
  private_words: PrivateWordRow | null;
};

export function mapSettingsRow(row: SettingsRow): UserSettings {
  return {
    newWordsPerDay: row.new_words_per_day,
    reviewLimitPerDay: row.review_limit_per_day,
    hintBehavior: row.hint_behavior,
    audioAutoplay: row.audio_autoplay,
    theme: row.theme,
    language: row.language,
    reducedMotion: row.reduced_motion,
    charDiffAccessibility: row.char_diff_accessibility,
    geminiApiKey: row.gemini_api_key,
  };
}

export function mapStudyScopeRow(row: StudyScopeRow | null): StudyScope {
  return {
    activeDeckIds: row?.active_deck_ids ?? [],
    excludedTagIds: row?.excluded_tag_ids ?? [],
    pausedWordIds: row?.paused_word_ids ?? [],
  };
}

export function mapDeckRow(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? {description: row.description} : {}),
    color: row.color,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

export function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function mapMeaning(
  row: GlobalMeaningRow | PrivateMeaningRow,
  vocabulary: VocabularyRow,
  word: string,
  isGlobal: boolean,
): MeaningCard {
  const card = vocabulary.learning_cards?.find(
    ({meaning_source_id}) => meaning_source_id === row.id,
  );
  const id = card?.id ?? row.id;
  const examples = isGlobal && 'global_examples' in row
    ? (row.global_examples ?? [])
        .filter(({status}) => status === 'active')
        .map<ExampleSentence>((example) => ({
          id: example.id,
          meaningCardId: id,
          sentence: example.sentence,
          expectedAnswer: example.expected_answer,
          baseWord: word,
          wordForm: example.word_form ?? 'base',
          partOfSpeech: row.part_of_speech,
          difficulty: example.difficulty,
          approvalStatus: 'approved',
        }))
    : [];

  return {
    id,
    wordId: vocabulary.id,
    meaning: row.meaning_vi,
    partOfSpeech: row.part_of_speech,
    exampleSentences: examples,
    memoryStrength: card?.memory_strength ?? 'critical',
    memoryScore: card?.memory_score ?? 0,
    reviewIntervalDays: card?.review_interval_days ?? 1,
    nextReviewDate: card?.next_review_at ?? vocabulary.added_at,
    ...(card?.fsrs_state !== undefined
      ? {
          fsrsState: card.fsrs_state as MeaningCard['fsrsState'],
          learningStatus: getLearningStatus(card.fsrs_state) ?? undefined,
        }
      : {}),
    ...(card?.fsrs_stability !== undefined
      ? {fsrsStability: card.fsrs_stability}
      : {}),
    ...(card?.fsrs_difficulty !== undefined
      ? {fsrsDifficulty: card.fsrs_difficulty}
      : {}),
    ...(card?.fsrs_elapsed_days !== undefined
      ? {fsrsElapsedDays: card.fsrs_elapsed_days}
      : {}),
    ...(card?.fsrs_scheduled_days !== undefined
      ? {fsrsScheduledDays: card.fsrs_scheduled_days}
      : {}),
    ...(card?.fsrs_learning_steps !== undefined
      ? {fsrsLearningSteps: card.fsrs_learning_steps}
      : {}),
    ...(card?.fsrs_reps !== undefined ? {fsrsReps: card.fsrs_reps} : {}),
    ...(card?.fsrs_lapses !== undefined
      ? {fsrsLapses: card.fsrs_lapses}
      : {}),
    ...(card?.fsrs_retrievability !== undefined
      ? {fsrsRetrievability: card.fsrs_retrievability}
      : {}),
    ...(card?.recognition_score !== undefined ? {recognitionScore: card.recognition_score} : {}),
    ...(card?.recall_score !== undefined ? {recallScore: card.recall_score} : {}),
    ...(card?.spelling_score !== undefined ? {spellingScore: card.spelling_score} : {}),
    ...(card?.context_score !== undefined ? {contextScore: card.context_score} : {}),
    ...(card?.word_structure_score !== undefined ? {wordStructureScore: card.word_structure_score} : {}),
    ...(card?.response_time_sample_count !== undefined ? {responseTimeSampleCount: card.response_time_sample_count} : {}),
    ...(card?.response_time_average_ms !== undefined ? {responseTimeAverageMs: card.response_time_average_ms} : {}),
    ...(card?.last_reviewed_at
      ? {lastReviewedDate: card.last_reviewed_at}
      : {}),
    firstAttemptErrorRate: 0,
    forgottenWordParts: [],
    history: [],
  };
}

export function mapVocabularyRow(row: VocabularyRow): Word | null {
  const globalWord = row.global_words?.status === 'active'
    ? row.global_words
    : null;
  const privateWord = row.private_words?.status !== 'archived'
    ? row.private_words
    : null;
  const source = globalWord ?? privateWord;

  if (!source) return null;

  const isGlobal = Boolean(globalWord);
  const meanings = isGlobal
    ? (globalWord?.global_meanings ?? [])
        .filter(({status}) => status === 'active')
    : (privateWord?.private_meanings ?? []);
  const approvalStatus: WordApprovalStatus = 'approved';

  return {
    id: row.id,
    ...(!isGlobal && privateWord ? {privateWordId: privateWord.id, submissionVersion: privateWord.submission_version ?? 1} : {}),
    word: source.word,
    ...(source.ipa ? {ipa: source.ipa} : {}),
    ...(source.audio_url ? {audioUrl: source.audio_url} : {}),
    ...(source.image_url ? {imageUrl: source.image_url} : {}),
    ...('image_object_key' in source && source.image_object_key
      ? {imageObjectKey: source.image_object_key}
      : {}),
    wordStructure: isGlobal
      ? [...(globalWord?.word_parts ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((part) => ({
            id: part.id,
            text: part.text,
            type: part.type,
            ...(part.meaning ? {meaning: part.meaning} : {}),
            order: part.position,
          }))
      : [],
    wordFamily: [],
    isGlobal,
    approvalStatus,
    createdBy: isGlobal
      ? globalWord?.created_by_admin_id ?? 'system'
      : privateWord?.owner_user_id ?? 'system',
    createdAt: source.created_at,
    deckId: row.deck_id ?? '',
    tags: (row.personal_word_tags ?? []).map(({tag_id}) => tag_id),
    status: row.study_status,
    meanings: [...meanings]
      .sort((a, b) => a.display_order - b.display_order)
      .map((meaning) => mapMeaning(meaning, row, source.word, isGlobal)),
  };
}
