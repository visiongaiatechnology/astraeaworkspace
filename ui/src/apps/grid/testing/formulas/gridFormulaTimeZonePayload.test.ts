// STATUS: PLATIN — W-426: der Zeitkontext **reist mit** — eine Zone, eine Nutzlast, ein geprüfter Weg
//
// Diese Prüfung fährt den **echten Weg** (`evaluateFormula` → `invokeNative`) und **keine** Kopie davon ✓. Sie
// beweist, dass der Wert **getragen** wird ✓: zwei Zonen ergeben **zwei** Offsets in derselben Nutzlast ✓, und
// **ohne** Zeitkontext ist die Nutzlast **unverändert** ✓ — das ist die additive Zusicherung ✓.
//
// *Was diese Prüfung nicht kann:* Sie kann nicht beweisen, dass der Rust-Kern den Wert **benutzt** ✓ — das tun die
// Rust-Zeugen in `crates/vgt-formula/src/functions.rs` (`w426_user_zone_im_motor_tests` ✓, mit **echtem** Motor ✓)
// und der Handler in `crates/vgt-desktop/src/main.rs` (`formula_zone_guard` ✓). *Eine Seite allein wäre eine halbe
// Behauptung* ✓.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeNative, isNativeDesktop } from '../../../../platform/native/nativeBridge';
import { evaluateFormula } from '../../formulas/formula';

vi.mock('../../../../platform/native/nativeBridge', () => ({
  invokeNative: vi.fn(),
  isNativeDesktop: vi.fn(),
}));

vi.mock('../../../../platform/native/ipcAuth', () => ({
  authenticatedIpcFetch: vi.fn(),
}));

const WINTER = Date.UTC(2026, 0, 15, 12, 0, 0); // 15. Januar 2026, 12:00 UTC

/** Ein Offset-Lookup mit **zwei** echten Zonen ✓ — dieselbe Regel wie in `gridFormulaTimeContext.test.ts` ✓. */
const lookup = (zone: string, atMs: number): number | null => {
  const sommer = atMs >= Date.UTC(2026, 2, 29) && atMs < Date.UTC(2026, 9, 25); // EU-Umstellung
  if (zone === 'Europe/Berlin') return sommer ? 120 : 60;
  if (zone === 'America/New_York') return sommer ? -240 : -300;
  return null;
};

function letzteNutzlast(): Record<string, unknown> {
  const aufrufe = vi.mocked(invokeNative).mock.calls;
  const letzter = aufrufe[aufrufe.length - 1];
  return (letzter[1] as unknown as { request: Record<string, unknown> }).request;
}

describe('W-426: der Zeitkontext reist in der Nutzlast mit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativeDesktop).mockReturnValue(true);
    vi.mocked(invokeNative).mockImplementation(async <T>() => ({ success: true, result: 46000 } as T));
  });

  it('eine **benannte** Zone reist mit — der Offset gilt für **genau** den Zeitpunkt', async () => {
    await expect(
      evaluateFormula('=TODAY()', {}, {
        volatilePolicy: 'runtime',
        timeZone: 'Europe/Berlin',
        timeZoneOffsetLookup: lookup,
        nowMs: WINTER,
      }),
    ).resolves.toBe(46000);
    expect(invokeNative).toHaveBeenCalledWith('vgt_formula_evaluate', {
      request: {
        formula: '=TODAY()',
        cells: {},
        volatile_policy: 'runtime',
        external_reference_policy: 'deny',
        contract: 'VGT-FORMULA-CORE-1',
        time_zone: { now_ms: WINTER, utc_offset_minutes: 60, zone: 'Europe/Berlin', source: 'explicit' },
      },
    });
  });

  it('**zwei Zonen, dieselbe Formel:** zwei Offsets — der Wert wird wirklich getragen', async () => {
    const gemeinsam = { volatilePolicy: 'runtime' as const, timeZoneOffsetLookup: lookup, nowMs: WINTER };
    await evaluateFormula('=NOW()', {}, { ...gemeinsam, timeZone: 'Europe/Berlin' });
    await evaluateFormula('=NOW()', {}, { ...gemeinsam, timeZone: 'America/New_York' });
    const aufrufe = vi.mocked(invokeNative).mock.calls;
    const berlin = (aufrufe[0][1] as unknown as { request: { time_zone: { utc_offset_minutes: number } } })
      .request.time_zone;
    const newYork = (aufrufe[1][1] as unknown as { request: { time_zone: { utc_offset_minutes: number } } })
      .request.time_zone;
    expect(berlin.utc_offset_minutes).toBe(60);
    expect(newYork.utc_offset_minutes).toBe(-300);
    expect(berlin.utc_offset_minutes).not.toBe(newYork.utc_offset_minutes);
  });

  it('**dieselbe Eingabe zweimal** ergibt **dieselbe** Nutzlast', async () => {
    const eingabe = {
      volatilePolicy: 'runtime' as const,
      timeZone: 'Europe/Berlin',
      timeZoneOffsetLookup: lookup,
      nowMs: WINTER,
    };
    await evaluateFormula('=NOW()', {}, eingabe);
    await evaluateFormula('=NOW()', {}, eingabe);
    const aufrufe = vi.mocked(invokeNative).mock.calls;
    expect(aufrufe[0][1]).toEqual(aufrufe[1][1]);
  });

  it('**additiv:** ohne Zeitkontext ist die Nutzlast unverändert — der Schlüssel fehlt **wirklich**', async () => {
    await evaluateFormula('=SUM(A1)', {});
    expect(invokeNative).toHaveBeenCalledWith('vgt_formula_evaluate', {
      request: {
        formula: '=SUM(A1)',
        cells: {},
        volatile_policy: 'disabled',
        external_reference_policy: 'deny',
        contract: 'VGT-FORMULA-CORE-1',
      },
    });
    expect(Object.keys(letzteNutzlast())).not.toContain('time_zone');
  });

  it('**fail-closed:** ein verlangter, aber unbrauchbarer Zeitkontext wird abgelehnt — **kein** stiller Host-Rückfall', async () => {
    await expect(
      evaluateFormula('=TODAY()', {}, {
        volatilePolicy: 'runtime',
        timeZone: 'Mars/Olympus',
        timeZoneOffsetLookup: lookup,
        nowMs: WINTER,
      }),
    ).resolves.toBe('#VALUE!');
    await expect(
      evaluateFormula('=TODAY()', {}, { volatilePolicy: 'runtime', timeZone: 'Europe/Berlin', nowMs: WINTER }),
    ).resolves.toBe('#VALUE!');
    await expect(
      evaluateFormula('=TODAY()', {}, {
        volatilePolicy: 'runtime',
        timeZone: 'Europe/Berlin',
        timeZoneOffsetLookup: lookup,
        nowMs: Number.NaN,
      }),
    ).resolves.toBe('#VALUE!');
    expect(invokeNative).not.toHaveBeenCalled();
  });

  it('die **Host**-Zone bleibt wählbar — aber **benannt** (`source: host`)', async () => {
    await evaluateFormula('=TODAY()', {}, { volatilePolicy: 'runtime', timeZone: null, nowMs: WINTER });
    const zone = letzteNutzlast().time_zone as {
      source: string;
      zone: string | null;
      utc_offset_minutes: number;
      now_ms: number;
    };
    expect(zone.source).toBe('host');
    expect(zone.zone).toBeNull();
    expect(zone.now_ms).toBe(WINTER);
    expect(Number.isInteger(zone.utc_offset_minutes)).toBe(true);
  });
});
