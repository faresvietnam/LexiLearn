import { Deck, Tag, Word, UserSettings, StudyScope } from '../types';

export const INITIAL_DECKS: Deck[] = [
  {
    id: 'deck_general',
    name: 'General Vocabulary',
    description: 'Từ vựng tiếng Anh giao tiếp thông dụng hàng ngày',
    isDefault: true,
    color: '#3B82F6', // blue
    createdAt: '2026-01-01',
  },
  {
    id: 'deck_academic',
    name: 'Academic & IELTS',
    description: 'Từ vựng học thuật, IELTS Reading & Writing',
    color: '#8B5CF6', // purple
    createdAt: '2026-01-05',
  },
  {
    id: 'deck_business',
    name: 'Business English',
    description: 'Thương mại, kinh tế và môi trường công sở',
    color: '#10B981', // green
    createdAt: '2026-01-10',
  },
];

export const INITIAL_TAGS: Tag[] = [
  { id: 'tag_ielts', name: 'IELTS 7.0+', color: '#EF4444' },
  { id: 'tag_prefix', name: 'Prefix: Trans/Pre/Re', color: '#F59E0B' },
  { id: 'tag_root', name: 'Root: Port/Dict/Struct', color: '#10B981' },
  { id: 'tag_daily', name: 'Daily Life', color: '#3B82F6' },
  { id: 'tag_business', name: 'Business', color: '#6366F1' },
];

export const INITIAL_STUDY_SCOPE: StudyScope = {
  activeDeckIds: ['deck_general', 'deck_academic', 'deck_business'],
  excludedTagIds: [],
  pausedWordIds: [],
};

export const INITIAL_SETTINGS: UserSettings = {
  newWordsPerDay: 10,
  reviewLimitPerDay: 40,
  hintBehavior: 'auto',
  audioAutoplay: true,
  theme: 'light',
  language: 'vi',
  reducedMotion: false,
  charDiffAccessibility: true,
  geminiApiKey: null,
};

export const INITIAL_WORDS: Word[] = [
  {
    id: 'word_bank',
    word: 'bank',
    ipa: '/bæŋk/',
    audioUrl: 'https://actions.google.com/sounds/v1/speech/bank.ogg',
    imageUrl: 'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=600&auto=format&fit=crop&q=80',
    wordStructure: [
      { id: 'part_bank_1', text: 'bank', type: 'root', meaning: 'bank / slope', order: 1 }
    ],
    wordFamily: ['banking', 'banker'],
    isGlobal: true,
    approvalStatus: 'approved',
    createdBy: 'system',
    createdAt: '2026-01-01',
    deckId: 'deck_general',
    tags: ['tag_daily'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_bank_1',
        wordId: 'word_bank',
        meaning: 'Ngân hàng (tổ chức tài chính)',
        partOfSpeech: 'noun',
        memoryStrength: 'stable',
        memoryScore: 78,
        reviewIntervalDays: 4,
        nextReviewDate: '2026-07-28', // overdue
        firstAttemptErrorRate: 15,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [
          {
            id: 'ex_bank_1',
            meaningCardId: 'meaning_bank_1',
            sentence: 'I need to go to the _____ to deposit some cash.',
            expectedAnswer: 'bank',
            baseWord: 'bank',
            wordForm: 'base',
            partOfSpeech: 'noun',
            difficulty: 'easy',
            approvalStatus: 'approved',
          }
        ]
      },
      {
        id: 'meaning_bank_2',
        wordId: 'word_bank',
        meaning: 'Bờ sông, bờ đê',
        partOfSpeech: 'noun',
        memoryStrength: 'weak',
        memoryScore: 42,
        reviewIntervalDays: 2,
        nextReviewDate: '2026-07-29', // today
        firstAttemptErrorRate: 35,
        forgottenWordParts: ['bank'],
        history: [
          { id: 'h_b2_1', date: '2026-07-22', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 2, hintLevelUsed: 1, responseTimeMs: 2900, errorTypes: ['context'] }
        ],
        exampleSentences: [
          {
            id: 'ex_bank_2',
            meaningCardId: 'meaning_bank_2',
            sentence: 'They sat on the grassy _____ of the river enjoying the sun.',
            expectedAnswer: 'bank',
            baseWord: 'bank',
            wordForm: 'base',
            partOfSpeech: 'noun',
            difficulty: 'medium',
            approvalStatus: 'approved',
          }
        ]
      },
      {
        id: 'meaning_bank_3',
        wordId: 'word_bank',
        meaning: 'Nghiêng sang một bên (máy bay khi lượn vòng)',
        partOfSpeech: 'verb',
        memoryStrength: 'critical',
        memoryScore: 20,
        reviewIntervalDays: 1,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 60,
        forgottenWordParts: ['bank'],
        history: [
          { id: 'h_b3_1', date: '2026-07-20', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 3, hintLevelUsed: 2, responseTimeMs: 4500, errorTypes: ['spelling'] },
          { id: 'h_b3_2', date: '2026-07-25', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 2, hintLevelUsed: 1, responseTimeMs: 3800, errorTypes: ['meaning'] }
        ],
        exampleSentences: [
          {
            id: 'ex_bank_3',
            meaningCardId: 'meaning_bank_3',
            sentence: 'The airplane began to _____ steeply to the left before landing.',
            expectedAnswer: 'bank',
            baseWord: 'bank',
            wordForm: 'base',
            partOfSpeech: 'verb',
            difficulty: 'hard',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_transportation',
    word: 'transportation',
    ipa: '/ˌtrænspərˈteɪʃn/',
    imageUrl: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=600&auto=format&fit=crop&q=80',
    wordStructure: [
      { id: 'wp_1', text: 'trans', type: 'prefix', meaning: 'across, beyond', order: 1 },
      { id: 'wp_2', text: 'port', type: 'root', meaning: 'carry, bear', order: 2 },
      { id: 'wp_3', text: 'ation', type: 'suffix', meaning: 'action or process, noun forming', order: 3 }
    ],
    wordFamily: ['transport', 'transporter', 'transportable'],
    isGlobal: true,
    approvalStatus: 'approved',
    createdBy: 'system',
    createdAt: '2026-01-02',
    deckId: 'deck_academic',
    tags: ['tag_ielts', 'tag_prefix', 'tag_root'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_transportation_1',
        wordId: 'word_transportation',
        meaning: 'Giao thông vận tải, sự vận chuyển',
        partOfSpeech: 'noun',
        memoryStrength: 'critical',
        memoryScore: 22,
        reviewIntervalDays: 1,
        nextReviewDate: '2026-07-28', // overdue
        firstAttemptErrorRate: 48,
        forgottenWordParts: ['trans', 'ation'],
        history: [
          { id: 'h_tr_1', date: '2026-07-18', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 2, hintLevelUsed: 1, responseTimeMs: 4100, errorTypes: ['prefix'] },
          { id: 'h_tr_2', date: '2026-07-24', stage: 2, isFirstAttemptCorrect: false, attemptsCount: 2, hintLevelUsed: 2, responseTimeMs: 5000, errorTypes: ['suffix'] }
        ],
        exampleSentences: [
          {
            id: 'ex_trans_1',
            meaningCardId: 'meaning_transportation_1',
            sentence: 'Public _____ is clean, efficient, and affordable in this city.',
            expectedAnswer: 'transportation',
            baseWord: 'transportation',
            wordForm: 'noun',
            partOfSpeech: 'noun',
            difficulty: 'medium',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_predictable',
    word: 'predictable',
    ipa: '/prɪˈdɪktəbl/',
    imageUrl: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&auto=format&fit=crop&q=80',
    wordStructure: [
      { id: 'wp_p1', text: 'pre', type: 'prefix', meaning: 'before, earlier', order: 1 },
      { id: 'wp_p2', text: 'dict', type: 'root', meaning: 'say, speak', order: 2 },
      { id: 'wp_p3', text: 'able', type: 'suffix', meaning: 'capable of being, adjective forming', order: 3 }
    ],
    wordFamily: ['predict', 'prediction', 'predictability', 'unpredictable'],
    isGlobal: true,
    approvalStatus: 'approved',
    createdBy: 'system',
    createdAt: '2026-01-05',
    deckId: 'deck_academic',
    tags: ['tag_prefix', 'tag_root'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_predictable_1',
        wordId: 'word_predictable',
        meaning: 'Có thể đoán trước, dễ đoán',
        partOfSpeech: 'adjective',
        memoryStrength: 'weak',
        memoryScore: 38,
        reviewIntervalDays: 2,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 30,
        forgottenWordParts: ['dict'],
        history: [
          { id: 'h_pr_1', date: '2026-07-21', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 2, hintLevelUsed: 1, responseTimeMs: 3200, errorTypes: ['root'] }
        ],
        exampleSentences: [
          {
            id: 'ex_pred_1',
            meaningCardId: 'meaning_predictable_1',
            sentence: 'The ending of the movie was completely _____ and unexciting.',
            expectedAnswer: 'predictable',
            baseWord: 'predictable',
            wordForm: 'adjective',
            partOfSpeech: 'adjective',
            difficulty: 'easy',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_reconstruction',
    word: 'reconstruction',
    ipa: '/ˌriːkənˈstrʌkʃn/',
    imageUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&auto=format&fit=crop&q=80',
    wordStructure: [
      { id: 'wp_r1', text: 're', type: 'prefix', meaning: 'again, back', order: 1 },
      { id: 'wp_r2', text: 'con', type: 'prefix', meaning: 'together, with', order: 2 },
      { id: 'wp_r3', text: 'struct', type: 'root', meaning: 'build', order: 3 },
      { id: 'wp_r4', text: 'ion', type: 'suffix', meaning: 'act, process or result of', order: 4 }
    ],
    wordFamily: ['construct', 'structure', 'reconstruct', 'constructive'],
    isGlobal: true,
    approvalStatus: 'approved',
    createdBy: 'system',
    createdAt: '2026-01-08',
    deckId: 'deck_academic',
    tags: ['tag_ielts', 'tag_root'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_reconstruction_1',
        wordId: 'word_reconstruction',
        meaning: 'Sự tái thiết, sự xây dựng lại',
        partOfSpeech: 'noun',
        memoryStrength: 'strong',
        memoryScore: 92,
        reviewIntervalDays: 14,
        nextReviewDate: '2026-08-10',
        firstAttemptErrorRate: 8,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [
          {
            id: 'ex_recon_1',
            meaningCardId: 'meaning_reconstruction_1',
            sentence: 'The post-war _____ of the city took over two decades to complete.',
            expectedAnswer: 'reconstruction',
            baseWord: 'reconstruction',
            wordForm: 'noun',
            partOfSpeech: 'noun',
            difficulty: 'hard',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_invaluable',
    word: 'invaluable',
    ipa: '/ɪnˈvæljuəbl/',
    wordStructure: [
      { id: 'wp_i1', text: 'in', type: 'prefix', meaning: 'not / intensive', order: 1 },
      { id: 'wp_i2', text: 'valu', type: 'root', meaning: 'worth, value', order: 2 },
      { id: 'wp_i3', text: 'able', type: 'suffix', meaning: 'capable of', order: 3 }
    ],
    wordFamily: ['value', 'valuable', 'valuation'],
    isGlobal: true,
    approvalStatus: 'approved',
    createdBy: 'system',
    createdAt: '2026-01-12',
    deckId: 'deck_business',
    tags: ['tag_business', 'tag_ielts'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_invaluable_1',
        wordId: 'word_invaluable',
        meaning: 'Vô giá, cực kỳ quý báu (giá trị rất lớn)',
        partOfSpeech: 'adjective',
        memoryStrength: 'stable',
        memoryScore: 75,
        reviewIntervalDays: 5,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 18,
        forgottenWordParts: ['in'],
        history: [],
        exampleSentences: [
          {
            id: 'ex_inv_1',
            meaningCardId: 'meaning_invaluable_1',
            sentence: 'Her expert advice was _____ during the contract negotiations.',
            expectedAnswer: 'invaluable',
            baseWord: 'invaluable',
            wordForm: 'adjective',
            partOfSpeech: 'adjective',
            difficulty: 'medium',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  // Private words are immediately studyable; FSRS state controls learning progress.
  {
    id: 'word_misunderstand',
    word: 'misunderstand',
    ipa: '/ˌmɪsʌndərˈstænd/',
    wordStructure: [
      { id: 'wp_m1', text: 'mis', type: 'prefix', meaning: 'wrong, badly', order: 1 },
      { id: 'wp_m2', text: 'under', type: 'prefix', meaning: 'below, beneath', order: 2 },
      { id: 'wp_m3', text: 'stand', type: 'root', meaning: 'stand, remain', order: 3 }
    ],
    wordFamily: ['understand', 'misunderstanding'],
    isGlobal: false,
    approvalStatus: 'approved',
    createdBy: 'user_learner',
    createdAt: '2026-07-28',
    deckId: 'deck_general',
    tags: ['tag_daily'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_misunderstand_1',
        wordId: 'word_misunderstand',
        meaning: 'Hiểu lầm, hiểu sai ý',
        partOfSpeech: 'verb',
        memoryStrength: 'weak',
        memoryScore: 30,
        reviewIntervalDays: 1,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 40,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [
          {
            id: 'ex_mis_1',
            meaningCardId: 'meaning_misunderstand_1',
            sentence: 'Please don\'t _____ my intentions; I am trying to help.',
            expectedAnswer: 'misunderstand',
            baseWord: 'misunderstand',
            wordForm: 'base',
            partOfSpeech: 'verb',
            difficulty: 'easy',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_unprecedented',
    word: 'unprecedented',
    ipa: '/ʌnˈpresɪdentɪd/',
    wordStructure: [
      { id: 'wp_u1', text: 'un', type: 'prefix', meaning: 'not', order: 1 },
      { id: 'wp_u2', text: 'pre', type: 'prefix', meaning: 'before', order: 2 },
      { id: 'wp_u3', text: 'ced', type: 'root', meaning: 'go, yield', order: 3 },
      { id: 'wp_u4', text: 'ent', type: 'suffix', meaning: 'forming adjective/noun', order: 4 },
      { id: 'wp_u5', text: 'ed', type: 'suffix', meaning: 'past participle suffix', order: 5 }
    ],
    wordFamily: ['precedent', 'precede'],
    isGlobal: false,
    approvalStatus: 'approved',
    createdBy: 'user_learner',
    createdAt: '2026-07-27',
    deckId: 'deck_academic',
    tags: ['tag_ielts'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_unprecedented_1',
        wordId: 'word_unprecedented',
        meaning: 'Chưa từng có tiền lệ, chưa từng xảy ra',
        partOfSpeech: 'adjective',
        memoryStrength: 'critical',
        memoryScore: 15,
        reviewIntervalDays: 1,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 65,
        forgottenWordParts: ['ced'],
        history: [
          { id: 'h_un_1', date: '2026-07-22', stage: 1, isFirstAttemptCorrect: false, attemptsCount: 3, hintLevelUsed: 2, responseTimeMs: 6200, errorTypes: ['spelling', 'root'] }
        ],
        exampleSentences: [
          {
            id: 'ex_unp_1',
            meaningCardId: 'meaning_unprecedented_1',
            sentence: 'The city faced an _____ economic challenge following the storm.',
            expectedAnswer: 'unprecedented',
            baseWord: 'unprecedented',
            wordForm: 'adjective',
            partOfSpeech: 'adjective',
            difficulty: 'hard',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  },
  {
    id: 'word_hyperactive',
    word: 'hyperactive',
    ipa: '/ˌhaɪpərˈæktɪv/',
    wordStructure: [
      { id: 'wp_h1', text: 'hyper', type: 'prefix', meaning: 'over, above, excessive', order: 1 },
      { id: 'wp_h2', text: 'act', type: 'root', meaning: 'do, drive', order: 2 },
      { id: 'wp_h3', text: 'ive', type: 'suffix', meaning: 'expressing function or condition', order: 3 }
    ],
    wordFamily: ['activity', 'activate', 'hyperactivity'],
    isGlobal: false,
    approvalStatus: 'approved',
    rejectionReason: 'Thiếu ví dụ câu ngữ cảnh tiêu chuẩn và cấu trúc từ chưa rõ ràng.',
    createdBy: 'user_learner',
    createdAt: '2026-07-25',
    deckId: 'deck_general',
    tags: ['tag_daily'],
    status: 'active',
    meanings: [
      {
        id: 'meaning_hyperactive_1',
        wordId: 'word_hyperactive',
        meaning: 'Hiếu động quá mức, tăng động',
        partOfSpeech: 'adjective',
        memoryStrength: 'weak',
        memoryScore: 40,
        reviewIntervalDays: 2,
        nextReviewDate: '2026-07-29',
        firstAttemptErrorRate: 30,
        forgottenWordParts: [],
        history: [],
        exampleSentences: [
          {
            id: 'ex_hyp_1',
            meaningCardId: 'meaning_hyperactive_1',
            sentence: 'The puppy is extremely _____ in the morning.',
            expectedAnswer: 'hyperactive',
            baseWord: 'hyperactive',
            wordForm: 'adjective',
            partOfSpeech: 'adjective',
            difficulty: 'easy',
            approvalStatus: 'approved',
          }
        ]
      }
    ]
  }
];
