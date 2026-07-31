import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {INITIAL_SETTINGS, INITIAL_STUDY_SCOPE} from '../../data/mockData';
import {AddWordModal} from '../../components/AddWordModal';
import {DecksAndTagsView} from '../../components/DecksAndTagsView';
import {StudyScopeModal} from '../../components/StudyScopeModal';
import {Word} from '../../types';
import {buildSessionQuestions} from '../../utils/sessionBuilder';
import {
  mapDeckRow,
  mapSettingsRow,
  mapStudyScopeRow,
  mapTagRow,
  mapVocabularyRow,
} from './mappers';

const {getSupabaseClient, from} = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

afterEach(cleanup);

import {saveSettings, saveStudyScope} from './settingsRepository';
import {
  createPrivateWord,
  linkGlobalWord,
  loadLearnerState,
  moveWordsToDeck,
  saveDeck,
  saveTag,
  saveWordStatus,
  saveWordStatuses,
} from './vocabularyRepository';

describe('persistence mappers', () => {
  it('maps persisted FSRS state and scheduling fields onto a meaning card', () => {
    const word = mapVocabularyRow({
      id: 'vocabulary-fsrs',
      deck_id: null,
      study_status: 'active',
      added_at: '2026-07-30T00:00:00Z',
      personal_word_tags: [],
      learning_cards: [{
        id: 'card-fsrs',
        meaning_source_id: 'meaning-fsrs',
        memory_strength: 'critical',
        memory_score: 0,
        review_interval_days: 1,
        next_review_at: '2026-07-30T00:00:00Z',
        last_reviewed_at: null,
        fsrs_state: 0,
        fsrs_stability: 0,
        fsrs_difficulty: 0,
        fsrs_elapsed_days: 0,
        fsrs_scheduled_days: 0,
        fsrs_learning_steps: 0,
        fsrs_reps: 0,
        fsrs_lapses: 0,
        fsrs_retrievability: 1,
      }],
      global_words: null,
      private_words: {
        id: 'private-fsrs',
        owner_user_id: 'user-fsrs',
        word: 'persist',
        ipa: null,
        audio_url: null,
        image_url: null,
        status: 'pending',
        admin_comment: null,
        created_at: '2026-07-30T00:00:00Z',
        private_meanings: [{
          id: 'meaning-fsrs',
          meaning_vi: 'lưu lại',
          part_of_speech: 'verb',
          display_order: 0,
        }],
      },
    });

    expect(word?.meanings[0]).toMatchObject({
      fsrsState: 0,
      learningStatus: 'new',
      fsrsStability: 0,
      fsrsDifficulty: 0,
      fsrsScheduledDays: 0,
      fsrsReps: 0,
      fsrsLapses: 0,
      fsrsRetrievability: 1,
    });
  });

  it('maps persisted learner configuration into existing settings and scope shapes', () => {
    expect(mapSettingsRow({
      user_id: 'user-1',
      new_words_per_day: 12,
      review_limit_per_day: 60,
      hint_behavior: 'manual',
      audio_autoplay: true,
      theme: 'dark',
      language: 'en',
      reduced_motion: true,
      char_diff_accessibility: true,
      gemini_api_key: 'owner-key',
    })).toEqual({
      newWordsPerDay: 12,
      reviewLimitPerDay: 60,
      hintBehavior: 'manual',
      audioAutoplay: true,
      theme: 'dark',
      language: 'en',
      reducedMotion: true,
      charDiffAccessibility: true,
      geminiApiKey: 'owner-key',
    });

    expect(mapStudyScopeRow({
      user_id: 'user-1',
      active_deck_ids: ['deck-1'],
      excluded_tag_ids: ['tag-2'],
      paused_word_ids: ['vocabulary-3'],
    })).toEqual({
      activeDeckIds: ['deck-1'],
      excludedTagIds: ['tag-2'],
      pausedWordIds: ['vocabulary-3'],
    });
  });

  it('maps deck and tag rows without creating new domain types', () => {
    expect(mapDeckRow({
      id: 'deck-1',
      name: 'IELTS',
      description: null,
      color: '#123456',
      is_default: true,
      created_at: '2026-07-30T01:02:03Z',
    })).toEqual({
      id: 'deck-1',
      name: 'IELTS',
      color: '#123456',
      isDefault: true,
      createdAt: '2026-07-30T01:02:03Z',
    });

    expect(mapTagRow({
      id: 'tag-1',
      name: 'Academic',
      color: '#654321',
    })).toEqual({
      id: 'tag-1',
      name: 'Academic',
      color: '#654321',
    });
  });

  it('maps linked global vocabulary, cards, examples, parts, and personal metadata', () => {
    expect(mapVocabularyRow({
      id: 'vocabulary-1',
      deck_id: 'deck-1',
      study_status: 'paused',
      added_at: '2026-07-30T00:00:00Z',
      personal_word_tags: [{tag_id: 'tag-1'}],
      learning_cards: [{
        id: 'card-1',
        meaning_source_id: 'meaning-1',
        memory_strength: 'stable',
        memory_score: 75,
        review_interval_days: 4,
        next_review_at: '2026-08-03T00:00:00Z',
        last_reviewed_at: '2026-07-29T00:00:00Z',
      }],
      global_words: {
        id: 'global-1',
        word: 'transport',
        ipa: '/ˈtrænspɔːrt/',
        audio_url: 'https://example.com/audio.mp3',
        image_url: null,
        status: 'active',
        created_by_admin_id: 'admin-1',
        created_at: '2026-07-20T00:00:00Z',
        word_parts: [{
          id: 'part-1',
          text: 'trans',
          type: 'prefix',
          meaning: 'across',
          position: 0,
        }],
        global_meanings: [{
          id: 'meaning-1',
          meaning_vi: 'vận chuyển',
          part_of_speech: 'verb',
          display_order: 0,
          status: 'active',
          global_examples: [{
            id: 'example-1',
            sentence: 'We _____ goods by rail.',
            expected_answer: 'transport',
            word_form: 'base',
            difficulty: 'medium',
            status: 'active',
          }],
        }],
      },
      private_words: null,
    })).toEqual({
      id: 'vocabulary-1',
      word: 'transport',
      ipa: '/ˈtrænspɔːrt/',
      audioUrl: 'https://example.com/audio.mp3',
      wordStructure: [{
        id: 'part-1',
        text: 'trans',
        type: 'prefix',
        meaning: 'across',
        order: 0,
      }],
      wordFamily: [],
      isGlobal: true,
      approvalStatus: 'approved',
      createdBy: 'admin-1',
      createdAt: '2026-07-20T00:00:00Z',
      deckId: 'deck-1',
      tags: ['tag-1'],
      status: 'paused',
      meanings: [{
        id: 'card-1',
        wordId: 'vocabulary-1',
        meaning: 'vận chuyển',
        partOfSpeech: 'verb',
        memoryStrength: 'stable',
        memoryScore: 75,
        reviewIntervalDays: 4,
        nextReviewDate: '2026-08-03T00:00:00Z',
        lastReviewedDate: '2026-07-29T00:00:00Z',
        firstAttemptErrorRate: 0,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [{
          id: 'example-1',
          meaningCardId: 'card-1',
          sentence: 'We _____ goods by rail.',
          expectedAnswer: 'transport',
          baseWord: 'transport',
          wordForm: 'base',
          partOfSpeech: 'verb',
          difficulty: 'medium',
          approvalStatus: 'approved',
        }],
      }],
    });
  });

  it('keeps a hydrated future-due FSRS card out of the new-card queue', () => {
    const hydrated = mapVocabularyRow({
      id: 'vocabulary-fsrs',
      deck_id: null,
      study_status: 'active',
      added_at: '2026-07-30T00:00:00Z',
      personal_word_tags: [],
      learning_cards: [{
        id: 'card-fsrs',
        meaning_source_id: 'meaning-fsrs',
        memory_strength: 'stable',
        memory_score: 90,
        review_interval_days: 30,
        next_review_at: '2099-01-01T00:00:00Z',
        last_reviewed_at: '2026-07-30T00:00:00Z',
      }],
      global_words: {
        id: 'global-fsrs',
        word: 'persisted',
        ipa: null,
        audio_url: null,
        image_url: null,
        status: 'active',
        created_by_admin_id: null,
        created_at: '2026-07-30T00:00:00Z',
        word_parts: [],
        global_meanings: [{
          id: 'meaning-fsrs',
          meaning_vi: 'đã lưu',
          part_of_speech: 'verb',
          display_order: 0,
          status: 'active',
          global_examples: [],
        }],
      },
      private_words: null,
    });

    expect(hydrated).not.toBeNull();
    const session = buildSessionQuestions(
      [hydrated!],
      INITIAL_STUDY_SCOPE,
      INITIAL_SETTINGS,
    );

    expect(session.questions).toEqual([]);
    expect(session.totalAvailableReviews).toBe(0);
  });

  it('maps private vocabulary and supplies defaults for fields absent from its schema', () => {
    const word = mapVocabularyRow({
      id: 'vocabulary-2',
      deck_id: null,
      study_status: 'active',
      added_at: '2026-07-30T00:00:00Z',
      personal_word_tags: [],
      learning_cards: [],
      global_words: null,
      private_words: {
        id: 'private-1',
        owner_user_id: 'user-1',
        word: 'moonshot',
        ipa: null,
        audio_url: null,
        image_url: null,
        status: 'approved',
        admin_comment: null,
        created_at: '2026-07-30T00:00:00Z',
        private_meanings: [{
          id: 'private-meaning-1',
          meaning_vi: 'mục tiêu đầy tham vọng',
          part_of_speech: 'noun',
          display_order: 0,
        }],
      },
    });

    expect(word).toMatchObject({
      id: 'vocabulary-2',
      word: 'moonshot',
      wordStructure: [],
      wordFamily: [],
      isGlobal: false,
      approvalStatus: 'approved',
      createdBy: 'user-1',
      deckId: '',
      tags: [],
      status: 'active',
    });
    expect(word?.meanings[0]).toMatchObject({
      id: 'private-meaning-1',
      memoryStrength: 'critical',
      memoryScore: 0,
      reviewIntervalDays: 1,
      nextReviewDate: '2026-07-30T00:00:00Z',
      exampleSentences: [],
    });
  });
});

describe('persistence repository errors', () => {
  beforeEach(() => {
    from.mockReset();
    getSupabaseClient.mockReset();
    getSupabaseClient.mockReturnValue({from});
  });

  it.each([
    ['settings', () => saveSettings('user-1', INITIAL_SETTINGS)],
    ['study scope', () => saveStudyScope('user-1', {
      activeDeckIds: [],
      excludedTagIds: [],
      pausedWordIds: [],
    })],
    ['deck', () => saveDeck('user-1', {
      id: 'temporary',
      name: 'IELTS',
      color: '#123456',
      createdAt: '2026-07-30',
    })],
    ['tag', () => saveTag('user-1', {
      id: 'temporary',
      name: 'Academic',
      color: '#654321',
    })],
    ['word status', () => saveWordStatus('user-1', 'vocabulary-1', 'paused')],
  ])('returns a recoverable Vietnamese error when saving %s fails', async (_name, save) => {
    from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({single: vi.fn().mockResolvedValue({data: null, error: {message: 'failed'}})})),
          })),
          select: vi.fn(() => ({single: vi.fn().mockResolvedValue({data: null, error: {message: 'failed'}})})),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({single: vi.fn().mockResolvedValue({data: null, error: {message: 'failed'}})})),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({single: vi.fn().mockResolvedValue({data: null, error: {message: 'failed'}})})),
      })),
    });

    const result = await save();

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/[Không thể|không thể]/);
  });

  it('does not mutate settings while reporting a failed save', async () => {
    const settings = structuredClone(INITIAL_SETTINGS);
    const before = structuredClone(settings);
    getSupabaseClient.mockReturnValue(null);

    await saveSettings('user-1', settings);

    expect(settings).toEqual(before);
  });
});

describe('successful learner persistence', () => {
  beforeEach(() => {
    from.mockReset();
    getSupabaseClient.mockReset();
    getSupabaseClient.mockReturnValue({from});
  });

  it('hydrates unlinked active Global words for discovery', async () => {
    const terminal = (data: unknown) => ({data, error: null});
    from.mockImplementation((table: string) => {
      if (table === 'user_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(terminal({
                user_id: 'user-1',
                new_words_per_day: 10,
                review_limit_per_day: 40,
                hint_behavior: 'auto',
                audio_autoplay: false,
                theme: 'system',
                language: 'vi',
                reduced_motion: false,
                char_diff_accessibility: false,
                gemini_api_key: null,
              })),
            })),
          })),
        };
      }
      if (table === 'study_scope') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue(terminal(null)),
            })),
          })),
        };
      }
      const rows = table === 'personal_vocabulary'
        ? [{
            id: 'vocabulary-1',
            deck_id: null,
            study_status: 'active',
            added_at: '2026-07-30T00:00:00Z',
            personal_word_tags: [],
            learning_cards: [],
            global_words: {
              id: 'global-linked',
              word: 'linked',
              ipa: null,
              audio_url: null,
              image_url: null,
              status: 'active',
              created_by_admin_id: null,
              created_at: '2026-07-30T00:00:00Z',
              word_parts: [],
              global_meanings: [],
            },
            private_words: null,
          }]
        : table === 'global_words'
          ? [
              {id: 'global-linked', word: 'linked', ipa: null},
              {id: 'global-new', word: 'discoverable', ipa: '/dɪˈskʌvərəbl/'},
            ]
          : [];
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue(terminal(rows)),
          })),
        })),
      };
    });

    const result = await loadLearnerState('user-1');

    expect(result.error).toBeNull();
    expect(result.data?.globalWords).toEqual([
      {id: 'global-new', word: 'discoverable', ipa: '/dɪˈskʌvərəbl/'},
    ]);
  });

  it('returns a private word with persisted IDs and session-only enrichment intact', async () => {
    const input: Word = {
      id: 'temporary-word',
      word: 'moonshot',
      ipa: '/ˈmuːnʃɒt/',
      imageUrl: 'https://images.example/users/user-1/images/image-1.webp',
      imageObjectKey: 'users/user-1/images/image-1.webp',
      wordStructure: [{
        id: 'part-local',
        text: 'moon',
        type: 'root',
        meaning: 'mặt trăng',
        order: 1,
      }],
      wordFamily: ['moonshot', 'moonshots'],
      isGlobal: false,
      approvalStatus: 'pending',
      createdBy: 'user-1',
      createdAt: '2026-07-30',
      deckId: 'deck-1',
      tags: [],
      status: 'active',
      meanings: [{
        id: 'meaning-local',
        wordId: 'temporary-word',
        meaning: 'mục tiêu đầy tham vọng',
        partOfSpeech: 'noun',
        memoryStrength: 'critical',
        memoryScore: 20,
        reviewIntervalDays: 1,
        nextReviewDate: '2026-07-31',
        firstAttemptErrorRate: 0,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [{
          id: 'example-local',
          meaningCardId: 'meaning-local',
          sentence: 'This is a moonshot project.',
          expectedAnswer: 'moonshot',
          baseWord: 'moonshot',
          wordForm: 'base',
          partOfSpeech: 'noun',
          difficulty: 'medium',
          approvalStatus: 'pending',
        }],
      }],
    };
    const insertPrivateWord = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'private-db',
            owner_user_id: 'user-1',
            word: 'moonshot',
            ipa: '/ˈmuːnʃɒt/',
            audio_url: null,
            image_url:
              'https://images.example/users/user-1/images/image-1.webp',
            image_object_key: 'users/user-1/images/image-1.webp',
            status: 'pending',
            admin_comment: null,
            created_at: '2026-07-30T00:00:00Z',
          },
          error: null,
        }),
      })),
    }));
    from.mockImplementation((table: string) => {
      if (table === 'private_words') {
        return {
          insert: insertPrivateWord,
        };
      }
      if (table === 'private_meanings') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({
              data: [{
                id: 'meaning-db',
                meaning_vi: 'mục tiêu đầy tham vọng',
                part_of_speech: 'noun',
                display_order: 0,
              }],
              error: null,
            }),
          })),
        };
      }
      if (table === 'personal_vocabulary') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'vocabulary-db',
                  deck_id: 'deck-1',
                  study_status: 'active',
                  added_at: '2026-07-30T00:00:00Z',
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'learning_cards') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({
              data: [{
                id: 'card-db',
                meaning_source_id: 'meaning-db',
                memory_strength: 'critical',
                memory_score: 0,
                review_interval_days: 1,
                next_review_at: '2026-07-30T00:00:00Z',
                last_reviewed_at: null,
              }],
              error: null,
            }),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await createPrivateWord('user-1', input);

    expect(insertPrivateWord).toHaveBeenCalledWith(expect.objectContaining({
      image_url:
        'https://images.example/users/user-1/images/image-1.webp',
      image_object_key: 'users/user-1/images/image-1.webp',
    }));
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      id: 'vocabulary-db',
      imageUrl: 'https://images.example/users/user-1/images/image-1.webp',
      imageObjectKey: 'users/user-1/images/image-1.webp',
      wordStructure: input.wordStructure,
      wordFamily: input.wordFamily,
      meanings: [{
        id: 'card-db',
        exampleSentences: [{
          id: 'example-local',
          meaningCardId: 'card-db',
          sentence: 'This is a moonshot project.',
        }],
      }],
    });
  });

  it('moves all requested learner-owned words in one update', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{id: 'vocabulary-2'}, {id: 'vocabulary-1'}],
      error: null,
    });
    const eq = vi.fn(() => ({select}));
    const inFilter = vi.fn(() => ({eq}));
    const update = vi.fn(() => ({in: inFilter}));
    from.mockReturnValue({update});

    const result = await moveWordsToDeck(
      'user-1',
      ['vocabulary-1', 'vocabulary-2'],
      'deck-2',
    );

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({deck_id: 'deck-2'});
    expect(inFilter).toHaveBeenCalledWith(
      'id',
      ['vocabulary-1', 'vocabulary-2'],
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.error).toBeNull();
    expect(result.data).toEqual(
      expect.arrayContaining(['vocabulary-1', 'vocabulary-2']),
    );
  });

  it('updates all requested learner-owned statuses in one write', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{id: 'vocabulary-1'}, {id: 'vocabulary-2'}],
      error: null,
    });
    const eq = vi.fn(() => ({select}));
    const inFilter = vi.fn(() => ({eq}));
    const update = vi.fn(() => ({in: inFilter}));
    from.mockReturnValue({update});

    const result = await saveWordStatuses(
      'user-1',
      ['vocabulary-1', 'vocabulary-2'],
      'paused',
    );

    expect(update).toHaveBeenCalledOnce();
    expect(inFilter).toHaveBeenCalledWith(
      'id',
      ['vocabulary-1', 'vocabulary-2'],
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({
      data: ['vocabulary-1', 'vocabulary-2'],
      error: null,
    });
  });

  it('rejects a bulk status response that did not update every requested ID', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{id: 'vocabulary-1'}],
      error: null,
    });
    const eq = vi.fn(() => ({select}));
    const inFilter = vi.fn(() => ({eq}));
    from.mockReturnValue({update: vi.fn(() => ({in: inFilter}))});

    const result = await saveWordStatuses(
      'user-1',
      ['vocabulary-1', 'vocabulary-2'],
      'archived',
    );

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Không thể cập nhật trạng thái từ/);
  });

  it('links a Global word with one persisted card per active meaning', async () => {
    const insertCards = vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'card-db-1',
            meaning_source_id: 'global-meaning-1',
            memory_strength: 'critical',
            memory_score: 0,
            review_interval_days: 1,
            next_review_at: '2026-07-30T00:00:00Z',
            last_reviewed_at: null,
          },
          {
            id: 'card-db-2',
            meaning_source_id: 'global-meaning-2',
            memory_strength: 'critical',
            memory_score: 0,
            review_interval_days: 1,
            next_review_at: '2026-07-30T00:00:00Z',
            last_reviewed_at: null,
          },
        ],
        error: null,
      }),
    }));
    from.mockImplementation((table: string) => {
      if (table === 'learning_cards') return {insert: insertCards};
      if (table !== 'personal_vocabulary') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {id: 'vocabulary-db'},
              error: null,
            }),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'vocabulary-db',
                  deck_id: 'deck-1',
                  study_status: 'active',
                  added_at: '2026-07-30T00:00:00Z',
                  personal_word_tags: [],
                  learning_cards: [],
                  private_words: null,
                  global_words: {
                    id: 'global-1',
                    word: 'transport',
                    ipa: '/ˈtrænspɔːrt/',
                    audio_url: null,
                    image_url: null,
                    status: 'active',
                    created_by_admin_id: 'admin-1',
                    created_at: '2026-07-29T00:00:00Z',
                    word_parts: [],
                    global_meanings: [
                      {
                        id: 'global-meaning-1',
                        meaning_vi: 'vận chuyển',
                        part_of_speech: 'verb',
                        display_order: 0,
                        status: 'active',
                        global_examples: [],
                      },
                      {
                        id: 'global-meaning-2',
                        meaning_vi: 'sự vận chuyển',
                        part_of_speech: 'noun',
                        display_order: 1,
                        status: 'active',
                        global_examples: [],
                      },
                      {
                        id: 'global-meaning-archived',
                        meaning_vi: 'nghĩa cũ',
                        part_of_speech: 'noun',
                        display_order: 2,
                        status: 'archived',
                        global_examples: [],
                      },
                    ],
                  },
                },
                error: null,
              }),
            })),
          })),
        })),
      };
    });

    const result = await linkGlobalWord('user-1', 'global-1', 'deck-1');

    expect(insertCards).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        personal_vocabulary_id: 'vocabulary-db',
        meaning_source_id: 'global-meaning-1',
        meaning_source_type: 'global_meaning',
      },
      {
        user_id: 'user-1',
        personal_vocabulary_id: 'vocabulary-db',
        meaning_source_id: 'global-meaning-2',
        meaning_source_type: 'global_meaning',
      },
    ]);
    expect(result.error).toBeNull();
    expect(result.data?.meanings.map(({id}) => id)).toEqual([
      'card-db-1',
      'card-db-2',
    ]);
  });
});

describe('persisted form callbacks', () => {
  it('clears Global-prefilled fields before switching back to private entry', () => {
    const onAddWord = vi.fn().mockResolvedValue(false);
    render(React.createElement(AddWordModal, {
      decks: [],
      tags: [],
      globalWords: [{
        id: 'global-1',
        word: 'transport',
        ipa: '/ˈtrænspɔːrt/',
      }],
      linkedGlobalWords: [],
      onAddWord,
      onLinkExistingGlobalWord: vi.fn().mockResolvedValue(false),
      onClose: vi.fn(),
    }));
    const globalSelect = screen.getByLabelText('Chọn từ Global có sẵn');
    const wordInput = screen.getByPlaceholderText('e.g. transportation');
    const ipaInput = screen.getByPlaceholderText('/ˌtrænspərˈteɪʃn/');

    fireEvent.change(globalSelect, {target: {value: 'global-1'}});
    expect(wordInput).toHaveValue('transport');
    expect(ipaInput).toHaveValue('/ˈtrænspɔːrt/');

    fireEvent.change(globalSelect, {target: {value: ''}});
    fireEvent.change(screen.getByPlaceholderText('e.g. Giao thông vận tải'), {
      target: {value: 'vận chuyển'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    expect(wordInput).toHaveValue('');
    expect(ipaInput).toHaveValue('');
    expect(onAddWord).not.toHaveBeenCalled();
  });

  it('blocks private creation when typing an already-linked Global word', async () => {
    const onAddWord = vi.fn().mockResolvedValue(false);
    const onLinkExistingGlobalWord = vi.fn().mockResolvedValue(false);
    render(React.createElement(AddWordModal, {
      decks: [],
      tags: [],
      globalWords: [],
      linkedGlobalWords: [{
        id: 'vocabulary-1',
        word: 'transport',
        ipa: '/ˈtrænspɔːrt/',
      }],
      onAddWord,
      onLinkExistingGlobalWord,
      onClose: vi.fn(),
    }));

    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: ' Transport '},
    });

    expect(screen.getByText(
      'Từ "transport" đã tồn tại trong Global Vocabulary!',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Lưu từ vựng'})).toBeDisabled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Thêm vào Từ vựng cá nhân của tôi',
    }));

    await waitFor(() => {
      expect(onLinkExistingGlobalWord).toHaveBeenCalledWith('vocabulary-1');
    });
    expect(onAddWord).not.toHaveBeenCalled();
  });

  it('discloses that private structure and examples last for this session only', () => {
    render(React.createElement(AddWordModal, {
      decks: [],
      tags: [],
      globalWords: [],
      linkedGlobalWords: [],
      onAddWord: vi.fn().mockResolvedValue(false),
      onLinkExistingGlobalWord: vi.fn().mockResolvedValue(false),
      onClose: vi.fn(),
    }));

    expect(screen.getByText(
      /cấu tạo từ và câu ví dụ chỉ được giữ trong phiên hiện tại/i,
    )).toBeInTheDocument();
  });

  it('lets the learner discover and explicitly link an unlinked Global word', async () => {
    const onLinkExistingGlobalWord = vi.fn().mockResolvedValue(false);
    render(React.createElement(AddWordModal, {
      decks: [],
      tags: [],
      globalWords: [{
        id: 'global-1',
        word: 'transport',
        ipa: '/ˈtrænspɔːrt/',
      }],
      linkedGlobalWords: [],
      onAddWord: vi.fn().mockResolvedValue(false),
      onLinkExistingGlobalWord,
      onClose: vi.fn(),
    }));

    fireEvent.change(screen.getByLabelText('Chọn từ Global có sẵn'), {
      target: {value: 'global-1'},
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Thêm vào Từ vựng cá nhân của tôi',
    }));

    await waitFor(() => {
      expect(onLinkExistingGlobalWord).toHaveBeenCalledWith('global-1');
    });
  });

  it('keeps Study Scope open when persistence fails', async () => {
    const onSaveScope = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(React.createElement(StudyScopeModal, {
      studyScope: {
        activeDeckIds: [],
        excludedTagIds: [],
        pausedWordIds: [],
      },
      decks: [],
      tags: [],
      words: [],
      onSaveScope,
      onClose,
    }));

    fireEvent.click(screen.getByRole('button', {name: 'Save & Apply Scope'}));

    await waitFor(() => expect(onSaveScope).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a new Deck form intact when persistence fails', async () => {
    const onCreateDeck = vi.fn().mockResolvedValue(false);
    render(React.createElement(DecksAndTagsView, {
      decks: [],
      tags: [],
      words: [],
      onCreateDeck,
      onCreateTag: vi.fn().mockResolvedValue(false),
    }));
    const nameInput = screen.getByPlaceholderText('Tên Deck (e.g. TOEFL 900)');
    fireEvent.change(nameInput, {target: {value: 'IELTS'}});

    fireEvent.click(screen.getByRole('button', {name: 'Tạo Deck'}));

    await waitFor(() => expect(onCreateDeck).toHaveBeenCalledOnce());
    expect(nameInput).toHaveValue('IELTS');
  });

  it('keeps the add-word view open when private-word persistence fails', async () => {
    const onAddWord = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(React.createElement(AddWordModal, {
      decks: [],
      tags: [],
      globalWords: [],
      linkedGlobalWords: [],
      onAddWord,
      onLinkExistingGlobalWord: vi.fn().mockResolvedValue(false),
      onClose,
    }));
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'moonshot'},
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Giao thông vận tải'), {
      target: {value: 'mục tiêu tham vọng'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
  });
});
