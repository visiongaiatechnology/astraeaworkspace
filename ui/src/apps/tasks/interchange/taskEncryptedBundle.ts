// STATUS: DIAMANT VGT SUPREME
// Astraea Tasks — Portable Encrypted .vtask Bundle Engine
// Schicht 2: Deep Core Engine (Lines 1156, 1173)

import { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import { createTaskPriorityLossTally, sanitizeNativeTaskValue, summarizeTaskPriorityLosses, TASK_IMPORT_MAX_TASKS } from './taskInterchangeEngine';

export const VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES = 32 * 1024 * 1024;
export const VTASK_BUNDLE_AES_GCM_TAG_BYTES = 16;
export const VTASK_BUNDLE_MAX_PLAINTEXT_BYTES = VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES - VTASK_BUNDLE_AES_GCM_TAG_BYTES;
export const VTASK_KDF_MIN_ITERATIONS = 100_000;
export const VTASK_KDF_MAX_ITERATIONS = 1_000_000;

export interface VTaskEncryptedBundle {
  magic: 'VTASK_ENCRYPTED_V2';
  version: 2;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  exportedAt: number;
  taskCount: number;
  integritySha256: string;
}

export interface VTaskPayload {
  tasks: TaskItem[];
  exportedAt: number;
  sourceEnclaveId: string;
  systemVersion: string;
  /** Priority projections applied while sanitizing a foreign decrypted payload; empty when none. */
  warnings?: string[];
}

/**
 * Derives an AES-GCM-256 key from a passphrase and salt using WebCrypto PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array, iterations = 100000): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Encrypted bundle contains invalid hexadecimal data.');
  const clean = hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Exports TaskItem[] into a secure encrypted .vtask envelope.
 */
export async function exportEncryptedTaskBundle(
  tasks: TaskItem[],
  passphrase: string,
  enclaveId = 'local-sovereign-enclave'
): Promise<VTaskEncryptedBundle> {
  if (!Array.isArray(tasks)) throw new Error('Task bundle export requires a task array.');
  if (tasks.length > TASK_IMPORT_MAX_TASKS) throw new Error('Task bundle task count exceeds the import limit.');
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Passphrase must be at least 6 characters for AES-GCM envelope encryption.');
  }
  if (typeof enclaveId !== 'string') throw new Error('Task bundle source identity is invalid.');

  const payload: VTaskPayload = {
    tasks,
    exportedAt: Date.now(),
    sourceEnclaveId: enclaveId.slice(0, 512),
    systemVersion: 'VGT Astraea Tasks 2.1 DIAMANT',
  };

  const enc = new TextEncoder();
  const serializedPayload = JSON.stringify(payload);
  if (typeof serializedPayload !== 'string') throw new Error('Task bundle payload could not be serialized.');
  const plaintextBytes = enc.encode(serializedPayload);
  if (plaintextBytes.byteLength > VTASK_BUNDLE_MAX_PLAINTEXT_BYTES) {
    throw new Error('Task bundle plaintext exceeds the encrypted bundle resource limit.');
  }

  // Compute integrity hash before encryption
  const hashBuf = await crypto.subtle.digest('SHA-256', plaintextBytes as unknown as BufferSource);
  const integritySha256 = bytesToHex(new Uint8Array(hashBuf));

  // Generate 16 bytes salt and 12 bytes IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100000;

  const key = await deriveKey(passphrase, salt, iterations);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
    key,
    plaintextBytes as unknown as BufferSource
  );
  if (ciphertextBuf.byteLength > VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES) {
    throw new Error('Encrypted task bundle exceeds the ciphertext resource limit.');
  }

  return {
    magic: 'VTASK_ENCRYPTED_V2',
    version: 2,
    kdf: 'PBKDF2-SHA256',
    iterations,
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(new Uint8Array(ciphertextBuf)),
    exportedAt: payload.exportedAt,
    taskCount: tasks.length,
    integritySha256,
  };
}

/**
 * Decrypts and unpacks a .vtask envelope back into canonical TaskItem[].
 */
export async function decryptTaskBundle(
  bundle: VTaskEncryptedBundle,
  passphrase: string
): Promise<VTaskPayload> {
  if (!bundle || typeof bundle !== 'object') throw new Error('Encrypted bundle envelope is invalid.');
  if (bundle.magic !== 'VTASK_ENCRYPTED_V2') {
    throw new Error('Unrecognized bundle magic header. Expected VTASK_ENCRYPTED_V2.');
  }

  if (bundle.version !== 2 || bundle.kdf !== 'PBKDF2-SHA256') throw new Error('Unsupported encrypted task bundle version or KDF.');
  if (!Number.isInteger(bundle.iterations) || bundle.iterations < VTASK_KDF_MIN_ITERATIONS || bundle.iterations > VTASK_KDF_MAX_ITERATIONS) throw new Error('Encrypted bundle KDF iteration count is outside the accepted security/resource range.');
  if (!Number.isInteger(bundle.taskCount) || bundle.taskCount < 0 || bundle.taskCount > TASK_IMPORT_MAX_TASKS) throw new Error('Encrypted bundle task count exceeds accepted limit.');
  if (typeof bundle.saltHex !== 'string' || typeof bundle.ivHex !== 'string' || typeof bundle.integritySha256 !== 'string' || typeof bundle.ciphertextHex !== 'string') throw new Error('Encrypted bundle cryptographic fields are invalid.');
  if (bundle.saltHex.length !== 32 || bundle.ivHex.length !== 24 || !/^[0-9a-f]{64}$/i.test(bundle.integritySha256)) throw new Error('Encrypted bundle cryptographic field lengths are invalid.');
  if (bundle.ciphertextHex.length < VTASK_BUNDLE_AES_GCM_TAG_BYTES * 2 || bundle.ciphertextHex.length / 2 > VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES) throw new Error('Encrypted bundle exceeds ciphertext resource limits.');
  const salt = hexToBytes(bundle.saltHex);
  const iv = hexToBytes(bundle.ivHex);
  const ciphertext = hexToBytes(bundle.ciphertextHex);

  const key = await deriveKey(passphrase, salt, bundle.iterations);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
      key,
      ciphertext as unknown as BufferSource
    );
  } catch {
    throw new Error('Decryption failed: Incorrect passphrase or tampered ciphertext.');
  }

  const dec = new TextDecoder();
  const plaintext = dec.decode(decryptedBuf);

  // Verify integrity hash before trusting decoded task fields.
  const hashBuf = await crypto.subtle.digest('SHA-256', new Uint8Array(decryptedBuf) as unknown as BufferSource);
  const calculatedHash = bytesToHex(new Uint8Array(hashBuf));

  if (calculatedHash !== bundle.integritySha256) {
    throw new Error('Integrity hash mismatch: Encrypted task bundle payload has been corrupted.');
  }

  let rawPayload: unknown;
  try { rawPayload = JSON.parse(plaintext); } catch { throw new Error('Decrypted task bundle payload is malformed JSON.'); }
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) throw new Error('Decrypted task bundle payload has an invalid shape.');
  const obj = rawPayload as Record<string, unknown>;
  if (!Array.isArray(obj.tasks) || obj.tasks.length > TASK_IMPORT_MAX_TASKS) throw new Error('Encrypted task bundle contains an invalid or oversized task array.');
  const seen = new Set<string>();
  const priorityLosses = createTaskPriorityLossTally();
  const safeTasks = obj.tasks.map((task) => sanitizeNativeTaskValue(task, seen, priorityLosses));
  if (safeTasks.some((task) => !task)) throw new Error('Encrypted task bundle contains an invalid task record.');
  const tasks = safeTasks as TaskItem[];
  if (tasks.length !== bundle.taskCount) throw new Error('Encrypted task bundle count does not match the validated payload.');
  const prioritySummary = summarizeTaskPriorityLosses(priorityLosses);
  return {
    tasks,
    exportedAt: typeof obj.exportedAt === 'number' && Number.isFinite(obj.exportedAt) ? obj.exportedAt : bundle.exportedAt,
    sourceEnclaveId: typeof obj.sourceEnclaveId === 'string' ? obj.sourceEnclaveId.slice(0, 512) : 'unknown',
    systemVersion: typeof obj.systemVersion === 'string' ? obj.systemVersion.slice(0, 512) : 'unknown',
    warnings: prioritySummary ? [prioritySummary] : [],
  };
}
