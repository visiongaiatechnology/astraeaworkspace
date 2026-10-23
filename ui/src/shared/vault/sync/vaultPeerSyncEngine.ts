// STATUS: DIAMANT VGT SUPREME — Optional local-first Vault peer sync core.
import type {
  VaultFile,
  VaultFolder,
  VaultPeerDevice,
  VaultPeerFileManifest,
  VaultPeerResumeState,
  VaultPeerSyncPolicy,
  VaultPeerTransportKind,
} from '../../contracts/workspace';

import { LinearPattern } from '../../patterns/linearPattern';
const DEFAULT_BLOCK_SIZE = 64 * 1024;
const MIN_BLOCK_SIZE = 16 * 1024;
const MAX_BLOCK_SIZE = 1024 * 1024;
const MAX_BLOCKS = 8192;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_IGNORE_PATTERNS = 64;
const MAX_PATTERN_LENGTH = 160;
const MAX_SELECTION_IDS = 4096;
const MAX_BANDWIDTH_KIB = 1024 * 1024;
const MAX_PAIR_LABEL = 96;
const MAX_RESUME_BLOCKS = MAX_BLOCKS;

export const DEFAULT_VAULT_PEER_SYNC_POLICY: VaultPeerSyncPolicy = {
  version: 1,
  enabled: false,
  selectedFolderIds: [],
  selectedFileIds: [],
  ignorePatterns: [],
  bandwidthLimitKibPerSec: 0,
  lanDiscoveryEnabled: false,
  relayEnabled: false,
  conflictStrategy: 'three_way_text_else_conflict_copy',
  onlineOnlyPlaceholders: { enabled: false, requiresRobustOsIntegration: true },
};

export interface VaultPairingOffer {
  version: 1;
  deviceId: string;
  label: string;
  createdAt: number;
  nonce: string;
  publicKeyJwk: JsonWebKey;
}

export interface VaultPairingContext {
  offer: VaultPairingOffer;
  privateKey: CryptoKey;
}

export interface VaultPairingResult {
  peer: VaultPeerDevice;
  verificationCode: string;
  sharedSecretDigest: string;
}

export interface VaultPeerDeltaPlan {
  fileId: string;
  blockSize: number;
  neededBlockIndexes: number[];
  skippedResumeIndexes: number[];
  transferBytes: number;
  completeWithoutTransfer: boolean;
}

export interface VaultPeerIncomingBlock {
  index: number;
  bytes: Uint8Array;
}

export interface VaultPeerStagedFile {
  fileId: string;
  fileName: string;
  temporaryName: string;
  contentHash: string;
  bytes: Uint8Array;
  verifiedAt: number;
}

export interface VaultPeerConflictResolution {
  kind: 'remote' | 'local' | 'merged' | 'conflict_copy';
  bytes: Uint8Array;
  conflictName?: string;
}

export interface VaultPeerTransportDescriptor {
  kind: VaultPeerTransportKind;
  peerId: string;
  endpoint?: string;
}

function webCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('vault_peer_webcrypto_unavailable');
  return globalThis.crypto;
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(16);
  webCrypto().getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function canonicalJwk(jwk: JsonWebKey): string {
  return JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await webCrypto().subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(bytes));
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))).slice(0, MAX_SELECTION_IDS);
}

function normalizeIgnorePatterns(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).map((value) => value.slice(0, MAX_PATTERN_LENGTH)))).slice(0, MAX_IGNORE_PATTERNS);
}

export function normalizeVaultPeerSyncPolicy(policy?: Partial<VaultPeerSyncPolicy> | null): VaultPeerSyncPolicy {
  if ((policy as { onlineOnlyPlaceholders?: { enabled?: unknown } } | null | undefined)?.onlineOnlyPlaceholders?.enabled === true) throw new Error('vault_peer_online_only_requires_robust_os_integration');
  const bandwidth = Number(policy?.bandwidthLimitKibPerSec ?? 0);
  const relayEndpoint = typeof policy?.relayEndpoint === 'string' ? policy.relayEndpoint.trim().slice(0, 1024) : undefined;
  if (relayEndpoint && !/^wss:\/\//i.test(relayEndpoint)) throw new Error('vault_peer_relay_requires_wss');
  return {
    version: 1,
    enabled: policy?.enabled === true,
    selectedFolderIds: normalizeIds(policy?.selectedFolderIds),
    selectedFileIds: normalizeIds(policy?.selectedFileIds),
    ignorePatterns: normalizeIgnorePatterns(policy?.ignorePatterns),
    bandwidthLimitKibPerSec: Number.isFinite(bandwidth) ? Math.max(0, Math.min(MAX_BANDWIDTH_KIB, Math.floor(bandwidth))) : 0,
    lanDiscoveryEnabled: policy?.lanDiscoveryEnabled === true,
    relayEnabled: policy?.relayEnabled === true,
    relayEndpoint,
    conflictStrategy: 'three_way_text_else_conflict_copy',
    onlineOnlyPlaceholders: { enabled: false, requiresRobustOsIntegration: true },
  };
}

export async function createVaultPairingContext(label: string): Promise<VaultPairingContext> {
  const trimmed = label.trim().slice(0, MAX_PAIR_LABEL) || 'Astraea Device';
  const keyPair = await webCrypto().subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  ) as CryptoKeyPair;
  const publicKeyJwk = await webCrypto().subtle.exportKey('jwk', keyPair.publicKey);
  const nonceBytes = new Uint8Array(16);
  webCrypto().getRandomValues(nonceBytes);
  return {
    privateKey: keyPair.privateKey,
    offer: {
      version: 1,
      deviceId: randomId('peer'),
      label: trimmed,
      createdAt: Date.now(),
      nonce: bytesToHex(nonceBytes),
      publicKeyJwk,
    },
  };
}

async function importPairPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('vault_peer_pairing_public_key_invalid');
  }
  return webCrypto().subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

export async function previewVaultPairing(context: VaultPairingContext, remoteOffer: VaultPairingOffer): Promise<VaultPairingResult> {
  if (remoteOffer.version !== 1 || !remoteOffer.deviceId || remoteOffer.deviceId === context.offer.deviceId) throw new Error('vault_peer_pairing_offer_invalid');
  if (Math.abs(Date.now() - remoteOffer.createdAt) > 10 * 60 * 1000) throw new Error('vault_peer_pairing_offer_expired');
  if (!/^[0-9a-f]{32}$/i.test(remoteOffer.nonce)) throw new Error('vault_peer_pairing_nonce_invalid');
  const remotePublic = await importPairPublicKey(remoteOffer.publicKeyJwk);
  const shared = new Uint8Array(await webCrypto().subtle.deriveBits({ name: 'ECDH', public: remotePublic }, context.privateKey, 256));
  const orderedIds = [context.offer.deviceId, remoteOffer.deviceId].sort().join(':');
  const transcript = utf8(`ASTRAEA_VAULT_PAIR_V1:${orderedIds}:${shared ? bytesToHex(shared) : ''}`);
  const verificationDigest = await sha256Bytes(transcript);
  const verificationCode = Array.from(verificationDigest.slice(0, 4), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  const publicKeyFingerprint = await sha256Hex(utf8(canonicalJwk(remoteOffer.publicKeyJwk)));
  const sharedSecretDigest = await sha256Hex(shared);
  shared.fill(0);
  return {
    verificationCode,
    sharedSecretDigest,
    peer: {
      id: remoteOffer.deviceId,
      label: remoteOffer.label.trim().slice(0, MAX_PAIR_LABEL) || 'Astraea Peer',
      publicKeyJwk: remoteOffer.publicKeyJwk,
      publicKeyFingerprint,
      pairedAt: Date.now(),
      trusted: true,
      allowedTransports: ['lan', 'relay'],
    },
  };
}

export async function finalizeVaultPairing(context: VaultPairingContext, remoteOffer: VaultPairingOffer, confirmedVerificationCode: string): Promise<VaultPairingResult> {
  const result = await previewVaultPairing(context, remoteOffer);
  if (confirmedVerificationCode.trim().toUpperCase() !== result.verificationCode) throw new Error('vault_peer_pairing_verification_mismatch');
  return result;
}

export async function buildVaultPeerFileManifest(file: Pick<VaultFile, 'id' | 'name'>, bytes: Uint8Array, vectorClock: Record<string, number> = {}, blockSize = DEFAULT_BLOCK_SIZE): Promise<VaultPeerFileManifest> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('vault_peer_file_too_large');
  const normalizedBlockSize = Math.max(MIN_BLOCK_SIZE, Math.min(MAX_BLOCK_SIZE, Math.floor(blockSize)));
  const totalBlocks = Math.max(1, Math.ceil(bytes.byteLength / normalizedBlockSize));
  if (totalBlocks > MAX_BLOCKS) throw new Error('vault_peer_block_count_exceeded');
  const blocks: VaultPeerFileManifest['blocks'] = [];
  for (let index = 0; index < totalBlocks; index += 1) {
    const offset = index * normalizedBlockSize;
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + normalizedBlockSize));
    blocks.push({ index, offset, sizeBytes: chunk.byteLength, hash: await sha256Hex(chunk) });
  }
  return {
    version: 1,
    fileId: file.id,
    fileName: file.name,
    sizeBytes: bytes.byteLength,
    blockSize: normalizedBlockSize,
    contentHash: await sha256Hex(bytes),
    blocks,
    vectorClock: { ...vectorClock },
  };
}

function normalizeResume(resume: VaultPeerResumeState | undefined, manifest: VaultPeerFileManifest): number[] {
  if (!resume || resume.fileId !== manifest.fileId) return [];
  return Array.from(new Set(resume.acknowledgedBlockIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < manifest.blocks.length))).slice(0, MAX_RESUME_BLOCKS);
}

export function planVaultPeerDelta(local: VaultPeerFileManifest | undefined, remote: VaultPeerFileManifest, resume?: VaultPeerResumeState): VaultPeerDeltaPlan {
  if (remote.version !== 1 || remote.blocks.length > MAX_BLOCKS || remote.sizeBytes > MAX_FILE_BYTES) throw new Error('vault_peer_manifest_rejected');
  const acknowledged = new Set(normalizeResume(resume, remote));
  const localHashes = new Map((local?.blocks ?? []).map((block) => [block.index, block.hash]));
  const needed = remote.blocks.filter((block) => localHashes.get(block.index) !== block.hash && !acknowledged.has(block.index)).map((block) => block.index);
  const skippedResumeIndexes = remote.blocks.filter((block) => acknowledged.has(block.index) && localHashes.get(block.index) !== block.hash).map((block) => block.index);
  const transferBytes = remote.blocks.filter((block) => needed.includes(block.index)).reduce((sum, block) => sum + block.sizeBytes, 0);
  return { fileId: remote.fileId, blockSize: remote.blockSize, neededBlockIndexes: needed, skippedResumeIndexes, transferBytes, completeWithoutTransfer: needed.length === 0 && skippedResumeIndexes.length === 0 && local?.contentHash === remote.contentHash };
}

export function updateVaultPeerResumeState(current: VaultPeerResumeState | undefined, peerId: string, manifest: VaultPeerFileManifest, acknowledgedIndex: number): VaultPeerResumeState {
  if (!manifest.blocks.some((block) => block.index === acknowledgedIndex)) throw new Error('vault_peer_resume_block_invalid');
  const indexes = new Set(current?.fileId === manifest.fileId ? current.acknowledgedBlockIndexes : []);
  indexes.add(acknowledgedIndex);
  const normalized = Array.from(indexes).filter((index) => manifest.blocks.some((block) => block.index === index)).sort((a, b) => a - b).slice(0, MAX_RESUME_BLOCKS);
  const transferredBytes = manifest.blocks.filter((block) => normalized.includes(block.index)).reduce((sum, block) => sum + block.sizeBytes, 0);
  return { sessionId: current?.sessionId ?? randomId('sync'), fileId: manifest.fileId, peerId, acknowledgedBlockIndexes: normalized, transferredBytes, updatedAt: Date.now() };
}

export async function stageVaultPeerIncomingFile(manifest: VaultPeerFileManifest, baseBytes: Uint8Array | undefined, incomingBlocks: VaultPeerIncomingBlock[]): Promise<VaultPeerStagedFile> {
  if (manifest.sizeBytes > MAX_FILE_BYTES || manifest.blocks.length > MAX_BLOCKS) throw new Error('vault_peer_manifest_rejected');
  const output = new Uint8Array(manifest.sizeBytes);
  if (baseBytes) output.set(baseBytes.subarray(0, Math.min(baseBytes.length, output.length)));
  const incoming = new Map(incomingBlocks.map((block) => [block.index, block.bytes]));
  for (const descriptor of manifest.blocks) {
    const candidate = incoming.get(descriptor.index) ?? output.subarray(descriptor.offset, descriptor.offset + descriptor.sizeBytes);
    if (candidate.byteLength !== descriptor.sizeBytes) throw new Error('vault_peer_block_size_mismatch');
    if (await sha256Hex(candidate) !== descriptor.hash) throw new Error('vault_peer_block_hash_mismatch');
    output.set(candidate, descriptor.offset);
  }
  if (await sha256Hex(output) !== manifest.contentHash) throw new Error('vault_peer_content_hash_mismatch');
  return {
    fileId: manifest.fileId,
    fileName: manifest.fileName,
    temporaryName: `.${manifest.fileName}.astraea-sync-${randomId('tmp').slice(-12)}`,
    contentHash: manifest.contentHash,
    bytes: output,
    verifiedAt: Date.now(),
  };
}

function globToLinearPattern(pattern: string): LinearPattern {
  let source = '^';
  for (const char of pattern.normalize('NFC')) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += '.+*?^$()[]{}|\\'.includes(char) ? `\\${char}` : char;
  }
  source += '$';
  return new LinearPattern(source, {
    caseInsensitive: true,
    limits: { maxPatternLength: MAX_PATTERN_LENGTH * 3, maxInputLength: 4096, maxStates: 4096, maxMatches: 1, maxRepeat: 128 },
  });
}

export function shouldVaultPeerSyncFile(file: VaultFile, folders: VaultFolder[], policyInput?: Partial<VaultPeerSyncPolicy> | null): boolean {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  if (!policy.enabled || file.status === 'quarantined' || file.status === 'corrupt' || file.status === 'missing') return false;
  const byFile = policy.selectedFileIds.includes(file.id);
  const byFolder = !!file.folderId && policy.selectedFolderIds.includes(file.folderId);
  const noExplicitSelection = policy.selectedFileIds.length === 0 && policy.selectedFolderIds.length === 0;
  if (!noExplicitSelection && !byFile && !byFolder) return false;
  const folder = folders.find((candidate) => candidate.id === file.folderId);
  const path = `${folder?.name ?? ''}/${file.name}`.replace(/^\//, '');
  return !policy.ignorePatterns.some((pattern) => globToLinearPattern(pattern).test(file.name) || globToLinearPattern(pattern).test(path));
}

export function peerSyncTransferAllowanceBytes(policyInput: Partial<VaultPeerSyncPolicy> | null | undefined, elapsedMs: number): number {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  if (policy.bandwidthLimitKibPerSec === 0) return Number.MAX_SAFE_INTEGER;
  const safeElapsed = Math.max(0, Math.min(60_000, Math.floor(elapsedMs)));
  return Math.floor((policy.bandwidthLimitKibPerSec * 1024 * safeElapsed) / 1000);
}


export interface VaultPeerDiscoveryCandidate {
  peerId: string;
  label: string;
  endpoint: string;
  publicKeyFingerprint: string;
}

export interface VaultPeerLanDiscoveryAdapter {
  discover(): Promise<VaultPeerDiscoveryCandidate[]>;
}

export async function discoverVaultLanPeers(
  policyInput: Partial<VaultPeerSyncPolicy> | null | undefined,
  networkCapability: 'None' | 'LocalLanOnly' | 'WhitelistedOnly' | 'FullUserApproved',
  adapter: VaultPeerLanDiscoveryAdapter,
): Promise<VaultPeerDiscoveryCandidate[]> {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  if (!policy.enabled || !policy.lanDiscoveryEnabled) return [];
  if (networkCapability === 'None') throw new Error('vault_peer_network_capability_blocked');
  const discovered = await adapter.discover();
  return discovered
    .filter((candidate) => candidate.peerId && candidate.label && candidate.endpoint && /^[0-9a-f]{64}$/i.test(candidate.publicKeyFingerprint))
    .slice(0, 64)
    .map((candidate) => ({ ...candidate, label: candidate.label.slice(0, MAX_PAIR_LABEL), endpoint: candidate.endpoint.slice(0, 512) }));
}

export function selectVaultPeerTransferBatch(
  plan: VaultPeerDeltaPlan,
  manifest: VaultPeerFileManifest,
  policyInput: Partial<VaultPeerSyncPolicy> | null | undefined,
  elapsedMs: number,
): number[] {
  const allowance = peerSyncTransferAllowanceBytes(policyInput, elapsedMs);
  if (allowance === Number.MAX_SAFE_INTEGER) return [...plan.neededBlockIndexes];
  let used = 0;
  const batch: number[] = [];
  const needed = new Set(plan.neededBlockIndexes);
  for (const block of manifest.blocks) {
    if (!needed.has(block.index)) continue;
    if (used + block.sizeBytes > allowance) break;
    used += block.sizeBytes;
    batch.push(block.index);
  }
  return batch;
}

export function assertVaultPeerTransportAllowed(policyInput: Partial<VaultPeerSyncPolicy> | null | undefined, transport: VaultPeerTransportDescriptor, networkCapability: 'None' | 'LocalLanOnly' | 'WhitelistedOnly' | 'FullUserApproved'): void {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  if (!policy.enabled) throw new Error('vault_peer_sync_disabled');
  if (transport.kind === 'lan') {
    if (!policy.lanDiscoveryEnabled) throw new Error('vault_peer_lan_disabled');
    if (networkCapability === 'None') throw new Error('vault_peer_network_capability_blocked');
    return;
  }
  if (!policy.relayEnabled || !policy.relayEndpoint) throw new Error('vault_peer_relay_disabled');
  if (!['WhitelistedOnly', 'FullUserApproved'].includes(networkCapability)) throw new Error('vault_peer_relay_capability_blocked');
  if (transport.endpoint !== policy.relayEndpoint) throw new Error('vault_peer_relay_endpoint_mismatch');
}

function caseFoldName(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US');
}

export function resolveVaultPeerCaseCollision(desiredName: string, existingNames: string[], peerId: string): string {
  // Eine Kollision liegt vor, sobald der gefaltete Name schon belegt ist — das
  // umfasst den exakt gleichen Namen UND die reine Gross-/Kleinschreibung.
  // Die vorige Fassung liess den exakten Fall durch („kein Konflikt") und
  // ueberliess ihn dem Aufrufer; den gibt es nicht, und derselbe Name zweimal
  // ist der Datenverlust, den diese Funktion verhindern soll.
  const folded = new Set(existingNames.map(caseFoldName));
  if (!folded.has(caseFoldName(desiredName))) return desiredName;
  const dot = desiredName.lastIndexOf('.');
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : '';
  const suffix = peerId.replace(/[^a-z0-9]/gi, '').slice(-8) || 'peer';
  for (let counter = 1; counter <= 1000; counter += 1) {
    const candidate = `${base}.case-conflict-${suffix}-${counter}${ext}`;
    if (!folded.has(caseFoldName(candidate))) return candidate;
  }
  throw new Error('vault_peer_case_collision_exhausted');
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function conflictCopyName(name: string, peerId: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const suffix = peerId.replace(/[^a-z0-9]/gi, '').slice(-8) || 'peer';
  return `${base}.conflict-${suffix}-${Date.now()}${ext}`;
}

function tryThreeWayTextMerge(base: Uint8Array, local: Uint8Array, remote: Uint8Array): Uint8Array | null {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let baseText: string;
  let localText: string;
  let remoteText: string;
  try {
    baseText = decoder.decode(base);
    localText = decoder.decode(local);
    remoteText = decoder.decode(remote);
  } catch {
    return null;
  }
  const baseLines = baseText.split('\n');
  const localLines = localText.split('\n');
  const remoteLines = remoteText.split('\n');
  if (baseLines.length !== localLines.length || baseLines.length !== remoteLines.length || baseLines.length > 20_000) return null;
  const merged: string[] = [];
  for (let index = 0; index < baseLines.length; index += 1) {
    const b = baseLines[index];
    const l = localLines[index];
    const r = remoteLines[index];
    if (l === r) merged.push(l);
    else if (l === b) merged.push(r);
    else if (r === b) merged.push(l);
    else return null;
  }
  return new TextEncoder().encode(merged.join('\n'));
}

export function resolveVaultPeerConflict(fileName: string, peerId: string, base: Uint8Array | undefined, local: Uint8Array, remote: Uint8Array, mimeType?: string): VaultPeerConflictResolution {
  if (equalBytes(local, remote)) return { kind: 'local', bytes: local };
  if (base && equalBytes(local, base)) return { kind: 'remote', bytes: remote };
  if (base && equalBytes(remote, base)) return { kind: 'local', bytes: local };
  if (base && (mimeType?.startsWith('text/') || mimeType === 'application/json')) {
    const merged = tryThreeWayTextMerge(base, local, remote);
    if (merged) return { kind: 'merged', bytes: merged };
  }
  return { kind: 'conflict_copy', bytes: remote, conflictName: conflictCopyName(fileName, peerId) };
}

export function atomicCommitVaultPeerAttachment(file: VaultFile, staged: VaultPeerStagedFile, payloadDataUrl: string, now = Date.now()): VaultFile {
  if (file.id !== staged.fileId) throw new Error('vault_peer_atomic_file_id_mismatch');
  if (!payloadDataUrl.startsWith('data:')) throw new Error('vault_peer_atomic_payload_invalid');
  return {
    ...file,
    name: staged.fileName,
    payloadDataUrl,
    sizeBytes: staged.bytes.byteLength,
    contentDigest: staged.contentHash,
    encryptedHash: staged.contentHash,
    digestAlgorithm: 'SHA-256',
    integrityState: 'verified',
    integrityVerifiedAt: staged.verifiedAt,
    lastModified: now,
    status: 'available',
  };
}

export function assertOnlineOnlyPlaceholderPolicy(policyInput?: Partial<VaultPeerSyncPolicy> | null): void {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  if (policy.onlineOnlyPlaceholders.enabled) throw new Error('vault_peer_online_only_requires_robust_os_integration');
}
