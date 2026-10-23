// STATUS: PLATIN — localized, keyboard-operable first-run setup flow.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Globe2, KeyRound, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import type { WorkspaceLocale, WorkspaceLocalePreference } from '../localization/workspaceLocaleTypes';
import { resolveWorkspaceLocale } from '../localization/workspaceLocale';
import { attemptFirstRunSetupDismissal, type FirstRunSetupOutcome } from './firstRunSetupPersistence';
import { ALPHA_NOTICE_COPY } from '../support/supportContent';
import { SupportOptions } from '../support/SupportOptions';
import './FirstRunSetupWizard.css';

interface SetupCard {
  readonly title: string;
  readonly body: string;
}

interface SetupCopy {
  readonly labels: {
    readonly step: string;
    readonly of: string;
    readonly skip: string;
    readonly back: string;
    readonly continue: string;
    readonly start: string;
    readonly dialog: string;
    readonly chooseLanguage: string;
    readonly systemLanguage: string;
    readonly keyVaultReady: string;
    readonly keyVaultNeedsSetup: string;
    readonly openKeyVault: string;
    readonly setupKeyVault: string;
    readonly passphraseWarning: string;
    readonly selectedLanguage: string;
    readonly localStorage: string;
    readonly keyVault: string;
    readonly ready: string;
    readonly notReady: string;
    readonly error: string;
    readonly persistenceError: string;
    readonly retrySave: string;
    readonly continueWithoutSaving: string;
  };
  readonly language: { readonly eyebrow: string; readonly title: string; readonly body: string };
  readonly welcome: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly points: readonly [string, string, string];
  };
  readonly privacy: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly storageTitle: string;
    readonly storageBody: string;
    readonly vaultTitle: string;
    readonly vaultBody: string;
  };
  readonly workspace: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly cards: readonly [SetupCard, SetupCard, SetupCard];
  };
  readonly summary: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly readyBody: string;
    readonly pendingBody: string;
  };
  readonly localeNames: Readonly<Record<WorkspaceLocale, string>>;
}

export const COPY: Record<WorkspaceLocale, SetupCopy> = {
  'de-DE': {
    labels: {
      step: 'Schritt', of: 'von', skip: 'Einrichtung überspringen', back: 'Zurück', continue: 'Weiter', start: 'Workspace starten',
      dialog: 'Astraea Workspace Ersteinrichtung', chooseLanguage: 'Sprache auswählen', systemLanguage: 'Systemsprache',
      keyVaultReady: 'KeyVault ist entsperrt. Zugangsdaten werden vor der lokalen Speicherung versiegelt.',
      keyVaultNeedsSetup: 'KeyVault ist noch nicht bereit. Gespeicherte Passwörter benötigen einen entsperrten KeyVault.',
      openKeyVault: 'KeyVault öffnen', setupKeyVault: 'KeyVault einrichten',
      passphraseWarning: 'Bewahre deine Passphrase sicher auf. Geht sie verloren, können die damit geschützten Geheimnisse nicht wiederhergestellt werden.',
      selectedLanguage: 'Sprache', localStorage: 'Lokaler Workspace-Speicher', keyVault: 'KeyVault-Status', ready: 'Bereit', notReady: 'Noch nicht eingerichtet',
      error: 'Die Aktion konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
      persistenceError: 'Deine Auswahl konnte nicht gespeichert werden. Versuche es erneut oder fahre ohne gespeicherten Einrichtungsstatus fort; die Einrichtung erscheint möglicherweise beim nächsten Start wieder.',
      retrySave: 'Speichern wiederholen', continueWithoutSaving: 'Ohne Speichern fortfahren',
    },
    language: { eyebrow: 'Zuerst deine Sprache', title: 'In welcher Sprache möchtest du arbeiten?', body: 'Du kannst diese Auswahl später in den Workspace-Einstellungen ändern.' },
    welcome: {
      eyebrow: 'Willkommen', title: 'Dein Workspace beginnt hier.',
      body: 'Astraea bringt deine tägliche Arbeit in einen ruhigen, lokalen Arbeitsbereich. Richte nur ein, was du jetzt brauchst.',
      points: ['Erstelle Dokumente, Tabellen und Präsentationen.', 'Öffne deine vorhandenen Dateien und arbeite lokal weiter.', 'Füge weitere Werkzeuge hinzu, wenn dein Projekt sie braucht.'],
    },
    privacy: {
      eyebrow: 'Lokal und geschützt', title: 'Deine Daten bleiben auf diesem Gerät.',
      body: 'Workspace-Dateien werden lokal gespeichert und nicht automatisch hochgeladen. Verbundene Netzwerkfunktionen werden erst genutzt, wenn du sie einrichtest.',
      storageTitle: 'Lokaler Speicher', storageBody: 'Deine Dokumente und Workspace-Daten liegen auf diesem Gerät. Zugangsdaten werden separat im KeyVault verwaltet.',
      vaultTitle: 'Software-KeyVault', vaultBody: 'Richte den lokalen KeyVault jetzt ein oder öffne ihn später über die Sicherheitswerkzeuge.',
    },
    workspace: {
      eyebrow: 'Workspace kennenlernen', title: 'Ein klarer Start, dann freie Wahl.',
      body: 'Der Startbereich führt dich zu deinen Werkzeugen, Dateien und den interaktiven App-Guides.',
      cards: [
        { title: 'Etwas erstellen', body: 'Beginne mit einem Dokument, einer Tabelle oder einer Präsentation.' },
        { title: 'Weiterarbeiten', body: 'Öffne lokale Dateien oder kehre zu zuletzt verwendeten Inhalten zurück.' },
        { title: 'Werkzeuge entdecken', body: 'Öffne einen App-Guide, wenn du die Funktionen eines Werkzeugs kennenlernen möchtest.' },
      ],
    },
    summary: {
      eyebrow: 'Alles bereit', title: 'Dein Workspace ist startklar.', body: 'Du kannst deine Auswahl später ändern und die Einrichtung jederzeit erneut öffnen.',
      readyBody: 'Dein KeyVault ist entsperrt und bereit für gespeicherte Zugangsdaten.',
      pendingBody: 'Du kannst starten. Richte den KeyVault ein, bevor du Passwörter speichern möchtest.',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'en-US': {
    labels: {
      step: 'Step', of: 'of', skip: 'Skip setup', back: 'Back', continue: 'Continue', start: 'Start Workspace',
      dialog: 'Astraea Workspace first-run setup', chooseLanguage: 'Choose a language', systemLanguage: 'System language',
      keyVaultReady: 'KeyVault is unlocked. Credentials are sealed before local storage.',
      keyVaultNeedsSetup: 'KeyVault is not ready yet. Saving passwords requires an unlocked KeyVault.',
      openKeyVault: 'Open KeyVault', setupKeyVault: 'Set up KeyVault',
      passphraseWarning: 'Keep your passphrase safe. If it is lost, secrets protected by it cannot be recovered.',
      selectedLanguage: 'Language', localStorage: 'Local Workspace storage', keyVault: 'KeyVault status', ready: 'Ready', notReady: 'Not set up yet',
      error: 'That action could not be completed. Please try again.',
      persistenceError: 'Your setup choice could not be saved. Retry or continue without a saved setup status; setup may appear again next launch.',
      retrySave: 'Retry saving', continueWithoutSaving: 'Continue without saving',
    },
    language: { eyebrow: 'First, choose your language', title: 'Which language would you like to use?', body: 'You can change this choice later in Workspace settings.' },
    welcome: {
      eyebrow: 'Welcome', title: 'Your workspace starts here.',
      body: 'Astraea brings everyday work into a focused, local workspace. Set up only what you need right now.',
      points: ['Create documents, spreadsheets, and presentations.', 'Open existing files and keep working locally.', 'Add other tools when your work calls for them.'],
    },
    privacy: {
      eyebrow: 'Local by design', title: 'Your data stays on this device.',
      body: 'Workspace files are stored locally and are not uploaded automatically. Connected network features are used only when you set them up.',
      storageTitle: 'Local storage', storageBody: 'Your documents and Workspace data stay on this device. Credentials are managed separately in KeyVault.',
      vaultTitle: 'Software KeyVault', vaultBody: 'Set up the local KeyVault now, or open it later from the security tools.',
    },
    workspace: {
      eyebrow: 'A quick orientation', title: 'A clear starting point, then your choice.',
      body: 'The Start Center connects you to your tools, files, and interactive app guides.',
      cards: [
        { title: 'Create something', body: 'Start with a document, spreadsheet, or presentation.' },
        { title: 'Pick up where you left off', body: 'Open local files or return to recently used work.' },
        { title: 'Explore the tools', body: 'Open an app guide when you want to learn a tool’s features.' },
      ],
    },
    summary: {
      eyebrow: 'Ready when you are', title: 'Your workspace is ready.', body: 'You can change these choices later and reopen this setup whenever you need it.',
      readyBody: 'KeyVault is unlocked and ready for saved credentials.',
      pendingBody: 'You can start now. Set up KeyVault before saving passwords.',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'es-ES': {
    labels: {
      step: 'Paso', of: 'de', skip: 'Omitir configuración', back: 'Atrás', continue: 'Continuar', start: 'Iniciar Workspace',
      dialog: 'Configuración inicial de Astraea Workspace', chooseLanguage: 'Elige un idioma', systemLanguage: 'Idioma del sistema',
      keyVaultReady: 'KeyVault está desbloqueado. Las credenciales se sellan antes de guardarse localmente.',
      keyVaultNeedsSetup: 'KeyVault aún no está listo. Para guardar contraseñas necesitas desbloquearlo.',
      openKeyVault: 'Abrir KeyVault', setupKeyVault: 'Configurar KeyVault',
      passphraseWarning: 'Guarda tu frase de contraseña en un lugar seguro. Si la pierdes, no se podrán recuperar los secretos protegidos con ella.',
      selectedLanguage: 'Idioma', localStorage: 'Almacenamiento local de Workspace', keyVault: 'Estado de KeyVault', ready: 'Listo', notReady: 'Aún sin configurar',
      error: 'No se pudo completar la acción. Inténtalo de nuevo.',
      persistenceError: 'No se pudo guardar tu elección. Inténtalo de nuevo o continúa sin guardar el estado; la configuración podría aparecer otra vez al iniciar.',
      retrySave: 'Reintentar guardado', continueWithoutSaving: 'Continuar sin guardar',
    },
    language: { eyebrow: 'Primero, elige el idioma', title: '¿En qué idioma quieres trabajar?', body: 'Puedes cambiar esta opción más adelante en los ajustes de Workspace.' },
    welcome: {
      eyebrow: 'Te damos la bienvenida', title: 'Tu espacio de trabajo empieza aquí.',
      body: 'Astraea reúne tu trabajo diario en un espacio local y claro. Configura solo lo que necesitas ahora.',
      points: ['Crea documentos, hojas de cálculo y presentaciones.', 'Abre archivos existentes y sigue trabajando en local.', 'Añade otras herramientas cuando las necesites.'],
    },
    privacy: {
      eyebrow: 'Local por diseño', title: 'Tus datos permanecen en este dispositivo.',
      body: 'Los archivos de Workspace se guardan localmente y no se suben de forma automática. Las funciones de red conectadas solo se usan cuando las configuras.',
      storageTitle: 'Almacenamiento local', storageBody: 'Tus documentos y datos de Workspace permanecen en este dispositivo. Las credenciales se gestionan por separado en KeyVault.',
      vaultTitle: 'KeyVault de software', vaultBody: 'Configura ahora el KeyVault local o ábrelo más adelante desde las herramientas de seguridad.',
    },
    workspace: {
      eyebrow: 'Una orientación rápida', title: 'Un comienzo claro y luego tú decides.',
      body: 'El centro de inicio te conecta con tus herramientas, archivos y guías interactivas de las aplicaciones.',
      cards: [
        { title: 'Crea algo', body: 'Empieza con un documento, una hoja de cálculo o una presentación.' },
        { title: 'Retoma tu trabajo', body: 'Abre archivos locales o vuelve a lo que usaste recientemente.' },
        { title: 'Explora las herramientas', body: 'Abre una guía de la aplicación para conocer sus funciones.' },
      ],
    },
    summary: {
      eyebrow: 'Todo listo', title: 'Tu Workspace está preparado.', body: 'Puedes cambiar estas opciones más adelante y volver a abrir esta configuración cuando quieras.',
      readyBody: 'KeyVault está desbloqueado y listo para guardar credenciales.',
      pendingBody: 'Puedes empezar ahora. Configura KeyVault antes de guardar contraseñas.',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'it-IT': {
    labels: {
      step: 'Passaggio', of: 'di', skip: 'Salta la configurazione', back: 'Indietro', continue: 'Continua', start: 'Avvia Workspace',
      dialog: 'Configurazione iniziale di Astraea Workspace', chooseLanguage: 'Scegli una lingua', systemLanguage: 'Lingua di sistema',
      keyVaultReady: 'KeyVault è sbloccato. Le credenziali vengono sigillate prima del salvataggio locale.',
      keyVaultNeedsSetup: 'KeyVault non è ancora pronto. Per salvare le password occorre sbloccarlo.',
      openKeyVault: 'Apri KeyVault', setupKeyVault: 'Configura KeyVault',
      passphraseWarning: 'Conserva la passphrase in un luogo sicuro. Se la perdi, i segreti protetti con essa non potranno essere recuperati.',
      selectedLanguage: 'Lingua', localStorage: 'Archiviazione locale Workspace', keyVault: 'Stato KeyVault', ready: 'Pronto', notReady: 'Non ancora configurato',
      error: 'Impossibile completare l’operazione. Riprova.',
      persistenceError: 'Non è stato possibile salvare la scelta. Riprova oppure continua senza salvare lo stato; la configurazione potrebbe ricomparire al prossimo avvio.',
      retrySave: 'Riprova a salvare', continueWithoutSaving: 'Continua senza salvare',
    },
    language: { eyebrow: 'Per prima cosa, scegli la lingua', title: 'In quale lingua vuoi lavorare?', body: 'Puoi modificare la scelta in seguito nelle impostazioni di Workspace.' },
    welcome: {
      eyebrow: 'Benvenuto', title: 'Il tuo spazio di lavoro inizia qui.',
      body: 'Astraea riunisce il lavoro quotidiano in uno spazio locale e ordinato. Configura solo ciò che ti serve ora.',
      points: ['Crea documenti, fogli di calcolo e presentazioni.', 'Apri file esistenti e continua a lavorare in locale.', 'Aggiungi altri strumenti quando ti servono.'],
    },
    privacy: {
      eyebrow: 'Locale per scelta', title: 'I tuoi dati restano su questo dispositivo.',
      body: 'I file Workspace vengono salvati in locale e non sono caricati automaticamente. Le funzioni di rete collegate si usano solo dopo la configurazione.',
      storageTitle: 'Archiviazione locale', storageBody: 'Documenti e dati Workspace restano su questo dispositivo. Le credenziali sono gestite separatamente in KeyVault.',
      vaultTitle: 'KeyVault software', vaultBody: 'Configura ora il KeyVault locale oppure aprilo in seguito dagli strumenti di sicurezza.',
    },
    workspace: {
      eyebrow: 'Orientamento rapido', title: 'Un inizio chiaro, poi scegli tu.',
      body: 'Il Centro iniziale collega strumenti, file e guide interattive delle app.',
      cards: [
        { title: 'Crea qualcosa', body: 'Inizia con un documento, un foglio di calcolo o una presentazione.' },
        { title: 'Riprendi il lavoro', body: 'Apri file locali o torna ai contenuti usati di recente.' },
        { title: 'Esplora gli strumenti', body: 'Apri una guida dell’app per scoprirne le funzioni.' },
      ],
    },
    summary: {
      eyebrow: 'Tutto pronto', title: 'Workspace è pronto.', body: 'Puoi modificare queste scelte in seguito e riaprire questa configurazione quando vuoi.',
      readyBody: 'KeyVault è sbloccato e pronto per le credenziali salvate.',
      pendingBody: 'Puoi iniziare ora. Configura KeyVault prima di salvare password.',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'ja-JP': {
    labels: {
      step: 'ステップ', of: '/', skip: '設定をスキップ', back: '戻る', continue: '次へ', start: 'Workspace を開始',
      dialog: 'Astraea Workspace の初回設定', chooseLanguage: '言語を選択', systemLanguage: 'システムの言語',
      keyVaultReady: 'KeyVault はロック解除済みです。認証情報はローカル保存前に封印されます。',
      keyVaultNeedsSetup: 'KeyVault はまだ準備できていません。パスワードの保存にはロック解除が必要です。',
      openKeyVault: 'KeyVault を開く', setupKeyVault: 'KeyVault を設定',
      passphraseWarning: 'パスフレーズは安全に保管してください。紛失すると、それで保護された秘密情報を復元できません。',
      selectedLanguage: '言語', localStorage: 'Workspace のローカルストレージ', keyVault: 'KeyVault の状態', ready: '準備完了', notReady: '未設定',
      error: '操作を完了できませんでした。もう一度お試しください。',
      persistenceError: '設定の選択を保存できませんでした。再試行するか、保存せずに続行してください。次回起動時に設定が再表示される場合があります。',
      retrySave: '保存を再試行', continueWithoutSaving: '保存せずに続行',
    },
    language: { eyebrow: '最初に言語を選択', title: 'どの言語で作業しますか？', body: 'この設定は後で Workspace の設定から変更できます。' },
    welcome: {
      eyebrow: 'ようこそ', title: 'ここから Workspace が始まります。',
      body: 'Astraea は日々の作業を、集中しやすいローカル環境にまとめます。今必要なものだけ設定しましょう。',
      points: ['文書、表計算、プレゼンテーションを作成できます。', '既存のファイルを開き、ローカルで作業を続けられます。', '必要に応じて他のツールを追加できます。'],
    },
    privacy: {
      eyebrow: 'ローカル設計', title: 'データはこのデバイスに保存されます。',
      body: 'Workspace のファイルはローカルに保存され、自動でアップロードされません。接続機能は設定した場合にのみネットワークを使用します。',
      storageTitle: 'ローカルストレージ', storageBody: '文書と Workspace のデータはこのデバイスに保存されます。認証情報は KeyVault で別に管理します。',
      vaultTitle: 'ソフトウェア KeyVault', vaultBody: 'ローカル KeyVault を今設定するか、後でセキュリティツールから開けます。',
    },
    workspace: {
      eyebrow: 'Workspace の概要', title: '入口を確認したら、自由に始めましょう。',
      body: 'スタートセンターからツール、ファイル、アプリのガイドを開けます。',
      cards: [
        { title: '新しく作成', body: '文書、表計算、プレゼンテーションから始められます。' },
        { title: '作業を再開', body: 'ローカルファイルを開くか、最近使った項目に戻れます。' },
        { title: 'ツールを確認', body: '各ツールの機能は、アプリガイドで確認できます。' },
      ],
    },
    summary: {
      eyebrow: '準備完了', title: 'Workspace を始められます。', body: '設定は後から変更でき、このセットアップもいつでも再度開けます。',
      readyBody: 'KeyVault はロック解除済みで、認証情報を保存できます。',
      pendingBody: '今すぐ開始できます。パスワードを保存する前に KeyVault を設定してください。',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'ru-RU': {
    labels: {
      step: 'Шаг', of: 'из', skip: 'Пропустить настройку', back: 'Назад', continue: 'Далее', start: 'Запустить Workspace',
      dialog: 'Первоначальная настройка Astraea Workspace', chooseLanguage: 'Выберите язык', systemLanguage: 'Язык системы',
      keyVaultReady: 'KeyVault разблокирован. Перед локальным сохранением учётные данные запечатываются.',
      keyVaultNeedsSetup: 'KeyVault ещё не готов. Для сохранения паролей его нужно разблокировать.',
      openKeyVault: 'Открыть KeyVault', setupKeyVault: 'Настроить KeyVault',
      passphraseWarning: 'Храните парольную фразу в надёжном месте. Если она будет утеряна, защищённые ею секреты восстановить нельзя.',
      selectedLanguage: 'Язык', localStorage: 'Локальное хранилище Workspace', keyVault: 'Состояние KeyVault', ready: 'Готов', notReady: 'Ещё не настроен',
      error: 'Не удалось выполнить действие. Попробуйте ещё раз.',
      persistenceError: 'Не удалось сохранить выбранные настройки. Повторите попытку или продолжите без сохранения; настройка может снова появиться при следующем запуске.',
      retrySave: 'Повторить сохранение', continueWithoutSaving: 'Продолжить без сохранения',
    },
    language: { eyebrow: 'Сначала выберите язык', title: 'На каком языке вы хотите работать?', body: 'Позже этот выбор можно изменить в настройках Workspace.' },
    welcome: {
      eyebrow: 'Добро пожаловать', title: 'Здесь начинается ваш Workspace.',
      body: 'Astraea объединяет повседневную работу в удобном локальном пространстве. Настройте только то, что нужно сейчас.',
      points: ['Создавайте документы, таблицы и презентации.', 'Открывайте существующие файлы и продолжайте работу локально.', 'Добавляйте другие инструменты по мере необходимости.'],
    },
    privacy: {
      eyebrow: 'Локально по умолчанию', title: 'Ваши данные остаются на этом устройстве.',
      body: 'Файлы Workspace хранятся локально и не загружаются автоматически. Подключённые сетевые функции используются только после настройки.',
      storageTitle: 'Локальное хранилище', storageBody: 'Документы и данные Workspace остаются на этом устройстве. Учётные данные отдельно управляются в KeyVault.',
      vaultTitle: 'Программный KeyVault', vaultBody: 'Настройте локальный KeyVault сейчас или откройте его позже в инструментах безопасности.',
    },
    workspace: {
      eyebrow: 'Краткий обзор', title: 'Начните с главного, а дальше выбирайте сами.',
      body: 'Центр запуска связывает инструменты, файлы и интерактивные руководства приложений.',
      cards: [
        { title: 'Создать', body: 'Начните с документа, таблицы или презентации.' },
        { title: 'Продолжить работу', body: 'Откройте локальные файлы или вернитесь к недавним материалам.' },
        { title: 'Изучить инструменты', body: 'Откройте руководство приложения, чтобы узнать его возможности.' },
      ],
    },
    summary: {
      eyebrow: 'Всё готово', title: 'Workspace готов к работе.', body: 'Настройки можно изменить позже, а это знакомство — открыть снова в любое время.',
      readyBody: 'KeyVault разблокирован и готов хранить учётные данные.',
      pendingBody: 'Можно начать сейчас. Настройте KeyVault перед сохранением паролей.',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
  'zh-CN': {
    labels: {
      step: '步骤', of: '/', skip: '跳过设置', back: '上一步', continue: '继续', start: '启动 Workspace',
      dialog: 'Astraea Workspace 首次设置', chooseLanguage: '选择语言', systemLanguage: '系统语言',
      keyVaultReady: 'KeyVault 已解锁。凭据在本地保存前会先进行封装。',
      keyVaultNeedsSetup: 'KeyVault 尚未就绪。保存密码前需要先解锁 KeyVault。',
      openKeyVault: '打开 KeyVault', setupKeyVault: '设置 KeyVault',
      passphraseWarning: '请妥善保存口令。口令丢失后，受其保护的机密将无法恢复。',
      selectedLanguage: '语言', localStorage: 'Workspace 本地存储', keyVault: 'KeyVault 状态', ready: '已就绪', notReady: '尚未设置',
      error: '无法完成此操作，请重试。',
      persistenceError: '无法保存你的设置选择。请重试，或在不保存状态的情况下继续；下次启动时可能会再次显示设置。',
      retrySave: '重试保存', continueWithoutSaving: '不保存并继续',
    },
    language: { eyebrow: '首先选择语言', title: '你希望使用哪种语言？', body: '之后可以在 Workspace 设置中更改此选项。' },
    welcome: {
      eyebrow: '欢迎', title: '从这里开始使用 Workspace。',
      body: 'Astraea 将日常工作整合到清晰的本地工作区中。现在只需设置你需要的内容。',
      points: ['创建文档、电子表格和演示文稿。', '打开已有文件并在本地继续工作。', '按需添加其他工具。'],
    },
    privacy: {
      eyebrow: '本地优先', title: '你的数据保存在此设备上。',
      body: 'Workspace 文件保存在本地，不会自动上传。只有在你设置连接功能后，相关功能才会使用网络。',
      storageTitle: '本地存储', storageBody: '文档和 Workspace 数据保存在此设备上。凭据由 KeyVault 单独管理。',
      vaultTitle: '软件 KeyVault', vaultBody: '现在设置本地 KeyVault，也可以稍后从安全工具中打开。',
    },
    workspace: {
      eyebrow: '快速了解', title: '先了解入口，之后按你的方式开始。',
      body: '开始中心可以打开工具、文件和交互式应用指南。',
      cards: [
        { title: '创建内容', body: '从文档、电子表格或演示文稿开始。' },
        { title: '继续工作', body: '打开本地文件，或返回最近使用的内容。' },
        { title: '探索工具', body: '打开应用指南，了解工具的功能。' },
      ],
    },
    summary: {
      eyebrow: '准备就绪', title: 'Workspace 已准备好。', body: '你可以稍后更改这些选项，也可以随时重新打开此设置向导。',
      readyBody: 'KeyVault 已解锁，可以保存凭据。',
      pendingBody: '现在可以开始。保存密码前请先设置 KeyVault。',
    },
    localeNames: { 'de-DE': 'Deutsch', 'en-US': 'English', 'ru-RU': 'Русский', 'it-IT': 'Italiano', 'es-ES': 'Español', 'ja-JP': '日本語', 'zh-CN': '简体中文' },
  },
};

const LOCALE_OPTIONS: readonly WorkspaceLocale[] = ['en-US', 'de-DE', 'es-ES', 'it-IT', 'ja-JP', 'ru-RU', 'zh-CN'];
const STEP_COUNT = 6;

export interface FirstRunSetupWizardProps {
  readonly open: boolean;
  readonly locale: WorkspaceLocale;
  readonly localePreference?: WorkspaceLocalePreference;
  readonly onLocaleChange: (preference: WorkspaceLocalePreference) => void;
  readonly onOpenKeyVault: () => void;
  readonly keyVaultReady: boolean;
  readonly onComplete: () => void;
  readonly onSkip: () => void;
}

interface FirstRunSetupPersistenceRecoveryNoticeProps {
  readonly message: string;
  readonly retryLabel: string;
  readonly continueLabel: string;
  readonly onRetry: () => void;
  readonly onContinue: () => void;
}

export const FirstRunSetupPersistenceRecoveryNotice: React.FC<FirstRunSetupPersistenceRecoveryNoticeProps> = ({
  message,
  retryLabel,
  continueLabel,
  onRetry,
  onContinue,
}) => (
  <div className="vgt-onboarding__persistence-recovery" role="alert">
    <p>{message}</p>
    <div>
      <button type="button" onClick={onRetry}>{retryLabel}</button>
      <button type="button" onClick={onContinue}>{continueLabel}</button>
    </div>
  </div>
);

function resolvedLocale(preference: WorkspaceLocalePreference): WorkspaceLocale {
  return preference === 'system'
    ? resolveWorkspaceLocale('system', typeof navigator === 'undefined' ? undefined : navigator.language)
    : preference;
}

export const FirstRunSetupWizard: React.FC<FirstRunSetupWizardProps> = ({
  open,
  locale,
  localePreference: initialLocalePreference,
  onLocaleChange,
  onOpenKeyVault,
  keyVaultReady,
  onComplete,
  onSkip,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [activeLocale, setActiveLocale] = useState(locale);
  const [selectedLocalePreference, setSelectedLocalePreference] = useState<WorkspaceLocalePreference>(initialLocalePreference ?? 'system');
  const [actionError, setActionError] = useState(false);
  const [pendingDismissOutcome, setPendingDismissOutcome] = useState<FirstRunSetupOutcome | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef<(outcome: FirstRunSetupOutcome) => void>(() => undefined);
  const copy = COPY[activeLocale];
  const labels = copy.labels;

  useEffect(() => {
    setActiveLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (open) setSelectedLocalePreference(initialLocalePreference ?? 'system');
  }, [initialLocalePreference, open]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return undefined;
    }
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const headingFrame = requestAnimationFrame(() => headingRef.current?.focus());
    const dialog = dialogRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current('skipped');
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(headingFrame);
      dialog?.removeEventListener('keydown', onKeyDown);
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    };
    // Dismissal uses a ref so updated parent callbacks do not require reinstalling the focus trap.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, stepIndex]);

  if (!open) return null;

  const handleDismiss = (outcome: FirstRunSetupOutcome) => {
    const result = attemptFirstRunSetupDismissal(outcome, outcome === 'completed' ? onComplete : onSkip);
    if (result === 'storage-unavailable') {
      setPendingDismissOutcome(outcome);
      setActionError(false);
      return;
    }
    setPendingDismissOutcome(null);
    setActionError(result === 'callback-failed');
  };

  const handleDismissWithoutSaving = () => {
    if (!pendingDismissOutcome) return;
    try {
      if (pendingDismissOutcome === 'completed') onComplete();
      else onSkip();
      setPendingDismissOutcome(null);
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };

  const handleLocaleChange = (preference: WorkspaceLocalePreference) => {
    try {
      onLocaleChange(preference);
      setSelectedLocalePreference(preference);
      setActiveLocale(resolvedLocale(preference));
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };

  const handleOpenKeyVault = () => {
    try {
      onOpenKeyVault();
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };

  dismissRef.current = handleDismiss;

  const moveToStep = (nextStep: number) => {
    setActionError(false);
    setStepIndex(Math.max(0, Math.min(STEP_COUNT - 1, nextStep)));
  };

  const alphaNotice = ALPHA_NOTICE_COPY[activeLocale];
  const headerForStep = [copy.language, alphaNotice, copy.welcome, copy.privacy, copy.workspace, copy.summary][stepIndex];

  return (
    <div className="vgt-onboarding__scrim">
      <div
        ref={dialogRef}
        className="vgt-onboarding__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vgt-onboarding-title"
        aria-describedby="vgt-onboarding-description"
        aria-label={labels.dialog}
        tabIndex={-1}
      >
        <header className="vgt-onboarding__topbar">
          <div className="vgt-onboarding__brand" aria-label="Astraea Workspace">
            <span className="vgt-onboarding__brand-mark" aria-hidden="true"><Sparkles size={17} /></span>
            <span><strong>Astraea</strong><span className="vgt-onboarding__brand-divider">/</span>Workspace</span>
          </div>
          <button type="button" className="vgt-onboarding__skip" onClick={() => handleDismiss('skipped')}>
            {labels.skip}
          </button>
        </header>

        <div className="vgt-onboarding__progress" aria-label={`${labels.step} ${stepIndex + 1} ${labels.of} ${STEP_COUNT}`}>
          <span className="vgt-onboarding__progress-label">{labels.step} {stepIndex + 1} {labels.of} {STEP_COUNT}</span>
          <div className="vgt-onboarding__progress-track" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <span key={index} className={index <= stepIndex ? 'vgt-onboarding__progress-segment is-active' : 'vgt-onboarding__progress-segment'} />
            ))}
          </div>
        </div>

        <main className="vgt-onboarding__main" aria-live="polite" aria-atomic="false">
          <div className="vgt-onboarding__step-heading">
            <span className="vgt-onboarding__eyebrow">{headerForStep.eyebrow}</span>
            <h1 id="vgt-onboarding-title" ref={headingRef} tabIndex={-1}>{headerForStep.title}</h1>
            <p id="vgt-onboarding-description">{headerForStep.body}</p>
          </div>

          {stepIndex === 0 && (
            <fieldset className="vgt-onboarding__language-fieldset">
              <legend>{labels.chooseLanguage}</legend>
              <div className="vgt-onboarding__language-grid">
                <label className={`vgt-onboarding__language-option${selectedLocalePreference === 'system' ? ' is-selected' : ''}`}>
                  <input type="radio" name="astraea-onboarding-language" value="system" checked={selectedLocalePreference === 'system'} onChange={() => handleLocaleChange('system')} />
                  <span className="vgt-onboarding__language-icon" aria-hidden="true"><Globe2 size={17} /></span>
                  <span className="vgt-onboarding__language-name">{labels.systemLanguage}</span>
                  <span className="vgt-onboarding__language-code">AUTO</span>
                </label>
                {LOCALE_OPTIONS.map((option) => (
                  <label key={option} className={`vgt-onboarding__language-option${selectedLocalePreference === option ? ' is-selected' : ''}`}>
                    <input type="radio" name="astraea-onboarding-language" value={option} checked={selectedLocalePreference === option} onChange={() => handleLocaleChange(option)} />
                    <span className="vgt-onboarding__language-icon" aria-hidden="true"><span>{option.slice(0, 2).toUpperCase()}</span></span>
                    <span className="vgt-onboarding__language-name">{copy.localeNames[option]}</span>
                    <span className="vgt-onboarding__language-code">{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {stepIndex === 1 && (
            <section className="vgt-onboarding__alpha" aria-label={alphaNotice.eyebrow}>
              <div className="vgt-onboarding__alpha-grid">
                <article className="vgt-onboarding__alpha-card is-works">
                  <h2>{alphaNotice.worksTitle}</h2>
                  <ul>{alphaNotice.works.map((entry) => <li key={entry}><Check aria-hidden="true" size={14} />{entry}</li>)}</ul>
                </article>
                <article className="vgt-onboarding__alpha-card is-limits">
                  <h2>{alphaNotice.limitsTitle}</h2>
                  <ul>{alphaNotice.limits.map((entry) => <li key={entry}><span aria-hidden="true">!</span>{entry}</li>)}</ul>
                </article>
              </div>
              <p className="vgt-onboarding__alpha-errors"><strong>{alphaNotice.errorsTitle}:</strong> {alphaNotice.errorsBody}</p>
              <div className="vgt-onboarding__alpha-support">
                <div className="vgt-onboarding__alpha-support-heading">
                  <h2>{alphaNotice.supportTitle}</h2>
                  <p>{alphaNotice.supportBody}</p>
                </div>
                <SupportOptions locale={activeLocale} variant="onboarding" />
              </div>
            </section>
          )}

          {stepIndex === 2 && (
            <section className="vgt-onboarding__welcome-panel" aria-label={copy.welcome.eyebrow}>
              <div className="vgt-onboarding__welcome-symbol" aria-hidden="true"><Sparkles size={25} strokeWidth={1.6} /></div>
              <ul className="vgt-onboarding__welcome-list">
                {copy.welcome.points.map((point) => <li key={point}><Check aria-hidden="true" size={16} />{point}</li>)}
              </ul>
            </section>
          )}

          {stepIndex === 3 && (
            <section className="vgt-onboarding__privacy-layout" aria-label={copy.privacy.eyebrow}>
              <article className="vgt-onboarding__info-card">
                <span className="vgt-onboarding__card-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
                <div><h2>{copy.privacy.storageTitle}</h2><p>{copy.privacy.storageBody}</p></div>
              </article>
              <article className="vgt-onboarding__info-card vgt-onboarding__vault-card">
                <span className="vgt-onboarding__card-icon" aria-hidden="true"><KeyRound size={18} /></span>
                <div className="vgt-onboarding__vault-content">
                  <h2>{copy.privacy.vaultTitle}</h2>
                  <p>{copy.privacy.vaultBody}</p>
                  <p className={`vgt-onboarding__vault-state${keyVaultReady ? ' is-ready' : ''}`} role="status">
                    <span className="vgt-onboarding__state-dot" aria-hidden="true" />
                    {keyVaultReady ? labels.keyVaultReady : labels.keyVaultNeedsSetup}
                  </p>
                  <button type="button" className="vgt-onboarding__vault-button" onClick={handleOpenKeyVault}>
                    <LockKeyhole aria-hidden="true" size={15} />{keyVaultReady ? labels.openKeyVault : labels.setupKeyVault}
                  </button>
                </div>
              </article>
              <p className="vgt-onboarding__warning"><span aria-hidden="true">!</span>{labels.passphraseWarning}</p>
            </section>
          )}

          {stepIndex === 4 && (
            <section className="vgt-onboarding__workspace-grid" aria-label={copy.workspace.eyebrow}>
              {copy.workspace.cards.map((card, index) => (
                <article className="vgt-onboarding__workspace-card" key={card.title}>
                  <span className="vgt-onboarding__workspace-index">0{index + 1}</span>
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </article>
              ))}
            </section>
          )}

          {stepIndex === 5 && (
            <section className="vgt-onboarding__summary" aria-label={copy.summary.eyebrow}>
              <div className="vgt-onboarding__summary-mark" aria-hidden="true"><Check size={22} /></div>
              <div className="vgt-onboarding__summary-rows">
                <div><span>{labels.selectedLanguage}</span><strong>{selectedLocalePreference === 'system' ? labels.systemLanguage : copy.localeNames[selectedLocalePreference]}</strong></div>
                <div><span>{labels.localStorage}</span><strong>{labels.ready}</strong></div>
                <div><span>{labels.keyVault}</span><strong>{keyVaultReady ? labels.ready : labels.notReady}</strong></div>
              </div>
              <p className="vgt-onboarding__summary-vault-note">{keyVaultReady ? copy.summary.readyBody : copy.summary.pendingBody}</p>
            </section>
          )}

          {pendingDismissOutcome ? (
            <FirstRunSetupPersistenceRecoveryNotice
              message={labels.persistenceError}
              retryLabel={labels.retrySave}
              continueLabel={labels.continueWithoutSaving}
              onRetry={() => handleDismiss(pendingDismissOutcome)}
              onContinue={handleDismissWithoutSaving}
            />
          ) : actionError ? (
            <p className="vgt-onboarding__error" role="alert">{labels.error}</p>
          ) : null}
        </main>

        <footer className="vgt-onboarding__footer">
          <button type="button" className="vgt-onboarding__back" onClick={() => moveToStep(stepIndex - 1)} disabled={stepIndex === 0}>
            <ArrowLeft aria-hidden="true" size={16} />{labels.back}
          </button>
          <div className="vgt-onboarding__footer-actions">
            {stepIndex < STEP_COUNT - 1 ? (
              <button type="button" className="vgt-onboarding__continue" onClick={() => moveToStep(stepIndex + 1)}>
                {labels.continue}<ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : (
              <button type="button" className="vgt-onboarding__continue" onClick={() => handleDismiss('completed')}>
                {labels.start}<ArrowRight aria-hidden="true" size={16} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default FirstRunSetupWizard;
