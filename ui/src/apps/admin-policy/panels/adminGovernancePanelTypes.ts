// STATUS: PLATIN — gemeinsame Eingabeform der Verwaltungs-Bauteile.
//
// `coreCopy` ist die bestehende Admin-&-Policy-Kopie (Registerkarten, Werte, Fach-Gründe);
// `copy` ist die Verwaltungs-/Durchsetzungs-/Austausch-Kopie. Getrennt, weil die bestehende Kopie
// eingefroren ist und ihre Verträge nicht durch neue Schlüssel brechen sollen.
import type { AdminPolicyModel } from '../model/types';
import type { AdminPolicyRenderCopy } from '../locale/adminPolicyLocale';
import type { AdminPolicyGovernanceCopy } from '../locale/adminPolicyGovernanceLocale';

export interface AdminGovernancePanelProps {
  model: AdminPolicyModel;
  copy: AdminPolicyGovernanceCopy;
  coreCopy: AdminPolicyRenderCopy;
  /** Die handelnde Kennung. Die Modelle dieses Bereichs sind Einzelplatz-Richtlinien, deshalb genau eine. */
  actorId: string;
  /** Persistiert das geänderte Dokument über den Verlauf (Undo/Redo) nach oben. */
  onApply: (next: AdminPolicyModel) => void;
}
