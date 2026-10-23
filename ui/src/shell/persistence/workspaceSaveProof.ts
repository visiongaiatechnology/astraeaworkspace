// STATUS: PLATIN — release blocker #1: the shell's save status must say **what** was saved.
//
// Until Beta 0.1 a status of "Gespeichert" only meant that an IndexedDB transaction committed. Now the
// status carries a proof: a confirmed native document file (`doc-<hash>.vwc` with SHA-256/size from the
// desktop store) or the browser cache (no real file exists). The copy below names both cases in every
// supported locale and never claims a file that was not confirmed.
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';
import type { WorkspaceSaveFailureDetail } from './workspaceSaveFailure';
import type {
  WorkspaceSaveBrowserProof,
  WorkspaceSaveFileProof,
  WorkspaceSaveProof,
} from '../../platform/workspace/persistence/workspaceFilePersistence';

export type { WorkspaceSaveBrowserProof, WorkspaceSaveFileProof, WorkspaceSaveProof };

/** Warnings that may accompany an otherwise confirmed save. */
export type WorkspaceSaveWarning = 'cache-stale' | 'recovery-unavailable';

export interface WorkspaceSaveProofCopy {
  /** "Gespeichert · Datei" — the confirmed real file. */
  readonly fileSuffix: string;
  /** "Gespeichert · Browser-Ablage" — cache only, explicitly not a file. */
  readonly browserSuffix: string;
  readonly fileTitle: (proof: WorkspaceSaveFileProof) => string;
  readonly browserTitle: string;
  readonly revealFolder: string;
  readonly revealFolderTitle: string;
  readonly saveAs: string;
  readonly retry: string;
  readonly warning: Readonly<Record<WorkspaceSaveWarning, string>>;
  readonly failure: Readonly<Record<WorkspaceSaveFailureDetail, string>>;
  readonly failureTitle: string;
  /** Warum trotz Fehler nichts verloren geht: der Dirty-State bleibt. */
  readonly failureHint: string;
  /** Startup found store files that need PIN/passphrase before they can be opened. */
  readonly lockedFilesFound: (count: number) => string;
  /** Startup found store files that failed verification — they were not resurrected. */
  readonly fileScanFailures: (count: number) => string;
  /** Startup found more store files than the bounded scan reads. */
  readonly fileScanTruncated: (count: number) => string;
  readonly savedFileToast: (fileName: string, sizeBytes: number) => string;
  readonly savedFileBatchToast: (count: number) => string;
  readonly savedBrowserToast: string;
  readonly saveAsSucceeded: (fileName: string) => string;
  readonly saveAsBrowserStarted: string;
  readonly storeUnavailableToast: string;
}

const COPY: Readonly<Record<WorkspaceLocale, WorkspaceSaveProofCopy>> = {
  'de-DE': {
    fileSuffix: 'Datei',
    browserSuffix: 'Browser-Ablage',
    fileTitle: (proof) => `Bestätigte Dokumentdatei: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} Bytes · SHA-256 ${proof.sha256.slice(0, 16)}… · zuletzt bestätigt ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'Nur Browser-Ablage: Es existiert keine echte Dokumentdatei. Für ein Datei-Backup die Desktop-App verwenden.',
    revealFolder: 'Ordner öffnen',
    revealFolderTitle: 'Den Ordner der bestätigten Workspace-Dateien öffnen',
    saveAs: 'Speichern unter…',
    retry: 'Erneut versuchen',
    warning: {
      'cache-stale': 'Datei bestätigt gespeichert; die Browser-Krächsicherung konnte nicht aktualisiert werden.',
      'recovery-unavailable': 'Datei bestätigt gespeichert; die zusätzliche Desktop-Wiederherstellung ist nicht verfügbar.',
    },
    failure: {
      'file-write-failed': 'Die Dokumentdatei konnte nicht geschrieben werden. Bitte Speicherplatz und Schreibrechte prüfen und erneut versuchen.',
      'file-verification-failed': 'Die Datei wurde geschrieben, aber die Bestätigung (Name, Größe oder SHA-256) stimmt nicht. Das Speichern gilt bewusst nicht als erfolgreich.',
      'document-id-rejected': 'Die Dokument-ID ist für die Dateiablage ungültig. Bitte das Dokument neu anlegen.',
      'store-unavailable': 'Die Desktop-Dateiablage antwortet nicht. Es wurde keine Datei bestätigt.',
      'container-pack-failed': 'Der verschlüsselte Container konnte nicht gepackt werden. Es wurde keine Datei geschrieben.',
      'credential-required': 'Für dieses Dokument fehlt PIN oder Passwort für den verschlüsselten Container.',
      'cache-write-failed': 'Die Browser-Krächsicherung konnte nicht geschrieben werden.',
    },
    failureTitle: 'Speichern fehlgeschlagen',
    failureHint: 'Die Änderungen bleiben erhalten und werden erneut versucht. Nichts gilt als gespeichert, solange die Datei nicht bestätigt ist.',
    lockedFilesFound: (count) => `${count} geschützte Dokumentdatei(en) gefunden — PIN oder Passwort wird beim Öffnen verlangt.`,
    fileScanFailures: (count) => `${count} Dokumentdatei(en) konnten nicht verifiziert werden und wurden nicht geladen.`,
    fileScanTruncated: (count) => `Es sind weitere Dokumentdateien vorhanden; geladen wurden die neuesten ${count}.`,
    savedFileToast: (fileName, sizeBytes) => `Bestätigt als Datei gespeichert: ${fileName} (${sizeBytes} Bytes).`,
    savedFileBatchToast: (count) => `${count} Dokument(e) als Datei bestätigt gespeichert.`,
    savedBrowserToast: 'Im Browser gespeichert — reine Browser-Ablage, kein echtes Datei-Backup.',
    saveAsSucceeded: (fileName) => `Container als Datei gespeichert und bestätigt: ${fileName}.`,
    saveAsBrowserStarted: 'Download angestoßen. Ob die Datei auf dem Datenträger liegt, kann der Browser nicht bestätigen.',
    storeUnavailableToast: 'Die Dateiablage ist nicht erreichbar; es wurde keine Dokumentdatei bestätigt.',
  },
  'en-US': {
    fileSuffix: 'file',
    browserSuffix: 'browser cache',
    fileTitle: (proof) => `Confirmed document file: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} bytes · SHA-256 ${proof.sha256.slice(0, 16)}… · last confirmed ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'Browser cache only: no real document file exists. Use the desktop app for a file backup.',
    revealFolder: 'Open folder',
    revealFolderTitle: 'Open the folder of confirmed Workspace files',
    saveAs: 'Save as…',
    retry: 'Retry',
    warning: {
      'cache-stale': 'File confirmed; the browser crash cache could not be updated.',
      'recovery-unavailable': 'File confirmed; the additional desktop recovery store is unavailable.',
    },
    failure: {
      'file-write-failed': 'The document file could not be written. Check free space and write permissions, then retry.',
      'file-verification-failed': 'The file was written, but its confirmation (name, size or SHA-256) does not match. This save is deliberately not counted as successful.',
      'document-id-rejected': 'The document id is invalid for the file store. Create the document again.',
      'store-unavailable': 'The desktop file store is not responding. No file was confirmed.',
      'container-pack-failed': 'The encrypted container could not be packed. No file was written.',
      'credential-required': 'A PIN or password is missing for this document’s encrypted container.',
      'cache-write-failed': 'The browser crash cache could not be written.',
    },
    failureTitle: 'Saving failed',
    failureHint: 'Your changes are kept and will be retried. Nothing counts as saved until the file is confirmed.',
    lockedFilesFound: (count) => `${count} protected document file(s) found — a PIN or password is required to open them.`,
    fileScanFailures: (count) => `${count} document file(s) failed verification and were not loaded.`,
    fileScanTruncated: (count) => `More document files exist; the newest ${count} were loaded.`,
    savedFileToast: (fileName, sizeBytes) => `Confirmed saved as file: ${fileName} (${sizeBytes} bytes).`,
    savedFileBatchToast: (count) => `${count} document(s) confirmed saved as files.`,
    savedBrowserToast: 'Saved in the browser — browser cache only, no real file backup.',
    saveAsSucceeded: (fileName) => `Container saved as file and confirmed: ${fileName}.`,
    saveAsBrowserStarted: 'Download started. The browser cannot confirm that the file reached the disk.',
    storeUnavailableToast: 'The file store is unavailable; no document file was confirmed.',
  },
  'ru-RU': {
    fileSuffix: 'файл',
    browserSuffix: 'кэш браузера',
    fileTitle: (proof) => `Подтверждённый файл документа: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} байт · SHA-256 ${proof.sha256.slice(0, 16)}… · подтверждён ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'Только кэш браузера: настоящего файла документа нет. Для резервной копии используйте настольное приложение.',
    revealFolder: 'Открыть папку',
    revealFolderTitle: 'Открыть папку подтверждённых файлов Workspace',
    saveAs: 'Сохранить как…',
    retry: 'Повторить',
    warning: {
      'cache-stale': 'Файл подтверждён; кэш браузера обновить не удалось.',
      'recovery-unavailable': 'Файл подтверждён; дополнительное восстановление настольного приложения недоступно.',
    },
    failure: {
      'file-write-failed': 'Не удалось записать файл документа. Проверьте место и права записи, затем повторите.',
      'file-verification-failed': 'Файл записан, но подтверждение (имя, размер или SHA-256) не совпадает. Сохранение намеренно не считается успешным.',
      'document-id-rejected': 'Идентификатор документа недопустим для файлового хранилища. Создайте документ заново.',
      'store-unavailable': 'Файловое хранилище настольного приложения не отвечает. Файл не подтверждён.',
      'container-pack-failed': 'Не удалось упаковать зашифрованный контейнер. Файл не записан.',
      'credential-required': 'Для зашифрованного контейнера документа отсутствует PIN или пароль.',
      'cache-write-failed': 'Не удалось записать кэш браузера.',
    },
    failureTitle: 'Сохранение не удалось',
    failureHint: 'Изменения сохраняются и будут повторены. Ничего не считается сохранённым, пока файл не подтверждён.',
    lockedFilesFound: (count) => `Найдено защищённых файлов документов: ${count} — для открытия нужен PIN или пароль.`,
    fileScanFailures: (count) => `Не удалось проверить файлов документов: ${count}; они не загружены.`,
    fileScanTruncated: (count) => `Есть ещё файлы документов; загружены новейшие ${count}.`,
    savedFileToast: (fileName, sizeBytes) => `Подтверждено сохранение файла: ${fileName} (${sizeBytes} байт).`,
    savedFileBatchToast: (count) => `Подтверждено сохранение файлов: ${count}.`,
    savedBrowserToast: 'Сохранено в браузере — только кэш браузера, без настоящего файла.',
    saveAsSucceeded: (fileName) => `Контейнер сохранён как файл и подтверждён: ${fileName}.`,
    saveAsBrowserStarted: 'Загрузка начата. Браузер не может подтвердить, что файл записан на диск.',
    storeUnavailableToast: 'Файловое хранилище недоступно; файл документа не подтверждён.',
  },
  'it-IT': {
    fileSuffix: 'file',
    browserSuffix: 'cache del browser',
    fileTitle: (proof) => `File del documento confermato: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} byte · SHA-256 ${proof.sha256.slice(0, 16)}… · confermato ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'Solo cache del browser: non esiste un vero file del documento. Per un backup su file usare l’app desktop.',
    revealFolder: 'Apri cartella',
    revealFolderTitle: 'Apre la cartella dei file Workspace confermati',
    saveAs: 'Salva con nome…',
    retry: 'Riprova',
    warning: {
      'cache-stale': 'File confermato; la cache del browser non è stata aggiornata.',
      'recovery-unavailable': 'File confermato; il ripristino desktop aggiuntivo non è disponibile.',
    },
    failure: {
      'file-write-failed': 'Impossibile scrivere il file del documento. Controllare spazio e permessi di scrittura, quindi riprovare.',
      'file-verification-failed': 'Il file è stato scritto, ma la conferma (nome, dimensione o SHA-256) non corrisponde. Il salvataggio non è considerato riuscito.',
      'document-id-rejected': 'L’ID del documento non è valido per l’archivio file. Ricreare il documento.',
      'store-unavailable': 'L’archivio file desktop non risponde. Nessun file è stato confermato.',
      'container-pack-failed': 'Impossibile creare il contenitore cifrato. Nessun file è stato scritto.',
      'credential-required': 'Manca un PIN o una password per il contenitore cifrato di questo documento.',
      'cache-write-failed': 'Impossibile scrivere la cache del browser.',
    },
    failureTitle: 'Salvataggio non riuscito',
    failureHint: 'Le modifiche restano e verranno ritentate. Nulla è considerato salvato finché il file non è confermato.',
    lockedFilesFound: (count) => `Trovati ${count} file di documento protetti — per aprirli serve un PIN o una password.`,
    fileScanFailures: (count) => `${count} file di documento non hanno superato la verifica e non sono stati caricati.`,
    fileScanTruncated: (count) => `Esistono altri file di documento; sono stati caricati i ${count} più recenti.`,
    savedFileToast: (fileName, sizeBytes) => `Confermato come file: ${fileName} (${sizeBytes} byte).`,
    savedFileBatchToast: (count) => `${count} documento/i confermati come file.`,
    savedBrowserToast: 'Salvato nel browser — solo cache del browser, nessun backup su file reale.',
    saveAsSucceeded: (fileName) => `Contenitore salvato come file e confermato: ${fileName}.`,
    saveAsBrowserStarted: 'Download avviato. Il browser non può confermare che il file sia stato scritto su disco.',
    storeUnavailableToast: 'L’archivio file non è disponibile; nessun file del documento è stato confermato.',
  },
  'es-ES': {
    fileSuffix: 'archivo',
    browserSuffix: 'caché del navegador',
    fileTitle: (proof) => `Archivo de documento confirmado: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} bytes · SHA-256 ${proof.sha256.slice(0, 16)}… · confirmado ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'Solo caché del navegador: no existe un archivo real del documento. Use la app de escritorio para una copia de seguridad.',
    revealFolder: 'Abrir carpeta',
    revealFolderTitle: 'Abrir la carpeta de archivos Workspace confirmados',
    saveAs: 'Guardar como…',
    retry: 'Reintentar',
    warning: {
      'cache-stale': 'Archivo confirmado; no se pudo actualizar la caché del navegador.',
      'recovery-unavailable': 'Archivo confirmado; la recuperación adicional de escritorio no está disponible.',
    },
    failure: {
      'file-write-failed': 'No se pudo escribir el archivo del documento. Revise el espacio y los permisos de escritura y reintente.',
      'file-verification-failed': 'El archivo se escribió, pero la confirmación (nombre, tamaño o SHA-256) no coincide. El guardado no se considera exitoso.',
      'document-id-rejected': 'El ID del documento no es válido para el almacén de archivos. Cree el documento de nuevo.',
      'store-unavailable': 'El almacén de archivos de escritorio no responde. No se confirmó ningún archivo.',
      'container-pack-failed': 'No se pudo empaquetar el contenedor cifrado. No se escribió ningún archivo.',
      'credential-required': 'Falta un PIN o una contraseña para el contenedor cifrado de este documento.',
      'cache-write-failed': 'No se pudo escribir la caché del navegador.',
    },
    failureTitle: 'Error al guardar',
    failureHint: 'Los cambios se conservan y se reintentarán. Nada cuenta como guardado hasta que el archivo esté confirmado.',
    lockedFilesFound: (count) => `Se encontraron ${count} archivo(s) de documento protegidos: se necesita PIN o contraseña para abrirlos.`,
    fileScanFailures: (count) => `${count} archivo(s) de documento no superaron la verificación y no se cargaron.`,
    fileScanTruncated: (count) => `Existen más archivos de documento; se cargaron los ${count} más recientes.`,
    savedFileToast: (fileName, sizeBytes) => `Guardado confirmado como archivo: ${fileName} (${sizeBytes} bytes).`,
    savedFileBatchToast: (count) => `${count} documento(s) confirmados como archivos.`,
    savedBrowserToast: 'Guardado en el navegador — solo caché del navegador, sin copia de archivo real.',
    saveAsSucceeded: (fileName) => `Contenedor guardado como archivo y confirmado: ${fileName}.`,
    saveAsBrowserStarted: 'Descarga iniciada. El navegador no puede confirmar que el archivo llegara al disco.',
    storeUnavailableToast: 'El almacén de archivos no está disponible; no se confirmó ningún archivo del documento.',
  },
  'ja-JP': {
    fileSuffix: 'ファイル',
    browserSuffix: 'ブラウザー保管',
    fileTitle: (proof) => `確認済みのドキュメントファイル: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} バイト · SHA-256 ${proof.sha256.slice(0, 16)}… · 最終確認 ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: 'ブラウザー保管のみ: 実際のドキュメントファイルは存在しません。ファイルのバックアップにはデスクトップアプリを使用してください。',
    revealFolder: 'フォルダーを開く',
    revealFolderTitle: '確認済み Workspace ファイルのフォルダーを開く',
    saveAs: '名前を付けて保存…',
    retry: '再試行',
    warning: {
      'cache-stale': 'ファイルは確認済みです。ブラウザーのクラッシュキャッシュを更新できませんでした。',
      'recovery-unavailable': 'ファイルは確認済みです。追加のデスクトップ復元は利用できません。',
    },
    failure: {
      'file-write-failed': 'ドキュメントファイルを書き込めませんでした。空き容量と書き込み権限を確認して再試行してください。',
      'file-verification-failed': 'ファイルは書き込まれましたが、確認（名前、サイズ、SHA-256）が一致しません。保存は成功として扱われません。',
      'document-id-rejected': 'ドキュメント ID がファイル保管に対して無効です。ドキュメントを新規作成してください。',
      'store-unavailable': 'デスクトップのファイル保管が応答しません。ファイルは確認されていません。',
      'container-pack-failed': '暗号化コンテナを作成できませんでした。ファイルは書き込まれていません。',
      'credential-required': 'このドキュメントの暗号化コンテナに PIN またはパスワードがありません。',
      'cache-write-failed': 'ブラウザーのクラッシュキャッシュを書き込めませんでした。',
    },
    failureTitle: '保存に失敗しました',
    failureHint: '変更は保持され、再試行されます。ファイルが確認されるまで保存済みとは見なしません。',
    lockedFilesFound: (count) => `保護されたドキュメントファイルが ${count} 件見つかりました。開くには PIN またはパスワードが必要です。`,
    fileScanFailures: (count) => `${count} 件のドキュメントファイルを検証できず、読み込みませんでした。`,
    fileScanTruncated: (count) => `さらにドキュメントファイルがあります。最新の ${count} 件を読み込みました。`,
    savedFileToast: (fileName, sizeBytes) => `ファイルとして確認済みで保存しました: ${fileName} (${sizeBytes} バイト)。`,
    savedFileBatchToast: (count) => `${count} 件のドキュメントをファイルとして確認済みで保存しました。`,
    savedBrowserToast: 'ブラウザーに保存しました — ブラウザー保管のみで、実ファイルのバックアップはありません。',
    saveAsSucceeded: (fileName) => `コンテナをファイルとして保存し確認しました: ${fileName}。`,
    saveAsBrowserStarted: 'ダウンロードを開始しました。ファイルがディスクに書き込まれたことをブラウザーは確認できません。',
    storeUnavailableToast: 'ファイル保管に接続できません。ドキュメントファイルは確認されていません。',
  },
  'zh-CN': {
    fileSuffix: '文件',
    browserSuffix: '浏览器存储',
    fileTitle: (proof) => `已确认的文档文件: ${proof.rootPath ? `${proof.rootPath}\\` : ''}${proof.fileName} · ${proof.sizeBytes} 字节 · SHA-256 ${proof.sha256.slice(0, 16)}… · 最后确认 ${new Date(proof.modifiedAtMs).toLocaleString()}`,
    browserTitle: '仅浏览器存储：不存在真实的文档文件。如需文件备份，请使用桌面应用。',
    revealFolder: '打开文件夹',
    revealFolderTitle: '打开已确认 Workspace 文件所在的文件夹',
    saveAs: '另存为…',
    retry: '重试',
    warning: {
      'cache-stale': '文件已确认；浏览器崩溃缓存无法更新。',
      'recovery-unavailable': '文件已确认；额外的桌面恢复不可用。',
    },
    failure: {
      'file-write-failed': '无法写入文档文件。请检查可用空间和写入权限后重试。',
      'file-verification-failed': '文件已写入，但确认信息（名称、大小或 SHA-256）不一致。此次保存不视为成功。',
      'document-id-rejected': '文档 ID 对文件存储无效。请重新创建文档。',
      'store-unavailable': '桌面文件存储无响应。未确认任何文件。',
      'container-pack-failed': '无法打包加密容器。未写入文件。',
      'credential-required': '此文档的加密容器缺少 PIN 或密码。',
      'cache-write-failed': '无法写入浏览器崩溃缓存。',
    },
    failureTitle: '保存失败',
    failureHint: '更改会保留并重试。在文件得到确认之前，不视为已保存。',
    lockedFilesFound: (count) => `发现 ${count} 个受保护的文档文件——打开时需要 PIN 或密码。`,
    fileScanFailures: (count) => `${count} 个文档文件未通过验证，未加载。`,
    fileScanTruncated: (count) => `还有更多文档文件；已加载最新的 ${count} 个。`,
    savedFileToast: (fileName, sizeBytes) => `已确认作为文件保存：${fileName}（${sizeBytes} 字节）。`,
    savedFileBatchToast: (count) => `已确认将 ${count} 个文档保存为文件。`,
    savedBrowserToast: '已保存到浏览器——仅浏览器存储，没有真实的文件备份。',
    saveAsSucceeded: (fileName) => `容器已作为文件保存并确认：${fileName}。`,
    saveAsBrowserStarted: '下载已开始。浏览器无法确认文件是否已写入磁盘。',
    storeUnavailableToast: '文件存储不可用；未确认文档文件。',
  },
};

export function workspaceSaveProofCopy(locale: WorkspaceLocale): WorkspaceSaveProofCopy {
  return COPY[locale] ?? COPY['en-US'];
}

/** Compact, content-free description for toasts and logs. */
export function describeWorkspaceSaveProof(proof: WorkspaceSaveProof): string {
  if (proof.kind === 'file') return `${proof.fileName} (${proof.sizeBytes} B, SHA-256 ${proof.sha256.slice(0, 12)}…)`;
  return `browser-cache (${new Date(proof.savedAt).toISOString()})`;
}

/** Full tooltip for the status bar; the path is application data, never user content. */
export function workspaceSaveProofTitle(proof: WorkspaceSaveProof, copy: WorkspaceSaveProofCopy): string {
  return proof.kind === 'file' ? copy.fileTitle(proof) : copy.browserTitle;
}
