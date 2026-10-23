// STATUS: DIAMANT VGT SUPREME — Astraea Connect Types
export type ConnectViewMode = 'mail' | 'calendar' | 'contacts';

export interface ConnectMessage {
  id: string;
  threadId?: string;
  sender: string;
  senderEmail: string;
  recipients: string[];
  /** Cc recipients, needed for a correct reply-all and for the import/export round trip. */
  cc?: string[];
  subject: string;
  /** RFC 5322 Message-ID of this message, in wire form (`<id@host>`). */
  messageId?: string;
  /** RFC 5322 `In-Reply-To` of the parent message. */
  inReplyTo?: string;
  /** RFC 5322 `References` chain, oldest first. */
  references?: string[];
  /** RFC 5322 `Reply-To`, when it differs from the sender. */
  replyTo?: string;
  snippet: string;
  body: string;
  timestamp: number;
  // Mirrors the canonical ConnectFolderKind (platform/connectors/connectCoreTypes.ts:5): junk and
  // 	rash existed in defaultMailFolders with no reachable UI, so they were missing here too.
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'vault' | 'junk' | 'trash';
  /**
   * Explicit delivery state of an outgoing message. The `folder` union has no outbox member,
   * so a scheduled-but-unsent mail keeps its storage folder and declares `delivery: 'queued'`
   * instead of being smuggled into `folder: 'sent'`. 'held' means the local preparation (for
   * example a real encryption step) finished but no transport carried the message.
   * Absent on legacy/plain messages.
   */
  delivery?: 'queued' | 'held' | 'sent' | 'failed';
  /**
   * How many send attempts were made. `> 0` is the only honest source for a "retried" claim
   * (`domain/connectClaims.ts`); nothing in the UI may show a retry that was not recorded here.
   */
  deliveryAttempts?: number;
  /** Bounded machine code of the last failed attempt (`compareAndRetry`, `domain/connectDeliveryRules.ts`). */
  deliveryFailureCode?: string;
  /** Timestamp of the last attempt, for the honest "last attempt" line in the queue view. */
  deliveryLastAttemptAt?: number;
  /**
   * What the remote end confirmed. Only `'relay-accepted'` may ever be rendered as "delivered";
   * a local queue entry is not a delivery, and this field is the only source for that word.
   */
  deliveryAck?: 'none' | 'relay-accepted';
  /**
   * IMAP UID assigned by the server. Present only after a real fetch/sync assigned it; it is the
   * proof that an "in sync" statement is about a server-confirmed object.
   */
  remoteUid?: number;
  /** IMAP folder path the server reported, kept next to `folder` for the folder-structure claim. */
  remoteFolderId?: string;
  /** Labels attached to this message (IMAP keywords / user labels). Defaults to none. */
  labels?: string[];
  isUnread: boolean;
  isStarred: boolean;
  isEncrypted: boolean;
  /**
   * GAP-0057, Runde 295: DIE EVIDENZ, DIE `isEncrypted` BELEGT.
   *
   * `isEncrypted` allein ist eine Behauptung ohne Beweis — ein nacktes Feld, das
   * jeder setzen kann, und die Oberflaeche zeigt darauf ein Schloss mit dem
   * Titel "Ende-zu-Ende-verschluesselt". `domain/connectClaims.ts` fuehrt den
   * Resolver, der genau das verhindern soll (`mayRenderClaim`), aber er hatte
   * NULL Produktionsverbraucher, weil die Nachricht die Evidenz gar nicht
   * tragen KONNTE.
   *
   * Der Wert ist der Name der OPERATION, die das Chiffrat erzeugt hat. In
   * diesem Build gibt es keine WebCrypto-Operation, also bleibt das Feld leer —
   * und die Liste zeigt kein Schloss. Das ist die ehrliche Anzeige.
   *
   * Persistenz: `state/connectPersistence.ts:125` legt das GANZE Modell als
   * `vgtConnectView` ab und liest bevorzugt daraus (:144-145) — dieses Feld
   * ueberlebt den Roundtrip ohne Aenderung der Projektion. Die Projektion
   * (`legacyMessageToCore`) ist der Fallback fuer Fremddateien.
   */
  encryptionEvidence?: 'webcrypto-ciphertext-created';
  signatureStatus?: 'verified' | 'invalid' | 'expired' | 'not-yet-valid' | 'unsigned' | 'unknown';
  signatureKind?: 'pgp' | 'smime';
  /** Declared size in KB, kept for the compact list. Prefer `attachmentBytes` when present. */
  attachments?: { name: string; sizeKb: number }[];
  /**
   * Real transferred size and digest per attachment, recorded during import/export so a size claim in
   * the UI comes from the bytes that were actually read. Bounded by `CONNECT_MAIL_LIMITS`.
   */
  attachmentBytes?: { name: string; sizeBytes: number; sha256?: string }[];
}

export interface ConnectEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endDate: string;
  endTime: string;
  location?: string;
  category: 'engineering' | 'security' | 'review' | 'general';
  attendees: string[];
  description?: string;
}

export interface ConnectContact {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  organization: string;
  role: string;
  gpgFingerprint?: string;
}

export interface ConnectDocumentModel {
  viewMode: ConnectViewMode;
  selectedFolder: string;
  messages: ConnectMessage[];
  selectedMessageId: string | null;
  events: ConnectEvent[];
  contacts: ConnectContact[];
  searchQuery: string;
  /**
   * Configured mail accounts. Empty means "no account set up yet" — the honest empty state the
   * sidebar footer used to hide behind a hardcoded address and a green dot.
   */
  accounts?: ConnectAccountSetting[];
  /** Result of the last connectivity attempt per adapter; absent means "never attempted here". */
  connection?: ConnectConnectionState;
  /** Offline cache/sync bookkeeping, bounded by `connectSyncCore` limits. */
  sync?: ConnectSyncState;
  /** User-defined IMAP folders/labels on top of the six default kinds. */
  labels?: ConnectLabel[];
  /** Server-side filter rules, evaluated by `domain/connectMailCore.matchesRule`. */
  rules?: ConnectMailRuleSetting[];
  /** Notification/focus preferences for new mail and events. */
  focus?: ConnectFocusState;
  /** Bounded in-app notification tray (never a permanent popup). */
  notifications?: ConnectNotification[];
}

export interface ConnectAccountSetting {
  id: string;
  name: string;
  address: string;
  kind: 'imap+local';
  /** IMAP endpoint the account was set up against. */
  host: string;
  port: number;
  tls: 'starttls-required';
  username: string;
  /**
   * KeyVault reference only. A password/token itself must never be stored here — the sidecar
   * check `connectCredentialBoundary` rejects any inline secret before a document is saved.
   */
  credentialHandle: string;
  /** Measured TLS verdict of the last check; `unchecked` until something really checked. */
  tlsCertificate: 'unchecked' | 'trusted' | 'failed';
  /** `verified` only after a real probe; the acceptance scenario asks for a *checked* TLS config. */
  tlsCheckedAt?: number;
  isDefault: boolean;
  createdAt: number;
}

export interface ConnectConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  adapter?: 'imap' | 'smtp' | 'caldav' | 'carddav';
  /** Why the last attempt failed, as a bounded machine code. */
  code?: string;
  checkedAt?: number;
}

export interface ConnectFolderSyncReport {
  /** Server-reported folder path. */
  path: string;
  uidValidity?: number;
  uidNext?: number;
  /** Total message count the server reported for this folder. */
  messageCount: number;
  /** How many messages this app really stored for the folder. */
  storedCount?: number;
  lastUid?: number;
  /** Set only after a *complete* envelope reconciled the folder — the proof for "in sync". */
  reconciledAt?: number;
}

export interface ConnectSyncState {
  accountId?: string;
  /** Server sync token/UIDVALIDITY set, only after a real handshake. */
  syncToken?: string;
  lastSyncAt?: number;
  /** Per-folder UID bookkeeping; the "UID and folder structure preserved" proof. */
  folders: ConnectFolderSyncReport[];
  /** Local changes made while offline; flushed on the next successful sync. */
  pending: Array<{ messageId: string; op: 'move' | 'read' | 'star' | 'label'; value?: string }>;
  /** True while a sync is running, so the UI can show progress instead of a status word. */
  inProgress: boolean;
  conflicts: Array<{ messageId: string; local: string; remote: string; resolution: 'unresolved' | 'local' | 'remote' }>;
}

export interface ConnectLabel {
  id: string;
  name: string;
  /** Folder kind it is attached to, or `custom` for a user-created IMAP folder. */
  kind: 'inbox' | 'sent' | 'drafts' | 'archive' | 'vault' | 'custom';
}

export interface ConnectMailRuleSetting {
  id: string;
  name: string;
  enabled: boolean;
  /** Match text, matched against sender/subject/body. */
  match: string;
  /** Where matching mail goes. A rule never deletes silently. */
  action: 'move' | 'label' | 'flag';
  target?: string;
}

export interface ConnectFocusState {
  /** Notification badge on the app icon / sidebar. */
  badgeEnabled: boolean;
  /** Quiet hours in local `HH:MM`; inside them nothing is surfaced. */
  quietFrom: string;
  quietTo: string;
  /** Calendar alerts are surfaced as list entries, never as a permanent popup. */
  calendarAlertsEnabled: boolean;
}

export interface ConnectNotification {
  id: string;
  kind: 'mail' | 'calendar' | 'sync' | 'security';
  /** Already-localized-ready machine key plus arguments; rendering decides the wording. */
  code: string;
  args?: Record<string, string | number>;
  createdAt: number;
  readAt?: number;
  /** Set when the notification was suppressed by quiet hours or focus state. */
  suppressed?: boolean;
}

// GAP-0056, Runde 300: DIESE STARTDATEN BEHAUPTETEN KRYPTOGRAFIE, DIE ES NICHT
// GIBT — und die Oberflaeche zeigte sie an.
//
// GEMESSEN VORHER: `msg-1` und `msg-2` trugen `isEncrypted: true`, von Hand
// gesetzt, aus keinem Krypto-Pfad. `components/ConnectMailList.tsx:112` rendert
// bei diesem Feld ein Schloss mit dem Titel `copy.encryptedTitle` — und der
// heisst in ALLEN SIEBEN SPRACHEN "Ende-zu-Ende-verschluesselt". Die Texte der
// beiden Nachrichten behaupteten dazu "Zero-Knowledge KeyVault", "all
// cryptographic routines comply", "ECDH P-256 session exchange" und
// "tamper-evident journals".
//
// UND DIESELBE ANWENDUNG SAGT AN ANDERER STELLE DAS GEGENTEIL:
// `locale/connectLocale.ts` traegt `composeEncryptionNote: 'Keine
// Verschluesselung — auf diesem Weg laeuft keine Schluesseloperation.'` und
// `queuedNotice: '… Sie ist nicht verschluesselt.'`. `connectClaims.ts` fuehrt
// die Evidenz `'openpgp-signature-verified'` als ANFORDERUNG fuer die Zusage
// `key-verified` — und KEIN Produktionspfad in `ui/src` erzeugt sie.
//
// WARUM DIE STARTDATEN UND NICHT DIE ANZEIGE: der Verfassen-Pfad rechnet
// bereits ehrlich (`ConnectMailViewer.tsx:114` setzt
// `isEncrypted: resolution.encryptedForReal`, und `connectDeliveryState.ts:52`
// definiert das als `encrypted && !encryptionFailed`). Die Luecke ist, dass die
// LISTE dem GESPEICHERTEN Feld vertraut — und dieses Feld hat hier niemand
// erzeugt. Ein Zustand, den keine Operation hervorbringt, gehoert nicht in die
// Vorgabe.
//
// WAS BLEIBT: die Anzeige prueft weiterhin nur das Feld. Der prinzipielle Weg
// waere `mayRenderClaim('encrypted', evidence)` aus `connectClaims.ts` — der
// Zusage-Resolver des Moduls, der genau dafuer existiert und den die Liste
// NICHT benutzt. Das ist eine eigene Aufgabe und steht im Register.
export const DEFAULT_CONNECT_MODEL: ConnectDocumentModel = {
  viewMode: 'mail',
  selectedFolder: 'inbox',
  messages: [
    {
      id: 'msg-1',
      sender: 'Sovereign Audit Board',
      senderEmail: 'auditor@vgt.internal',
      recipients: ['engineer@vgt.internal'],
      subject: 'Review abgeschlossen: Richtlinienpruefung der lokalen Ablage',
      snippet: 'Der Bericht zur Richtlinienpruefung liegt vor; die Pruefpunkte sind aufgezeichnet...',
      body: 'Hallo Team,\n\nDie Durchsicht der lokalen Ablage- und Richtlinienebene ist abgeschlossen. Die Entscheidungspunkte zeichnen ihre Ergebnisse in den lokalen Journalen auf. Hinweis: Dieser Build fuehrt keine Schluesseloperationen aus; die Journale sind nicht verschluesselt.\n\nBeste Gruesse\nSovereign Audit Board',
      timestamp: Date.now() - 3600000 * 2,
      folder: 'inbox',
      isUnread: true,
      isStarred: true,
      // `false`, WEIL NICHTS VERSCHLUESSELT HAT. Ein `true` hier waere eine
      // Zustandsbehauptung ohne Operation.
      isEncrypted: false,
      attachments: [{ name: 'Pruefbericht-v2.1.txt', sizeKb: 14 }],
    },
    {
      id: 'msg-2',
      sender: 'Sovereign Mesh Coordinator',
      senderEmail: 'mesh-daemon@connect.local',
      recipients: ['engineer@vgt.internal'],
      subject: 'Peer-Verbindung aufgebaut: Knoten 0x7F4A',
      snippet: 'Lokale Peer-Verbindung steht; die Uebertragung laeuft im Richtlinienrahmen...',
      body: 'Eine Peer-Verbindung zu Knoten 0x7F4A wurde im lokalen Netz aufgebaut. Die Uebertragung laeuft unter dem Zero-Trust-Richtlinienrahmen. Hinweis: Dieser Build richtet keine Sitzungsschluessel ein; die Verbindung ist nicht verschluesselt.',
      timestamp: Date.now() - 3600000 * 7,
      folder: 'inbox',
      isUnread: false,
      isStarred: false,
      isEncrypted: false,
    },
    {
      id: 'msg-3',
      sender: 'Astraea Release Manager',
      senderEmail: 'release@astraea.internal',
      recipients: ['engineer@vgt.internal'],
      subject: 'Alpha 0.1 Source Release Candidate Validated',
      snippet: 'Clean build verified with 212 files and 0 compilation errors...',
      body: 'The Alpha 0.1 Source Release Candidate build has passed all integrity gates. All 22 modules are confirmed operational.',
      timestamp: Date.now() - 86400000,
      folder: 'archive',
      isUnread: false,
      isStarred: false,
      isEncrypted: false,
    },
  ],
  selectedMessageId: 'msg-1',
  events: [
    {
      id: 'evt-1',
      title: 'Astraea Core Architecture Standup',
      startDate: '2026-09-11',
      startTime: '09:00',
      endDate: '2026-09-11',
      endTime: '09:45',
      location: 'Sovereign Room A (Encrypted)',
      category: 'engineering',
      attendees: ['lead@vgt.internal', 'sec@vgt.internal'],
      description: 'Review of Dual-Tier Umsetzungsplan and Phase 2 deep native engines.',
    },
    {
      id: 'evt-2',
      title: 'NetGate Network Policy Review',
      startDate: '2026-09-11',
      startTime: '14:00',
      endDate: '2026-09-11',
      endTime: '15:30',
      location: 'Virtual Mesh Enclave',
      category: 'security',
      attendees: ['sec@vgt.internal', 'auditor@vgt.internal'],
      description: 'Audit of outbound connector rules and zero-telemetry enforcement.',
    },
  ],
  contacts: [
    {
      id: 'cnt-1',
      fullName: 'Master Architect',
      email: 'architect@vgt.internal',
      phone: '+49 170 000000',
      organization: 'VisionGaia Technology',
      role: 'Principal Distinguished Engineer',
      gpgFingerprint: '9B2E 4D1A 88CF 0122 34EE B099 11FA 44C0 77E1 AA90',
    },
    {
      id: 'cnt-2',
      fullName: 'Sovereign Auditor',
      email: 'auditor@vgt.internal',
      organization: 'Sovereignty Compliance Group',
      role: 'Chief Security Officer',
      gpgFingerprint: '44C0 77E1 AA90 9B2E 4D1A 88CF 0122 34EE B099 11FA',
    },
  ],
  searchQuery: '',
  // No account is configured and no adapter was ever reached in this build. The defaults are the
  // honest empty state; the UI must derive every "connected"/"synced" word from these fields.
  accounts: [],
  connection: { status: 'disconnected' },
  sync: { folders: [], pending: [], inProgress: false, conflicts: [] },
  labels: [],
  rules: [],
  focus: { badgeEnabled: true, quietFrom: '22:00', quietTo: '07:00', calendarAlertsEnabled: true },
  notifications: [],
};
