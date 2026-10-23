// STATUS: PLATIN — typed diagnostics copy and engine-state labels for all supported locales.
import type { AttestationVerdict, HardwareAttestationTier } from '../../platform/keyvault/keyVaultHardwareAttestation';
import type { SandboxExecutionStatus } from '../../platform/plugin-runtime/sandbox/workspaceWasmSandbox';
import type { PluginCapabilityManifest } from '../../platform/plugin-runtime/pluginRuntimePolicy';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export type PlatformTestId =
  | 'VWC_STORAGE_CONTAINER_ROUNDTRIP'
  | 'KEYVAULT_HARDWARE_ATTESTATION'
  | 'WASM_SANDBOX_ISOLATION'
  | 'WORKSPACE_FABRIC_LIVE_OBJECTS'
  | 'CANONICAL_WORK_ITEM_SYNC'
  | 'OFFICE_ODF_INTEROP_SANDBOX';

export interface PlatformAdvancedCopy {
  readonly header: { readonly description: string; readonly close: string };
  readonly tabs: { readonly keyvault: string; readonly wasm: string; readonly fabric: string; readonly suite: string };
  readonly attestation: {
    readonly heading: string; readonly description: string; readonly attest: string; readonly testClaim: string; readonly testClaimTitle: string;
    readonly tier: string; readonly verdict: string; readonly hardwareBacked: string; readonly nonExtractable: string;
    readonly yesVerified: string; readonly noFallback: string; readonly confirmed: string; readonly failed: string;
    readonly tierName: Readonly<Record<HardwareAttestationTier, string>>; readonly verdictName: Readonly<Record<AttestationVerdict, string>>;
    readonly reportDetails: string; readonly challenge: string; readonly signature: string;
    readonly completed: (adversarial: boolean) => string; readonly error: string;
  };
  readonly wasm: {
    readonly heading: string; readonly description: string; readonly pluginName: Readonly<Record<'math' | 'summary', string>>; readonly selectPlugin: string; readonly execute: string;
    readonly runtimePolicy: string; readonly runtimePolicyDetail: string; readonly apiPackage: string; readonly packageVerification: string;
    readonly installReview: string; readonly noCapabilities: string; readonly publisher: string; readonly signature: string; readonly signaturePresent: string; readonly unsignedReview: string;
    readonly updateSource: string; readonly updateSourceKind: Readonly<Record<PluginCapabilityManifest['updateSource']['kind'], string>>; readonly capabilityReconsent: string;
    readonly result: string; readonly time: string; readonly memoryBound: string; readonly auditTrail: string;
    readonly status: Readonly<Record<SandboxExecutionStatus, string>>; readonly executionToast: (status: string) => string; readonly error: string;
  };
  readonly fabric: {
    readonly heading: string; readonly description: string; readonly officeHeading: string; readonly officeProtection: readonly [string, string, string, string];
    readonly workItemHeading: string; readonly workItemProtection: readonly [string, string, string, string];
  };
  readonly suite: {
    readonly heading: string; readonly description: string; readonly run: string; readonly allPassed: string; readonly failed: string;
    readonly passed: string; readonly errorDetail: string; readonly unknownTest: string; readonly test: Readonly<Record<PlatformTestId, { readonly name: string; readonly passed: string; readonly failed: string }>>;
    readonly completedToast: string; readonly issuesToast: string; readonly error: string;
  };
  readonly footerClose: string;
}

export const PLATFORM_ADVANCED_COPY: Readonly<Record<WorkspaceLocale, PlatformAdvancedCopy>> = {
  'de-DE': {
    header: { description: 'Souveräne Plattform: Hardware-Nachweis, WASM-Sandbox, Live-Fabric und Verifikation.', close: 'Dialog „Astraea Workspace Platform Core“ schließen' },
    tabs: { keyvault: 'KeyVault-Hardware-Nachweis', wasm: 'WASM- und Plugin-Isolation', fabric: 'Fabric- und Interop-Schutz', suite: 'Sicherheits- und Roundtrip-Suite' },
    attestation: {
      heading: 'NIST FIPS 140-3-Hardware-Schlüsselprüfung', description: 'Prüft physisches TPM 2.0, WebAuthn-Plattformauthentifizierung und nicht extrahierbare WebCrypto-Schlüssel. Unbelegte Hardware-Aussagen werden zurückgewiesen.',
      attest: 'Anbieter prüfen', testClaim: 'Behauptung prüfen', testClaimTitle: 'Simuliert eine ungeprüfte Upstream-Behauptung, um ihre Zurückweisung zu testen',
      tier: 'Keystore-Stufe', verdict: 'Ergebnis', hardwareBacked: 'Hardwaregestützt', nonExtractable: 'Nicht extrahierbar', yesVerified: 'JA (verifiziert)', noFallback: 'NEIN (ehrlicher Fallback)', confirmed: 'BESTÄTIGT', failed: 'FEHLGESCHLAGEN',
      tierName: { HARDWARE_ATTESTED_TPM: 'Hardwaregeprüftes TPM', PLATFORM_AUTHENTICATOR_ENCLAVE: 'Plattformauthentifizierungs-Enklave', NON_EXTRACTABLE_SECURE_ELEMENT: 'Nicht extrahierbares Sicherheitselement', SOFTWARE_KEYSTORE_FALLBACK: 'Software-Keystore-Fallback' },
      verdictName: { VERIFIED_HARDWARE: 'Hardware verifiziert', VERIFIED_ENCLAVE: 'Enklave verifiziert', VERIFIED_NON_EXTRACTABLE: 'Nicht extrahierbarer Schlüssel verifiziert', UNVERIFIED_CLAIM_DEGRADED: 'Ungeprüfte Behauptung zurückgewiesen', SOFTWARE_ONLY: 'Nur Software' },
      reportDetails: 'Details zum Prüfbericht', challenge: 'Prüfwert', signature: 'Signatur-SHA-256', completed: (adversarial) => adversarial ? 'Prüfung der adversarialen Hardwarebehauptung abgeschlossen' : 'Standardprüfung der KeyVault-Hardware abgeschlossen', error: 'Fehler bei der Prüfung',
    },
    wasm: {
      heading: 'WASM- und Prozess-Isolationsengine', description: 'Isolierung in einem separaten Worker, begrenzter WASM-Arbeitsspeicher, feste Ausführungsfrist und versionierte Capability-Manifeste.', pluginName: { math: 'Mathematik- und Formel-Plugin', summary: 'WOM-Zusammenfassungs-Plugin' }, selectPlugin: 'Plugin auswählen', execute: 'In Sandbox ausführen',
      runtimePolicy: 'Laufzeitrichtlinie', runtimePolicyDetail: 'Plugins sind standardmäßig AUS · Sicherheitsmodus blockiert Drittanbieter-Code', apiPackage: 'API / Paket', packageVerification: 'Native Core prüft SHA-256 und Ed25519. Signierte Updates sind an den Signierer gebunden und werden bei Fehlern abgewiesen.', installReview: 'Installation / Berechtigungsprüfung', noCapabilities: 'Keine Host-Capabilities angefordert', publisher: 'Herausgeber', signature: 'Signatur', signaturePresent: 'Ed25519 vorhanden', unsignedReview: 'Nicht signiert; ausdrückliche Prüfung erforderlich', updateSource: 'Updatequelle', updateSourceKind: { 'offline-file': 'Offline-Datei', 'managed-channel': 'Verwalteter Kanal', disabled: 'Deaktiviert' }, capabilityReconsent: 'Neue Capabilities erfordern nach einem Update eine erneute Zustimmung.',
      result: 'Ausführungsergebnis', time: 'Dauer', memoryBound: 'Speichergrenze', auditTrail: 'Sandbox-Prüfprotokoll', status: { READY: 'Bereit', EXECUTING: 'Wird ausgeführt', COMPLETED: 'Abgeschlossen', TERMINATED_TIMEOUT: 'Zeitüberschreitung', TERMINATED_OOM: 'Speichergrenze erreicht', POLICY_VIOLATION: 'Richtlinienverstoß', FAULT: 'Fehler' }, executionToast: (status) => `Sandbox-Ausführung: ${status}`, error: 'Sandbox-Fehler',
    },
    fabric: {
      heading: 'Live-Verknüpfung von Workspace-Fabric-Objekten', description: 'Das kanonische vgt://[Dokument-ID]/[Objekt-ID]-Protokoll ermöglicht Live-Einbettungen über Anwendungen hinweg, mit Zykluserkennung und Einfrieren von Verknüpfungen.',
      officeHeading: 'Office-/ODF-Sandbox-Schutz', officeProtection: ['Schutz vor Zip-Bomben: Dekompressionsverhältnis höchstens 100:1', 'Pfad-Traversal-Schutz: ../ und absolute Archivpfade werden entfernt', 'XML-Sicherheit: DOCTYPE- und externe ENTITY-Deklarationen (XXE) sind gesperrt', 'Keine Makros: Eingebettetes VBA/ActiveX bleibt deaktiviert'],
      workItemHeading: 'Kanonisches Arbeitsmodell', workItemProtection: ['Gemeinsame maßgebliche Quelle für Tasks, Planner und Projects', 'Universelle Arbeitsobjekt-UUIDs mit stabilen Versionsvektoren', 'Atomare Updates ohne Schattenkopien oder Zustandsabweichungen', 'Offline-Warteschlange mit deterministischer Konfliktauflösung'],
    },
    suite: {
      heading: 'Maßgebliche 6-Punkt-Plattformprüfung', description: 'End-to-End-Prüfung von VWC-Containern, KeyVault-Nachweis, WASM-Isolation, Fabric-Live-Links, Arbeitselementen und Interop-Sandbox.', run: 'Plattformprüfung starten', allPassed: 'Alle Prüfpunkte bestanden', failed: 'Plattformprüfungen fehlgeschlagen', passed: 'Bestanden', errorDetail: 'Technisches Fehlerdetail', unknownTest: 'Unbekannte Plattformprüfung',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. VWC-Container-Roundtrip und Zukunftskompatibilität', passed: 'VWC-Container verschlüsselt und mit SHA-256 geprüft; unbekannte Erweiterung erhalten', failed: 'VWC-Container-Roundtrip fehlgeschlagen' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. KeyVault-Hardwareprüfung und Integrität der Behauptungen', passed: 'Hardwareprüfung aktiv; falsche Behauptungen werden zurückgewiesen', failed: 'Validierung der KeyVault-Hardwareprüfung fehlgeschlagen' },
        WASM_SANDBOX_ISOLATION: { name: '3. WASM- und Prozess-Sandbox-Isolation', passed: 'Worker-WASM ausgeführt; beliebiges JavaScript blockiert; falscher Einstiegspunkt abgewiesen', failed: 'Validierung der Sandbox-Isolation fehlgeschlagen' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Workspace-Fabric-Objektgraph und Zykluserkennung', passed: 'Fabric-URI bestätigt und zyklische Objektverweise sicher abgefangen', failed: 'Auflösung von Workspace Fabric fehlgeschlagen' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. Einheitliches kanonisches Arbeitsmodell', passed: 'Ein maßgebliches Arbeitselement wird ohne abweichende Kopien geteilt', failed: 'Zusammenführung des Arbeitsmodells fehlgeschlagen' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Office-/ODF-Interop-Sandbox-Sicherheit', passed: 'Archiv-Pfad-Traversal blockiert und externe XML-Entität abgewiesen', failed: 'Interop-Sandbox-Sicherheitsprüfung fehlgeschlagen' },
      },
      completedToast: 'Alle 6 Plattform-Roundtrip-Tests bestanden.', issuesToast: 'Plattformprüfung mit Problemen abgeschlossen.', error: 'Fehler in der Plattformprüfung',
    },
    footerClose: 'Schließen',
  },
  'en-US': {
    header: { description: 'Unified sovereign platform: hardware attestation, WASM sandbox, live Fabric, and verification.', close: 'Close Astraea Workspace Platform Core dialog' },
    tabs: { keyvault: 'KeyVault hardware attestation', wasm: 'WASM and plugin isolation', fabric: 'Fabric and interop guards', suite: 'Security and roundtrip suite' },
    attestation: {
      heading: 'NIST FIPS 140-3 hardware key attestation', description: 'Audits physical TPM 2.0, WebAuthn platform authentication, and non-extractable WebCrypto keys. Rejects unsupported hardware claims.',
      attest: 'Attest provider', testClaim: 'Test claim audit', testClaimTitle: 'Simulates an unverified upstream claim to test rejection',
      tier: 'Keystore tier', verdict: 'Verdict', hardwareBacked: 'Hardware backed', nonExtractable: 'Non-extractable', yesVerified: 'YES (verified)', noFallback: 'NO (honest fallback)', confirmed: 'CONFIRMED', failed: 'FAILED',
      tierName: { HARDWARE_ATTESTED_TPM: 'Hardware-attested TPM', PLATFORM_AUTHENTICATOR_ENCLAVE: 'Platform authenticator enclave', NON_EXTRACTABLE_SECURE_ELEMENT: 'Non-extractable secure element', SOFTWARE_KEYSTORE_FALLBACK: 'Software keystore fallback' },
      verdictName: { VERIFIED_HARDWARE: 'Hardware verified', VERIFIED_ENCLAVE: 'Enclave verified', VERIFIED_NON_EXTRACTABLE: 'Non-extractable key verified', UNVERIFIED_CLAIM_DEGRADED: 'Unverified claim rejected', SOFTWARE_ONLY: 'Software only' },
      reportDetails: 'Attestation report details', challenge: 'Challenge', signature: 'Signature SHA-256', completed: (adversarial) => adversarial ? 'Adversarial hardware claim attestation complete' : 'Standard KeyVault hardware attestation complete', error: 'Attestation error',
    },
    wasm: {
      heading: 'WASM and process isolation engine', description: 'Dedicated Worker isolation, bounded WASM linear memory, a hard execution deadline, and versioned capability manifests.', pluginName: { math: 'Math and formula plugin', summary: 'WOM summarizer plugin' }, selectPlugin: 'Select plugin', execute: 'Execute in sandbox',
      runtimePolicy: 'Runtime policy', runtimePolicyDetail: 'Plugins default OFF · Safe Mode blocks third-party code', apiPackage: 'API / package', packageVerification: 'Native Core verifies SHA-256 and Ed25519. Signed updates are signer-pinned and fail closed.', installReview: 'Install / permission review', noCapabilities: 'No host capabilities requested', publisher: 'Publisher', signature: 'Signature', signaturePresent: 'Ed25519 present', unsignedReview: 'Unsigned; explicit review required', updateSource: 'Update source', updateSourceKind: { 'offline-file': 'Offline file', 'managed-channel': 'Managed channel', disabled: 'Disabled' }, capabilityReconsent: 'Capability additions on update require re-consent.',
      result: 'Execution result', time: 'Time', memoryBound: 'Memory bound', auditTrail: 'Sandbox audit trail', status: { READY: 'Ready', EXECUTING: 'Executing', COMPLETED: 'Completed', TERMINATED_TIMEOUT: 'Timed out', TERMINATED_OOM: 'Memory limit reached', POLICY_VIOLATION: 'Policy violation', FAULT: 'Fault' }, executionToast: (status) => `Sandbox execution: ${status}`, error: 'Sandbox error',
    },
    fabric: {
      heading: 'Workspace Fabric live object linking', description: 'The canonical vgt://[document-id]/[object-id] protocol enables live cross-app embeds with cycle detection and link freezing.',
      officeHeading: 'Office / ODF sandbox protections', officeProtection: ['Zip bomb defenses: decompression ratio limited to 100:1', 'Path traversal blocker: removes ../ and absolute archive paths', 'XML security: blocks DOCTYPE and external ENTITY declarations (XXE)', 'No macro execution: embedded VBA/ActiveX remain disabled'],
      workItemHeading: 'Canonical work item model', workItemProtection: ['Shared source of truth for Tasks, Planner, and Projects', 'Universal work item UUIDs with stable version vectors', 'Atomic updates without shadow copies or state drift', 'Offline queue with deterministic conflict merge'],
    },
    suite: {
      heading: 'Authoritative 6-point platform verification suite', description: 'End-to-end checks for VWC containers, KeyVault attestation, WASM isolation, Fabric live links, work items, and interop sandboxing.', run: 'Run platform suite', allPassed: 'All verification points passed', failed: 'Platform checks failed', passed: 'Passed', errorDetail: 'Technical error detail', unknownTest: 'Unknown platform check',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. VWC storage roundtrip and forward compatibility', passed: 'VWC container encrypted and SHA-256 verified; unknown extension preserved', failed: 'VWC container roundtrip failed' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. KeyVault hardware attestation and claim integrity', passed: 'Hardware attestation active; false claims rejected', failed: 'KeyVault hardware attestation validation failed' },
        WASM_SANDBOX_ISOLATION: { name: '3. WASM and process sandbox isolation', passed: 'Worker WASM executed; arbitrary JavaScript blocked; wrong entrypoint rejected', failed: 'Sandbox isolation validation failed' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Workspace Fabric live object graph and cycle detection', passed: 'Fabric URI verified and circular object references safely trapped', failed: 'Workspace Fabric resolution failed' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. Canonical work item model unification', passed: 'One authoritative work item shared without divergent copies', failed: 'Work item model unification failed' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Office / ODF interop sandbox security', passed: 'Archive path traversal blocked and external XML entity rejected', failed: 'Interop sandbox security check failed' },
      },
      completedToast: 'All 6 platform roundtrip tests passed.', issuesToast: 'Platform verification completed with issues.', error: 'Platform suite error',
    },
    footerClose: 'Close',
  },
  'ru-RU': {
    header: { description: 'Единая суверенная платформа: аппаратная аттестация, песочница WASM, Fabric и проверка.', close: 'Закрыть диалог Astraea Workspace Platform Core' },
    tabs: { keyvault: 'Аппаратная аттестация KeyVault', wasm: 'Изоляция WASM и плагинов', fabric: 'Защита Fabric и обмена', suite: 'Проверка безопасности и целостности' },
    attestation: {
      heading: 'Аппаратная аттестация ключей NIST FIPS 140-3', description: 'Проверяет TPM 2.0, платформенную аутентификацию WebAuthn и неизвлекаемые ключи WebCrypto. Неподтверждённые заявления об аппаратной защите отклоняются.',
      attest: 'Проверить поставщика', testClaim: 'Проверить заявление', testClaimTitle: 'Имитирует непроверенное заявление источника и проверяет его отклонение',
      tier: 'Уровень хранилища', verdict: 'Вердикт', hardwareBacked: 'Аппаратная защита', nonExtractable: 'Неизвлекаемый', yesVerified: 'ДА (проверено)', noFallback: 'НЕТ (честный резервный режим)', confirmed: 'ПОДТВЕРЖДЕНО', failed: 'ОШИБКА',
      tierName: { HARDWARE_ATTESTED_TPM: 'Аттестованный TPM', PLATFORM_AUTHENTICATOR_ENCLAVE: 'Изолированная среда платформенного аутентификатора', NON_EXTRACTABLE_SECURE_ELEMENT: 'Неизвлекаемый защищённый элемент', SOFTWARE_KEYSTORE_FALLBACK: 'Резервное программное хранилище' },
      verdictName: { VERIFIED_HARDWARE: 'Аппаратная защита проверена', VERIFIED_ENCLAVE: 'Изолированная среда проверена', VERIFIED_NON_EXTRACTABLE: 'Неизвлекаемый ключ проверен', UNVERIFIED_CLAIM_DEGRADED: 'Непроверенное заявление отклонено', SOFTWARE_ONLY: 'Только программная защита' },
      reportDetails: 'Подробности отчёта аттестации', challenge: 'Проверочный вызов', signature: 'SHA-256 подписи', completed: (adversarial) => adversarial ? 'Проверка недостоверного аппаратного заявления завершена' : 'Стандартная аппаратная проверка KeyVault завершена', error: 'Ошибка аттестации',
    },
    wasm: {
      heading: 'Модуль изоляции WASM и процессов', description: 'Изоляция в отдельном Worker, ограниченная линейная память WASM, жёсткий срок выполнения и версионированные манифесты возможностей.', pluginName: { math: 'Плагин математики и формул', summary: 'Плагин сводки WOM' }, selectPlugin: 'Выберите плагин', execute: 'Выполнить в песочнице',
      runtimePolicy: 'Политика выполнения', runtimePolicyDetail: 'Плагины по умолчанию выключены · безопасный режим блокирует сторонний код', apiPackage: 'API / пакет', packageVerification: 'Native Core проверяет SHA-256 и Ed25519. Подписанные обновления привязаны к подписанту и отклоняются при ошибке.', installReview: 'Установка / проверка прав', noCapabilities: 'Запросов возможностей узла нет', publisher: 'Издатель', signature: 'Подпись', signaturePresent: 'Ed25519 присутствует', unsignedReview: 'Без подписи; требуется явная проверка', updateSource: 'Источник обновлений', updateSourceKind: { 'offline-file': 'Офлайн-файл', 'managed-channel': 'Управляемый канал', disabled: 'Отключён' }, capabilityReconsent: 'Добавление возможностей при обновлении требует повторного согласия.',
      result: 'Результат выполнения', time: 'Время', memoryBound: 'Лимит памяти', auditTrail: 'Журнал проверки песочницы', status: { READY: 'Готов', EXECUTING: 'Выполняется', COMPLETED: 'Завершён', TERMINATED_TIMEOUT: 'Истекло время', TERMINATED_OOM: 'Достигнут лимит памяти', POLICY_VIOLATION: 'Нарушение политики', FAULT: 'Сбой' }, executionToast: (status) => `Выполнение песочницы: ${status}`, error: 'Ошибка песочницы',
    },
    fabric: {
      heading: 'Живые связи объектов Workspace Fabric', description: 'Канонический протокол vgt://[document-id]/[object-id] обеспечивает живые межприложенные встраивания с обнаружением циклов и фиксацией связей.',
      officeHeading: 'Защита песочницы Office / ODF', officeProtection: ['Защита от zip-бомб: коэффициент распаковки не выше 100:1', 'Блокировка обхода путей: удаляет ../ и абсолютные пути архива', 'Безопасность XML: блокирует DOCTYPE и внешние ENTITY (XXE)', 'Без запуска макросов: VBA/ActiveX остаются отключёнными'],
      workItemHeading: 'Каноническая модель задач', workItemProtection: ['Общий источник истины для Tasks, Planner и Projects', 'Универсальные UUID элементов с устойчивыми векторами версий', 'Атомарные обновления без теневых копий и рассинхронизации', 'Офлайн-очередь с детерминированным слиянием конфликтов'],
    },
    suite: {
      heading: 'Авторитетная 6-точечная проверка платформы', description: 'Сквозные проверки контейнеров VWC, аттестации KeyVault, изоляции WASM, живых связей Fabric, рабочих элементов и песочницы обмена.', run: 'Запустить проверку платформы', allPassed: 'Все проверки пройдены', failed: 'Проверки платформы не пройдены', passed: 'Пройдено', errorDetail: 'Техническая ошибка', unknownTest: 'Неизвестная проверка платформы',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. Целостность и совместимость контейнера VWC', passed: 'Контейнер VWC зашифрован и проверен SHA-256; неизвестное расширение сохранено', failed: 'Проверка контейнера VWC не пройдена' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. Аппаратная аттестация KeyVault и достоверность заявлений', passed: 'Аппаратная проверка активна; ложные заявления отклонены', failed: 'Проверка аппаратной аттестации KeyVault не пройдена' },
        WASM_SANDBOX_ISOLATION: { name: '3. Изоляция WASM и процессов', passed: 'Worker WASM запущен; произвольный JavaScript заблокирован; неверная точка входа отклонена', failed: 'Проверка изоляции песочницы не пройдена' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Граф объектов Workspace Fabric и обнаружение циклов', passed: 'URI Fabric проверен; циклические ссылки безопасно остановлены', failed: 'Разрешение Workspace Fabric не прошло проверку' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. Единая каноническая модель рабочих элементов', passed: 'Один источник данных используется без расходящихся копий', failed: 'Объединение модели задач не прошло проверку' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Безопасность песочницы Office / ODF', passed: 'Обход архивных путей блокирован, внешняя XML-сущность отклонена', failed: 'Проверка безопасности песочницы обмена не пройдена' },
      },
      completedToast: 'Все 6 тестов целостности платформы пройдены.', issuesToast: 'Проверка платформы завершилась с замечаниями.', error: 'Ошибка проверки платформы',
    },
    footerClose: 'Закрыть',
  },
  'it-IT': {
    header: { description: 'Piattaforma sovrana unificata: attestazione hardware, sandbox WASM, Fabric live e verifica.', close: 'Chiudi la finestra Astraea Workspace Platform Core' },
    tabs: { keyvault: 'Attestazione hardware KeyVault', wasm: 'Isolamento WASM e plugin', fabric: 'Protezione Fabric e interoperabilità', suite: 'Suite di sicurezza e roundtrip' },
    attestation: {
      heading: 'Attestazione hardware delle chiavi NIST FIPS 140-3', description: 'Verifica TPM 2.0, autenticazione di piattaforma WebAuthn e chiavi WebCrypto non estraibili. Le dichiarazioni hardware non comprovate vengono respinte.',
      attest: 'Attesta provider', testClaim: 'Verifica dichiarazione', testClaimTitle: 'Simula una dichiarazione upstream non verificata per provarne il rifiuto',
      tier: 'Livello keystore', verdict: 'Esito', hardwareBacked: 'Supporto hardware', nonExtractable: 'Non estraibile', yesVerified: 'SÌ (verificato)', noFallback: 'NO (fallback trasparente)', confirmed: 'CONFERMATO', failed: 'NON RIUSCITO',
      tierName: { HARDWARE_ATTESTED_TPM: 'TPM con attestazione hardware', PLATFORM_AUTHENTICATOR_ENCLAVE: 'Enclave dell’autenticatore di piattaforma', NON_EXTRACTABLE_SECURE_ELEMENT: 'Elemento sicuro non estraibile', SOFTWARE_KEYSTORE_FALLBACK: 'Fallback keystore software' },
      verdictName: { VERIFIED_HARDWARE: 'Hardware verificato', VERIFIED_ENCLAVE: 'Enclave verificata', VERIFIED_NON_EXTRACTABLE: 'Chiave non estraibile verificata', UNVERIFIED_CLAIM_DEGRADED: 'Dichiarazione non verificata respinta', SOFTWARE_ONLY: 'Solo software' },
      reportDetails: 'Dettagli del rapporto di attestazione', challenge: 'Challenge', signature: 'SHA-256 firma', completed: (adversarial) => adversarial ? 'Attestazione della dichiarazione hardware avversaria completata' : 'Attestazione hardware standard KeyVault completata', error: 'Errore di attestazione',
    },
    wasm: {
      heading: 'Motore di isolamento WASM e processi', description: 'Isolamento in Worker dedicato, memoria lineare WASM limitata, scadenza rigida e manifest di capacità con versione.', pluginName: { math: 'Plugin matematica e formule', summary: 'Plugin riepilogo WOM' }, selectPlugin: 'Seleziona plugin', execute: 'Esegui nella sandbox',
      runtimePolicy: 'Policy runtime', runtimePolicyDetail: 'Plugin disattivati per impostazione predefinita · Safe Mode blocca codice di terze parti', apiPackage: 'API / pacchetto', packageVerification: 'Native Core verifica SHA-256 ed Ed25519. Gli aggiornamenti firmati sono vincolati al firmatario e rifiutati in caso di errore.', installReview: 'Installazione / revisione permessi', noCapabilities: 'Nessuna capacità host richiesta', publisher: 'Editore', signature: 'Firma', signaturePresent: 'Ed25519 presente', unsignedReview: 'Non firmato; revisione esplicita richiesta', updateSource: 'Origine aggiornamento', updateSourceKind: { 'offline-file': 'File offline', 'managed-channel': 'Canale gestito', disabled: 'Disattivato' }, capabilityReconsent: 'Le nuove capacità richiedono un nuovo consenso dopo l’aggiornamento.',
      result: 'Risultato esecuzione', time: 'Tempo', memoryBound: 'Limite memoria', auditTrail: 'Registro di controllo sandbox', status: { READY: 'Pronto', EXECUTING: 'In esecuzione', COMPLETED: 'Completato', TERMINATED_TIMEOUT: 'Tempo scaduto', TERMINATED_OOM: 'Limite memoria raggiunto', POLICY_VIOLATION: 'Violazione policy', FAULT: 'Errore' }, executionToast: (status) => `Esecuzione sandbox: ${status}`, error: 'Errore sandbox',
    },
    fabric: {
      heading: 'Collegamento live di oggetti Workspace Fabric', description: 'Il protocollo canonico vgt://[document-id]/[object-id] abilita incorporamenti live tra app, con rilevamento dei cicli e blocco dei collegamenti.',
      officeHeading: 'Protezione sandbox Office / ODF', officeProtection: ['Difesa da zip bomb: rapporto di decompressione massimo 100:1', 'Blocco traversal: rimuove ../ e percorsi assoluti dagli archivi', 'Sicurezza XML: blocca DOCTYPE e dichiarazioni ENTITY esterne (XXE)', 'Nessuna macro: VBA/ActiveX incorporati restano disattivati'],
      workItemHeading: 'Modello canonico di attività', workItemProtection: ['Unica fonte condivisa per Tasks, Planner e Projects', 'UUID universali con vettori di versione stabili', 'Aggiornamenti atomici senza copie ombra o divergenze', 'Coda offline con merge deterministico dei conflitti'],
    },
    suite: {
      heading: 'Suite autorevole di verifica piattaforma in 6 punti', description: 'Verifica end-to-end di contenitori VWC, attestazione KeyVault, isolamento WASM, collegamenti Fabric, attività e sandbox di interoperabilità.', run: 'Avvia suite piattaforma', allPassed: 'Tutti i punti di verifica sono riusciti', failed: 'Controlli piattaforma non riusciti', passed: 'Riuscito', errorDetail: 'Dettaglio tecnico dell’errore', unknownTest: 'Controllo piattaforma sconosciuto',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. Roundtrip contenitore VWC e compatibilità futura', passed: 'Contenitore VWC cifrato e verificato con SHA-256; estensione sconosciuta conservata', failed: 'Roundtrip contenitore VWC non riuscito' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. Attestazione hardware KeyVault e integrità delle dichiarazioni', passed: 'Attestazione hardware attiva; dichiarazioni false respinte', failed: 'Verifica attestazione hardware KeyVault non riuscita' },
        WASM_SANDBOX_ISOLATION: { name: '3. Isolamento sandbox WASM e processi', passed: 'WASM Worker eseguito; JavaScript arbitrario bloccato; entrypoint errato respinto', failed: 'Verifica isolamento sandbox non riuscita' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Grafo oggetti Workspace Fabric e rilevamento cicli', passed: 'URI Fabric verificato e riferimenti circolari bloccati in sicurezza', failed: 'Risoluzione Workspace Fabric non riuscita' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. Unificazione del modello canonico di attività', passed: 'Un’unica fonte autorevole condivisa senza copie divergenti', failed: 'Unificazione del modello attività non riuscita' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Sicurezza sandbox interoperabilità Office / ODF', passed: 'Traversal dei percorsi archivio bloccato e entità XML esterna respinta', failed: 'Controllo sicurezza sandbox interoperabilità non riuscito' },
      },
      completedToast: 'Tutti i 6 test roundtrip della piattaforma sono riusciti.', issuesToast: 'Verifica piattaforma completata con problemi.', error: 'Errore suite piattaforma',
    },
    footerClose: 'Chiudi',
  },
  'es-ES': {
    header: { description: 'Plataforma soberana unificada: atestación de hardware, sandbox WASM, Fabric en vivo y verificación.', close: 'Cerrar el diálogo de Astraea Workspace Platform Core' },
    tabs: { keyvault: 'Atestación de hardware de KeyVault', wasm: 'Aislamiento de WASM y complementos', fabric: 'Protecciones de Fabric e interoperabilidad', suite: 'Suite de seguridad y roundtrip' },
    attestation: {
      heading: 'Atestación de claves de hardware NIST FIPS 140-3', description: 'Audita TPM 2.0, autenticación de plataforma WebAuthn y claves WebCrypto no extraíbles. Rechaza afirmaciones de hardware sin verificar.',
      attest: 'Atestar proveedor', testClaim: 'Auditar afirmación', testClaimTitle: 'Simula una afirmación upstream sin verificar para probar su rechazo',
      tier: 'Nivel del almacén', verdict: 'Veredicto', hardwareBacked: 'Respaldado por hardware', nonExtractable: 'No extraíble', yesVerified: 'SÍ (verificado)', noFallback: 'NO (alternativa transparente)', confirmed: 'CONFIRMADO', failed: 'FALLIDO',
      tierName: { HARDWARE_ATTESTED_TPM: 'TPM con atestación de hardware', PLATFORM_AUTHENTICATOR_ENCLAVE: 'Entorno aislado de autenticador de plataforma', NON_EXTRACTABLE_SECURE_ELEMENT: 'Elemento seguro no extraíble', SOFTWARE_KEYSTORE_FALLBACK: 'Alternativa de almacén de software' },
      verdictName: { VERIFIED_HARDWARE: 'Hardware verificado', VERIFIED_ENCLAVE: 'Entorno aislado verificado', VERIFIED_NON_EXTRACTABLE: 'Clave no extraíble verificada', UNVERIFIED_CLAIM_DEGRADED: 'Afirmación sin verificar rechazada', SOFTWARE_ONLY: 'Solo software' },
      reportDetails: 'Detalles del informe de atestación', challenge: 'Desafío', signature: 'SHA-256 de firma', completed: (adversarial) => adversarial ? 'Atestación de afirmación de hardware adversarial completada' : 'Atestación estándar de hardware de KeyVault completada', error: 'Error de atestación',
    },
    wasm: {
      heading: 'Motor de aislamiento WASM y procesos', description: 'Aislamiento en un Worker dedicado, memoria lineal WASM limitada, plazo estricto de ejecución y manifiestos de capacidades versionados.', pluginName: { math: 'Complemento de matemáticas y fórmulas', summary: 'Complemento de resumen WOM' }, selectPlugin: 'Seleccionar complemento', execute: 'Ejecutar en sandbox',
      runtimePolicy: 'Política de ejecución', runtimePolicyDetail: 'Los complementos están desactivados por defecto · El modo seguro bloquea código de terceros', apiPackage: 'API / paquete', packageVerification: 'Native Core verifica SHA-256 y Ed25519. Las actualizaciones firmadas se fijan al firmante y se rechazan ante errores.', installReview: 'Instalación / revisión de permisos', noCapabilities: 'No se solicitan capacidades del host', publisher: 'Editor', signature: 'Firma', signaturePresent: 'Ed25519 presente', unsignedReview: 'Sin firma; requiere revisión explícita', updateSource: 'Origen de actualización', updateSourceKind: { 'offline-file': 'Archivo sin conexión', 'managed-channel': 'Canal administrado', disabled: 'Desactivado' }, capabilityReconsent: 'Las capacidades añadidas en una actualización requieren un nuevo consentimiento.',
      result: 'Resultado de ejecución', time: 'Tiempo', memoryBound: 'Límite de memoria', auditTrail: 'Registro de auditoría del sandbox', status: { READY: 'Listo', EXECUTING: 'En ejecución', COMPLETED: 'Completado', TERMINATED_TIMEOUT: 'Tiempo agotado', TERMINATED_OOM: 'Límite de memoria alcanzado', POLICY_VIOLATION: 'Incumplimiento de política', FAULT: 'Error' }, executionToast: (status) => `Ejecución del sandbox: ${status}`, error: 'Error del sandbox',
    },
    fabric: {
      heading: 'Vínculo de objetos en vivo de Workspace Fabric', description: 'El protocolo canónico vgt://[document-id]/[object-id] permite inserciones en vivo entre aplicaciones con detección de ciclos y bloqueo de vínculos.',
      officeHeading: 'Protecciones del sandbox Office / ODF', officeProtection: ['Defensa contra zip bombs: relación de descompresión máxima de 100:1', 'Bloqueo de traversal: elimina ../ y rutas absolutas de los archivos', 'Seguridad XML: bloquea DOCTYPE y declaraciones ENTITY externas (XXE)', 'Sin ejecución de macros: VBA/ActiveX incrustados permanecen desactivados'],
      workItemHeading: 'Modelo canónico de trabajo', workItemProtection: ['Fuente de verdad compartida para Tasks, Planner y Projects', 'UUID universales de trabajo con vectores de versión estables', 'Actualizaciones atómicas sin copias sombra ni desincronización', 'Cola local sin conexión con combinación determinista de conflictos'],
    },
    suite: {
      heading: 'Suite autorizada de verificación de plataforma en 6 puntos', description: 'Comprobaciones integrales de contenedores VWC, atestación KeyVault, aislamiento WASM, vínculos Fabric, elementos de trabajo y sandbox de interoperabilidad.', run: 'Ejecutar suite de plataforma', allPassed: 'Todos los puntos de verificación han pasado', failed: 'Han fallado las comprobaciones de plataforma', passed: 'Correcto', errorDetail: 'Detalle técnico del error', unknownTest: 'Comprobación de plataforma desconocida',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. Roundtrip del contenedor VWC y compatibilidad futura', passed: 'Contenedor VWC cifrado y verificado con SHA-256; extensión desconocida conservada', failed: 'Ha fallado el roundtrip del contenedor VWC' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. Atestación de hardware KeyVault e integridad de afirmaciones', passed: 'Atestación de hardware activa; afirmaciones falsas rechazadas', failed: 'Ha fallado la validación de hardware KeyVault' },
        WASM_SANDBOX_ISOLATION: { name: '3. Aislamiento de sandbox WASM y procesos', passed: 'WASM Worker ejecutado; JavaScript arbitrario bloqueado; punto de entrada incorrecto rechazado', failed: 'Ha fallado la validación de aislamiento del sandbox' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Grafo de Workspace Fabric y detección de ciclos', passed: 'URI de Fabric verificada y referencias circulares bloqueadas de forma segura', failed: 'Ha fallado la resolución de Workspace Fabric' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. Unificación del modelo canónico de trabajo', passed: 'Una fuente autoritativa compartida sin copias divergentes', failed: 'Ha fallado la unificación del modelo de trabajo' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Seguridad del sandbox de interoperabilidad Office / ODF', passed: 'Traversal de rutas de archivo bloqueado y entidad XML externa rechazada', failed: 'Ha fallado la comprobación de seguridad de interoperabilidad' },
      },
      completedToast: 'Han pasado las 6 pruebas roundtrip de la plataforma.', issuesToast: 'La verificación de la plataforma terminó con incidencias.', error: 'Error de la suite de plataforma',
    },
    footerClose: 'Cerrar',
  },
  'ja-JP': {
    header: { description: '統合された主権型プラットフォーム：ハードウェア証明、WASMサンドボックス、Fabric、検証。', close: 'Astraea Workspace Platform Coreダイアログを閉じる' },
    tabs: { keyvault: 'KeyVaultハードウェア証明', wasm: 'WASMとプラグインの分離', fabric: 'Fabricと相互運用の保護', suite: 'セキュリティと往復検証' },
    attestation: {
      heading: 'NIST FIPS 140-3ハードウェアキー証明', description: 'TPM 2.0、WebAuthnプラットフォーム認証、抽出不可のWebCryptoキーを監査します。裏付けのないハードウェア主張は拒否します。',
      attest: 'プロバイダーを証明', testClaim: '主張を監査', testClaimTitle: '未検証の上流主張を模擬して拒否を確認します',
      tier: 'キーストア階層', verdict: '判定', hardwareBacked: 'ハードウェア保護', nonExtractable: '抽出不可', yesVerified: 'はい（検証済み）', noFallback: 'いいえ（適切な代替）', confirmed: '確認済み', failed: '失敗',
      tierName: { HARDWARE_ATTESTED_TPM: 'ハードウェア証明済みTPM', PLATFORM_AUTHENTICATOR_ENCLAVE: 'プラットフォーム認証領域', NON_EXTRACTABLE_SECURE_ELEMENT: '抽出不可のセキュアエレメント', SOFTWARE_KEYSTORE_FALLBACK: 'ソフトウェアキーストア代替' },
      verdictName: { VERIFIED_HARDWARE: 'ハードウェアを検証済み', VERIFIED_ENCLAVE: '認証領域を検証済み', VERIFIED_NON_EXTRACTABLE: '抽出不可キーを検証済み', UNVERIFIED_CLAIM_DEGRADED: '未検証の主張を拒否', SOFTWARE_ONLY: 'ソフトウェアのみ' },
      reportDetails: '証明レポートの詳細', challenge: 'チャレンジ', signature: '署名SHA-256', completed: (adversarial) => adversarial ? '敵対的なハードウェア主張の証明が完了しました' : '標準KeyVaultハードウェア証明が完了しました', error: '証明エラー',
    },
    wasm: {
      heading: 'WASMとプロセスの分離エンジン', description: '専用Workerで分離し、WASM線形メモリと実行時間を制限し、バージョン付き機能マニフェストを使用します。', pluginName: { math: '数式プラグイン', summary: 'WOM要約プラグイン' }, selectPlugin: 'プラグインを選択', execute: 'サンドボックスで実行',
      runtimePolicy: 'ランタイムポリシー', runtimePolicyDetail: 'プラグインは既定で無効 · セーフモードはサードパーティコードをブロック', apiPackage: 'API / パッケージ', packageVerification: 'Native CoreはSHA-256とEd25519を検証します。署名付き更新は署名者に固定され、失敗時は拒否されます。', installReview: 'インストール / 権限の確認', noCapabilities: 'ホスト機能の要求なし', publisher: '発行元', signature: '署名', signaturePresent: 'Ed25519あり', unsignedReview: '未署名。明示的な確認が必要', updateSource: '更新元', updateSourceKind: { 'offline-file': 'オフラインファイル', 'managed-channel': '管理チャネル', disabled: '無効' }, capabilityReconsent: '更新で機能を追加する場合は再同意が必要です。',
      result: '実行結果', time: '時間', memoryBound: 'メモリ上限', auditTrail: 'サンドボックス監査記録', status: { READY: '準備完了', EXECUTING: '実行中', COMPLETED: '完了', TERMINATED_TIMEOUT: 'タイムアウト', TERMINATED_OOM: 'メモリ上限に到達', POLICY_VIOLATION: 'ポリシー違反', FAULT: '障害' }, executionToast: (status) => `サンドボックス実行: ${status}`, error: 'サンドボックスエラー',
    },
    fabric: {
      heading: 'Workspace Fabricライブオブジェクトリンク', description: '正規のvgt://[document-id]/[object-id]プロトコルにより、循環検出とリンク固定を備えたアプリ間ライブ埋め込みが可能です。',
      officeHeading: 'Office / ODFサンドボックス保護', officeProtection: ['Zip爆弾対策：展開率を最大100:1に制限', 'パストラバーサル防止：../と絶対パスをアーカイブから除去', 'XMLセキュリティ：DOCTYPEと外部ENTITY（XXE）をブロック', 'マクロ実行なし：埋め込みVBA/ActiveXは無効のまま'],
      workItemHeading: '正規の作業項目モデル', workItemProtection: ['Tasks、Planner、Projectsで共有する単一の情報源', '安定したバージョンベクトルを持つ共通作業項目UUID', 'シャドウコピーや状態ずれのないアトミック更新', '決定的な競合統合を行うオフラインキュー'],
    },
    suite: {
      heading: '権威ある6項目プラットフォーム検証スイート', description: 'VWCコンテナー、KeyVault証明、WASM分離、Fabricライブリンク、作業項目、相互運用サンドボックスをエンドツーエンドで検証します。', run: 'プラットフォーム検証を実行', allPassed: 'すべての検証項目に合格', failed: 'プラットフォーム検査に失敗', passed: '合格', errorDetail: '技術エラーの詳細', unknownTest: '不明なプラットフォーム検査',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. VWCストレージの往復検証と将来互換性', passed: 'VWCを暗号化しSHA-256を検証、未知の拡張を保持', failed: 'VWCの往復検証に失敗しました' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. KeyVaultハードウェア証明と主張の整合性', passed: 'ハードウェア証明が有効で、虚偽の主張を拒否', failed: 'KeyVaultハードウェア証明の検証に失敗しました' },
        WASM_SANDBOX_ISOLATION: { name: '3. WASMとプロセスのサンドボックス分離', passed: 'Worker WASMを実行し、任意JavaScriptと誤ったエントリーポイントを拒否', failed: 'サンドボックス分離の検証に失敗しました' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Workspace Fabricオブジェクトグラフと循環検出', passed: 'Fabric URIを検証し、循環参照を安全に遮断', failed: 'Workspace Fabricの解決に失敗しました' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. 正規作業項目モデルの統合', passed: '分岐コピーを作らず単一の情報源を共有', failed: '作業項目モデルの統合に失敗しました' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Office / ODF相互運用サンドボックスの安全性', passed: 'アーカイブのパストラバーサルと外部XMLエンティティを拒否', failed: '相互運用サンドボックスの安全性検査に失敗しました' },
      },
      completedToast: 'プラットフォームの往復テスト6件すべてに合格しました。', issuesToast: 'プラットフォーム検証で問題が見つかりました。', error: 'プラットフォームスイートエラー',
    },
    footerClose: '閉じる',
  },
  'zh-CN': {
    header: { description: '统一的主权平台：硬件证明、WASM 沙箱、实时 Fabric 和验证。', close: '关闭 Astraea Workspace Platform Core 对话框' },
    tabs: { keyvault: 'KeyVault 硬件证明', wasm: 'WASM 与插件隔离', fabric: 'Fabric 与互操作保护', suite: '安全与往返验证套件' },
    attestation: {
      heading: 'NIST FIPS 140-3 硬件密钥证明', description: '审计 TPM 2.0、WebAuthn 平台认证和不可导出的 WebCrypto 密钥。拒绝未经验证的硬件声明。',
      attest: '证明提供方', testClaim: '审计声明', testClaimTitle: '模拟未经验证的上游声明并测试拒绝行为',
      tier: '密钥库层级', verdict: '结论', hardwareBacked: '硬件保护', nonExtractable: '不可导出', yesVerified: '是（已验证）', noFallback: '否（如实回退）', confirmed: '已确认', failed: '失败',
      tierName: { HARDWARE_ATTESTED_TPM: '硬件证明 TPM', PLATFORM_AUTHENTICATOR_ENCLAVE: '平台认证隔离区', NON_EXTRACTABLE_SECURE_ELEMENT: '不可导出的安全元件', SOFTWARE_KEYSTORE_FALLBACK: '软件密钥库回退' },
      verdictName: { VERIFIED_HARDWARE: '硬件已验证', VERIFIED_ENCLAVE: '隔离区已验证', VERIFIED_NON_EXTRACTABLE: '不可导出密钥已验证', UNVERIFIED_CLAIM_DEGRADED: '未经验证的声明已拒绝', SOFTWARE_ONLY: '仅软件保护' },
      reportDetails: '证明报告详情', challenge: '挑战值', signature: '签名 SHA-256', completed: (adversarial) => adversarial ? '对抗性硬件声明证明已完成' : 'KeyVault 标准硬件证明已完成', error: '证明错误',
    },
    wasm: {
      heading: 'WASM 与进程隔离引擎', description: '在专用 Worker 中隔离，限制 WASM 线性内存和执行期限，并使用带版本的能力清单。', pluginName: { math: '数学与公式插件', summary: 'WOM 摘要插件' }, selectPlugin: '选择插件', execute: '在沙箱中执行',
      runtimePolicy: '运行策略', runtimePolicyDetail: '插件默认关闭 · 安全模式会阻止第三方代码', apiPackage: 'API / 包', packageVerification: 'Native Core 验证 SHA-256 和 Ed25519。签名更新固定到签名者，验证失败时拒绝。', installReview: '安装 / 权限审查', noCapabilities: '未请求主机能力', publisher: '发布者', signature: '签名', signaturePresent: '存在 Ed25519', unsignedReview: '未签名；需要明确审查', updateSource: '更新来源', updateSourceKind: { 'offline-file': '离线文件', 'managed-channel': '托管通道', disabled: '已禁用' }, capabilityReconsent: '更新添加能力后需要重新同意。',
      result: '执行结果', time: '耗时', memoryBound: '内存上限', auditTrail: '沙箱审计记录', status: { READY: '就绪', EXECUTING: '执行中', COMPLETED: '已完成', TERMINATED_TIMEOUT: '已超时', TERMINATED_OOM: '已达到内存上限', POLICY_VIOLATION: '违反策略', FAULT: '故障' }, executionToast: (status) => `沙箱执行：${status}`, error: '沙箱错误',
    },
    fabric: {
      heading: 'Workspace Fabric 实时对象链接', description: '规范的 vgt://[document-id]/[object-id] 协议支持跨应用实时嵌入，并提供循环检测和链接冻结。',
      officeHeading: 'Office / ODF 沙箱保护', officeProtection: ['Zip 炸弹防护：解压比例最高 100:1', '路径遍历拦截：从归档条目中移除 ../ 和绝对路径', 'XML 安全：阻止 DOCTYPE 与外部 ENTITY 声明（XXE）', '不执行宏：嵌入的 VBA/ActiveX 保持禁用'],
      workItemHeading: '规范工作项模型', workItemProtection: ['Tasks、Planner 和 Projects 共享单一事实来源', '工作项 UUID 通用且版本向量稳定', '原子更新，不产生影子副本或状态偏移', '离线队列采用确定性冲突合并'],
    },
    suite: {
      heading: '权威的六项平台验证套件', description: '端到端检查 VWC 容器、KeyVault 证明、WASM 隔离、Fabric 实时链接、工作项和互操作沙箱。', run: '运行平台套件', allPassed: '所有验证项均已通过', failed: '平台检查失败', passed: '通过', errorDetail: '技术错误详情', unknownTest: '未知的平台检查',
      test: {
        VWC_STORAGE_CONTAINER_ROUNDTRIP: { name: '1. VWC 存储往返与前向兼容性', passed: 'VWC 容器已加密并通过 SHA-256 验证；未知扩展已保留', failed: 'VWC 容器往返失败' },
        KEYVAULT_HARDWARE_ATTESTATION: { name: '2. KeyVault 硬件证明与声明完整性', passed: '硬件证明有效；虚假声明已拒绝', failed: 'KeyVault 硬件证明验证失败' },
        WASM_SANDBOX_ISOLATION: { name: '3. WASM 与进程沙箱隔离', passed: 'Worker WASM 已执行；任意 JavaScript 被阻止；错误入口被拒绝', failed: '沙箱隔离验证失败' },
        WORKSPACE_FABRIC_LIVE_OBJECTS: { name: '4. Workspace Fabric 对象图与循环检测', passed: 'Fabric URI 已验证，并安全拦截循环对象引用', failed: 'Workspace Fabric 解析失败' },
        CANONICAL_WORK_ITEM_SYNC: { name: '5. 规范工作项模型统一', passed: '单一权威工作项共享，未产生分叉副本', failed: '工作项模型统一失败' },
        OFFICE_ODF_INTEROP_SANDBOX: { name: '6. Office / ODF 互操作沙箱安全', passed: '归档路径遍历已阻止，外部 XML 实体已拒绝', failed: '互操作沙箱安全检查失败' },
      },
      completedToast: '平台六项往返测试全部通过。', issuesToast: '平台验证已完成，但发现问题。', error: '平台套件错误',
    },
    footerClose: '关闭',
  },
};

export function platformAdvancedCopy(locale: WorkspaceLocale): PlatformAdvancedCopy {
  return PLATFORM_ADVANCED_COPY[locale];
}
