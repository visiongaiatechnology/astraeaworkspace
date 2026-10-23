// STATUS: DIAMANT VGT SUPREME — Bounded Writer Content-Control / Form-Filling Domain
import type {
  WriterContentControl,
  WriterContentControlType,
  WriterRepeatingSectionItem,
} from '../../../../shared/contracts/workspace';

const MAX_CONTROLS = 512;
const MAX_TITLE_LENGTH = 128;
const MAX_TAG_LENGTH = 128;
const MAX_TEXT_LENGTH = 8_192;
const MAX_OPTIONS = 64;
const MAX_OPTION_LENGTH = 256;
const MAX_REPEATING_ITEMS = 128;

export class WriterContentControlError extends Error {}

function normalizeInline(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, maxLength);
}

function normalizeIdentifier(value: unknown): string {
  return normalizeInline(value, 256);
}

function normalizeDate(value: unknown): string | undefined {
  const text = normalizeInline(value, 10);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return undefined;
  return text;
}

function baseControl(
  value: Record<string, unknown>,
  validParagraphIds?: ReadonlySet<string>,
): Pick<WriterContentControl, 'id' | 'type' | 'title' | 'paragraphId' | 'tag' | 'required' | 'locked'> | null {
  const id = normalizeIdentifier(value.id);
  const type = normalizeInline(value.type, 32) as WriterContentControlType;
  const title = normalizeInline(value.title, MAX_TITLE_LENGTH);
  const paragraphId = normalizeIdentifier(value.paragraphId);
  const allowedTypes: readonly WriterContentControlType[] = [
    'text', 'checkbox', 'dropdown', 'date', 'picture', 'repeating_section',
  ];
  if (!id || !paragraphId || !allowedTypes.includes(type)) return null;
  if (validParagraphIds && !validParagraphIds.has(paragraphId)) return null;
  return {
    id,
    type,
    title: title || 'Formularfeld',
    paragraphId,
    tag: normalizeInline(value.tag, MAX_TAG_LENGTH) || undefined,
    required: Boolean(value.required) || undefined,
    locked: Boolean(value.locked) || undefined,
  };
}

function normalizeRepeatingItems(value: unknown): WriterRepeatingSectionItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: WriterRepeatingSectionItem[] = [];
  for (const raw of value.slice(0, MAX_REPEATING_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = normalizeIdentifier(record.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, value: normalizeText(record.value) });
  }
  return items;
}

function normalizeControl(
  raw: unknown,
  validParagraphIds?: ReadonlySet<string>,
  validImageIds?: ReadonlySet<string>,
): WriterContentControl | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const base = baseControl(value, validParagraphIds);
  if (!base) return null;

  switch (base.type) {
    case 'text': {
      const maxLengthRaw = Number(value.maxLength);
      const maxLength = Number.isSafeInteger(maxLengthRaw)
        ? Math.min(MAX_TEXT_LENGTH, Math.max(1, maxLengthRaw))
        : undefined;
      return {
        ...base,
        type: 'text',
        value: normalizeText(value.value, maxLength ?? MAX_TEXT_LENGTH),
        placeholder: normalizeInline(value.placeholder, MAX_TITLE_LENGTH) || undefined,
        maxLength,
      };
    }
    case 'checkbox':
      return {
        ...base,
        type: 'checkbox',
        checked: Boolean(value.checked),
        checkedLabel: normalizeInline(value.checkedLabel, MAX_OPTION_LENGTH) || undefined,
        uncheckedLabel: normalizeInline(value.uncheckedLabel, MAX_OPTION_LENGTH) || undefined,
      };
    case 'dropdown': {
      const options = Array.isArray(value.options)
        ? Array.from(new Set(value.options
          .slice(0, MAX_OPTIONS)
          .map((option) => normalizeInline(option, MAX_OPTION_LENGTH))
          .filter(Boolean)))
        : [];
      const selected = normalizeInline(value.value, MAX_OPTION_LENGTH);
      return {
        ...base,
        type: 'dropdown',
        options,
        value: selected && options.includes(selected) ? selected : undefined,
      };
    }
    case 'date': {
      const min = normalizeDate(value.min);
      const max = normalizeDate(value.max);
      let selected = normalizeDate(value.value);
      if (selected && min && selected < min) selected = undefined;
      if (selected && max && selected > max) selected = undefined;
      return { ...base, type: 'date', value: selected, min, max };
    }
    case 'picture': {
      const imageId = normalizeIdentifier(value.imageId);
      return {
        ...base,
        type: 'picture',
        imageId: imageId && (!validImageIds || validImageIds.has(imageId)) ? imageId : undefined,
      };
    }
    case 'repeating_section':
      return { ...base, type: 'repeating_section', items: normalizeRepeatingItems(value.items) };
  }
}

export function normalizeWriterContentControls(
  input: unknown,
  validParagraphIds?: ReadonlySet<string>,
  validImageIds?: ReadonlySet<string>,
): WriterContentControl[] {
  if (!Array.isArray(input)) return [];
  const controls: WriterContentControl[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_CONTROLS)) {
    const control = normalizeControl(raw, validParagraphIds, validImageIds);
    if (!control || seen.has(control.id)) continue;
    seen.add(control.id);
    controls.push(control);
  }
  return controls;
}

export function createWriterContentControl(
  type: WriterContentControlType,
  paragraphId: string,
  title = 'Formularfeld',
): WriterContentControl {
  const base = {
    id: crypto.randomUUID(),
    title: normalizeInline(title, MAX_TITLE_LENGTH) || 'Formularfeld',
    paragraphId: normalizeIdentifier(paragraphId),
  };
  if (!base.paragraphId) throw new WriterContentControlError('Ein Formularfeld benötigt einen gültigen Absatzbezug.');
  switch (type) {
    case 'text': return { ...base, type, value: '' };
    case 'checkbox': return { ...base, type, checked: false };
    case 'dropdown': return { ...base, type, options: [] };
    case 'date': return { ...base, type };
    case 'picture': return { ...base, type };
    case 'repeating_section': return { ...base, type, items: [] };
  }
}

export function updateWriterContentControlValue(
  control: WriterContentControl,
  value: unknown,
  validImageIds?: ReadonlySet<string>,
): WriterContentControl {
  if (control.locked) throw new WriterContentControlError('Dieses Formularfeld ist gesperrt.');
  switch (control.type) {
    case 'text':
      return { ...control, value: normalizeText(value, control.maxLength ?? MAX_TEXT_LENGTH) };
    case 'checkbox':
      return { ...control, checked: Boolean(value) };
    case 'dropdown': {
      const selected = normalizeInline(value, MAX_OPTION_LENGTH);
      if (selected && !control.options.includes(selected)) {
        throw new WriterContentControlError('Die Auswahl ist für dieses Dropdown nicht zulässig.');
      }
      return { ...control, value: selected || undefined };
    }
    case 'date': {
      const selected = normalizeDate(value);
      if (value && !selected) throw new WriterContentControlError('Das Datum ist ungültig.');
      if (selected && control.min && selected < control.min) throw new WriterContentControlError('Das Datum liegt vor dem erlaubten Bereich.');
      if (selected && control.max && selected > control.max) throw new WriterContentControlError('Das Datum liegt nach dem erlaubten Bereich.');
      return { ...control, value: selected };
    }
    case 'picture': {
      const imageId = normalizeIdentifier(value);
      if (imageId && validImageIds && !validImageIds.has(imageId)) {
        throw new WriterContentControlError('Das referenzierte Bild ist nicht Teil des Dokuments.');
      }
      return { ...control, imageId: imageId || undefined };
    }
    case 'repeating_section':
      throw new WriterContentControlError('Repeating Sections werden über ihre Elemente aktualisiert.');
  }
}

export function addWriterRepeatingItem(
  control: WriterContentControl,
  initialValue = '',
): WriterContentControl {
  if (control.type !== 'repeating_section') throw new WriterContentControlError('Das Feld ist keine Repeating Section.');
  if (control.locked) throw new WriterContentControlError('Dieses Formularfeld ist gesperrt.');
  if (control.items.length >= MAX_REPEATING_ITEMS) throw new WriterContentControlError('Die Repeating Section hat ihr Elementlimit erreicht.');
  return {
    ...control,
    items: [...control.items, { id: crypto.randomUUID(), value: normalizeText(initialValue) }],
  };
}

export function updateWriterRepeatingItem(
  control: WriterContentControl,
  itemId: string,
  value: string,
): WriterContentControl {
  if (control.type !== 'repeating_section') throw new WriterContentControlError('Das Feld ist keine Repeating Section.');
  if (control.locked) throw new WriterContentControlError('Dieses Formularfeld ist gesperrt.');
  const normalizedId = normalizeIdentifier(itemId);
  if (!control.items.some((item) => item.id === normalizedId)) throw new WriterContentControlError('Das Repeating-Section-Element existiert nicht.');
  return {
    ...control,
    items: control.items.map((item) => item.id === normalizedId ? { ...item, value: normalizeText(value) } : item),
  };
}

export function removeWriterRepeatingItem(
  control: WriterContentControl,
  itemId: string,
): WriterContentControl {
  if (control.type !== 'repeating_section') throw new WriterContentControlError('Das Feld ist keine Repeating Section.');
  if (control.locked) throw new WriterContentControlError('Dieses Formularfeld ist gesperrt.');
  const normalizedId = normalizeIdentifier(itemId);
  return { ...control, items: control.items.filter((item) => item.id !== normalizedId) };
}
