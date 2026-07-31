import type {CsvRowRaw} from '../../types';
import type {Word} from '../../types';

export function buildImportedWord(
  row: CsvRowRaw,
  finalMeaning = row.vietnameseMeaning,
): Word {
  const wordId = `word_csv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const meaningCardId = `meaning_csv_${Date.now()}`;
  const wordParts = [];
  let order = 1;
  if (row.prefix) wordParts.push({id: `wp_p_${order}`, text: row.prefix, type: 'prefix' as const, order: order++});
  if (row.root) wordParts.push({id: `wp_r_${order}`, text: row.root, type: 'root' as const, order: order++});
  if (row.suffix) wordParts.push({id: `wp_s_${order}`, text: row.suffix, type: 'suffix' as const, order: order++});

  return {
    id: wordId,
    word: row.word.toLowerCase(),
    ipa: row.ipa ?? `/${row.word.toLowerCase()}/`,
    wordStructure: wordParts,
    wordFamily: [row.word.toLowerCase()],
    isGlobal: false,
    approvalStatus: 'pending',
    createdBy: 'user_csv_import',
    createdAt: new Date().toISOString().split('T')[0],
    deckId: '',
    tags: [],
    status: 'active',
    meanings: [{
      id: meaningCardId,
      wordId,
      meaning: finalMeaning,
      partOfSpeech: row.partOfSpeech || 'noun',
      memoryStrength: 'critical',
      memoryScore: 20,
      reviewIntervalDays: 1,
      nextReviewDate: new Date().toISOString().split('T')[0],
      firstAttemptErrorRate: 0,
      forgottenWordParts: [],
      history: [],
      exampleSentences: [{
        id: `ex_csv_${Date.now()}`,
        meaningCardId,
        sentence: row.exampleSentence || `Example sentence containing ${row.word}.`,
        expectedAnswer: row.word,
        baseWord: row.word,
        wordForm: 'base',
        partOfSpeech: row.partOfSpeech || 'noun',
        difficulty: 'medium',
        approvalStatus: 'pending',
      }],
    }],
  };
}
