// STATUS: DIAMANT VGT SUPREME
import type { GridCell } from '../../../shared/contracts/workspace';
const MAX_CANVAS_SPARKLINE_POINTS = 2_048;
const SAFE_SPARKLINE_COLOR = /^#[0-9a-f]{6}$/iu;

export function drawGridCanvasSparkline(
  ctx: CanvasRenderingContext2D,
  cell: GridCell,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const values: unknown = cell.sparkline;
  if (!Array.isArray(values) || values.length < 2 || values.length > MAX_CANVAS_SPARKLINE_POINTS) return;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const sx = x + Math.max(4, width - 48);
  const sy = y + Math.max(2, (height - 14) / 2);
  const sw = Math.min(42, Math.max(12, width - 8));
  const sh = Math.min(12, Math.max(6, height - 4));
  const span = max - min || 1;
  const color = SAFE_SPARKLINE_COLOR.test(cell.sparklineColor ?? '') ? cell.sparklineColor! : '#10b981';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  if (cell.sparklineType === 'column' || cell.sparklineType === 'win-loss') {
    const barWidth = Math.max(1, sw / values.length - 1);
    const zero = cell.sparklineType === 'win-loss' ? sy + sh / 2 : sy + sh - ((0 - min) / span) * sh;
    values.forEach((value: number, index: number) => {
      const barX = sx + index * sw / values.length;
      if (cell.sparklineType === 'win-loss') {
        const barHeight = sh / 2.2;
        ctx.fillRect(barX, value >= 0 ? zero - barHeight : zero, barWidth, value === 0 ? 1 : barHeight);
      } else {
        const valueY = sy + sh - ((value - min) / span) * sh;
        ctx.fillRect(barX, Math.min(zero, valueY), barWidth, Math.max(1, Math.abs(zero - valueY)));
      }
    });
  } else {
    ctx.beginPath();
    values.forEach((value: number, index: number) => {
      const pointX = sx + index * sw / (values.length - 1);
      const pointY = sy + sh - ((value - min) / span) * sh;
      if (index === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    });
    ctx.stroke();
  }
  ctx.restore();
}
