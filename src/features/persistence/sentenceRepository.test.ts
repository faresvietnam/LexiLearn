import {beforeEach, describe, expect, it, vi} from 'vitest';

function chain(result: {data: unknown; error: unknown}) {
  const builder: any = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'order'].forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: typeof result) => void) => resolve(result);
  return builder;
}

const {getSupabaseClient, from} = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {
  createSentenceCard,
  deleteSentenceCard,
  loadSentenceCards,
  submitSentenceReview,
  updateSentenceCard,
} from './sentenceRepository';

const SENTENCE_ROW = {
  id: 'sentence-1',
  image_url: 'https://images.example/s1.png',
  image_object_key: 'users/user-1/images/s1.png',
  english_sentence: 'The cat sleeps.',
  vietnamese_sentence: 'Con mèo đang ngủ.',
  created_at: '2026-08-10T00:00:00.000Z',
  next_review_at: '2026-08-10T00:00:00.000Z',
  last_reviewed_at: null,
  review_interval_days: 0,
  fsrs_state_version: 1,
  fsrs_state: 0,
  fsrs_stability: 0,
  fsrs_difficulty: 0,
  fsrs_elapsed_days: 0,
  fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0,
  fsrs_reps: 0,
  fsrs_lapses: 0,
  fsrs_retrievability: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseClient.mockReturnValue({from});
});

describe('loadSentenceCards', () => {
  it('maps rows for the owner', async () => {
    from.mockReturnValue(chain({data: [SENTENCE_ROW], error: null}));
    const result = await loadSentenceCards('user-1');
    expect(from).toHaveBeenCalledWith('sentence_cards');
    expect(result.data).toEqual([expect.objectContaining({
      id: 'sentence-1',
      englishSentence: 'The cat sleeps.',
      vietnameseSentence: 'Con mèo đang ngủ.',
    })]);
  });

  it('errors when there is no Supabase session', async () => {
    getSupabaseClient.mockReturnValue(null);
    const result = await loadSentenceCards('user-1');
    expect(result).toEqual({data: null, error: expect.any(String)});
  });
});

describe('createSentenceCard', () => {
  it('inserts a trimmed row scoped to the owner', async () => {
    const builder = chain({data: SENTENCE_ROW, error: null});
    from.mockReturnValue(builder);

    const result = await createSentenceCard('user-1', {
      imageUrl: 'https://images.example/s1.png',
      imageObjectKey: 'users/user-1/images/s1.png',
      englishSentence: '  The cat sleeps.  ',
      vietnameseSentence: '  Con mèo đang ngủ.  ',
    });

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_user_id: 'user-1',
      english_sentence: 'The cat sleeps.',
      vietnamese_sentence: 'Con mèo đang ngủ.',
    }));
    expect(result.data?.id).toBe('sentence-1');
  });
});

describe('updateSentenceCard', () => {
  it('updates sentence and image fields scoped to the owner', async () => {
    const builder = chain({data: SENTENCE_ROW, error: null});
    from.mockReturnValue(builder);

    await updateSentenceCard('user-1', 'sentence-1', {
      imageUrl: 'https://images.example/s2.png',
      imageObjectKey: 'users/user-1/images/s2.png',
      englishSentence: 'The cat sleeps well.',
      vietnameseSentence: 'Con mèo ngủ ngon.',
    });

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      image_object_key: 'users/user-1/images/s2.png',
      english_sentence: 'The cat sleeps well.',
    }));
    expect(builder.eq).toHaveBeenCalledWith('id', 'sentence-1');
    expect(builder.eq).toHaveBeenCalledWith('owner_user_id', 'user-1');
  });
});

describe('deleteSentenceCard', () => {
  it('deletes the row scoped to the owner', async () => {
    from.mockReturnValue(chain({data: [{id: 'sentence-1'}], error: null}));
    const result = await deleteSentenceCard('user-1', 'sentence-1');
    expect(result).toEqual({data: true, error: null});
  });

  it('errors when nothing was deleted', async () => {
    from.mockReturnValue(chain({data: [], error: null}));
    const result = await deleteSentenceCard('user-1', 'sentence-1');
    expect(result.data).toBeNull();
  });
});

describe('submitSentenceReview', () => {
  it('reads the FSRS row, schedules it, and persists only schedule columns', async () => {
    const readBuilder = chain({data: SENTENCE_ROW, error: null});
    const updateBuilder = chain({
      data: {...SENTENCE_ROW, fsrs_state: 1, fsrs_reps: 1},
      error: null,
    });
    from.mockReturnValueOnce(readBuilder).mockReturnValueOnce(updateBuilder);

    const result = await submitSentenceReview(
      'user-1',
      'sentence-1',
      'Good',
      new Date('2026-08-10T00:00:00.000Z'),
    );

    expect(updateBuilder.update).toHaveBeenCalledOnce();
    const persistedPayload = updateBuilder.update.mock.calls[0][0];
    expect(persistedPayload).toHaveProperty('fsrs_reps');
    expect(persistedPayload).not.toHaveProperty('memory_score');
    expect(persistedPayload).not.toHaveProperty('memory_strength');
    expect(persistedPayload).not.toHaveProperty('recognition_score');
    expect(result.data?.fsrsReps).toBe(1);
  });
});
