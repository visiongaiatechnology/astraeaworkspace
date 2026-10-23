export interface ShellUpdateState {
  channel: 'beta' | 'stable';
  status: 'manual_offline' | 'current' | 'available' | 'failed';
  currentVersion: string;
  availableVersion?: string;
  checkedAt?: number;
  detail: string;
}

export function defaultShellUpdateState(currentVersion: string): ShellUpdateState {
  return {
    channel: currentVersion.includes('beta') ? 'beta' : 'stable',
    status: 'manual_offline',
    currentVersion,
    detail: 'Automatic update networking is disabled; signed offline/manual update remains available.',
  };
}
