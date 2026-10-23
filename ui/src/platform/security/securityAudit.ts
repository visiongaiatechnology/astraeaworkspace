// STATUS: DIAMANT VGT SUPREME — content-minimal local security audit ring.
import type { SecurityProfile } from '../../shared/contracts/workspace';

export interface LocalSecurityAuditEvent {
  timestamp: number;
  action: 'PROFILE_CHANGE' | 'PROFILE_REJECTED' | 'TOP_SECRET_SEAL' | 'TOP_SECRET_UNSEAL' | 'KEY_ROTATION' | 'POLICY_REJECTED';
  result: 'OK' | 'REJECTED' | 'ERROR';
  from_profile?: SecurityProfile;
  to_profile?: SecurityProfile;
  diagnostic_code?: string;
}

const MAX_EVENTS = 256;
const events: LocalSecurityAuditEvent[] = [];

function safeCode(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[^A-Z0-9_-]/gi, '_').slice(0, 96);
  return normalized || undefined;
}

export function recordLocalSecurityAudit(event: Omit<LocalSecurityAuditEvent, 'timestamp' | 'diagnostic_code'> & { diagnostic_code?: string }): void {
  events.unshift({ ...event, timestamp: Date.now(), diagnostic_code: safeCode(event.diagnostic_code) });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

export function listLocalSecurityAudit(): readonly LocalSecurityAuditEvent[] {
  return events.map((event) => ({ ...event }));
}
