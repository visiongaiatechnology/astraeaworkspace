#!/usr/bin/env node
// STATUS: DIAMANT — Bundle-Init-Smoke für die native Grid-Crash-Klasse.
//
// Hintergrund (2026-10-18): Der native "Modul wurde sicher angehalten"-Crash beim frischen
// Grid war ein **Bundle-Init-Fehler**: `ReferenceError: Cannot access 'g' before initialization`
// im Chunk `vaultIntegrity-*.js`, verursacht durch den Import-Zyklus
// `vaultIntegrity → vaultFileSystemEngine → vaultNames → vaultIntegrity` (Rollup/TDZ).
// In happy-dom/Vitest ist dieser Fehler unsichtbar, weil dort das Quellmodul anders/einzeln
// geladen wird als der gebaute Chunk. Dieses Skript reproduziert die Klasse im echten
// Vite-Artefakt: Es importiert **jeden** `dist/open-core/assets/*.js`-Chunk einmal per
// dynamischem `import()` in Node — nach Installation einer Happy-DOM-`Window` als Globals.
// Ohne DOM brechen 104/109 Chunks sofort mit `document is not defined` ab und ein TDZ
// **nach** dieser Zeile bliebe unsichtbar; mit dem DOM-Shim werden alle 109 Chunks bis in
// ihren Modul-Init ausgewertet.
//
// Klassifikation der Import-Fehler:
//   * `ReferenceError: Cannot access '…' before initialization` → **Init-Fehler** (Fail).
//   * andere `ReferenceError` mit Browser-Global (`document`, `self`, …) → **browser-only**.
//   * andere Fehler: **browser-only nur**, wenn Message/Stack ein Browser-Global nennt;
//     sonst als Init-Fehler melden (und im Bericht listen).
//
// Aufruf:
//   cd ui && node scripts/bundle-init-smoke.mjs
//   cd ui && npm run bundle:init-smoke
//   node ui/scripts/bundle-init-smoke.mjs --dist <assets-dir> [--verbose]
//
// Exitcodes: 0 = kein Init-Fehler; 1 = mindestens ein Init-Fehler;
//            2 = dist/assets fehlt/leer oder happy-dom nicht verfügbar.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BROWSER_GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'self', 'top', 'parent', 'frames', 'screen', 'devicePixelRatio', 'outerWidth', 'outerHeight',
  'innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'matchMedia', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'PerformanceObserver',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'HTMLDivElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement',
  'SVGElement', 'SVGSVGElement', 'Element', 'Node', 'NodeList', 'DocumentFragment', 'ShadowRoot',
  'DOMParser', 'XMLSerializer', 'DOMRect', 'DOMRectReadOnly', 'DOMException', 'CSS', 'CSSStyleSheet',
  'CustomElementRegistry', 'customElements', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent',
  'PointerEvent', 'WheelEvent', 'TouchEvent', 'DragEvent', 'ClipboardEvent', 'FocusEvent', 'InputEvent',
  'Image', 'ImageData', 'OffscreenCanvas', 'FileReader', 'FileList', 'Blob', 'File', 'URL',
  'URLSearchParams', 'FormData', 'Worker', 'SharedWorker', 'indexedDB', 'caches',
  'AudioContext', 'webkitAudioContext', 'speechSynthesis', 'WebSocket', 'XMLHttpRequest',
  'ClipboardItem', 'Selection', 'Range', 'CaretPosition', 'Text', 'Comment', 'ProcessingInstruction',
  'HTMLCollection', 'DOMTokenList', 'NamedNodeMap', 'Attr', 'Audio', 'MediaQueryList',
  'CanvasRenderingContext2D', 'WebGLRenderingContext', 'isSecureContext',
]);

const INIT_TDZ_PATTERN = /^Cannot access '([^']+)' before initialization$/u;
const MISSING_GLOBAL_PATTERNS = [
  /^([A-Za-z_$][\w$]*) is not defined$/u,
  /^Can't find variable: ([A-Za-z_$][\w$]*)$/u,
];

function parseArgs(argv) {
  let distArg = null;
  let verbose = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      distArg = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-') && distArg === null) {
      distArg = arg;
    }
  }
  return {
    assetsDir: path.resolve(distArg ?? path.join(UI_ROOT, 'dist', 'open-core', 'assets')),
    verbose,
  };
}

function defineGlobal(name, value) {
  if (value === undefined) return;
  try {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  } catch {
    try {
      globalThis[name] = value;
    } catch {
      // A non-configurable Node built-in wins; that is exactly the browser/Node intersection.
    }
  }
}

/**
 * Happy-DOM vor den Chunk-Imports als Globals setzen. Ziel ist nicht ein perfekter Browser,
 * sondern ein so weit tragfähiges DOM, dass der Modul-Init **hinter** dem ersten
 * `document`-/`window`-Zugriff weiterläuft und einen echten TDZ sichtbar macht.
 */
async function installDomGlobals() {
  let Window;
  try {
    ({ Window } = await import('happy-dom'));
  } catch (error) {
    console.error('[bundle-init-smoke] happy-dom is required (devDependency) but could not be imported.');
    console.error(`[bundle-init-smoke] ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  let window;
  try {
    window = new Window({ url: 'http://localhost/' });
  } catch (error) {
    console.error('[bundle-init-smoke] happy-dom Window could not be created.');
    console.error(`[bundle-init-smoke] ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  defineGlobal('window', window);
  defineGlobal('document', window.document);
  defineGlobal('self', window);
  defineGlobal('top', window);
  defineGlobal('parent', window);
  defineGlobal('frames', window);
  defineGlobal('navigator', window.navigator);
  defineGlobal('location', window.location);
  defineGlobal('history', window.history);
  defineGlobal('localStorage', window.localStorage);
  defineGlobal('sessionStorage', window.sessionStorage);
  defineGlobal('screen', window.screen);
  defineGlobal('devicePixelRatio', window.devicePixelRatio);
  defineGlobal('innerWidth', window.innerWidth);
  defineGlobal('innerHeight', window.innerHeight);
  defineGlobal('outerWidth', window.outerWidth);
  defineGlobal('outerHeight', window.outerHeight);
  defineGlobal('scrollX', window.scrollX);
  defineGlobal('scrollY', window.scrollY);

  for (const name of [
    'Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'HTMLDivElement', 'HTMLAnchorElement', 'HTMLImageElement',
    'HTMLVideoElement', 'HTMLAudioElement', 'SVGElement', 'SVGSVGElement', 'Node', 'NodeList',
    'DocumentFragment', 'ShadowRoot', 'DOMParser', 'XMLSerializer', 'DOMRect', 'DOMRectReadOnly',
    'DOMException', 'CSS', 'CSSStyleSheet', 'CustomElementRegistry', 'Event', 'CustomEvent',
    'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'TouchEvent', 'DragEvent',
    'ClipboardEvent', 'FocusEvent', 'InputEvent', 'Image', 'ImageData', 'OffscreenCanvas',
    'FileReader', 'FileList', 'Blob', 'File', 'FormData', 'ResizeObserver', 'MutationObserver',
    'IntersectionObserver', 'PerformanceObserver', 'CanvasRenderingContext2D',
    'WebGLRenderingContext', 'Text', 'Comment', 'ProcessingInstruction', 'HTMLCollection',
    'DOMTokenList', 'NamedNodeMap', 'Attr', 'Selection', 'Range', 'CaretPosition', 'Audio',
    'AudioContext', 'webkitAudioContext', 'WebSocket', 'XMLHttpRequest',
  ]) {
    defineGlobal(name, window[name]);
  }
  defineGlobal('customElements', window.customElements);
  defineGlobal('getComputedStyle', window.getComputedStyle?.bind(window));
  defineGlobal('matchMedia', window.matchMedia?.bind(window));
  defineGlobal('getSelection', window.getSelection?.bind(window));
  defineGlobal('scrollTo', window.scrollTo?.bind(window));
  defineGlobal('requestAnimationFrame', window.requestAnimationFrame?.bind(window) ?? ((callback) => setTimeout(() => callback(Date.now()), 0)));
  defineGlobal('cancelAnimationFrame', window.cancelAnimationFrame?.bind(window) ?? ((handle) => clearTimeout(handle)));
  defineGlobal('requestIdleCallback', (callback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 0));
  defineGlobal('cancelIdleCallback', (handle) => clearTimeout(handle));
  defineGlobal('alert', () => undefined);
  defineGlobal('confirm', () => false);
  defineGlobal('prompt', () => null);

  // Clipboard/Storage sind im nativen WebView2 vorhanden; für den Init-Smoke genügt ein
  // nicht-werfender Stub, damit Module, die ihn beim Laden lesen, weiterlaufen.
  try {
    if (!window.navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined, readText: async () => '' },
      });
    }
  } catch {
    // Navigator ist je nach happy-dom-Version nicht erweiterbar; kein Init-Grund.
  }
  try {
    if (!window.localStorage) {
      const store = new Map();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key) => store.get(String(key)) ?? null,
          setItem: (key, value) => { store.set(String(key), String(value)); },
          removeItem: (key) => { store.delete(String(key)); },
          clear: () => { store.clear(); },
          key: (index) => [...store.keys()][index] ?? null,
          get length() { return store.size; },
        },
      });
    }
  } catch {
    // Storage bleibt ggf. undefiniert; der Klassifikator zählt das als browser-only.
  }

  return {
    window,
    close() {
      try {
        window.close();
      } catch {
        // Window kann bereits geschlossen sein.
      }
      try {
        window.happyDOM?.close?.();
      } catch {
        // DetachedWindowAPI kann bereits beendet sein.
      }
    },
  };
}

function mentionsBrowserGlobal(error) {
  const text = `${error?.name ?? ''}\n${error?.message ?? ''}\n${error?.stack ?? ''}`;
  return [...BROWSER_GLOBALS].some((name) => new RegExp(`(^|[^\\w$])${name}([^\\w$]|$)`, 'u').test(text));
}

function classifyImportError(error) {
  if (error instanceof ReferenceError) {
    const message = String(error.message);
    const tdz = INIT_TDZ_PATTERN.exec(message);
    if (tdz) return { kind: 'init', type: 'ReferenceError', symbol: tdz[1], message };
    for (const pattern of MISSING_GLOBAL_PATTERNS) {
      const missing = pattern.exec(message);
      if (missing) {
        const name = missing[1];
        return BROWSER_GLOBALS.has(name)
          ? { kind: 'browser-only', type: 'ReferenceError', symbol: name, message }
          : { kind: 'init', type: 'ReferenceError', symbol: name, message };
      }
    }
    return { kind: 'init', type: 'ReferenceError', message };
  }

  if (mentionsBrowserGlobal(error)) {
    return {
      kind: 'browser-only',
      type: error?.constructor?.name ?? typeof error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    kind: 'init',
    type: error?.constructor?.name ?? typeof error,
    message: error instanceof Error ? error.message : String(error),
  };
}

function firstStackFrame(error) {
  if (!(error instanceof Error)) return null;
  const lines = String(error.stack ?? '').split('\n');
  return lines.find((line) => /^\s+at\s/u.test(line))?.trim() ?? null;
}

async function main() {
  const { assetsDir, verbose } = parseArgs(process.argv.slice(2));
  let entries;
  try {
    entries = await readdir(assetsDir, { withFileTypes: true });
  } catch (error) {
    console.error(`[bundle-init-smoke] assets directory not readable: ${assetsDir}`);
    console.error(`[bundle-init-smoke] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  const chunks = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();

  if (chunks.length === 0) {
    console.error(`[bundle-init-smoke] no .js chunks found in: ${assetsDir}`);
    process.exitCode = 2;
    return;
  }

  console.log(`[bundle-init-smoke] assets: ${assetsDir}`);
  console.log(`[bundle-init-smoke] chunks: ${chunks.length}`);
  const dom = await installDomGlobals();
  if (!dom) {
    process.exitCode = 2;
    return;
  }
  console.log('[bundle-init-smoke] DOM shim: happy-dom Window installed before chunk imports');

  const failures = [];
  const browserOnly = [];
  const asyncRuntimeIgnored = [];
  let loaded = 0;

  // Der Entry-Chunk startet beim Import die React-App in der Happy-DOM. Seine Folgefehler
  // sind Runtime-/Browser-Fehler, kein Modul-Init; nur ein asynchroner TDZ wäre ein Befund.
  const onAsyncError = (error) => {
    if (error instanceof ReferenceError && INIT_TDZ_PATTERN.test(String(error.message))) {
      failures.push({
        chunk: '<async>',
        text: `ReferenceError: ${error.message}`,
        frame: firstStackFrame(error),
      });
      return;
    }
    asyncRuntimeIgnored.push(error instanceof Error ? error.message : String(error));
  };
  process.on('uncaughtException', onAsyncError);
  process.on('unhandledRejection', onAsyncError);

  // Chunk-eigene Browser-Warnungen (z. B. der Security-Banner eines Moduls) würden die
  // Smoke-Ausgabe sonst dominieren. Fehler werden weiterhin über Exceptions erkannt.
  const consoleMethods = ['log', 'info', 'warn', 'error'];
  const originalConsole = Object.fromEntries(consoleMethods.map((name) => [name, console[name]]));
  if (!verbose) {
    for (const name of consoleMethods) console[name] = () => undefined;
  }

  try {
    for (const chunk of chunks) {
      const filePath = path.join(assetsDir, chunk);
      try {
        await import(pathToFileURL(filePath).href);
        loaded += 1;
      } catch (error) {
        const classified = classifyImportError(error);
        if (classified.kind === 'init') {
          failures.push({
            chunk,
            text: `${classified.type}: ${classified.message}`,
            frame: firstStackFrame(error),
          });
        } else {
          browserOnly.push({ chunk, classified });
        }
      }
    }
  } finally {
    if (!verbose) {
      for (const name of consoleMethods) console[name] = originalConsole[name];
    }
    dom.close();
  }

  for (const failure of failures) {
    console.error(`[bundle-init-smoke] INIT FAILURE ${failure.chunk}: ${failure.text}`);
    if (failure.frame) console.error(`[bundle-init-smoke]   ${failure.frame}`);
  }

  if (browserOnly.length > 0) {
    const samples = browserOnly.slice(0, 5).map(({ chunk, classified }) =>
      `${chunk} (${classified.type ?? 'Error'}${classified.symbol ? `: ${classified.symbol}` : ''})`);
    console.log(`[bundle-init-smoke] browser-only: ${browserOnly.length} chunk(s); sample: ${samples.join(', ')}`);
  }

  if (asyncRuntimeIgnored.length > 0) {
    console.log(`[bundle-init-smoke] async runtime ignored: ${asyncRuntimeIgnored.length} (entry-app/browser, kein Modul-Init)`);
  }
  console.log(`[bundle-init-smoke] loaded: ${loaded}; browser-only: ${browserOnly.length}; init-failures: ${failures.length}`);
  const exitCode = failures.length > 0 ? 1 : 0;
  console.log(exitCode === 0
    ? '[bundle-init-smoke] RESULT: PASS (0 init errors)'
    : '[bundle-init-smoke] RESULT: FAIL');
  process.exitCode = exitCode;
  // Explizit beenden: Chunks dürfen Timer/Listener registriert haben; nach `window.close()`
  // soll der Smoke trotzdem deterministisch mit dem Ergebnis enden.
  await new Promise((resolve) => setImmediate(resolve));
  process.exit(exitCode);
}

await main();
