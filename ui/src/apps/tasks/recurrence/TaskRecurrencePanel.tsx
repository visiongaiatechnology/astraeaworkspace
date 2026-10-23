// STATUS: DIAMANT VGT SUPREME — recurrence/reminder editing with explicit series semantics
import React, { useEffect, useMemo, useState } from 'react';
import type { TaskItem, TaskRecurrenceSpec } from '../../../shared/contracts/workspace';
import { createStableTaskId } from '../model/taskModel';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { taskRecurrenceText, taskWeekdayText } from '../taskRecurrenceLocale';
import {
  clearReminderSnooze,
  effectiveReminderAt,
  instantToZonedLocal,
  isValidIanaTimeZone,
  legacyRecurrenceFromSpec,
  localTaskTimeZone,
  normalizeRecurrenceSpec,
  recurrenceSpecFromLegacy,
  snoozeLocalDateTime,
  snoozeReminder,
  taskRecurrenceSpec,
  type RecurrenceOperation,
  type RecurrenceScope,
} from './taskRecurrence';

interface TaskRecurrencePanelProps {
  task: TaskItem;
  onUpdateOccurrence: (patch: Partial<TaskItem>) => void;
  onModifySeries: (patch: Partial<TaskItem>) => void;
  onOperation: (operation: RecurrenceOperation, scope: RecurrenceScope) => void;
}

const WEEKDAYS = [
  { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 6 }, { value: 0 },
] as const;

function anchorDay(task: TaskItem): number | undefined {
  const value = task.dueAt ?? task.dueDate ?? task.startAt ?? task.startDate;
  const match = value?.match(/^\d{4}-\d{2}-(\d{2})/);
  return match ? Number(match[1]) : undefined;
}

export const TaskRecurrencePanel: React.FC<TaskRecurrencePanelProps> = ({
  task,
  onUpdateOccurrence,
  onModifySeries,
  onOperation,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof taskRecurrenceText>[0]) => taskRecurrenceText(message, locale);
  const currentSpec = useMemo(() => taskRecurrenceSpec(task), [task.recurrence, task.recurrenceSpec]);
  const timezone = currentSpec?.timezone ?? localTaskTimeZone();
  const [timezoneDraft, setTimezoneDraft] = useState(timezone);
  const [reminderAt, setReminderAt] = useState('');
  const [relativeMinutes, setRelativeMinutes] = useState('30');

  useEffect(() => setTimezoneDraft(timezone), [timezone]);

  const updateSpec = (patch: Partial<TaskRecurrenceSpec>) => {
    const base = currentSpec ?? recurrenceSpecFromLegacy('daily', timezone)!;
    const spec = normalizeRecurrenceSpec({ ...base, ...patch });
    onModifySeries({ recurrence: legacyRecurrenceFromSpec(spec), recurrenceSpec: spec });
  };

  const choosePreset = (value: TaskItem['recurrence']) => {
    if (!value || value === 'none') {
      onModifySeries({ recurrence: 'none', recurrenceSpec: undefined });
      return;
    }
    const spec = recurrenceSpecFromLegacy(value, timezone)!;
    if (value === 'monthly') spec.monthDay = anchorDay(task);
    const normalized = normalizeRecurrenceSpec(spec);
    onModifySeries({ recurrence: value, recurrenceSpec: normalized });
  };

  const reminders = task.reminders ?? [];
  const nowInZone = instantToZonedLocal(Date.now(), timezone);

  return (
    <div className="md:col-span-2 rounded-xl border border-cyan-500/15 bg-slate-950/55 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-slate-300 font-semibold">{t('heading')}</div>
          <div className="text-[0.5625rem] text-slate-600">{t('scopeHint')}</div>
        </div>
        {task.recurrenceSeriesId && <span className="text-[0.5625rem] font-mono text-cyan-500/80">{t('series').replace('{index}', String(task.recurrenceIndex ?? 0))} · {task.recurrenceSeriesId}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="space-y-1"><span className="text-slate-500">{t('preset')}</span>
          <select value={task.recurrence ?? 'none'} onChange={(event) => choosePreset(event.target.value as TaskItem['recurrence'])} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200">
            <option value="none">{t('none')}</option><option value="daily">{t('daily')}</option><option value="weekdays">{t('weekdays')}</option><option value="weekly">{t('weekly')}</option><option value="monthly">{t('monthly')}</option><option value="yearly">{t('yearly')}</option>
          </select>
        </label>
        <label className="space-y-1"><span className="text-slate-500">{t('customInterval')}</span><input type="number" min="1" max="999" disabled={!currentSpec} value={currentSpec?.interval ?? 1} onChange={(event) => updateSpec({ interval: Math.max(1, Number(event.target.value) || 1) })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200 disabled:opacity-40" /></label>
        <label className="space-y-1"><span className="text-slate-500">{t('timeZone')}</span><input disabled={!currentSpec} value={timezoneDraft} onChange={(event) => setTimezoneDraft(event.target.value)} onBlur={() => { if (isValidIanaTimeZone(timezoneDraft)) updateSpec({ timezone: timezoneDraft }); else setTimezoneDraft(timezone); }} className={`w-full bg-slate-900 border rounded-lg px-2.5 py-2 text-slate-200 disabled:opacity-40 ${isValidIanaTimeZone(timezoneDraft) ? 'border-white/10' : 'border-rose-500/50'}`} /></label>
      </div>

      {currentSpec?.frequency === 'weekly' && <div className="space-y-1.5"><span className="text-slate-500">{t('selectedWeekdays')}</span><div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((day) => {
        const active = (currentSpec.weekdays ?? []).includes(day.value);
        return <button key={day.value} type="button" onClick={() => updateSpec({ weekdays: active ? (currentSpec.weekdays ?? []).filter((value) => value !== day.value) : [...(currentSpec.weekdays ?? []), day.value] })} className={`px-2 py-1 rounded-md border text-[0.625rem] ${active ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}>{taskWeekdayText(day.value, locale)}</button>;
      })}</div></div>}

      {currentSpec?.frequency === 'monthly' && <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-white/[0.07] bg-slate-900/45 p-2.5">
        <label className="space-y-1"><span className="text-slate-500">{t('monthDayPattern')}</span><div className="flex gap-2"><input type="number" min="1" max="31" value={currentSpec.monthDay ?? anchorDay(task) ?? 1} disabled={Boolean(currentSpec.nthWeekday)} onChange={(event) => updateSpec({ monthDay: Math.max(1, Math.min(31, Number(event.target.value) || 1)), nthWeekday: undefined })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200 disabled:opacity-35" /><button type="button" onClick={() => updateSpec({ monthDay: anchorDay(task) ?? 1, nthWeekday: undefined })} className="px-2 rounded-lg border border-white/10 text-[0.5625rem] text-slate-400">{t('day')}</button></div></label>
        <label className="space-y-1"><span className="text-slate-500">{t('nthWeekdayMonth')}</span><div className="grid grid-cols-2 gap-1.5"><select value={currentSpec.nthWeekday?.ordinal ?? 1} onChange={(event) => updateSpec({ monthDay: undefined, nthWeekday: { ordinal: Number(event.target.value) as 1 | 2 | 3 | 4 | -1, weekday: currentSpec.nthWeekday?.weekday ?? 1 } })} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-slate-200"><option value="1">{t('first')}</option><option value="2">{t('second')}</option><option value="3">{t('third')}</option><option value="4">{t('fourth')}</option><option value="-1">{t('last')}</option></select><select value={currentSpec.nthWeekday?.weekday ?? 1} onChange={(event) => updateSpec({ monthDay: undefined, nthWeekday: { ordinal: currentSpec.nthWeekday?.ordinal ?? 1, weekday: Number(event.target.value) } })} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-2 text-slate-200">{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{taskWeekdayText(day.value, locale)}</option>)}</select></div></label>
      </div>}

      {currentSpec && <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)] gap-2 items-end">
        <label className="space-y-1"><span className="text-slate-500">{t('seriesEnd')}</span><select value={currentSpec.end?.mode ?? 'never'} onChange={(event) => {
          const mode = event.target.value;
          updateSpec({ end: mode === 'count' ? { mode: 'count', count: 10 } : mode === 'until' ? { mode: 'until', until: (task.dueAt ?? task.dueDate ?? nowInZone).slice(0, 10) } : { mode: 'never' } });
        }} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200"><option value="never">{t('noEnd')}</option><option value="count">{t('afterN')}</option><option value="until">{t('endDate')}</option></select></label>
        {currentSpec.end?.mode === 'count' ? <input type="number" min="1" max="100000" value={currentSpec.end.count} onChange={(event) => updateSpec({ end: { mode: 'count', count: Math.max(1, Number(event.target.value) || 1) } })} className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" aria-label={t('afterN')} /> : currentSpec.end?.mode === 'until' ? <input type="date" value={currentSpec.end.until.slice(0, 10)} onChange={(event) => updateSpec({ end: { mode: 'until', until: event.target.value } })} className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" aria-label={t('endDate')} /> : <div className="text-[0.625rem] text-slate-600 pb-2">{t('continues')}</div>}
      </div>}

      {currentSpec?.rrule && <div className="rounded-lg border border-white/[0.07] bg-slate-950 px-2.5 py-2 font-mono text-[0.5625rem] text-cyan-300 break-all">RRULE:{currentSpec.rrule}</div>}

      <div className="border-t border-white/[0.07] pt-3 space-y-2">
        <div className="flex items-center justify-between"><span className="text-slate-400 font-semibold">{t('reminders')}</span><span className="text-[0.5625rem] text-slate-600">{t('reminderCount').replace('{count}', String(reminders.length))}</span></div>
        {reminders.map((reminder) => {
          const effective = effectiveReminderAt(task, reminder);
          const snoozeBase = effective && effective > nowInZone ? effective : nowInZone;
          return <div key={reminder.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 items-center rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-2">
            <input type="checkbox" aria-label={t('enableReminder')} checked={reminder.enabled} onChange={() => onUpdateOccurrence({ reminders: reminders.map((item) => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item) })} />
            <div className="min-w-0"><div className="text-slate-300 truncate">{reminder.at ? reminder.at : t('dueInMinutes').replace('{minutes}', String(reminder.offsetMinutes ?? 0))}</div><div className="text-[0.5625rem] text-slate-600 truncate">{t('effective').replace('{date}', effective ?? t('noDueDate'))}{reminder.snoozedUntil ? t('snoozedTo').replace('{date}', reminder.snoozedUntil) : ''}</div></div>
            <div className="flex gap-1"><button type="button" onClick={() => { const until = snoozeLocalDateTime(snoozeBase, 10); if (until) onUpdateOccurrence({ reminders: snoozeReminder(reminders, reminder.id, until) }); }} className="px-1.5 py-1 rounded border border-white/10 text-[0.5625rem] text-slate-400">{t('tenMinutes')}</button><button type="button" onClick={() => { const until = snoozeLocalDateTime(snoozeBase, 60); if (until) onUpdateOccurrence({ reminders: snoozeReminder(reminders, reminder.id, until) }); }} className="px-1.5 py-1 rounded border border-white/10 text-[0.5625rem] text-slate-400">{t('oneHour')}</button>{reminder.snoozedUntil && <button type="button" onClick={() => onUpdateOccurrence({ reminders: clearReminderSnooze(reminders, reminder.id) })} className="px-1.5 py-1 rounded border border-cyan-500/20 text-[0.5625rem] text-cyan-300">{t('unsnooze')}</button>}<button type="button" aria-label={t('removeReminder')} title={t('removeReminder')} onClick={() => onUpdateOccurrence({ reminders: reminders.filter((item) => item.id !== reminder.id) })} className="px-1.5 py-1 rounded border border-rose-500/20 text-[0.5625rem] text-rose-300">×</button></div>
          </div>;
        })}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="flex gap-1.5"><input type="datetime-local" aria-label={t('addDate')} value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="flex-1 min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /><button type="button" disabled={!reminderAt} onClick={() => { if (!reminderAt) return; onUpdateOccurrence({ reminders: [...reminders, { id: createStableTaskId('reminder'), at: reminderAt, enabled: true }] }); setReminderAt(''); }} className="px-2 rounded-lg bg-amber-700 disabled:opacity-40 text-[0.625rem]">{t('addDate')}</button></div>
          <div className="flex gap-1.5"><input type="number" min="0" max="525600" aria-label={t('minutesBeforeDue')} value={relativeMinutes} onChange={(event) => setRelativeMinutes(event.target.value)} className="flex-1 min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /><button type="button" onClick={() => onUpdateOccurrence({ reminders: [...reminders, { id: createStableTaskId('reminder'), offsetMinutes: Math.max(0, Number(relativeMinutes) || 0), enabled: true }] })} className="px-2 rounded-lg bg-amber-700 text-[0.625rem]">{t('minutesBeforeDue')}</button></div>
        </div>
      </div>

      {currentSpec && <div className="border-t border-white/[0.07] pt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onOperation('skip', 'occurrence')} className="px-2.5 py-1.5 rounded-lg border border-amber-500/20 text-[0.625rem] text-amber-300 hover:bg-amber-500/10">{t('skipOccurrence')}</button>
        <button type="button" onClick={() => onOperation('complete', 'occurrence')} className="px-2.5 py-1.5 rounded-lg border border-emerald-500/20 text-[0.625rem] text-emerald-300 hover:bg-emerald-500/10">{t('completeOccurrence')}</button>
        <button type="button" onClick={() => onOperation('skip', 'series')} className="px-2.5 py-1.5 rounded-lg border border-rose-500/20 text-[0.625rem] text-rose-300 hover:bg-rose-500/10">{t('skipSeries')}</button>
        <button type="button" onClick={() => onOperation('complete', 'series')} className="px-2.5 py-1.5 rounded-lg border border-emerald-500/20 text-[0.625rem] text-emerald-300 hover:bg-emerald-500/10">{t('completeSeries')}</button>
      </div>}
    </div>
  );
};
