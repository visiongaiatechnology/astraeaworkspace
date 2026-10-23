// STATUS: PLATIN — gemeinsamer Aktionszustand der Verwaltungs-Oberfläche.
//
// Eine Definition dafür, wie ein Fehler aus einer Kernfunktion zu einer sichtbaren, übersetzten
// Ablehnung wird. Die Kerne nennen Codes (`admin-rbac-denied`, `admin-dlp-rule-limit`, …); die
// Oberfläche zeigt den Klartext und behält den Code als `data-code` — dadurch bleibt ein sichtbarer
// Zustand prüfbar, ohne dass Insiderjargon im Text landet.
import { useCallback, useState } from 'react';

export interface GovernanceStatus {
  ok: boolean;
  /** Der benannte Code aus dem Kern — nie eine erfundene Meldung. */
  code: string;
  detail?: string;
}

export function errorCode(error: unknown): { code: string; detail?: string } {
  if (error instanceof Error) {
    const [code, ...rest] = error.message.split(':');
    return { code: code.trim().slice(0, 192) || 'unknown', detail: rest.join(':').trim().slice(0, 192) || undefined };
  }
  return { code: 'unknown' };
}

export function useGovernanceAction(appliedCode = 'applied'): {
  status: GovernanceStatus | null;
  run: (action: () => Promise<unknown> | unknown) => Promise<void>;
  set: (status: GovernanceStatus | null) => void;
} {
  const [status, set] = useState<GovernanceStatus | null>(null);
  const run = useCallback(async (action: () => Promise<unknown> | unknown) => {
    try {
      await action();
      set({ ok: true, code: appliedCode });
    } catch (error) {
      const { code, detail } = errorCode(error);
      set({ ok: false, code, detail });
    }
  }, [appliedCode]);
  return { status, run, set };
}
