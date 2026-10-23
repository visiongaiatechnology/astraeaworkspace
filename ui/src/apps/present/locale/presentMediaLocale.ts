// STATUS: PLATIN — localized media source dialog, accessibility copy, and opaque validation feedback.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type PresentMediaCopy = {
  dialog: string;
  close: string;
  video: string;
  audio: string;
  externalLink: string;
  externalDescription: string;
  embeddedAsset: string;
  embeddedDescription: string;
  mediaUrl: string;
  chooseVideo: string;
  chooseAudio: string;
  accessibility: string;
  subtitles: string;
  transcriptAlternative: string;
  audioTranscript: string;
  transcriptPlaceholder: string;
  captions: string;
  cancel: string;
  apply: string;
  validationError: string;
  /** Explicit consent before the browser contacts an external media host (Paket 22). */
  previewConsent: string;
  /** Visible explanation while no external preview is loaded. The host is interpolated. */
  previewBlocked: (host: string) => string;
};

export const PRESENT_MEDIA_COPY: Readonly<Record<WorkspaceLocale, PresentMediaCopy>> = {
  'en-US': {
    dialog: 'Media source', close: 'Close media dialog', video: 'Video', audio: 'Audio', externalLink: 'External link',
    externalDescription: 'HTTP(S) link; media is not downloaded during packaging.', embeddedAsset: 'Embedded asset',
    embeddedDescription: 'Local file, signature checked, maximum 24 MiB.', mediaUrl: 'https://example.com/media', chooseVideo: 'Choose video file', chooseAudio: 'Choose audio file',
    accessibility: 'Accessibility', subtitles: 'WebVTT subtitles', transcriptAlternative: 'Transcript / text alternative', audioTranscript: 'Audio transcript',
    transcriptPlaceholder: 'Accessible text transcript', captions: 'Captions', cancel: 'Cancel', apply: 'Apply',
    validationError: 'The media source could not be validated. Check the URL or file, captions, and transcript, then try again.',
    previewConsent: 'Load the external preview (this contacts the host).',
    previewBlocked: (host) => `No preview is loaded: playing it would contact ${host}. The link is still saved as a reference.`,
  },
  'de-DE': {
    dialog: 'Medienquelle', close: 'Mediendialog schließen', video: 'Video', audio: 'Audio', externalLink: 'Externer Link',
    externalDescription: 'HTTP(S)-Link; Medien werden beim Paketieren nicht heruntergeladen.', embeddedAsset: 'Eingebettete Datei',
    embeddedDescription: 'Lokale Datei, Signaturprüfung, maximal 24 MiB.', mediaUrl: 'https://example.com/media', chooseVideo: 'Videodatei auswählen', chooseAudio: 'Audiodatei auswählen',
    accessibility: 'Barrierefreiheit', subtitles: 'WebVTT-Untertitel', transcriptAlternative: 'Transkript / Textalternative', audioTranscript: 'Audiotranskript',
    transcriptPlaceholder: 'Barrierefreies Texttranskript', captions: 'Untertitel', cancel: 'Abbrechen', apply: 'Übernehmen',
    validationError: 'Die Medienquelle konnte nicht geprüft werden. Prüfe URL oder Datei, Untertitel und Transkript und versuche es erneut.',
    previewConsent: 'Externe Vorschau laden (kontaktiert den Host).',
    previewBlocked: (host) => `Keine Vorschau geladen: die Wiedergabe würde ${host} kontaktieren. Der Link wird weiterhin als Referenz gespeichert.`,
  },
  'es-ES': {
    dialog: 'Origen del medio', close: 'Cerrar el cuadro de medios', video: 'Vídeo', audio: 'Audio', externalLink: 'Enlace externo',
    externalDescription: 'Enlace HTTP(S); el medio no se descarga al empaquetar.', embeddedAsset: 'Archivo incrustado',
    embeddedDescription: 'Archivo local, firma comprobada, máximo 24 MiB.', mediaUrl: 'https://example.com/media', chooseVideo: 'Elegir archivo de vídeo', chooseAudio: 'Elegir archivo de audio',
    accessibility: 'Accesibilidad', subtitles: 'Subtítulos WebVTT', transcriptAlternative: 'Transcripción / alternativa de texto', audioTranscript: 'Transcripción de audio',
    transcriptPlaceholder: 'Transcripción de texto accesible', captions: 'Subtítulos', cancel: 'Cancelar', apply: 'Aplicar',
    validationError: 'No se pudo validar el origen del medio. Comprueba la URL o el archivo, los subtítulos y la transcripción; vuelve a intentarlo.',
    previewConsent: 'Cargar la vista previa externa (contacta con el host).',
    previewBlocked: (host) => `No se carga ninguna vista previa: reproducirla contactaría con ${host}. El enlace se guarda igualmente como referencia.`,
  },
  'it-IT': {
    dialog: 'Sorgente multimediale', close: 'Chiudi la finestra multimediale', video: 'Video', audio: 'Audio', externalLink: 'Collegamento esterno',
    externalDescription: 'Collegamento HTTP(S); il contenuto non viene scaricato durante la creazione del pacchetto.', embeddedAsset: 'File incorporato',
    embeddedDescription: 'File locale, firma verificata, massimo 24 MiB.', mediaUrl: 'https://example.com/media', chooseVideo: 'Scegli file video', chooseAudio: 'Scegli file audio',
    accessibility: 'Accessibilità', subtitles: 'Sottotitoli WebVTT', transcriptAlternative: 'Trascrizione / alternativa testuale', audioTranscript: 'Trascrizione audio',
    transcriptPlaceholder: 'Trascrizione testuale accessibile', captions: 'Didascalie', cancel: 'Annulla', apply: 'Applica',
    validationError: 'Impossibile convalidare la sorgente multimediale. Controlla URL o file, sottotitoli e trascrizione, quindi riprova.',
    previewConsent: 'Carica l\u2019anteprima esterna (contatta l\u2019host).',
    previewBlocked: (host) => `Nessuna anteprima caricata: la riproduzione contatterebbe ${host}. Il collegamento resta salvato come riferimento.`,
  },
  'ja-JP': {
    dialog: 'メディアソース', close: 'メディアダイアログを閉じる', video: '動画', audio: '音声', externalLink: '外部リンク',
    externalDescription: 'HTTP(S) リンク。パッケージ作成時にメディアはダウンロードされません。', embeddedAsset: '埋め込みファイル',
    embeddedDescription: 'ローカルファイル、署名を検証、最大 24 MiB。', mediaUrl: 'https://example.com/media', chooseVideo: '動画ファイルを選択', chooseAudio: '音声ファイルを選択',
    accessibility: 'アクセシビリティ', subtitles: 'WebVTT 字幕', transcriptAlternative: '文字起こし / テキスト代替', audioTranscript: '音声の文字起こし',
    transcriptPlaceholder: 'アクセシブルなテキスト文字起こし', captions: '字幕', cancel: 'キャンセル', apply: '適用',
    validationError: 'メディアソースを検証できませんでした。URL またはファイル、字幕、文字起こしを確認して再試行してください。',
    previewConsent: '外部プレビューを読み込む（ホストに接続します）。',
    previewBlocked: (host) => `プレビューは読み込まれていません。再生すると ${host} に接続します。リンクは参照として保存されます。`,
  },
  'ru-RU': {
    dialog: 'Источник медиа', close: 'Закрыть окно выбора медиа', video: 'Видео', audio: 'Аудио', externalLink: 'Внешняя ссылка',
    externalDescription: 'Ссылка HTTP(S); медиафайл не загружается при сборке пакета.', embeddedAsset: 'Встроенный файл',
    embeddedDescription: 'Локальный файл, проверка подписи, максимум 24 МиБ.', mediaUrl: 'https://example.com/media', chooseVideo: 'Выбрать видеофайл', chooseAudio: 'Выбрать аудиофайл',
    accessibility: 'Доступность', subtitles: 'Субтитры WebVTT', transcriptAlternative: 'Расшифровка / текстовая альтернатива', audioTranscript: 'Расшифровка аудио',
    transcriptPlaceholder: 'Доступная текстовая расшифровка', captions: 'Субтитры', cancel: 'Отмена', apply: 'Применить',
    validationError: 'Не удалось проверить источник медиа. Проверьте ссылку или файл, субтитры и расшифровку, затем повторите попытку.',
    previewConsent: 'Загрузить внешний предпросмотр (обращается к хосту).',
    previewBlocked: (host) => `Предпросмотр не загружен: воспроизведение обратилось бы к ${host}. Ссылка всё равно сохраняется как ссылка.`,
  },
  'zh-CN': {
    dialog: '媒体源', close: '关闭媒体对话框', video: '视频', audio: '音频', externalLink: '外部链接',
    externalDescription: 'HTTP(S) 链接；打包时不会下载媒体。', embeddedAsset: '嵌入式文件',
    embeddedDescription: '本地文件，已验证签名，最大 24 MiB。', mediaUrl: 'https://example.com/media', chooseVideo: '选择视频文件', chooseAudio: '选择音频文件',
    accessibility: '无障碍', subtitles: 'WebVTT 字幕', transcriptAlternative: '文字稿 / 文本替代内容', audioTranscript: '音频文字稿',
    transcriptPlaceholder: '无障碍文本转录', captions: '字幕', cancel: '取消', apply: '应用',
    validationError: '无法验证媒体源。请检查网址或文件、字幕和文字稿，然后重试。',
    previewConsent: '加载外部预览（将访问该主机）。',
    previewBlocked: (host) => `未加载预览：播放将访问 ${host}。该链接仍会作为引用保存。`,
  },
};

export function presentMediaCopy(locale: WorkspaceLocale): PresentMediaCopy {
  return PRESENT_MEDIA_COPY[locale];
}

export function presentMediaErrorMessage(locale: WorkspaceLocale, _cause: unknown): string {
  return PRESENT_MEDIA_COPY[locale].validationError;
}
