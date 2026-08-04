import {describe, expect, it} from 'vitest';
import {
  AiRequestError,
  buildWordAnalysisPrompt,
  parseWordAnalysisJson,
} from './wordAnalysis';

const ANALYSIS = {
  word: 'transport',
  canonicalWord: 'transport',
  ipa: '/ˈtræn.spɔːrt/',
  partOfSpeech: 'verb',
  vietnameseMeaning: 'vận chuyển',
  wordStructure: [],
  meanings: [{
    meaningVi: 'vận chuyển',
    definitionEn: 'to move goods or people',
    partOfSpeech: 'verb',
    examples: [
      {sentence: 'They transport goods by rail.'},
      {sentence: 'Ships transport cargo overseas.'},
      {sentence: 'Buses transport students daily.'},
    ],
  }],
  wordFamily: ['transportation'],
};

describe('provider-independent word analysis contract', () => {
  it('parses valid JSON into the normalized analysis shape', () => {
    const result = parseWordAnalysisJson(JSON.stringify(ANALYSIS));

    expect(result.canonicalWord).toBe('transport');
    expect(result.meanings[0].examples).toHaveLength(3);
  });

  it('rejects Markdown fences instead of weakening the JSON contract', () => {
    expect(() => parseWordAnalysisJson(
      `\`\`\`json\n${JSON.stringify(ANALYSIS)}\n\`\`\``,
    )).toThrowError(AiRequestError);
  });

  it('shares the complete vocabulary-analysis prompt across providers', () => {
    const prompt = buildWordAnalysisPrompt('running');

    expect(prompt).toMatch(/dictionary headword/i);
    expect(prompt).toMatch(/Vietnamese only/i);
    expect(prompt).toMatch(/exactly 3 distinct/i);
    expect(prompt).toMatch(/exact consecutive surface substring/i);
  });
});
