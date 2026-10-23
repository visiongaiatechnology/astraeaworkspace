// STATUS: PLATIN — rendered seven-locale coverage for Grid sheet controls and accessible names.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { GridSheetModel } from '../../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { FlashFillTransform, GridGoToSpecialKind, GridTransferMode } from '../../editing/gridAdvancedEditing';
import { GridSheetEditPanel } from '../../panels/GridSheetEditPanel';
import { GRID_SHEET_EDIT_COPY } from '../gridSheetEditLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const escapeMarkup = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#x27;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const sheet: GridSheetModel = { id: 'sheet-1', name: 'Forecast', tableObjectId: 'table-1', viewMode: 'normal', zoom: 100 };
const props = {
  sheet,
  selectedCell: 'B2',
  selectedRange: 'A1:B2',
  selectionRanges: ['A1:B2', 'D1:D2'],
  locale: 'fr-FR',
  calculationMode: 'automatic-except-data-tables',
  onUpdateSheet: noop,
  onPatchWorkbook: noop,
  onStructureEdit: noop,
  onSetAxisHidden: noop,
  onGroupAxis: noop,
  onGoTo: () => true,
  onGoToSpecial: () => 1,
  onTransferSelection: () => true,
  onFlashFill: () => 1,
  onAddDisjoint: noop,
  onClearDisjoint: noop,
  onSetRichTextCell: noop,
} satisfies ComponentProps<typeof GridSheetEditPanel>;

const allCopyStrings = (copy: typeof GRID_SHEET_EDIT_COPY['en-US']): string[] => [
  ...Object.values(copy.sections),
  ...Object.values(copy.viewModes),
  ...Object.values(copy.fields),
  copy.selectionSummary('A1:B2', 1, 2, 1, 2),
  ...Object.values(copy.actions),
  copy.goToPlaceholder,
  copy.specialKindLabel,
  ...Object.values(copy.specialKinds),
  copy.activeRanges(2),
  copy.transfer.targetPlaceholder,
  copy.transfer.modeLabel,
  ...Object.values(copy.transfer.modes),
  copy.transfer.apply,
  copy.flashFill.targetPlaceholder,
  copy.flashFill.transformLabel,
  ...Object.values(copy.flashFill.transforms),
  copy.flashFill.apply,
  copy.richText.inCell('B2'),
  copy.richText.placeholder,
  copy.richText.bold,
  copy.richText.italic,
  copy.richText.underline,
  copy.richText.color,
  copy.richText.apply,
  copy.workbook.locale,
  copy.workbook.calculation,
  ...Object.values(copy.workbook.calculationModes),
  copy.workbook.propertyPlaceholder,
  copy.workbook.valuePlaceholder,
  copy.workbook.setProperty,
];

it('renders localized sheet controls, accessible names, and stable operation values in all seven locales', () => {
  const expectedKeys = Object.keys(GRID_SHEET_EDIT_COPY['en-US']).sort();
  const stableValues: readonly (GridGoToSpecialKind | GridTransferMode | FlashFillTransform | 'automatic' | 'automatic-except-data-tables' | 'manual')[] = [
    'blanks', 'constants', 'formulas', 'errors', 'comments', 'validation', 'visible',
    'move', 'copy', 'insert-down', 'insert-right',
    'trim', 'upper', 'lower', 'first-word', 'last-word', 'initials', 'before-at', 'after-at',
    'automatic', 'automatic-except-data-tables', 'manual',
  ];

  for (const locale of WORKSPACE_LOCALES) {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const copy = GRID_SHEET_EDIT_COPY[locale];
    expect(Object.keys(copy).sort(), `${locale} catalog parity`).toEqual(expectedKeys);
    const markup = renderToStaticMarkup(<GridSheetEditPanel {...props} />);

    for (const label of allCopyStrings(copy)) expect(markup, `${locale}: ${label}`).toContain(escapeMarkup(label));
    for (const label of [
      copy.fields.moveTarget, copy.actions.goTo, copy.specialKindLabel, copy.transfer.targetPlaceholder,
      copy.transfer.modeLabel, copy.flashFill.targetPlaceholder, copy.flashFill.transformLabel,
      copy.richText.placeholder, copy.richText.color, copy.workbook.propertyPlaceholder, copy.workbook.valuePlaceholder,
    ]) expect(markup, `${locale} accessible name: ${label}`).toContain(`aria-label="${escapeMarkup(label)}"`);
    for (const value of stableValues) expect(markup, `${locale} operation value: ${value}`).toContain(`value="${value}"`);

    expect(markup).toContain('value="fr-FR"');
    expect(markup).toContain('value="automatic-except-data-tables"');
    expect(markup).toContain('A1:B2');
  }
});
