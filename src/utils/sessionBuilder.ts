import { Word, MeaningCard, Question, StudyScope, UserSettings } from '../types';
import { isOverdue } from './srs';

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
  isExtraReview: boolean = false
): { questions: Question[]; totalAvailableReviews: number; limitReached: boolean } {
  const todayStr = new Date().toISOString().split('T')[0];

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
      const hasBeenReviewed = Boolean(meaningCard.lastReviewedDate)
        || Boolean(meaningCard.history && meaningCard.history.length > 0);
      const isDue = isOverdue(meaningCard.nextReviewDate) || meaningCard.nextReviewDate <= todayStr;

      // Determine initial stage based on memory strength
      let stage: 1 | 2 | 3 | 4 | 5 = 1;
      if (meaningCard.memoryStrength === 'strong') stage = 5;
      else if (meaningCard.memoryStrength === 'stable') stage = 3;
      else if (meaningCard.memoryStrength === 'weak') stage = 2;

      if (hasBeenReviewed) {
        if (isDue || isExtraReview) {
          reviewCards.push({ word, meaningCard, isNewWord: false, stage });
        }
      } else {
        newCards.push({ word, meaningCard, isNewWord: true, stage: 1 });
      }
    });
  });

  // 2. Priority Sorting for Reviews:
  // Order: Overdue -> Critical Strength -> Weak Strength -> Due today
  reviewCards.sort((a, b) => {
    const scoreA = a.meaningCard.memoryScore || 50;
    const scoreB = b.meaningCard.memoryScore || 50;
    return scoreA - scoreB; // Lower memory score first
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
  const newWordsLimit = settings.newWordsPerDay || 10;

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
      // Variety in Stage 1
      const rand = index % 3;
      if (rand === 0) qType = 'en_to_vn_mc';
      else if (rand === 1) qType = 'vn_to_en_mc';
      else qType = 'sentence_completion';
    } else if (stage === 2) {
      qType = 'word_part_selection';
    } else if (stage === 3) {
      qType = 'word_part_typing';
    } else if (stage === 4) {
      qType = 'word_part_typing'; // Partial assistance
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

    const example = meaningCard.exampleSentences[0];

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
          ? `Chọn và ghép các thành phần cấu tạo của từ "${word.word}"`
          : qType === 'word_part_typing'
          ? `Gõ từng thành phần (Prefix, Root, Suffix) của từ "${word.word}"`
          : qType === 'sentence_completion'
          ? `Hoàn thành câu bằng từ hoặc dạng từ thích hợp:`
          : `Gõ toàn bộ từ Tiếng Anh có nghĩa: "${meaningCard.meaning}"`,
      mcOptions,
      wordParts: word.wordStructure,
      exampleSentence: example,
      expectedAnswer: word.word,
    };
  });
}
