// STATUS: PLATIN — desktop packaging contract.
//
// The Windows/Linux/macOS installer must register a file association for every app the
// Open-Core edition actually implements, because the acceptance criterion for the
// Windows installer lifecycle is that double-clicking a document opens the right app.
//
// Before this suite the bundle declared only nine of the fourteen Open-Core extensions:
// `.vdraw`, `.vpolicy`, `.vpub`, `.vinsight`, `.vconnect` and `.vauto` were missing, so
// those document types had no OS association and could not be opened from the shell.
//
// The extension list is read from the real app catalog, so this test fails the moment the
// catalog and the bundle drift apart again.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from '../../../edition/catalog';
import { OPEN_CORE_APP_KINDS } from '../../../edition/contracts';

const REPO_ROOT = resolve(process.cwd(), '..');
const TAURI_CONF_PATH = resolve(REPO_ROOT, 'crates/vgt-desktop/tauri.conf.json');
const CAPABILITY_PATH = resolve(REPO_ROOT, 'crates/vgt-desktop/capabilities/default.json');

interface TauriConfig {
  readonly $schema?: string;
  readonly productName?: string;
  readonly identifier?: string;
  readonly build?: { readonly frontendDist?: string; readonly beforeBuildCommand?: { readonly script?: string; readonly cwd?: string } };
  readonly app?: {
    readonly withGlobalTauri?: boolean;
    readonly security?: { readonly csp?: string };
    readonly windows?: readonly { readonly title?: string; readonly width?: number; readonly height?: number }[];
  };
  readonly bundle?: {
    readonly active?: boolean;
    readonly targets?: string | readonly string[];
    readonly icon?: readonly string[];
    readonly fileAssociations?: readonly {
      readonly ext?: readonly string[];
      readonly name?: string;
      readonly mimeType?: string;
      readonly role?: string;
    }[];
  };
}

function loadConfig(): TauriConfig {
  return JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf8')) as TauriConfig;
}

function declaredExtensions(config: TauriConfig): string[] {
  return (config.bundle?.fileAssociations ?? [])
    .flatMap((association) => association.ext ?? [])
    .map((extension) => `.${extension.replace(/^\./u, '').toLowerCase()}`)
    .sort();
}

const openCoreCatalog = APP_CATALOG.filter((app) =>
  (OPEN_CORE_APP_KINDS as readonly string[]).includes(app.kind),
);

describe('Desktop packaging contract: file associations', () => {
  it('covers every Open-Core app extension declared by the app catalog', () => {
    const config = loadConfig();
    const declared = new Set(declaredExtensions(config));
    const expected = openCoreCatalog
      .map((app) => {
        // Restored in round 380 from the 2026-10-14 checkpoint; `app.extension` is optional in today's
        // catalog, so the access needs a guard. The guard ASSERTS rather than skips: an Open-Core app
        // without a declared extension is exactly what this test exists to catch, so it must fail here
        // instead of dropping silently out of `expected`.
        expect(app.extension, `${app.kind} declares no document extension`).toBeDefined();
        return app.extension!.toLowerCase();
      })
      .sort();

    const missing = expected.filter((extension) => !declared.has(extension));
    expect(missing, `document extensions with no OS file association: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares exactly the fourteen Open-Core extensions plus the aggregate container', () => {
    const config = loadConfig();
    const declared = declaredExtensions(config);
    const expected = [
      ...openCoreCatalog.map((app) => {
        expect(app.extension, `${app.kind} declares no document extension`).toBeDefined();
        return app.extension!.toLowerCase();
      }),
      '.vwc',
    ].sort();
    expect(declared).toEqual(expected);
    expect(declared).toHaveLength(15);
  });

  it('gives every association a human name, an editor role and a distinct MIME type', () => {
    const config = loadConfig();
    const associations = config.bundle?.fileAssociations ?? [];
    expect(associations.length).toBe(15);

    const mimeTypes = new Set<string>();
    for (const association of associations) {
      const extension = association.ext?.[0];
      expect(extension, 'an association is missing its extension').toBeTruthy();
      expect(association.name, `${String(extension)} has no display name`).toBeTruthy();
      expect(association.role).toBe('Editor');
      const mime = association.mimeType;
      expect(mime, `${String(extension)} has no MIME type`).toMatch(/^application\/x-astraea-[a-z0-9]+$/u);
      expect(mimeTypes.has(mime as string), `duplicate MIME type ${String(mime)}`).toBe(false);
      mimeTypes.add(mime as string);
    }
  });

  it('keeps the bundle self-contained and pointed at the open-core frontend build', () => {
    const config = loadConfig();
    expect(config.productName).toBe('Astraea Workspace Open Core');
    expect(config.identifier).toBe('technology.visiongaia.astraea.workspace.opencore');
    expect(config.build?.frontendDist).toBe('../../ui/dist/open-core');
    expect(config.build?.beforeBuildCommand?.script).toBe('npm run build:open-core');
    expect(config.build?.beforeBuildCommand?.cwd).toBe('../../ui');
    expect(config.bundle?.active).toBe(true);
    expect((config.bundle?.icon ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('ships a restrictive CSP with no inline script and no external origins', () => {
    const config = loadConfig();
    const csp = config.app?.security?.csp ?? '';
    expect(csp).not.toBe('');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // The only network origin allowed is the local Rust IPC daemon.
    const connectSrc = /connect-src ([^;]+);/u.exec(csp)?.[1] ?? '';
    const remoteOrigins = connectSrc
      .split(/\s+/u)
      .filter((token) => /^https?:\/\//u.test(token))
      .filter((token) => !/^http:\/\/(?:127\.0\.0\.1|ipc\.localhost)/u.test(token));
    expect(remoteOrigins, `remote origins in connect-src: ${remoteOrigins.join(', ')}`).toEqual([]);
  });

  it('grants the main window only event-subscription permissions', () => {
    const capability = JSON.parse(readFileSync(CAPABILITY_PATH, 'utf8')) as {
      identifier?: string;
      windows?: readonly string[];
      permissions?: readonly string[];
    };
    expect(capability.identifier).toBe('main-capability');
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual(['core:event:allow-listen', 'core:event:allow-unlisten']);
    // No filesystem, shell, dialog, http or process permission may be implicitly granted.
    for (const permission of capability.permissions ?? []) {
      expect(permission.startsWith('core:event:')).toBe(true);
    }
  });
});
