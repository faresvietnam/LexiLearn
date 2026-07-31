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
  geminiApiKey: null,
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

  it('does not create sentence completion without an example sentence', () => {
    const words = ['one', 'two', 'three'].map((id) =>
      word(id, [meaningCard(id, {history: [], memoryStrength: 'stable'})]),
    );

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions[2].type).not.toBe('sentence_completion');
  });

  it('masks the expected answer in sentence-completion questions', () => {
    const card = meaningCard('new', {
      history: [],
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
    const session = buildSessionQuestions([
      word('one', [meaningCard('one', {history: []})]),
      word('two', [meaningCard('two', {history: []})]),
      word('three', [meaningCard('three', {history: []})]),
      word('new', [card]),
    ], scope, settings);

    expect(session.questions[3].type).toBe('sentence_completion');
    expect(session.questions[3].expectedAnswer).toBe('new');
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

  it('does not add new cards when a critical review is due', () => {
    const words = [
      word('critical', [
        meaningCard('critical', {
          memoryStrength: 'critical',
          memoryScore: 10,
          nextReviewDate: '2000-01-01',
        }),
      ]),
      word('new', [meaningCard('new', { history: [] })]),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions.map((question) => question.word.id)).toEqual(['critical']);
  });

  it('orders due reviews by lower memory score first', () => {
    const words = [
      word('high', [meaningCard('high', { nextReviewDate: '2000-01-01', memoryScore: 80 })]),
      word('low', [meaningCard('low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('middle', [meaningCard('middle', { nextReviewDate: '2000-01-01', memoryScore: 50 })]),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions.map((question) => question.word.id)).toEqual(['low', 'middle', 'high']);
  });
});
