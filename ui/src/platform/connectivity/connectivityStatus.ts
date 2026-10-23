// STATUS: DIAMANT VGT SUPREME — bounded local-first connectivity projection.
export interface WorkspaceConnectivityProjection {
  online: boolean;
  label: string;
  detail: string;
  blocking: false;
}

export function deriveWorkspaceConnectivity(online: boolean): WorkspaceConnectivityProjection {
  return online
    ? { online: true, label: 'Online', detail: 'Netzwerk verfügbar · lokale Speicherung bleibt aktiv', blocking: false }
    : { online: false, label: 'Offline — Lokale Speicherung aktiv', detail: 'Netzwerk getrennt · Bearbeitung und lokale Speicherung laufen weiter', blocking: false };
}
