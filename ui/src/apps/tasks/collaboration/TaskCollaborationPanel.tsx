// STATUS: DIAMANT VGT SUPREME
// Astraea Tasks — Task Collaboration Panel (Watchers, Links, Attachments, Comments)
// Schicht 1: Modular Sub-Component

import React, { useState } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import {
  Users,
  Link2,
  Paperclip,
  Download,
  Trash2,
  History,
  FileText,
} from 'lucide-react';
import { TaskItem, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { addTaskWatcher, addWorkspaceDeepLink, isWorkspaceDeepLink, removeTaskWatcher, workspaceDeepLinkKind } from '../model/taskModel';
import { linkableTaskTargets, workspaceDocumentIdFromUri } from '../interchange/taskDerivedDocuments';
import { downloadTaskAttachment, readTaskAttachment } from './taskAttachments';

export interface TaskCollaborationPanelProps {
  selectedTask: TaskItem;
  onUpdateTask: (id: string, patch: Partial<TaskItem>) => void;
  /**
   * AST-1001: creates a Notes document from this task and records the link back on the task.
   * Returns a failure reason, or undefined on success. Absent when the host cannot create documents.
   */
  onTakeTaskIntoNote?: () => string | undefined;
  /** AST-1001: documents this task can be linked to, and the shell's own navigator. */
  documents?: WorkspaceDocument[];
  onOpenDocument?: (documentId: string) => void;
  currentDocumentId?: string;
}

export const TaskCollaborationPanel: React.FC<TaskCollaborationPanelProps> = ({
  selectedTask,
  onUpdateTask,
  onTakeTaskIntoNote,
  documents,
  onOpenDocument,
  currentDocumentId,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [watcherDraft, setWatcherDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // The parent already reports the outcome in the Tasks-wide notice; this keeps the local, visible
  // result next to the button as well, so the control is never a silent no-op.
  const [takeIntoNoteState, setTakeIntoNoteState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [takeIntoNoteMessage, setTakeIntoNoteMessage] = useState<string | undefined>(undefined);

  // A task may be linked to a note or a report without the user having to know or paste a URI.
  const linkTargets = linkableTaskTargets(documents, currentDocumentId);

  const takeIntoNote = () => {
    if (!onTakeTaskIntoNote) {
      setTakeIntoNoteState('failed');
      setTakeIntoNoteMessage(t('This host cannot create a Notes document.'));
      return;
    }
    setTakeIntoNoteState('working');
    setTakeIntoNoteMessage(undefined);
    const error = onTakeTaskIntoNote();
    if (error) {
      setTakeIntoNoteState('failed');
      setTakeIntoNoteMessage(error);
      return;
    }
    setTakeIntoNoteState('done');
    setTakeIntoNoteMessage(t('Note created and linked to this task.'));
  };

  return (
    <>
      {/* Watchers */}
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" /> {t('Watchers')}
          </span>
          <span className="text-[0.625rem] text-slate-500">{t('Local collaboration metadata')}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(selectedTask.watchers ?? []).map((watcher) => (
            <button
              key={watcher}
              type="button"
              onClick={() =>
                onUpdateTask(selectedTask.id, {
                  watchers: removeTaskWatcher(selectedTask.watchers, watcher),
                })
              }
              title={t('Remove watcher')}
              className="px-2 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 text-[0.625rem]"
            >
              {watcher} ×
            </button>
          ))}
          {(selectedTask.watchers ?? []).length === 0 && (
            <span className="text-[0.625rem] text-slate-600">{t('No watchers')}</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={watcherDraft}
            onChange={(e) => setWatcherDraft(e.target.value)}
            placeholder={t('Name or local identity')}
            className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={() => {
              const next = addTaskWatcher(selectedTask.watchers, watcherDraft);
              onUpdateTask(selectedTask.id, { watchers: next });
              setWatcherDraft('');
            }}
            className="px-3 rounded-lg bg-cyan-700 hover:bg-cyan-600"
          >
            {t('Add')}
          </button>
        </div>
      </div>

      {/* Workspace Links */}
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-blue-400" /> {t('Workspace Links')}
          </span>
          <span className="text-[0.625rem] text-slate-500">{t('Deep links remain references')}</span>
        </div>
        <div className="space-y-1.5">
          {(selectedTask.linkedWorkspaceUris ?? []).map((uri) => {
            const targetDocumentId = workspaceDocumentIdFromUri(uri);
            const label = documents?.find((candidate) => candidate.id === targetDocumentId)?.title;
            return (
              <div
                key={uri}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1"><div className="text-[0.5625rem] uppercase tracking-wider text-blue-500">{workspaceDeepLinkKind(uri) ?? 'workspace'}</div><code className="block text-[0.625rem] text-blue-300 truncate">{uri}</code>{label && <div className="text-[0.5625rem] text-slate-500 truncate">{label}</div>}</div>
                {/*
                  AST-1001: a live link is one you can follow. The shell owns navigation, so this
                  calls the navigator it already passes rather than opening anything itself.
                */}
                {onOpenDocument && targetDocumentId ? (
                  <button
                    type="button"
                    data-task-open-link={targetDocumentId}
                    aria-label={t('Open the linked workspace document')}
                    title={t('Open the linked workspace document')}
                    onClick={() => onOpenDocument(targetDocumentId)}
                    className="shrink-0 rounded-md border border-blue-500/25 px-2 py-1 text-[0.5625rem] text-blue-200 transition-colors hover:bg-blue-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2"
                  >
                    {t('Open')}
                  </button>
                ) : (
                  // No navigator in this host: say so, rather than rendering an inert control.
                  <span data-task-open-link-unavailable className="shrink-0 text-[0.5625rem] text-slate-600">{t('Not navigable here')}</span>
                )}
                <button aria-label={t('Delete workspace link')}
                  type="button"
                  onClick={() =>
                    onUpdateTask(selectedTask.id, {
                      linkedWorkspaceUris: (selectedTask.linkedWorkspaceUris ?? []).filter(
                        (item) => item !== uri
                      ),
                    })
                  }
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {(selectedTask.linkedWorkspaceUris ?? []).length === 0 && (
            <div className="text-[0.625rem] text-slate-600">{t('No Workspace links')}</div>
          )}
        </div>

        {/* Pick a note or report instead of pasting a URI. The raw field stays as the manual path. */}
        {linkTargets.length > 0 && (
          <div className="flex gap-2">
            <select
              aria-label={t('Link this task to a note or report')}
              data-task-link-target-picker
              value={linkTargetId}
              onChange={(event) => setLinkTargetId(event.target.value)}
              className="flex-1 min-w-0 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50"
            >
              <option value="">{t('Choose a note or report…')}</option>
              {linkTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.kind} · {target.title}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!linkTargetId}
              onClick={() => {
                if (!linkTargetId) return;
                const next = addWorkspaceDeepLink(selectedTask.linkedWorkspaceUris, `vgt://workspace/document/${encodeURIComponent(linkTargetId)}`);
                onUpdateTask(selectedTask.id, { linkedWorkspaceUris: next });
                setLinkTargetId('');
              }}
              className="px-3 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2"
            >
              {t('Link selected')}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            placeholder="vgt://workspace/document/..."
            className={`flex-1 bg-slate-900 border rounded-lg px-3 py-2 text-slate-100 outline-none ${
              linkDraft && !isWorkspaceDeepLink(linkDraft)
                ? 'border-rose-500/40'
                : 'border-white/10 focus:border-blue-500/50'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              const next = addWorkspaceDeepLink(selectedTask.linkedWorkspaceUris, linkDraft);
              if (next !== selectedTask.linkedWorkspaceUris || isWorkspaceDeepLink(linkDraft)) {
                onUpdateTask(selectedTask.id, { linkedWorkspaceUris: next });
                setLinkDraft('');
              }
            }}
            disabled={!isWorkspaceDeepLink(linkDraft)}
            className="px-3 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40"
          >
            {t('Link')}
          </button>
        </div>

        {/*
          AST-1001: the only way to attach a link used to be pasting a raw vgt:// URI, which is not
          "eine Aufgabe als Live-Link in eine Notiz aufnehmen". This creates the note for real.
        */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[0.625rem] font-semibold text-blue-200">{t('Take into a note')}</div>
              <div className="text-[0.5625rem] text-slate-500">{t('Creates a Notes document with this task and links both ways.')}</div>
            </div>
            <button
              type="button"
              onClick={takeIntoNote}
              disabled={takeIntoNoteState === 'working'}
              aria-busy={takeIntoNoteState === 'working'}
              data-task-take-into-note={takeIntoNoteState}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/15 text-[0.625rem] font-medium text-blue-200 transition-colors hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2"
            >
              <FileText className="w-3 h-3" />
              <span>{takeIntoNoteState === 'working' ? t('Creating note…') : t('Create note from task')}</span>
            </button>
          </div>
          {takeIntoNoteMessage && (
            <p
              role={takeIntoNoteState === 'failed' ? 'alert' : 'status'}
              aria-live={takeIntoNoteState === 'failed' ? 'assertive' : 'polite'}
              data-task-take-into-note-message={takeIntoNoteState}
              className={`text-[0.625rem] ${takeIntoNoteState === 'failed' ? 'text-rose-300' : 'text-emerald-300'}`}
            >
              {takeIntoNoteMessage}
            </p>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-amber-400" /> {t('Attachments')}
          </span>
          <span className="text-[0.625rem] text-slate-500">{t('Max 4 MiB/file · 16 MiB/task')}</span>
        </div>
        <div className="space-y-1.5">
          {(selectedTask.attachments ?? []).map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[0.6875rem] text-slate-200 truncate">{attachment.name}</div>
                <div className="text-[0.5625rem] text-slate-600">
                  {(attachment.sizeBytes / 1024).toFixed(1)} KiB · {attachment.mimeType}
                </div>
              </div>
              {attachment.dataUrl && (
                <button
                  type="button"
                  onClick={() => { setAttachmentError(null); void downloadTaskAttachment(attachment).catch((error: unknown) => setAttachmentError(error instanceof Error ? error.message : t('Attachment download failed.'))); }}
                  className="p-1.5 text-slate-500 hover:text-blue-300"
                  aria-label={t('Download attachment')} title={t('Download attachment')}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onUpdateTask(selectedTask.id, {
                    attachments: (selectedTask.attachments ?? []).filter(
                      (item) => item.id !== attachment.id
                    ),
                  })
                }
                className="p-1.5 text-slate-500 hover:text-rose-400"
                aria-label={t('Remove attachment')} title={t('Remove attachment')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {(selectedTask.attachments ?? []).length === 0 && (
            <div className="text-[0.625rem] text-slate-600">{t('No local attachments')}</div>
          )}
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 cursor-pointer hover:bg-amber-500/15">
          <Paperclip className="w-3.5 h-3.5" />
          <span>{t('Add local attachment')}</span>
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              try {
                setAttachmentError(null);
                const attachment = await readTaskAttachment(file, selectedTask.attachments ?? []);
                onUpdateTask(selectedTask.id, {
                  attachments: [...(selectedTask.attachments ?? []), attachment],
                });
              } catch {
                setAttachmentError(t('Attachment could not be added.'));
              }
            }}
          />
        </label>
        {attachmentError && <div className="text-[0.625rem] text-rose-400">{attachmentError}</div>}
      </div>


      {/* Change provenance */}
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <div className="text-slate-300 font-semibold mb-2">{t('Change author / source')}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[0.625rem]">
          <div className="rounded-lg border border-white/[0.07] bg-slate-900/60 p-2"><div className="text-slate-600">{t('Created by')}</div><div className="text-slate-300 mt-0.5">{selectedTask.createdBy ?? 'legacy'}</div></div>
          <div className="rounded-lg border border-white/[0.07] bg-slate-900/60 p-2"><div className="text-slate-600">{t('Last changed by')}</div><div className="text-slate-300 mt-0.5">{selectedTask.updatedBy ?? selectedTask.createdBy ?? 'legacy'}</div></div>
          <div className="rounded-lg border border-white/[0.07] bg-slate-900/60 p-2"><div className="text-slate-600">{t('Change source')}</div><div className="text-slate-300 mt-0.5 font-mono truncate">{selectedTask.source ?? 'legacy'}</div></div>
        </div>
      </div>


      {/* Activity history */}
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-violet-400" /> {t('Activity')}</span>
          <span className="text-[0.625rem] text-slate-500">{(selectedTask.activity ?? []).length}</span>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {[...(selectedTask.activity ?? [])].reverse().map((event) => (
            <div key={event.id} className="rounded-lg border border-white/[0.08] bg-slate-900/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-3 text-[0.5625rem]"><span className="text-violet-300 font-semibold">{event.actor}</span><span className="text-slate-600">{new Date(event.at).toLocaleString(locale)}</span></div>
              <div className="mt-1 text-[0.6875rem] text-slate-300">{event.summary}</div>
              <div className="mt-1 text-[0.5625rem] text-slate-600">{event.kind}{event.source ? ` · ${event.source}` : ''}</div>
            </div>
          ))}
          {(selectedTask.activity ?? []).length === 0 && <div className="text-[0.625rem] text-slate-600">{t('No activity recorded for this legacy task yet.')}</div>}
        </div>
      </div>
    </>
  );
};
