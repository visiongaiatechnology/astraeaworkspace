// STATUS: DIAMANT VGT SUPREME — same-origin audience-window adapter with optional Screen Details placement
interface ScreenDetailsLike {
  currentScreen?: { left: number; top: number; width: number; height: number };
  screens?: Array<{ left: number; top: number; width: number; height: number }>;
}

type WindowWithScreenDetails = Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };

function copyPresentationStyles(target: Window, title: string): void {
  target.document.head.replaceChildren();
  target.document.title = title;
  for (const node of Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]'))) {
    target.document.head.appendChild(node.cloneNode(true));
  }
  const base = target.document.createElement('style');
  base.textContent = 'html,body,#astraea-audience-root{margin:0;width:100%;height:100%;overflow:hidden;background:#000}';
  target.document.head.appendChild(base);
}

export async function openPresenterAudienceWindow(title = 'Astraea Present · Audience'): Promise<Window | null> {
  const popup = window.open('', 'astraea-present-audience', 'popup=yes,width=1280,height=720,resizable=yes');
  if (!popup) return null;
  const root = popup.document.createElement('div');
  root.id = 'astraea-audience-root';
  popup.document.body.replaceChildren(root);
  copyPresentationStyles(popup, title);

  try {
    const provider = window as WindowWithScreenDetails;
    const details = provider.getScreenDetails ? await provider.getScreenDetails() : null;
    const current = details?.currentScreen;
    const target = details?.screens?.find((screen) => !current || screen.left !== current.left || screen.top !== current.top);
    if (target) {
      popup.moveTo(target.left, target.top);
      popup.resizeTo(target.width, target.height);
    }
  } catch {
    // Screen placement permission is optional; the same-origin audience window remains usable without it.
  }
  popup.focus();
  return popup;
}

export function requestAudienceFullscreen(target: Window | null): void {
  const root = target?.document.documentElement;
  if (!root?.requestFullscreen) return;
  void root.requestFullscreen().catch(() => undefined);
}
