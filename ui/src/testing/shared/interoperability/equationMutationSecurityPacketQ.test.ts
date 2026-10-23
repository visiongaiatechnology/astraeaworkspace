// STATUS: GOLD — bounded deterministic hostile-input mutation regression for SEC-096.
// The corpus deliberately spans valid equations, controlled XML failures, and hostile code points.
import { describe, expect, it } from 'vitest';
import { equationMarkupToLatex } from '../../../shared/interoperability/equation';

const MUTATION_CASES = 4_096;
const MAX_INPUT_CHARS = 256;
const MAX_OUTPUT_CHARS = 16_384;
const FORBIDDEN_PANIC_MESSAGE = /maximum call stack|stack overflow|out of memory|recursion limit/iu;
const CONTROLLED_XML_ERRORS = new Set([
  'DTD/Entities sind in Formel-XML nicht erlaubt.',
  'Formel-XML enthält nicht passende Elementgrenzen.',
  'Formel-XML enthält eine ungültige Zeichenreferenz.',
]);

type CaseOutcome = 'accepted' | 'controlled-rejected' | 'native-exception' | 'unclassified-error';

function makeMutation(index: number): { input: string; expectedOutput?: string; expectsControlledError: boolean } {
  const variant = index % 8;
  const lane = Math.floor(index / 8);

  switch (variant) {
    case 0: {
      const codePoint = 0x41 + (lane % 26);
      const character = String.fromCodePoint(codePoint);
      return {
        input: `<math><mi>&#${codePoint};</mi></math>`,
        expectedOutput: character,
        expectsControlledError: false,
      };
    }
    case 1: {
      const codePoint = 0x410 + (lane % 32);
      const character = String.fromCodePoint(codePoint);
      return {
        input: `<math><mi>&#x${codePoint.toString(16)};</mi></math>`,
        expectedOutput: character,
        expectsControlledError: false,
      };
    }
    case 2: {
      const codePoint = 0xd800 + (lane % 0x800);
      return {
        input: `<math><mi>&#${codePoint};</mi></math>`,
        expectsControlledError: true,
      };
    }
    case 3: {
      const invalidCodePoints = [0, 1, 0x0b, 0xd800, 0xfffe, 0xffff, 0x110000] as const;
      const codePoint = invalidCodePoints[lane % invalidCodePoints.length]!;
      return {
        input: `<math><mi>&#x${codePoint.toString(16)};</mi></math>`,
        expectsControlledError: true,
      };
    }
    case 4:
      return {
        input: '<math><mi>&#65;</math>',
        expectsControlledError: true,
      };
    case 5: {
      const literal = `&#xZZ${lane % 10};`;
      return {
        input: `<math><mi>${literal}</mi></math>`,
        expectedOutput: literal,
        expectsControlledError: false,
      };
    }
    case 6: {
      const codePoint = 0x1f600 + (lane % 80);
      const character = String.fromCodePoint(codePoint);
      return {
        input: `<math><mi>&#x${codePoint.toString(16)};</mi></math>`,
        expectedOutput: character,
        expectsControlledError: false,
      };
    }
    default:
      return {
        input: '<!DOCTYPE math [<!ENTITY x "blocked">]><math><mi>&#65;</mi></math>',
        expectsControlledError: true,
      };
  }
}

function classifyError(error: unknown): CaseOutcome {
  if (!(error instanceof Error) || error instanceof RangeError || error instanceof TypeError) return 'native-exception';
  if (FORBIDDEN_PANIC_MESSAGE.test(error.message)) return 'native-exception';
  if (error.message.length <= 256 && CONTROLLED_XML_ERRORS.has(error.message)) return 'controlled-rejected';
  return 'unclassified-error';
}

describe('SEC-096 equation XML numeric-reference mutation regression', () => {
  it('dispatches exactly 4,096 bounded cases and separates controlled failures from native exceptions', () => {
    let dispatched = 0;
    let accepted = 0;
    let controlledRejected = 0;
    let nativeExceptions = 0;
    let unclassifiedErrors = 0;
    let acceptedOutputInvariantFailures = 0;
    let unexpectedAccepted = 0;
    let unexpectedControlledRejected = 0;
    let oversizedInputs = 0;

    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const testCase = makeMutation(index);
      if (testCase.input.length > MAX_INPUT_CHARS) oversizedInputs += 1;
      dispatched += 1;

      try {
        const output = equationMarkupToLatex(testCase.input);
        accepted += 1;
        if (testCase.expectsControlledError) unexpectedAccepted += 1;
        if (output.length > MAX_OUTPUT_CHARS || output !== testCase.expectedOutput) {
          acceptedOutputInvariantFailures += 1;
        }
      } catch (error) {
        const outcome = classifyError(error);
        if (outcome === 'controlled-rejected') {
          controlledRejected += 1;
          if (!testCase.expectsControlledError) unexpectedControlledRejected += 1;
        } else if (outcome === 'native-exception') {
          nativeExceptions += 1;
        } else {
          unclassifiedErrors += 1;
        }
      }
    }

    console.info(`[SEC-096 equation XML] ${dispatched} cases; accepted=${accepted}; controlled-rejected=${controlledRejected}; native-exception=${nativeExceptions}; unclassified=${unclassifiedErrors}`);
    expect(dispatched, 'every corpus item must be dispatched').toBe(MUTATION_CASES);
    expect(oversizedInputs, 'all hostile XML inputs must stay within the source cap').toBe(0);
    expect(accepted, 'four valid/literal lanes per eight-case group must preserve their output').toBe(MUTATION_CASES / 2);
    expect(controlledRejected, 'four malformed XML lanes per group must reject through known errors').toBe(MUTATION_CASES / 2);
    expect(unclassifiedErrors, 'parser errors must belong to the explicit controlled error set').toBe(0);
    expect(acceptedOutputInvariantFailures, 'accepted equations must preserve exact bounded output').toBe(0);
    expect(unexpectedAccepted, 'malformed XML cases must not be accepted').toBe(0);
    expect(unexpectedControlledRejected, 'valid or literal XML cases must not reject unexpectedly').toBe(0);
    expect(accepted + controlledRejected + nativeExceptions + unclassifiedErrors).toBe(MUTATION_CASES);
    expect(nativeExceptions, 'invalid XML character references must not escape as native exceptions').toBe(0);
  });
});
