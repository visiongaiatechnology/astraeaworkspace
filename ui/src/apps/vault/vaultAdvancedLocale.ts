// STATUS: GOLD — maps stable Vault capability, attestation and self-test codes to seven locales.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  probing: 'Checking platform…',
  providerPlatform: 'Platform authenticator available for user verification; Vault key hardware binding is not asserted',
  providerWebCrypto: 'WebCrypto SubtleCrypto non-extractable key (hardware backing unknown)',
  providerSoftware: 'Software fallback',
  providerUnknown: 'Provider status unavailable',
  tierPlatform: 'Platform authenticator available',
  tierWebCrypto: 'Software WebCrypto',
  tierFallback: 'Emulated fallback',
  tierUnknown: 'Security level unavailable',
  authenticatorAvailable: 'Authenticator available',
  authenticatorUnavailable: 'Unavailable',
  attestationPrefix: 'WebCrypto self-verification',
  attestationKey: 'Key handle',
  attestationProvider: 'Provider status',
  attestationAlgorithm: 'Algorithm',
  attestationTimestamp: 'Checked at',
  attestationSignature: 'Signature (hex)',
  attestationVerified: 'Signature verified locally',
  attestationFailed: 'Signature verification failed',
  suiteContainerName: 'Encrypted VGT3 container roundtrip',
  suiteContainerPass: 'The encrypted container passed the local roundtrip and credential-rejection checks.',
  suiteContainerFail: 'The encrypted container did not pass the required local roundtrip checks.',
  suiteSigningName: 'Non-extractable signing self-check',
  suiteSigningPass: 'The signing key was verified locally; hardware backing is not asserted.',
  suiteSigningFail: 'The signing key did not pass local signature verification.',
  suiteIntegrityName: 'Chunk integrity and tamper detection',
  suiteIntegrityPass: 'Chunk integrity checks accepted the fixture and detected its modified copy.',
  suiteIntegrityFail: 'Chunk integrity checks did not detect the expected fixture change.',
  suiteQuarantineName: 'Executable quarantine checks',
  suiteQuarantinePass: 'The quarantine check classified the executable fixtures as expected.',
  suiteQuarantineFail: 'The quarantine check did not classify the fixtures as expected.',
  suiteZeroizeName: 'Sensitive buffer clearing',
  suiteZeroizePass: 'The test buffer was cleared in place.',
  suiteZeroizeFail: 'The test buffer was not cleared as expected.',
  suiteUnknownName: 'Additional self-test',
  suiteUnknownPass: 'The self-test completed.',
  suiteUnknownFail: 'Self-test details are unavailable.',
} as const;
type VaultAdvancedKey = keyof typeof ENGLISH;
type VaultAdvancedCopy = Record<VaultAdvancedKey, string>;

export const VAULT_ADVANCED_COPY: Readonly<Record<WorkspaceLocale, VaultAdvancedCopy>> = {
  'en-US': ENGLISH,
  'de-DE': { probing: 'Plattform wird geprüft …', providerPlatform: 'Plattformauthentifikator für Benutzerprüfung verfügbar; Hardwarebindung des Vault-Schlüssels wird nicht behauptet', providerWebCrypto: 'Nicht extrahierbarer WebCrypto-SubtleCrypto-Schlüssel (Hardwarebindung unbekannt)', providerSoftware: 'Software-Fallback', providerUnknown: 'Providerstatus nicht verfügbar', tierPlatform: 'Plattformauthentifikator verfügbar', tierWebCrypto: 'Software-WebCrypto', tierFallback: 'Emulierter Fallback', tierUnknown: 'Sicherheitsstufe nicht verfügbar', authenticatorAvailable: 'Authentifikator verfügbar', authenticatorUnavailable: 'Nicht verfügbar', attestationPrefix: 'Lokale WebCrypto-Selbstprüfung', attestationKey: 'Schlüsselreferenz', attestationProvider: 'Providerstatus', attestationAlgorithm: 'Algorithmus', attestationTimestamp: 'Geprüft am', attestationSignature: 'Signatur (Hex)', attestationVerified: 'Signatur lokal verifiziert', attestationFailed: 'Signaturprüfung fehlgeschlagen', suiteContainerName: 'Roundtrip des verschlüsselten VGT3-Containers', suiteContainerPass: 'Der verschlüsselte Container bestand den lokalen Roundtrip und die Prüfung auf zurückgewiesene Zugangsdaten.', suiteContainerFail: 'Der verschlüsselte Container bestand die erforderlichen lokalen Roundtrip-Prüfungen nicht.', suiteSigningName: 'Selbstprüfung des nicht extrahierbaren Signaturschlüssels', suiteSigningPass: 'Der Signaturschlüssel wurde lokal verifiziert; eine Hardwarebindung wird nicht behauptet.', suiteSigningFail: 'Der Signaturschlüssel bestand die lokale Signaturprüfung nicht.', suiteIntegrityName: 'Chunk-Integrität und Manipulationserkennung', suiteIntegrityPass: 'Die Integritätsprüfung akzeptierte die Testdaten und erkannte die geänderte Kopie.', suiteIntegrityFail: 'Die Integritätsprüfung erkannte die erwartete Änderung der Testdaten nicht.', suiteQuarantineName: 'Prüfungen der ausführbaren Dateiquarantäne', suiteQuarantinePass: 'Die Quarantäneprüfung klassifizierte die Testdateien wie erwartet.', suiteQuarantineFail: 'Die Quarantäneprüfung klassifizierte die Testdateien nicht wie erwartet.', suiteZeroizeName: 'Löschen sensibler Puffer', suiteZeroizePass: 'Der Testpuffer wurde direkt überschrieben.', suiteZeroizeFail: 'Der Testpuffer wurde nicht wie erwartet gelöscht.', suiteUnknownName: 'Zusätzlicher Selbsttest', suiteUnknownPass: 'Der Selbsttest wurde abgeschlossen.', suiteUnknownFail: 'Details zum Selbsttest sind nicht verfügbar.' },
  'es-ES': { probing: 'Comprobando la plataforma…', providerPlatform: 'Autenticador de plataforma disponible para verificar al usuario; no se afirma que la clave de Vault esté vinculada al hardware', providerWebCrypto: 'Clave no extraíble de WebCrypto SubtleCrypto (vinculación al hardware desconocida)', providerSoftware: 'Alternativa de software', providerUnknown: 'Estado del proveedor no disponible', tierPlatform: 'Autenticador de plataforma disponible', tierWebCrypto: 'WebCrypto de software', tierFallback: 'Alternativa emulada', tierUnknown: 'Nivel de seguridad no disponible', authenticatorAvailable: 'Autenticador disponible', authenticatorUnavailable: 'No disponible', attestationPrefix: 'Autoverificación local de WebCrypto', attestationKey: 'Identificador de clave', attestationProvider: 'Estado del proveedor', attestationAlgorithm: 'Algoritmo', attestationTimestamp: 'Comprobado el', attestationSignature: 'Firma (hexadecimal)', attestationVerified: 'Firma verificada localmente', attestationFailed: 'Falló la verificación de la firma', suiteContainerName: 'Ciclo del contenedor VGT3 cifrado', suiteContainerPass: 'El contenedor cifrado superó el ciclo local y las comprobaciones de rechazo de credenciales.', suiteContainerFail: 'El contenedor cifrado no superó las comprobaciones locales requeridas.', suiteSigningName: 'Autocomprobación de firma no extraíble', suiteSigningPass: 'La clave de firma se verificó localmente; no se afirma que esté vinculada al hardware.', suiteSigningFail: 'La clave de firma no superó la verificación local.', suiteIntegrityName: 'Integridad de bloques y detección de cambios', suiteIntegrityPass: 'La comprobación aceptó los datos de prueba y detectó la copia modificada.', suiteIntegrityFail: 'La comprobación no detectó el cambio esperado en los datos.', suiteQuarantineName: 'Comprobaciones de cuarentena de ejecutables', suiteQuarantinePass: 'La cuarentena clasificó los archivos de prueba según lo esperado.', suiteQuarantineFail: 'La cuarentena no clasificó los archivos de prueba según lo esperado.', suiteZeroizeName: 'Borrado de búfer sensible', suiteZeroizePass: 'El búfer de prueba se borró en el mismo lugar.', suiteZeroizeFail: 'El búfer de prueba no se borró como se esperaba.', suiteUnknownName: 'Autocomprobación adicional', suiteUnknownPass: 'La autocomprobación terminó.', suiteUnknownFail: 'Los detalles de la autocomprobación no están disponibles.' },
  'it-IT': { probing: 'Verifica della piattaforma…', providerPlatform: 'Autenticatore della piattaforma disponibile per verificare l’utente; non si dichiara il legame hardware della chiave Vault', providerWebCrypto: 'Chiave WebCrypto SubtleCrypto non estraibile (legame hardware sconosciuto)', providerSoftware: 'Fallback software', providerUnknown: 'Stato del provider non disponibile', tierPlatform: 'Autenticatore della piattaforma disponibile', tierWebCrypto: 'WebCrypto software', tierFallback: 'Fallback emulato', tierUnknown: 'Livello di sicurezza non disponibile', authenticatorAvailable: 'Autenticatore disponibile', authenticatorUnavailable: 'Non disponibile', attestationPrefix: 'Autoverifica WebCrypto locale', attestationKey: 'Riferimento chiave', attestationProvider: 'Stato provider', attestationAlgorithm: 'Algoritmo', attestationTimestamp: 'Verificato il', attestationSignature: 'Firma (esadecimale)', attestationVerified: 'Firma verificata localmente', attestationFailed: 'Verifica della firma non riuscita', suiteContainerName: 'Roundtrip del contenitore VGT3 cifrato', suiteContainerPass: 'Il contenitore cifrato ha superato il roundtrip locale e i controlli di rifiuto delle credenziali.', suiteContainerFail: 'Il contenitore cifrato non ha superato i controlli roundtrip locali richiesti.', suiteSigningName: 'Autoverifica della chiave di firma non estraibile', suiteSigningPass: 'La chiave di firma è stata verificata localmente; non si dichiara il legame hardware.', suiteSigningFail: 'La chiave di firma non ha superato la verifica locale.', suiteIntegrityName: 'Integrità dei blocchi e rilevamento delle modifiche', suiteIntegrityPass: 'Il controllo ha accettato i dati di prova e rilevato la copia modificata.', suiteIntegrityFail: 'Il controllo non ha rilevato la modifica prevista dei dati.', suiteQuarantineName: 'Controlli di quarantena degli eseguibili', suiteQuarantinePass: 'La quarantena ha classificato i file di prova come previsto.', suiteQuarantineFail: 'La quarantena non ha classificato i file di prova come previsto.', suiteZeroizeName: 'Cancellazione del buffer sensibile', suiteZeroizePass: 'Il buffer di prova è stato sovrascritto sul posto.', suiteZeroizeFail: 'Il buffer di prova non è stato cancellato come previsto.', suiteUnknownName: 'Autoverifica aggiuntiva', suiteUnknownPass: 'L’autoverifica è terminata.', suiteUnknownFail: 'I dettagli dell’autoverifica non sono disponibili.' },
  'ja-JP': { probing: 'プラットフォームを確認中…', providerPlatform: 'ユーザー確認用のプラットフォーム認証器が利用可能です。Vault キーのハードウェア結合は保証しません', providerWebCrypto: 'WebCrypto SubtleCrypto の抽出不可キー（ハードウェア結合は不明）', providerSoftware: 'ソフトウェアフォールバック', providerUnknown: 'プロバイダー状態を利用できません', tierPlatform: 'プラットフォーム認証器を利用可能', tierWebCrypto: 'ソフトウェア WebCrypto', tierFallback: 'エミュレートされたフォールバック', tierUnknown: 'セキュリティレベルを利用できません', authenticatorAvailable: '認証器を利用可能', authenticatorUnavailable: '利用不可', attestationPrefix: 'WebCrypto ローカル自己検証', attestationKey: 'キー参照', attestationProvider: 'プロバイダー状態', attestationAlgorithm: 'アルゴリズム', attestationTimestamp: '確認日時', attestationSignature: '署名（16進数）', attestationVerified: '署名をローカルで検証しました', attestationFailed: '署名の検証に失敗しました', suiteContainerName: '暗号化 VGT3 コンテナーの往復検証', suiteContainerPass: '暗号化コンテナーのローカル往復検証と認証情報拒否検査に成功しました。', suiteContainerFail: '暗号化コンテナーが必要なローカル往復検査に合格しませんでした。', suiteSigningName: '抽出不可署名キーの自己検査', suiteSigningPass: '署名キーをローカルで検証しました。ハードウェア結合は保証しません。', suiteSigningFail: '署名キーのローカル検証に失敗しました。', suiteIntegrityName: 'チャンク整合性と改ざん検出', suiteIntegrityPass: '整合性検査でテストデータを確認し、変更されたコピーを検出しました。', suiteIntegrityFail: '整合性検査で想定された変更を検出できませんでした。', suiteQuarantineName: '実行ファイル隔離検査', suiteQuarantinePass: '隔離検査でテストファイルを想定どおりに分類しました。', suiteQuarantineFail: '隔離検査でテストファイルを想定どおりに分類できませんでした。', suiteZeroizeName: '機密バッファの消去', suiteZeroizePass: 'テストバッファをその場で消去しました。', suiteZeroizeFail: 'テストバッファを想定どおりに消去できませんでした。', suiteUnknownName: '追加の自己検査', suiteUnknownPass: '自己検査が完了しました。', suiteUnknownFail: '自己検査の詳細を利用できません。' },
  'ru-RU': { probing: 'Проверка платформы…', providerPlatform: 'Платформенный аутентификатор доступен для проверки пользователя; аппаратная привязка ключа Vault не заявляется', providerWebCrypto: 'Неизвлекаемый ключ WebCrypto SubtleCrypto (аппаратная привязка неизвестна)', providerSoftware: 'Программный резервный режим', providerUnknown: 'Состояние поставщика недоступно', tierPlatform: 'Платформенный аутентификатор доступен', tierWebCrypto: 'Программный WebCrypto', tierFallback: 'Эмулируемый резервный режим', tierUnknown: 'Уровень безопасности недоступен', authenticatorAvailable: 'Аутентификатор доступен', authenticatorUnavailable: 'Недоступно', attestationPrefix: 'Локальная самопроверка WebCrypto', attestationKey: 'Идентификатор ключа', attestationProvider: 'Состояние поставщика', attestationAlgorithm: 'Алгоритм', attestationTimestamp: 'Время проверки', attestationSignature: 'Подпись (шестнадцатеричная)', attestationVerified: 'Подпись проверена локально', attestationFailed: 'Не удалось проверить подпись', suiteContainerName: 'Проверка цикла зашифрованного контейнера VGT3', suiteContainerPass: 'Зашифрованный контейнер прошел локальную проверку цикла и отклонения учетных данных.', suiteContainerFail: 'Зашифрованный контейнер не прошел необходимые локальные проверки цикла.', suiteSigningName: 'Самопроверка неизвлекаемого ключа подписи', suiteSigningPass: 'Ключ подписи проверен локально; аппаратная привязка не заявляется.', suiteSigningFail: 'Ключ подписи не прошел локальную проверку.', suiteIntegrityName: 'Целостность фрагментов и обнаружение изменений', suiteIntegrityPass: 'Проверка целостности приняла тестовые данные и обнаружила измененную копию.', suiteIntegrityFail: 'Проверка целостности не обнаружила ожидаемое изменение данных.', suiteQuarantineName: 'Проверка карантина исполняемых файлов', suiteQuarantinePass: 'Карантин классифицировал тестовые файлы ожидаемым образом.', suiteQuarantineFail: 'Карантин не классифицировал тестовые файлы ожидаемым образом.', suiteZeroizeName: 'Очистка конфиденциального буфера', suiteZeroizePass: 'Тестовый буфер очищен на месте.', suiteZeroizeFail: 'Тестовый буфер не очищен ожидаемым образом.', suiteUnknownName: 'Дополнительная самопроверка', suiteUnknownPass: 'Самопроверка завершена.', suiteUnknownFail: 'Сведения самопроверки недоступны.' },
  'zh-CN': { probing: '正在检查平台…', providerPlatform: '可使用平台认证器验证用户；不表示 Vault 密钥已绑定硬件', providerWebCrypto: 'WebCrypto SubtleCrypto 不可导出密钥（硬件绑定状态未知）', providerSoftware: '软件回退', providerUnknown: '提供方状态不可用', tierPlatform: '平台认证器可用', tierWebCrypto: '软件 WebCrypto', tierFallback: '模拟回退', tierUnknown: '安全级别不可用', authenticatorAvailable: '认证器可用', authenticatorUnavailable: '不可用', attestationPrefix: 'WebCrypto 本地自验证', attestationKey: '密钥句柄', attestationProvider: '提供方状态', attestationAlgorithm: '算法', attestationTimestamp: '检查时间', attestationSignature: '签名（十六进制）', attestationVerified: '签名已在本地验证', attestationFailed: '签名验证失败', suiteContainerName: '加密 VGT3 容器往返检查', suiteContainerPass: '加密容器通过了本地往返和凭据拒绝检查。', suiteContainerFail: '加密容器未通过所需的本地往返检查。', suiteSigningName: '不可导出签名密钥自检', suiteSigningPass: '签名密钥已在本地验证；不表示密钥绑定硬件。', suiteSigningFail: '签名密钥未通过本地验证。', suiteIntegrityName: '分块完整性和篡改检测', suiteIntegrityPass: '完整性检查接受了测试数据并检测到修改后的副本。', suiteIntegrityFail: '完整性检查未检测到预期的数据更改。', suiteQuarantineName: '可执行文件隔离检查', suiteQuarantinePass: '隔离检查按预期分类了测试文件。', suiteQuarantineFail: '隔离检查未按预期分类测试文件。', suiteZeroizeName: '敏感缓冲区清除', suiteZeroizePass: '测试缓冲区已原位清除。', suiteZeroizeFail: '测试缓冲区未按预期清除。', suiteUnknownName: '其他自检', suiteUnknownPass: '自检已完成。', suiteUnknownFail: '自检详情不可用。' },
};

export function vaultAdvancedText(message: VaultAdvancedKey, locale: WorkspaceLocale): string { return VAULT_ADVANCED_COPY[locale][message]; }
export const VAULT_ADVANCED_PROVIDER_CODES = {
  'Platform authenticator available for user verification; Vault key hardware binding is not asserted': 'providerPlatform',
  'WebCrypto SubtleCrypto non-extractable key (hardware backing unknown)': 'providerWebCrypto',
  'Software Fallback': 'providerSoftware',
} as const;
export function vaultProviderText(provider: string, locale: WorkspaceLocale): string {
  const key = Object.prototype.hasOwnProperty.call(VAULT_ADVANCED_PROVIDER_CODES, provider)
    ? VAULT_ADVANCED_PROVIDER_CODES[provider as keyof typeof VAULT_ADVANCED_PROVIDER_CODES]
    : 'providerUnknown';
  return vaultAdvancedText(key, locale);
}
export function vaultSecurityLevelText(level: string | undefined, locale: WorkspaceLocale): string {
  const key = level === 'PLATFORM_AUTHENTICATOR_AVAILABLE' ? 'tierPlatform'
    : level === 'SOFTWARE_WEBCRYPTO' ? 'tierWebCrypto'
    : level === 'FALLBACK_EMULATED' ? 'tierFallback' : 'tierUnknown';
  return vaultAdvancedText(key, locale);
}
export function vaultAttestationProviderText(value: string, locale: WorkspaceLocale): string {
  const prefix = 'WebCrypto self-verification; ';
  return value.startsWith(prefix)
    ? `${vaultAdvancedText('attestationPrefix', locale)} · ${vaultProviderText(value.slice(prefix.length), locale)}`
    : vaultProviderText(value, locale);
}

type SuiteCode = 'VGT3_CONTAINER_ROUNDTRIP' | 'NON_EXTRACTABLE_SIGNING' | 'CHUNK_INTEGRITY' | 'QUARANTINE_EXECUTABLE' | 'MEMORY_ZEROIZE';
type SuiteCopyKeys = readonly [VaultAdvancedKey, VaultAdvancedKey, VaultAdvancedKey];
const SUITE_CODE_COPY: Readonly<Record<SuiteCode, SuiteCopyKeys>> = {
  VGT3_CONTAINER_ROUNDTRIP: ['suiteContainerName', 'suiteContainerPass', 'suiteContainerFail'],
  NON_EXTRACTABLE_SIGNING: ['suiteSigningName', 'suiteSigningPass', 'suiteSigningFail'],
  CHUNK_INTEGRITY: ['suiteIntegrityName', 'suiteIntegrityPass', 'suiteIntegrityFail'],
  QUARANTINE_EXECUTABLE: ['suiteQuarantineName', 'suiteQuarantinePass', 'suiteQuarantineFail'],
  MEMORY_ZEROIZE: ['suiteZeroizeName', 'suiteZeroizePass', 'suiteZeroizeFail'],
};
export function vaultSuiteResultText(id: string, passed: boolean, locale: WorkspaceLocale): { name: string; message: string } {
  const known = Object.prototype.hasOwnProperty.call(SUITE_CODE_COPY, id);
  const keys: SuiteCopyKeys = known ? SUITE_CODE_COPY[id as SuiteCode] : ['suiteUnknownName', 'suiteUnknownPass', 'suiteUnknownFail'];
  return { name: vaultAdvancedText(keys[0], locale), message: vaultAdvancedText(passed ? keys[1] : keys[2], locale) };
}
