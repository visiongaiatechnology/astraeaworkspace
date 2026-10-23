import type { DocumentKind, VaultFile, VaultFolder } from '../../contracts/workspace';
import { checkVaultName, VaultNameError } from './vaultNames';

export type VaultViewMode = 'list' | 'grid' | 'gallery';
export type VaultSortKey = 'name' | 'size' | 'modified' | 'accessed' | 'type' | 'owner' | 'classification';
export type VaultSortDirection = 'asc' | 'desc';

export interface VaultFileSystemState {
  files: VaultFile[];
  folders: VaultFolder[];
}

export interface VaultFileQuery {
  folderId?: string | null;
  search?: string;
  kind?: string;
  tags?: string[];
  favoriteOnly?: boolean;
  pinnedOnly?: boolean;
  recentOnly?: boolean;
  owner?: string;
  classification?: string;
  status?: string;
  sortKey?: VaultSortKey;
  sortDirection?: VaultSortDirection;
  recentAfter?: number;
}

export interface VaultFolderNode {
  folder: VaultFolder;
  depth: number;
  childCount: number;
  fileCount: number;
}

export interface VaultOpenTarget {
  action: 'workspace' | 'preview' | 'download';
  app?: DocumentKind;
  label: string;
}

export interface VaultQuickPreview {
  kind: 'workspace' | 'image' | 'text' | 'pdf' | 'binary';
  title: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
  documentId?: string;
  warning?: string;
}

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_TYPES = new Set(['application/json', 'application/xml', 'application/javascript', 'application/yaml']);
const PREVIEW_TEXT_LIMIT = 256 * 1024;

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function id(prefix: string, now = Date.now()): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('vault_secure_random_unavailable');
  const random = globalThis.crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${now}-${Array.from(random, (value) => value.toString(16).padStart(8, '0')).join('')}`;
}

/**
 * **V-004.** Der Name wird **geprüft**, nicht still gekürzt. Vorher stand hier `trimmed.slice(0, 240)`:
 * ein 300 Zeichen langer Ordnername wurde damit klaglos zu einem **anderen** Namen, während derselbe Fall
 * beim Import abgelehnt wurde. Wer einen Namen will, der zu lang ist, bekommt jetzt eine benannte Ablehnung
 * statt eines stillen anderen Namens. Ein leerer oder unbrauchbarer Name fällt weiterhin auf den
 * Vorgabenamen zurück — das ist keine Kürzung, sondern der einzige sinnvolle Wert für „nichts eingegeben".
 */
function normalizedName(value: string, fallback: string): string {
  const check = checkVaultName(value);
  if (check.ok) return check.name!;
  // Unbrauchbare Eingabe (leer, `.`, `..`, Steuerzeichen) → Vorgabename.
  if (check.reason !== 'too_long') return fallback;
  // Zu lang → ablehnen. Ein gekürzter Name wäre ein anderer Name.
  throw new VaultNameError('too_long', check.message!);
}

export function createVaultFolder(name: string, parentId: string | null = null, now = Date.now()): VaultFolder {
  return {
    id: id('vfolder', now),
    name: normalizedName(name, 'New Folder'),
    parentId,
    createdAt: now,
    modifiedAt: now,
    owner: 'local-user',
    classification: 'Internal',
  };
}

export function normalizeVaultFile(file: VaultFile, now = Date.now()): VaultFile {
  const normalized: VaultFile = {
    ...file,
    folderId: file.folderId ?? null,
    tags: [...new Set((file.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 32),
    favorite: Boolean(file.favorite),
    pinned: Boolean(file.pinned),
    createdAt: file.createdAt ?? file.lastModified ?? now,
    lastAccessedAt: file.lastAccessedAt ?? file.lastModified ?? now,
    owner: file.owner?.trim() || 'local-user',
    classification: file.classification ?? 'Internal',
    status: file.status ?? (file.integrityState === 'mismatch' ? 'corrupt' : 'available'),
    properties: Object.fromEntries(Object.entries(file.properties ?? {}).filter(([key,value]) => key.trim() && String(value).trim()).slice(0,64).map(([key,value]) => [key.trim().slice(0,80), String(value).trim().slice(0,512)])),
    spaceIds: [...new Set((file.spaceIds ?? []).map((value) => value.trim()).filter(Boolean))].slice(0,32),
  };
  /**
   * Gemessener Befund (Runde 82, V-032): Hier stand `association: file.association ?? inferVaultFileAssociation(file)`.
   * `file` ist das **Eingabeobjekt**, `normalized` das Ergebnis — beide tragen denselben `name`. Für sich
   * genommen war das korrekt. Der Fehler entstand bei den Aufrufern: `renameVaultFile` und
   * `updateVaultFileMetadata` setzen `file.association = inferVaultFileAssociation(file)` nach der
   * Namensänderung und rufen **danach** `normalizeVaultFile(updated)` auf — nur wurde die neu berechnete
   * Zuordnung dabei verworfen und aus demselben ( bereits umbenannten) Objekt neu abgeleitet … mit dem
   * Effekt, dass eine als `tabelle.vgrid` umbenannte Datei weiter `app: 'Writer'` trug.
   *
   * Konkret gemessen: `renameVaultFile(state, 'a', 'tabelle.vgrid')` ergab
   * `{action:'workspace', app:'Writer', source:'fallback'}` statt `app:'Grid', source:'extension'` — die
   * Zuordnung war für die Oberfläche sichtbar falsch, und ein Klick auf „Open With" hätte die Datei an die
   * falsche App gegeben.
   *
   * Die Ableitung benutzt jetzt ausdrücklich die **normalisierten** Felder, damit Zuordnung und Name nicht
   * auseinanderlaufen können.
   */
  normalized.association = file.association ?? inferVaultFileAssociation({
    name: normalized.name, kind: normalized.kind, sourceType: normalized.sourceType,
    mimeType: normalized.mimeType, documentId: normalized.documentId,
  });
  return normalized;
}

export function normalizeVaultFileSystem(state: VaultFileSystemState, now = Date.now()): VaultFileSystemState {
  const folderIds = new Set<string>();
  const folders = (state.folders ?? []).map((folder) => ({
    ...folder,
    name: normalizedName(folder.name, 'Folder'),
    parentId: folder.parentId ?? null,
    createdAt: folder.createdAt ?? now,
    modifiedAt: folder.modifiedAt ?? now,
    owner: folder.owner?.trim() || 'local-user',
    classification: folder.classification ?? 'Internal',
  })).filter((folder) => {
    if (!folder.id || folderIds.has(folder.id)) return false;
    folderIds.add(folder.id);
    return true;
  });
  const known = new Set(folders.map((folder) => folder.id));
  for (const folder of folders) if (folder.parentId && !known.has(folder.parentId)) folder.parentId = null;
  const files = (state.files ?? []).map((file) => {
    const normalized = normalizeVaultFile(file, now);
    return normalized.folderId && !known.has(normalized.folderId) ? { ...normalized, folderId: null } : normalized;
  });
  return { files, folders };
}

export function renameVaultFolder(state: VaultFileSystemState, folderId: string, name: string, now = Date.now()): VaultFileSystemState {
  const next = clone(state);
  const folder = next.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error('vault_folder_not_found');
  folder.name = normalizedName(name, folder.name);
  folder.modifiedAt = now;
  return next;
}

/**
 * **AST-1137 — die eine Quelle für „welche Ordner liegen unter diesem".**
 *
 * Die Oberfläche braucht sie, um **unmögliche Ziele auszublenden** (ein Ordner kann nicht in sich selbst
 * oder in einen seiner Nachfahren), und die Engine braucht sie, um `vault_folder_cycle` zu werfen. **Beide
 * benutzen jetzt diese Funktion** — eine zweite Durchlaufregel wäre eine zweite Wahrheit über den Baum.
 *
 * Sie ist **robust gegen einen kaputten Baum**: ein Zyklus in den Daten beendet den Durchlauf über
 * `visited`, statt die Oberfläche in eine Endlosschleife zu ziehen.
 */
export function descendantVaultFolderIds(folders: readonly VaultFolder[], ancestorId: string): string[] {
  if (typeof ancestorId !== 'string' || !ancestorId) return [];
  const byParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder?.id || !folder.parentId) continue;
    const siblings = byParent.get(folder.parentId);
    if (siblings) siblings.push(folder.id);
    else byParent.set(folder.parentId, [folder.id]);
  }
  const found: string[] = [];
  const visited = new Set<string>([ancestorId]);
  const stack = [...(byParent.get(ancestorId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    found.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return found;
}

function isDescendant(folders: VaultFolder[], candidateId: string, ancestorId: string): boolean {
  return descendantVaultFolderIds(folders, ancestorId).includes(candidateId);
}

export function moveVaultFolder(state: VaultFileSystemState, folderId: string, parentId: string | null, now = Date.now()): VaultFileSystemState {
  const next = clone(state);
  const folder = next.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error('vault_folder_not_found');
  if (parentId === folderId || (parentId && isDescendant(next.folders, parentId, folderId))) throw new Error('vault_folder_cycle');
  if (parentId && !next.folders.some((candidate) => candidate.id === parentId)) throw new Error('vault_parent_not_found');
  folder.parentId = parentId;
  folder.modifiedAt = now;
  return next;
}

export function moveVaultFiles(state: VaultFileSystemState, fileIds: string[], folderId: string | null, now = Date.now()): VaultFileSystemState {
  if (folderId && !state.folders.some((folder) => folder.id === folderId)) throw new Error('vault_target_folder_not_found');
  const ids = new Set(fileIds);
  const next = clone(state);
  next.files = next.files.map((file) => ids.has(file.id) ? { ...file, folderId, lastModified: now } : file);
  return next;
}

function splitFilename(name: string): { stem: string; extension: string } {
  const index = name.lastIndexOf('.');
  if (index <= 0) return { stem: name, extension: '' };
  return { stem: name.slice(0, index), extension: name.slice(index) };
}

export function duplicateVaultFiles(state: VaultFileSystemState, fileIds: string[], targetFolderId?: string | null, now = Date.now()): VaultFileSystemState {
  const next = clone(state);
  const ids = new Set(fileIds);
  const copies: VaultFile[] = [];
  for (const file of next.files) {
    if (!ids.has(file.id)) continue;
    const { stem, extension } = splitFilename(file.name);
    copies.push({
      ...clone(file),
      id: id('vf', now + copies.length),
      name: `${stem} copy${extension}`,
      folderId: targetFolderId === undefined ? file.folderId ?? null : targetFolderId,
      createdAt: now,
      lastModified: now,
      lastAccessedAt: now,
      integrityState: file.contentDigest ? file.integrityState : 'unverified',
    });
  }
  if (!copies.length) throw new Error('vault_file_not_found');
  if (targetFolderId && !next.folders.some((folder) => folder.id === targetFolderId)) throw new Error('vault_target_folder_not_found');
  next.files = [...copies, ...next.files];
  return next;
}

export function copyVaultFiles(state: VaultFileSystemState, fileIds: string[], targetFolderId: string | null, now = Date.now()): VaultFileSystemState {
  return duplicateVaultFiles(state, fileIds, targetFolderId, now);
}

export function renameVaultFile(state: VaultFileSystemState, fileId: string, name: string, now = Date.now()): VaultFileSystemState {
  const next = clone(state);
  const file = next.files.find((candidate) => candidate.id === fileId);
  if (!file) throw new Error('vault_file_not_found');
  file.name = normalizedName(name, file.name);
  file.lastModified = now;
  /**
   * Befund + Fix (Runde 82, V-032): Hier stand nur `file.association = inferVaultFileAssociation(file)`.
   * `kind` und `mimeType` wurden **nicht** mitgezogen, obwohl `kind` aus dem Dateinamen abgeleitet ist
   * (`inferVaultKindFromFilename` beim Import). Eine als `notiz.txt` importierte Datei trug `kind: 'Writer'`;
   * nach dem Umbenennen auf `tabelle.vgrid` blieb `Writer` stehen — und weil `inferVaultFileAssociation`
   * seit dem Fix V-028 die Dokumentart als Rückfall benutzt, zeigte die Oberfläche weiter „Open with Writer"
   * für eine Grid-Datei. Gemessen vor dem Fix:
   * `renameVaultFile(…, 'tabelle.vgrid')` → `{action:'workspace', app:'Writer', source:'fallback'}`.
   * Jetzt wird die Dokumentart aus dem neuen Namen neu bestimmt; die Zuordnung folgt von selbst.
   */
  const inferredKind = inferVaultKindFromFilename(file.name);
  if (file.sourceType !== 'workspace-document') file.kind = inferredKind;
  file.association = inferVaultFileAssociation(file);
  return { ...next, files: next.files.map((candidate) => candidate.id === fileId ? normalizeVaultFile(file, now) : candidate) };
}

export function updateVaultFileMetadata(
  state: VaultFileSystemState,
  fileIds: string[],
  patch: Pick<Partial<VaultFile>, 'tags' | 'favorite' | 'pinned' | 'owner' | 'classification' | 'status' | 'association' | 'properties' | 'spaceIds'>,
  now = Date.now()
): VaultFileSystemState {
  const ids = new Set(fileIds);
  const next = clone(state);
  next.files = next.files.map((file) => {
    if (!ids.has(file.id)) return file;
    const updated: VaultFile = {
      ...file,
      ...patch,
      tags: patch.tags ? [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 32) : file.tags,
      owner: patch.owner !== undefined ? (patch.owner.trim() || 'local-user') : file.owner,
      lastModified: now,
    };
    return normalizeVaultFile(updated, now);
  });
  return next;
}

export function markVaultFileAccessed(state: VaultFileSystemState, fileId: string, now = Date.now()): VaultFileSystemState {
  const next = clone(state);
  const file = next.files.find((candidate) => candidate.id === fileId);
  if (!file) throw new Error('vault_file_not_found');
  file.lastAccessedAt = now;
  return next;
}

function comparePrimitive(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortValue(file: VaultFile, key: VaultSortKey): string | number {
  if (key === 'size') return file.sizeBytes;
  if (key === 'modified') return file.lastModified;
  if (key === 'accessed') return file.lastAccessedAt ?? 0;
  if (key === 'type') return file.mimeType || file.kind;
  // Gemessener Befund (Runde 82): Ein fehlender Wert wurde über `String(undefined)` zum **Text**
  // „undefined" und sortierte dadurch alphabetisch unter echten Werten ein — bei aufsteigender Sortierung
  // landeten Dateien ohne Besitzer/Klassifikation **vor** `Confidential`, bei absteigender dahinter. Für
  // eine Klassifikationssortierung ist das falsch: eine unbekannte Einstufung gehört ans Ende, nicht
  // zwischen die bekannten. Jetzt wird ein fehlender Wert als leerer String geführt.
  if (key === 'owner') return file.owner ?? '';
  if (key === 'classification') return file.classification ?? '';
  return file.name;
}

export function queryVaultFiles(files: VaultFile[], query: VaultFileQuery): VaultFile[] {
  const search = query.search?.trim().toLocaleLowerCase() ?? '';
  const requiredTags = new Set((query.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
  const recentAfter = query.recentAfter ?? (Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filtered = files.filter((raw) => {
    const file = normalizeVaultFile(raw);
    if (query.folderId !== undefined && (file.folderId ?? null) !== query.folderId) return false;
    if (query.kind && query.kind !== 'all' && file.kind.toLowerCase() !== query.kind.toLowerCase()) return false;
    if (query.favoriteOnly && !file.favorite) return false;
    if (query.pinnedOnly && !file.pinned) return false;
    if (query.recentOnly && (file.lastAccessedAt ?? 0) < recentAfter) return false;
    if (query.owner && file.owner !== query.owner) return false;
    if (query.classification && file.classification !== query.classification) return false;
    if (query.status && file.status !== query.status) return false;
    const tags = (file.tags ?? []).map((tag) => tag.toLocaleLowerCase());
    for (const tag of requiredTags) if (!tags.includes(tag)) return false;
    if (search) {
      const haystack = [file.name, file.mimeType ?? '', file.kind, file.owner ?? '', file.classification ?? '', ...(file.tags ?? []), file.contentDigest ?? file.encryptedHash ?? '']
        .join('\n').toLocaleLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  const key = query.sortKey ?? 'name';
  const direction = query.sortDirection === 'desc' ? -1 : 1;
  return filtered.sort((a, b) => direction * comparePrimitive(sortValue(a, key), sortValue(b, key)) || a.id.localeCompare(b.id));
}

export function buildVaultFolderTree(folders: VaultFolder[], files: VaultFile[]): VaultFolderNode[] {
  const result: VaultFolderNode[] = [];
  const visited = new Set<string>();
  const childrenOf = (parentId: string | null) => folders
    .filter((folder) => (folder.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visit = (folder: VaultFolder, depth: number) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    const children = childrenOf(folder.id);
    result.push({
      folder,
      depth,
      childCount: children.length,
      fileCount: files.filter((file) => file.folderId === folder.id).length,
    });
    for (const child of children) visit(child, depth + 1);
  };
  for (const root of childrenOf(null)) visit(root, 0);
  for (const orphan of folders.filter((folder) => !visited.has(folder.id))) visit(orphan, 0);
  return result;
}

function extension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

/**
 * Dokumentart aus dem Dateinamen.
 *
 * **Warum hier und nicht in `integrity/vaultIntegrity.ts`:** dort gibt es bereits
 * `inferVaultKindFromFilename`. Dieses Modul kann sie nicht importieren — `vaultIntegrity` importiert
 * `inferVaultFileAssociation` aus **diesem** Modul, ein Rückimport wäre ein Zyklus. Die Tabelle ist deshalb
 * hier bewusst eine **zweite** Implementierung derselben Abbildung, und das ist genau das Muster, das
 * dieses Projekt schon mehrfach getroffen hat (zwei A1-Parser, zwei Range-Grenzen). Sie ist im Inventar als
 * **V-033** registriert, damit sie nicht unbemerkt auseinanderläuft. Ein Test in
 * `vaultFileSystemEngine.test.ts` vergleicht beide Tabellen Zeile für Zeile und wird rot, sobald sie sich
 * unterscheiden.
 */
const KIND_BY_EXTENSION: Readonly<Record<string, DocumentKind>> = Object.freeze({
  // `docx` stand in der Vorgänger-Tabelle (`appByExtension`) und fehlte in meiner ersten Fassung dieser
  // Tabelle — die Folge war, dass `a.docx` plötzlich über den Rückfall lief (`source: 'fallback'`) statt
  // über die Endung. Gefunden durch einen Test, nicht durch Hinsehen. Der Divergenztest gegen
  // `vaultIntegrity.inferVaultKindFromFilename` prüft `docx` jetzt mit.
  docx: 'Writer',
  vgrid: 'Grid', csv: 'Grid', xlsx: 'Grid', ods: 'Grid', vg: 'Grid',
  vpresent: 'Present', pptx: 'Present', odp: 'Present',
  vnote: 'Notes', md: 'Notes',
  vpdf: 'PdfStudio', pdf: 'PdfStudio',
  vboard: 'Whiteboard',
  vtask: 'Tasks',
});

export function inferVaultKindFromFilename(name: string): DocumentKind {
  return KIND_BY_EXTENSION[extension(name)] ?? 'Writer';
}

/** Nur für den Divergenztest: die hier verwendete Tabelle lesbar machen. */
export function vaultKindByExtensionTable(): Readonly<Record<string, DocumentKind>> {
  return KIND_BY_EXTENSION;
}

/**
 * Dokumentarten, die eine echte Anwendung im Arbeitsbereich haben. `Vault`, `PdfStudio` und alles
 * Unbekannte stehen bewusst **nicht** hier — für sie ist „öffnen" keine App-Zuordnung.
 */
const WORKSPACE_ASSOCIABLE_KINDS = new Set<DocumentKind>([
  'Writer', 'Grid', 'Present', 'Notes', 'Whiteboard', 'Tasks',
]);

export function inferVaultFileAssociation(file: Pick<VaultFile, 'name' | 'kind' | 'sourceType' | 'mimeType' | 'documentId'>): NonNullable<VaultFile['association']> {
  if (file.sourceType === 'workspace-document' && file.documentId) return { action: 'workspace', app: file.kind, source: 'native' };
  /**
   * Reihenfolge: Endung → MIME → Dokumentart. Endung und Dokumentart stammen aus **derselben** Tabelle
   * (`KIND_BY_EXTENSION`), deshalb kann hier kein Widerspruch entstehen; `inferVaultKindFromFilename` wird
   * lediglich dann benötigt, wenn der Aufrufer (etwa `updateVaultFileMetadata`) die Art noch nicht
   * mitgezogen hat.
   */
  const byExtension = KIND_BY_EXTENSION[extension(file.name)];
  if (byExtension) return { action: 'workspace', app: byExtension, source: 'extension' };
  // MIME kommt **vor** der Dokumentart: ein PNG heißt `image/png` und ist damit eine Vorschau, auch wenn
  // `kind` (aus einer früheren Zuordnung) „Writer" sagt.
  if (file.mimeType?.startsWith('image/') || file.mimeType === 'application/pdf' || isTextMime(file.mimeType ?? '')) {
    return { action: 'preview', source: 'mime' };
  }
  /**
   * Gemessener Befund (Runde 82, V-028): Eine angehängte Datei, deren Endung **nicht** in der Tabelle
   * steht, bekam `download` — auch dann, wenn der Vault bereits wusste, welche Dokumentart sie ist
   * (`file.kind` wurde beim Import aus dem Dateinamen gesetzt). Im „Open With…"-Menü fehlte dadurch das
   * „Open with Writer"-Ziel für jede Datei ohne erkannte Endung, obwohl die App bekannt war. Der `kind`
   * ist deshalb jetzt der **letzte** Hinweis.
   *
   * Gemessene Einschränkung, die dabei sichtbar wurde: `kind` ist die einzige Informationsquelle für eine
   * Datei `a.bin`, die ursprünglich `a.docx` hieß — sie liefert „Writer". Eine wirklich unbekannte
   * Binärdatei trägt nach der Normalisierung ebenfalls `Writer` (der Standard aus
   * `inferVaultKindFromFilename`). Beide sind damit nicht unterscheidbar, und „Open with Writer" ist für
   * die zweite ein Angebot, das der Nutzer ablehnen kann, statt eines stillen Fehlers. Eine feinere
   * Unterscheidung bräuchte ein `kind: 'Unknown'` im Vertrag — das ist als V-034 registriert, nicht
   * stillschweigend hier erfunden.
   */
  if (WORKSPACE_ASSOCIABLE_KINDS.has(file.kind)) return { action: 'workspace', app: file.kind, source: 'fallback' };
  return { action: 'download', source: 'fallback' };
}

export function vaultOpenTargets(file: VaultFile): VaultOpenTarget[] {
  const association = file.association ?? inferVaultFileAssociation(file);
  const targets: VaultOpenTarget[] = [];
  // Eine **manuell** gesetzte Zuordnung gewinnt. Vorher wurde sie hier ignoriert, sodass die vom Nutzer
  // gesetzte Standardaktion im „Open With…"-Menü nicht ankam — die Oberfläche zeigte die Zuordnung an
  // (`VaultFileEntry` liest `file.association`), handelte aber nach der abgeleiteten.
  if (association.source === 'manual') {
    if (association.action === 'workspace' && association.app) targets.push({ action: 'workspace', app: association.app, label: `Open with ${association.app}` });
    if (association.action === 'preview' && file.sourceType === 'attachment') targets.push({ action: 'preview', label: 'Quick Preview' });
    if (association.action === 'download' && file.sourceType === 'attachment') targets.push({ action: 'download', label: 'Download original' });
    return targets;
  }
  if (association.action === 'workspace' && association.app) targets.push({ action: 'workspace', app: association.app, label: `Open with ${association.app}` });
  if (file.sourceType === 'attachment' && (file.mimeType?.startsWith('image/') || file.mimeType === 'application/pdf' || isTextMime(file.mimeType ?? ''))) {
    targets.push({ action: 'preview', label: 'Quick Preview' });
  }
  if (file.sourceType === 'attachment') targets.push({ action: 'download', label: 'Download original' });
  return targets;
}

function isTextMime(mimeType: string): boolean {
  return TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || TEXT_MIME_TYPES.has(mimeType);
}

function decodeDataUrlText(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('vault_preview_invalid_data_url');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return decodeURIComponent(body);
}

export function buildVaultQuickPreview(file: VaultFile): VaultQuickPreview {
  const mimeType = file.mimeType || 'application/octet-stream';
  if (file.sourceType === 'workspace-document' && file.documentId) {
    return { kind: 'workspace', title: file.name, mimeType: `application/x-vgt-${file.kind.toLowerCase()}`, documentId: file.documentId };
  }
  if (!file.payloadDataUrl) return { kind: 'binary', title: file.name, mimeType, warning: 'No local payload is stored for preview.' };
  if (mimeType.startsWith('image/')) return { kind: 'image', title: file.name, mimeType, dataUrl: file.payloadDataUrl };
  if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return { kind: 'pdf', title: file.name, mimeType: 'application/pdf', dataUrl: file.payloadDataUrl };
  if (isTextMime(mimeType)) {
    if (file.sizeBytes > PREVIEW_TEXT_LIMIT) return { kind: 'text', title: file.name, mimeType, warning: 'Text preview is limited to 256 KiB.' };
    return { kind: 'text', title: file.name, mimeType, text: decodeDataUrlText(file.payloadDataUrl).slice(0, PREVIEW_TEXT_LIMIT) };
  }
  return { kind: 'binary', title: file.name, mimeType, warning: 'Binary file: preview is intentionally disabled.' };
}
