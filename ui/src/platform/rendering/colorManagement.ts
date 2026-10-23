// STATUS: DIAMANT VGT SUPREME — canonical sRGB color management
import type { RenderColorSpace } from './renderTypes';

export interface ManagedColor {
  space: RenderColorSpace;
  r: number;
  g: number;
  b: number;
  a: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function channelHex(value: number): string { return Math.round(clamp01(value) * 255).toString(16).padStart(2, '0'); }

export function parseManagedColor(input: string): ManagedColor {
  const value = input.trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/iu.exec(value);
  if (hex) {
    return {
      space: 'srgb',
      r: parseInt(hex[1]!.slice(0, 2), 16) / 255,
      g: parseInt(hex[1]!.slice(2, 4), 16) / 255,
      b: parseInt(hex[1]!.slice(4, 6), 16) / 255,
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/iu.exec(value);
  if (!rgb) throw new Error('render_color_unsupported');
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (channels.some((channel) => channel < 0 || channel > 255)) throw new Error('render_color_out_of_range');
  return { space: 'srgb', r: channels[0]! / 255, g: channels[1]! / 255, b: channels[2]! / 255, a: rgb[4] === undefined ? 1 : clamp01(Number(rgb[4])) };
}

export function managedColorToCss(color: ManagedColor): string {
  if (color.a >= 0.999) return `#${channelHex(color.r)}${channelHex(color.g)}${channelHex(color.b)}`;
  return `rgba(${Math.round(clamp01(color.r) * 255)}, ${Math.round(clamp01(color.g) * 255)}, ${Math.round(clamp01(color.b) * 255)}, ${clamp01(color.a).toFixed(4)})`;
}

function srgbToLinear(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: ManagedColor): number {
  return 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);
}

export function contrastRatio(left: ManagedColor, right: ManagedColor): number {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function managedColorToPdfRgb(color: ManagedColor): [number, number, number] {
  return [clamp01(color.r), clamp01(color.g), clamp01(color.b)];
}
