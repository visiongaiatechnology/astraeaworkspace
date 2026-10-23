// STATUS: DIAMANT VGT SUPREME — Paket 19: „Draw-Element als **Live- oder Snapshotobjekt** senden".
//
// ## Zwei echte Wege, ein Wort-Register
//
// Wie im Datengrafik-Panel (und wie im Writer-Wähler): der Zustand ist ein **Wort** (der Zustandswert des
// **geteilten** Verweis-Beschreibers `renderFabricReference` — `current`/`frozen`/`broken`/…), und **zwei
// echte Knöpfe** senden live oder als Schnappschuss. *Kein Modus ohne Klick, kein heimlicher Default.*
//
// ## Der Zeiger-Träger ist kein zweiter Träger
//
// Das Ziel-Element ist `draggable`; der Zug schreibt **den vorhandenen** serialisierten Träger
// (`drawSendCarrierPayload` → `createFabricWorkspaceObjectDragPayload`) in die Übertragung. Ist kein Anker
// vorhanden oder führt die Matrix die Objektart nicht, ist das ein **benannter** Fall (Griff deaktiviert,
// Grund sichtbar) — *kein Ersatzträger, keine Attrappe.* Die Knöpfe sind die **Tastatur-Alternative**:
// Ziehen ist nie der einzige Weg.
import React from 'react';
import type { DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import { drawInteractionText } from '../drawInteractionLocale';
import { listDrawSendElements, type DrawSendElement } from '../integrations/drawSendEngine';

export interface DrawSendPanelProps {
  readonly model: DrawDocumentModel;
  readonly locale: WorkspaceLocale;
  readonly workspaceDocuments: readonly WorkspaceDocument[];
  /** Die Kennung des Elements, das gerade gesendet werden soll (Seite oder Rahmen). */
  readonly element: DrawSendElement;
  readonly onChooseElement: (element: DrawSendElement) => void;
  readonly onSend: (mode: 'Live' | 'Frozen', targetDocumentId: string) => void;
  /** Der **vorhandene** Träger für den Zeigerpfad — `null`, wenn er benannt abgelehnt wird. */
  readonly carrierPayload: (element: DrawSendElement) => string | null;
  readonly sourceDocumentId: string;
  /** Der Zustandswert des Verweises im gewählten Ziel — aus `renderFabricReference`, nicht neu erfunden. */
  readonly status: string | null;
  readonly referenceCount: number;
}

const BUTTON = 'rounded border border-white/15 px-2 py-0.5 text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40';
const FIELD = 'rounded border border-white/15 bg-slate-950 px-1.5 py-0.5 text-[0.625rem] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';

export const DrawSendPanel: React.FC<DrawSendPanelProps> = ({
  model, locale, workspaceDocuments, element, onChooseElement, onSend, carrierPayload, sourceDocumentId, status, referenceCount,
}) => {
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  const [targetId, setTargetId] = React.useState('');
  const targets = workspaceDocuments.filter((document) => document.id !== sourceDocumentId);
  const elements = listDrawSendElements(model);
  const payload = carrierPayload(element);
  const chosenTarget = targetId || targets[0]?.id || '';

  return (
    <section
      data-vgt-panel="send"
      data-vgt-send-targets={targets.length}
      data-vgt-send-references={referenceCount}
      data-vgt-send-status={status ?? 'none'}
      className="flex w-72 flex-col gap-2 overflow-auto border-l border-white/10 bg-slate-900/60 p-3"
      aria-label={t('sendTitle')}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('sendTitle')}</h2>

      {targets.length === 0 ? (
        <p data-vgt-send-empty="no-targets" role="status" className="text-[0.6875rem] text-amber-200">{t('sendNoTargets')}</p>
      ) : null}

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('sendTarget')}
        <select
          data-vgt-send-target="true" className={FIELD} value={chosenTarget}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTargetId(event.target.value)}
          aria-label={t('sendTarget')}
        >
          {targets.map((document) => <option key={document.id} value={document.id}>{document.title || document.id}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('sendStatus')}
        <select
          data-vgt-send-element="true" className={FIELD} value={`${element.kind}:${element.id}`}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const [kind, ...rest] = event.target.value.split(':');
            if (kind === 'page' || kind === 'frame') onChooseElement({ kind, id: rest.join(':') });
          }}
          aria-label={t('sendStatus')}
        >
          {elements.map((candidate) => (
            <option key={`${candidate.kind}:${candidate.id}`} value={`${candidate.kind}:${candidate.id}`}>
              {`${candidate.kind} · ${candidate.id}`}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-1">
        {/* **Zwei echte Knöpfe**: Live oder Schnappschuss — der Modus entsteht durch den Klick. */}
        <button
          type="button" data-vgt-command="send-live" className={BUTTON}
          disabled={!chosenTarget} onClick={() => onSend('Live', chosenTarget)}
        >{t('sendLive')}</button>
        <button
          type="button" data-vgt-command="send-frozen" className={BUTTON}
          disabled={!chosenTarget} onClick={() => onSend('Frozen', chosenTarget)}
        >{t('sendFrozen')}</button>
      </div>

      {/* Der **Zeigerpfad**: derselbe Träger wie in der Fabric-Fläche. Ohne Träger ist der Griff gesperrt. */}
      <div className="flex flex-col gap-1">
        <span
          data-vgt-send-carry={payload ? 'ready' : 'refused'}
          role="button"
          tabIndex={0}
          aria-disabled={payload ? 'false' : 'true'}
          aria-label={t('sendCarry')}
          draggable={payload !== null}
          className={`w-fit rounded border border-white/15 px-2 py-0.5 text-[0.625rem] ${payload ? 'cursor-grab' : 'opacity-40'}`}
          onDragStart={(event: React.DragEvent<HTMLSpanElement>) => {
            if (!payload) { event.preventDefault(); return; }
            event.dataTransfer.setData(FABRIC_WORKSPACE_OBJECT_DRAG_MIME, payload);
            event.dataTransfer.effectAllowed = 'link';
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
            // **Tastatur-Alternative:** Enter/Leertaste senden live — Ziehen ist nie der einzige Weg.
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (chosenTarget) onSend('Live', chosenTarget);
            }
          }}
        >{t('sendCarry')}</span>
        <span className="text-[0.625rem] text-slate-400">
          {`${t('sendStatus')}: ${status ?? 'none'} · ${referenceCount}`}
        </span>
      </div>
    </section>
  );
};

export default DrawSendPanel;
