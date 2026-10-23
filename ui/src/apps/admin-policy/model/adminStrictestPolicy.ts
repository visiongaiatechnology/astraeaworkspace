// STATUS: PLATIN — die strengste zulässige Richtlinie als Rückfall, wenn ein Nachweis nicht hält.
//
// **Warum es dieses Modul gibt:** `verifyOrganizationPolicyManifest` verlangt einen
// `strictestFallback` — den Zustand, der gilt, wenn die Signatur nicht verifiziert werden kann. Ohne
// eine Definition dieses Zustands hätte der Aufrufer irgendetwas übergeben; hier steht genau einmal,
// was „strengste Richtlinie" heißt.
//
// **Entscheidung, die begründet sein muss:** der Rückfall ist streng für **Operationen** und
// nachsichtig für die **Administration**. Er behält Rollen, Zuordnungen, Break-Glass-Sitzungen und das
// Auditprotokoll des lokalen Dokuments. Würde er auch die Administration entziehen, könnte ein
// unlesbares Fremddokument die Anwendung dauerhaft sperren — fail-closed heißt „im Zweifel verweigern",
// nicht „im Zweifel unreparierbar". Die Fachbereiche werden auf die verweigernde Einstellung gesetzt.
import type { AdminPolicyModel } from './types';

export function strictestAdminPolicy(base: AdminPolicyModel): AdminPolicyModel {
  return {
    ...base,
    // Nur die lokale Autorität und der Nachweis bleiben: ohne sie wäre der Zustand nicht reparierbar.
    roles: base.roles,
    assignments: base.assignments,
    breakGlass: base.breakGlass,
    devices: base.devices,
    audit: base.audit,
    deployment: {
      ...base.deployment,
      channels: [],
      approvedReleases: [],
      rolloutRings: [],
      requireInstallerSignature: true,
    },
    dlp: { ...base.dlp, rules: [], defaultAction: 'block' },
    network: {
      ...base.network,
      netGateCapabilities: [],
      plugins: { allow: [], deny: [...base.network.plugins.deny], trustedPublishers: [], hashPins: {} },
      automationPackages: { allow: [], deny: [...base.network.automationPackages.deny] },
      externalFormats: { allow: [], deny: [...base.network.externalFormats.deny] },
      providers: { allow: [], deny: [...base.network.providers.deny], externalAiEnabled: false, externalAiMaxSensitivity: 'public' },
      telemetryEnabled: false,
      remoteContentDefault: 'deny',
    },
    privacy: {
      ...base.privacy,
      externalDestinations: base.privacy.externalDestinations.map((destination) => ({ ...destination, enabled: false })),
    },
    lifecycle: { ...base.lifecycle, localMachinePolicy: {} },
    continuity: { ...base.continuity, targets: [], requireOfflineCopy: false },
    updatedAt: Date.now(),
  };
}
