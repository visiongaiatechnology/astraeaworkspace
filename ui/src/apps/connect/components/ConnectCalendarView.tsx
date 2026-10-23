// STATUS: DIAMANT VGT SUPREME — Astraea Connect Calendar View
//
// BATCH-CONNECT-7: `handleAddEvent` used to insert a fixed event — subject `copy.newEvent`, a hardcoded
// date `2026-09-12`, a hardcoded attendee `lead@vgt.internal` and a fixed description — and then called
// `legacyEventToCore` for its throwing side effect only. The user was shown an event they never created,
// with an attendee who never existed. The form below requires the real fields and validates them through
// the platform event validator before anything is stored.

import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, Users, Plus, Info } from 'lucide-react';
import type { ConnectDocumentModel, ConnectEvent } from '../domain/types';
import { legacyEventToCore } from '../application/connectUiBridge';
import { useConnectCopy } from '../locale/connectLocale';
import { connectEventCategory } from '../locale/connectLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';

interface ConnectCalendarViewProps {
  model: ConnectDocumentModel;
  onUpdateModel: (updater: (prev: ConnectDocumentModel) => ConnectDocumentModel) => void;
}

const EVENT_CATEGORIES: ReadonlyArray<ConnectEvent['category']> = ['engineering', 'security', 'review', 'general'];

interface EventDraft {
  readonly title: string;
  readonly startDate: string;
  readonly startTime: string;
  readonly endDate: string;
  readonly endTime: string;
  readonly location: string;
  readonly attendees: string;
  readonly description: string;
  readonly category: ConnectEvent['category'];
}

const EMPTY_EVENT: EventDraft = {
  title: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00',
  location: '', attendees: '', description: '', category: 'general',
};

export const ConnectCalendarView: React.FC<ConnectCalendarViewProps> = ({
  model,
  onUpdateModel,
}) => {
  const copy = useConnectCopy();
  const { locale } = useWorkspaceLocale();
  const { events } = model;
  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState('');

  const setField = (field: keyof EventDraft, value: string) => setDraft(current => ({ ...current, [field]: value }));

  /**
   * Create the event the user typed. `legacyEventToCore` validates the range through
   * `domain/connectCalendarCore.validateEvent`; a rejection is shown instead of a silent no-op.
   */
  const handleAddEvent = () => {
    const title = draft.title.trim();
    if (!title) { setError('event-title-required'); return; }
    if (!draft.startDate || !draft.endDate) { setError('event-date-required'); return; }
    const attendees = draft.attendees.split(',').map(entry => entry.trim()).filter(Boolean);
    const newEvt: ConnectEvent = {
      id: `evt-${Date.now()}`,
      title: title.slice(0, 1024),
      startDate: draft.startDate,
      startTime: draft.startTime,
      endDate: draft.endDate,
      endTime: draft.endTime,
      location: draft.location.trim() || undefined,
      category: draft.category,
      attendees,
      description: draft.description.trim() || undefined,
    };
    try {
      // The platform validator rejects an invalid range, so nothing unvalidated is stored.
      legacyEventToCore(newEvt);
    } catch {
      setError('event-range-invalid');
      return;
    }
    setError('');
    onUpdateModel(prev => ({ ...prev, events: [...prev.events, newEvt] }));
    setDraft(EMPTY_EVENT);
    setIsFormOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#07050d] text-slate-200 select-none overflow-y-auto">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-purple-500/20">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-400" />
            Connect Calendar · {copy.calendarTitle}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{copy.calendarDescription}</p>
        </div>

        <button
          type="button"
          aria-label={copy.createEvent}
          data-connect-action="calendar-new-event"
          onClick={() => setIsFormOpen(open => !open)}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{copy.newEvent}</span>
        </button>
      </div>

      {isFormOpen && (
        <section data-connect-event-form="true" aria-label={copy.createEvent} className="mb-6 rounded-xl border border-purple-500/30 bg-[#0e0a1b] p-4 space-y-3 text-xs">
          {error && <div role="alert" data-connect-event-error={error} className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-rose-200">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="connect-event-title" className="text-slate-400 block mb-1">{copy.createEvent}</label>
              <input id="connect-event-title" data-connect-event-field="title" value={draft.title} onChange={e => setField('title', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" />
            </div>
            <div>
              <label htmlFor="connect-event-category" className="text-slate-400 block mb-1">{copy.calendar}</label>
              <select id="connect-event-category" data-connect-event-field="category" value={draft.category} onChange={e => setField('category', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100">
                {EVENT_CATEGORIES.map(category => <option key={category} value={category}>{connectEventCategory(locale, category)}</option>)}
              </select>
            </div>
            <div><label htmlFor="connect-event-start-date" className="text-slate-400 block mb-1">startDate</label><input id="connect-event-start-date" type="date" data-connect-event-field="startDate" value={draft.startDate} onChange={e => setField('startDate', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-event-start-time" className="text-slate-400 block mb-1">startTime</label><input id="connect-event-start-time" type="time" data-connect-event-field="startTime" value={draft.startTime} onChange={e => setField('startTime', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-event-end-date" className="text-slate-400 block mb-1">endDate</label><input id="connect-event-end-date" type="date" data-connect-event-field="endDate" value={draft.endDate} onChange={e => setField('endDate', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-event-end-time" className="text-slate-400 block mb-1">endTime</label><input id="connect-event-end-time" type="time" data-connect-event-field="endTime" value={draft.endTime} onChange={e => setField('endTime', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-event-location" className="text-slate-400 block mb-1">location</label><input id="connect-event-location" data-connect-event-field="location" value={draft.location} onChange={e => setField('location', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-event-attendees" className="text-slate-400 block mb-1">attendees</label><input id="connect-event-attendees" data-connect-event-field="attendees" value={draft.attendees} onChange={e => setField('attendees', e.target.value)} placeholder="a@b.c, d@e.f" className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
          </div>
          <div>
            <label htmlFor="connect-event-description" className="text-slate-400 block mb-1">description</label>
            <textarea id="connect-event-description" rows={2} data-connect-event-field="description" value={draft.description} onChange={e => setField('description', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg p-2 text-slate-100" />
          </div>
          <div className="flex justify-end">
            <button type="button" data-connect-action="calendar-create" onClick={handleAddEvent} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold">{copy.createEvent}</button>
          </div>
        </section>
      )}

      {events.length === 0 ? (
        <p data-connect-events-empty="true" className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          {copy.noMessages(copy.calendar)}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((evt) => (
            <div
              key={evt.id}
              data-connect-event={evt.id}
              className="rounded-xl border border-purple-500/20 bg-[#0e0a1b] p-4 space-y-3 hover:border-purple-500/40 transition-all"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm text-purple-200">{evt.title}</h3>
                <span className={`px-2 py-0.5 rounded text-[0.625rem] font-semibold uppercase tracking-wider ${
                  evt.category === 'security'
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/30'
                    : 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                }`}>
                  {connectEventCategory(locale, evt.category)}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>{evt.startDate} • {evt.startTime} – {evt.endTime}</span>
                </div>

                {evt.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>{evt.location}</span>
                  </div>
                )}

                {evt.attendees.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{evt.attendees.join(', ')}</span>
                  </div>
                )}
              </div>

              {evt.description && (
                <p className="text-xs text-slate-300 pt-2 border-t border-purple-500/10 leading-relaxed">
                  {evt.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
