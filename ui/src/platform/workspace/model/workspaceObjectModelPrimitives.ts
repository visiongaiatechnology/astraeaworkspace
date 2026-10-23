// STATUS: DIAMANT VGT SUPREME — bounded WOM primitives and stable identity contracts
import { WOM_MAX_ID_LENGTH } from '../../../shared/contracts/wom/workspaceWom';
import { writeDiagnosticLog } from '../../diagnostics/diagnosticLog';
import { opaqueSecurityMessage } from '../../security/securityGatesPlatform';

export const MAX_SERIALIZE_DEPTH = 96;


export const MAX_TITLE_LENGTH = 512;


export const MAX_SERIALIZED_DOCUMENT_BYTES = 96 * 1024 * 1024;


export const MAX_DUPLICATE_KEY_SCAN_NODES = 4_000_000;


export const MAX_DUPLICATE_KEY_SCAN_ENTRIES = 1_000_000;


export const EXTENSION_NAMESPACE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[A-Za-z0-9._-]+)?$/;



export class WorkspaceObjectModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceObjectModelError';
  }
}



/** Input is structurally invalid and cannot be preserved safely. */
export class WorkspaceMalformedInputError extends WorkspaceObjectModelError {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceMalformedInputError';
  }
}



/** Input is structurally valid but requires a newer/optional capability to interpret. */
export class WorkspaceUnsupportedContentError extends WorkspaceObjectModelError {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceUnsupportedContentError';
  }
}



class DuplicateJsonObjectKeyError extends Error {}


/**
 * `vgtcoder` §1.5.A — the three disclosure dispositions of this boundary, built from the vocabulary that
 * already exists here (`WorkspaceObjectModelError` family for the classes,
 * `platform/security/securityGatesPlatform.ts` for the opaque outward sentence). No second error taxonomy:
 * the user-visible refusal **is** a `WorkspaceMalformedInputError`, so every existing `instanceof`
 * classification of this family keeps its meaning.
 */

/** USER-FACING: the sentence is the answer and is shown verbatim (`vgt-ui-ux-supreme` §25, never a bare code). */
export class WorkspaceValidationError extends WorkspaceMalformedInputError {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}


/** The one whole sentence that may leave the process for an internal storage refusal (§25: no bare code). */
const STORAGE_PUBLIC_MESSAGE = 'The Workspace document could not be stored. The full reason is recorded in the local diagnostics.';


function logInternalRefusal(component: string, eventId: string, reason: string): void {
  try {
    writeDiagnosticLog({ level: 'error', component, eventId, message: reason });
  } catch {
    // Local diagnostics are best effort; a logging failure must never soften or mask the refusal itself.
  }
}


/**
 * `vgtcoder` SecurityException: opaque outward, full reason to the log. `message` is already the opaque
 * sentence, so the reason cannot reach a client even through a consumer that blindly prints
 * `cause.message`; the full reason lives in `reason` (diagnostic ring) and `diagnosticCode` names the case.
 */
export class WorkspaceSecurityError extends WorkspaceObjectModelError {
  readonly publicMessage: string = opaqueSecurityMessage();
  constructor(readonly diagnosticCode: string, readonly reason: string) {
    super(opaqueSecurityMessage());
    this.name = 'WorkspaceSecurityError';
  }
  toJSON(): Readonly<{ error: string }> {
    return { error: this.publicMessage };
  }
}


/** `vgtcoder` StorageException: opaque as well — nothing in the internal reason is actionable for a caller. */
export class WorkspaceStorageError extends WorkspaceObjectModelError {
  readonly publicMessage: string = STORAGE_PUBLIC_MESSAGE;
  constructor(readonly diagnosticCode: string, readonly reason: string) {
    super(STORAGE_PUBLIC_MESSAGE);
    this.name = 'WorkspaceStorageError';
  }
  toJSON(): Readonly<{ error: string }> {
    return { error: this.publicMessage };
  }
}


/** Sentence subjects that are NEVER a user-visible message (`vgtcoder` §1.5.A, keyword rule). */
const SECURITY_SUBJECT_PATTERN = /(injection|csrf|cross-site|token|origin|traversal|pfad|polyglot)/iu;


export function workspaceSecurityRefusal(diagnosticCode: string, reason: string): WorkspaceSecurityError {
  logInternalRefusal('wom-security', diagnosticCode, reason);
  return new WorkspaceSecurityError(diagnosticCode, reason);
}


export function workspaceStorageRefusal(diagnosticCode: string, reason: string): WorkspaceStorageError {
  logInternalRefusal('wom-storage', diagnosticCode, reason);
  return new WorkspaceStorageError(diagnosticCode, reason);
}


/**
 * The **one** place that decides whether a refusal sentence may be shown verbatim: a sentence naming one of
 * the security subjects becomes the opaque security disposition, everything else the user-visible one.
 */
export function refuseWorkspaceInput(diagnosticCode: string, reason: string): WorkspaceObjectModelError {
  return SECURITY_SUBJECT_PATTERN.test(reason) ? workspaceSecurityRefusal(diagnosticCode, reason) : new WorkspaceValidationError(reason);
}



/**
 * JSON.parse intentionally applies last-member-wins semantics. Scan the already byte-bounded
 * JSON once before parsing so a canonical WOM payload cannot carry parser-differential members.
 * This is a lexical pass only: JSON.parse remains the syntax and value parser, and malformed
 * input is left for its existing bounded error path.
 */
export function rejectDuplicateJsonObjectKeys(serialized: string): void {
  let offset = 0;
  let visitedNodes = 0;
  const skipWhitespace = (): void => {
    while (offset < serialized.length) {
      const code = serialized.charCodeAt(offset);
      if (code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x20) return;
      offset += 1;
    }
  };
  const readStringEnd = (): number | undefined => {
    if (serialized[offset] !== '"') return undefined;
    const start = offset;
    offset += 1;
    while (offset < serialized.length) {
      const code = serialized.charCodeAt(offset);
      if (code === 0x22) {
        offset += 1;
        return offset > start + 1 ? offset : undefined;
      }
      if (code === 0x5c) {
        offset += 2;
        continue;
      }
      if (code < 0x20) return undefined;
      offset += 1;
    }
    return undefined;
  };
  const parseValue = (depth: number): boolean => {
    skipWhitespace();
    visitedNodes += 1;
    if (depth > MAX_SERIALIZE_DEPTH || visitedNodes > MAX_DUPLICATE_KEY_SCAN_NODES) return false;
    const token = serialized[offset];
    if (token === '"') return readStringEnd() !== undefined;
    if (token === '{') {
      offset += 1;
      skipWhitespace();
      if (serialized[offset] === '}') {
        offset += 1;
        return true;
      }
      const keys = new Set<string>();
      while (keys.size < MAX_DUPLICATE_KEY_SCAN_ENTRIES) {
        skipWhitespace();
        const keyStart = offset;
        const keyEnd = readStringEnd();
        if (keyEnd === undefined) return false;
        const rawKey = serialized.slice(keyStart, keyEnd);
        let key: unknown = rawKey.includes('\\') ? undefined : rawKey.slice(1, -1);
        if (rawKey.includes('\\')) {
          try { key = JSON.parse(rawKey) as unknown; }
          catch { return false; }
        }
        if (typeof key !== 'string') return false;
        if (keys.has(key)) throw new DuplicateJsonObjectKeyError();
        keys.add(key);
        skipWhitespace();
        if (serialized[offset] !== ':') return false;
        offset += 1;
        if (!parseValue(depth + 1)) return false;
        skipWhitespace();
        if (serialized[offset] === '}') {
          offset += 1;
          return true;
        }
        if (serialized[offset] !== ',') return false;
        offset += 1;
      }
      return false;
    }
    if (token === '[') {
      offset += 1;
      skipWhitespace();
      if (serialized[offset] === ']') {
        offset += 1;
        return true;
      }
      let entries = 0;
      while (entries < MAX_DUPLICATE_KEY_SCAN_ENTRIES) {
        if (!parseValue(depth + 1)) return false;
        entries += 1;
        skipWhitespace();
        if (serialized[offset] === ']') {
          offset += 1;
          return true;
        }
        if (serialized[offset] !== ',') return false;
        offset += 1;
      }
      return false;
    }
    const start = offset;
    while (offset < serialized.length) {
      const code = serialized.charCodeAt(offset);
      if (code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20 || code === 0x2c || code === 0x5d || code === 0x7d) break;
      offset += 1;
    }
    return offset > start;
  };

  try {
    if (!parseValue(0)) return;
    skipWhitespace();
    if (offset !== serialized.length) return;
  } catch (error) {
    if (error instanceof DuplicateJsonObjectKeyError) {
      throw new WorkspaceMalformedInputError('Serialized Workspace document contains duplicate JSON object keys');
    }
    throw error;
  }
}



export function assertStableWorkspaceId(id: string, label = 'Workspace id'): void {
  if (typeof id !== 'string' || id.length < 1 || id.length > WOM_MAX_ID_LENGTH) {
    throw new WorkspaceMalformedInputError(`${label} length is invalid`);
  }
  if (!/^[A-Za-z0-9._:@-]+$/.test(id)) throw new WorkspaceMalformedInputError(`${label} contains unsafe characters`);
}



export function workspaceObjectUri(documentId: string, objectId: string): string {
  assertStableWorkspaceId(documentId, 'Document id');
  assertStableWorkspaceId(objectId, 'Object id');
  return `vgt://workspace/document/${documentId}/object/${objectId}`;
}



export function parseWorkspaceObjectUri(uri: string): { documentId: string; objectId: string } {
  if (typeof uri !== 'string' || uri.length > 1024) throw new WorkspaceMalformedInputError('Invalid vgt:// workspace object reference');
  const match = /^vgt:\/\/workspace\/document\/([^/]+)\/object\/([^/]+)$/.exec(uri);
  if (!match) throw new WorkspaceMalformedInputError('Invalid vgt:// workspace object reference');
  assertStableWorkspaceId(match[1], 'Referenced document id');
  assertStableWorkspaceId(match[2], 'Referenced object id');
  return { documentId: match[1], objectId: match[2] };
}



export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}



export function cloneJson<T>(value: T): T {
  try { return structuredClone(value); }
  catch { throw new WorkspaceMalformedInputError('Workspace value cannot be safely cloned'); }
}



export function jsonByteLength(value: unknown): number {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('not-json');
    return new TextEncoder().encode(encoded).byteLength;
  } catch {
    throw new WorkspaceMalformedInputError('Workspace value is not bounded JSON data');
  }
}



export function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new WorkspaceMalformedInputError(`${label} must be finite`);
}



export function assertNamespace(namespace: unknown, label = 'Extension namespace'): asserts namespace is string {
  if (typeof namespace !== 'string' || namespace.length < 1 || namespace.length > 192 || !EXTENSION_NAMESPACE_PATTERN.test(namespace)) {
    throw new WorkspaceMalformedInputError(`${label} is invalid`);
  }
}
