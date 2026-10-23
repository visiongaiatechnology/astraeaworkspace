// STATUS: PLATIN — early boot branch for the Present display windows.
//
// A display window is a real second document (`index.html?present_display=…&session=…`). The boot
// entry asks this module first; when the URL names a valid display session it mounts *only* the
// display app and the Workspace shell never renders. An invalid or missing parameter is not an
// error here — the normal application boots in that case.
import { createRoot } from 'react-dom/client';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { isPresentSessionId, type PresentDisplayRole } from '../session/presentSessionProtocol';
import type { PresentChannelFactory } from '../session/presentSessionBus';
import { PresentDisplayApp } from './PresentDisplayApp';

export interface PresentDisplayBootRequest {
  readonly role: PresentDisplayRole;
  readonly session: string;
}

export const PRESENT_DISPLAY_QUERY_KEY = 'present_display';
export const PRESENT_DISPLAY_SESSION_QUERY_KEY = 'session';

export function resolvePresentDisplayBoot(search: string): PresentDisplayBootRequest | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  const display = params.get(PRESENT_DISPLAY_QUERY_KEY);
  if (display !== 'audience' && display !== 'presenter') return null;
  const session = params.get(PRESENT_DISPLAY_SESSION_QUERY_KEY);
  if (!isPresentSessionId(session)) return null;
  return { role: display, session };
}

export interface MountPresentDisplayOptions {
  /** Defaults to `window.location.search`. */
  readonly search?: string;
  /** Defaults to `#root`. */
  readonly root?: HTMLElement | null;
  readonly channelFactory?: PresentChannelFactory;
  readonly locale?: WorkspaceLocale;
  /** Test override for `prefers-reduced-motion`. */
  readonly reducedMotionOverride?: boolean;
}

export interface MountPresentDisplayResult {
  readonly mounted: boolean;
  readonly role: PresentDisplayRole | null;
  readonly unmount: () => void;
}

/**
 * Mounts the display app when the URL asks for it. Returns `mounted: false` for every other start so
 * the caller keeps the normal boot path unchanged.
 */
export function mountPresentDisplayIfRequested(
  options: MountPresentDisplayOptions = {},
): MountPresentDisplayResult {
  const search = options.search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const request = resolvePresentDisplayBoot(search);
  if (!request) return { mounted: false, role: null, unmount: () => undefined };
  const root = options.root ?? (typeof document === 'undefined' ? null : document.getElementById('root'));
  if (!root) return { mounted: false, role: null, unmount: () => undefined };

  const reactRoot = createRoot(root);
  reactRoot.render(
    <PresentDisplayApp
      role={request.role}
      session={request.session}
      locale={options.locale}
      channelFactory={options.channelFactory}
      reducedMotionOverride={options.reducedMotionOverride}
    />,
  );
  return {
    mounted: true,
    role: request.role,
    unmount: () => reactRoot.unmount(),
  };
}
