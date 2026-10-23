// STATUS: PLATIN — Integration & Release, **Paket 22 (Writer)**: die Anbindung der Quellenseite
//
// ## Warum hier **kein** zweiter Mechanismus steht
//
// Diese Schicht **übersetzt nur** ✓ (wie `useWriterWorkspaceDropZone` ✓ und `dragSessionBindings` ✓): der
// Knopf ruft **eine** Funktion ✓ (`carryWriterWorkspaceSection` ✓), das Ziehen schreibt **denselben** Träger
// in **dieselbe** MIME ✓ (`FABRIC_WORKSPACE_OBJECT_DRAG_MIME` ✓, Paket 4 ✓). *Ein zweiter Trägerpfad wäre
// ein zweites Format* ✗.
//
// ## Was hier `NOT_TESTED` bleibt ✗
//
// Das **Binden** ✓: `draggable` ✓, `dragstart` ✓, `dataTransfer.setData` ✓ — dafür braucht es einen Browser
// ✓, den diese Umgebung nicht hat ✓. Geprüft sind der Erzeuger ✓ (`writerWorkspaceCarrier.ts` ✓) und das
// Markup ✓ (`WriterWorkspaceCarrierControl.tsx` ✓).
import { useCallback, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceIntegrationKind, WorkspaceLiveMode } from '../../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  carryWriterWorkspaceSection,
  clearWriterWorkspaceCarrierState,
  createWriterWorkspaceCarrierState,
} from './writerWorkspaceCarrier';
import type { WriterWorkspaceCarrierState } from './writerWorkspaceCarrier';

export interface WriterWorkspaceCarrierOptions {
  /** Das Dokument, dessen Abschnitt bereitgestellt wird ✓ — die Quelle **ist** diese Oberfläche ✓. */
  readonly document: WorkspaceDocument;
}

export interface WriterWorkspaceCarrierBindings {
  readonly state: WriterWorkspaceCarrierState;
  /** Der **Knopf**-Weg ✓ (und damit der Weg ohne Zeiger ✓) — dieselbe Quelle wie das Ziehen ✓. */
  readonly carry: (kind: WorkspaceIntegrationKind, mode?: WorkspaceLiveMode) => void;
  /** Der **Zeiger**-Weg ✓ — schreibt **denselben** Träger in **dieselbe** MIME ✓ (`NOT_TESTED` ✗). */
  readonly onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  readonly clear: () => void;
}

export function useWriterWorkspaceCarrier(options: WriterWorkspaceCarrierOptions): WriterWorkspaceCarrierBindings {
  const { document } = options;
  const [state, setState] = useState<WriterWorkspaceCarrierState>(() => createWriterWorkspaceCarrierState());

  const carry = useCallback((kind: WorkspaceIntegrationKind, mode?: WorkspaceLiveMode) => {
    setState((current) => carryWriterWorkspaceSection(current, {
      document,
      integrationKind: kind,
      // **Bedingtes Spreizen** ✓: ein Modus reist **nur**, wenn er gesagt wurde ✓ (*abwesend statt
      // ausdrücklich `undefined`* ✓) — bei einer Kopie wäre er ein benannter Fehler ✓, kein stiller Zusatz ✗.
      ...(mode === undefined ? {} : { requestedMode: mode }),
    }));
  }, [document]);

  const onDragStart = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const payload = state.carrier?.payload;
    // **Kein stiller Träger** ✗: ohne bereitgestellten Träger beginnt kein Zug ✓.
    if (payload === undefined) return;
    event.dataTransfer.setData(FABRIC_WORKSPACE_OBJECT_DRAG_MIME, payload);
    event.dataTransfer.effectAllowed = 'copyLink';
  }, [state.carrier]);

  const clear = useCallback(() => {
    setState(clearWriterWorkspaceCarrierState());
  }, []);

  return { state, carry, onDragStart, clear };
}
