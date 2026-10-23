// STATUS: DIAMANT VGT SUPREME — explicit Notes offline/local-first state
//
// AST-0741 acceptance: "Notiz ohne Netzwerk editieren, schließen und unverändert öffnen."
// The Notes mutation path performs no network call at all, so an offline edit is the normal case. What was
// missing is that the user could not *see* which mode they are in. This module owns that state; the footer
// only renders it, and the state is distinguishable without colour alone.

export type NotesConnectivity = 'online' | 'offline' | 'unknown';

export interface NotesOfflineState {
  connectivity: NotesConnectivity;
  /** Visible text; never relies on colour to carry the meaning. */
  label: string;
  detail: string;
  /** True when everything the user can do in Notes stays local. Always true: see NOTES_NETWORK_OPERATIONS. */
  localOnly: boolean;
}

/**
 * Named list of Notes operations that require the network. It is empty on purpose: this is the auditable
 * statement behind the "local-first" claim in the UI, and a future network feature must add itself here.
 */
export const NOTES_NETWORK_OPERATIONS: readonly string[] = Object.freeze([]);

export function notesRequireNetwork(): boolean {
  return NOTES_NETWORK_OPERATIONS.length > 0;
}

export function resolveNotesOfflineState(input: { onLine: boolean | undefined; protectedNote: boolean }): NotesOfflineState {
  const connectivity: NotesConnectivity = input.onLine === true ? 'online' : input.onLine === false ? 'offline' : 'unknown';
  if (connectivity === 'offline') {
    return {
      connectivity,
      label: 'Offline',
      detail: 'No network. Editing, attachments, search and revision history stay local, and reopening restores the same payload.',
      localOnly: true,
    };
  }
  if (connectivity === 'unknown') {
    return {
      connectivity,
      label: 'Network state unknown',
      detail: 'Notes never contacts a network service, so editing stays local either way.',
      localOnly: true,
    };
  }
  return {
    connectivity,
    label: 'Online',
    detail: input.protectedNote
      ? 'Notes still performs no network operation; the protected note stays locked until the additional-unlock policy is satisfied.'
      : 'Notes performs no network operation. Local-first editing is unchanged.',
    localOnly: true,
  };
}
