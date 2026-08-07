import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeaningCard, StudyScope, UserSettings, Word } from '../types';
import { buildSessionQuestions } from './sessionBuilder';
import { getNextStudyDayBoundary } from '../features/scheduling/reviewCountdown';

afterEach(() => {
  vi.useRealTimers();
});

const settings: UserSettings = {
  newWordsPerDay: 10,
  reviewLimitPerDay: 10,
  hintBehavior: 'manual',
  audioAutoplay: false,
  theme: 'system',
  language: 'vi',
  reducedMotion: false,
  charDiffAccessibility: false,
  aiProvider: 'gemini',
  geminiApiKey: null,
  openAICompatibleBaseUrl: '',
  openAICompatibleTokenConfigured: false,
  openAICompatibleModel: '',
};

const scope: StudyScope = {
  activeDeckIds: [],
  excludedTagIds: [],
  pausedWordIds: [],
};

function meaningCard(id: string, overrides: Partial<MeaningCard> = {}): MeaningCard {
  return {
    id,
    wordId: `word-${id}`,
    meaning: `meaning ${id}`,
    partOfSpeech: 'noun',
    exampleSentences: [],
    memoryStrength: 'stable',
    memoryScore: 60,
    reviewIntervalDays: 3,
    nextReviewDate: '2099-01-01',
    firstAttemptErrorRate: 0,
    forgottenWordParts: [],
    history: [
      {
        id: `history-${id}`,
        date: '2026-07-20T00:00:00.000Z',
        stage: 1,
        isFirstAttemptCorrect: true,
        attemptsCount: 1,
        hintLevelUsed: 0,
        responseTimeMs: 1_000,
        errorTypes: [],
      },
    ],
    ...overrides,
  };
}

function word(id: string, meanings: MeaningCard[], status: Word['status'] = 'active'): Word {
  return {
    id,
    word: id,
    wordStructure: [],
    wordFamily: [],
    isGlobal: false,
    approvalStatus: 'pending',
    createdBy: 'user-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    deckId: 'deck-1',
    tags: [],
    status,
    meanings: meanings.map((card) => ({ ...card, wordId: id })),
  };
}

function fillerReviewWords(count: number, scoreStart = 900): Word[] {
  return Array.from({ length: count }, (_, i) =>
    word(`filler-${i}`, [meaningCard(`filler-${i}`, {
      memoryStrength: 'stable',
      memoryScore: scoreStart + i,
      nextReviewDate: '2000-01-01',
    })]),
  );
}

function realIds(session: { questions: { word: { id: string } }[] }): string[] {
  return session.questions.map((q) => q.word.id).filter((id) => !id.startsWith('filler-'));
}

describe('buildSessionQuestions', () => {
  it('keeps an eligible queue empty when there are no new or due cards', () => {
    const words = [word('future', [meaningCard('future')])];

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toEqual([]);
    expect(session.totalAvailableReviews).toBe(0);
  });

  it('does not treat a hydrated future-due FSRS card with empty history as new', () => {
    const hydratedCard = meaningCard('hydrated', {
      history: [],
      lastReviewedDate: '2026-07-30T00:00:00.000Z',
      nextReviewDate: '2099-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word('hydrated', [hydratedCard])],
      scope,
      settings,
    );

    expect(session.questions).toEqual([]);
    expect(session.totalAvailableReviews).toBe(0);
  });

  it('includes an already-started critical card before its due time in a normal session', () => {
    const criticalCard = meaningCard('critical-future', {
      fsrsState: 2,
      memoryStrength: 'critical',
      memoryScore: 10,
      nextReviewDate: '2099-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word('critical-future', [criticalCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    expect(session.questions).toHaveLength(10);
    expect(session.questions[0].word.id).toBe('critical-future');
    expect(session.questions[0].isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(10);
  });

  it.each([
    ['weak', 30],
    ['stable', 60],
    ['strong', 90],
  ] as const)('keeps a future-due %s card out of a normal session', (memoryStrength, memoryScore) => {
    const futureCard = meaningCard(`${memoryStrength}-future`, {
      fsrsState: 2,
      memoryStrength,
      memoryScore,
      nextReviewDate: '2099-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word(`${memoryStrength}-future`, [futureCard])],
      scope,
      settings,
    );

    expect(session.questions).toEqual([]);
    expect(session.totalAvailableReviews).toBe(0);
  });

  it('includes persisted non-new FSRS cards even when legacy history is empty', () => {
    const scheduledCard = meaningCard('scheduled', {
      fsrsState: 2,
      history: [],
      lastReviewedDate: undefined,
      nextReviewDate: '2000-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word('scheduled', [scheduledCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    expect(realIds(session)).toEqual(['scheduled']);
    const target = session.questions.find((q) => q.word.id === 'scheduled');
    expect(target?.isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(10);
  });

  it('treats FSRS state 0 as new even when legacy history exists', () => {
    const newCard = meaningCard('new-fsrs-card', {
      fsrsState: 0,
      nextReviewDate: '2099-01-01',
    });

    const session = buildSessionQuestions(
      [word('new-fsrs-card', [newCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'new-fsrs-card');
    expect(target?.isNewWord).toBe(true);
  });

  it('excludes strong cards from extra review', () => {
    const words = [
      word('strong', [meaningCard('strong', { memoryStrength: 'strong', memoryScore: 90 })]),
      word('weak', [meaningCard('weak', { memoryStrength: 'weak', memoryScore: 30 })]),
    ];

    const session = buildSessionQuestions(words, scope, settings, true);

    expect(session.questions).toHaveLength(1);
    expect(session.questions[0].word.id).toBe('weak');
    expect(session.totalAvailableReviews).toBe(1);
  });

  it('uses only multiple-choice questions before new learners are asked to type', () => {
    const ids = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const words = ids.map((id) =>
      word(id, [meaningCard(id, {
        fsrsState: 0,
        history: [],
        exampleSentences: [{
          id: `example-${id}`,
          meaningCardId: id,
          sentence: `This sentence contains ${id}.`,
          expectedAnswer: id,
          baseWord: id,
          wordForm: 'base',
          partOfSpeech: 'noun',
          difficulty: 'easy',
          approvalStatus: 'approved',
        }],
      })]),
    );

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    for (const [index, question] of session.questions.entries()) {
      expect(question.stage).toBe(1);
      expect(question.mcOptions?.length).toBeGreaterThan(0);
      expect(question.type).not.toBe('sentence_completion');
      expect(question.type).toBe(index % 2 === 0 ? 'en_to_vn_mc' : 'vn_to_en_mc');
    }
  });

  it('prefers a same-tag, same-deck, same-part-of-speech word as an MC distractor', () => {
    const target = word('target-word', [meaningCard('target-word', {
      fsrsState: 0, history: [], partOfSpeech: 'noun', meaning: 'quả táo',
    })], 'active');
    target.tags = ['fruit'];
    target.deckId = 'deck-1';

    const relevant = word('relevant-word', [meaningCard('relevant-word', {
      fsrsState: 0, history: [], partOfSpeech: 'noun', meaning: 'quả cam',
    })], 'active');
    relevant.tags = ['fruit'];
    relevant.deckId = 'deck-1';

    const unrelated = ['u1', 'u2', 'u3', 'u4'].map((id) => {
      const w = word(id, [meaningCard(id, {
        fsrsState: 0, history: [], partOfSpeech: 'verb', meaning: `unrelated ${id}`,
      })], 'active');
      w.deckId = 'other-deck';
      return w;
    });

    const words = [target, relevant, ...unrelated];
    const session = buildSessionQuestions(words, scope, settings);

    const question = session.questions.find((q) => q.word.id === 'target-word')!;
    const labels = question.mcOptions?.map((o) => o.label) ?? [];
    const expectedRelevantLabel = question.type === 'en_to_vn_mc' ? 'quả cam' : 'relevant-word';

    expect(labels).toContain(expectedRelevantLabel);
  });

  it('uses sentence completion at Stage 2 when word parts are unavailable', () => {
    const card = meaningCard('new', {
      fsrsState: 2,
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
      exampleSentences: [{
        id: 'example-new',
        meaningCardId: 'new',
        sentence: 'Welcome to your new home!',
        expectedAnswer: 'new',
        baseWord: 'new',
        wordForm: 'base',
        partOfSpeech: 'adjective',
        difficulty: 'easy',
        approvalStatus: 'approved',
      }],
    });
    const session = buildSessionQuestions(
      [word('new', [card]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'new');
    expect(target?.stage).toBe(2);
    expect(target?.type).toBe('sentence_completion');
    expect(target?.expectedAnswer).toBe('new');
  });

  it('falls back to full-word typing when a staged card has no word parts', () => {
    const card = meaningCard('decide', {
      memoryStrength: 'stable',
      nextReviewDate: '2020-01-01',
    });
    const session = buildSessionQuestions(
      [word('decide', [card]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'decide');
    expect(target?.stage).toBe(3);
    expect(target?.type).toBe('full_word_typing');
    expect(target?.wordParts).toEqual([]);
  });

  it('uses Vietnamese meaning for word-part selection and requires multiple parts', () => {
    const compound = word('repair', [meaningCard('repair', {
      meaning: 'sửa chữa',
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
    })]);
    compound.wordStructure = [
      {id: 're', text: 're', type: 'prefix', order: 0},
      {id: 'pair', text: 'pair', type: 'root', order: 1},
    ];
    const compoundSession = buildSessionQuestions([compound, ...fillerReviewWords(9)], scope, settings);
    const compoundTarget = compoundSession.questions.find((q) => q.word.id === 'repair');
    expect(compoundTarget?.type).toBe('word_part_selection');
    expect(compoundTarget?.prompt).toContain('sửa chữa');
    expect(compoundTarget?.prompt).not.toContain('repair');

    const typingCard = meaningCard('typing', {
      meaning: 'đi vào',
      memoryStrength: 'stable',
      nextReviewDate: '2000-01-01',
    });
    const typingWord = word('come', [typingCard]);
    typingWord.wordStructure = [
      {id: 'com', text: 'com', type: 'root', order: 0},
      {id: 'e', text: 'e', type: 'suffix', order: 1},
    ];
    const typingSession = buildSessionQuestions([typingWord, ...fillerReviewWords(9)], scope, settings);
    const typingTarget = typingSession.questions.find((q) => q.word.id === 'come');
    expect(typingTarget?.type).toBe('word_part_typing');
    expect(typingTarget?.prompt).toContain('đi vào');
    expect(typingTarget?.prompt).not.toContain('come');

    const rootOnly = word('remain', [meaningCard('remain', {
      meaning: 'còn lại',
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
    })]);
    rootOnly.wordStructure = [{id: 'remain', text: 'remain', type: 'root', order: 0}];
    const rootOnlySession = buildSessionQuestions([rootOnly, ...fillerReviewWords(9)], scope, settings);
    const rootOnlyTarget = rootOnlySession.questions.find((q) => q.word.id === 'remain');
    expect(rootOnlyTarget?.type).toBe('full_word_typing');
  });

  it('spaces adjacent cards from the same word when another word is available in extra review', () => {
    const words = [
      word('alpha', [
        meaningCard('alpha-1', { memoryStrength: 'weak', memoryScore: 10 }),
        meaningCard('alpha-2', { memoryStrength: 'weak', memoryScore: 20 }),
      ]),
      word('beta', [meaningCard('beta-1', { memoryStrength: 'weak', memoryScore: 30 })]),
    ];

    const session = buildSessionQuestions(words, scope, settings, true);
    const ids = session.questions.map((question) => question.word.id);

    expect(ids).toEqual(['alpha', 'beta', 'alpha']);
  });

  it('filters out words outside the selected deck, excluded tags, and inactive statuses', () => {
    const selectedDeckScope: StudyScope = {
      activeDeckIds: ['deck-1'],
      excludedTagIds: ['skip'],
      pausedWordIds: [],
    };
    const eligible = word('eligible', [meaningCard('eligible', { nextReviewDate: '2000-01-01' })]);
    const otherDeck = word('other-deck', [meaningCard('other-deck', { nextReviewDate: '2000-01-01' })]);
    otherDeck.deckId = 'deck-2';
    const excludedTag = word('excluded-tag', [meaningCard('excluded-tag', { nextReviewDate: '2000-01-01' })]);
    excludedTag.tags = ['skip'];
    const paused = word('paused', [meaningCard('paused', { nextReviewDate: '2000-01-01' })], 'paused');

    const session = buildSessionQuestions(
      [eligible, otherDeck, excludedTag, paused, ...fillerReviewWords(9)],
      selectedDeckScope,
      settings
    );
    const ids = session.questions.map((q) => q.word.id);

    expect(ids).toContain('eligible');
    expect(ids).not.toContain('other-deck');
    expect(ids).not.toContain('excluded-tag');
    expect(ids).not.toContain('paused');
    expect(ids).toHaveLength(10);
  });

  it('enforces review and new-word limits', () => {
    const limitedSettings = { ...settings, reviewLimitPerDay: 2, newWordsPerDay: 8 };
    const newIds = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    const words = [
      word('review-low', [meaningCard('review-low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('review-mid', [meaningCard('review-mid', { nextReviewDate: '2000-01-01', memoryScore: 20 })]),
      word('review-high', [meaningCard('review-high', { nextReviewDate: '2000-01-01', memoryScore: 30 })]),
      ...newIds.map((n) => word(`new-${n}`, [meaningCard(`new-${n}`, { history: [] })])),
    ];

    const session = buildSessionQuestions(words, scope, limitedSettings);

    expect(session.questions.map((question) => question.word.id)).toEqual([
      'review-low',
      'review-mid',
      'new-one', 'new-two', 'new-three', 'new-four', 'new-five', 'new-six', 'new-seven', 'new-eight',
    ]);
    expect(session.totalAvailableReviews).toBe(3);
    expect(session.limitReached).toBe(true);
  });

  it('spends the daily new-word quota per word, not per meaning', () => {
    const words = [
      word('multi', [
        meaningCard('multi-noun', { fsrsState: 0, history: [], partOfSpeech: 'noun' }),
        meaningCard('multi-verb', { fsrsState: 0, history: [], partOfSpeech: 'verb' }),
      ]),
      word('single', [meaningCard('single', { fsrsState: 0, history: [] })]),
      ...fillerReviewWords(3),
    ];

    const session = buildSessionQuestions(words, scope, settings, false, 1);

    const newWordIds = new Set(
      session.questions.filter((q) => q.isNewWord).map((q) => q.word.id),
    );
    expect(newWordIds).toEqual(new Set(['multi']));
    const multiMeaningIds = session.questions
      .filter((q) => q.word.id === 'multi')
      .map((q) => q.targetMeaningCard.id);
    expect(new Set(multiMeaningIds)).toEqual(new Set(['multi-noun', 'multi-verb']));
  });

  it('still includes new cards when a critical review is due', () => {
    const words = [
      word('critical', [
        meaningCard('critical', {
          memoryStrength: 'critical',
          memoryScore: 10,
          nextReviewDate: '2000-01-01',
        }),
      ]),
      word('new', [meaningCard('new', { history: [] })]),
      ...fillerReviewWords(8),
    ];

    const session = buildSessionQuestions(words, scope, settings);
    const ids = session.questions.map((q) => q.word.id);

    expect(ids).toContain('critical');
    expect(ids).toContain('new');
  });

  it('orders due reviews by lower memory score first', () => {
    const words = [
      word('high', [meaningCard('high', { nextReviewDate: '2000-01-01', memoryScore: 80 })]),
      word('low', [meaningCard('low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('middle', [meaningCard('middle', { nextReviewDate: '2000-01-01', memoryScore: 50 })]),
      ...fillerReviewWords(7),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(realIds(session)).toEqual(['low', 'middle', 'high']);
  });

  it('ranks critical, then due-within-15-minutes, then ordinary due reviews', () => {
    const words = [
      word('ordinary-due', [meaningCard('ordinary-due', {
        memoryStrength: 'stable',
        memoryScore: 60,
        nextReviewDate: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
      })]),
      word('near-due', [meaningCard('near-due', {
        fsrsState: 2,
        memoryStrength: 'stable',
        memoryScore: 60,
        nextReviewDate: new Date(Date.now() + 10 * 60_000).toISOString(),
      })]),
      word('critical', [meaningCard('critical', {
        memoryStrength: 'critical',
        memoryScore: 10,
        nextReviewDate: new Date(Date.now() - 60 * 60_000).toISOString(),
      })]),
      ...fillerReviewWords(7),
    ];

    const session = buildSessionQuestions(words, scope, settings, false, undefined);

    expect(realIds(session)).toEqual(['critical', 'near-due', 'ordinary-due']);
  });

  it('orders same-tier due-within-15-minutes cards by soonest due first', () => {
    const words = [
      word('due-in-12', [meaningCard('due-in-12', {
        fsrsState: 2,
        memoryStrength: 'stable',
        nextReviewDate: new Date(Date.now() + 12 * 60_000).toISOString(),
      })]),
      word('due-in-3', [meaningCard('due-in-3', {
        fsrsState: 2,
        memoryStrength: 'stable',
        nextReviewDate: new Date(Date.now() + 3 * 60_000).toISOString(),
      })]),
      ...fillerReviewWords(8),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(realIds(session)).toEqual(['due-in-3', 'due-in-12']);
  });

  it('reports insufficientCards and no questions when fewer than 5 distinct cards qualify', () => {
    const words = [
      word('one', [meaningCard('one', { nextReviewDate: '2000-01-01' })]),
      word('two', [meaningCard('two', { nextReviewDate: '2000-01-01' })]),
      word('three', [meaningCard('three', { nextReviewDate: '2000-01-01' })]),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toEqual([]);
    expect(session.insufficientCards).toBe(true);
    expect(session.nextEligibleAt).toBeUndefined();
  });

  it('reports nextEligibleAt as the date the Nth still-missing card becomes due', () => {
    const dueWords = ['due-1', 'due-2', 'due-3'].map((id) =>
      word(id, [meaningCard(id, { nextReviewDate: '2000-01-01' })]),
    );
    const soonIso = new Date(Date.now() + 60 * 60_000).toISOString();
    const laterIso = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const futureWords = [
      word('future-soon', [meaningCard('future-soon', { fsrsState: 2, nextReviewDate: soonIso })]),
      word('future-later', [meaningCard('future-later', { fsrsState: 2, nextReviewDate: laterIso })]),
    ];

    const session = buildSessionQuestions([...dueWords, ...futureWords], scope, settings);

    // 3 already qualify; 2 more are needed. The 2nd-soonest future card
    // (not the 1st) is the one that actually closes the gap to 5.
    expect(session.insufficientCards).toBe(true);
    expect(session.nextEligibleAt).toBe(laterIso);
  });

  it('leaves nextEligibleAt unset when there is not enough vocabulary in scope regardless of wait', () => {
    const words = ['one', 'two', 'three'].map((id) =>
      word(id, [meaningCard(id, { nextReviewDate: '2000-01-01' })]),
    );

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.insufficientCards).toBe(true);
    expect(session.nextEligibleAt).toBeUndefined();
  });

  it('falls back to the next new-word quota reset when it would close the gap sooner than any review', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const dueWords = ['due-1', 'due-2', 'due-3'].map((id) =>
      word(id, [meaningCard(id, { nextReviewDate: '2000-01-01' })]),
    );
    const newWords = Array.from({ length: 10 }, (_, i) =>
      word(`new-${i}`, [meaningCard(`new-${i}`, { history: [] })]),
    );

    // 3 already qualify (deficit 2); today's new-word quota is exhausted
    // (override 0), but 10 new cards are waiting once it resets.
    const session = buildSessionQuestions([...dueWords, ...newWords], scope, settings, false, 0);

    expect(session.insufficientCards).toBe(true);
    expect(session.nextEligibleAt).toBe(
      getNextStudyDayBoundary(new Date(), 'Asia/Ho_Chi_Minh').toISOString(),
    );
  });

  it('prefers an earlier upcoming review over the quota reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const dueWords = ['due-1', 'due-2', 'due-3'].map((id) =>
      word(id, [meaningCard(id, { nextReviewDate: '2000-01-01' })]),
    );
    const soonIso = new Date(Date.now() + 30 * 60_000).toISOString();
    const laterIso = new Date(Date.now() + 45 * 60_000).toISOString();
    const laterReviewWords = [
      word('future-soon', [meaningCard('future-soon', { fsrsState: 2, nextReviewDate: soonIso })]),
      word('future-later', [meaningCard('future-later', { fsrsState: 2, nextReviewDate: laterIso })]),
    ];
    const newWords = Array.from({ length: 10 }, (_, i) =>
      word(`new-${i}`, [meaningCard(`new-${i}`, { history: [] })]),
    );

    // The quota reset (~16h away) would also close the gap eventually, but
    // the 2nd-soonest future review (45 minutes away) gets there first.
    const session = buildSessionQuestions(
      [...dueWords, ...laterReviewWords, ...newWords],
      scope,
      settings,
      false,
      0,
    );

    expect(session.nextEligibleAt).toBe(laterIso);
  });

  it('ignores the quota reset when too few new cards exist to ever close the gap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const limitedNewWordSettings = { ...settings, newWordsPerDay: 1 };
    const dueWords = ['due-1', 'due-2', 'due-3'].map((id) =>
      word(id, [meaningCard(id, { nextReviewDate: '2000-01-01' })]),
    );
    const words = [...dueWords, word('new-1', [meaningCard('new-1', { history: [] })])];

    const session = buildSessionQuestions(words, scope, limitedNewWordSettings, false, 0);

    expect(session.insufficientCards).toBe(true);
    expect(session.nextEligibleAt).toBeUndefined();
  });

  it('does not report insufficientCards once at least 5 distinct cards qualify', () => {
    const words = fillerReviewWords(5);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.insufficientCards).toBe(false);
    expect(session.questions.length).toBeGreaterThan(0);
  });

  it('pads a 6-card session to 10 questions by round-robin repeating cards', () => {
    const words = fillerReviewWords(6);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    const counts = session.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.word.id] = (acc[q.word.id] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.values(counts).sort()).toEqual([1, 1, 2, 2, 2, 2]);
  });

  it('does not pad a session that already has 10 or more distinct cards', () => {
    const words = fillerReviewWords(11);
    const roomySettings = { ...settings, reviewLimitPerDay: 20 };

    const session = buildSessionQuestions(words, scope, roomySettings);

    expect(session.questions).toHaveLength(11);
    const ids = session.questions.map((q) => q.word.id);
    expect(new Set(ids).size).toBe(11);
  });

  it('pads a session that has exactly the minimum 5 distinct cards', () => {
    const words = fillerReviewWords(5);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    expect(new Set(session.questions.map((q) => q.word.id)).size).toBe(5);
  });
});
