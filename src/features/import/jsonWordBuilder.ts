import type {ExampleSentence, JsonWordInput, MeaningCard, Word, WordPart} from '../../types';

export function buildImportedWord(
  entry: JsonWordInput,
  deckId: string,
  tagIds: string[],
): Word {
  const normalizedWord = entry.word.trim().toLowerCase();
  const wordId = `word_json_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const wordStructure: WordPart[] = (entry.parts ?? []).map((part, index) => ({
    id: `wp_${wordId}_${index}`,
    text: part.text,
    type: part.type,
    order: index + 1,
    ...(part.meaning ? {meaning: part.meaning} : {}),
  }));

  const meanings: MeaningCard[] = entry.meanings.map((meaning, meaningIndex) => {
    const meaningCardId = `meaning_${wordId}_${meaningIndex}`;
    const exampleSentences: ExampleSentence[] = (meaning.examples ?? []).map((example, exampleIndex) => ({
      id: `ex_${meaningCardId}_${exampleIndex}`,
      meaningCardId,
      sentence: example.sentence,
      ...(example.sentence_vi ? {sentenceVi: example.sentence_vi} : {}),
      expectedAnswer: example.expected_answer || normalizedWord,
      baseWord: normalizedWord,
      wordForm: example.word_form || 'base',
      partOfSpeech: meaning.part_of_speech,
      difficulty: example.difficulty || 'medium',
      approvalStatus: 'approved',
    }));

    return {
      id: meaningCardId,
      wordId,
      meaning: meaning.meaning_vi,
      partOfSpeech: meaning.part_of_speech,
      ...(meaning.definition_en ? {definitionEn: meaning.definition_en} : {}),
      memoryStrength: 'critical',
      memoryScore: 20,
      reviewIntervalDays: 1,
      nextReviewDate: new Date().toISOString().split('T')[0],
      firstAttemptErrorRate: 0,
      forgottenWordParts: [],
      history: [],
      exampleSentences,
    };
  });

  return {
    id: wordId,
    word: normalizedWord,
    ...(entry.ipa ? {ipa: entry.ipa} : {}),
    ...(entry.audio_url ? {audioUrl: entry.audio_url} : {}),
    ...(entry.image_url ? {imageUrl: entry.image_url} : {}),
    wordStructure,
    wordFamily: [normalizedWord],
    isGlobal: false,
    approvalStatus: 'approved',
    createdBy: 'user_json_import',
    createdAt: new Date().toISOString().split('T')[0],
    deckId,
    tags: tagIds,
    status: entry.study_status ?? 'active',
    meanings,
  };
}
