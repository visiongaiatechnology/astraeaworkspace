// STATUS: PLATIN — BATCH-CONNECT-7: the second Connect copy catalog for the account, sync, queue and
// notification surfaces. It lives beside the original catalog instead of extending it, because the
// seven original entries are single 1.6–2.7 kB lines and grew past the readable length limit.
//
// Every string here describes a *state*, never an optimistic outcome: "keine Verbindung" (no
// connection), "nicht geprüft" (not verified), "in der Warteschlange" (queued).

import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { ConnectConnectionState } from '../domain/types';

export interface ConnectExtraCopy {
  /** Account settings dialog. */
  readonly accountSettings: string;
  readonly close: string;
  readonly accountTitle: string;
  readonly accountEmpty: string;
  readonly accountName: string;
  readonly accountAddress: string;
  readonly accountHost: string;
  readonly accountPort: string;
  readonly accountUsername: string;
  readonly accountPassword: string;
  readonly accountPasswordNote: string;
  readonly accountSave: string;
  readonly accountTestTls: string;
  readonly accountTlsUnchecked: string;
  readonly accountTlsTrusted: string;
  readonly accountTlsFailed: string;
  readonly accountBlocked: (code: string) => string;
  readonly accountError: (code: string) => string;
  readonly passwordRequired: string;
  /** Connection status. No green dot without a transport. */
  readonly statusDisconnected: string;
  readonly statusConnecting: string;
  readonly statusConnected: string;
  readonly statusFailed: (code: string) => string;
  readonly statusNeverAttempted: string;
  readonly statusAdapter: (adapter: string) => string;
  readonly statusCheckedAt: (time: string) => string;
  /** Sync. */
  readonly syncNow: string;
  readonly syncRunning: string;
  readonly syncNever: string;
  readonly syncProgress: (applied: number, total: number) => string;
  readonly syncDone: (folders: number) => string;
  readonly syncPartial: (applied: number, total: number) => string;
  readonly syncConflict: (count: number) => string;
  readonly syncNoCapability: string;
  /** Queue / outbox. */
  readonly queueTitle: string;
  readonly queueEmpty: string;
  readonly queueRelease: string;
  readonly queueNoTransport: string;
  readonly queueAttempts: (attempts: number) => string;
  readonly queueLastError: (code: string) => string;
  readonly queueFailed: string;
  readonly queueRetry: string;
  /** Compose extras. */
  readonly saveDraft: string;
  readonly draftSaved: string;
  readonly attachFile: string;
  readonly attachmentRejected: (code: string) => string;
  readonly replyAll: string;
  readonly replyNotPossible: string;
  readonly composeUnsentNote: string;
  /** Folders, labels, rules. */
  readonly manageFolders: string;
  readonly newFolder: string;
  readonly moveTo: string;
  readonly markUnread: string;
  readonly markRead: string;
  readonly movedTo: (folder: string) => string;
  readonly ruleUnresolved: (code: string) => string;
  readonly spamAdvisory: (level: string) => string;
  readonly noAutoDelete: string;
  /** Notifications. */
  readonly notifications: string;
  readonly notificationsEmpty: string;
  readonly notificationsSuppressed: (count: number) => string;
  readonly markAllRead: string;
  readonly quietHours: (from: string, to: string) => string;
  /** IMAP folder names. */
  readonly folderTrash: string;
  /** A typed-in fingerprint is stored, never verified; the label must say which. */
  readonly fingerprintStoredNotVerified: string;
  readonly folderJunk: string;
}

const COPY: Readonly<Record<WorkspaceLocale, ConnectExtraCopy>> = {
  'de-DE': {
    close: 'Abbrechen', accountSettings: 'E-Mail-Konto einrichten', accountTitle: 'Lokales IMAP-Konto', accountEmpty: 'Es ist noch kein Konto eingerichtet. Solange kein Konto und kein Transport verbunden ist, werden keine Nachrichten abgerufen oder gesendet.',
    accountName: 'Anzeigename', accountAddress: 'E-Mail-Adresse', accountHost: 'IMAP-Server', accountPort: 'Port', accountUsername: 'Benutzername', accountPassword: 'Passwort/Token',
    accountPasswordNote: 'Das Geheimnis wird ausschließlich im KeyVault abgelegt. Im Workspace-Dokument steht nur eine Referenz.', accountSave: 'Konto anlegen', accountTestTls: 'TLS prüfen',
    accountTlsUnchecked: 'TLS nicht geprüft', accountTlsTrusted: 'TLS-Zertifikat geprüft', accountTlsFailed: 'TLS-Prüfung fehlgeschlagen', accountBlocked: code => `Konto kann hier nicht aktiviert werden (${code}).`,
    accountError: code => `Eingabe ungültig: ${code}`, passwordRequired: 'Passwort/Token erforderlich',
    statusDisconnected: 'Keine Verbindung', statusConnecting: 'Verbindung wird aufgebaut', statusConnected: 'Verbunden', statusFailed: code => `Verbindung fehlgeschlagen (${code})`, statusNeverAttempted: 'Verbindung nie geprüft',
    statusAdapter: adapter => `Transport: ${adapter}`, statusCheckedAt: time => `Geprüft: ${time}`,
    syncNow: 'Posteingang synchronisieren', syncRunning: 'Synchronisierung läuft', syncNever: 'Noch nie synchronisiert', syncProgress: (applied, total) => `${applied} von ${total} Nachrichten übernommen`,
    syncDone: folders => `Synchronisiert: ${folders} Ordner`, syncPartial: (applied, total) => `Teilweise übernommen: ${applied} von ${total}`, syncConflict: count => `${count} Konflikte offen`, syncNoCapability: 'Kein Transport verbunden — es wird nichts abgerufen.',
    queueTitle: 'Warteschlange', queueEmpty: 'Keine offenen Sendungen.', queueRelease: 'Jetzt senden versuchen', queueNoTransport: 'Kein Transport verbunden — die Nachricht bleibt in der Warteschlange.',
    queueAttempts: attempts => `Versuche: ${attempts}`, queueLastError: code => `Letzter Fehler: ${code}`, queueFailed: 'Endgültig fehlgeschlagen', queueRetry: 'Erneut versuchen',
    saveDraft: 'Als Entwurf sichern', draftSaved: 'Entwurf gesichert', attachFile: 'Anhang hinzufügen', attachmentRejected: code => `Anhang abgelehnt: ${code}`,
    replyAll: 'Allen antworten', replyNotPossible: 'Antwort nicht möglich: Die Nachricht hat keine gültige Message-ID.', composeUnsentNote: 'Diese Nachricht wird nur in die Warteschlange gelegt — sie ist nicht gesendet und nicht verschlüsselt.',
    manageFolders: 'Ordner und Labels', newFolder: 'Neuer Ordner', moveTo: 'Verschieben nach', markUnread: 'Als ungelesen markieren', markRead: 'Als gelesen markieren',
    movedTo: folder => `Verschoben nach ${folder}`, ruleUnresolved: code => `Regel nicht angewendet: ${code}`, spamAdvisory: level => `Spamhinweis: ${level}`, noAutoDelete: 'Regeln löschen niemals automatisch.',
    notifications: 'Benachrichtigungen', notificationsEmpty: 'Keine neuen Benachrichtigungen.', notificationsSuppressed: count => `${count} während der Ruhezeit zurückgehalten`, markAllRead: 'Alle als gelesen markieren', quietHours: (from, to) => `Ruhezeit ${from}–${to}`,
    folderTrash: 'Papierkorb', folderJunk: 'Spam', fingerprintStoredNotVerified: 'Der Fingerabdruck wird gespeichert, nicht geprüft.',
  },
  'en-US': {
    close: 'Cancel', accountSettings: 'Set up mail account', accountTitle: 'Local IMAP account', accountEmpty: 'No account is configured yet. Until an account and a transport are connected, no message is fetched or sent.',
    accountName: 'Display name', accountAddress: 'Mail address', accountHost: 'IMAP server', accountPort: 'Port', accountUsername: 'User name', accountPassword: 'Password/token',
    accountPasswordNote: 'The secret is stored in the KeyVault only. The workspace document holds a reference, never the secret.', accountSave: 'Create account', accountTestTls: 'Check TLS',
    accountTlsUnchecked: 'TLS not checked', accountTlsTrusted: 'TLS certificate checked', accountTlsFailed: 'TLS check failed', accountBlocked: code => `The account cannot be activated here (${code}).`,
    accountError: code => `Invalid input: ${code}`, passwordRequired: 'Password/token required',
    statusDisconnected: 'Not connected', statusConnecting: 'Connecting', statusConnected: 'Connected', statusFailed: code => `Connection failed (${code})`, statusNeverAttempted: 'Connection never checked',
    statusAdapter: adapter => `Transport: ${adapter}`, statusCheckedAt: time => `Checked: ${time}`,
    syncNow: 'Synchronise inbox', syncRunning: 'Synchronising', syncNever: 'Never synchronised', syncProgress: (applied, total) => `${applied} of ${total} messages applied`,
    syncDone: folders => `Synchronised: ${folders} folders`, syncPartial: (applied, total) => `Partially applied: ${applied} of ${total}`, syncConflict: count => `${count} unresolved conflicts`, syncNoCapability: 'No transport connected — nothing is fetched.',
    queueTitle: 'Queue', queueEmpty: 'Nothing pending.', queueRelease: 'Try to send now', queueNoTransport: 'No transport connected — the message stays in the queue.',
    queueAttempts: attempts => `Attempts: ${attempts}`, queueLastError: code => `Last error: ${code}`, queueFailed: 'Failed permanently', queueRetry: 'Retry',
    saveDraft: 'Save as draft', draftSaved: 'Draft saved', attachFile: 'Add attachment', attachmentRejected: code => `Attachment rejected: ${code}`,
    replyAll: 'Reply all', replyNotPossible: 'Cannot reply: the message has no valid Message-ID.', composeUnsentNote: 'This message is only queued — it is not sent and not encrypted.',
    manageFolders: 'Folders and labels', newFolder: 'New folder', moveTo: 'Move to', markUnread: 'Mark as unread', markRead: 'Mark as read',
    movedTo: folder => `Moved to ${folder}`, ruleUnresolved: code => `Rule not applied: ${code}`, spamAdvisory: level => `Spam advisory: ${level}`, noAutoDelete: 'Rules never delete automatically.',
    notifications: 'Notifications', notificationsEmpty: 'No new notifications.', notificationsSuppressed: count => `${count} held back during quiet hours`, markAllRead: 'Mark all as read', quietHours: (from, to) => `Quiet hours ${from}–${to}`,
    folderTrash: 'Trash', folderJunk: 'Junk', fingerprintStoredNotVerified: 'The fingerprint is stored, not verified.',
  },
  'ru-RU': {
    close: 'Отмена', accountSettings: 'Настроить почтовый аккаунт', accountTitle: 'Локальный аккаунт IMAP', accountEmpty: 'Аккаунт ещё не настроен. Пока аккаунт и транспорт не подключены, сообщения не загружаются и не отправляются.',
    accountName: 'Отображаемое имя', accountAddress: 'Адрес почты', accountHost: 'Сервер IMAP', accountPort: 'Порт', accountUsername: 'Имя пользователя', accountPassword: 'Пароль/токен',
    accountPasswordNote: 'Секрет хранится только в KeyVault. В документе рабочего пространства находится ссылка, а не секрет.', accountSave: 'Создать аккаунт', accountTestTls: 'Проверить TLS',
    accountTlsUnchecked: 'TLS не проверен', accountTlsTrusted: 'Сертификат TLS проверен', accountTlsFailed: 'Проверка TLS не удалась', accountBlocked: code => `Аккаунт нельзя активировать здесь (${code}).`,
    accountError: code => `Недопустимый ввод: ${code}`, passwordRequired: 'Требуется пароль/токен',
    statusDisconnected: 'Нет подключения', statusConnecting: 'Подключение', statusConnected: 'Подключено', statusFailed: code => `Сбой подключения (${code})`, statusNeverAttempted: 'Подключение не проверялось',
    statusAdapter: adapter => `Транспорт: ${adapter}`, statusCheckedAt: time => `Проверено: ${time}`,
    syncNow: 'Синхронизировать входящие', syncRunning: 'Синхронизация', syncNever: 'Синхронизация не выполнялась', syncProgress: (applied, total) => `${applied} из ${total} сообщений принято`,
    syncDone: folders => `Синхронизировано папок: ${folders}`, syncPartial: (applied, total) => `Частично принято: ${applied} из ${total}`, syncConflict: count => `Открытых конфликтов: ${count}`, syncNoCapability: 'Транспорт не подключён — ничего не загружается.',
    queueTitle: 'Очередь', queueEmpty: 'Нет ожидающих отправок.', queueRelease: 'Попробовать отправить сейчас', queueNoTransport: 'Транспорт не подключён — сообщение остаётся в очереди.',
    queueAttempts: attempts => `Попыток: ${attempts}`, queueLastError: code => `Последняя ошибка: ${code}`, queueFailed: 'Окончательно не удалось', queueRetry: 'Повторить',
    saveDraft: 'Сохранить как черновик', draftSaved: 'Черновик сохранён', attachFile: 'Добавить вложение', attachmentRejected: code => `Вложение отклонено: ${code}`,
    replyAll: 'Ответить всем', replyNotPossible: 'Ответ невозможен: у сообщения нет корректного Message-ID.', composeUnsentNote: 'Это сообщение только в очереди — оно не отправлено и не зашифровано.',
    manageFolders: 'Папки и метки', newFolder: 'Новая папка', moveTo: 'Переместить в', markUnread: 'Отметить как непрочитанное', markRead: 'Отметить как прочитанное',
    movedTo: folder => `Перемещено в ${folder}`, ruleUnresolved: code => `Правило не применено: ${code}`, spamAdvisory: level => `Предупреждение о спаме: ${level}`, noAutoDelete: 'Правила никогда не удаляют автоматически.',
    notifications: 'Уведомления', notificationsEmpty: 'Новых уведомлений нет.', notificationsSuppressed: count => `${count} удержано в тихие часы`, markAllRead: 'Отметить все как прочитанные', quietHours: (from, to) => `Тихие часы ${from}–${to}`,
    folderTrash: 'Корзина', folderJunk: 'Спам', fingerprintStoredNotVerified: 'Отпечаток сохраняется, но не проверяется.',
  },
  'it-IT': {
    close: 'Annulla', accountSettings: 'Configura account di posta', accountTitle: 'Account IMAP locale', accountEmpty: 'Nessun account è configurato. Finché account e trasporto non sono connessi, nessun messaggio viene scaricato o inviato.',
    accountName: 'Nome visualizzato', accountAddress: 'Indirizzo e-mail', accountHost: 'Server IMAP', accountPort: 'Porta', accountUsername: 'Nome utente', accountPassword: 'Password/token',
    accountPasswordNote: 'Il segreto è archiviato solo nel KeyVault. Il documento del workspace contiene un riferimento, non il segreto.', accountSave: 'Crea account', accountTestTls: 'Verifica TLS',
    accountTlsUnchecked: 'TLS non verificato', accountTlsTrusted: 'Certificato TLS verificato', accountTlsFailed: 'Verifica TLS non riuscita', accountBlocked: code => `L’account non può essere attivato qui (${code}).`,
    accountError: code => `Input non valido: ${code}`, passwordRequired: 'Password/token richiesti',
    statusDisconnected: 'Non connesso', statusConnecting: 'Connessione in corso', statusConnected: 'Connesso', statusFailed: code => `Connessione non riuscita (${code})`, statusNeverAttempted: 'Connessione mai verificata',
    statusAdapter: adapter => `Trasporto: ${adapter}`, statusCheckedAt: time => `Verificato: ${time}`,
    syncNow: 'Sincronizza posta in arrivo', syncRunning: 'Sincronizzazione', syncNever: 'Mai sincronizzato', syncProgress: (applied, total) => `${applied} di ${total} messaggi applicati`,
    syncDone: folders => `Sincronizzate: ${folders} cartelle`, syncPartial: (applied, total) => `Applicati parzialmente: ${applied} di ${total}`, syncConflict: count => `${count} conflitti aperti`, syncNoCapability: 'Nessun trasporto connesso — non viene scaricato nulla.',
    queueTitle: 'Coda', queueEmpty: 'Nessun invio in attesa.', queueRelease: 'Prova a inviare ora', queueNoTransport: 'Nessun trasporto connesso — il messaggio resta in coda.',
    queueAttempts: attempts => `Tentativi: ${attempts}`, queueLastError: code => `Ultimo errore: ${code}`, queueFailed: 'Fallito definitivamente', queueRetry: 'Riprova',
    saveDraft: 'Salva come bozza', draftSaved: 'Bozza salvata', attachFile: 'Aggiungi allegato', attachmentRejected: code => `Allegato rifiutato: ${code}`,
    replyAll: 'Rispondi a tutti', replyNotPossible: 'Impossibile rispondere: il messaggio non ha un Message-ID valido.', composeUnsentNote: 'Questo messaggio è solo in coda — non è inviato e non è cifrato.',
    manageFolders: 'Cartelle ed etichette', newFolder: 'Nuova cartella', moveTo: 'Sposta in', markUnread: 'Segna come non letto', markRead: 'Segna come letto',
    movedTo: folder => `Spostato in ${folder}`, ruleUnresolved: code => `Regola non applicata: ${code}`, spamAdvisory: level => `Avviso spam: ${level}`, noAutoDelete: 'Le regole non eliminano mai automaticamente.',
    notifications: 'Notifiche', notificationsEmpty: 'Nessuna nuova notifica.', notificationsSuppressed: count => `${count} trattenute durante le ore di silenzio`, markAllRead: 'Segna tutte come lette', quietHours: (from, to) => `Ore di silenzio ${from}–${to}`,
    folderTrash: 'Cestino', folderJunk: 'Spam', fingerprintStoredNotVerified: 'L’impronta viene memorizzata, non verificata.',
  },
  'es-ES': {
    close: 'Cancelar', accountSettings: 'Configurar cuenta de correo', accountTitle: 'Cuenta IMAP local', accountEmpty: 'Aún no hay ninguna cuenta configurada. Hasta que una cuenta y un transporte estén conectados, no se descarga ni se envía nada.',
    accountName: 'Nombre visible', accountAddress: 'Dirección de correo', accountHost: 'Servidor IMAP', accountPort: 'Puerto', accountUsername: 'Usuario', accountPassword: 'Contraseña/token',
    accountPasswordNote: 'El secreto se guarda solo en el KeyVault. El documento del espacio de trabajo contiene una referencia, no el secreto.', accountSave: 'Crear cuenta', accountTestTls: 'Comprobar TLS',
    accountTlsUnchecked: 'TLS sin comprobar', accountTlsTrusted: 'Certificado TLS comprobado', accountTlsFailed: 'Comprobación TLS fallida', accountBlocked: code => `La cuenta no se puede activar aquí (${code}).`,
    accountError: code => `Entrada no válida: ${code}`, passwordRequired: 'Se requiere contraseña/token',
    statusDisconnected: 'Sin conexión', statusConnecting: 'Conectando', statusConnected: 'Conectado', statusFailed: code => `Conexión fallida (${code})`, statusNeverAttempted: 'Conexión nunca comprobada',
    statusAdapter: adapter => `Transporte: ${adapter}`, statusCheckedAt: time => `Comprobado: ${time}`,
    syncNow: 'Sincronizar bandeja de entrada', syncRunning: 'Sincronizando', syncNever: 'Nunca sincronizado', syncProgress: (applied, total) => `${applied} de ${total} mensajes aplicados`,
    syncDone: folders => `Sincronizadas: ${folders} carpetas`, syncPartial: (applied, total) => `Aplicados parcialmente: ${applied} de ${total}`, syncConflict: count => `${count} conflictos abiertos`, syncNoCapability: 'Ningún transporte conectado: no se descarga nada.',
    queueTitle: 'Cola', queueEmpty: 'Nada pendiente.', queueRelease: 'Intentar enviar ahora', queueNoTransport: 'Ningún transporte conectado: el mensaje permanece en la cola.',
    queueAttempts: attempts => `Intentos: ${attempts}`, queueLastError: code => `Último error: ${code}`, queueFailed: 'Falló definitivamente', queueRetry: 'Reintentar',
    saveDraft: 'Guardar como borrador', draftSaved: 'Borrador guardado', attachFile: 'Añadir adjunto', attachmentRejected: code => `Adjunto rechazado: ${code}`,
    replyAll: 'Responder a todos', replyNotPossible: 'No se puede responder: el mensaje no tiene un Message-ID válido.', composeUnsentNote: 'Este mensaje solo está en cola: no se envió ni se cifró.',
    manageFolders: 'Carpetas y etiquetas', newFolder: 'Nueva carpeta', moveTo: 'Mover a', markUnread: 'Marcar como no leído', markRead: 'Marcar como leído',
    movedTo: folder => `Movido a ${folder}`, ruleUnresolved: code => `Regla no aplicada: ${code}`, spamAdvisory: level => `Aviso de spam: ${level}`, noAutoDelete: 'Las reglas nunca eliminan automáticamente.',
    notifications: 'Notificaciones', notificationsEmpty: 'No hay notificaciones nuevas.', notificationsSuppressed: count => `${count} retenidas durante las horas de silencio`, markAllRead: 'Marcar todas como leídas', quietHours: (from, to) => `Horas de silencio ${from}–${to}`,
    folderTrash: 'Papelera', folderJunk: 'Spam', fingerprintStoredNotVerified: 'La huella se guarda, no se verifica.',
  },
  'ja-JP': {
    close: 'キャンセル', accountSettings: 'メールアカウントを設定', accountTitle: 'ローカル IMAP アカウント', accountEmpty: 'アカウントはまだ設定されていません。アカウントとトランスポートが接続されるまで、メッセージの取得も送信も行いません。',
    accountName: '表示名', accountAddress: 'メールアドレス', accountHost: 'IMAP サーバー', accountPort: 'ポート', accountUsername: 'ユーザー名', accountPassword: 'パスワード/トークン',
    accountPasswordNote: '秘密情報は KeyVault にのみ保存されます。ワークスペース文書には参照だけが入ります。', accountSave: 'アカウントを作成', accountTestTls: 'TLS を確認',
    accountTlsUnchecked: 'TLS 未確認', accountTlsTrusted: 'TLS 証明書を確認済み', accountTlsFailed: 'TLS 確認に失敗', accountBlocked: code => `この環境ではアカウントを有効化できません (${code})。`,
    accountError: code => `入力が無効です: ${code}`, passwordRequired: 'パスワード/トークンが必要です',
    statusDisconnected: '未接続', statusConnecting: '接続中', statusConnected: '接続済み', statusFailed: code => `接続に失敗 (${code})`, statusNeverAttempted: '接続は未確認',
    statusAdapter: adapter => `トランスポート: ${adapter}`, statusCheckedAt: time => `確認: ${time}`,
    syncNow: '受信トレイを同期', syncRunning: '同期中', syncNever: '同期は未実施', syncProgress: (applied, total) => `${total} 件中 ${applied} 件を反映`,
    syncDone: folders => `同期完了: ${folders} フォルダ`, syncPartial: (applied, total) => `一部反映: ${total} 件中 ${applied} 件`, syncConflict: count => `未解決の競合 ${count} 件`, syncNoCapability: 'トランスポートが未接続のため取得しません。',
    queueTitle: '送信待ち', queueEmpty: '保留中の送信はありません。', queueRelease: '今すぐ送信を試す', queueNoTransport: 'トランスポートが未接続のため、メッセージは送信待ちに残ります。',
    queueAttempts: attempts => `試行回数: ${attempts}`, queueLastError: code => `最後のエラー: ${code}`, queueFailed: '恒久的に失敗', queueRetry: '再試行',
    saveDraft: '下書きとして保存', draftSaved: '下書きを保存しました', attachFile: '添付を追加', attachmentRejected: code => `添付を拒否しました: ${code}`,
    replyAll: '全員に返信', replyNotPossible: '返信できません: 有効な Message-ID がありません。', composeUnsentNote: 'このメッセージは送信待ちのみで、送信も暗号化もされていません。',
    manageFolders: 'フォルダとラベル', newFolder: '新しいフォルダ', moveTo: '移動先', markUnread: '未読にする', markRead: '既読にする',
    movedTo: folder => `${folder} に移動しました`, ruleUnresolved: code => `ルール未適用: ${code}`, spamAdvisory: level => `スパム警告: ${level}`, noAutoDelete: 'ルールが自動で削除することはありません。',
    notifications: '通知', notificationsEmpty: '新しい通知はありません。', notificationsSuppressed: count => `静かな時間帯に ${count} 件を保留`, markAllRead: 'すべて既読にする', quietHours: (from, to) => `静かな時間帯 ${from}–${to}`,
    folderTrash: 'ゴミ箱', folderJunk: '迷惑メール', fingerprintStoredNotVerified: 'フィンガープリントは保存されるだけで、検証はされません。',
  },
  'zh-CN': {
    close: '取消', accountSettings: '设置邮件账户', accountTitle: '本地 IMAP 账户', accountEmpty: '尚未配置账户。在账户与传输通道连接之前，不会收取或发送任何邮件。',
    accountName: '显示名称', accountAddress: '邮箱地址', accountHost: 'IMAP 服务器', accountPort: '端口', accountUsername: '用户名', accountPassword: '密码/令牌',
    accountPasswordNote: '机密仅保存在 KeyVault 中。工作区文档里只有引用，没有机密本身。', accountSave: '创建账户', accountTestTls: '检查 TLS',
    accountTlsUnchecked: 'TLS 未检查', accountTlsTrusted: 'TLS 证书已检查', accountTlsFailed: 'TLS 检查失败', accountBlocked: code => `无法在此处激活账户（${code}）。`,
    accountError: code => `输入无效：${code}`, passwordRequired: '需要密码/令牌',
    statusDisconnected: '未连接', statusConnecting: '正在连接', statusConnected: '已连接', statusFailed: code => `连接失败（${code}）`, statusNeverAttempted: '从未检查连接',
    statusAdapter: adapter => `传输通道：${adapter}`, statusCheckedAt: time => `检查时间：${time}`,
    syncNow: '同步收件箱', syncRunning: '正在同步', syncNever: '从未同步', syncProgress: (applied, total) => `已应用 ${applied}/${total} 封邮件`,
    syncDone: folders => `已同步 ${folders} 个文件夹`, syncPartial: (applied, total) => `部分应用：${applied}/${total}`, syncConflict: count => `${count} 个未解决冲突`, syncNoCapability: '未连接传输通道——不会收取任何内容。',
    queueTitle: '发送队列', queueEmpty: '没有待发送的邮件。', queueRelease: '尝试立即发送', queueNoTransport: '未连接传输通道——邮件会留在队列中。',
    queueAttempts: attempts => `尝试次数：${attempts}`, queueLastError: code => `最后的错误：${code}`, queueFailed: '永久失败', queueRetry: '重试',
    saveDraft: '保存为草稿', draftSaved: '草稿已保存', attachFile: '添加附件', attachmentRejected: code => `附件被拒绝：${code}`,
    replyAll: '全部回复', replyNotPossible: '无法回复：该邮件没有有效的 Message-ID。', composeUnsentNote: '此邮件仅在队列中——未发送，也未加密。',
    manageFolders: '文件夹和标签', newFolder: '新建文件夹', moveTo: '移动到', markUnread: '标记为未读', markRead: '标记为已读',
    movedTo: folder => `已移动到 ${folder}`, ruleUnresolved: code => `规则未应用：${code}`, spamAdvisory: level => `垃圾邮件提示：${level}`, noAutoDelete: '规则永不自动删除邮件。',
    notifications: '通知', notificationsEmpty: '没有新通知。', notificationsSuppressed: count => `静音时段内保留了 ${count} 条`, markAllRead: '全部标记为已读', quietHours: (from, to) => `静音时段 ${from}–${to}`,
    folderTrash: '废纸篓', folderJunk: '垃圾邮件', fingerprintStoredNotVerified: '指纹仅被保存，未经验证。',
  },
};

export function connectExtraCopy(locale: WorkspaceLocale): ConnectExtraCopy {
  return COPY[locale];
}

export function useConnectExtraCopy(): ConnectExtraCopy {
  const { locale } = useWorkspaceLocale();
  return connectExtraCopy(locale);
}

/**
 * The single source for the connection-status word. A hardcoded green dot with a fixed address
 * (`ConnectSidebar.tsx:169` before BATCH-CONNECT-7) is not representable through this function: an
 * unknown state always yields the "never checked" wording.
 */
export function connectionStatusText(copy: ConnectExtraCopy, connection: ConnectConnectionState | undefined): string {
  if (!connection) return copy.statusNeverAttempted;
  if (connection.status === 'connected') return copy.statusConnected;
  if (connection.status === 'connecting') return copy.statusConnecting;
  if (connection.status === 'failed') return copy.statusFailed(connection.code ?? 'unknown');
  return copy.statusDisconnected;
}
