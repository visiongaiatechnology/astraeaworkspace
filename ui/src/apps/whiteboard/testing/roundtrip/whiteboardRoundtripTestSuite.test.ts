import { describe, expect, it } from 'vitest';
import { runWhiteboardTestSuite } from '../../integrations/whiteboardRoundtripTestSuite';

describe('Whiteboard bounded diagnostic suite', () => {
  it('runs the authenticated VGT container path and reports bounded diagnostics without fidelity claims', async () => {
    const report = await runWhiteboardTestSuite();

    expect(report.totalTests).toBe(6);
    expect(report.results.find(({ id }) => id === 'VBOARD_CONTAINER_ROUNDTRIP')?.name)
      .toBe('1. Encrypted VGT .vboard Container Roundtrip');
    const containerResult = report.results.find(({ id }) => id === 'VBOARD_CONTAINER_ROUNDTRIP');
    expect(containerResult?.passed, `${containerResult?.message} ${containerResult?.details ?? ''}`).toBe(true);
    expect(report.results.find(({ id }) => id === 'SVG_VECTOR_XSS_DEFENSE')?.passed).toBe(true);
    expect(report.results.every(({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0)).toBe(true);
  });
});
