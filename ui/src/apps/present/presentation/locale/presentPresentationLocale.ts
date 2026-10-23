// STATUS: PLATIN — focused copy for the Present multi-monitor start dialog and display windows.
//
// The display windows run without the Workspace shell, so they cannot use the shell provider. The
// locale is resolved from the stored Workspace preference in `display/presentDisplayLocale.ts`; this
// module only maps that locale to text. German and English are authored; other Workspace locales
// fall back to English instead of rendering a raw key.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

export interface PresentStartDialogCopy {
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly close: string;
  readonly cancel: string;
  readonly modeLegend: string;
  readonly multiLabel: string;
  readonly multiDescription: string;
  readonly singleLabel: string;
  readonly singleDescription: string;
  readonly audienceLabel: string;
  readonly audienceDescription: string;
  readonly presenterLabel: string;
  readonly presenterDescription: string;
  readonly primaryBadge: string;
  readonly monitorResolution: (width: number, height: number) => string;
  readonly sameMonitorWarning: string;
  readonly singleMonitorNotice: string;
  readonly nativeUnavailableTitle: string;
  readonly nativeUnavailableBody: string;
  readonly noMonitorsNotice: string;
  readonly startButton: string;
  readonly startingButton: string;
  readonly startAtSlide: (slide: number) => string;
  readonly preferenceNote: string;
  readonly errorTitle: string;
}

export interface PresentDisplayCopy {
  readonly connecting: string;
  readonly waitingForEditor: string;
  readonly retry: string;
  readonly editorLost: string;
  readonly channelUnavailableTitle: string;
  readonly channelUnavailableBody: string;
  readonly endedTitle: string;
  readonly endedBody: string;
  readonly timeoutTitle: string;
  readonly timeoutBody: string;
  readonly live: string;
  readonly disconnected: string;
  readonly slideCounter: (slide: number, total: number) => string;
  readonly nextSlide: string;
  readonly noNextSlide: string;
  readonly notes: string;
  readonly noNotes: string;
  readonly timerLabel: string;
  readonly blackScreenOn: string;
  readonly blackScreenOff: string;
  readonly endPresentation: string;
  readonly confirmEndTitle: string;
  readonly confirmEndBody: string;
  readonly confirmEndAction: string;
  readonly confirmEndCancel: string;
  readonly keyboardHint: string;
  readonly presenterWindowLabel: string;
  readonly audienceWindowLabel: string;
  readonly closeWindow: string;
  readonly emptyDeckTitle: string;
  readonly emptyDeckBody: string;
}

/** Machine codes produced by the editor session controller; the copy maps them to sentences. */
export type PresentSessionStartError =
  | 'already-running'
  | 'native-unavailable'
  | 'channel-unavailable'
  | 'session-invalid'
  | 'open-failed'
  | 'snapshot-too-large';

export type PresentSessionNotice =
  | 'ended-by-presenter'
  | 'ended-by-editor'
  | 'window-lost-audience'
  | 'window-lost-presenter'
  | 'window-unreachable';

export interface PresentEditorSessionCopy {
  readonly running: string;
  readonly roleReady: string;
  readonly roleWaiting: string;
  readonly blackOn: string;
  readonly blackOff: string;
  readonly stop: string;
  readonly slidePosition: (slide: number, total: number) => string;
  readonly notices: Readonly<Record<PresentSessionNotice, string>>;
  readonly errors: Readonly<Record<PresentSessionStartError, string>>;
}

export interface PresentPresentationCopy {
  readonly startDialog: PresentStartDialogCopy;
  readonly display: PresentDisplayCopy;
  readonly editor: PresentEditorSessionCopy;
}

const EN_US: PresentPresentationCopy = {
  startDialog: {
    kicker: 'Present',
    title: 'Start presentation',
    subtitle: 'Choose the screen for the projector and the screen for your notes, or present on this screen only.',
    close: 'Close presentation setup',
    cancel: 'Cancel',
    modeLegend: 'Presentation mode',
    multiLabel: 'Projector + presenter display',
    multiDescription: 'Two full-screen windows: the audience sees only the slide, you see the slide and your notes.',
    singleLabel: 'Single screen — normal presentation',
    singleDescription: 'The existing full-screen presenter view inside this window. No second display is opened.',
    audienceLabel: 'Projector / Audience',
    audienceDescription: 'What everyone sees — the slide only.',
    presenterLabel: 'Lectern / Presenter',
    presenterDescription: 'Slide on the left, speaker notes on the right.',
    primaryBadge: 'Primary',
    monitorResolution: (width, height) => `${width} × ${height}`,
    sameMonitorWarning: 'Both roles are on the same screen. The presenter window would cover the projector window.',
    singleMonitorNotice: 'Only one screen was found. Use the single-screen presentation; connect a second display for the two-window mode.',
    nativeUnavailableTitle: 'Two-window presentation is not available here',
    nativeUnavailableBody: 'The display bridge needs the native Astraea desktop app. This window can still run the normal single-screen presentation.',
    noMonitorsNotice: 'No screen could be read. The normal single-screen presentation stays available.',
    startButton: 'Start presentation',
    startingButton: 'Opening presentation windows…',
    startAtSlide: (slide) => `Starts at slide ${slide}`,
    preferenceNote: 'Your screen choice is remembered for the next start.',
    errorTitle: 'The presentation could not start',
  },
  display: {
    connecting: 'Connecting to the editor…',
    waitingForEditor: 'Waiting for the presentation data from the editor.',
    retry: 'Reconnect',
    editorLost: 'Connection to the editor was lost.',
    channelUnavailableTitle: 'This window cannot join the presentation',
    channelUnavailableBody: 'The browser context does not provide a same-origin message channel. Close this window and start the presentation again.',
    endedTitle: 'Presentation ended',
    endedBody: 'This presentation window can be closed.',
    timeoutTitle: 'No presentation data received',
    timeoutBody: 'The editor did not send the deck within the expected time. Start the presentation again from the editor.',
    live: 'Live',
    disconnected: 'Disconnected',
    slideCounter: (slide, total) => `Slide ${slide} of ${total}`,
    nextSlide: 'Next slide',
    noNextSlide: 'Last slide',
    notes: 'Speaker notes',
    noNotes: 'No speaker notes for this slide.',
    timerLabel: 'Elapsed',
    blackScreenOn: 'Black screen on',
    blackScreenOff: 'Black screen',
    endPresentation: 'End presentation',
    confirmEndTitle: 'End the presentation?',
    confirmEndBody: 'The projector window closes and the editor returns to the slide editor.',
    confirmEndAction: 'End presentation',
    confirmEndCancel: 'Keep presenting',
    keyboardHint: '← → or Space: navigate · B: black screen · Esc: end',
    presenterWindowLabel: 'Astraea Present · Presenter',
    audienceWindowLabel: 'Astraea Present · Audience',
    closeWindow: 'Close window',
    emptyDeckTitle: 'This deck has no slides',
    emptyDeckBody: 'Add slides in the editor, then start the presentation again.',
  },
  editor: {
    running: 'Presentation running',
    roleReady: 'Connected',
    roleWaiting: 'Waiting for window',
    blackOn: 'Black screen on',
    blackOff: 'Black screen',
    stop: 'End presentation',
    slidePosition: (slide, total) => `Slide ${slide} of ${total}`,
    notices: {
      'ended-by-presenter': 'The presenter display ended the presentation. Both display windows were closed.',
      'ended-by-editor': 'The presentation was ended from the editor. Both display windows were closed.',
      'window-lost-audience': 'The projector window was closed. The presentation was ended and the presenter window was closed.',
      'window-lost-presenter': 'The presenter window was closed. The presentation was ended and the projector window was closed.',
      'window-unreachable': 'A presentation window did not connect to the editor. The presentation was ended; check the native display support and start again.',
    },
    errors: {
      'already-running': 'A presentation is already running. End it from the status bar before starting a new one.',
      'native-unavailable': 'Two-window presentation needs the native Astraea desktop app. Use the single-screen presentation here.',
      'channel-unavailable': 'This browser context provides no same-origin channel, so the display windows cannot be synchronized.',
      'session-invalid': 'The presentation session could not be created.',
      'open-failed': 'The presentation windows could not be opened.',
      'snapshot-too-large': 'This deck is too large to send to the display windows in one snapshot.',
    },
  },
};

const DE_DE: PresentPresentationCopy = {
  startDialog: {
    kicker: 'Present',
    title: 'Präsentation starten',
    subtitle: 'Projektor-Bildschirm und Dozenten-Bildschirm wählen — oder nur auf diesem Bildschirm präsentieren.',
    close: 'Präsentations-Einrichtung schließen',
    cancel: 'Abbrechen',
    modeLegend: 'Präsentationsmodus',
    multiLabel: 'Projektor + Dozenten-Bildschirm',
    multiDescription: 'Zwei Vollbild-Fenster: Das Publikum sieht nur die Folie, du siehst Folie und Notizen.',
    singleLabel: 'Nur ein Bildschirm — normale Präsentation',
    singleDescription: 'Der vorhandene Vollbild-Presenter-Modus in diesem Fenster. Es wird kein zweiter Bildschirm geöffnet.',
    audienceLabel: 'Projektor / Audience',
    audienceDescription: 'Was alle sehen — ausschließlich die Folie.',
    presenterLabel: 'Dozent / Presenter',
    presenterDescription: 'Folie links, Sprechernotizen rechts.',
    primaryBadge: 'Primär',
    monitorResolution: (width, height) => `${width} × ${height}`,
    sameMonitorWarning: 'Beide Rollen liegen auf demselben Bildschirm. Das Presenter-Fenster würde das Projektor-Fenster verdecken.',
    singleMonitorNotice: 'Es wurde nur ein Bildschirm gefunden. Nutze die Einzelbildschirm-Präsentation; für den Zwei-Fenster-Modus einen zweiten Bildschirm anschließen.',
    nativeUnavailableTitle: 'Zwei-Fenster-Präsentation ist hier nicht verfügbar',
    nativeUnavailableBody: 'Die Display-Bridge benötigt die native Astraea-Desktop-App. Die normale Einzelbildschirm-Präsentation bleibt verfügbar.',
    noMonitorsNotice: 'Es konnte kein Bildschirm gelesen werden. Die normale Einzelbildschirm-Präsentation bleibt verfügbar.',
    startButton: 'Präsentation starten',
    startingButton: 'Präsentationsfenster werden geöffnet…',
    startAtSlide: (slide) => `Startet bei Folie ${slide}`,
    preferenceNote: 'Deine Bildschirmauswahl wird für den nächsten Start gemerkt.',
    errorTitle: 'Die Präsentation konnte nicht starten',
  },
  display: {
    connecting: 'Verbindung zum Editor wird hergestellt…',
    waitingForEditor: 'Warte auf die Präsentationsdaten vom Editor.',
    retry: 'Erneut verbinden',
    editorLost: 'Die Verbindung zum Editor wurde unterbrochen.',
    channelUnavailableTitle: 'Dieses Fenster kann der Präsentation nicht beitreten',
    channelUnavailableBody: 'Der Browser-Kontext stellt keinen same-origin Nachrichtenkanal bereit. Fenster schließen und die Präsentation im Editor neu starten.',
    endedTitle: 'Präsentation beendet',
    endedBody: 'Dieses Präsentationsfenster kann geschlossen werden.',
    timeoutTitle: 'Keine Präsentationsdaten empfangen',
    timeoutBody: 'Der Editor hat das Deck nicht rechtzeitig gesendet. Starte die Präsentation im Editor erneut.',
    live: 'Live',
    disconnected: 'Getrennt',
    slideCounter: (slide, total) => `Folie ${slide} von ${total}`,
    nextSlide: 'Nächste Folie',
    noNextSlide: 'Letzte Folie',
    notes: 'Notizen',
    noNotes: 'Für diese Folie sind keine Notizen hinterlegt.',
    timerLabel: 'Laufzeit',
    blackScreenOn: 'Schwarzbild aktiv',
    blackScreenOff: 'Schwarzbild',
    endPresentation: 'Präsentation beenden',
    confirmEndTitle: 'Präsentation beenden?',
    confirmEndBody: 'Das Projektor-Fenster wird geschlossen und der Editor kehrt zum Folien-Editor zurück.',
    confirmEndAction: 'Präsentation beenden',
    confirmEndCancel: 'Weiter präsentieren',
    keyboardHint: '← → oder Leertaste: navigieren · B: Schwarzbild · Esc: beenden',
    presenterWindowLabel: 'Astraea Present · Dozent',
    audienceWindowLabel: 'Astraea Present · Publikum',
    closeWindow: 'Fenster schließen',
    emptyDeckTitle: 'Dieses Deck enthält keine Folien',
    emptyDeckBody: 'Füge im Editor Folien hinzu und starte die Präsentation erneut.',
  },
  editor: {
    running: 'Präsentation läuft',
    roleReady: 'Verbunden',
    roleWaiting: 'Warte auf Fenster',
    blackOn: 'Schwarzbild aktiv',
    blackOff: 'Schwarzbild',
    stop: 'Präsentation beenden',
    slidePosition: (slide, total) => `Folie ${slide} von ${total}`,
    notices: {
      'ended-by-presenter': 'Der Dozenten-Bildschirm hat die Präsentation beendet. Beide Präsentationsfenster wurden geschlossen.',
      'ended-by-editor': 'Die Präsentation wurde im Editor beendet. Beide Präsentationsfenster wurden geschlossen.',
      'window-lost-audience': 'Das Projektor-Fenster wurde geschlossen. Die Präsentation wurde beendet und das Dozenten-Fenster geschlossen.',
      'window-lost-presenter': 'Das Dozenten-Fenster wurde geschlossen. Die Präsentation wurde beendet und das Projektor-Fenster geschlossen.',
      'window-unreachable': 'Ein Präsentationsfenster hat keine Verbindung zum Editor aufgebaut. Die Präsentation wurde beendet; prüfe die native Display-Unterstützung und starte erneut.',
    },
    errors: {
      'already-running': 'Es läuft bereits eine Präsentation. Beende sie zuerst über die Statusleiste.',
      'native-unavailable': 'Die Zwei-Fenster-Präsentation benötigt die native Astraea-Desktop-App. Hier ist die Einzelbildschirm-Präsentation verfügbar.',
      'channel-unavailable': 'Dieser Browser-Kontext stellt keinen same-origin Kanal bereit; die Präsentationsfenster können nicht synchronisiert werden.',
      'session-invalid': 'Die Präsentations-Session konnte nicht erzeugt werden.',
      'open-failed': 'Die Präsentationsfenster konnten nicht geöffnet werden.',
      'snapshot-too-large': 'Dieses Deck ist zu groß, um es in einem Snapshot an die Präsentationsfenster zu senden.',
    },
  },
};

const PRESENT_PRESENTATION_COPY: Partial<Record<WorkspaceLocale, PresentPresentationCopy>> = {
  'en-US': EN_US,
  'de-DE': DE_DE,
};

export function presentPresentationCopy(locale: WorkspaceLocale): PresentPresentationCopy {
  return PRESENT_PRESENTATION_COPY[locale] ?? EN_US;
}
