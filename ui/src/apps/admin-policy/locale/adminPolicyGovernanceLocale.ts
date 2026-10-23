// STATUS: PLATIN — sieben-lokale Verwaltungs-, Katalog-, Durchsetzungs- und Austausch-Texte.
//
// Eigene Datei statt Erweiterung von `adminPolicyLocale.ts`: die bestehende Kopie ist über zehn
// Registerkarten und vier Testdateien eingefroren. Eine zweite, klar abgegrenzte Kopie hält jeden Satz
// an **einer** Stelle und lässt die vorhandenen Verträge unberührt.
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { AdminCatalogDomain } from '../governance/adminGovernanceCore';

export type AdminPolicyGovernanceTab = 'Catalog' | 'Author' | 'Enforce' | 'Interchange';
export type AdminCatalogStateKey = 'enforced' | 'configured' | 'default-only' | 'missing';
export type AdminComplianceStatusKey = 'enforced' | 'violation' | 'gap' | 'observed';
export type AdminResolutionKey = 'first-match-in-document-order' | 'longest-retention-then-document-order' | 'reported-not-resolved';

/** Grobe Klartext-Kategorien für Ablehnungsgründe. Der Feintext der Fach-Auswertung bleibt `detail`. */
export type AdminReasonGroup =
  | 'allowed' | 'policyUnavailable' | 'noAuthority' | 'encryption' | 'dlp'
  | 'retention' | 'network' | 'privacy' | 'keyProvider' | 'invalidInput' | 'authentication' | 'unknown';

/**
 * Die eine Zuordnung Fehlercode → Klartextgruppe.
 *
 * Zuerst exakte Treffer, dann eine **Suffix-Regel** für die Familie `…-invalid`, `…-limit`,
 * `…-required`, `…-denied`: jede Kernfunktion dieses Bereichs benennt ihre Ablehnungen so, und eine
 * Aufzählung aller Codes wäre eine zweite Liste, die veraltet. Unbekanntes fällt auf die allgemeine
 * Ablehnung zurück und **zeigt den Code nie** an.
 */
const REASON_SUFFIX_GROUPS: ReadonlyArray<readonly [RegExp, AdminReasonGroup]> = Object.freeze([
  [/(?:invalid|limit|unsafe|missing|boundary|size|count|nonmonotonic|regression|schema|forbidden|material|encoding)$/u, 'invalidInput'],
  [/(?:denied|required)$/u, 'noAuthority'],
  [/authentication|password/u, 'authentication'],
]);

function reasonGroupOf(code: string): AdminReasonGroup {
  const exact = REASON_GROUP_OF[code];
  if (exact) return exact;
  const normalized = String(code ?? '').toLowerCase().slice(0, 192);
  for (const [pattern, group] of REASON_SUFFIX_GROUPS) if (pattern.test(normalized)) return group;
  return 'unknown';
}

const REASON_GROUP_OF: Readonly<Record<string, AdminReasonGroup>> = Object.freeze({
  'admin-allowed': 'allowed',
  'admin-policy-unavailable': 'policyUnavailable',
  'admin-policy-schema-unsupported': 'policyUnavailable',
  'admin-request-invalid': 'policyUnavailable',
  'admin-operation-unknown': 'policyUnavailable',
  'admin-rbac-denied': 'noAuthority',
  'admin-capability-denied': 'noAuthority',
  'admin-vault-plaintext-export-forbidden': 'encryption',
  'admin-encryption-policy-unenforceable': 'encryption',
  'admin-dlp-denied': 'dlp',
  'admin-dlp-policy-invalid': 'dlp',
  'admin-retention-delete-denied': 'retention',
  'admin-retention-policy-invalid': 'retention',
  'admin-network-denied': 'network',
  'admin-network-policy-invalid': 'network',
  'admin-telemetry-hard-disabled': 'network',
  'admin-automation-remote-undeclared': 'network',
  'admin-privacy-elevated-authorization-required': 'privacy',
  'admin-privacy-policy-invalid': 'privacy',
  'admin-key-provider-denied': 'keyProvider',
  'admin-key-policy-invalid': 'keyProvider',
  'admin-probe-precondition-missing': 'unknown',
});

export interface AdminPolicyGovernanceCopy {
  readonly tabs: Readonly<Record<AdminPolicyGovernanceTab, string>>;
  readonly descriptions: Readonly<Record<AdminPolicyGovernanceTab, string>>;
  // Katalog und Inspektor
  readonly catalogSearch: string; readonly results: string; readonly catalogEmpty: string; readonly state: string; readonly inspector: string;
  readonly policyId: string; readonly hook: string; readonly source: string; readonly test: string; readonly evidence: string;
  readonly catalogStates: Readonly<Record<AdminCatalogStateKey, string>>;
  readonly domains: Readonly<Record<AdminCatalogDomain, string>>;
  // Autorenbereich
  readonly authoring: string; readonly dlpRules: string; readonly retentionRules: string; readonly legalHolds: string;
  readonly rolesAndAssignments: string; readonly localDevices: string; readonly netGate: string; readonly recoveryEscrow: string;
  readonly identifier: string; readonly subject: string; readonly role: string; readonly scope: string; readonly assign: string;
  readonly operation: string; readonly action: string; readonly destination: string; readonly label: string;
  readonly documentKind: string; readonly retentionDays: string; readonly holdName: string; readonly holdObjects: string;
  readonly deviceName: string; readonly deviceOs: string; readonly deviceVersion: string; readonly localDeviceOnly: string;
  readonly domain: string; readonly protocol: string; readonly recipient: string; readonly disclosure: string;
  readonly testContent: string; readonly preview: string; readonly previewAllowed: string; readonly previewDenied: string; readonly findings: string;
  readonly deletionProbe: string; readonly deletionDenied: string; readonly deletionAllowed: string;
  readonly add: string; readonly remove: string; readonly enabledLabel: string;
  // Durchsetzung
  readonly decisionConsole: string; readonly actor: string; readonly evaluate: string; readonly allowed: string; readonly deniedLabel: string;
  readonly justification: string; readonly elevated: string; readonly matrix: string; readonly matrixHint: string;
  readonly matrixColumns: readonly [string, string, string, string];
  readonly compliance: string; readonly blocking: string; readonly complianceStatus: Readonly<Record<AdminComplianceStatusKey, string>>;
  readonly conflicts: string; readonly conflictsNone: string; readonly resolution: Readonly<Record<AdminResolutionKey, string>>; readonly winner: string;
  // Austausch
  readonly exportDocument: string; readonly exportPortable: string; readonly exportSummary: string; readonly exported: string;
  readonly importDocument: string; readonly importPreview: string; readonly importApply: string; readonly retainedLocally: string; readonly imported: string;
  readonly store: string; readonly password: string; readonly save: string; readonly open: string; readonly storeSaved: string; readonly storeOpened: string;
  readonly versions: string; readonly snapshot: string; readonly rollback: string; readonly difference: string; readonly noVersions: string; readonly versionCreated: string;
  readonly auditExport: string; readonly auditExportRun: string;
  readonly signedManifest: string; readonly signedManifestHint: string; readonly rootPublicKey: string; readonly verify: string;
  readonly applied: string; readonly refused: string;
  readonly reason: (code: string) => string;
}

type Text = Omit<AdminPolicyGovernanceCopy, 'reason'>;

const REASONS: Readonly<Record<WorkspaceLocale, Readonly<Record<AdminReasonGroup, string>>>> = {
  'de-DE': {
    allowed: 'Erlaubt: die aktive Richtlinie deckt diese Operation ab.',
    policyUnavailable: 'Verweigert: es liegt keine lesbare Richtlinie vor (fail-closed).',
    noAuthority: 'Verweigert: für diese Operation fehlt die Berechtigung.',
    encryption: 'Verweigert: die Verschlüsselungsrichtlinie lässt diese Form des Exports nicht zu.',
    dlp: 'Verweigert: eine Regel zum Schutz sensibler Daten greift.',
    retention: 'Verweigert: eine Aufbewahrungsfrist oder ein Legal Hold schützt dieses Objekt.',
    network: 'Verweigert: die Netzwerkrichtlinie genehmigt dieses Ziel nicht.',
    privacy: 'Verweigert: für dieses Ziel ist eine erhöhte Autorisierung nötig.',
    keyProvider: 'Verweigert: der Schlüsselanbieter erfüllt die Verschlüsselungsrichtlinie nicht.',
    invalidInput: 'Abgelehnt: die Eingabe ist ungültig oder überschreitet eine dokumentierte Grenze.',
    authentication: 'Abgelehnt: das Passwort öffnet diesen Container nicht.',
    unknown: 'Verweigert: die Prüfung konnte nicht vollständig durchgeführt werden.',
  },
  'en-US': {
    allowed: 'Allowed: the active policy covers this operation.',
    policyUnavailable: 'Denied: no readable policy is available (fail-closed).',
    noAuthority: 'Denied: the actor lacks the capability this operation requires.',
    encryption: 'Denied: the encryption policy does not permit this form of export.',
    dlp: 'Denied: a sensitive-data protection rule applies.',
    retention: 'Denied: a retention period or legal hold protects this object.',
    network: 'Denied: the network policy does not approve this destination.',
    privacy: 'Denied: this destination requires elevated authorization.',
    keyProvider: 'Denied: the key provider does not satisfy the encryption policy.',
    invalidInput: 'Refused: the input is invalid or over a documented limit.',
    authentication: 'Refused: the password does not open this container.',
    unknown: 'Denied: the check could not be completed.',
  },
  'ru-RU': {
    allowed: 'Разрешено: действующая политика покрывает эту операцию.',
    policyUnavailable: 'Запрещено: читаемая политика отсутствует (fail-closed).',
    noAuthority: 'Запрещено: у субъекта нет необходимого полномочия.',
    encryption: 'Запрещено: политика шифрования не допускает такую форму экспорта.',
    dlp: 'Запрещено: срабатывает правило защиты конфиденциальных данных.',
    retention: 'Запрещено: объект защищён сроком хранения или Legal Hold.',
    network: 'Запрещено: сетевая политика не одобряет это назначение.',
    privacy: 'Запрещено: для этого назначения требуется повышенная авторизация.',
    keyProvider: 'Запрещено: поставщик ключей не соответствует политике шифрования.',
    invalidInput: 'Отклонено: ввод недопустим или превышает задокументированный предел.',
    authentication: 'Отклонено: пароль не открывает этот контейнер.',
    unknown: 'Запрещено: проверку не удалось завершить.',
  },
  'it-IT': {
    allowed: 'Consentito: la policy attiva copre questa operazione.',
    policyUnavailable: 'Negato: nessuna policy leggibile disponibile (fail-closed).',
    noAuthority: 'Negato: manca l’autorizzazione richiesta per questa operazione.',
    encryption: 'Negato: la policy di cifratura non consente questa forma di esportazione.',
    dlp: 'Negato: si applica una regola di protezione dei dati sensibili.',
    retention: 'Negato: un periodo di conservazione o un Legal Hold protegge questo oggetto.',
    network: 'Negato: la policy di rete non approva questa destinazione.',
    privacy: 'Negato: per questa destinazione serve un’autorizzazione elevata.',
    keyProvider: 'Negato: il provider di chiavi non soddisfa la policy di cifratura.',
    invalidInput: 'Rifiutato: l’input non è valido o supera un limite documentato.',
    authentication: 'Rifiutato: la password non apre questo contenitore.',
    unknown: 'Negato: la verifica non è stata completata.',
  },
  'es-ES': {
    allowed: 'Permitido: la política activa cubre esta operación.',
    policyUnavailable: 'Denegado: no hay una política legible disponible (fail-closed).',
    noAuthority: 'Denegado: falta la autorización que exige esta operación.',
    encryption: 'Denegado: la política de cifrado no permite esta forma de exportación.',
    dlp: 'Denegado: se aplica una regla de protección de datos sensibles.',
    retention: 'Denegado: un plazo de retención o un Legal Hold protege este objeto.',
    network: 'Denegado: la política de red no aprueba este destino.',
    privacy: 'Denegado: este destino requiere autorización elevada.',
    keyProvider: 'Denegado: el proveedor de claves no cumple la política de cifrado.',
    invalidInput: 'Rechazado: la entrada no es válida o supera un límite documentado.',
    authentication: 'Rechazado: la contraseña no abre este contenedor.',
    unknown: 'Denegado: no se pudo completar la comprobación.',
  },
  'ja-JP': {
    allowed: '許可: 有効なポリシーがこの操作を対象としています。',
    policyUnavailable: '拒否: 読み取り可能なポリシーがありません（fail-closed）。',
    noAuthority: '拒否: この操作に必要な権限がありません。',
    encryption: '拒否: 暗号化ポリシーはこの形式のエクスポートを許可していません。',
    dlp: '拒否: 機密データ保護ルールが適用されます。',
    retention: '拒否: 保存期間またはリーガルホールドがこのオブジェクトを保護しています。',
    network: '拒否: ネットワークポリシーがこの宛先を承認していません。',
    privacy: '拒否: この宛先には昇格された認可が必要です。',
    keyProvider: '拒否: 鍵プロバイダーが暗号化ポリシーを満たしていません。',
    invalidInput: '拒否: 入力が無効か、文書化された上限を超えています。',
    authentication: '拒否: このパスワードではコンテナを開けません。',
    unknown: '拒否: 検査を完了できませんでした。',
  },
  'zh-CN': {
    allowed: '允许：生效策略涵盖此操作。',
    policyUnavailable: '拒绝：没有可读的策略（fail-closed）。',
    noAuthority: '拒绝：缺少此操作所需的权限。',
    encryption: '拒绝：加密策略不允许这种导出形式。',
    dlp: '拒绝：敏感数据保护规则适用。',
    retention: '拒绝：保留期或法律保留保护了此对象。',
    network: '拒绝：网络策略未批准此目标。',
    privacy: '拒绝：此目标需要提升授权。',
    keyProvider: '拒绝：密钥提供程序不满足加密策略。',
    invalidInput: '拒绝：输入无效或超出已记录的限值。',
    authentication: '拒绝：此密码无法打开该容器。',
    unknown: '拒绝：无法完成检查。',
  },
};

const TEXT: Readonly<Record<WorkspaceLocale, Text>> = {
  'de-DE': {
    tabs: { Catalog: 'Katalog', Author: 'Regeln', Enforce: 'Durchsetzung', Interchange: 'Dateien' },
    descriptions: {
      Catalog: 'Regeln in Nutzersprache finden und bis zur Quelldatei verfolgen.',
      Author: 'Regeln, Rollen, Geräte und Netzwerkziele bearbeiten.',
      Enforce: 'Operationen wirklich prüfen, Konflikte auflösen und Befunde aus echten Prüfungen sehen.',
      Interchange: 'Richtliniendokument exportieren, importieren, verschlüsselt speichern und versionieren.',
    },
    catalogSearch: 'Regel suchen', results: 'Treffer', catalogEmpty: 'Keine Regel passt zu dieser Suche.', state: 'Zustand', inspector: 'Regel-Inspektor',
    policyId: 'Policy-ID', hook: 'Prüffunktion', source: 'Quelldatei', test: 'Testfall', evidence: 'Herleitung',
    catalogStates: { enforced: 'wird durchgesetzt', configured: 'konfiguriert', 'default-only': 'nur Standardwert', missing: 'fehlt' },
    domains: {
      identity: 'Identität', encryption: 'Verschlüsselung', sharing: 'Freigabe', retention: 'Aufbewahrung', export: 'Export',
      network: 'Netzwerk', devices: 'Geräte', audit: 'Audit', continuity: 'Kontinuität', privacy: 'Datenschutz',
    },
    authoring: 'Regelbearbeitung', dlpRules: 'Regeln für sensible Daten', retentionRules: 'Aufbewahrungsregeln', legalHolds: 'Legal Holds',
    rolesAndAssignments: 'Rollen und Zuordnungen', localDevices: 'Bekannte lokale Geräte', netGate: 'Netzwerkziele (NetGate)', recoveryEscrow: 'Wiederherstellungshinterlegung',
    identifier: 'Kennung', subject: 'Subjekt', role: 'Rolle', scope: 'Geltungsbereich', assign: 'Zuordnen',
    operation: 'Operation', action: 'Aktion', destination: 'Ziel', label: 'Einstufung',
    documentKind: 'Dokumentart', retentionDays: 'Tage', holdName: 'Name', holdObjects: 'Objekt-Kennungen',
    deviceName: 'Gerätename', deviceOs: 'Betriebssystem', deviceVersion: 'Workspace-Version', localDeviceOnly: 'Nur dieses lokale Gerät wird erfasst.',
    domain: 'Domain', protocol: 'Protokoll', recipient: 'Empfängerschlüssel', disclosure: 'Offenlegung',
    testContent: 'Testinhalt', preview: 'Vorschau', previewAllowed: 'Die Regel würde erlauben.', previewDenied: 'Die Regel würde blockieren.', findings: 'Funde',
    deletionProbe: 'Löschung prüfen', deletionDenied: 'Löschung verweigert', deletionAllowed: 'Löschung erlaubt',
    add: 'Hinzufügen', remove: 'Entfernen', enabledLabel: 'Aktiv',
    decisionConsole: 'Entscheidungskonsole', actor: 'Handelnde Kennung', evaluate: 'Prüfen', allowed: 'Erlaubt', deniedLabel: 'Verweigert',
    justification: 'Begründung', elevated: 'Erhöhte Autorisierung liegt vor', matrix: 'Nachweis-Matrix', matrixHint: 'Jede Zeile nennt die Policy-ID, die Prüffunktion, die Quelldatei und den Testfall, der sie rot werden lässt.',
    matrixColumns: ['Operation', 'Policy-ID', 'Prüffunktion', 'Quelle / Test'],
    compliance: 'Compliance-Bericht', blocking: 'Sperrender Befund vorhanden',
    complianceStatus: { enforced: 'durchgesetzt', violation: 'Verstoß', gap: 'Lücke', observed: 'beobachtet' },
    conflicts: 'Regelkonflikte', conflictsNone: 'Keine kollidierenden Regeln gefunden.', resolution: {
      'first-match-in-document-order': 'erste passende Regel in Dokumentreihenfolge gewinnt',
      'longest-retention-then-document-order': 'längste Frist, dann Dokumentreihenfolge',
      'reported-not-resolved': 'gemeldet, nicht aufgelöst',
    }, winner: 'Gewinner',
    exportDocument: 'Dokument exportieren', exportPortable: 'Portables Paket (.vpolicy)', exportSummary: 'Zusammenfassung (CSV)', exported: 'Exportiert',
    importDocument: 'Dokument importieren', importPreview: 'Import prüfen', importApply: 'Import anwenden', retainedLocally: 'Bleibt lokal', imported: 'Importiert',
    store: 'Verschlüsselter Speicher (.vadmin)', password: 'Passwort', save: 'Speichern', open: 'Öffnen', storeSaved: 'Container gespeichert', storeOpened: 'Container geöffnet',
    versions: 'Versionen', snapshot: 'Version anlegen', rollback: 'Zurückrollen', difference: 'Unterschied', noVersions: 'Noch keine Version angelegt.', versionCreated: 'Version angelegt',
    auditExport: 'Auditprotokoll', auditExportRun: 'Auditprotokoll exportieren',
    signedManifest: "Signiertes Organisationsmanifest", signedManifestHint: "Eine abgelehnte Signatur oder eine unbrauchbare Nutzlast setzt die strengste Richtlinie: verweigern, aber administrierbar bleiben.", rootPublicKey: "Öffentlicher Wurzelschlüssel (32 Byte, hex oder base64)", verify: "Signatur prüfen",
    applied: 'Übernommen', refused: 'Abgelehnt',
  },
  'en-US': {
    tabs: { Catalog: 'Catalog', Author: 'Rules', Enforce: 'Enforcement', Interchange: 'Files' },
    descriptions: {
      Catalog: 'Find rules in plain language and trace each one back to its source file.',
      Author: 'Edit rules, roles, known devices and approved network destinations.',
      Enforce: 'Really evaluate operations, resolve conflicts and read findings produced by real checks.',
      Interchange: 'Export, import, encrypt and version the policy document.',
    },
    catalogSearch: 'Search rules', results: 'Results', catalogEmpty: 'No rule matches this search.', state: 'State', inspector: 'Rule inspector',
    policyId: 'Policy ID', hook: 'Hook', source: 'Source file', test: 'Test case', evidence: 'Evidence',
    catalogStates: { enforced: 'enforced', configured: 'configured', 'default-only': 'default only', missing: 'missing' },
    domains: {
      identity: 'Identity', encryption: 'Encryption', sharing: 'Sharing', retention: 'Retention', export: 'Export',
      network: 'Network', devices: 'Devices', audit: 'Audit', continuity: 'Continuity', privacy: 'Privacy',
    },
    authoring: 'Rule authoring', dlpRules: 'Sensitive-data rules', retentionRules: 'Retention rules', legalHolds: 'Legal holds',
    rolesAndAssignments: 'Roles and assignments', localDevices: 'Known local devices', netGate: 'Network destinations (NetGate)', recoveryEscrow: 'Recovery escrow',
    identifier: 'Identifier', subject: 'Subject', role: 'Role', scope: 'Scope', assign: 'Assign',
    operation: 'Operation', action: 'Action', destination: 'Destination', label: 'Classification',
    documentKind: 'Document kind', retentionDays: 'Days', holdName: 'Name', holdObjects: 'Object identifiers',
    deviceName: 'Device name', deviceOs: 'Operating system', deviceVersion: 'Workspace version', localDeviceOnly: 'Only this local device is recorded.',
    domain: 'Domain', protocol: 'Protocol', recipient: 'Recipient key', disclosure: 'Disclosure',
    testContent: 'Test content', preview: 'Preview', previewAllowed: 'The rule would allow this.', previewDenied: 'The rule would block this.', findings: 'Findings',
    deletionProbe: 'Check deletion', deletionDenied: 'Deletion denied', deletionAllowed: 'Deletion allowed',
    add: 'Add', remove: 'Remove', enabledLabel: 'Enabled',
    decisionConsole: 'Decision console', actor: 'Acting identity', evaluate: 'Evaluate', allowed: 'Allowed', deniedLabel: 'Denied',
    justification: 'Justification', elevated: 'Elevated authorization is present', matrix: 'Evidence matrix', matrixHint: 'Every row names the policy ID, the hook, the source file and the test case that turns it red.',
    matrixColumns: ['Operation', 'Policy ID', 'Hook', 'Source / test'],
    compliance: 'Compliance report', blocking: 'A blocking finding is present',
    complianceStatus: { enforced: 'enforced', violation: 'violation', gap: 'gap', observed: 'observed' },
    conflicts: 'Rule conflicts', conflictsNone: 'No colliding rules were found.', resolution: {
      'first-match-in-document-order': 'first matching rule in document order wins',
      'longest-retention-then-document-order': 'longest period, then document order',
      'reported-not-resolved': 'reported, not resolved',
    }, winner: 'Winner',
    exportDocument: 'Export document', exportPortable: 'Portable package (.vpolicy)', exportSummary: 'Summary (CSV)', exported: 'Exported',
    importDocument: 'Import document', importPreview: 'Preview import', importApply: 'Apply import', retainedLocally: 'Retained locally', imported: 'Imported',
    store: 'Encrypted store (.vadmin)', password: 'Password', save: 'Save', open: 'Open', storeSaved: 'Container saved', storeOpened: 'Container opened',
    versions: 'Versions', snapshot: 'Create version', rollback: 'Roll back', difference: 'Difference', noVersions: 'No version created yet.', versionCreated: 'Version created',
    auditExport: 'Audit trail', auditExportRun: 'Export audit trail',
    signedManifest: "Signed organization manifest", signedManifestHint: "A rejected signature or an unusable payload applies the strictest policy: deny, while staying administrable.", rootPublicKey: "Root public key (32 bytes, hex or base64)", verify: "Verify signature",
    applied: 'Applied', refused: 'Refused',
  },
  'ru-RU': {
    tabs: { Catalog: 'Каталог', Author: 'Правила', Enforce: 'Применение', Interchange: 'Файлы' },
    descriptions: {
      Catalog: 'Находить правила простыми словами и прослеживать каждое до исходного файла.',
      Author: 'Изменять правила, роли, известные устройства и одобренные сетевые назначения.',
      Enforce: 'Действительно проверять операции, разрешать конфликты и видеть результаты реальных проверок.',
      Interchange: 'Экспорт, импорт, шифрованное сохранение и версии документа политики.',
    },
    catalogSearch: 'Поиск правила', results: 'Найдено', catalogEmpty: 'Ни одно правило не соответствует поиску.', state: 'Состояние', inspector: 'Инспектор правила',
    policyId: 'ID политики', hook: 'Функция проверки', source: 'Исходный файл', test: 'Тест', evidence: 'Обоснование',
    catalogStates: { enforced: 'применяется', configured: 'настроено', 'default-only': 'только значение по умолчанию', missing: 'отсутствует' },
    domains: {
      identity: 'Идентичность', encryption: 'Шифрование', sharing: 'Предоставление доступа', retention: 'Хранение', export: 'Экспорт',
      network: 'Сеть', devices: 'Устройства', audit: 'Аудит', continuity: 'Непрерывность', privacy: 'Конфиденциальность',
    },
    authoring: 'Редактирование правил', dlpRules: 'Правила для конфиденциальных данных', retentionRules: 'Правила хранения', legalHolds: 'Legal Hold',
    rolesAndAssignments: 'Роли и назначения', localDevices: 'Известные локальные устройства', netGate: 'Сетевые назначения (NetGate)', recoveryEscrow: 'Эскроу восстановления',
    identifier: 'Идентификатор', subject: 'Субъект', role: 'Роль', scope: 'Область', assign: 'Назначить',
    operation: 'Операция', action: 'Действие', destination: 'Назначение', label: 'Классификация',
    documentKind: 'Тип документа', retentionDays: 'Дней', holdName: 'Название', holdObjects: 'Идентификаторы объектов',
    deviceName: 'Имя устройства', deviceOs: 'Операционная система', deviceVersion: 'Версия Workspace', localDeviceOnly: 'Учитывается только это локальное устройство.',
    domain: 'Домен', protocol: 'Протокол', recipient: 'Ключ получателя', disclosure: 'Раскрытие',
    testContent: 'Тестовое содержимое', preview: 'Предпросмотр', previewAllowed: 'Правило разрешило бы это.', previewDenied: 'Правило заблокировало бы это.', findings: 'Находки',
    deletionProbe: 'Проверить удаление', deletionDenied: 'Удаление запрещено', deletionAllowed: 'Удаление разрешено',
    add: 'Добавить', remove: 'Удалить', enabledLabel: 'Включено',
    decisionConsole: 'Консоль решений', actor: 'Действующий субъект', evaluate: 'Проверить', allowed: 'Разрешено', deniedLabel: 'Запрещено',
    justification: 'Обоснование', elevated: 'Повышенная авторизация подтверждена', matrix: 'Матрица доказательств', matrixHint: 'Каждая строка называет ID политики, функцию проверки, исходный файл и тест, который делает её красной.',
    matrixColumns: ['Операция', 'ID политики', 'Функция', 'Источник / тест'],
    compliance: 'Отчёт о соответствии', blocking: 'Есть блокирующая находка',
    complianceStatus: { enforced: 'применяется', violation: 'нарушение', gap: 'пробел', observed: 'наблюдение' },
    conflicts: 'Конфликты правил', conflictsNone: 'Конфликтующих правил не найдено.', resolution: {
      'first-match-in-document-order': 'побеждает первое подходящее правило в порядке документа',
      'longest-retention-then-document-order': 'самый длинный срок, затем порядок документа',
      'reported-not-resolved': 'сообщено, не разрешено',
    }, winner: 'Победитель',
    exportDocument: 'Экспорт документа', exportPortable: 'Портативный пакет (.vpolicy)', exportSummary: 'Сводка (CSV)', exported: 'Экспортировано',
    importDocument: 'Импорт документа', importPreview: 'Проверить импорт', importApply: 'Применить импорт', retainedLocally: 'Остаётся локально', imported: 'Импортировано',
    store: 'Шифрованное хранилище (.vadmin)', password: 'Пароль', save: 'Сохранить', open: 'Открыть', storeSaved: 'Контейнер сохранён', storeOpened: 'Контейнер открыт',
    versions: 'Версии', snapshot: 'Создать версию', rollback: 'Откатить', difference: 'Различия', noVersions: 'Версии ещё не созданы.', versionCreated: 'Версия создана',
    auditExport: 'Журнал аудита', auditExportRun: 'Экспортировать журнал аудита',
    signedManifest: "Подписанный манифест организации", signedManifestHint: "Отклонённая подпись или непригодная полезная нагрузка применяют строжайшую политику: запрещать, но сохранять возможность администрирования.", rootPublicKey: "Открытый корневой ключ (32 байта, hex или base64)", verify: "Проверить подпись",
    applied: 'Применено', refused: 'Отклонено',
  },
  'it-IT': {
    tabs: { Catalog: 'Catalogo', Author: 'Regole', Enforce: 'Applicazione', Interchange: 'File' },
    descriptions: {
      Catalog: 'Trovare le regole in linguaggio chiaro e risalire al file di origine.',
      Author: 'Modificare regole, ruoli, dispositivi noti e destinazioni di rete approvate.',
      Enforce: 'Valutare davvero le operazioni, risolvere i conflitti e leggere esiti di verifiche reali.',
      Interchange: 'Esportare, importare, cifrare e versionare il documento di policy.',
    },
    catalogSearch: 'Cerca regola', results: 'Risultati', catalogEmpty: 'Nessuna regola corrisponde alla ricerca.', state: 'Stato', inspector: 'Ispettore regola',
    policyId: 'ID policy', hook: 'Funzione di controllo', source: 'File di origine', test: 'Caso di test', evidence: 'Evidenza',
    catalogStates: { enforced: 'applicata', configured: 'configurata', 'default-only': 'solo valore predefinito', missing: 'assente' },
    domains: {
      identity: 'Identità', encryption: 'Cifratura', sharing: 'Condivisione', retention: 'Conservazione', export: 'Esportazione',
      network: 'Rete', devices: 'Dispositivi', audit: 'Audit', continuity: 'Continuità', privacy: 'Privacy',
    },
    authoring: 'Redazione regole', dlpRules: 'Regole dati sensibili', retentionRules: 'Regole di conservazione', legalHolds: 'Legal hold',
    rolesAndAssignments: 'Ruoli e assegnazioni', localDevices: 'Dispositivi locali noti', netGate: 'Destinazioni di rete (NetGate)', recoveryEscrow: 'Escrow di ripristino',
    identifier: 'Identificatore', subject: 'Soggetto', role: 'Ruolo', scope: 'Ambito', assign: 'Assegna',
    operation: 'Operazione', action: 'Azione', destination: 'Destinazione', label: 'Classificazione',
    documentKind: 'Tipo di documento', retentionDays: 'Giorni', holdName: 'Nome', holdObjects: 'Identificatori oggetto',
    deviceName: 'Nome dispositivo', deviceOs: 'Sistema operativo', deviceVersion: 'Versione Workspace', localDeviceOnly: 'Viene registrato solo questo dispositivo locale.',
    domain: 'Dominio', protocol: 'Protocollo', recipient: 'Chiave destinatario', disclosure: 'Informativa',
    testContent: 'Contenuto di prova', preview: 'Anteprima', previewAllowed: 'La regola consentirebbe questo.', previewDenied: 'La regola bloccherebbe questo.', findings: 'Riscontri',
    deletionProbe: 'Verifica eliminazione', deletionDenied: 'Eliminazione negata', deletionAllowed: 'Eliminazione consentita',
    add: 'Aggiungi', remove: 'Rimuovi', enabledLabel: 'Attiva',
    decisionConsole: 'Console delle decisioni', actor: 'Identità agente', evaluate: 'Valuta', allowed: 'Consentito', deniedLabel: 'Negato',
    justification: 'Giustificazione', elevated: 'Autorizzazione elevata presente', matrix: 'Matrice di evidenza', matrixHint: 'Ogni riga indica ID policy, funzione di controllo, file di origine e caso di test che la rende rossa.',
    matrixColumns: ['Operazione', 'ID policy', 'Funzione', 'Origine / test'],
    compliance: 'Rapporto di conformità', blocking: 'È presente un riscontro bloccante',
    complianceStatus: { enforced: 'applicata', violation: 'violazione', gap: 'lacuna', observed: 'osservato' },
    conflicts: 'Conflitti tra regole', conflictsNone: 'Nessuna regola in conflitto trovata.', resolution: {
      'first-match-in-document-order': 'vince la prima regola corrispondente nell’ordine del documento',
      'longest-retention-then-document-order': 'periodo più lungo, poi ordine del documento',
      'reported-not-resolved': 'segnalato, non risolto',
    }, winner: 'Vincitrice',
    exportDocument: 'Esporta documento', exportPortable: 'Pacchetto portabile (.vpolicy)', exportSummary: 'Riepilogo (CSV)', exported: 'Esportato',
    importDocument: 'Importa documento', importPreview: 'Verifica importazione', importApply: 'Applica importazione', retainedLocally: 'Resta locale', imported: 'Importato',
    store: 'Archivio cifrato (.vadmin)', password: 'Password', save: 'Salva', open: 'Apri', storeSaved: 'Contenitore salvato', storeOpened: 'Contenitore aperto',
    versions: 'Versioni', snapshot: 'Crea versione', rollback: 'Ripristina', difference: 'Differenze', noVersions: 'Nessuna versione creata.', versionCreated: 'Versione creata',
    auditExport: 'Registro di audit', auditExportRun: 'Esporta registro di audit',
    signedManifest: "Manifesto firmato dell’organizzazione", signedManifestHint: "Una firma rifiutata o un payload inutilizzabile applica la policy più severa: negare, restando amministrabile.", rootPublicKey: "Chiave pubblica radice (32 byte, hex o base64)", verify: "Verifica firma",
    applied: 'Applicato', refused: 'Rifiutato',
  },
  'es-ES': {
    tabs: { Catalog: 'Catálogo', Author: 'Reglas', Enforce: 'Aplicación', Interchange: 'Archivos' },
    descriptions: {
      Catalog: 'Encontrar reglas en lenguaje claro y rastrear cada una hasta su archivo de origen.',
      Author: 'Editar reglas, roles, dispositivos conocidos y destinos de red aprobados.',
      Enforce: 'Evaluar operaciones de verdad, resolver conflictos y leer resultados de comprobaciones reales.',
      Interchange: 'Exportar, importar, cifrar y versionar el documento de política.',
    },
    catalogSearch: 'Buscar regla', results: 'Resultados', catalogEmpty: 'Ninguna regla coincide con la búsqueda.', state: 'Estado', inspector: 'Inspector de reglas',
    policyId: 'ID de política', hook: 'Función de control', source: 'Archivo de origen', test: 'Caso de prueba', evidence: 'Evidencia',
    catalogStates: { enforced: 'aplicada', configured: 'configurada', 'default-only': 'solo valor por defecto', missing: 'ausente' },
    domains: {
      identity: 'Identidad', encryption: 'Cifrado', sharing: 'Compartir', retention: 'Retención', export: 'Exportación',
      network: 'Red', devices: 'Dispositivos', audit: 'Auditoría', continuity: 'Continuidad', privacy: 'Privacidad',
    },
    authoring: 'Edición de reglas', dlpRules: 'Reglas de datos sensibles', retentionRules: 'Reglas de retención', legalHolds: 'Legal holds',
    rolesAndAssignments: 'Roles y asignaciones', localDevices: 'Dispositivos locales conocidos', netGate: 'Destinos de red (NetGate)', recoveryEscrow: 'Depósito de recuperación',
    identifier: 'Identificador', subject: 'Sujeto', role: 'Rol', scope: 'Ámbito', assign: 'Asignar',
    operation: 'Operación', action: 'Acción', destination: 'Destino', label: 'Clasificación',
    documentKind: 'Tipo de documento', retentionDays: 'Días', holdName: 'Nombre', holdObjects: 'Identificadores de objeto',
    deviceName: 'Nombre del dispositivo', deviceOs: 'Sistema operativo', deviceVersion: 'Versión de Workspace', localDeviceOnly: 'Solo se registra este dispositivo local.',
    domain: 'Dominio', protocol: 'Protocolo', recipient: 'Clave del destinatario', disclosure: 'Divulgación',
    testContent: 'Contenido de prueba', preview: 'Vista previa', previewAllowed: 'La regla permitiría esto.', previewDenied: 'La regla bloquearía esto.', findings: 'Hallazgos',
    deletionProbe: 'Comprobar borrado', deletionDenied: 'Borrado denegado', deletionAllowed: 'Borrado permitido',
    add: 'Añadir', remove: 'Quitar', enabledLabel: 'Activa',
    decisionConsole: 'Consola de decisiones', actor: 'Identidad actuante', evaluate: 'Evaluar', allowed: 'Permitido', deniedLabel: 'Denegado',
    justification: 'Justificación', elevated: 'Hay autorización elevada', matrix: 'Matriz de evidencia', matrixHint: 'Cada fila indica el ID de política, la función de control, el archivo de origen y el caso de prueba que la pone en rojo.',
    matrixColumns: ['Operación', 'ID de política', 'Función', 'Origen / prueba'],
    compliance: 'Informe de cumplimiento', blocking: 'Hay un hallazgo bloqueante',
    complianceStatus: { enforced: 'aplicada', violation: 'infracción', gap: 'carencia', observed: 'observado' },
    conflicts: 'Conflictos entre reglas', conflictsNone: 'No se encontraron reglas en conflicto.', resolution: {
      'first-match-in-document-order': 'gana la primera regla coincidente en el orden del documento',
      'longest-retention-then-document-order': 'plazo más largo, luego orden del documento',
      'reported-not-resolved': 'informado, no resuelto',
    }, winner: 'Ganadora',
    exportDocument: 'Exportar documento', exportPortable: 'Paquete portátil (.vpolicy)', exportSummary: 'Resumen (CSV)', exported: 'Exportado',
    importDocument: 'Importar documento', importPreview: 'Revisar importación', importApply: 'Aplicar importación', retainedLocally: 'Permanece local', imported: 'Importado',
    store: 'Almacén cifrado (.vadmin)', password: 'Contraseña', save: 'Guardar', open: 'Abrir', storeSaved: 'Contenedor guardado', storeOpened: 'Contenedor abierto',
    versions: 'Versiones', snapshot: 'Crear versión', rollback: 'Revertir', difference: 'Diferencias', noVersions: 'Aún no hay versiones.', versionCreated: 'Versión creada',
    auditExport: 'Registro de auditoría', auditExportRun: 'Exportar registro de auditoría',
    signedManifest: "Manifiesto firmado de la organización", signedManifestHint: "Una firma rechazada o una carga inutilizable aplica la política más estricta: denegar, pero seguir siendo administrable.", rootPublicKey: "Clave pública raíz (32 bytes, hex o base64)", verify: "Verificar firma",
    applied: 'Aplicado', refused: 'Rechazado',
  },
  'ja-JP': {
    tabs: { Catalog: 'カタログ', Author: 'ルール', Enforce: '適用', Interchange: 'ファイル' },
    descriptions: {
      Catalog: 'ルールを平易な言葉で検索し、元のファイルまで追跡します。',
      Author: 'ルール、ロール、既知のデバイス、承認済みネットワーク宛先を編集します。',
      Enforce: '操作を実際に評価し、競合を解決し、実際の検査結果を確認します。',
      Interchange: 'ポリシー文書のエクスポート、インポート、暗号化保存、版管理。',
    },
    catalogSearch: 'ルールを検索', results: '結果', catalogEmpty: '検索に一致するルールはありません。', state: '状態', inspector: 'ルールインスペクター',
    policyId: 'ポリシーID', hook: '検査関数', source: 'ソースファイル', test: 'テストケース', evidence: '根拠',
    catalogStates: { enforced: '適用中', configured: '設定済み', 'default-only': '既定値のみ', missing: '未設定' },
    domains: {
      identity: 'ID', encryption: '暗号化', sharing: '共有', retention: '保持', export: 'エクスポート',
      network: 'ネットワーク', devices: 'デバイス', audit: '監査', continuity: '継続性', privacy: 'プライバシー',
    },
    authoring: 'ルール編集', dlpRules: '機密データルール', retentionRules: '保持ルール', legalHolds: 'リーガルホールド',
    rolesAndAssignments: 'ロールと割り当て', localDevices: '既知のローカルデバイス', netGate: 'ネットワーク宛先（NetGate）', recoveryEscrow: '復旧エスクロー',
    identifier: '識別子', subject: '主体', role: 'ロール', scope: '範囲', assign: '割り当て',
    operation: '操作', action: '動作', destination: '宛先', label: '分類',
    documentKind: '文書種別', retentionDays: '日数', holdName: '名前', holdObjects: 'オブジェクト識別子',
    deviceName: 'デバイス名', deviceOs: 'オペレーティングシステム', deviceVersion: 'Workspace バージョン', localDeviceOnly: 'このローカルデバイスのみを記録します。',
    domain: 'ドメイン', protocol: 'プロトコル', recipient: '受信者鍵', disclosure: '開示',
    testContent: 'テスト内容', preview: 'プレビュー', previewAllowed: 'このルールは許可します。', previewDenied: 'このルールはブロックします。', findings: '検出',
    deletionProbe: '削除を検査', deletionDenied: '削除は拒否されました', deletionAllowed: '削除は許可されました',
    add: '追加', remove: '削除', enabledLabel: '有効',
    decisionConsole: '意思決定コンソール', actor: '実行者', evaluate: '評価', allowed: '許可', deniedLabel: '拒否',
    justification: '正当化理由', elevated: '昇格認可あり', matrix: '証跡マトリクス', matrixHint: '各行はポリシーID、検査関数、ソースファイル、赤くなるテストケースを示します。',
    matrixColumns: ['操作', 'ポリシーID', '検査関数', 'ソース / テスト'],
    compliance: 'コンプライアンス報告', blocking: 'ブロックする検出があります',
    complianceStatus: { enforced: '適用中', violation: '違反', gap: '欠落', observed: '観察' },
    conflicts: 'ルール競合', conflictsNone: '競合するルールは見つかりません。', resolution: {
      'first-match-in-document-order': '文書順で最初に一致したルールが優先',
      'longest-retention-then-document-order': '最長期間、次に文書順',
      'reported-not-resolved': '報告のみ、未解決',
    }, winner: '優先',
    exportDocument: '文書をエクスポート', exportPortable: 'ポータブルパッケージ（.vpolicy）', exportSummary: '概要（CSV）', exported: 'エクスポート済み',
    importDocument: '文書をインポート', importPreview: 'インポートを確認', importApply: 'インポートを適用', retainedLocally: 'ローカルに保持', imported: 'インポート済み',
    store: '暗号化ストア（.vadmin）', password: 'パスワード', save: '保存', open: '開く', storeSaved: 'コンテナを保存しました', storeOpened: 'コンテナを開きました',
    versions: 'バージョン', snapshot: '版を作成', rollback: 'ロールバック', difference: '差分', noVersions: 'まだ版がありません。', versionCreated: '版を作成しました',
    auditExport: '監査ログ', auditExportRun: '監査ログをエクスポート',
    signedManifest: "署名済み組織マニフェスト", signedManifestHint: "署名が拒否された場合や内容が使用できない場合は、最も厳格なポリシーを適用します。拒否しつつ、管理は可能なままにします。", rootPublicKey: "ルート公開鍵（32 バイト、hex または base64）", verify: "署名を検証",
    applied: '適用済み', refused: '拒否',
  },
  'zh-CN': {
    tabs: { Catalog: '目录', Author: '规则', Enforce: '执行', Interchange: '文件' },
    descriptions: {
      Catalog: '用通俗语言查找规则，并追溯到源文件。',
      Author: '编辑规则、角色、已知设备与已批准的网路目标。',
      Enforce: '真正评估操作、解决冲突，并查看真实检查产生的结果。',
      Interchange: '导出、导入、加密保存并对策略文档进行版本管理。',
    },
    catalogSearch: '搜索规则', results: '结果', catalogEmpty: '没有规则匹配此搜索。', state: '状态', inspector: '规则检查器',
    policyId: '策略 ID', hook: '检查函数', source: '源文件', test: '测试用例', evidence: '依据',
    catalogStates: { enforced: '已执行', configured: '已配置', 'default-only': '仅默认值', missing: '缺失' },
    domains: {
      identity: '身份', encryption: '加密', sharing: '共享', retention: '保留', export: '导出',
      network: '网络', devices: '设备', audit: '审计', continuity: '连续性', privacy: '隐私',
    },
    authoring: '规则编辑', dlpRules: '敏感数据规则', retentionRules: '保留规则', legalHolds: '法律保留',
    rolesAndAssignments: '角色与分配', localDevices: '已知本地设备', netGate: '网络目标（NetGate）', recoveryEscrow: '恢复托管',
    identifier: '标识符', subject: '主体', role: '角色', scope: '范围', assign: '分配',
    operation: '操作', action: '动作', destination: '目标', label: '分级',
    documentKind: '文档类型', retentionDays: '天数', holdName: '名称', holdObjects: '对象标识符',
    deviceName: '设备名称', deviceOs: '操作系统', deviceVersion: 'Workspace 版本', localDeviceOnly: '仅记录此本地设备。',
    domain: '域', protocol: '协议', recipient: '接收方密钥', disclosure: '披露',
    testContent: '测试内容', preview: '预览', previewAllowed: '该规则将允许此操作。', previewDenied: '该规则将阻止此操作。', findings: '检出',
    deletionProbe: '检查删除', deletionDenied: '删除被拒绝', deletionAllowed: '删除被允许',
    add: '添加', remove: '移除', enabledLabel: '启用',
    decisionConsole: '决策控制台', actor: '执行主体', evaluate: '评估', allowed: '允许', deniedLabel: '拒绝',
    justification: '理由', elevated: '已具备提升授权', matrix: '证据矩阵', matrixHint: '每一行都列出策略 ID、检查函数、源文件以及使其变红的测试用例。',
    matrixColumns: ['操作', '策略 ID', '检查函数', '源 / 测试'],
    compliance: '合规报告', blocking: '存在阻断性检出',
    complianceStatus: { enforced: '已执行', violation: '违规', gap: '缺口', observed: '已观察' },
    conflicts: '规则冲突', conflictsNone: '未发现冲突规则。', resolution: {
      'first-match-in-document-order': '按文档顺序，首个匹配规则生效',
      'longest-retention-then-document-order': '最长期限，其次按文档顺序',
      'reported-not-resolved': '仅报告，未解决',
    }, winner: '生效者',
    exportDocument: '导出文档', exportPortable: '可移植包（.vpolicy）', exportSummary: '摘要（CSV）', exported: '已导出',
    importDocument: '导入文档', importPreview: '检查导入', importApply: '应用导入', retainedLocally: '保留在本地', imported: '已导入',
    store: '加密存储（.vadmin）', password: '密码', save: '保存', open: '打开', storeSaved: '容器已保存', storeOpened: '容器已打开',
    versions: '版本', snapshot: '创建版本', rollback: '回滚', difference: '差异', noVersions: '尚未创建版本。', versionCreated: '已创建版本',
    auditExport: '审计日志', auditExportRun: '导出审计日志',
    signedManifest: "已签名的组织清单", signedManifestHint: "签名被拒或内容不可用时应用最严格策略：拒绝，但仍可管理。", rootPublicKey: "根公钥（32 字节，hex 或 base64）", verify: "验证签名",
    applied: '已应用', refused: '已拒绝',
  },
};

export function adminPolicyGovernanceCopy(locale: WorkspaceLocale): AdminPolicyGovernanceCopy {
  const text = TEXT[locale] ?? TEXT['en-US'];
  const reasons = REASONS[locale] ?? REASONS['en-US'];
  return {
    ...text,
    // Eine Definition der Zuordnung Fehlercode → Klartextgruppe; ein unbekannter Code fällt auf die
    // allgemeine Ablehnung zurück und **zeigt den Code nicht** an.
    reason: (code: string) => reasons[reasonGroupOf(code)],
  };
}

export function useAdminPolicyGovernanceCopy(): AdminPolicyGovernanceCopy {
  const { locale } = useWorkspaceLocale();
  return adminPolicyGovernanceCopy(locale);
}

export const ADMIN_POLICY_GOVERNANCE_TABS: readonly AdminPolicyGovernanceTab[] = Object.freeze(['Catalog', 'Author', 'Enforce', 'Interchange']);
