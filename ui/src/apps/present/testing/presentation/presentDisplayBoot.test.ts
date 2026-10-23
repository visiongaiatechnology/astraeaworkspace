// STATUS: GOLD — Present Runde 42: the display boot branch recognises only a valid display URL.
import { describe, expect, it } from 'vitest';
import { resolvePresentDisplayBoot } from '../../presentation/display/mountPresentDisplay';

describe('Present display boot branch', () => {
  it('resolves both display roles with a valid session', () => {
    expect(resolvePresentDisplayBoot('?present_display=audience&session=present-42-abcd')).toEqual({
      role: 'audience',
      session: 'present-42-abcd',
    });
    expect(resolvePresentDisplayBoot('present_display=presenter&session=present-42-abcd')).toEqual({
      role: 'presenter',
      session: 'present-42-abcd',
    });
    expect(resolvePresentDisplayBoot('?foo=1&present_display=presenter&session=Present_42-A&bar=2')).toEqual({
      role: 'presenter',
      session: 'Present_42-A',
    });
  });

  it('never boots a display for a missing, unknown or hostile parameter set', () => {
    expect(resolvePresentDisplayBoot('')).toBeNull();
    expect(resolvePresentDisplayBoot('?session=present-42')).toBeNull();
    expect(resolvePresentDisplayBoot('?present_display=audience')).toBeNull();
    expect(resolvePresentDisplayBoot('?present_display=editor&session=present-42')).toBeNull();
    expect(resolvePresentDisplayBoot('?present_display=audience&session=with%20space')).toBeNull();
    expect(resolvePresentDisplayBoot('?present_display=audience&session=../escape')).toBeNull();
    expect(resolvePresentDisplayBoot('?present_display=audience&session=' + 'x'.repeat(80))).toBeNull();
  });
});
