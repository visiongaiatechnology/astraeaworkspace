// STATUS: DIAMANT VGT SUPREME — shared local-only font resolution and substitution evidence

export type FontGenericFamily = 'sans-serif' | 'serif' | 'monospace';

export interface FontRequest {
  family?: string;
  fallbacks?: readonly string[];
  generic?: FontGenericFamily;
  weight?: number;
  italic?: boolean;
  variations?: Readonly<Record<string, number>>;
  features?: Readonly<Record<string, boolean | number>>;
}

export interface ResolvedFont {
  requestedFamily: string;
  resolvedFamily: string;
  cssFamily: string;
  generic: FontGenericFamily;
  weight: number;
  italic: boolean;
  source: 'system' | 'self-hosted' | 'generic-fallback';
  variations: Readonly<Record<string, number>>;
  features: Readonly<Record<string, boolean | number>>;
  substituted: boolean;
}

export interface FontAvailabilityAdapter {
  has(family: string): boolean;
  source?(family: string): 'system' | 'self-hosted' | undefined;
}

export interface FontSubstitutionEntry {
  requested: string;
  resolved: string;
  generic: FontGenericFamily;
  reason: 'missing' | 'invalid-family';
}

export interface FontResolutionResult {
  font: ResolvedFont;
  substitutions: FontSubstitutionEntry[];
}

const MAX_FAMILY_LENGTH = 128;
const MAX_FALLBACKS = 16;
const MAX_AXES = 16;
const MAX_FEATURES = 32;
const SAFE_FAMILY = /^[\p{L}\p{N} ._+-]+$/u;
const FALLBACKS: Record<FontGenericFamily, readonly string[]> = {
  'sans-serif': ['Inter', 'Segoe UI', 'Arial', 'Helvetica', 'sans-serif'],
  serif: ['Georgia', 'Times New Roman', 'Times', 'serif'],
  monospace: ['Cascadia Mono', 'Consolas', 'Menlo', 'monospace'],
};

function quoteFamily(value: string): string {
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : `"${value.replaceAll('"', '')}"`;
}

function validFamily(value: string): boolean {
  return Boolean(value && value.length <= MAX_FAMILY_LENGTH && SAFE_FAMILY.test(value));
}

export function normalizeFontFamily(value: string | undefined, generic: FontGenericFamily): string {
  const family = (value ?? '').trim();
  if (!validFamily(family)) return FALLBACKS[generic][0]!;
  return family;
}

function validateVariations(input: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> {
  const entries = Object.entries(input ?? {});
  if (entries.length > MAX_AXES) throw new Error('render_font_variation_axis_limit');
  const result: Record<string, number> = {};
  for (const [tag, raw] of entries) {
    if (!/^[A-Za-z0-9]{4}$/u.test(tag) || !Number.isFinite(raw) || raw < -100_000 || raw > 100_000) throw new Error('render_font_variation_invalid');
    result[tag] = raw;
  }
  return result;
}

function validateFeatures(input: Readonly<Record<string, boolean | number>> | undefined): Readonly<Record<string, boolean | number>> {
  const entries = Object.entries(input ?? {});
  if (entries.length > MAX_FEATURES) throw new Error('render_font_feature_limit');
  const result: Record<string, boolean | number> = {};
  for (const [tag, raw] of entries) {
    if (!/^[A-Za-z0-9]{4}$/u.test(tag)) throw new Error('render_font_feature_invalid');
    if (typeof raw === 'number' && (!Number.isFinite(raw) || raw < 0 || raw > 65_535)) throw new Error('render_font_feature_invalid');
    result[tag] = raw;
  }
  return result;
}

export function resolveFontWithReport(request: FontRequest = {}, availability?: FontAvailabilityAdapter): FontResolutionResult {
  const generic = request.generic ?? 'sans-serif';
  const rawRequested = (request.family ?? '').trim();
  const requestedFamily = normalizeFontFamily(rawRequested, generic);
  const substitutions: FontSubstitutionEntry[] = [];
  const requestedWasInvalid = Boolean(rawRequested) && requestedFamily !== rawRequested;
  const userFallbacks = (request.fallbacks ?? []).slice(0, MAX_FALLBACKS).map((value) => value.trim()).filter(validFamily);
  const candidates = [requestedFamily, ...userFallbacks, ...FALLBACKS[generic]].filter((value, index, all) => all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
  let resolvedFamily = candidates[0]!;
  let source: ResolvedFont['source'] = 'generic-fallback';
  if (availability) {
    const available = candidates.find((family) => family === generic || availability.has(family));
    resolvedFamily = available ?? generic;
    const detected = available && available !== generic ? availability.source?.(available) : undefined;
    source = detected ?? (available && available !== generic ? 'system' : 'generic-fallback');
  } else if (rawRequested && !requestedWasInvalid) {
    // In browser/native UI the CSS/system font resolver is authoritative. No network lookup is performed here.
    resolvedFamily = requestedFamily;
    source = 'system';
  }
  const substituted = requestedWasInvalid || resolvedFamily.toLowerCase() !== requestedFamily.toLowerCase();
  if (substituted) substitutions.push({ requested: rawRequested || requestedFamily, resolved: resolvedFamily, generic, reason: requestedWasInvalid ? 'invalid-family' : 'missing' });
  const cssFallbacks = candidates.filter((family) => family.toLowerCase() !== resolvedFamily.toLowerCase());
  const variations = validateVariations(request.variations);
  const features = validateFeatures(request.features);
  return {
    font: {
      requestedFamily,
      resolvedFamily,
      cssFamily: [resolvedFamily, ...cssFallbacks].map(quoteFamily).join(', '),
      generic,
      weight: Math.max(100, Math.min(900, Math.round((request.weight ?? 400) / 100) * 100)),
      italic: Boolean(request.italic),
      source,
      variations,
      features,
      substituted,
    },
    substitutions,
  };
}

export function resolveFont(request: FontRequest = {}): ResolvedFont {
  return resolveFontWithReport(request).font;
}

export function fontVariationCss(variations: Readonly<Record<string, number>>): string {
  return Object.entries(validateVariations(variations)).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `"${tag}" ${value}`).join(', ');
}

export function fontFeatureCss(features: Readonly<Record<string, boolean | number>>): string {
  return Object.entries(validateFeatures(features)).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `"${tag}" ${typeof value === 'boolean' ? (value ? 1 : 0) : value}`).join(', ');
}

export function fontPolicySignature(): string {
  return JSON.stringify({ fallbacks: FALLBACKS, network: false, runtimeCdn: false });
}
