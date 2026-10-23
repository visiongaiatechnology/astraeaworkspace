// STATUS: DIAMANT VGT SUPREME — what state is this embedded object in, and does the user see it?
//
// Three findings meet here, and they are one question:
//
//   W-251  A frozen snapshot looked exactly like a live one. "It does not change because I froze it" and
//          "it does not change because the source is gone" are different truths, and the interface told
//          neither — so the user could not tell a deliberate decision from a broken link.
//   W-245  A dead link (source document deleted) kept the last content in place with **no** visible warning,
//          so the user took it for current. That is the dangerous case: silently stale content.
//   W-254  A snapshot whose source was deleted was not marked as orphaned.
//
// The panel already knows everything needed: `mode` is on the embed, and the workspace shell knows which
// documents exist (open ones and stored metadata). So the decision is pure and this module states it once.
//
// Design rules applied (vgt-ui-ux-supreme): every state carries **text**, not only colour (21.1); the error
// text is concrete and does not blame the user (11.6, 25.1); and an action that cannot work is not offered
// (`canOpenSource`).

import type { WriterWorkspaceEmbedMode } from '../../../../shared/contracts/workspace';

/** What the caller knows about the source document. `unknown` means "nobody told me" — not "it is fine". */
export type WriterWorkspaceSourcePresence = 'available' | 'missing' | 'unknown';

export type WriterWorkspaceEmbedStateCode =
  | 'live'
  | 'frozen'
  | 'live-source-missing'
  | 'frozen-orphaned';

export interface WriterWorkspaceEmbedState {
  readonly code: WriterWorkspaceEmbedStateCode;
  /** Short text for the header badge. Never a colour-only signal. */
  readonly badge: string;
  /** The sentence shown with the object, or `null` when there is nothing the user must know. */
  readonly detail: string | null;
  /** `warning` means the content will no longer follow its source. */
  readonly tone: 'ok' | 'frozen' | 'warning';
  /** Whether offering "open source" would be honest. */
  readonly canOpenSource: boolean;
}

export interface WriterWorkspaceEmbedStateInput {
  readonly mode: WriterWorkspaceEmbedMode;
  readonly presence: WriterWorkspaceSourcePresence;
}

export function resolveWriterWorkspaceEmbedState(
  input: WriterWorkspaceEmbedStateInput,
): WriterWorkspaceEmbedState {
  const frozen = input.mode === 'Snapshot';
  if (input.presence === 'missing') {
    return frozen
      ? {
          code: 'frozen-orphaned',
          badge: 'Eingefroren · Quelle fehlt',
          detail:
            'Die Quelldatei ist nicht mehr im Arbeitsbereich. Der eingefrorene Stand bleibt erhalten — er ist der letzte, den es gab.',
          tone: 'warning',
          canOpenSource: false,
        }
      : {
          code: 'live-source-missing',
          badge: 'Quelle fehlt',
          detail:
            'Die Quelldatei ist nicht mehr im Arbeitsbereich. Der zuletzt bekannte Inhalt bleibt sichtbar, wird aber nicht mehr aktualisiert.',
          tone: 'warning',
          canOpenSource: false,
        };
  }
  if (frozen) {
    return {
      code: 'frozen',
      badge: 'Eingefroren',
      detail:
        'Dieser Ausschnitt ist eingefroren: Er zeigt den Stand vom Zeitpunkt des Einfügens und ändert sich nicht mit der Quelle.',
      tone: 'frozen',
      // Reaching here means the source is **not** known to be gone: `missing` returned above. Only a source
      // known to be gone withdraws the action — `unknown` must not become a claim that it is gone. My first
      // version withdrew it for `unknown` too; the test caught it, and the typechecker then showed that the
      // remaining comparison was dead code.
      canOpenSource: true,
    };
  }
  return {
    code: 'live',
    badge: 'Live',
    // Nothing to explain: the object follows its source.
    detail: null,
    tone: 'ok',
    canOpenSource: true,
  };
}
