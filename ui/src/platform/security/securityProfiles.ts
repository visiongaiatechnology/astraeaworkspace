// STATUS: DIAMANT VGT SUPREME — canonical Workspace security-profile policy
import type { SecurityProfile, WorkspaceDocument, WorkspaceSecurityPolicy } from '../../shared/contracts/workspace';

export const INFINITY_SUITE = 'VGT-INFINITY-1' as const;
export const INFINITY_PINNED_COMMIT = '55b05a697a189d0ec583cdcf340beeba1efc9130' as const;
export const ASTRAEA_TOP_SECRET_SUITE = 'VGT-ASTRAEA-TS-1' as const;

export const SECURITY_PROFILE_ORDER: Readonly<Record<SecurityProfile, number>> = {
  STANDARD: 0,
  PQC: 1,
  VGT_TOP_SECRET: 2,
};

export interface SecurityProfileCapabilities {
  nativeCoreAvailable: boolean;
  pqcProviderAvailable: boolean;
  topSecretProviderAvailable: boolean;
  topSecretEnrolled: boolean;
  topSecretUnlocked: boolean;
  infinityIdentityReady: boolean;
  infinitySuite?: string | null;
  infinityCommit?: string | null;
}

export interface SecurityProfileTransition {
  from: SecurityProfile;
  to: SecurityProfile;
  isUpgrade: boolean;
  isDowngrade: boolean;
  requiresFullReseal: true;
  requiresExplicitDowngradeConfirmation: boolean;
  allowed: boolean;
  reason: string;
}

export function normalizeSecurityProfile(value: unknown): SecurityProfile {
  return value === 'PQC' || value === 'VGT_TOP_SECRET' ? value : 'STANDARD';
}

export function securityPolicyForDocument(document: WorkspaceDocument): WorkspaceSecurityPolicy {
  const profile = normalizeSecurityProfile(document.securityPolicy?.profile);
  return {
    profile,
    inherited_from_workspace: document.securityPolicy?.inherited_from_workspace === true,
    downgrade_authorized: document.securityPolicy?.downgrade_authorized === true,
    infinity_suite: profile === 'VGT_TOP_SECRET' ? (document.securityPolicy?.infinity_suite || INFINITY_SUITE) : undefined,
    infinity_commit: profile === 'VGT_TOP_SECRET' ? (document.securityPolicy?.infinity_commit || INFINITY_PINNED_COMMIT) : undefined,
  };
}

export function applySecurityProfile(
  document: WorkspaceDocument,
  profile: SecurityProfile,
  options: { inherited?: boolean; downgradeAuthorized?: boolean } = {},
): WorkspaceDocument {
  const policy: WorkspaceSecurityPolicy = {
    profile,
    inherited_from_workspace: options.inherited === true,
    downgrade_authorized: options.downgradeAuthorized === true,
    infinity_suite: profile === 'VGT_TOP_SECRET' ? INFINITY_SUITE : undefined,
    infinity_commit: profile === 'VGT_TOP_SECRET' ? INFINITY_PINNED_COMMIT : undefined,
  };
  return { ...document, securityPolicy: policy, modified_at: Date.now(), version: Math.max(1, document.version + 1) };
}

export function planSecurityProfileTransition(
  from: SecurityProfile,
  to: SecurityProfile,
  capabilities: SecurityProfileCapabilities,
  downgradeConfirmed = false,
): SecurityProfileTransition {
  const isUpgrade = SECURITY_PROFILE_ORDER[to] > SECURITY_PROFILE_ORDER[from];
  const isDowngrade = SECURITY_PROFILE_ORDER[to] < SECURITY_PROFILE_ORDER[from];
  let allowed = true;
  let reason = 'Profile change requires complete authenticated reseal.';

  if (!capabilities.nativeCoreAvailable && to !== 'STANDARD') {
    allowed = false;
    reason = 'Native security provider is unavailable.';
  } else if (to === 'PQC') {
    // Reserved until the dedicated native PQC adapter is implemented. Never masquerade Standard as PQC.
    allowed = false;
    reason = 'PQC profile is reserved but not operational in this build.';
  } else if (to === 'VGT_TOP_SECRET') {
    const pinned = capabilities.infinitySuite === INFINITY_SUITE && capabilities.infinityCommit === INFINITY_PINNED_COMMIT;
    if (!capabilities.topSecretProviderAvailable || !capabilities.topSecretEnrolled || !capabilities.topSecretUnlocked || !capabilities.infinityIdentityReady || !pinned) {
      allowed = false;
      reason = 'Top Secret requires the pinned Infinity provider, enrolled/unlocked Top Secret KeyVault domain and matching identity.';
    }
  } else if (isDowngrade && !downgradeConfirmed) {
    allowed = false;
    reason = 'Downgrade requires explicit confirmation and complete reseal.';
  }

  return {
    from,
    to,
    isUpgrade,
    isDowngrade,
    requiresFullReseal: true,
    requiresExplicitDowngradeConfirmation: isDowngrade,
    allowed,
    reason,
  };
}

export function assertNoSecurityDowngrade(source: WorkspaceDocument, target: WorkspaceDocument): void {
  const sourceProfile = securityPolicyForDocument(source).profile;
  const targetProfile = securityPolicyForDocument(target).profile;
  if (SECURITY_PROFILE_ORDER[sourceProfile] > SECURITY_PROFILE_ORDER[targetProfile]) {
    throw new Error(`SECURITY_PROFILE_DOWNGRADE_BLOCKED:${sourceProfile}->${targetProfile}`);
  }
}

export function securityProfileLabel(profile: SecurityProfile): string {
  if (profile === 'VGT_TOP_SECRET') return 'VGT Top Secret';
  if (profile === 'PQC') return 'PQC';
  return 'Standard';
}
