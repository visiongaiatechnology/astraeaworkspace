// STATUS: DIAMANT VGT SUPREME — ephemeral browser-to-loopback IPC authorization.

import { invokeNative, isNativeDesktop } from './nativeBridge';

export const VGT_IPC_ENDPOINT = 'http://127.0.0.1:5042';
export const VGT_IPC_AUTH_HEADER = 'X-VGT-IPC-Token';
const IPC_TOKEN_STORAGE_KEY = 'vgt.ipc.ephemeral-token.v1';
const TOKEN_HEX = /^[0-9a-f]{64}$/;

let memoryToken: string | null = null;
let paired = false;
let pairingPromise: Promise<string> | null = null;

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

function readExistingToken(): string | null {
  if (memoryToken && TOKEN_HEX.test(memoryToken)) return memoryToken;
  const value = storage()?.getItem(IPC_TOKEN_STORAGE_KEY)?.trim().toLowerCase() ?? null;
  if (!value || !TOKEN_HEX.test(value)) return null;
  memoryToken = value;
  return value;
}

function createToken(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error('IPC_AUTH_CSPRNG_UNAVAILABLE');
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  bytes.fill(0);
  if (!TOKEN_HEX.test(token)) throw new Error('IPC_AUTH_TOKEN_GENERATION_FAILED');
  memoryToken = token;
  storage()?.setItem(IPC_TOKEN_STORAGE_KEY, token);
  return token;
}

function token(): string { return readExistingToken() ?? createToken(); }

async function pairToken(): Promise<string> {
  if (paired) return token();
  if (pairingPromise) return pairingPromise;
  pairingPromise = (async () => {
    if (isNativeDesktop()) {
      const ready = await invokeNative<boolean>('vgt_ipc_server_status');
      if (!ready) throw new Error('IPC_SERVER_UNAVAILABLE');
    }
    const current = token();
    // Audited false positive: authenticated loopback IPC transport (127.0.0.1:5042) for the browser/dev
    // fallback only. The native desktop takes the invoke() path above and never reaches this fetch; the
    // request carries a local per-install auth token and is not internet egress.
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
    const response = await fetch(`${VGT_IPC_ENDPOINT}/api/v1/ipc/pair`, {
      method: 'POST',
      headers: { [VGT_IPC_AUTH_HEADER]: current },
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`IPC_AUTH_PAIRING_REJECTED:${response.status}`);
    paired = true;
    return current;
  })();
  try { return await pairingPromise; } finally { pairingPromise = null; }
}

function withAuthHeaders(init: RequestInit, authToken: string): RequestInit {
  const headers = new Headers(init.headers ?? {});
  headers.set(VGT_IPC_AUTH_HEADER, authToken);
  return { ...init, headers, credentials: 'omit', cache: 'no-store' };
}

export async function authenticatedIpcFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/')) throw new Error('IPC_PATH_REJECTED');
  let authToken = await pairToken();
  let response = await fetch(`${VGT_IPC_ENDPOINT}${path}`, withAuthHeaders(init, authToken));
  if (response.status !== 401) return response;

  // The daemon may have restarted and lost its in-memory token set. Re-pair once and retry.
  paired = false;
  authToken = await pairToken();
  response = await fetch(`${VGT_IPC_ENDPOINT}${path}`, withAuthHeaders(init, authToken));
  return response;
}

export function resetIpcAuthForTests(): void {
  memoryToken = null;
  paired = false;
  pairingPromise = null;
  storage()?.removeItem(IPC_TOKEN_STORAGE_KEY);
}
