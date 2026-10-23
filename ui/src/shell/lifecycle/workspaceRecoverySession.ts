// STATUS: DIAMANT VGT SUPREME — content-minimal abnormal-termination marker
const SESSION_KEY = 'vgt_workspace_session_state_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionMarker { version: 1; state: 'open' | 'clean'; sessionId: string; transitionedAt: number; }

function safeRead(): SessionMarker | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw || raw.length > 512) return null;
    const value = JSON.parse(raw) as Partial<SessionMarker>;
    if (value.version !== 1 || (value.state !== 'open' && value.state !== 'clean') || typeof value.sessionId !== 'string' || typeof value.transitionedAt !== 'number') return null;
    if (Date.now() - value.transitionedAt > MAX_AGE_MS) return null;
    return value as SessionMarker;
  } catch { return null; }
}

function write(state: SessionMarker['state'], sessionId: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, state, sessionId, transitionedAt: Date.now() } satisfies SessionMarker));
  } catch { /* Content-minimal marker is advisory only. */ }
}

export function beginWorkspaceSession(): { abnormalPreviousTermination: boolean; previousCleanTermination: boolean; sessionId: string } {
  const previous = safeRead();
  const sessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now().toString(36)}`;
  write('open', sessionId);
  return {
    abnormalPreviousTermination: previous?.state === 'open',
    previousCleanTermination: previous?.state === 'clean',
    sessionId,
  };
}

export function markWorkspaceSessionClean(sessionId: string): void {
  if (!sessionId || sessionId.length > 128 || /[\u0000-\u001f]/.test(sessionId)) return;
  write('clean', sessionId);
}

export function installWorkspaceSessionLifecycle(sessionId: string): () => void {
  const clean = () => markWorkspaceSessionClean(sessionId);
  window.addEventListener('pagehide', clean);
  window.addEventListener('beforeunload', clean);
  return () => {
    window.removeEventListener('pagehide', clean);
    window.removeEventListener('beforeunload', clean);
  };
}
