// STATUS: DIAMANT VGT SUPREME — bounded multi-window / detached-tab bridge with local-only window geometry.
import { invokeNative, isNativeDesktop } from '../../platform/native/nativeBridge';
import { browserShellStorage, loadShellWindowState, type ShellLocalWindowState } from '../platform/workspaceShellPlatform';

export interface ShellOpenWindowRequest {
  documentId?: string;
  startCenter: boolean;
}

function validateDocumentId(documentId: string | undefined): string | undefined {
  if (documentId === undefined) return undefined;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(documentId)) throw new Error('Document ID cannot be used for a detached window');
  return documentId;
}

function preferredWindowState(): ShellLocalWindowState | undefined {
  return loadShellWindowState(browserShellStorage(), 'main') ?? undefined;
}

export function buildShellWindowUrl(request: ShellOpenWindowRequest): string {
  const documentId = validateDocumentId(request.documentId);
  const params = new URLSearchParams();
  params.set('start', request.startCenter ? 'true' : 'false');
  if (documentId) params.set('doc', documentId);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

export async function openShellWindow(request: ShellOpenWindowRequest): Promise<string> {
  const documentId = validateDocumentId(request.documentId);
  const state = preferredWindowState();
  if (isNativeDesktop()) {
    return invokeNative<string>('vgt_shell_open_window', {
      request: {
        document_id: documentId,
        start_center: request.startCenter,
        window_state: state ? { x: state.x, y: state.y, width: state.width, height: state.height, maximized: state.maximized } : undefined,
      },
    });
  }
  const features = state ? `noopener,noreferrer,left=${state.x},top=${state.y},width=${state.width},height=${state.height}` : 'noopener,noreferrer';
  const popup = window.open(buildShellWindowUrl({ documentId, startCenter: request.startCenter }), '_blank', features);
  if (!popup) throw new Error('Workspace window was blocked by the browser/runtime');
  popup.opener = null;
  return 'browser-window';
}
