import {getSupabaseClient} from '../../lib/supabase';
import {Deck, Tag, Word, WordStudyStatus} from '../../types';
import {
  DeckRow,
  mapDeckRow,
  mapSettingsRow,
  mapStudyScopeRow,
  mapTagRow,
  mapVocabularyRow,
  SettingsRow,
  StudyScopeRow,
  TagRow,
  VocabularyRow,
} from './mappers';
import {PersistenceResult} from './settingsRepository';

export type LearnerState = {
  settings: ReturnType<typeof mapSettingsRow>;
  studyScope: ReturnType<typeof mapStudyScopeRow>;
  decks: Deck[];
  tags: Tag[];
  words: Word[];
  globalWords: Array<Pick<Word, 'id' | 'word' | 'ipa'>>;
};

const LOAD_ERROR = 'Không thể tải dữ liệu học tập. Vui lòng thử lại.';
const DECK_ERROR = 'Không thể lưu Deck. Vui lòng thử lại.';
const TAG_ERROR = 'Không thể lưu Tag. Vui lòng thử lại.';
const STATUS_ERROR = 'Không thể cập nhật trạng thái từ. Vui lòng thử lại.';
const MOVE_ERROR = 'Không thể chuyển từ sang Deck. Vui lòng thử lại.';
const WORD_ERROR = 'Không thể lưu từ vựng. Vui lòng thử lại.';
const LINK_ERROR = 'Không thể liên kết từ Global. Vui lòng thử lại.';

const VOCABULARY_SELECT = `
  id, deck_id, study_status, added_at,
  personal_word_tags(tag_id),
  learning_cards(
    id, meaning_source_id, memory_strength, memory_score,
    review_interval_days, next_review_at, last_reviewed_at
  ),
  global_words(
    id, word, ipa, audio_url, image_url, status,
    created_by_admin_id, created_at,
    word_parts(id, text, type, meaning, position),
    global_meanings(
      id, meaning_vi, part_of_speech, display_order, status,
      global_examples(
        id, sentence, expected_answer, word_form, difficulty, status
      )
    )
  ),
  private_words(
    id, owner_user_id, word, ipa, audio_url, image_url,
    status, admin_comment, created_at,
    private_meanings(id, meaning_vi, part_of_speech, display_order)
  )
`;

export async function loadLearnerState(
  userId: string,
): Promise<PersistenceResult<LearnerState>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: LOAD_ERROR};

  const [
    settingsResult,
    scopeResult,
    decksResult,
    tagsResult,
    wordsResult,
    globalWordsResult,
  ] =
    await Promise.all([
      client
        .from('user_settings')
        .select(`
          user_id, new_words_per_day, review_limit_per_day, hint_behavior,
          audio_autoplay, theme, language, reduced_motion,
          char_diff_accessibility, gemini_api_key
        `)
        .eq('user_id', userId)
        .single(),
      client
        .from('study_scope')
        .select('user_id, active_deck_ids, excluded_tag_ids, paused_word_ids')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('decks')
        .select('id, name, description, color, is_default, created_at')
        .eq('user_id', userId)
        .order('created_at'),
      client
        .from('tags')
        .select('id, name, color')
        .eq('user_id', userId)
        .order('created_at'),
      client
        .from('personal_vocabulary')
        .select(VOCABULARY_SELECT)
        .eq('user_id', userId)
        .order('added_at', {ascending: false}),
      client
        .from('global_words')
        .select('id, word, ipa')
        .eq('status', 'active')
        .order('word'),
    ]);

  if (
    settingsResult.error
    || scopeResult.error
    || decksResult.error
    || tagsResult.error
    || wordsResult.error
    || globalWordsResult.error
    || !settingsResult.data
  ) {
    return {data: null, error: LOAD_ERROR};
  }

  const vocabularyRows =
    wordsResult.data as unknown as VocabularyRow[] | null ?? [];
  const words = vocabularyRows
    .map(mapVocabularyRow)
    .filter((word): word is Word => Boolean(word));
  const linkedGlobalWordIds = new Set(
    vocabularyRows.flatMap(({global_words}) =>
      global_words?.id ? [global_words.id] : []
    ),
  );
  const globalWords = (
    globalWordsResult.data as unknown as Array<{
      id: string;
      word: string;
      ipa: string | null;
    }> | null ?? []
  )
    .filter(({id}) => !linkedGlobalWordIds.has(id))
    .map(({id, word, ipa}) => ({
      id,
      word,
      ...(ipa ? {ipa} : {}),
    }));

  return {
    data: {
      settings: mapSettingsRow(settingsResult.data as unknown as SettingsRow),
      studyScope: mapStudyScopeRow(
        scopeResult.data as unknown as StudyScopeRow | null,
      ),
      decks: (decksResult.data as unknown as DeckRow[] | null ?? [])
        .map(mapDeckRow),
      tags: (tagsResult.data as unknown as TagRow[] | null ?? [])
        .map(mapTagRow),
      words,
      globalWords,
    },
    error: null,
  };
}

export async function saveDeck(
  userId: string,
  deck: Deck,
): Promise<PersistenceResult<Deck>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: DECK_ERROR};

  const {data, error} = (await client
    .from('decks')
    .insert({
      user_id: userId,
      name: deck.name,
      description: deck.description ?? null,
      color: deck.color,
      is_default: deck.isDefault ?? false,
    })
    .select('id, name, description, color, is_default, created_at')
    .single()) as {data: DeckRow | null; error: unknown | null};

  return error || !data
    ? {data: null, error: DECK_ERROR}
    : {data: mapDeckRow(data), error: null};
}

export async function saveTag(
  userId: string,
  tag: Tag,
): Promise<PersistenceResult<Tag>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: TAG_ERROR};

  const {data, error} = (await client
    .from('tags')
    .insert({
      user_id: userId,
      name: tag.name,
      color: tag.color,
    })
    .select('id, name, color')
    .single()) as {data: TagRow | null; error: unknown | null};

  return error || !data
    ? {data: null, error: TAG_ERROR}
    : {data: mapTagRow(data), error: null};
}

export async function saveWordStatus(
  userId: string,
  vocabularyId: string,
  status: WordStudyStatus,
): Promise<PersistenceResult<WordStudyStatus>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: STATUS_ERROR};

  const {data, error} = await client
    .from('personal_vocabulary')
    .update({
      study_status: status,
      archived_at: status === 'archived' ? new Date().toISOString() : null,
    })
    .eq('id', vocabularyId)
    .eq('user_id', userId)
    .select('id')
    .single();

  return error || !data
    ? {data: null, error: STATUS_ERROR}
    : {data: status, error: null};
}

function containsExactly(
  expectedIds: string[],
  actualIds: string[],
): boolean {
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);
  return expected.size === actual.size
    && [...expected].every((id) => actual.has(id));
}

export async function saveWordStatuses(
  userId: string,
  vocabularyIds: string[],
  status: WordStudyStatus,
): Promise<PersistenceResult<string[]>> {
  const requestedIds = [...new Set(vocabularyIds)];
  if (requestedIds.length === 0) return {data: [], error: null};
  const client = getSupabaseClient();
  if (!client) return {data: null, error: STATUS_ERROR};

  const {data, error} = await client
    .from('personal_vocabulary')
    .update({
      study_status: status,
      archived_at: status === 'archived' ? new Date().toISOString() : null,
    })
    .in('id', requestedIds)
    .eq('user_id', userId)
    .select('id');
  const updatedIds = (data ?? []).map(({id}) => id);

  return error || !containsExactly(requestedIds, updatedIds)
    ? {data: null, error: STATUS_ERROR}
    : {data: requestedIds, error: null};
}

export async function moveWordsToDeck(
  userId: string,
  vocabularyIds: string[],
  deckId: string,
): Promise<PersistenceResult<string[]>> {
  if (vocabularyIds.length === 0) return {data: [], error: null};
  const client = getSupabaseClient();
  if (!client) return {data: null, error: MOVE_ERROR};

  const {data, error} = await client
    .from('personal_vocabulary')
    .update({deck_id: deckId})
    .in('id', vocabularyIds)
    .eq('user_id', userId)
    .select('id');
  const updatedIds = (data ?? []).map(({id}) => id);

  return error || !containsExactly(vocabularyIds, updatedIds)
    ? {data: null, error: MOVE_ERROR}
    : {data: updatedIds, error: null};
}

async function removePrivateWord(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  userId: string,
  privateWordId: string,
) {
  await client
    .from('private_words')
    .delete()
    .eq('id', privateWordId)
    .eq('owner_user_id', userId);
}

export async function createPrivateWord(
  userId: string,
  word: Word,
): Promise<PersistenceResult<Word>> {
  const client = getSupabaseClient();
  if (!client || word.meanings.length === 0) {
    return {data: null, error: WORD_ERROR};
  }

  const {data: privateWord, error: wordError} = await client
    .from('private_words')
    .insert({
      owner_user_id: userId,
      word: word.word,
      normalized_word: word.word.trim().toLowerCase(),
      ipa: word.ipa ?? null,
      audio_url: word.audioUrl ?? null,
      image_url: word.imageUrl ?? null,
      status: word.approvalStatus === 'rejected' ? 'rejected' : 'pending',
      admin_comment: word.rejectionReason ?? null,
    })
    .select(`
      id, owner_user_id, word, ipa, audio_url, image_url,
      status, admin_comment, created_at
    `)
    .single();

  if (wordError || !privateWord) return {data: null, error: WORD_ERROR};

  const {data: meanings, error: meaningError} = await client
    .from('private_meanings')
    .insert(word.meanings.map((meaning, displayOrder) => ({
      private_word_id: privateWord.id,
      meaning_vi: meaning.meaning,
      part_of_speech: meaning.partOfSpeech,
      display_order: displayOrder,
    })))
    .select('id, meaning_vi, part_of_speech, display_order');

  if (meaningError || !meanings) {
    await removePrivateWord(client, userId, privateWord.id);
    return {data: null, error: WORD_ERROR};
  }

  const {data: vocabulary, error: vocabularyError} = await client
    .from('personal_vocabulary')
    .insert({
      user_id: userId,
      private_word_id: privateWord.id,
      deck_id: word.deckId || null,
      study_status: word.status,
    })
    .select('id, deck_id, study_status, added_at')
    .single();

  if (vocabularyError || !vocabulary) {
    await removePrivateWord(client, userId, privateWord.id);
    return {data: null, error: WORD_ERROR};
  }

  if (word.tags.length > 0) {
    const {error} = await client.from('personal_word_tags').insert(
      word.tags.map((tagId) => ({
        personal_vocabulary_id: vocabulary.id,
        tag_id: tagId,
      })),
    );
    if (error) {
      await removePrivateWord(client, userId, privateWord.id);
      return {data: null, error: WORD_ERROR};
    }
  }

  const {data: cards, error: cardError} = await client
    .from('learning_cards')
    .insert(meanings.map((meaning) => ({
      user_id: userId,
      personal_vocabulary_id: vocabulary.id,
      meaning_source_id: meaning.id,
      meaning_source_type: 'private_meaning',
    })))
    .select(`
      id, meaning_source_id, memory_strength, memory_score,
      review_interval_days, next_review_at, last_reviewed_at
    `);

  if (cardError || !cards) {
    await removePrivateWord(client, userId, privateWord.id);
    return {data: null, error: WORD_ERROR};
  }

  const savedWord = mapVocabularyRow({
    id: vocabulary.id,
    deck_id: vocabulary.deck_id,
    study_status: vocabulary.study_status,
    added_at: vocabulary.added_at,
    personal_word_tags: word.tags.map((tag_id) => ({tag_id})),
    learning_cards: cards,
    global_words: null,
    private_words: {
      ...privateWord,
      private_meanings: meanings,
    },
  } as unknown as VocabularyRow);

  if (!savedWord) return {data: null, error: WORD_ERROR};

  return {
    data: {
      ...savedWord,
      wordStructure: word.wordStructure,
      wordFamily: word.wordFamily,
      meanings: savedWord.meanings.map((meaning, index) => ({
        ...meaning,
        exampleSentences: (word.meanings[index]?.exampleSentences ?? [])
          .map((example) => ({
            ...example,
            meaningCardId: meaning.id,
          })),
      })),
    },
    error: null,
  };
}

export async function linkGlobalWord(
  userId: string,
  globalWordId: string,
  deckId: string | null,
): Promise<PersistenceResult<Word>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: LINK_ERROR};

  const {data: vocabulary, error: linkError} = await client
    .from('personal_vocabulary')
    .upsert({
      user_id: userId,
      global_word_id: globalWordId,
      deck_id: deckId,
      study_status: 'active',
      archived_at: null,
    }, {onConflict: 'user_id,global_word_id'})
    .select('id')
    .single();

  if (linkError || !vocabulary) return {data: null, error: LINK_ERROR};

  const {data, error} = (await client
    .from('personal_vocabulary')
    .select(VOCABULARY_SELECT)
    .eq('id', vocabulary.id)
    .eq('user_id', userId)
    .single()) as {data: VocabularyRow | null; error: unknown | null};
  if (error || !data || !data.global_words) {
    return {data: null, error: LINK_ERROR};
  }

  const activeMeaningIds = (data.global_words.global_meanings ?? [])
    .filter(({status}) => status === 'active')
    .map(({id}) => id);
  const existingMeaningIds = new Set(
    (data.learning_cards ?? []).map(({meaning_source_id}) => meaning_source_id),
  );
  const missingMeaningIds = activeMeaningIds.filter(
    (meaningId) => !existingMeaningIds.has(meaningId),
  );
  let learningCards = data.learning_cards ?? [];

  if (missingMeaningIds.length > 0) {
    const {data: createdCards, error: cardError} = await client
      .from('learning_cards')
      .insert(missingMeaningIds.map((meaningId) => ({
        user_id: userId,
        personal_vocabulary_id: vocabulary.id,
        meaning_source_id: meaningId,
        meaning_source_type: 'global_meaning',
      })))
      .select(`
        id, meaning_source_id, memory_strength, memory_score,
        review_interval_days, next_review_at, last_reviewed_at
      `);
    const createdMeaningIds = (createdCards ?? [])
      .map(({meaning_source_id}) => meaning_source_id);
    if (
      cardError
      || !createdCards
      || !containsExactly(missingMeaningIds, createdMeaningIds)
    ) {
      return {data: null, error: LINK_ERROR};
    }
    learningCards = [...learningCards, ...createdCards];
  }

  const word = mapVocabularyRow({...data, learning_cards: learningCards});

  return !word
    ? {data: null, error: LINK_ERROR}
    : {data: word, error: null};
}
