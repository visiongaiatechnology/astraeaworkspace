// STATUS: GOLD — localizes stable backup engine codes and hides unknown diagnostics from visible copy.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const COPY = {
  'en-US': { generic: 'The backup operation could not be completed.', credentials: 'Check the backup password and target credentials.', invalidTarget: 'The backup target settings are invalid.', integrity: 'Backup integrity could not be verified. Select another backup or target.', selection: 'Select an available backup or file.', limit: 'The backup exceeds a supported size or count limit.', transport: 'The backup target could not be reached. Check its connection and access.' },
  'de-DE': { generic: 'Der Sicherungsvorgang konnte nicht abgeschlossen werden.', credentials: 'Prüfen Sie das Sicherungspasswort und die Zugangsdaten des Ziels.', invalidTarget: 'Die Einstellungen des Sicherungsziels sind ungültig.', integrity: 'Die Integrität der Sicherung konnte nicht bestätigt werden. Wählen Sie eine andere Sicherung oder ein anderes Ziel.', selection: 'Wählen Sie eine verfügbare Sicherung oder Datei aus.', limit: 'Die Sicherung überschreitet eine unterstützte Größen- oder Mengenbegrenzung.', transport: 'Das Sicherungsziel ist nicht erreichbar. Prüfen Sie Verbindung und Zugriff.' },
  'es-ES': { generic: 'No se pudo completar la operación de copia de seguridad.', credentials: 'Comprueba la contraseña y las credenciales del destino.', invalidTarget: 'La configuración del destino de copia no es válida.', integrity: 'No se pudo verificar la integridad de la copia. Selecciona otra copia o destino.', selection: 'Selecciona una copia o un archivo disponible.', limit: 'La copia supera un límite compatible de tamaño o cantidad.', transport: 'No se pudo acceder al destino. Comprueba la conexión y el acceso.' },
  'it-IT': { generic: 'Impossibile completare l’operazione di backup.', credentials: 'Controlla la password di backup e le credenziali della destinazione.', invalidTarget: 'Le impostazioni della destinazione di backup non sono valide.', integrity: 'Impossibile verificare l’integrità del backup. Seleziona un altro backup o una destinazione diversa.', selection: 'Seleziona un backup o un file disponibile.', limit: 'Il backup supera un limite supportato di dimensione o quantità.', transport: 'Impossibile raggiungere la destinazione di backup. Controlla connessione e accesso.' },
  'ja-JP': { generic: 'バックアップ処理を完了できませんでした。', credentials: 'バックアップのパスワードと保存先の認証情報を確認してください。', invalidTarget: 'バックアップ先の設定が無効です。', integrity: 'バックアップの整合性を確認できませんでした。別のバックアップまたは保存先を選択してください。', selection: '利用可能なバックアップまたはファイルを選択してください。', limit: 'バックアップが対応するサイズまたは件数の上限を超えています。', transport: 'バックアップ先に接続できません。接続とアクセス権を確認してください。' },
  'ru-RU': { generic: 'Не удалось завершить операцию резервного копирования.', credentials: 'Проверьте пароль резервной копии и учетные данные хранилища.', invalidTarget: 'Параметры хранилища резервных копий недействительны.', integrity: 'Не удалось проверить целостность резервной копии. Выберите другую копию или хранилище.', selection: 'Выберите доступную резервную копию или файл.', limit: 'Резервная копия превышает допустимый размер или количество объектов.', transport: 'Не удалось подключиться к хранилищу резервных копий. Проверьте соединение и доступ.' },
  'zh-CN': { generic: '无法完成备份操作。', credentials: '请检查备份密码和目标凭据。', invalidTarget: '备份目标设置无效。', integrity: '无法验证备份完整性。请选择其他备份或目标。', selection: '请选择可用的备份或文件。', limit: '备份超出支持的大小或数量限制。', transport: '无法连接备份目标。请检查连接和访问权限。' },
} as const satisfies Readonly<Record<WorkspaceLocale, Record<string, string>>>;

type ErrorKind = keyof typeof COPY['en-US'];

export function vaultBackupEngineErrorText(error: unknown, locale: WorkspaceLocale): string {
  const message = error instanceof Error ? error.message : '';
  const codeMatch = message.match(/(?:vault_backup_[a-z0-9_]+|(?:read|write|delete)_http_\d{3})/u);
  const code = codeMatch?.[0] ?? '';
  let kind: ErrorKind = 'generic';
  if (/password_required|credentials_incomplete|key_mode_mismatch/u.test(code)) kind = 'credentials';
  else if (/integrity|digest_failed|chain_broken|manifest_mismatch|package_mismatch|catalog_invalid|payload_integrity|verify_/u.test(code)) kind = 'integrity';
  else if (/size|count_limit|chain_limit|depth_limit|catalog_cycle/u.test(code)) kind = 'limit';
  else if (/selection|missing|empty/u.test(code)) kind = 'selection';
  else if (/target_|kind_invalid|format_invalid|metadata_invalid|transport_invalid|airgap_network/u.test(code)) kind = 'invalidTarget';
  else if (/webdav_|_http_\d{3}|netgate|transport|schedule_/u.test(code)) kind = 'transport';
  return COPY[locale][kind];
}

export const VAULT_BACKUP_ENGINE_ERROR_COPY = COPY;
