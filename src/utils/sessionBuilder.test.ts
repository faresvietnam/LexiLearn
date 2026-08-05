import { describe, expect, it } from 'vitest';
import { MeaningCard, StudyScope, UserSettings, Word } from '../types';
import { buildSessionQuestions } from './sessionBuilder';

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
      [word('critical-future', [criticalCard])],
      scope,
      settings,
    );

    expect(session.questions).toHaveLength(1);
    expect(session.questions[0].word.id).toBe('critical-future');
    expect(session.questions[0].isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(1);
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
      [word('scheduled', [scheduledCard])],
      scope,
      settings,
    );

    expect(session.questions).toHaveLength(1);
    expect(session.questions[0].isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(1);
  });

  it('treats FSRS state 0 as new even when legacy history exists', () => {
    const newCard = meaningCard('new-fsrs-card', {
      fsrsState: 0,
      nextReviewDate: '2099-01-01',
    });

    const session = buildSessionQuestions(
      [word('new-fsrs-card', [newCard])],
      scope,
      settings,
    );

    expect(session.questions).toHaveLength(1);
    expect(session.questions[0].isNewWord).toBe(true);
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
    const words = ['one', 'two', 'three', 'four'].map((id) =>
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

    expect(session.questions.map(({type}) => type)).toEqual([
      'en_to_vn_mc',
      'vn_to_en_mc',
      'en_to_vn_mc',
      'vn_to_en_mc',
    ]);
    for (const question of session.questions) {
      expect(question.stage).toBe(1);
      expect(question.mcOptions?.length).toBeGreaterThan(0);
      expect(question.type).not.toBe('sentence_completion');
    }
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
    const session = buildSessionQuestions([word('new', [card])], scope, settings);

    expect(session.questions[0].stage).toBe(2);
    expect(session.questions[0].type).toBe('sentence_completion');
    expect(session.questions[0].expectedAnswer).toBe('new');
  });

  it('falls back to full-word typing when a staged card has no word parts', () => {
    const card = meaningCard('decide', {
      memoryStrength: 'stable',
      nextReviewDate: '2020-01-01',
    });
    const session = buildSessionQuestions(
      [word('decide', [card])],
      scope,
      settings,
    );

    expect(session.questions[0].stage).toBe(3);
    expect(session.questions[0].type).toBe('full_word_typing');
    expect(session.questions[0].wordParts).toEqual([]);
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
    const compoundSession = buildSessionQuestions([compound], scope, settings);
    expect(compoundSession.questions[0].type).toBe('word_part_selection');
    expect(compoundSession.questions[0].prompt).toContain('sửa chữa');
    expect(compoundSession.questions[0].prompt).not.toContain('repair');

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
    const typingSession = buildSessionQuestions([typingWord], scope, settings);
    expect(typingSession.questions[0].type).toBe('word_part_typing');
    expect(typingSession.questions[0].prompt).toContain('đi vào');
    expect(typingSession.questions[0].prompt).not.toContain('come');

    const rootOnly = word('remain', [meaningCard('remain', {
      meaning: 'còn lại',
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
    })]);
    rootOnly.wordStructure = [{id: 'remain', text: 'remain', type: 'root', order: 0}];
    const rootOnlySession = buildSessionQuestions([rootOnly], scope, settings);
    expect(rootOnlySession.questions[0].type).toBe('full_word_typing');
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
      [eligible, otherDeck, excludedTag, paused],
      selectedDeckScope,
      settings
    );

    expect(session.questions.map((question) => question.word.id)).toEqual(['eligible']);
  });

  it('enforces review and new-word limits', () => {
    const limitedSettings = { ...settings, reviewLimitPerDay: 2, newWordsPerDay: 2 };
    const words = [
      word('review-low', [meaningCard('review-low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('review-mid', [meaningCard('review-mid', { nextReviewDate: '2000-01-01', memoryScore: 20 })]),
      word('review-high', [meaningCard('review-high', { nextReviewDate: '2000-01-01', memoryScore: 30 })]),
      word('new-one', [meaningCard('new-one', { history: [] })]),
      word('new-two', [meaningCard('new-two', { history: [] })]),
      word('new-three', [meaningCard('new-three', { history: [] })]),
    ];

    const session = buildSessionQuestions(words, scope, limitedSettings);

    expect(session.questions.map((question) => question.word.id)).toEqual([
      'review-low',
      'review-mid',
      'new-one',
      'new-two',
    ]);
    expect(session.totalAvailableReviews).toBe(3);
    expect(session.limitReached).toBe(true);
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
});
