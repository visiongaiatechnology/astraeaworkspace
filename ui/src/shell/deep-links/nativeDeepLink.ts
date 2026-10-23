// STATUS: DIAMANT VGT SUPREME — bounded native/browser Workspace deep-link ingress.
import { invokeNative, isNativeDesktop } from '../../platform/native/nativeBridge';
import { parseShellDeepLink, type ShellDeepLink } from '../home/workspaceShellHomeCore';

export async function takeNativeDeepLink(): Promise<ShellDeepLink | null> {
  if (!isNativeDesktop()) return null;
  const raw = await invokeNative<string | null>('vgt_take_deep_link');
  return raw ? parseShellDeepLink(raw) : null;
}

export function deepLinkFromLocation(locationHref: string): ShellDeepLink | null {
  if (typeof locationHref !== 'string' || locationHref.length > 8192) return null;
  const url = new URL(locationHref);
  const raw = url.searchParams.get('deep');
  return raw ? parseShellDeepLink(raw) : null;
}
