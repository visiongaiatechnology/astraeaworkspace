// STATUS: PLATIN — seven-locale copy for Present's primary toolbar and insert menus.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type TextKey =
  | 'historyControls' | 'undo' | 'undoTitle' | 'redo' | 'redoTitle'
  | 'cards' | 'cardsTitle' | 'bullets' | 'bulletsTitle' | 'chart' | 'chartTitle' | 'blank' | 'blankTitle'
  | 'slideAspectRatio' | 'aspectRatio' | 'presentationTheme' | 'theme' | 'slideTransition' | 'transition'
  | 'transitionDirection' | 'transitionDuration' | 'transitionDurationMs' | 'transitionSound' | 'optionalLocalSound'
  | 'silent' | 'click' | 'chime' | 'whoosh' | 'advanceOnClick' | 'autoAdvance' | 'autoAdvanceSeconds'
  | 'previewTransition' | 'applyTransitionAll' | 'slideBackground' | 'brandKitMasters' | 'image' | 'insertImage'
  | 'text' | 'insertTextBox' | 'insertCode' | 'insertChart' | 'insertTable' | 'insertMedia' | 'insertWorkspace'
  | 'shapeMenu' | 'shape' | 'widgetMenu' | 'widget' | 'diagramMenu' | 'diagram'
  | 'exportVideo' | 'speakerCoach' | 'sections' | 'rehearsal' | 'slideComments' | 'openSlideComments'
  | 'objectInspector' | 'layers' | 'animations' | 'speakerNotes' | 'notes';

type PresentToolbarCopy = {
  text: Readonly<Record<TextKey, string>>;
  slideSizes: Readonly<Record<string, string>>;
  transitions: Readonly<Record<string, string>>;
  directions: Readonly<Record<string, string>>;
  sounds: Readonly<Record<string, string>>;
  shapes: Readonly<Record<string, string>>;
  widgets: Readonly<Record<string, string>>;
  diagrams: Readonly<Record<string, string>>;
  openSlideComments: (count: number) => string;
};

export const PRESENT_TOOLBAR_COPY: Readonly<Record<WorkspaceLocale, PresentToolbarCopy>> = {
  'en-US': {
    text: {
      historyControls: 'Present history controls', undo: 'Undo', undoTitle: 'Undo (Ctrl/Cmd+Z)', redo: 'Redo', redoTitle: 'Redo (Ctrl/Cmd+Y)',
      cards: 'Cards', cardsTitle: 'Cards layout', bullets: 'Bullets', bulletsTitle: 'Bullet points', chart: 'Chart', chartTitle: 'Chart layout', blank: 'Blank', blankTitle: 'Blank canvas',
      slideAspectRatio: 'Slide aspect ratio', aspectRatio: 'Aspect ratio', presentationTheme: 'Presentation theme', theme: 'Theme', slideTransition: 'Slide transition', transition: 'Transition',
      transitionDirection: 'Transition direction', transitionDuration: 'Transition duration', transitionDurationMs: 'Transition duration in milliseconds', transitionSound: 'Transition sound', optionalLocalSound: 'Optional local transition sound',
      silent: 'Silent', click: 'Click', chime: 'Chime', whoosh: 'Whoosh', advanceOnClick: 'Allow mouse or touch click to advance', autoAdvance: 'Automatically advance this slide after seconds', autoAdvanceSeconds: 'Automatic advance in seconds',
      previewTransition: 'Preview transition', applyTransitionAll: 'Apply this transition and advance settings to all slides', slideBackground: 'Slide background color', brandKitMasters: 'Brand kit and masters', image: 'Image', insertImage: 'Insert image',
      text: 'Text', insertTextBox: 'Insert free-positioned text box', insertCode: 'Insert code snippet', insertChart: 'Insert chart', insertTable: 'Insert table', insertMedia: 'Insert video or audio narration', insertWorkspace: 'Insert live or frozen Workspace object', shapeMenu: 'Shapes', shape: 'Shape', widgetMenu: 'Widgets', widget: 'Widget', diagramMenu: 'Smart diagrams', diagram: 'Diagram',
      exportVideo: 'Export video deck (MP4 / WebM)', speakerCoach: 'Local speaker coach and speech analysis', sections: 'Sections', rehearsal: 'Recording and rehearsal studio', slideComments: 'Slide comments', openSlideComments: 'Open slide comments',
      objectInspector: 'Object inspector', layers: 'Layers', animations: 'Animations', speakerNotes: 'Speaker notes', notes: 'Notes',
    },
    slideSizes: { '16:9': 'Widescreen (16:9)', '16:10': 'Modern (16:10)', '4:3': 'Standard (4:3)', A4: 'Print / handout (A4)' },
    transitions: { none: 'None', fade: 'Fade', push: 'Push', wipe: 'Wipe', split: 'Split', reveal: 'Reveal', cover: 'Cover', uncover: 'Uncover', zoom: 'Zoom', morph: 'Morph' },
    directions: { vertical: 'Vertical', horizontal: 'Horizontal', left: 'Left', right: 'Right', up: 'Up', down: 'Down' },
    sounds: { none: 'Silent', click: 'Click', chime: 'Chime', whoosh: 'Whoosh' },
    shapes: { rectangle: 'Rectangle', 'rounded-rectangle': 'Rounded box', ellipse: 'Circle / ellipse', triangle: 'Triangle', diamond: 'Diamond / decision', 'arrow-right': 'Right arrow', 'arrow-left': 'Left arrow', star: 'Star', callout: 'Callout bubble', line: 'Divider line' },
    widgets: { kpi: 'KPI / metric card', progress: 'Progress bar', 'progress-ring': 'Progress ring', gauge: 'Percentage gauge', milestone: 'Timeline / milestone strip', roadmap: 'Process / roadmap', comparison: 'Comparison card', quote: 'Quote / profile / testimonial', status: 'Status / badge matrix', calendar: 'Calendar', 'icon-stat': 'Icon / stat block', device: 'Device / browser mockup', gallery: 'Gallery', rating: 'Rating scale' },
    diagrams: { process: 'Process pipeline', timeline: 'Milestone timeline', matrix: '2×2 strategic matrix', hierarchy: 'Organization / hierarchy tree' },
    openSlideComments: (count) => `Open slide comments (${count})`,
  },
  'de-DE': {
    text: {
      historyControls: 'Verlauf in Present', undo: 'Rückgängig', undoTitle: 'Rückgängig (Strg/Cmd+Z)', redo: 'Wiederholen', redoTitle: 'Wiederholen (Strg/Cmd+Y)',
      cards: 'Karten', cardsTitle: 'Kartenlayout', bullets: 'Aufzählung', bulletsTitle: 'Aufzählungspunkte', chart: 'Diagramm', chartTitle: 'Diagrammlayout', blank: 'Leer', blankTitle: 'Leere Arbeitsfläche',
      slideAspectRatio: 'Folien-Seitenverhältnis', aspectRatio: 'Seitenverhältnis', presentationTheme: 'Präsentationsthema', theme: 'Thema', slideTransition: 'Folienübergang', transition: 'Übergang',
      transitionDirection: 'Übergangsrichtung', transitionDuration: 'Übergangsdauer', transitionDurationMs: 'Übergangsdauer in Millisekunden', transitionSound: 'Übergangston', optionalLocalSound: 'Optionaler lokaler Übergangston',
      silent: 'Stumm', click: 'Klick', chime: 'Glockenton', whoosh: 'Rauschen', advanceOnClick: 'Weiterblättern per Maus- oder Touch-Klick erlauben', autoAdvance: 'Diese Folie nach einer Zeit automatisch weiterschalten', autoAdvanceSeconds: 'Automatisch nach Sekunden weiterblättern',
      previewTransition: 'Übergang anzeigen', applyTransitionAll: 'Übergang und Weiterschalten auf alle Folien anwenden', slideBackground: 'Folienhintergrundfarbe', brandKitMasters: 'Markenkit und Master', image: 'Bild', insertImage: 'Bild einfügen',
      text: 'Text', insertTextBox: 'Freies Textfeld einfügen', insertCode: 'Codeausschnitt einfügen', insertChart: 'Diagramm einfügen', insertTable: 'Tabelle einfügen', insertMedia: 'Video oder Audio-Erzählung einfügen', insertWorkspace: 'Live- oder eingefrorenes Workspace-Objekt einfügen', shapeMenu: 'Formen', shape: 'Form', widgetMenu: 'Widgets', widget: 'Widget', diagramMenu: 'Intelligente Diagramme', diagram: 'Diagramm',
      exportVideo: 'Foliensatz als Video exportieren (MP4 / WebM)', speakerCoach: 'Lokaler Sprechercoach und Sprechanalyse', sections: 'Abschnitte', rehearsal: 'Aufnahme- und Probenstudio', slideComments: 'Folienkommentare', openSlideComments: 'Folienkommentare öffnen',
      objectInspector: 'Objektinspektor', layers: 'Ebenen', animations: 'Animationen', speakerNotes: 'Sprechernotizen', notes: 'Notizen',
    },
    slideSizes: { '16:9': 'Breitbild (16:9)', '16:10': 'Modern (16:10)', '4:3': 'Standard (4:3)', A4: 'Druck / Handzettel (A4)' },
    transitions: { none: 'Keine', fade: 'Überblenden', push: 'Schieben', wipe: 'Wischen', split: 'Teilen', reveal: 'Einblenden', cover: 'Überdecken', uncover: 'Aufdecken', zoom: 'Zoom', morph: 'Morphing' },
    directions: { vertical: 'Vertikal', horizontal: 'Horizontal', left: 'Links', right: 'Rechts', up: 'Nach oben', down: 'Nach unten' },
    sounds: { none: 'Stumm', click: 'Klick', chime: 'Glockenton', whoosh: 'Rauschen' },
    shapes: { rectangle: 'Rechteck', 'rounded-rectangle': 'Abgerundetes Rechteck', ellipse: 'Kreis / Ellipse', triangle: 'Dreieck', diamond: 'Raute / Entscheidung', 'arrow-right': 'Pfeil nach rechts', 'arrow-left': 'Pfeil nach links', star: 'Stern', callout: 'Sprechblase', line: 'Trennlinie' },
    widgets: { kpi: 'KPI- / Kennzahlenkarte', progress: 'Fortschrittsbalken', 'progress-ring': 'Fortschrittsring', gauge: 'Prozentanzeige', milestone: 'Zeitachse / Meilensteine', roadmap: 'Prozess / Fahrplan', comparison: 'Vergleichskarte', quote: 'Zitat / Profil / Referenz', status: 'Status- / Kennzeichenmatrix', calendar: 'Kalender', 'icon-stat': 'Symbol- / Kennzahlenblock', device: 'Geräte- / Browser-Vorschau', gallery: 'Galerie', rating: 'Bewertungsskala' },
    diagrams: { process: 'Prozesspipeline', timeline: 'Meilenstein-Zeitachse', matrix: 'Strategiematrix 2×2', hierarchy: 'Organisations- / Hierarchiebaum' },
    openSlideComments: (count) => `Folienkommentare öffnen (${count})`,
  },
  'it-IT': {
    text: {
      historyControls: 'Cronologia Present', undo: 'Annulla', undoTitle: 'Annulla (Ctrl/Cmd+Z)', redo: 'Ripeti', redoTitle: 'Ripeti (Ctrl/Cmd+Y)',
      cards: 'Schede', cardsTitle: 'Layout a schede', bullets: 'Elenco puntato', bulletsTitle: 'Punti elenco', chart: 'Grafico', chartTitle: 'Layout grafico', blank: 'Vuota', blankTitle: 'Area vuota',
      slideAspectRatio: 'Proporzioni diapositiva', aspectRatio: 'Proporzioni', presentationTheme: 'Tema presentazione', theme: 'Tema', slideTransition: 'Transizione diapositiva', transition: 'Transizione',
      transitionDirection: 'Direzione transizione', transitionDuration: 'Durata transizione', transitionDurationMs: 'Durata transizione in millisecondi', transitionSound: 'Suono transizione', optionalLocalSound: 'Suono di transizione locale facoltativo',
      silent: 'Silenzioso', click: 'Clic', chime: 'Rintocco', whoosh: 'Sibilo', advanceOnClick: 'Consenti di avanzare con clic del mouse o tocco', autoAdvance: 'Avanza automaticamente dopo alcuni secondi', autoAdvanceSeconds: 'Avanzamento automatico in secondi',
      previewTransition: 'Anteprima transizione', applyTransitionAll: 'Applica transizione e avanzamento a tutte le diapositive', slideBackground: 'Colore di sfondo diapositiva', brandKitMasters: 'Kit brand e master', image: 'Immagine', insertImage: 'Inserisci immagine',
      text: 'Testo', insertTextBox: 'Inserisci casella di testo libera', insertCode: 'Inserisci frammento di codice', insertChart: 'Inserisci grafico', insertTable: 'Inserisci tabella', insertMedia: 'Inserisci narrazione video o audio', insertWorkspace: 'Inserisci oggetto Workspace live o statico', shapeMenu: 'Forme', shape: 'Forma', widgetMenu: 'Widget', widget: 'Widget', diagramMenu: 'Diagrammi intelligenti', diagram: 'Diagramma',
      exportVideo: 'Esporta presentazione video (MP4 / WebM)', speakerCoach: 'Coach vocale locale e analisi del parlato', sections: 'Sezioni', rehearsal: 'Studio registrazione e prove', slideComments: 'Commenti diapositiva', openSlideComments: 'Apri commenti diapositiva',
      objectInspector: 'Ispettore oggetti', layers: 'Livelli', animations: 'Animazioni', speakerNotes: 'Note del relatore', notes: 'Note',
    },
    slideSizes: { '16:9': 'Schermo panoramico (16:9)', '16:10': 'Moderno (16:10)', '4:3': 'Standard (4:3)', A4: 'Stampa / dispensa (A4)' },
    transitions: { none: 'Nessuna', fade: 'Dissolvenza', push: 'Scorrimento', wipe: 'Tendina', split: 'Divisione', reveal: 'Rivelazione', cover: 'Copertura', uncover: 'Scopertura', zoom: 'Zoom', morph: 'Morph' },
    directions: { vertical: 'Verticale', horizontal: 'Orizzontale', left: 'Sinistra', right: 'Destra', up: 'Su', down: 'Giù' },
    sounds: { none: 'Silenzioso', click: 'Clic', chime: 'Rintocco', whoosh: 'Sibilo' },
    shapes: { rectangle: 'Rettangolo', 'rounded-rectangle': 'Rettangolo arrotondato', ellipse: 'Cerchio / ellisse', triangle: 'Triangolo', diamond: 'Rombo / decisione', 'arrow-right': 'Freccia destra', 'arrow-left': 'Freccia sinistra', star: 'Stella', callout: 'Fumetto', line: 'Linea divisoria' },
    widgets: { kpi: 'Scheda KPI / metrica', progress: 'Barra di avanzamento', 'progress-ring': 'Anello di avanzamento', gauge: 'Indicatore percentuale', milestone: 'Cronologia / tappe', roadmap: 'Processo / roadmap', comparison: 'Scheda di confronto', quote: 'Citazione / profilo / testimonianza', status: 'Matrice di stato / badge', calendar: 'Calendario', 'icon-stat': 'Blocco icona / statistica', device: 'Mockup dispositivo / browser', gallery: 'Galleria', rating: 'Scala di valutazione' },
    diagrams: { process: 'Pipeline di processo', timeline: 'Cronologia delle tappe', matrix: 'Matrice strategica 2×2', hierarchy: 'Albero organizzativo / gerarchico' },
    openSlideComments: (count) => `Apri commenti diapositiva (${count})`,
  },
  'es-ES': {
    text: {
      historyControls: 'Controles del historial de Present', undo: 'Deshacer', undoTitle: 'Deshacer (Ctrl/Cmd+Z)', redo: 'Rehacer', redoTitle: 'Rehacer (Ctrl/Cmd+Y)',
      cards: 'Tarjetas', cardsTitle: 'Diseño de tarjetas', bullets: 'Viñetas', bulletsTitle: 'Lista con viñetas', chart: 'Gráfico', chartTitle: 'Diseño de gráfico', blank: 'En blanco', blankTitle: 'Lienzo en blanco',
      slideAspectRatio: 'Relación de aspecto de la diapositiva', aspectRatio: 'Relación de aspecto', presentationTheme: 'Tema de presentación', theme: 'Tema', slideTransition: 'Transición de diapositiva', transition: 'Transición',
      transitionDirection: 'Dirección de transición', transitionDuration: 'Duración de transición', transitionDurationMs: 'Duración de transición en milisegundos', transitionSound: 'Sonido de transición', optionalLocalSound: 'Sonido de transición local opcional',
      silent: 'Silencio', click: 'Clic', chime: 'Campanilla', whoosh: 'Swoosh', advanceOnClick: 'Permitir avanzar con clic del ratón o toque', autoAdvance: 'Avanzar esta diapositiva automáticamente tras unos segundos', autoAdvanceSeconds: 'Avance automático en segundos',
      previewTransition: 'Vista previa de la transición', applyTransitionAll: 'Aplicar esta transición y avance a todas las diapositivas', slideBackground: 'Color de fondo de la diapositiva', brandKitMasters: 'Kit de marca y patrones', image: 'Imagen', insertImage: 'Insertar imagen',
      text: 'Texto', insertTextBox: 'Insertar cuadro de texto libre', insertCode: 'Insertar fragmento de código', insertChart: 'Insertar gráfico', insertTable: 'Insertar tabla', insertMedia: 'Insertar narración de vídeo o audio', insertWorkspace: 'Insertar objeto de Workspace activo o fijo', shapeMenu: 'Formas', shape: 'Forma', widgetMenu: 'Widgets', widget: 'Widget', diagramMenu: 'Diagramas inteligentes', diagram: 'Diagrama',
      exportVideo: 'Exportar presentación de vídeo (MP4 / WebM)', speakerCoach: 'Entrenador de voz local y análisis del discurso', sections: 'Secciones', rehearsal: 'Estudio de grabación y ensayo', slideComments: 'Comentarios de la diapositiva', openSlideComments: 'Abrir comentarios de la diapositiva',
      objectInspector: 'Inspector de objetos', layers: 'Capas', animations: 'Animaciones', speakerNotes: 'Notas del orador', notes: 'Notas',
    },
    slideSizes: { '16:9': 'Panorámica (16:9)', '16:10': 'Moderno (16:10)', '4:3': 'Estándar (4:3)', A4: 'Impresión / folleto (A4)' },
    transitions: { none: 'Ninguna', fade: 'Fundido', push: 'Desplazar', wipe: 'Barrido', split: 'Dividir', reveal: 'Revelar', cover: 'Cubrir', uncover: 'Descubrir', zoom: 'Zoom', morph: 'Transformar' },
    directions: { vertical: 'Vertical', horizontal: 'Horizontal', left: 'Izquierda', right: 'Derecha', up: 'Arriba', down: 'Abajo' },
    sounds: { none: 'Silencio', click: 'Clic', chime: 'Campanilla', whoosh: 'Swoosh' },
    shapes: { rectangle: 'Rectángulo', 'rounded-rectangle': 'Rectángulo redondeado', ellipse: 'Círculo / elipse', triangle: 'Triángulo', diamond: 'Rombo / decisión', 'arrow-right': 'Flecha derecha', 'arrow-left': 'Flecha izquierda', star: 'Estrella', callout: 'Bocadillo', line: 'Línea divisoria' },
    widgets: { kpi: 'Tarjeta KPI / métrica', progress: 'Barra de progreso', 'progress-ring': 'Anillo de progreso', gauge: 'Indicador porcentual', milestone: 'Cronología / hitos', roadmap: 'Proceso / hoja de ruta', comparison: 'Tarjeta comparativa', quote: 'Cita / perfil / testimonio', status: 'Matriz de estado / insignias', calendar: 'Calendario', 'icon-stat': 'Bloque de icono / estadística', device: 'Maqueta de dispositivo / navegador', gallery: 'Galería', rating: 'Escala de valoración' },
    diagrams: { process: 'Flujo de proceso', timeline: 'Cronología de hitos', matrix: 'Matriz estratégica 2×2', hierarchy: 'Árbol organizativo / jerárquico' },
    openSlideComments: (count) => `Abrir comentarios de la diapositiva (${count})`,
  },
  'ja-JP': {
    text: {
      historyControls: 'Present の履歴操作', undo: '元に戻す', undoTitle: '元に戻す (Ctrl/Cmd+Z)', redo: 'やり直す', redoTitle: 'やり直す (Ctrl/Cmd+Y)',
      cards: 'カード', cardsTitle: 'カードレイアウト', bullets: '箇条書き', bulletsTitle: '箇条書きレイアウト', chart: 'グラフ', chartTitle: 'グラフレイアウト', blank: '空白', blankTitle: '空白のキャンバス',
      slideAspectRatio: 'スライドの縦横比', aspectRatio: '縦横比', presentationTheme: 'プレゼンテーションのテーマ', theme: 'テーマ', slideTransition: 'スライド切り替え', transition: '切り替え効果',
      transitionDirection: '切り替え方向', transitionDuration: '切り替え時間', transitionDurationMs: '切り替え時間 (ミリ秒)', transitionSound: '切り替え音', optionalLocalSound: 'ローカル切り替え音 (任意)',
      silent: 'なし', click: 'クリック', chime: 'チャイム', whoosh: '風切り音', advanceOnClick: 'マウスクリックまたはタッチで次へ進む', autoAdvance: '指定秒数後にこのスライドを自動で進める', autoAdvanceSeconds: '自動切り替え (秒)',
      previewTransition: '切り替えをプレビュー', applyTransitionAll: '切り替え効果と進行設定をすべてのスライドに適用', slideBackground: 'スライドの背景色', brandKitMasters: 'ブランドキットとマスター', image: '画像', insertImage: '画像を挿入',
      text: 'テキスト', insertTextBox: '自由配置テキストボックスを挿入', insertCode: 'コードスニペットを挿入', insertChart: 'グラフを挿入', insertTable: '表を挿入', insertMedia: '動画または音声ナレーションを挿入', insertWorkspace: 'ライブまたは固定の Workspace オブジェクトを挿入', shapeMenu: '図形', shape: '図形', widgetMenu: 'ウィジェット', widget: 'ウィジェット', diagramMenu: 'スマート図表', diagram: '図表',
      exportVideo: 'スライド動画をエクスポート (MP4 / WebM)', speakerCoach: 'ローカル話し方コーチとスピーチ分析', sections: 'セクション', rehearsal: '録画とリハーサルスタジオ', slideComments: 'スライドのコメント', openSlideComments: 'スライドのコメントを開く',
      objectInspector: 'オブジェクトインスペクター', layers: 'レイヤー', animations: 'アニメーション', speakerNotes: '発表者ノート', notes: 'ノート',
    },
    slideSizes: { '16:9': 'ワイド画面 (16:9)', '16:10': 'モダン (16:10)', '4:3': '標準 (4:3)', A4: '印刷 / 配布資料 (A4)' },
    transitions: { none: 'なし', fade: 'フェード', push: 'プッシュ', wipe: 'ワイプ', split: '分割', reveal: '表示', cover: '覆う', uncover: '開く', zoom: 'ズーム', morph: 'モーフィング' },
    directions: { vertical: '垂直', horizontal: '水平', left: '左', right: '右', up: '上', down: '下' },
    sounds: { none: 'なし', click: 'クリック', chime: 'チャイム', whoosh: '風切り音' },
    shapes: { rectangle: '長方形', 'rounded-rectangle': '角丸長方形', ellipse: '円 / 楕円', triangle: '三角形', diamond: 'ひし形 / 判断', 'arrow-right': '右矢印', 'arrow-left': '左矢印', star: '星', callout: '吹き出し', line: '区切り線' },
    widgets: { kpi: 'KPI / 指標カード', progress: '進捗バー', 'progress-ring': '進捗リング', gauge: '割合ゲージ', milestone: 'タイムライン / マイルストーン', roadmap: 'プロセス / ロードマップ', comparison: '比較カード', quote: '引用 / プロフィール / 推薦文', status: 'ステータス / バッジ一覧', calendar: 'カレンダー', 'icon-stat': 'アイコン / 統計ブロック', device: 'デバイス / ブラウザー見本', gallery: 'ギャラリー', rating: '評価スケール' },
    diagrams: { process: 'プロセスパイプライン', timeline: 'マイルストーンのタイムライン', matrix: '2×2 戦略マトリクス', hierarchy: '組織 / 階層ツリー' },
    openSlideComments: (count) => `スライドのコメントを開く (${count})`,
  },
  'ru-RU': {
    text: {
      historyControls: 'История Present', undo: 'Отменить', undoTitle: 'Отменить (Ctrl/Cmd+Z)', redo: 'Повторить', redoTitle: 'Повторить (Ctrl/Cmd+Y)',
      cards: 'Карточки', cardsTitle: 'Макет карточек', bullets: 'Список', bulletsTitle: 'Маркированный список', chart: 'Диаграмма', chartTitle: 'Макет диаграммы', blank: 'Пустой', blankTitle: 'Пустой холст',
      slideAspectRatio: 'Соотношение сторон слайда', aspectRatio: 'Соотношение сторон', presentationTheme: 'Тема презентации', theme: 'Тема', slideTransition: 'Переход слайда', transition: 'Переход',
      transitionDirection: 'Направление перехода', transitionDuration: 'Длительность перехода', transitionDurationMs: 'Длительность перехода в миллисекундах', transitionSound: 'Звук перехода', optionalLocalSound: 'Необязательный локальный звук перехода',
      silent: 'Без звука', click: 'Щелчок', chime: 'Звон', whoosh: 'Свист', advanceOnClick: 'Разрешить переход по щелчку или касанию', autoAdvance: 'Автоматически перейти к следующему слайду через заданное время', autoAdvanceSeconds: 'Автопереход через секунды',
      previewTransition: 'Предпросмотр перехода', applyTransitionAll: 'Применить переход и параметры показа ко всем слайдам', slideBackground: 'Цвет фона слайда', brandKitMasters: 'Фирменный стиль и образцы', image: 'Изображение', insertImage: 'Вставить изображение',
      text: 'Текст', insertTextBox: 'Вставить свободное текстовое поле', insertCode: 'Вставить фрагмент кода', insertChart: 'Вставить диаграмму', insertTable: 'Вставить таблицу', insertMedia: 'Вставить видео или аудиосопровождение', insertWorkspace: 'Вставить динамический или статический объект Workspace', shapeMenu: 'Фигуры', shape: 'Фигура', widgetMenu: 'Виджеты', widget: 'Виджет', diagramMenu: 'Схемы', diagram: 'Диаграмма',
      exportVideo: 'Экспортировать презентацию в видео (MP4 / WebM)', speakerCoach: 'Локальный тренер речи и анализ выступления', sections: 'Разделы', rehearsal: 'Студия записи и репетиций', slideComments: 'Комментарии к слайду', openSlideComments: 'Открыть комментарии к слайду',
      objectInspector: 'Инспектор объектов', layers: 'Слои', animations: 'Анимации', speakerNotes: 'Заметки докладчика', notes: 'Заметки',
    },
    slideSizes: { '16:9': 'Широкий экран (16:9)', '16:10': 'Современный (16:10)', '4:3': 'Стандартный (4:3)', A4: 'Печать / раздаточный материал (A4)' },
    transitions: { none: 'Нет', fade: 'Затухание', push: 'Сдвиг', wipe: 'Шторка', split: 'Разделение', reveal: 'Появление', cover: 'Покрытие', uncover: 'Открытие', zoom: 'Масштаб', morph: 'Морфинг' },
    directions: { vertical: 'Вертикально', horizontal: 'Горизонтально', left: 'Влево', right: 'Вправо', up: 'Вверх', down: 'Вниз' },
    sounds: { none: 'Без звука', click: 'Щелчок', chime: 'Звон', whoosh: 'Свист' },
    shapes: { rectangle: 'Прямоугольник', 'rounded-rectangle': 'Скруглённый прямоугольник', ellipse: 'Круг / эллипс', triangle: 'Треугольник', diamond: 'Ромб / решение', 'arrow-right': 'Стрелка вправо', 'arrow-left': 'Стрелка влево', star: 'Звезда', callout: 'Выноска', line: 'Разделитель' },
    widgets: { kpi: 'Карточка KPI / показателя', progress: 'Индикатор выполнения', 'progress-ring': 'Кольцевой индикатор', gauge: 'Процентный индикатор', milestone: 'Шкала времени / этапы', roadmap: 'Процесс / план', comparison: 'Карточка сравнения', quote: 'Цитата / профиль / отзыв', status: 'Матрица статусов / значков', calendar: 'Календарь', 'icon-stat': 'Блок значка / статистики', device: 'Макет устройства / браузера', gallery: 'Галерея', rating: 'Шкала оценки' },
    diagrams: { process: 'Схема процесса', timeline: 'Шкала этапов', matrix: 'Стратегическая матрица 2×2', hierarchy: 'Организационное / иерархическое дерево' },
    openSlideComments: (count) => `Открыть комментарии к слайду (${count})`,
  },
  'zh-CN': {
    text: {
      historyControls: 'Present 历史记录控件', undo: '撤销', undoTitle: '撤销 (Ctrl/Cmd+Z)', redo: '重做', redoTitle: '重做 (Ctrl/Cmd+Y)',
      cards: '卡片', cardsTitle: '卡片布局', bullets: '项目符号', bulletsTitle: '项目符号列表', chart: '图表', chartTitle: '图表布局', blank: '空白', blankTitle: '空白画布',
      slideAspectRatio: '幻灯片宽高比', aspectRatio: '宽高比', presentationTheme: '演示文稿主题', theme: '主题', slideTransition: '幻灯片切换效果', transition: '切换效果',
      transitionDirection: '切换方向', transitionDuration: '切换时长', transitionDurationMs: '切换时长（毫秒）', transitionSound: '切换声音', optionalLocalSound: '可选的本地切换声音',
      silent: '静音', click: '点击', chime: '铃声', whoosh: '呼啸声', advanceOnClick: '允许通过鼠标点击或触摸切换', autoAdvance: '在指定秒数后自动切换此幻灯片', autoAdvanceSeconds: '自动切换秒数',
      previewTransition: '预览切换效果', applyTransitionAll: '将此切换效果和播放设置应用到所有幻灯片', slideBackground: '幻灯片背景颜色', brandKitMasters: '品牌套件和母版', image: '图像', insertImage: '插入图像',
      text: '文本', insertTextBox: '插入自由定位文本框', insertCode: '插入代码片段', insertChart: '插入图表', insertTable: '插入表格', insertMedia: '插入视频或音频旁白', insertWorkspace: '插入实时或固定的 Workspace 对象', shapeMenu: '形状', shape: '形状', widgetMenu: '组件', widget: '组件', diagramMenu: '智能图示', diagram: '图示',
      exportVideo: '导出演示视频 (MP4 / WebM)', speakerCoach: '本地演讲教练和语音分析', sections: '章节', rehearsal: '录制与排练工作室', slideComments: '幻灯片评论', openSlideComments: '打开幻灯片评论',
      objectInspector: '对象检查器', layers: '图层', animations: '动画', speakerNotes: '演讲者备注', notes: '备注',
    },
    slideSizes: { '16:9': '宽屏 (16:9)', '16:10': '现代 (16:10)', '4:3': '标准 (4:3)', A4: '打印 / 讲义 (A4)' },
    transitions: { none: '无', fade: '淡入淡出', push: '推入', wipe: '擦除', split: '分割', reveal: '揭示', cover: '覆盖', uncover: '揭开', zoom: '缩放', morph: '变形' },
    directions: { vertical: '垂直', horizontal: '水平', left: '向左', right: '向右', up: '向上', down: '向下' },
    sounds: { none: '静音', click: '点击', chime: '铃声', whoosh: '呼啸声' },
    shapes: { rectangle: '矩形', 'rounded-rectangle': '圆角矩形', ellipse: '圆形 / 椭圆', triangle: '三角形', diamond: '菱形 / 决策', 'arrow-right': '右箭头', 'arrow-left': '左箭头', star: '星形', callout: '标注气泡', line: '分隔线' },
    widgets: { kpi: 'KPI / 指标卡片', progress: '进度条', 'progress-ring': '进度环', gauge: '百分比仪表', milestone: '时间线 / 里程碑', roadmap: '流程 / 路线图', comparison: '比较卡片', quote: '引言 / 档案 / 评价', status: '状态 / 徽标矩阵', calendar: '日历', 'icon-stat': '图标 / 统计块', device: '设备 / 浏览器样机', gallery: '图库', rating: '评分量表' },
    diagrams: { process: '流程管道', timeline: '里程碑时间线', matrix: '2×2 战略矩阵', hierarchy: '组织 / 层级树' },
    openSlideComments: (count) => `打开幻灯片评论 (${count})`,
  },
};
