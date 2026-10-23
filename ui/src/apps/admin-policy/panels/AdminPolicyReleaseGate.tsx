// STATUS: PLATIN — sichtbare Beta-Sperre für Admin & Policy (Sicherheits-Gate).
//
// **Der Befund, der diese Ansicht erzwingt:** Die Konsole zeigt und bewertet Richtlinien (DLP, Retention,
// Netzwerk, Schlüssel, Rollen), aber **kein** Workspace-Modul liest diese Richtlinien als
// Durchsetzungspunkt. Eine angezeigte Regel ist keine durchgesetzte Regel. Bevor die Beta eine
// Governance-Zusage macht, die sie nicht halten kann, wird die App gesperrt — Daten bleiben erhalten,
// es wird nichts geschrieben und keine Einstellung vorgetäuscht.
//
// **Keine Lockerung:** Diese Ansicht entfernt keine bestehenden Prüfungen. Sie verhindert nur, dass ein
// halbfertiges Sicherheitsversprechen als Produktfunktion angeboten wird. Sobald die Durchsetzung an den
// echten Operationsstellen verdrahtet und getestet ist, wird der Gate-Status in `edition/releaseStatus.ts`
// umgestellt — nicht hier.

import React from 'react';
import { ShieldAlert, LockKeyhole } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { releaseStatusDetail, releaseStatusLabel } from '../../../edition/releaseStatus';

export interface AdminPolicyReleaseGateProps {
  /** Nur für Diagnose/DOM-Verträge; der Text stammt immer aus der Edition-Registry. */
  documentId?: string;
}

export const AdminPolicyReleaseGate: React.FC<AdminPolicyReleaseGateProps> = ({ documentId }) => {
  const { locale } = useWorkspaceLocale();
  const label = releaseStatusLabel('AdminPolicy', locale);
  const detail = releaseStatusDetail('AdminPolicy', locale);
  const german = locale.toLowerCase().startsWith('de');
  return (
    <section
      data-release-gate="security-gate-blocked"
      data-release-status="security-gate-blocked"
      data-admin-policy-release-gate="blocked"
      data-release-gate-document={documentId}
      role="region"
      aria-label={label}
      className="flex h-full flex-1 items-center justify-center overflow-y-auto bg-[#07050d] p-6 text-slate-100"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-rose-500/40 bg-[#120a14]/90 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-rose-100">{label}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
            {german ? 'Was das für diese Alpha bedeutet' : 'What this means for this Alpha'}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-300">
            {(german ? [
              'Die Konsole zeigt und bewertet Richtlinien (Zugriff, Geräte, Verschlüsselung, DLP, Aufbewahrung, Netzwerk, Audit, Kontinuität).',
              'Kein Workspace-Modul wertet diese Richtlinien an seinen echten Operationsstellen aus — Kopieren, Export, Drucken, Netzwerk und Verschlüsselung laufen unabhängig davon.',
              'Admin & Policy wird in dieser Alpha deshalb nicht neu angelegt und nicht als bearbeitbare Konsole angeboten.',
              'Bestehende Richtliniendaten bleiben erhalten; diese Ansicht schreibt nichts und ändert nichts.',
            ] : [
              'The console displays and evaluates policies (access, devices, encryption, DLP, retention, network, audit, continuity).',
              'No Workspace module consults these policies at its real operation sites — copy, export, print, network and encryption run independently.',
              'Admin & Policy is therefore not creatable in this Alpha and not offered as an editable console.',
              'Existing policy data is preserved; this view writes nothing and changes nothing.',
            ]).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>

        <p className="mt-4 text-[11px] leading-5 text-slate-500">
          {german
            ? 'Statusquelle: zentrale Release-Registry (ui/src/edition/releaseStatus.ts). Diese Sperre ist eine Ehrlichkeits-/Gate-Maßnahme, keine Lockerung bestehender Sicherheitsprüfungen.'
            : 'Status source: central release registry (ui/src/edition/releaseStatus.ts). This lock is an honesty/gate measure, not a relaxation of existing security checks.'}
        </p>
      </div>
    </section>
  );
};

export default AdminPolicyReleaseGate;
