// STATUS: PLATIN — locale resolution for the shell-less Present display windows.
import { browserShellStorage } from '../../../../shell/platform/workspaceShellPlatform';
import {
  loadWorkspaceLocale,
  resolveWorkspaceLocale,
} from '../../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

/** Display windows render outside the Workspace provider, so the stored preference is read directly. */
export function resolvePresentDisplayLocale(): WorkspaceLocale {
  const preference = loadWorkspaceLocale(browserShellStorage());
  const systemLocale = typeof navigator === 'undefined' ? undefined : navigator.language;
  return resolveWorkspaceLocale(preference, systemLocale);
}
