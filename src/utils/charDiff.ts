import { CharDiffToken } from '../types';

/**
 * Normalizes input text according to UI/UX plan:
 * - Trim outer whitespace
 * - Preserve internal spaces, hyphens, apostrophes, commas, periods
 * - Case-insensitive
 */
export function normalizeText(input: string): string {
  if (!input) return '';
  return input.trim().toLowerCase();
}

export interface DiffResult {
  isExactMatch: boolean;
  normalizedUser: string;
  normalizedExpected: string;
  tokens: CharDiffToken[];
  errorTypes: string[];
  firstErrorIndex: number;
}

/**
 * Computes character diff between user input and expected string
 */
export function computeCharDiff(userInput: string, expectedInput: string): DiffResult {
  const normUser = normalizeText(userInput);
  const normExpected = normalizeText(expectedInput);

  const isExactMatch = normUser === normExpected;
  const tokens: CharDiffToken[] = [];
  const errorTypes: string[] = [];
  let firstErrorIndex = -1;

  if (isExactMatch) {
    for (let i = 0; i < normExpected.length; i++) {
      tokens.push({
        char: normExpected[i],
        status: 'correct',
        index: i,
      });
    }
    return {
      isExactMatch: true,
      normalizedUser: normUser,
      normalizedExpected: normExpected,
      tokens,
      errorTypes: [],
      firstErrorIndex: -1,
    };
  }

  // Length or character mismatches
  const maxLen = Math.max(normUser.length, normExpected.length);

  for (let i = 0; i < maxLen; i++) {
    const userChar = normUser[i];
    const expChar = normExpected[i];

    if (userChar === undefined) {
      // User missed characters
      if (firstErrorIndex === -1) firstErrorIndex = i;
      tokens.push({
        char: expChar,
        status: 'missing',
        expectedChar: expChar,
        index: i,
      });
      if (!errorTypes.includes('Missing character')) errorTypes.push('Missing character');
    } else if (expChar === undefined) {
      // Extra character typed by user
      if (firstErrorIndex === -1) firstErrorIndex = i;
      tokens.push({
        char: userChar,
        status: 'extra',
        index: i,
      });
      if (!errorTypes.includes('Extra character')) errorTypes.push('Extra character');
    } else if (userChar === expChar) {
      tokens.push({
        char: userChar,
        status: 'correct',
        index: i,
      });
    } else {
      // Transposition check (e.g. "teh" vs "the")
      if (
        i + 1 < normUser.length &&
        i + 1 < normExpected.length &&
        userChar === normExpected[i + 1] &&
        normUser[i + 1] === expChar
      ) {
        if (firstErrorIndex === -1) firstErrorIndex = i;
        tokens.push({
          char: userChar,
          status: 'transposed',
          expectedChar: expChar,
          index: i,
        });
        if (!errorTypes.includes('Transposed characters')) errorTypes.push('Transposed characters');
      } else {
        if (firstErrorIndex === -1) firstErrorIndex = i;
        tokens.push({
          char: userChar,
          status: 'replaced',
          expectedChar: expChar,
          index: i,
        });
        if (!errorTypes.includes('Replacement')) errorTypes.push('Replacement');
      }
    }
  }

  return {
    isExactMatch: false,
    normalizedUser: normUser,
    normalizedExpected: normExpected,
    tokens,
    errorTypes,
    firstErrorIndex: firstErrorIndex >= 0 ? firstErrorIndex : 0,
  };
}
