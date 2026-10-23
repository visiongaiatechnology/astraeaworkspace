// STATUS: DIAMANT VGT SUPREME — Accessible Writer break command surface
import type { ChangeEvent } from 'react';
import { Split } from 'lucide-react';
import type { WriterSectionBreakType } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { writerToolbarText } from './writerToolbarLocale';

type WriterBreakCommand =
  | 'line'
  | 'page'
  | 'column'
  | `section:${WriterSectionBreakType}`;

export interface WriterBreakMenuProps {
  onInsertLineBreak: () => void;
  onInsertPageBreak: () => void;
  onInsertColumnBreak: () => void;
  onInsertSectionBreak: (breakType: WriterSectionBreakType) => void;
}

export function WriterBreakMenu({
  onInsertLineBreak,
  onInsertPageBreak,
  onInsertColumnBreak,
  onInsertSectionBreak,
}: WriterBreakMenuProps) {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof writerToolbarText>[0]): string => writerToolbarText(message, locale);

  const handleCommand = (event: ChangeEvent<HTMLSelectElement>): void => {
    const command = event.currentTarget.value as WriterBreakCommand | '';
    event.currentTarget.value = '';
    if (!command) return;
    if (command === 'line') onInsertLineBreak();
    else if (command === 'page') onInsertPageBreak();
    else if (command === 'column') onInsertColumnBreak();
    else onInsertSectionBreak(command.slice('section:'.length) as WriterSectionBreakType);
  };

  return (
    <label
      className="flex items-center gap-1 rounded border border-white/10 bg-slate-900/90 px-1.5 text-xs text-slate-300 transition-colors hover:border-sky-500/40 hover:text-white focus-within:border-sky-500/60"
      title={t('insertBreak')}
    >
      <Split className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
      <span className="sr-only">{t('insertBreak')}</span>
      <select
        defaultValue=""
        onChange={handleCommand}
        aria-label={t('insertBreak')}
        className="max-w-[90px] cursor-pointer bg-transparent py-1 text-[0.6875rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
      >
        <option value="" disabled>{t('break')}</option>
        <option value="line">{t('lineBreak')}</option>
        <option value="page">{t('pageBreak')}</option>
        <option value="column">{t('columnBreak')}</option>
        <option value="section:next-page">{t('sectionNextPage')}</option>
        <option value="section:continuous">{t('sectionContinuous')}</option>
        <option value="section:even-page">{t('sectionEvenPage')}</option>
        <option value="section:odd-page">{t('sectionOddPage')}</option>
      </select>
    </label>
  );
}
