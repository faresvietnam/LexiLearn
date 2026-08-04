import { Word, MeaningCard, Question, StudyScope, UserSettings } from '../types';
import {calculateForgettingRisk} from '../features/scheduling/forgettingRisk';
import { isReviewDue } from '../features/scheduling/reviewCountdown';

export interface SessionQueueItem {
  word: Word;
  meaningCard: MeaningCard;
  isNewWord: boolean;
  stage: 1 | 2 | 3 | 4 | 5;
}

export function buildSessionQuestions(
  words: Word[],
  studyScope: StudyScope,
  settings: UserSettings,
  isExtraReview: boolean = false,
  newWordsLimitOverride?: number,
): { questions: Question[]; totalAvailableReviews: number; limitReached: boolean } {
  const now = new Date();

  // 1. Filter words in Study Scope & Active status
  const activeWords = words.filter((w) => {
    // Word level status has highest priority! If paused, exclude.
    if (w.status !== 'active') return false;

    // Deck filter
    if (studyScope.activeDeckIds.length > 0 && !studyScope.activeDeckIds.includes(w.deckId)) {
      return false;
    }

    // Tag exclusion filter
    const hasExcludedTag = w.tags.some((t) => studyScope.excludedTagIds.includes(t));
    if (hasExcludedTag) return false;

    return true;
  });

  // Extract all Meaning Cards from active words
  const reviewCards: SessionQueueItem[] = [];
  const newCards: SessionQueueItem[] = [];

  activeWords.forEach((word) => {
    word.meanings.forEach((meaningCard) => {
      // Persisted FSRS state is authoritative. A card in state 0 is new even
      // when legacy analytics/history fields were populated during import.
      const hasLegacyReview = Boolean(meaningCard.lastReviewedDate)
        || Boolean(meaningCard.history && meaningCard.history.length > 0);
      // Explicit FSRS state is authoritative. Legacy cards without a state
      // retain the old history-based fallback until they are migrated.
      const isFsrsNew = meaningCard.fsrsState === 0
        || (meaningCard.fsrsState === undefined && !hasLegacyReview);
      const isDue = isReviewDue(meaningCard.nextReviewDate, now, 'Asia/Ho_Chi_Minh');

      // Determine initial stage based on memory strength
      let stage: 1 | 2 | 3 | 4 | 5 = 1;
      if (meaningCard.memoryStrength === 'strong') stage = 5;
      else if (meaningCard.memoryStrength === 'stable') stage = 3;
      else if (meaningCard.memoryStrength === 'weak') stage = 2;
      if (
        stage === 3
        && meaningCard.wordStructureScore !== undefined
        && meaningCard.wordStructureScore < 50
      ) stage = 4;

      if (isFsrsNew) {
        newCards.push({ word, meaningCard, isNewWord: true, stage: 1 });
      } else if (
        isDue
        || meaningCard.memoryStrength === 'critical'
        || isExtraReview
      ) {
        reviewCards.push({ word, meaningCard, isNewWord: false, stage });
      }
    });
  });

  // 2. Priority Sorting for Reviews:
  // Order: Overdue -> Critical Strength -> Weak Strength -> Due today
  reviewCards.sort((a, b) => {
    const hasTelemetry = a.meaningCard.recognitionScore !== undefined
      || a.meaningCard.recallScore !== undefined
      || a.meaningCard.spellingScore !== undefined
      || a.meaningCard.contextScore !== undefined
      || a.meaningCard.wordStructureScore !== undefined;
    if (!hasTelemetry) {
      return (a.meaningCard.memoryScore || 50) - (b.meaningCard.memoryScore || 50);
    }
    return calculateForgettingRisk(b.meaningCard) - calculateForgettingRisk(a.meaningCard);
  });

  const criticalReviews = reviewCards.filter(
    (item) => item.meaningCard.memoryStrength === 'critical'
  );

  // If Extra Review Mode: only pick at-risk / critical words
  if (isExtraReview) {
    const atRiskCards = reviewCards.filter(
      (c) => c.meaningCard.memoryStrength === 'critical' || c.meaningCard.memoryStrength === 'weak'
    );
    const selected = enforceWordSpacing(atRiskCards.slice(0, settings.reviewLimitPerDay));
    return {
      questions: convertQueueToQuestions(selected, words),
      totalAvailableReviews: atRiskCards.length,
      limitReached: false,
    };
  }

  // Enforce Review Limit Per Day
  const reviewLimit = settings.reviewLimitPerDay || 40;
  const newWordsLimit = newWordsLimitOverride ?? (settings.newWordsPerDay || 10);

  const totalAvailableReviews = reviewCards.length;
  const selectedReviews = reviewCards.slice(0, reviewLimit);
  const limitReached = reviewCards.length > reviewLimit;

  // Rule from section 6: If critical reviews exist, do NOT include new words in session!
  let selectedNew: SessionQueueItem[] = [];
  if (criticalReviews.length === 0) {
    selectedNew = newCards.slice(0, newWordsLimit);
  }

  // Interleave 4 reviews per 1 new word if new words present
  const finalQueue: SessionQueueItem[] = [];
  let rIdx = 0;
  let nIdx = 0;

  while (rIdx < selectedReviews.length || nIdx < selectedNew.length) {
    // Push up to 4 reviews
    for (let i = 0; i < 4 && rIdx < selectedReviews.length; i++) {
      finalQueue.push(selectedReviews[rIdx++]);
    }
    // Push 1 new word
    if (nIdx < selectedNew.length) {
      finalQueue.push(selectedNew[nIdx++]);
    }
  }

  // 3. Spacing constraint: Spacing same word cards by at least 1 other question
  const spacedQueue = enforceWordSpacing(finalQueue);

  // 4. Convert queue items to interactive Question objects
  const questions = convertQueueToQuestions(spacedQueue, words);

  return {
    questions,
    totalAvailableReviews,
    limitReached,
  };
}

function enforceWordSpacing(queue: SessionQueueItem[]): SessionQueueItem[] {
  if (queue.length <= 1) return queue;
  const result: SessionQueueItem[] = [];
  const remaining = [...queue];

  while (remaining.length > 0) {
    const lastWordId = result.length > 0 ? result[result.length - 1].word.id : null;
    const nextIdx = remaining.findIndex((item) => item.word.id !== lastWordId);

    if (nextIdx >= 0) {
      result.push(remaining.splice(nextIdx, 1)[0]);
    } else {
      // Cannot space, push remaining
      result.push(remaining.shift()!);
    }
  }

  return result;
}

function convertQueueToQuestions(queue: SessionQueueItem[], allWords: Word[]): Question[] {
  return queue.map((item, index) => {
    const { word, meaningCard, stage } = item;

    // Pick question type based on stage & availability
    let qType: Question['type'] = 'en_to_vn_mc';

    if (stage === 1) {
      qType = index % 2 === 0 ? 'en_to_vn_mc' : 'vn_to_en_mc';
    } else if (stage === 2) {
      if (word.wordStructure.length >= 2) {
        qType = 'word_part_selection';
      } else if (meaningCard.exampleSentences.length > 0) {
        qType = 'sentence_completion';
      } else {
        qType = 'full_word_typing';
      }
    } else if ((stage === 3 || stage === 4) && word.wordStructure.length >= 2) {
      qType = 'word_part_typing'; // Stage 4 keeps partial assistance when parts exist
    } else {
      qType = 'full_word_typing';
    }

    // Build distractors for MC
    let mcOptions: Question['mcOptions'] = [];
    if (qType === 'en_to_vn_mc') {
      const distractors = allWords
        .filter((w) => w.id !== word.id && w.meanings.length > 0)
        .map((w) => w.meanings[0].meaning)
        .slice(0, 3);

      const options = [
        { id: 'opt_correct', label: meaningCard.meaning, isCorrect: true },
        ...distractors.map((d, i) => ({ id: `opt_d_${i}`, label: d, isCorrect: false })),
      ].sort(() => Math.random() - 0.5);

      mcOptions = options.map((opt, i) => ({
        ...opt,
        keyShortcut: String(i + 1),
      }));
    } else if (qType === 'vn_to_en_mc') {
      const distractors = allWords
        .filter((w) => w.id !== word.id)
        .map((w) => w.word)
        .slice(0, 3);

      const options = [
        { id: 'opt_correct', label: word.word, isCorrect: true },
        ...distractors.map((d, i) => ({ id: `opt_d_${i}`, label: d, isCorrect: false })),
      ].sort(() => Math.random() - 0.5);

      mcOptions = options.map((opt, i) => ({
        ...opt,
        keyShortcut: String(i + 1),
      }));
    }

    const examples = meaningCard.exampleSentences;
    const example = examples.length > 0
      ? examples[(index + meaningCard.history.length) % examples.length]
      : undefined;

    return {
      id: `q_${word.id}_${meaningCard.id}_${index}_${Date.now()}`,
      word,
      targetMeaningCard: meaningCard,
      stage,
      type: qType,
      prompt:
        qType === 'en_to_vn_mc'
          ? `Chọn nghĩa Tiếng Việt đúng cho từ "${word.word}"`
          : qType === 'vn_to_en_mc'
          ? `Chọn từ Tiếng Anh tương ứng với nghĩa: "${meaningCard.meaning}"`
          : qType === 'word_part_selection'
          ? `Chọn và ghép các thành phần để tạo từ có nghĩa: "${meaningCard.meaning}"`
          : qType === 'word_part_typing'
          ? `Viết các thành phần tiếng Anh của từ có nghĩa: "${meaningCard.meaning}"`
          : qType === 'sentence_completion'
          ? `Hoàn thành câu bằng từ hoặc dạng từ thích hợp:`
          : `Gõ toàn bộ từ Tiếng Anh có nghĩa: "${meaningCard.meaning}"`,
      mcOptions,
      wordParts: word.wordStructure,
      exampleSentence: example,
      expectedAnswer: qType === 'sentence_completion'
        ? (example?.expectedAnswer || word.word)
        : word.word,
      isNewWord: item.isNewWord,
    };
  });
}
