// STATUS: PLATIN — seven-locale copy for Present recording and presenter surfaces.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export type RecordingStudioMode = 'record' | 'rehearse' | 'timeline';
export type RecordingInkTool = 'pointer' | 'pen' | 'highlighter';

export type RecordingStudioCopy = Readonly<{
  title: string; close: string; modes: Readonly<Record<RecordingStudioMode, string>>;
  slidePreview: (slide: number) => string; previousSlide: string; nextSlide: string;
  slidePosition: (slide: number, total: number) => string; slideFallback: (slide: number) => string;
  capture: string; microphoneNarration: string; cameraTrack: string; consentText: string;
  recordTake: string; stopAndSave: string; inkTools: Readonly<Record<RecordingInkTool, string>>;
  transcriptCaptions: string; transcriptPlaceholder: string; transcriptGuidance: string;
  slideTimer: string; totalTimer: string; pause: string; start: string; saveAndNext: string; resetRehearsal: string;
  timelineTitle: string; timelineSlide: (slide: number, title: string) => string; untitledSlide: string;
  cueCount: (count: number) => string; noTake: string; recordingIndicator: string;
  teleprompterNotes: string; noSpeakerNotes: string; takesForSlide: string;
  removeTake: (slideId: string, timestamp: string) => string; playAudioTake: string; playCameraTake: string;
  audioTrack: string; cameraTrackLabel: string; interactionEventCount: (count: number) => string;
  noTakes: string; activeTake: string; rehearsed: string; pointerInk: string;
  errors: Readonly<{ consentRequired: string; sourceRequired: string; stopBeforeClose: string; generic: string }>;
}>;

export type PresenterModeCopy = Readonly<{
  title: string; audienceWindowTitle: string; slidePosition: (slide: number, total: number) => string; paused: string; kioskExitHint: string;
  blackScreen: string; whiteScreen: string; clearInk: string; previous: string; next: string;
  keepInk: string; exitShow: string; confirmTitle: string; confirmMessage: string; discard: string; keepAndExit: string;
  errors: Readonly<{ audienceUnavailable: string; inkSaveFailed: string; generic: string }>;
}>;

export type PresenterControlsCopy = Readonly<{
  elapsedTime: (elapsed: string) => string; currentTime: string; slideTimer: (elapsed: string) => string;
  pauseSlideshow: string; resumeSlideshow: string; laserPointer: string; pen: string; highlighter: string; eraser: string;
  zoomOut: string; zoomIn: string; loopSequence: string; kioskMode: string; openAudience: string; fullscreenAudience: string;
  remoteStatus: (available: boolean, token: string) => string; remoteTitle: (available: boolean, token: string) => string;
}>;

export type PresenterSidePanelCopy = Readonly<{
  nextSlide: string; endOfSequence: string; noFurtherSlide: string; sequence: string; slideNavigator: string;
  untitledSlide: string; slideFallback: string; selectSlide: (slide: number, title: string) => string;
  speakerNotes: string; noPrivateNotes: string; decreaseNotesFont: string; increaseNotesFont: string;
}>;

export type PresentStudioCopy = Readonly<{
  recording: RecordingStudioCopy;
  presenter: PresenterModeCopy;
  controls: PresenterControlsCopy;
  sidePanel: PresenterSidePanelCopy;
}>;

export const PRESENT_STUDIO_COPY: Readonly<Record<WorkspaceLocale, PresentStudioCopy>> = {
  'en-US': {
    recording: {
      title: 'Recording and rehearsal studio', close: 'Close Present recording and rehearsal studio', modes: { record: 'Record', rehearse: 'Rehearse', timeline: 'Timeline' },
      slidePreview: (slide) => `Slide ${slide} preview`, previousSlide: 'Previous slide', nextSlide: 'Next slide', slidePosition: (slide, total) => `Slide ${slide} of ${total}`, slideFallback: (slide) => `Slide ${slide}`,
      capture: 'Capture', microphoneNarration: 'Microphone narration', cameraTrack: 'Camera track', consentText: 'I allow Astraea Present to request OS permission for the selected camera and microphone when I start recording. No device is accessed before I choose Record.',
      recordTake: 'Record take', stopAndSave: 'Stop and save', inkTools: { pointer: 'Pointer', pen: 'Pen', highlighter: 'Highlighter' },
      transcriptCaptions: 'Transcript and captions', transcriptPlaceholder: 'Transcript or caption lines…', transcriptGuidance: 'Each non-empty line becomes a timed caption cue. Speech stays on this device and is not sent to a cloud service.',
      slideTimer: 'Slide', totalTimer: 'Total', pause: 'Pause', start: 'Start', saveAndNext: 'Save and next', resetRehearsal: 'Reset rehearsal',
      timelineTitle: 'Deck recording timeline', timelineSlide: (slide, title) => `Select slide ${slide}: ${title}`, untitledSlide: 'Untitled slide',
      cueCount: (count) => `${count} cues`, noTake: 'No take', recordingIndicator: 'REC', teleprompterNotes: 'Teleprompter and notes', noSpeakerNotes: 'No speaker notes for this slide.', takesForSlide: 'Takes for this slide',
      removeTake: (slideId, timestamp) => `Remove recording take from slide ${slideId}, created ${timestamp}`, playAudioTake: 'Play recorded narration', playCameraTake: 'Play camera recording',
      audioTrack: 'Audio', cameraTrackLabel: 'Camera', interactionEventCount: (count) => `${count} events`, noTakes: 'No takes recorded yet.', activeTake: 'Active take', rehearsed: 'Rehearsed', pointerInk: 'Pointer and ink',
      errors: { consentRequired: 'Confirm device permission before requesting camera or microphone access.', sourceRequired: 'Select a microphone or camera before recording.', stopBeforeClose: 'Stop the recording before closing so the take is not lost.', generic: 'Recording could not be completed. Check device permissions and try again.' },
    },
    presenter: {
      title: 'Presentation mode', audienceWindowTitle: 'Astraea Present · Audience', slidePosition: (slide, total) => `Slide ${slide} of ${total}`, paused: 'Paused', kioskExitHint: 'Kiosk · Press Esc to exit',
      blackScreen: 'Black', whiteScreen: 'White', clearInk: 'Clear ink on current slide', previous: 'Previous', next: 'Next', keepInk: 'Keep ink', exitShow: 'Exit show',
      confirmTitle: 'Keep presenter ink?', confirmMessage: 'Annotations changed during the show. Keep them in the presentation or discard this session.', discard: 'Discard', keepAndExit: 'Keep and exit',
      errors: { audienceUnavailable: 'The audience window could not be opened. Check popup permissions and try again.', inkSaveFailed: 'Presenter annotations could not be saved. Keep the presentation open and try again.', generic: 'The presenter action could not be completed. Try again.' },
    },
    controls: {
      elapsedTime: (elapsed) => `Elapsed time: ${elapsed}`, currentTime: 'Current time', slideTimer: (elapsed) => `Slide ${elapsed}`,
      pauseSlideshow: 'Pause slideshow', resumeSlideshow: 'Resume slideshow', laserPointer: 'Laser pointer', pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser',
      zoomOut: 'Zoom out', zoomIn: 'Zoom in', loopSequence: 'Loop sequence', kioskMode: 'Kiosk mode', openAudience: 'Open separate audience output', fullscreenAudience: 'Fullscreen audience output',
      remoteStatus: (available, token) => available ? `Remote ${token}` : 'Remote off', remoteTitle: (available, token) => available ? `Local pairing token: ${token}` : 'Local remote adapter unavailable',
    },
    sidePanel: {
      nextSlide: 'Next slide', endOfSequence: 'End of sequence', noFurtherSlide: 'No further slide.', sequence: 'Sequence', slideNavigator: 'Slide thumbnail navigator',
      untitledSlide: 'Untitled', slideFallback: 'Slide', selectSlide: (slide, title) => `Go to slide ${slide}: ${title}`,
      speakerNotes: 'Speaker notes', noPrivateNotes: 'No private notes for this slide.', decreaseNotesFont: 'Decrease speaker-notes text size', increaseNotesFont: 'Increase speaker-notes text size',
    },
  },
  'de-DE': {
    recording: {
      title: 'Aufnahme- und Probenstudio', close: 'Present-Aufnahme- und Probenstudio schließen', modes: { record: 'Aufnehmen', rehearse: 'Proben', timeline: 'Zeitleiste' },
      slidePreview: (slide) => `Vorschau von Folie ${slide}`, previousSlide: 'Vorherige Folie', nextSlide: 'Nächste Folie', slidePosition: (slide, total) => `Folie ${slide} von ${total}`, slideFallback: (slide) => `Folie ${slide}`,
      capture: 'Aufnahme', microphoneNarration: 'Mikrofonaufnahme', cameraTrack: 'Kameraspur', consentText: 'Ich erlaube Astraea Present, beim Start der Aufnahme die Betriebssystemfreigabe für das ausgewählte Mikrofon und die Kamera anzufordern. Vor meiner Auswahl von „Aufnehmen“ wird kein Gerät verwendet.',
      recordTake: 'Take aufnehmen', stopAndSave: 'Stoppen und speichern', inkTools: { pointer: 'Zeiger', pen: 'Stift', highlighter: 'Textmarker' },
      transcriptCaptions: 'Transkript und Untertitel', transcriptPlaceholder: 'Transkript oder Untertitelzeilen…', transcriptGuidance: 'Jede nicht leere Zeile wird zu einem zeitgesteuerten Untertitel. Sprache bleibt auf diesem Gerät und wird nicht an einen Clouddienst gesendet.',
      slideTimer: 'Folie', totalTimer: 'Gesamt', pause: 'Pausieren', start: 'Starten', saveAndNext: 'Speichern und weiter', resetRehearsal: 'Probe zurücksetzen',
      timelineTitle: 'Aufnahme-Zeitleiste der Präsentation', timelineSlide: (slide, title) => `Folie ${slide} auswählen: ${title}`, untitledSlide: 'Folie ohne Titel',
      cueCount: (count) => `${count} Untertitel`, noTake: 'Kein Take', recordingIndicator: 'AUFNAHME', teleprompterNotes: 'Teleprompter und Notizen', noSpeakerNotes: 'Keine Sprechernotizen für diese Folie.', takesForSlide: 'Takes für diese Folie',
      removeTake: (slideId, timestamp) => `Aufnahme-Take von Folie ${slideId} vom ${timestamp} entfernen`, playAudioTake: 'Aufgenommene Erzählspur abspielen', playCameraTake: 'Kameraaufnahme abspielen',
      audioTrack: 'Audio', cameraTrackLabel: 'Kamera', interactionEventCount: (count) => `${count} Ereignisse`, noTakes: 'Noch keine Takes aufgenommen.', activeTake: 'Aktiver Take', rehearsed: 'Geprobt', pointerInk: 'Zeiger und Tinte',
      errors: { consentRequired: 'Bestätige die Gerätefreigabe, bevor Kamera oder Mikrofon angefordert werden.', sourceRequired: 'Wähle vor der Aufnahme ein Mikrofon oder eine Kamera aus.', stopBeforeClose: 'Beende die Aufnahme vor dem Schließen, damit der Take erhalten bleibt.', generic: 'Die Aufnahme konnte nicht abgeschlossen werden. Prüfe die Geräteberechtigungen und versuche es erneut.' },
    },
    presenter: {
      title: 'Präsentationsmodus', audienceWindowTitle: 'Astraea Present · Publikum', slidePosition: (slide, total) => `Folie ${slide} von ${total}`, paused: 'Pausiert', kioskExitHint: 'Kiosk · Mit Esc beenden',
      blackScreen: 'Schwarz', whiteScreen: 'Weiß', clearInk: 'Tinte auf aktueller Folie löschen', previous: 'Zurück', next: 'Weiter', keepInk: 'Tinte behalten', exitShow: 'Vorführung beenden',
      confirmTitle: 'Vorführungsnotizen behalten?', confirmMessage: 'Während der Vorführung wurden Anmerkungen geändert. Behalte sie in der Präsentation oder verwirf diese Sitzung.', discard: 'Verwerfen', keepAndExit: 'Behalten und beenden',
      errors: { audienceUnavailable: 'Das Publikumsfenster konnte nicht geöffnet werden. Prüfe die Pop-up-Berechtigungen und versuche es erneut.', inkSaveFailed: 'Die Vorführungsanmerkungen konnten nicht gespeichert werden. Lass die Präsentation geöffnet und versuche es erneut.', generic: 'Die Vorführungsaktion konnte nicht abgeschlossen werden. Versuche es erneut.' },
    },
    controls: {
      elapsedTime: (elapsed) => `Verstrichene Zeit: ${elapsed}`, currentTime: 'Aktuelle Uhrzeit', slideTimer: (elapsed) => `Folie ${elapsed}`,
      pauseSlideshow: 'Vorführung pausieren', resumeSlideshow: 'Vorführung fortsetzen', laserPointer: 'Laserpointer', pen: 'Stift', highlighter: 'Textmarker', eraser: 'Radierer',
      zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', loopSequence: 'Ablauf wiederholen', kioskMode: 'Kioskmodus', openAudience: 'Separate Publikumsanzeige öffnen', fullscreenAudience: 'Publikumsanzeige im Vollbild öffnen',
      remoteStatus: (available, token) => available ? `Fernsteuerung ${token}` : 'Fernsteuerung aus', remoteTitle: (available, token) => available ? `Lokaler Kopplungscode: ${token}` : 'Lokale Fernsteuerung nicht verfügbar',
    },
    sidePanel: {
      nextSlide: 'Nächste Folie', endOfSequence: 'Ende des Ablaufs', noFurtherSlide: 'Keine weitere Folie.', sequence: 'Ablauf', slideNavigator: 'Folienübersicht',
      untitledSlide: 'Ohne Titel', slideFallback: 'Folie', selectSlide: (slide, title) => `Zu Folie ${slide} wechseln: ${title}`,
      speakerNotes: 'Sprechernotizen', noPrivateNotes: 'Keine privaten Notizen für diese Folie.', decreaseNotesFont: 'Textgröße der Sprechernotizen verkleinern', increaseNotesFont: 'Textgröße der Sprechernotizen vergrößern',
    },
  },
  'ru-RU': {
    recording: {
      title: 'Студия записи и репетиций', close: 'Закрыть студию записи и репетиций Present', modes: { record: 'Запись', rehearse: 'Репетиция', timeline: 'Хронология' },
      slidePreview: (slide) => `Предпросмотр слайда ${slide}`, previousSlide: 'Предыдущий слайд', nextSlide: 'Следующий слайд', slidePosition: (slide, total) => `Слайд ${slide} из ${total}`, slideFallback: (slide) => `Слайд ${slide}`,
      capture: 'Запись', microphoneNarration: 'Запись с микрофона', cameraTrack: 'Дорожка камеры', consentText: 'Разрешаю Astraea Present запросить разрешение операционной системы на использование выбранных камеры и микрофона при начале записи. До нажатия кнопки записи устройство не используется.',
      recordTake: 'Записать дубль', stopAndSave: 'Остановить и сохранить', inkTools: { pointer: 'Указатель', pen: 'Перо', highlighter: 'Маркер' },
      transcriptCaptions: 'Расшифровка и субтитры', transcriptPlaceholder: 'Строки расшифровки или субтитров…', transcriptGuidance: 'Каждая непустая строка станет субтитром с временной меткой. Речь останется на устройстве и не отправляется в облачный сервис.',
      slideTimer: 'Слайд', totalTimer: 'Всего', pause: 'Приостановить', start: 'Начать', saveAndNext: 'Сохранить и далее', resetRehearsal: 'Сбросить репетицию',
      timelineTitle: 'Хронология записи презентации', timelineSlide: (slide, title) => `Перейти к слайду ${slide}: ${title}`, untitledSlide: 'Слайд без названия',
      cueCount: (count) => `Субтитров: ${count}`, noTake: 'Нет дубля', recordingIndicator: 'ЗАПИСЬ', teleprompterNotes: 'Телесуфлёр и заметки', noSpeakerNotes: 'Для этого слайда нет заметок докладчика.', takesForSlide: 'Дубли этого слайда',
      removeTake: (slideId, timestamp) => `Удалить дубль слайда ${slideId}, созданный ${timestamp}`, playAudioTake: 'Воспроизвести запись дикторского текста', playCameraTake: 'Воспроизвести запись камеры',
      audioTrack: 'Аудио', cameraTrackLabel: 'Камера', interactionEventCount: (count) => `Событий: ${count}`, noTakes: 'Записей пока нет.', activeTake: 'Активный дубль', rehearsed: 'Репетиция', pointerInk: 'Указатель и рукописные пометки',
      errors: { consentRequired: 'Подтвердите разрешение устройства перед запросом доступа к камере или микрофону.', sourceRequired: 'Перед записью выберите микрофон или камеру.', stopBeforeClose: 'Остановите запись перед закрытием, чтобы сохранить дубль.', generic: 'Не удалось завершить запись. Проверьте разрешения устройства и повторите попытку.' },
    },
    presenter: {
      title: 'Режим презентации', audienceWindowTitle: 'Astraea Present · Аудитория', slidePosition: (slide, total) => `Слайд ${slide} из ${total}`, paused: 'Пауза', kioskExitHint: 'Киоск · Esc — выход',
      blackScreen: 'Чёрный экран', whiteScreen: 'Белый экран', clearInk: 'Очистить пометки на текущем слайде', previous: 'Назад', next: 'Далее', keepInk: 'Сохранить пометки', exitShow: 'Завершить показ',
      confirmTitle: 'Сохранить пометки докладчика?', confirmMessage: 'Во время показа были изменены аннотации. Сохраните их в презентации или отмените изменения сеанса.', discard: 'Отменить', keepAndExit: 'Сохранить и выйти',
      errors: { audienceUnavailable: 'Не удалось открыть окно аудитории. Проверьте разрешения всплывающих окон и повторите попытку.', inkSaveFailed: 'Не удалось сохранить пометки докладчика. Оставьте презентацию открытой и повторите попытку.', generic: 'Не удалось выполнить действие режима презентации. Повторите попытку.' },
    },
    controls: {
      elapsedTime: (elapsed) => `Прошло времени: ${elapsed}`, currentTime: 'Текущее время', slideTimer: (elapsed) => `Слайд ${elapsed}`,
      pauseSlideshow: 'Приостановить показ', resumeSlideshow: 'Продолжить показ', laserPointer: 'Лазерная указка', pen: 'Перо', highlighter: 'Маркер', eraser: 'Ластик',
      zoomOut: 'Уменьшить масштаб', zoomIn: 'Увеличить масштаб', loopSequence: 'Повторять последовательность', kioskMode: 'Режим киоска', openAudience: 'Открыть отдельное окно для аудитории', fullscreenAudience: 'Развернуть окно аудитории',
      remoteStatus: (available, token) => available ? `Пульт ${token}` : 'Пульт выключен', remoteTitle: (available, token) => available ? `Локальный код подключения: ${token}` : 'Локальный пульт недоступен',
    },
    sidePanel: {
      nextSlide: 'Следующий слайд', endOfSequence: 'Конец последовательности', noFurtherSlide: 'Следующего слайда нет.', sequence: 'Последовательность', slideNavigator: 'Миниатюры слайдов',
      untitledSlide: 'Без названия', slideFallback: 'Слайд', selectSlide: (slide, title) => `Перейти к слайду ${slide}: ${title}`,
      speakerNotes: 'Заметки докладчика', noPrivateNotes: 'Для этого слайда нет личных заметок.', decreaseNotesFont: 'Уменьшить размер текста заметок докладчика', increaseNotesFont: 'Увеличить размер текста заметок докладчика',
    },
  },
  'it-IT': {
    recording: {
      title: 'Studio di registrazione e prove', close: 'Chiudi lo studio di registrazione e prove Present', modes: { record: 'Registra', rehearse: 'Prova', timeline: 'Cronologia' },
      slidePreview: (slide) => `Anteprima diapositiva ${slide}`, previousSlide: 'Diapositiva precedente', nextSlide: 'Diapositiva successiva', slidePosition: (slide, total) => `Diapositiva ${slide} di ${total}`, slideFallback: (slide) => `Diapositiva ${slide}`,
      capture: 'Acquisizione', microphoneNarration: 'Narrazione con microfono', cameraTrack: 'Traccia della videocamera', consentText: 'Consento ad Astraea Present di richiedere l’autorizzazione del sistema operativo per il microfono e la videocamera selezionati all’avvio della registrazione. Nessun dispositivo viene usato prima che scelga Registra.',
      recordTake: 'Registra una ripresa', stopAndSave: 'Interrompi e salva', inkTools: { pointer: 'Puntatore', pen: 'Penna', highlighter: 'Evidenziatore' },
      transcriptCaptions: 'Trascrizione e sottotitoli', transcriptPlaceholder: 'Righe di trascrizione o sottotitoli…', transcriptGuidance: 'Ogni riga non vuota diventa un sottotitolo temporizzato. La voce resta su questo dispositivo e non viene inviata a servizi cloud.',
      slideTimer: 'Diapositiva', totalTimer: 'Totale', pause: 'Pausa', start: 'Avvia', saveAndNext: 'Salva e avanti', resetRehearsal: 'Reimposta la prova',
      timelineTitle: 'Cronologia registrazione della presentazione', timelineSlide: (slide, title) => `Vai alla diapositiva ${slide}: ${title}`, untitledSlide: 'Diapositiva senza titolo',
      cueCount: (count) => `${count} cue`, noTake: 'Nessuna ripresa', recordingIndicator: 'REC', teleprompterNotes: 'Teleprompter e note', noSpeakerNotes: 'Nessuna nota del relatore per questa diapositiva.', takesForSlide: 'Riprese di questa diapositiva',
      removeTake: (slideId, timestamp) => `Rimuovi la ripresa della diapositiva ${slideId}, creata ${timestamp}`, playAudioTake: 'Riproduci la narrazione registrata', playCameraTake: 'Riproduci la registrazione video',
      audioTrack: 'Audio', cameraTrackLabel: 'Videocamera', interactionEventCount: (count) => `${count} eventi`, noTakes: 'Nessuna ripresa registrata.', activeTake: 'Ripresa attiva', rehearsed: 'Provato', pointerInk: 'Puntatore e annotazioni',
      errors: { consentRequired: 'Conferma l’autorizzazione del dispositivo prima di richiedere l’accesso a videocamera o microfono.', sourceRequired: 'Seleziona un microfono o una videocamera prima di registrare.', stopBeforeClose: 'Interrompi la registrazione prima di chiudere per non perdere la ripresa.', generic: 'Impossibile completare la registrazione. Controlla le autorizzazioni del dispositivo e riprova.' },
    },
    presenter: {
      title: 'Modalità presentazione', audienceWindowTitle: 'Astraea Present · Pubblico', slidePosition: (slide, total) => `Diapositiva ${slide} di ${total}`, paused: 'In pausa', kioskExitHint: 'Chiosco · Premi Esc per uscire',
      blackScreen: 'Nero', whiteScreen: 'Bianco', clearInk: 'Cancella le annotazioni della diapositiva corrente', previous: 'Precedente', next: 'Successiva', keepInk: 'Mantieni annotazioni', exitShow: 'Esci dalla presentazione',
      confirmTitle: 'Mantenere le annotazioni del relatore?', confirmMessage: 'Durante la presentazione sono state modificate delle annotazioni. Mantienile nella presentazione o annulla questa sessione.', discard: 'Annulla', keepAndExit: 'Mantieni ed esci',
      errors: { audienceUnavailable: 'Impossibile aprire la finestra del pubblico. Controlla i permessi dei popup e riprova.', inkSaveFailed: 'Impossibile salvare le annotazioni del relatore. Lascia aperta la presentazione e riprova.', generic: 'Impossibile completare l’azione del relatore. Riprova.' },
    },
    controls: {
      elapsedTime: (elapsed) => `Tempo trascorso: ${elapsed}`, currentTime: 'Ora corrente', slideTimer: (elapsed) => `Diapositiva ${elapsed}`,
      pauseSlideshow: 'Metti in pausa la presentazione', resumeSlideshow: 'Riprendi la presentazione', laserPointer: 'Puntatore laser', pen: 'Penna', highlighter: 'Evidenziatore', eraser: 'Gomma',
      zoomOut: 'Riduci zoom', zoomIn: 'Aumenta zoom', loopSequence: 'Ripeti sequenza', kioskMode: 'Modalità chiosco', openAudience: 'Apri una finestra separata per il pubblico', fullscreenAudience: 'Apri a schermo intero per il pubblico',
      remoteStatus: (available, token) => available ? `Telecomando ${token}` : 'Telecomando spento', remoteTitle: (available, token) => available ? `Token di associazione locale: ${token}` : 'Telecomando locale non disponibile',
    },
    sidePanel: {
      nextSlide: 'Diapositiva successiva', endOfSequence: 'Fine sequenza', noFurtherSlide: 'Nessun’altra diapositiva.', sequence: 'Sequenza', slideNavigator: 'Navigatore miniature diapositiva',
      untitledSlide: 'Senza titolo', slideFallback: 'Diapositiva', selectSlide: (slide, title) => `Vai alla diapositiva ${slide}: ${title}`,
      speakerNotes: 'Note del relatore', noPrivateNotes: 'Nessuna nota privata per questa diapositiva.', decreaseNotesFont: 'Riduci la dimensione del testo delle note', increaseNotesFont: 'Aumenta la dimensione del testo delle note',
    },
  },
  'es-ES': {
    recording: {
      title: 'Estudio de grabación y ensayo', close: 'Cerrar el estudio de grabación y ensayo de Present', modes: { record: 'Grabar', rehearse: 'Ensayar', timeline: 'Cronología' },
      slidePreview: (slide) => `Vista previa de la diapositiva ${slide}`, previousSlide: 'Diapositiva anterior', nextSlide: 'Diapositiva siguiente', slidePosition: (slide, total) => `Diapositiva ${slide} de ${total}`, slideFallback: (slide) => `Diapositiva ${slide}`,
      capture: 'Captura', microphoneNarration: 'Narración con micrófono', cameraTrack: 'Pista de cámara', consentText: 'Permito que Astraea Present solicite al sistema operativo acceso al micrófono y la cámara seleccionados al iniciar la grabación. No se accede a ningún dispositivo antes de elegir Grabar.',
      recordTake: 'Grabar toma', stopAndSave: 'Detener y guardar', inkTools: { pointer: 'Puntero', pen: 'Pluma', highlighter: 'Resaltador' },
      transcriptCaptions: 'Transcripción y subtítulos', transcriptPlaceholder: 'Líneas de transcripción o subtítulos…', transcriptGuidance: 'Cada línea no vacía se convierte en un subtítulo con tiempo. La voz permanece en este dispositivo y no se envía a un servicio en la nube.',
      slideTimer: 'Diapositiva', totalTimer: 'Total', pause: 'Pausar', start: 'Iniciar', saveAndNext: 'Guardar y continuar', resetRehearsal: 'Restablecer ensayo',
      timelineTitle: 'Cronología de grabación de la presentación', timelineSlide: (slide, title) => `Ir a la diapositiva ${slide}: ${title}`, untitledSlide: 'Diapositiva sin título',
      cueCount: (count) => `${count} subtítulos`, noTake: 'Sin toma', recordingIndicator: 'GRAB', teleprompterNotes: 'Teleprónter y notas', noSpeakerNotes: 'Esta diapositiva no tiene notas del presentador.', takesForSlide: 'Tomas de esta diapositiva',
      removeTake: (slideId, timestamp) => `Eliminar la toma de grabación de la diapositiva ${slideId}, creada ${timestamp}`, playAudioTake: 'Reproducir narración grabada', playCameraTake: 'Reproducir grabación de cámara',
      audioTrack: 'Audio', cameraTrackLabel: 'Cámara', interactionEventCount: (count) => `${count} eventos`, noTakes: 'Aún no hay tomas grabadas.', activeTake: 'Toma activa', rehearsed: 'Ensayado', pointerInk: 'Puntero y tinta',
      errors: { consentRequired: 'Confirma el permiso del dispositivo antes de solicitar acceso a la cámara o al micrófono.', sourceRequired: 'Selecciona un micrófono o una cámara antes de grabar.', stopBeforeClose: 'Detén la grabación antes de cerrar para no perder la toma.', generic: 'No se pudo completar la grabación. Comprueba los permisos del dispositivo e inténtalo de nuevo.' },
    },
    presenter: {
      title: 'Modo de presentación', audienceWindowTitle: 'Astraea Present · Audiencia', slidePosition: (slide, total) => `Diapositiva ${slide} de ${total}`, paused: 'En pausa', kioskExitHint: 'Quiosco · Pulsa Esc para salir',
      blackScreen: 'Negro', whiteScreen: 'Blanco', clearInk: 'Borrar las anotaciones de la diapositiva actual', previous: 'Anterior', next: 'Siguiente', keepInk: 'Conservar anotaciones', exitShow: 'Salir de la presentación',
      confirmTitle: '¿Conservar las anotaciones del presentador?', confirmMessage: 'Se modificaron anotaciones durante la presentación. Consérvalas en la presentación o descarta esta sesión.', discard: 'Descartar', keepAndExit: 'Conservar y salir',
      errors: { audienceUnavailable: 'No se pudo abrir la ventana del público. Comprueba los permisos de ventanas emergentes e inténtalo de nuevo.', inkSaveFailed: 'No se pudieron guardar las anotaciones del presentador. Mantén abierta la presentación e inténtalo de nuevo.', generic: 'No se pudo completar la acción del presentador. Inténtalo de nuevo.' },
    },
    controls: {
      elapsedTime: (elapsed) => `Tiempo transcurrido: ${elapsed}`, currentTime: 'Hora actual', slideTimer: (elapsed) => `Diapositiva ${elapsed}`,
      pauseSlideshow: 'Pausar presentación', resumeSlideshow: 'Reanudar presentación', laserPointer: 'Puntero láser', pen: 'Pluma', highlighter: 'Resaltador', eraser: 'Borrador',
      zoomOut: 'Alejar', zoomIn: 'Acercar', loopSequence: 'Repetir secuencia', kioskMode: 'Modo quiosco', openAudience: 'Abrir una ventana independiente para el público', fullscreenAudience: 'Mostrar al público en pantalla completa',
      remoteStatus: (available, token) => available ? `Control remoto ${token}` : 'Control remoto desactivado', remoteTitle: (available, token) => available ? `Token de vinculación local: ${token}` : 'Control remoto local no disponible',
    },
    sidePanel: {
      nextSlide: 'Diapositiva siguiente', endOfSequence: 'Fin de la secuencia', noFurtherSlide: 'No hay más diapositivas.', sequence: 'Secuencia', slideNavigator: 'Navegador de miniaturas',
      untitledSlide: 'Sin título', slideFallback: 'Diapositiva', selectSlide: (slide, title) => `Ir a la diapositiva ${slide}: ${title}`,
      speakerNotes: 'Notas del presentador', noPrivateNotes: 'Esta diapositiva no tiene notas privadas.', decreaseNotesFont: 'Reducir el tamaño del texto de las notas', increaseNotesFont: 'Aumentar el tamaño del texto de las notas',
    },
  },
  'ja-JP': {
    recording: {
      title: '録画・リハーサルスタジオ', close: 'Present の録画・リハーサルスタジオを閉じる', modes: { record: '録画', rehearse: 'リハーサル', timeline: 'タイムライン' },
      slidePreview: (slide) => `スライド ${slide} のプレビュー`, previousSlide: '前のスライド', nextSlide: '次のスライド', slidePosition: (slide, total) => `${total} 枚中 ${slide} 枚目`, slideFallback: (slide) => `スライド ${slide}`,
      capture: '録音・録画', microphoneNarration: 'マイク音声', cameraTrack: 'カメラ映像', consentText: '録画開始時に、選択したカメラとマイクの OS 権限を Astraea Present が要求することを許可します。「録画」を選択するまではデバイスにアクセスしません。',
      recordTake: 'テイクを録画', stopAndSave: '停止して保存', inkTools: { pointer: 'ポインター', pen: 'ペン', highlighter: '蛍光ペン' },
      transcriptCaptions: '文字起こしと字幕', transcriptPlaceholder: '文字起こしまたは字幕の行…', transcriptGuidance: '空でない各行を時間付き字幕として登録します。音声はこのデバイス内に保持され、クラウドには送信されません。',
      slideTimer: 'スライド', totalTimer: '合計', pause: '一時停止', start: '開始', saveAndNext: '保存して次へ', resetRehearsal: 'リハーサルをリセット',
      timelineTitle: 'プレゼンテーション録画タイムライン', timelineSlide: (slide, title) => `スライド ${slide} に移動: ${title}`, untitledSlide: 'タイトルなしのスライド',
      cueCount: (count) => `${count} 件の字幕`, noTake: 'テイクなし', recordingIndicator: '録画中', teleprompterNotes: 'テレプロンプターとノート', noSpeakerNotes: 'このスライドに発表者ノートはありません。', takesForSlide: 'このスライドのテイク',
      removeTake: (slideId, timestamp) => `スライド ${slideId} の録画テイク（${timestamp} 作成）を削除`, playAudioTake: '録音したナレーションを再生', playCameraTake: 'カメラ録画を再生',
      audioTrack: '音声', cameraTrackLabel: 'カメラ', interactionEventCount: (count) => `${count} 件の操作`, noTakes: '録画したテイクはありません。', activeTake: '選択中のテイク', rehearsed: 'リハーサル', pointerInk: 'ポインターと描画',
      errors: { consentRequired: 'カメラまたはマイクへのアクセスを要求する前に、デバイス権限を確認してください。', sourceRequired: '録画前にマイクまたはカメラを選択してください。', stopBeforeClose: 'テイクを失わないよう、閉じる前に録画を停止してください。', generic: '録画を完了できませんでした。デバイスの権限を確認して再試行してください。' },
    },
    presenter: {
      title: 'プレゼンテーションモード', audienceWindowTitle: 'Astraea Present · 観客', slidePosition: (slide, total) => `${total} 枚中 ${slide} 枚目`, paused: '一時停止中', kioskExitHint: 'キオスク · Esc で終了',
      blackScreen: '黒画面', whiteScreen: '白画面', clearInk: '現在のスライドの描画を消去', previous: '前へ', next: '次へ', keepInk: '描画を保存', exitShow: '発表を終了',
      confirmTitle: '発表者の描画を保存しますか？', confirmMessage: '発表中に注釈が変更されました。プレゼンテーションに保存するか、このセッションの変更を破棄してください。', discard: '破棄', keepAndExit: '保存して終了',
      errors: { audienceUnavailable: '観客用ウィンドウを開けませんでした。ポップアップの権限を確認して再試行してください。', inkSaveFailed: '発表者の注釈を保存できませんでした。プレゼンテーションを開いたまま再試行してください。', generic: 'プレゼンテーション操作を完了できませんでした。再試行してください。' },
    },
    controls: {
      elapsedTime: (elapsed) => `経過時間: ${elapsed}`, currentTime: '現在時刻', slideTimer: (elapsed) => `スライド ${elapsed}`,
      pauseSlideshow: 'スライドショーを一時停止', resumeSlideshow: 'スライドショーを再開', laserPointer: 'レーザーポインター', pen: 'ペン', highlighter: '蛍光ペン', eraser: '消しゴム',
      zoomOut: '縮小', zoomIn: '拡大', loopSequence: 'シーケンスを繰り返す', kioskMode: 'キオスクモード', openAudience: '観客用の別ウィンドウを開く', fullscreenAudience: '観客用ウィンドウを全画面表示',
      remoteStatus: (available, token) => available ? `リモート ${token}` : 'リモート オフ', remoteTitle: (available, token) => available ? `ローカル接続トークン: ${token}` : 'ローカルリモート操作は利用できません',
    },
    sidePanel: {
      nextSlide: '次のスライド', endOfSequence: 'シーケンスの末尾', noFurtherSlide: '次のスライドはありません。', sequence: 'シーケンス', slideNavigator: 'スライドのサムネイル一覧',
      untitledSlide: 'タイトルなし', slideFallback: 'スライド', selectSlide: (slide, title) => `スライド ${slide} に移動: ${title}`,
      speakerNotes: '発表者ノート', noPrivateNotes: 'このスライドに個人用ノートはありません。', decreaseNotesFont: '発表者ノートの文字を小さくする', increaseNotesFont: '発表者ノートの文字を大きくする',
    },
  },
  'zh-CN': {
    recording: {
      title: '录制与排练工作室', close: '关闭 Present 录制与排练工作室', modes: { record: '录制', rehearse: '排练', timeline: '时间线' },
      slidePreview: (slide) => `第 ${slide} 张幻灯片预览`, previousSlide: '上一张幻灯片', nextSlide: '下一张幻灯片', slidePosition: (slide, total) => `第 ${slide} 张，共 ${total} 张`, slideFallback: (slide) => `第 ${slide} 张幻灯片`,
      capture: '采集', microphoneNarration: '麦克风旁白', cameraTrack: '摄像头轨道', consentText: '我允许 Astraea Present 在开始录制时请求操作系统授予所选麦克风和摄像头权限。在我选择“录制”之前不会访问设备。',
      recordTake: '录制一段', stopAndSave: '停止并保存', inkTools: { pointer: '指针', pen: '画笔', highlighter: '荧光笔' },
      transcriptCaptions: '转录与字幕', transcriptPlaceholder: '转录或字幕行…', transcriptGuidance: '每个非空行都会生成带时间的字幕。语音保留在此设备上，不会发送到云服务。',
      slideTimer: '幻灯片', totalTimer: '总计', pause: '暂停', start: '开始', saveAndNext: '保存并继续', resetRehearsal: '重置排练',
      timelineTitle: '演示文稿录制时间线', timelineSlide: (slide, title) => `转到第 ${slide} 张：${title}`, untitledSlide: '未命名幻灯片',
      cueCount: (count) => `${count} 条字幕`, noTake: '无录制段', recordingIndicator: '录制中', teleprompterNotes: '提词器与备注', noSpeakerNotes: '此幻灯片没有演讲者备注。', takesForSlide: '此幻灯片的录制段',
      removeTake: (slideId, timestamp) => `删除幻灯片 ${slideId} 在 ${timestamp} 创建的录制段`, playAudioTake: '播放录制的旁白', playCameraTake: '播放摄像头录像',
      audioTrack: '音频', cameraTrackLabel: '摄像头', interactionEventCount: (count) => `${count} 个事件`, noTakes: '尚无录制段。', activeTake: '当前录制段', rehearsed: '已排练', pointerInk: '指针与批注',
      errors: { consentRequired: '请求摄像头或麦克风权限前，请先确认设备授权。', sourceRequired: '录制前请选择麦克风或摄像头。', stopBeforeClose: '关闭前请停止录制，以免录制内容丢失。', generic: '无法完成录制。请检查设备权限并重试。' },
    },
    presenter: {
      title: '演示模式', audienceWindowTitle: 'Astraea Present · 观众', slidePosition: (slide, total) => `第 ${slide} 张，共 ${total} 张`, paused: '已暂停', kioskExitHint: '展台模式 · 按 Esc 退出',
      blackScreen: '黑屏', whiteScreen: '白屏', clearInk: '清除当前幻灯片上的批注', previous: '上一张', next: '下一张', keepInk: '保留批注', exitShow: '退出放映',
      confirmTitle: '保留演讲者批注？', confirmMessage: '放映期间修改了批注。可将其保留在演示文稿中，或放弃本次会话的更改。', discard: '放弃', keepAndExit: '保留并退出',
      errors: { audienceUnavailable: '无法打开观众窗口。请检查弹出窗口权限并重试。', inkSaveFailed: '无法保存演讲者批注。请保持演示文稿打开并重试。', generic: '无法完成演示操作。请重试。' },
    },
    controls: {
      elapsedTime: (elapsed) => `已用时间：${elapsed}`, currentTime: '当前时间', slideTimer: (elapsed) => `幻灯片 ${elapsed}`,
      pauseSlideshow: '暂停放映', resumeSlideshow: '继续放映', laserPointer: '激光笔', pen: '画笔', highlighter: '荧光笔', eraser: '橡皮擦',
      zoomOut: '缩小', zoomIn: '放大', loopSequence: '循环播放序列', kioskMode: '展台模式', openAudience: '打开独立观众窗口', fullscreenAudience: '全屏显示观众窗口',
      remoteStatus: (available, token) => available ? `遥控 ${token}` : '遥控已关闭', remoteTitle: (available, token) => available ? `本地配对令牌：${token}` : '本地遥控适配器不可用',
    },
    sidePanel: {
      nextSlide: '下一张幻灯片', endOfSequence: '序列结束', noFurtherSlide: '没有更多幻灯片。', sequence: '序列', slideNavigator: '幻灯片缩略图导航',
      untitledSlide: '未命名', slideFallback: '幻灯片', selectSlide: (slide, title) => `转到第 ${slide} 张：${title}`,
      speakerNotes: '演讲者备注', noPrivateNotes: '此幻灯片没有私人备注。', decreaseNotesFont: '缩小演讲者备注文字', increaseNotesFont: '放大演讲者备注文字',
    },
  },
};

export function presentRecordingFailureCopy(locale: WorkspaceLocale, _cause: unknown): string {
  return PRESENT_STUDIO_COPY[locale].recording.errors.generic;
}

export function presenterFailureCopy(locale: WorkspaceLocale, _cause: unknown): string {
  return PRESENT_STUDIO_COPY[locale].presenter.errors.generic;
}
