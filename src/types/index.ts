export type UserRole = 'learner' | 'admin';

export type WordPartType =
  | 'prefix'
  | 'root'
  | 'base'
  | 'suffix'
  | 'combining_form'
  | 'compound_component';

export interface WordPart {
  id: string;
  text: string;
  type: WordPartType;
  meaning?: string;
  order: number;
}

export type MemoryStrength = 'critical' | 'weak' | 'stable' | 'strong';

export interface LearningHistoryItem {
  id: string;
  date: string;
  stage: number;
  isFirstAttemptCorrect: boolean;
  attemptsCount: number;
  hintLevelUsed: number;
  responseTimeMs: number;
  errorTypes: string[];
}

export interface ExampleSentence {
  id: string;
  meaningCardId: string;
  sentence: string; // e.g. "The goods were _____ by truck."
  expectedAnswer: string; // e.g. "transported"
  baseWord: string; // e.g. "transport"
  wordForm: string; // e.g. "past_tense"
  partOfSpeech: string; // e.g. "verb"
  difficulty: 'easy' | 'medium' | 'hard';
  approvalStatus: 'approved' | 'pending' | 'rejected';
}

export interface MeaningCard {
  id: string;
  wordId: string;
  meaning: string; // e.g. "vận chuyển, chuyển chở"
  partOfSpeech: string; // e.g. "verb"
  exampleSentences: ExampleSentence[];
  
  // Personal SRS State
  memoryStrength: MemoryStrength;
  memoryScore: number; // 0 to 100%
  reviewIntervalDays: number;
  nextReviewDate: string; // YYYY-MM-DD or ISO string
  lastReviewedDate?: string;
  firstAttemptErrorRate: number; // percentage
  forgottenWordParts: string[]; // e.g. ["trans", "ation"]
  history: LearningHistoryItem[];
}

export type WordApprovalStatus = 'draft' | 'pending' | 'rejected' | 'approved';
export type WordStudyStatus = 'active' | 'paused' | 'archived';

export interface Word {
  id: string;
  word: string; // normalized English word
  ipa?: string;
  audioUrl?: string;
  imageUrl?: string;
  wordStructure: WordPart[];
  wordFamily: string[];
  
  isGlobal: boolean; // Approved global vocabulary vs learner private word
  approvalStatus: WordApprovalStatus;
  rejectionReason?: string;
  createdBy: string; // user id or "system"
  createdAt: string;

  deckId: string;
  tags: string[];
  status: WordStudyStatus;

  meanings: MeaningCard[];
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  color: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface StudyScope {
  activeDeckIds: string[];
  excludedTagIds: string[];
  pausedWordIds: string[];
}

export interface UserSettings {
  newWordsPerDay: number;
  reviewLimitPerDay: number;
  hintBehavior: 'auto' | 'manual';
  audioAutoplay: boolean;
  theme: 'light' | 'dark' | 'system';
  language: 'vi' | 'en';
  reducedMotion: boolean;
  charDiffAccessibility: boolean;
}

export type QuestionStage =
  | 1 // Recognition (MC / Image / Sentence Completion)
  | 2 // Word-part Selection
  | 3 // Word-part Typing
  | 4 // Partial Assistance
  | 5; // Full-word Typing

export type QuestionType =
  | 'en_to_vn_mc'
  | 'vn_to_en_mc'
  | 'image_question'
  | 'sentence_completion'
  | 'word_part_selection'
  | 'word_part_typing'
  | 'full_word_typing';

export interface Question {
  id: string;
  word: Word;
  targetMeaningCard: MeaningCard;
  stage: QuestionStage;
  type: QuestionType;
  prompt: string;
  
  // Options for Multiple Choice
  mcOptions?: Array<{
    id: string;
    label: string;
    isCorrect: boolean;
    keyShortcut: string; // "1", "2", "3", "4"
  }>;

  // Parts for selection / typing
  wordParts?: WordPart[];
  
  // Example sentence context
  exampleSentence?: ExampleSentence;

  // Expected exact answer string or array of parts
  expectedAnswer: string;
}

export interface CharDiffToken {
  char: string;
  status: 'correct' | 'missing' | 'extra' | 'replaced' | 'transposed';
  expectedChar?: string;
  index: number;
}

export interface SessionStats {
  reviewsCompleted: number;
  newWordsLearned: number;
  firstAttemptAccuracy: number;
  studyTimeSeconds: number;
  retriesTotal: number;
  extraReviewMode: boolean;
}

export interface CsvRowRaw {
  word: string;
  vietnameseMeaning: string;
  partOfSpeech?: string;
  ipa?: string;
  deck?: string;
  tags?: string;
  prefix?: string;
  root?: string;
  suffix?: string;
  exampleSentence?: string;
}

export interface CsvImportConflict {
  word: string;
  field: string;
  existingValue: string;
  importedValue: string;
  resolution: 'keep' | 'use_imported';
}

export interface CsvImportReport {
  newWordsCount: number;
  existingLinkedCount: number;
  emptyFieldsFilledCount: number;
  conflictsResolvedCount: number;
  duplicateRowsRemovedCount: number;
  invalidRowsCount: number;
  rows: CsvRowRaw[];
  conflicts: CsvImportConflict[];
}
