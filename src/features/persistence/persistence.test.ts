import {beforeEach, describe, expect, it, vi} from 'vitest';
import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {INITIAL_SETTINGS} from '../../data/mockData';
import {AddWordModal} from '../../components/AddWordModal';
import {DecksAndTagsView} from '../../components/DecksAndTagsView';
import {StudyScopeModal} from '../../components/StudyScopeModal';
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

import {saveSettings, saveStudyScope} from './settingsRepository';
import {saveDeck, saveTag, saveWordStatus} from './vocabularyRepository';

describe('persistence mappers', () => {
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
    })).toEqual({
      newWordsPerDay: 12,
      reviewLimitPerDay: 60,
      hintBehavior: 'manual',
      audioAutoplay: true,
      theme: 'dark',
      language: 'en',
      reducedMotion: true,
      charDiffAccessibility: true,
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
        status: 'rejected',
        admin_comment: 'Cần bổ sung nghĩa.',
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
      approvalStatus: 'rejected',
      rejectionReason: 'Cần bổ sung nghĩa.',
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

describe('persisted form callbacks', () => {
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
      existingWords: [],
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
