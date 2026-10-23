// STATUS: DIAMANT VGT SUPREME — caller-owned remote materialization and transport session contracts.
// Boolean identity state is a contract input, not proof of cryptographic peer authentication.

import type { WorkspacePermissionRole, WorkspacePermissionsMetadata } from '../../shared/contracts/workspace';
import { boundedId, SyncGraphBoundaryError, SYNCGRAPH_MAX_FRAME_BYTES } from './syncGraphIngressPolicy';

const ROLE_RANK: Record<WorkspacePermissionRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
export function authorizeRemoteMaterialization(
  permissions: WorkspacePermissionsMetadata | undefined,
  memberId: string,
  deviceId: string,
  required: 'commenter' | 'editor' = 'editor',
  now = Date.now(),
): void {
  if (!permissions) throw new SyncGraphBoundaryError('POLICY');
  const member = boundedId(memberId, 'member id');
  const device = boundedId(deviceId, 'device id');
  const grant = permissions.grants.find((candidate) => candidate.principalId === member
    && (!candidate.deviceIds || candidate.deviceIds.includes(device))
    && (candidate.expiresAt === undefined || candidate.expiresAt > now));
  if (!grant || ROLE_RANK[grant.role] < ROLE_RANK[required]) throw new SyncGraphBoundaryError('POLICY');
}

export interface AuthenticatedTransportIdentity {
  memberId: string;
  deviceId: string;
  keyId: string;
  membershipEpoch: number;
  authenticated: boolean;
}
export interface EncryptedSyncTransportFrame {
  version: 1;
  documentId: string;
  sessionId: string;
  membershipEpoch: number;
  senderDeviceId: string;
  ciphertext: Uint8Array;
}
export interface SyncTransportAdapter {
  readonly id: string;
  readonly kind: 'lan' | 'self-hosted' | 'plugin';
  readonly identity: AuthenticatedTransportIdentity;
  send(frame: EncryptedSyncTransportFrame, signal?: AbortSignal): Promise<void>;
}

export function validateTransportFrame(frame: EncryptedSyncTransportFrame, identity: AuthenticatedTransportIdentity): void {
  if (frame.version !== 1 || frame.ciphertext.byteLength === 0 || frame.ciphertext.byteLength > SYNCGRAPH_MAX_FRAME_BYTES) throw new SyncGraphBoundaryError('BOUNDS');
  boundedId(frame.documentId, 'frame document'); boundedId(frame.sessionId, 'frame session'); boundedId(frame.senderDeviceId, 'frame sender');
  if (!identity.authenticated || frame.senderDeviceId !== identity.deviceId || frame.membershipEpoch !== identity.membershipEpoch) throw new SyncGraphBoundaryError('POLICY');
}

export interface MembershipRotationPlan {
  previousEpoch: number;
  nextEpoch: number;
  revokeOldSessions: true;
  discardQueuedCiphertextForOldEpoch: true;
  rotateTransportSessionKeys: true;
}
export function deriveMembershipRotationPlan(previousEpoch: number, nextEpoch: number): MembershipRotationPlan {
  if (!Number.isSafeInteger(previousEpoch) || !Number.isSafeInteger(nextEpoch) || previousEpoch < 0 || nextEpoch <= previousEpoch) throw new SyncGraphBoundaryError('INVALID');
  return { previousEpoch, nextEpoch, revokeOldSessions: true, discardQueuedCiphertextForOldEpoch: true, rotateTransportSessionKeys: true };
}

export function assertPeerSessionCurrent(identity: AuthenticatedTransportIdentity, currentEpoch: number, revokedDeviceIds: ReadonlySet<string>): void {
  if (!identity.authenticated || !Number.isSafeInteger(currentEpoch) || identity.membershipEpoch !== currentEpoch || revokedDeviceIds.has(identity.deviceId)) throw new SyncGraphBoundaryError('POLICY');
  boundedId(identity.memberId, 'member id'); boundedId(identity.deviceId, 'device id'); boundedId(identity.keyId, 'key id');
}
