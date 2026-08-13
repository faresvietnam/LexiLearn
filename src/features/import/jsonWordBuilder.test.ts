import {describe, expect, it} from 'vitest';
import {buildImportedWord} from './jsonWordBuilder';

describe('buildImportedWord', () => {
  it('builds a studyable private word with every optional field populated', () => {
    const word = buildImportedWord({
      word: 'Transportation',
      ipa: '/ˌtrænspɔːrˈteɪʃn/',
      audio_url: 'https://example.com/run.mp3',
      image_url: 'https://example.com/run.png',
      study_status: 'paused',
      meanings: [{
        meaning_vi: 'giao thông vận tải',
        part_of_speech: 'noun',
        definition_en: 'the movement of people or goods',
        examples: [{
          sentence: 'Public transportation is convenient.',
          sentence_vi: 'Giao thông công cộng rất tiện lợi.',
          expected_answer: 'transportation',
          word_form: 'base',
          difficulty: 'easy',
        }],
      }],
      parts: [
        {text: 'trans', type: 'prefix'},
        {text: 'port', type: 'root', meaning: 'chở'},
      ],
    }, 'deck-1', ['tag-1', 'tag-2']);

    expect(word).toMatchObject({
      word: 'transportation',
      ipa: '/ˌtrænspɔːrˈteɪʃn/',
      audioUrl: 'https://example.com/run.mp3',
      imageUrl: 'https://example.com/run.png',
      isGlobal: false,
      approvalStatus: 'approved',
      status: 'paused',
      deckId: 'deck-1',
      tags: ['tag-1', 'tag-2'],
    });
    expect(word.meanings).toMatchObject([{
      meaning: 'giao thông vận tải',
      partOfSpeech: 'noun',
      definitionEn: 'the movement of people or goods',
    }]);
    expect(word.meanings[0].exampleSentences).toMatchObject([{
      sentence: 'Public transportation is convenient.',
      sentenceVi: 'Giao thông công cộng rất tiện lợi.',
      expectedAnswer: 'transportation',
      wordForm: 'base',
      difficulty: 'easy',
    }]);
    expect(word.wordStructure).toMatchObject([
      {text: 'trans', type: 'prefix', order: 1},
      {text: 'port', type: 'root', meaning: 'chở', order: 2},
    ]);
  });

  it('omits optional fields entirely instead of inventing values', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}],
    }, '', []);

    expect(word.ipa).toBeUndefined();
    expect(word.audioUrl).toBeUndefined();
    expect(word.imageUrl).toBeUndefined();
    expect(word.status).toBe('active');
    expect(word.wordStructure).toEqual([]);
    expect(word.meanings[0].exampleSentences).toEqual([]);
    expect(word.meanings[0].definitionEn).toBeUndefined();
  });

  it('defaults an example missing expected_answer/word_form/difficulty', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [{
        meaning_vi: 'chạy',
        part_of_speech: 'verb',
        examples: [{sentence: 'I run every morning.'}],
      }],
    }, '', []);

    expect(word.meanings[0].exampleSentences[0]).toMatchObject({
      expectedAnswer: 'run',
      wordForm: 'base',
      difficulty: 'medium',
    });
    expect(word.meanings[0].exampleSentences[0].sentenceVi).toBeUndefined();
  });

  it('builds multiple meanings, each with its own examples', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [
        {meaning_vi: 'chạy', part_of_speech: 'verb', examples: [{sentence: 'I run.'}]},
        {meaning_vi: 'đường chạy', part_of_speech: 'noun'},
      ],
    }, '', []);

    expect(word.meanings).toHaveLength(2);
    expect(word.meanings[0].exampleSentences).toHaveLength(1);
    expect(word.meanings[1].exampleSentences).toHaveLength(0);
  });
});
