// STATUS: GOLD — exhaustive localized Open Core guide copy; runtime use is owned by the shell.
import type { OpenCoreAppKind } from '../../edition/contracts';
import { availabilityClassOf, availabilityReason, type AppAvailabilityClass } from '../../edition/releaseStatus';
import { workspaceText } from '../localization/workspaceLocale';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export interface AppGuideCopy {
  readonly firstAction: string;
  readonly followUp: string;
}

export interface ConnectedWorkspaceStepCopy {
  readonly title: string;
  readonly description: string;
  readonly app: OpenCoreAppKind;
}

export interface AppGuideInterfaceCopy {
  readonly libraryTitle: string;
  readonly libraryLabel: string;
  readonly connectedLabel: string;
  readonly openSetup: string;
  readonly guideLabel: string;
  readonly connectedTitle: string;
  readonly connectedDescription: string;
  readonly stepTitles: readonly [string, string];
  /**
   * Ehrlicher Hinweis für erklärende Schritte ohne Einzelsteuerungs-Anker (Schritte 3–7): Der Rundgang
   * markiert dort kein fremdes Steuerelement, sondern erklärt die Funktion.
   */
  readonly explanationStep: string;
  readonly connectedSteps: readonly [
    ConnectedWorkspaceStepCopy,
    ConnectedWorkspaceStepCopy,
    ConnectedWorkspaceStepCopy,
    ConnectedWorkspaceStepCopy,
    ConnectedWorkspaceStepCopy,
    ConnectedWorkspaceStepCopy,
  ];
  readonly step: string;
  readonly previous: string;
  readonly next: string;
  readonly confirmStep: string;
  readonly finish: string;
  readonly skip: string;
  readonly replay: string;
  readonly close: string;
  readonly openApp: string;
  readonly interactiveIntro: string;
  readonly targetUnavailable: string;
  readonly optOut: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly progress: (current: number, total: number) => string;
}

export const APP_GUIDE_CATALOG: Readonly<Record<WorkspaceLocale, Readonly<Record<OpenCoreAppKind, AppGuideCopy>>>> = {
  'de-DE': {
    Writer: { firstAction: 'Schreibe eine kurze Überschrift und einen Absatz in den Dokumenttext.', followUp: 'Wende einen Überschriftenstil an und prüfe das Seitenlayout.' },
    Grid: { firstAction: 'Trage in einem kleinen Tabellenblatt eine Bezeichnung in A1 und eine Zahl in B1 ein.', followUp: 'Gib in B2 =B1*2 ein und prüfe das Ergebnis, bevor du den Bereich erweiterst.' },
    Present: { firstAction: 'Bearbeite den Titel und einen Aufzählungspunkt auf der ersten Folie.', followUp: 'Prüfe die Reihenfolge der Folien in der Übersicht, bevor du weitere hinzufügst.' },
    Notes: { firstAction: 'Erstelle in einem Notizbuch eine Notiz mit einem aussagekräftigen Titel.', followUp: 'Ergänze ein Schlagwort oder einen Abschnitt und prüfe die Navigation.' },
    PdfStudio: { firstAction: 'Öffne ein vorhandenes PDF in deinem Workspace und wähle eine Seite aus.', followUp: 'Teste eine umkehrbare Anmerkung an einer Kopie, bevor du Schwärzungen oder andere dauerhafte Änderungen verwendest.' },
    Tasks: { firstAction: 'Erstelle eine kurze Aufgabe und wähle ihren Status.', followUp: 'Setze bei Bedarf Fälligkeit oder Priorität und prüfe anschließend die Aufgabenliste.' },
    Whiteboard: { firstAction: 'Füge dem Canvas eine Haftnotiz mit einer Idee hinzu.', followUp: 'Ordne die Notiz neben verwandten Inhalten an und prüfe den Ausschnitt mit Zoom.' },
    Draw: { firstAction: 'Platziere mit dem Steuerelement „Rectangle“ ein Rechteck.', followUp: 'Verschiebe oder skaliere es und prüfe anschließend die Seiten- und Ebenensteuerung.' },
    Vault: { firstAction: 'Lies zuerst die aktuellen Schutz- und Wiederherstellungsanzeigen im Vault.', followUp: 'Prüfe Integrität und Sicherungsoptionen, bevor du etwas verschiebst, löschst oder wiederherstellst.' },
    AdminPolicy: { firstAction: 'Admin & Policy ist in Alpha 0.1 als Sicherheits-Gate gesperrt: Richtlinien werden nur angezeigt, nicht von Workspace-Modulen durchgesetzt. Prüfe den Status, nicht eine Wirksamkeit.', followUp: 'Diese App bleibt bis zur tatsächlichen Durchsetzung read-only; neue Admin-Dokumente lassen sich in Alpha 0.1 nicht anlegen.' },
    Publish: { firstAction: 'Prüfe Seitengröße und Layout, bevor du Inhalte ergänzt.', followUp: 'Lege eine kurze Überschrift und einen Absatz an und prüfe den Seitenumbruch.' },
    Insight: { firstAction: 'Wähle einen kleinen lokalen Datensatz oder eine Workspace-Quelle und prüfe ihre Felder.', followUp: 'Erstelle eine einfache Ansicht, ändere einen Filter und prüfe die angezeigten Zeilen.' },
    Connect: { firstAction: 'Prüfe die Kontakte und füge nur einen Peer hinzu, den du wiedererkennst.', followUp: 'Verfasse einen Nachrichtenentwurf und prüfe den Empfänger, bevor du eine Sendeaktion verwendest.' },
    Automate: { firstAction: 'Füge den Workspace-Event-Auslöser „document.saved“ und eine Workspace-Aktion hinzu.', followUp: 'Prüfe die simulierte Vorschau und den Ablaufverlauf. Die Vorschau führt keine externen Aktionen aus.' },
  },
  'en-US': {
    Writer: { firstAction: 'Write a short heading and paragraph in the document body.', followUp: 'Apply a heading style and inspect the page layout.' },
    Grid: { firstAction: 'In a small sheet, enter a label in A1 and a number in B1.', followUp: 'Enter =B1*2 in B2 and check the result before expanding the range.' },
    Present: { firstAction: 'Edit the title and one bullet on the opening slide.', followUp: 'Review slide order in the outline before adding more slides.' },
    Notes: { firstAction: 'Create a note in a notebook and give it a specific title.', followUp: 'Add one tag or section, then check that it appears in navigation.' },
    PdfStudio: { firstAction: 'Open an existing PDF in your workspace and select a page.', followUp: 'Try a reversible annotation on a copy before using redaction or other permanent edits.' },
    Tasks: { firstAction: 'Create one short task and choose its status.', followUp: 'Set a due date or priority if useful, then check the task list.' },
    Whiteboard: { firstAction: 'Add a sticky note with one idea to the canvas.', followUp: 'Move it beside related content and check the board at a useful zoom level.' },
    Draw: { firstAction: 'Place a rectangle with the Rectangle control.', followUp: 'Move or resize it, then inspect the page and layer controls.' },
    Vault: { firstAction: 'Read the Vault protection and recovery indicators first.', followUp: 'Review integrity and backup options before moving, deleting, or restoring anything.' },
    AdminPolicy: { firstAction: 'Admin & Policy is gated in Alpha 0.1: policies are displayed but not enforced by any Workspace module yet. Review the status, not an effectiveness claim.', followUp: 'This app stays read-only until enforcement exists; new admin documents cannot be created in Alpha 0.1.' },
    Publish: { firstAction: 'Inspect page size and layout before adding content.', followUp: 'Add a short heading and paragraph, then check the page break.' },
    Insight: { firstAction: 'Choose a small local dataset or Workspace source and inspect its fields.', followUp: 'Build one simple view, change a filter, and review the rows shown.' },
    Connect: { firstAction: 'Review Contacts and add only a peer you recognize.', followUp: 'Draft a message and check its recipient before using any send action.' },
    Automate: { firstAction: 'Add the Workspace Event trigger for document.saved and one Workspace action.', followUp: 'Review the simulated preview and run trace. The preview does not perform external actions.' },
  },
  'es-ES': {
    Writer: { firstAction: 'Escribe un título breve y un párrafo en el cuerpo del documento.', followUp: 'Aplica un estilo de título y revisa el diseño de página.' },
    Grid: { firstAction: 'En una hoja pequeña, escribe una etiqueta en A1 y un número en B1.', followUp: 'Escribe =B1*2 en B2 y comprueba el resultado antes de ampliar el rango.' },
    Present: { firstAction: 'Edita el título y una viñeta de la primera diapositiva.', followUp: 'Revisa el orden de las diapositivas en el esquema antes de añadir más.' },
    Notes: { firstAction: 'Crea una nota en un cuaderno y asígnale un título concreto.', followUp: 'Añade una etiqueta o sección y comprueba que aparece en la navegación.' },
    PdfStudio: { firstAction: 'Abre un PDF existente en tu Workspace y selecciona una página.', followUp: 'Prueba una anotación reversible en una copia antes de usar el borrado u otros cambios permanentes.' },
    Tasks: { firstAction: 'Crea una tarea breve y elige su estado.', followUp: 'Añade una fecha límite o prioridad si resulta útil y revisa la lista de tareas.' },
    Whiteboard: { firstAction: 'Añade al lienzo una nota adhesiva con una idea.', followUp: 'Muévela junto a contenido relacionado y revisa el tablero con un zoom adecuado.' },
    Draw: { firstAction: 'Coloca un rectángulo con el control Rectangle.', followUp: 'Muévelo o cambia su tamaño y revisa los controles de página y capas.' },
    Vault: { firstAction: 'Lee primero los indicadores de protección y recuperación de Vault.', followUp: 'Revisa la integridad y las copias de seguridad antes de mover, borrar o restaurar algo.' },
    AdminPolicy: { firstAction: 'Admin & Policy está bloqueado en la Beta 0.1: las políticas solo se muestran, ningún módulo las aplica todavía. Revisa el estado, no una eficacia.', followUp: 'La app permanece en solo lectura hasta que exista aplicación real; en la beta no se pueden crear documentos de administración.' },
    Publish: { firstAction: 'Revisa el tamaño y diseño de página antes de añadir contenido.', followUp: 'Añade un título breve y un párrafo y comprueba el salto de página.' },
    Insight: { firstAction: 'Elige un conjunto de datos local pequeño o una fuente de Workspace y revisa sus campos.', followUp: 'Crea una vista sencilla, cambia un filtro y revisa las filas mostradas.' },
    Connect: { firstAction: 'Revisa Contactos y añade solo a una persona que reconozcas.', followUp: 'Redacta un mensaje y comprueba el destinatario antes de usar cualquier acción de envío.' },
    Automate: { firstAction: 'Añade el disparador Workspace Event para document.saved y una acción de Workspace.', followUp: 'Revisa la vista previa simulada y el registro. La vista previa no realiza acciones externas.' },
  },
  'it-IT': {
    Writer: { firstAction: 'Scrivi un breve titolo e un paragrafo nel corpo del documento.', followUp: 'Applica uno stile titolo e controlla il layout della pagina.' },
    Grid: { firstAction: 'In un foglio piccolo, inserisci un’etichetta in A1 e un numero in B1.', followUp: 'Inserisci =B1*2 in B2 e controlla il risultato prima di ampliare l’intervallo.' },
    Present: { firstAction: 'Modifica il titolo e un punto elenco della prima diapositiva.', followUp: 'Controlla l’ordine delle diapositive nella struttura prima di aggiungerne altre.' },
    Notes: { firstAction: 'Crea una nota in un taccuino e assegnale un titolo specifico.', followUp: 'Aggiungi un tag o una sezione e verifica che compaia nella navigazione.' },
    PdfStudio: { firstAction: 'Apri un PDF esistente nel tuo Workspace e seleziona una pagina.', followUp: 'Prova un’annotazione reversibile su una copia prima di usare oscuramenti o altre modifiche permanenti.' },
    Tasks: { firstAction: 'Crea una breve attività e scegli il suo stato.', followUp: 'Imposta una scadenza o una priorità se utile, poi controlla l’elenco delle attività.' },
    Whiteboard: { firstAction: 'Aggiungi alla lavagna una nota adesiva con un’idea.', followUp: 'Spostala accanto ai contenuti correlati e controlla la lavagna a uno zoom utile.' },
    Draw: { firstAction: 'Posiziona un rettangolo con il controllo Rectangle.', followUp: 'Spostalo o ridimensionalo, poi controlla i comandi di pagina e livelli.' },
    Vault: { firstAction: 'Leggi prima gli indicatori di protezione e ripristino di Vault.', followUp: 'Controlla integrità e opzioni di backup prima di spostare, eliminare o ripristinare elementi.' },
    AdminPolicy: { firstAction: 'Admin & Policy è bloccata nella Beta 0.1: le policy vengono solo mostrate, nessun modulo le applica ancora. Controlla lo stato, non un’efficacia.', followUp: 'L’app resta in sola lettura finché non esiste un’applicazione reale; nella beta non si possono creare documenti di amministrazione.' },
    Publish: { firstAction: 'Controlla formato e layout della pagina prima di aggiungere contenuti.', followUp: 'Aggiungi un breve titolo e un paragrafo, poi controlla l’interruzione di pagina.' },
    Insight: { firstAction: 'Scegli un piccolo set di dati locale o una fonte Workspace e controlla i campi.', followUp: 'Crea una vista semplice, modifica un filtro e controlla le righe visualizzate.' },
    Connect: { firstAction: 'Controlla i Contatti e aggiungi solo una persona che riconosci.', followUp: 'Prepara una bozza e controlla il destinatario prima di usare qualsiasi azione di invio.' },
    Automate: { firstAction: 'Aggiungi il trigger Workspace Event per document.saved e un’azione Workspace.', followUp: 'Esamina l’anteprima simulata e la traccia. L’anteprima non esegue azioni esterne.' },
  },
  'ja-JP': {
    Writer: { firstAction: '文書本文に短い見出しと段落を書きます。', followUp: '見出しスタイルを適用し、ページレイアウトを確認します。' },
    Grid: { firstAction: '小さなシートの A1 にラベル、B1 に数値を入力します。', followUp: 'B2 に =B1*2 を入力し、範囲を広げる前に結果を確認します。' },
    Present: { firstAction: '最初のスライドのタイトルと箇条書きを編集します。', followUp: 'スライドを追加する前に、アウトラインで順序を確認します。' },
    Notes: { firstAction: 'ノートブックにノートを作成し、内容が分かるタイトルを付けます。', followUp: 'タグまたはセクションを追加し、ナビゲーションに表示されることを確認します。' },
    PdfStudio: { firstAction: 'Workspace にある既存の PDF を開き、ページを 1 つ選択します。', followUp: '墨消しなどの恒久的な編集を行う前に、コピーに取り消し可能な注釈を試します。' },
    Tasks: { firstAction: '短いタスクを 1 件作成し、ステータスを選びます。', followUp: '必要であれば期限や優先度を設定し、タスクリストを確認します。' },
    Whiteboard: { firstAction: 'キャンバスにアイデアを 1 つ書いた付箋を追加します。', followUp: '関連する内容の近くに移動し、見やすいズームでボードを確認します。' },
    Draw: { firstAction: 'Rectangle コントロールで四角形を配置します。', followUp: '移動またはサイズ変更を行い、ページとレイヤーの操作を確認します。' },
    Vault: { firstAction: '最初に Vault の保護と復旧の状態表示を確認します。', followUp: '移動、削除、復元を行う前に、整合性とバックアップの選択肢を確認します。' },
    AdminPolicy: { firstAction: 'Admin & Policy は Beta 0.1 ではセキュリティゲートによりロックされています。ポリシーは表示されるだけで、まだどのモジュールも適用しません。有効性ではなく状態を確認してください。', followUp: '実際の適用が実装されるまでこのアプリは読み取り専用です。ベータでは新しい管理ドキュメントを作成できません。' },
    Publish: { firstAction: '内容を追加する前に、ページサイズとレイアウトを確認します。', followUp: '短い見出しと段落を追加し、改ページを確認します。' },
    Insight: { firstAction: '小さなローカルデータセットまたは Workspace ソースを選び、フィールドを確認します。', followUp: '簡単なビューを作り、フィルターを 1 つ変更して表示行を確認します。' },
    Connect: { firstAction: '連絡先を確認し、本人だと分かる相手だけを追加します。', followUp: 'メッセージを下書きし、送信操作の前に宛先を確認します。' },
    Automate: { firstAction: 'document.saved 用の Workspace Event トリガーと Workspace アクションを 1 つ追加します。', followUp: 'シミュレーションのプレビューと実行トレースを確認します。プレビューは外部アクションを実行しません。' },
  },
  'ru-RU': {
    Writer: { firstAction: 'Напишите короткий заголовок и абзац в тексте документа.', followUp: 'Примените стиль заголовка и проверьте макет страницы.' },
    Grid: { firstAction: 'В небольшой таблице введите подпись в A1 и число в B1.', followUp: 'Введите =B1*2 в B2 и проверьте результат, прежде чем расширять диапазон.' },
    Present: { firstAction: 'Измените заголовок и один пункт списка на первом слайде.', followUp: 'Проверьте порядок слайдов в структуре, прежде чем добавлять новые.' },
    Notes: { firstAction: 'Создайте заметку в блокноте и задайте ей понятный заголовок.', followUp: 'Добавьте тег или раздел и проверьте, что он появился в навигации.' },
    PdfStudio: { firstAction: 'Откройте существующий PDF в Workspace и выберите страницу.', followUp: 'Проверьте обратимую аннотацию на копии, прежде чем применять редактирование или другие постоянные изменения.' },
    Tasks: { firstAction: 'Создайте короткую задачу и выберите её статус.', followUp: 'При необходимости задайте срок или приоритет, затем проверьте список задач.' },
    Whiteboard: { firstAction: 'Добавьте на холст заметку с одной идеей.', followUp: 'Переместите её рядом со связанным содержимым и проверьте доску при удобном масштабе.' },
    Draw: { firstAction: 'Разместите прямоугольник с помощью элемента Rectangle.', followUp: 'Переместите или измените его размер, затем проверьте элементы страницы и слоёв.' },
    Vault: { firstAction: 'Сначала прочитайте индикаторы защиты и восстановления Vault.', followUp: 'Проверьте целостность и резервное копирование до перемещения, удаления или восстановления.' },
    AdminPolicy: { firstAction: 'Admin & Policy заблокирован в Beta 0.1 какsecurity-gate: политики только отображаются, ни один модуль их ещё не применяет. Проверяйте статус, а не заявленную эффективность.', followUp: 'Приложение остаётся только для чтения, пока нет реального применения; в бете нельзя создавать новые административные документы.' },
    Publish: { firstAction: 'Перед добавлением содержимого проверьте размер и макет страницы.', followUp: 'Добавьте короткий заголовок и абзац, затем проверьте разрыв страницы.' },
    Insight: { firstAction: 'Выберите небольшой локальный набор данных или источник Workspace и изучите поля.', followUp: 'Создайте простой вид, измените фильтр и проверьте отображаемые строки.' },
    Connect: { firstAction: 'Проверьте контакты и добавляйте только знакомых собеседников.', followUp: 'Подготовьте черновик и проверьте получателя перед любым действием отправки.' },
    Automate: { firstAction: 'Добавьте триггер Workspace Event для document.saved и одно действие Workspace.', followUp: 'Проверьте симуляцию и трассировку. Предварительный просмотр не выполняет внешние действия.' },
  },
  'zh-CN': {
    Writer: { firstAction: '在文档正文中写一个简短标题和段落。', followUp: '应用标题样式并检查页面布局。' },
    Grid: { firstAction: '在一个小表格中向 A1 输入标签，向 B1 输入数字。', followUp: '在 B2 输入 =B1*2，并在扩大范围前检查结果。' },
    Present: { firstAction: '编辑首页幻灯片的标题和一个项目符号。', followUp: '添加更多幻灯片前，先在大纲中检查顺序。' },
    Notes: { firstAction: '在笔记本中创建一条笔记，并使用明确的标题。', followUp: '添加一个标签或分区，并检查它是否显示在导航中。' },
    PdfStudio: { firstAction: '打开 Workspace 中已有的 PDF 并选择一个页面。', followUp: '使用涂黑或其他永久编辑前，先在副本上尝试可撤销的批注。' },
    Tasks: { firstAction: '创建一条简短任务并选择其状态。', followUp: '如有需要，设置截止日期或优先级，然后检查任务列表。' },
    Whiteboard: { firstAction: '在画布上添加一张便签，写下一个想法。', followUp: '将它移到相关内容旁边，并使用合适的缩放查看画布。' },
    Draw: { firstAction: '使用 Rectangle 控件放置一个矩形。', followUp: '移动或调整它的大小，然后检查页面和图层控件。' },
    Vault: { firstAction: '先阅读 Vault 的保护和恢复状态指示。', followUp: '移动、删除或恢复任何内容前，先检查完整性和备份选项。' },
    AdminPolicy: { firstAction: 'Admin & Policy 在 Beta 0.1 中受安全门控锁定：策略仅展示，尚无任何模块实际执行。请查看状态，不要把它当作已生效。', followUp: '在真正执行实现之前，此应用保持只读；Beta 中无法创建新的管理文档。' },
    Publish: { firstAction: '添加内容前先检查页面尺寸和布局。', followUp: '添加一个简短标题和段落，然后检查分页位置。' },
    Insight: { firstAction: '选择较小的本地数据集或 Workspace 数据源并检查字段。', followUp: '创建一个简单视图，调整一个筛选器并检查显示的行。' },
    Connect: { firstAction: '检查联系人，只添加你能确认身份的联系人。', followUp: '先起草消息，并在执行发送操作前检查收件人。' },
    Automate: { firstAction: '添加用于 document.saved 的 Workspace Event 触发器和一个 Workspace 操作。', followUp: '检查模拟预览和运行轨迹。预览不会执行外部操作。' },
  },
} satisfies Record<WorkspaceLocale, Record<OpenCoreAppKind, AppGuideCopy>>;

export const APP_GUIDE_COPY = APP_GUIDE_CATALOG;

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// **App-Rundgang: mindestens sieben erklärte Punkte je App (Beta 0.1).**
//
// Der bisherige Rundgang hatte je App nur zwei Aktionen (`firstAction`, `followUp`). Das erklärt zu wenig
// von den realen Werkzeugen und Standards. `APP_GUIDE_STEPS` ergänzt je App **sieben** Punkte mit eigenem
// Titel und ehrlicher Beschreibung; die alten zwei Felder bleiben unverändert bestehen (Rückwärtsvertrag).
//
// **Ehrlichkeitsregeln für den Inhalt:**
//   • Nur Funktionen, die es wirklich gibt — keine Roadmap-Versprechen.
//   • Grenzen und Vorschau-Zustände werden benannt, nicht versteckt.
//   • Der Writer-Punkt „Live-Grid-Tabelle" sagt ausdrücklich, dass die eingebettete Tabelle mit dem
//     Grid-Dokument verknüpft ist und Änderungen live übernommen werden.
//   • Vollständige Texte in allen sieben Sprachen; keine leeren Schritte (Typ + Test erzwingen es).
//
// **Anker:** Nur die ersten beiden Schritte tragen einen Coachmark-Anker (`<App>:first`/`<App>:second`).
// Die Schritte 3–7 sind erklärende Punkte ohne Einzelsteuerungs-Anker; der Popover sagt das offen, statt
// ein beliebiges fremdes Steuerelement zu markieren.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AppGuideStepCopy {
  readonly title: string;
  readonly description: string;
}

/** Sieben erklärte Punkte — die Zahl ist Teil des Beta-Versprechens und wird typgeprüft. */
export const APP_GUIDE_APP_STEP_COUNT = 7;

type SevenGuideSteps = readonly [
  AppGuideStepCopy,
  AppGuideStepCopy,
  AppGuideStepCopy,
  AppGuideStepCopy,
  AppGuideStepCopy,
  AppGuideStepCopy,
  AppGuideStepCopy,
];

type AppGuideStepsForLocale = Readonly<Record<OpenCoreAppKind, SevenGuideSteps>>;

const APP_GUIDE_STEPS_DE: AppGuideStepsForLocale = {
  Writer: [
    { title: 'Haupttext', description: 'Schreibe im Seitenkörper; jeder Absatz bleibt ein bearbeitbarer Block, den du auswählen und formatieren kannst.' },
    { title: 'Formatierung und Überschriften', description: 'Nutze Fett, Kursiv, Unterstreichen, Listen und Überschriftenstile, damit die Struktur den Export übersteht.' },
    { title: 'Tabellen', description: 'Füge eine Tabelle ein, bearbeite Zellen und drücke in der letzten Zelle Tab, um eine Zeile anzuhängen.' },
    { title: 'Live-Grid-Tabelle', description: 'Eine hier eingebettete Grid-Tabelle bleibt mit dem Grid-Dokument verknüpft: Änderungen in Grid werden live in Writer übernommen – keine eingefrorene Kopie.' },
    { title: 'Speichern und Dateien', description: 'Speichere das Dokument und öffne es aus dem Workspace erneut; die Statusleiste meldet „Gespeichert" erst nach bestätigtem Schreiben.' },
    { title: 'Export', description: 'Exportiere nach DOCX oder PDF und lies den Treuebericht, der benennt, was nicht erhalten werden konnte.' },
    { title: 'Review und Lesemodus', description: 'Schalte den Review-Modus für nachverfolgte Änderungen ein oder den Lesemodus, um das Dokument ohne versehentliche Änderungen zu prüfen.' },
  ],
  Grid: [
    { title: 'Zellen und Formeln', description: 'Gib Werte und Formeln mit = in die Formelleiste ein; Ergebnisse aktualisieren sich beim Tippen.' },
    { title: 'Bezüge', description: 'Nutze relative und absolute Bezüge wie A1 und $A$1 und kopiere Formeln über Bereiche.' },
    { title: 'Zahlenformate', description: 'Wende Zahlen-, Währungs-, Prozent- oder Datumsformate aus der Toolbar auf die Auswahl an.' },
    { title: 'Formatierung', description: 'Lege Ausrichtung, Umbruch, Rahmen und bedingte Formatierung für die gewählten Zellen fest.' },
    { title: 'Diagramme', description: 'Füge ein Diagramm ein, das den gewählten Bereich liest und sich bei Datenänderungen aktualisiert.' },
    { title: 'Speichern und Dateien', description: 'Speichere die Arbeitsmappe und öffne sie erneut; Blätter, Formeln und Formate bleiben erhalten.' },
    { title: 'Export und Druck', description: 'Exportiere XLSX, CSV oder PDF oder drucke das Blatt mit den angezeigten Zahlenformaten.' },
  ],
  Present: [
    { title: 'Folien', description: 'Füge Folien hinzu, ordne sie in der Seitenleiste und wähle sie aus; die aktive Folie bearbeitest du auf der Leinwand.' },
    { title: 'Text und Objekte', description: 'Platziere Text, Bilder, Formen und Widgets und verschiebe, skaliere oder drehe sie direkt.' },
    { title: 'Layouts und Karten', description: 'Wähle ein Layout oder einen Kartenstil für die Folie und bearbeite den Inhalt direkt.' },
    { title: 'Notizen für Vortragende', description: 'Schreibe Notizen je Folie; die Presenter-Ansicht zeigt sie neben der aktuellen Folie.' },
    { title: 'Präsentation starten', description: 'Starte die Präsentation und wähle im Monitordialog die Rollen – oder nutze den Ein-Bildschirm-Presenter-Modus.' },
    { title: 'Animationen', description: 'Weise Objekten Animationen mit Dauer und Auslöser zu und prüfe sie vor dem Vortrag.' },
    { title: 'Export und Design', description: 'Exportiere das Deck oder wende ein Theme an; Master-Stile halten Typografie und Farben konsistent.' },
  ],
  Notes: [
    { title: 'Notizbücher und Seiten', description: 'Lege Notizbücher, Abschnitte und Seiten an; der Seitenbaum hält das Notizbuch organisiert.' },
    { title: 'Markdown-Bearbeitung', description: 'Schreibe Markdown im Seitenkörper und wechsle zur Vorschau, wenn du lesen willst.' },
    { title: 'Schlagwörter und Eigenschaften', description: 'Ergänze Schlagwörter, Aliase und Eigenschaften, damit Notizen auffindbar und filterbar bleiben.' },
    { title: 'Suchen', description: 'Nutze Suchen/Ersetzen auf der Seite oder die Notizbuchsuche, um Inhalte schnell zu finden.' },
    { title: 'Backlinks und Graph', description: 'Verknüpfe Notizen und öffne den Wissensgraphen, um Backlinks und verwandte Notizen zu prüfen.' },
    { title: 'Speichern und Dateien', description: 'Speichere das Notizbuch und öffne es erneut; Seiteninhalt, Links und Schlagwörter bleiben erhalten.' },
    { title: 'Export und Vorlagen', description: 'Exportiere eine Notiz als Markdown, HTML oder PDF und starte neue Seiten aus Vorlagen.' },
  ],
  Tasks: [
    { title: 'Schnell anlegen', description: 'Lege über das Schnellfeld eine Aufgabe an und gib ihr einen klaren Titel.' },
    { title: 'Aufgabendetails', description: 'Setze Fälligkeit, Priorität, Status und Beschreibung im Detailbereich.' },
    { title: 'Aufgaben abhaken', description: 'Hake eine Aufgabe ab; erledigte Aufgaben bleiben in ihren Ansichten sichtbar.' },
    { title: 'Ansichten und Filter', description: 'Wechsle zwischen Listen-, Board- und Kalenderansicht und filtere nach Status oder Schlagwort.' },
    { title: 'Teilaufgaben und Abhängigkeiten', description: 'Zerlege Arbeit in Teilaufgaben, verknüpfe Abhängigkeiten und halte den Fortschritt der Elternaufgabe synchron.' },
    { title: 'Speichern und Dateien', description: 'Speichere das Aufgabendokument und öffne es erneut; Aufgaben, Status und Termine bleiben erhalten.' },
    { title: 'Export', description: 'Exportiere Aufgaben als iCalendar, CSV oder JSON oder drucke sie; nicht unterstützte Felder werden benannt.' },
  ],
  Whiteboard: [
    { title: 'Leinwand navigieren', description: 'Verschiebe und zoome die unendliche Leinwand; Auswählen, Verschieben und Zoom bleiben in der Toolbar erreichbar.' },
    { title: 'Haftnotizen', description: 'Füge farbige Haftnotizen hinzu und ordne sie zu Clustern.' },
    { title: 'Stift und Text', description: 'Zeichne mit Stift, Bleistift, Marker, Radierer und Lasso oder füge freie Textblöcke ein.' },
    { title: 'Formen und Verbindungen', description: 'Füge Prozess-, Entscheidungs- und Terminalformen ein und verbinde sie mit Linien.' },
    { title: 'Rahmen und Bilder', description: 'Füge druckbare Rahmen hinzu und platziere lokale Bilder oder Workspace-Objekte auf dem Board.' },
    { title: 'Speichern und öffnen', description: 'Speichere das Board und öffne es erneut; Objekte behalten ihre Positionen.' },
    { title: 'Export', description: 'Exportiere die Leinwand als PNG oder sende das Diagramm als Present-Folie.' },
  ],
  Publish: [
    { title: 'Seiteneinrichtung', description: 'Prüfe Papierformat, Ränder, Anschnitt und Spalten in der Seiteneinstellungsleiste, bevor du Inhalte ergänzt.' },
    { title: 'Text- und Bildrahmen', description: 'Platziere Text- und Bildrahmen auf der Seite und ändere ihre Größe über die Griffe.' },
    { title: 'Formen und SVG', description: 'Füge Formen aus dem Formenmenü hinzu oder bette ein SVG in einen Grafikrahmen ein.' },
    { title: 'Live-Workspace-Inhalte', description: 'Platziere geschützte Vault-Assets oder ziehe Tabellen und Stories aus dem Workspace auf die Seite.' },
    { title: 'Preflight', description: 'Starte den Preflight und folge den nummerierten Befunden zum betroffenen Rahmen.' },
    { title: 'Speichern und Seiten', description: 'Speichere die Publikation und öffne sie erneut; Seitengeometrie, Rahmen und Master bleiben erhalten.' },
    { title: 'Export', description: 'Exportiere PDF/X-4, PDF/X-1a, HTML, EPUB oder ein Paket; das Ergebnis listet Warnungen.' },
  ],
  PdfStudio: [
    { title: 'Öffnen und lesen', description: 'Öffne ein PDF aus dem Workspace und lies es Seite für Seite mit dem Miniaturen-Navigator.' },
    { title: 'Anmerkungen', description: 'Markiere, unterstreiche, streiche oder kommentiere ausgewählten Text; Anmerkungen sind umkehrbar.' },
    { title: 'Schwärzen', description: 'Markiere Schwärzungsbereiche und exportiere eine geschwärzte Kopie; im Export ist die Schwärzung dauerhaft.' },
    { title: 'Seitenwerkzeuge', description: 'Nutze die Seitenwerkzeuge, um Seiten vor dem Export zu drehen, zu extrahieren oder zusammenzustellen.' },
    { title: 'Signaturen und Schutz', description: 'Füge einen Signaturstempel oder eine digitale Signatur hinzu und setze Passwortschutz, wo unterstützt.' },
    { title: 'OCR und Konvertierung', description: 'Starte lokale OCR oder konvertiere das PDF in Workspace-Dokumente; begrenzte Treue wird gemeldet.' },
    { title: 'Speichern und Export', description: 'Speichere das annotierte PDF und exportiere eine Kopie; der Export meldet, was geschrieben wurde.' },
  ],
  Draw: [
    { title: 'Formen', description: 'Füge Formen mit dem Rechteck-Werkzeug oder aus der durchsuchbaren Formbibliothek ein.' },
    { title: 'Bewegen und skalieren', description: 'Wähle, verschiebe, skaliere oder drehe Objekte; Einrasten und Raster helfen beim Ausrichten.' },
    { title: 'Seiten und Ebenen', description: 'Lege Seiten und Ebenen an, benenne sie und steuere Sichtbarkeit, Sperre und Druckbarkeit.' },
    { title: 'Verbindungen', description: 'Verbinde Formen mit geraden, rechtwinkligen oder geschwungenen Routen und setze Wegpunkte.' },
    { title: 'Stil', description: 'Lege Füllung, Kontur, Strichstil und Eckenradius im Stil-Inspektor fest.' },
    { title: 'Speichern und öffnen', description: 'Speichere die Zeichnung und öffne sie erneut; Seiten, Ebenen und Stile bleiben erhalten.' },
    { title: 'Interop', description: 'Importiere SVG-Grafik und halte verschlüsselte .vdraw-Dateien für Weitergabe und SVG-Export bereit.' },
  ],
  Vault: [
    { title: 'Schutzstatus', description: 'Lies zuerst das Panel für Verschlüsselung und Schlüsselrichtlinie; es nennt Schutzart und Schlüsselgeneration.' },
    { title: 'Sperren und entsperren', description: 'Sperre die Vault-Sitzung oder lass die Auto-Sperre laufen; Entsperren mit PIN oder Passwort prüft den Ausweis.' },
    { title: 'Dateien und Ordner', description: 'Importiere lokale Dateien oder verknüpfe Workspace-Dokumente in Ordnern und durchsuche sie lokal.' },
    { title: 'Integrität', description: 'Prüfe die Dateiintegrität; Abweichungen werden benannt und unter Quarantäne gestellt, statt still geöffnet.' },
    { title: 'Sicherung und Wiederherstellung', description: 'Erstelle verschlüsselte Backups und stelle aus Papierkorb, Versionen oder einem Wiederherstellungs-Snapshot wieder her.' },
    { title: 'Freigabe und Klartext-Export', description: 'Teile über Grants mit Empfänger und Ablauf; ein Klartext-Export zeigt immer zuerst eine Warnpforte.' },
    { title: 'Beta-Grenzen', description: 'Die Grenzen stehen in der App: Der Gerätemodus sperrt die Oberfläche ohne Ausweis, die PIN hat 4–8 Ziffern, und es gibt keinen universellen Wiederherstellungsschlüssel.' },
  ],
  Insight: [
    { title: 'Datenquelle', description: 'Wähle einen lokalen Datensatz oder eine Workspace-Quelle und prüfe ihre Felder.' },
    { title: 'Ansichten', description: 'Erstelle aus den Feldern eine Ansicht und wähle Zeilen, Spalten und Kennzahlen.' },
    { title: 'Filter', description: 'Ändere Filter und aktualisiere die Ansicht, um zu sehen, welche Zeilen zurückkommen.' },
    { title: 'KPIs', description: 'Füge KPI-Kacheln mit Kennzahlen hinzu und vergleiche sie mit einem früheren Zeitraum.' },
    { title: 'Pivots und Segmente', description: 'Schlüssle Summen mit Pivots und der Segmentleiste auf; leere Gruppen werden benannt statt als Null gezeigt.' },
    { title: 'Speichern und Herkunft', description: 'Speichere die Analyse; die Herkunft listet verknüpfte Quellen und ungelöste Kanten.' },
    { title: 'Export', description: 'Exportiere die Ansicht als XLSX oder PDF und prüfe die gemeldete Zeilenzahl.' },
  ],
  Connect: [
    { title: 'Ordner', description: 'Durchsuche Posteingang, Entwürfe, Gesendet, Archiv und Vault-Ordner.' },
    { title: 'Kontakte', description: 'Prüfe Kontakte und füge nur Personen hinzu, die du wiedererkennst.' },
    { title: 'Verfassen', description: 'Entwirf eine Nachricht mit Empfänger, Betreff und Text.' },
    { title: 'Warteschlange statt Versand', description: 'Senden reiht die Nachricht lokal ein; der Hinweis sagt „eingereiht", nicht „gesendet", solange kein Mail-Transport eingerichtet ist.' },
    { title: 'Schutzhinweis', description: 'Die Verfassen-Ansicht nennt, welcher Schutz gilt; sie behauptet keine Verschlüsselung, die nicht lief.' },
    { title: 'Suche und Kalender', description: 'Durchsuche lokale Nachrichten und prüfe Kalendereinträge.' },
    { title: 'Kontostatus', description: 'Prüfe Verbindungs- und TLS-Status in den Kontoeinstellungen, bevor du Zustellung erwartest.' },
  ],
  Automate: [
    { title: 'Auslöser', description: 'Füge einen Workspace-Ereignis-Auslöser wie document.saved hinzu.' },
    { title: 'Aktionen', description: 'Füge begrenzte Workspace-Aktionen hinzu und verbinde sie in Reihenfolge.' },
    { title: 'Vorschau', description: 'Starte die simulierte Vorschau; sie führt keine externen Aktionen aus.' },
    { title: 'Ablaufverlauf', description: 'Prüfe den Ablaufverlauf, um zu sehen, welcher Schritt welches Ergebnis erzeugt hat.' },
    { title: 'Begrenzte Ausführung', description: 'Automation ist begrenzt: keine unkontrollierten Schleifen und keine Remote-Connectoren ohne ausdrückliche Richtlinie.' },
    { title: 'Speichern', description: 'Speichere die Automation und öffne sie aus dem Workspace erneut.' },
    { title: 'Fehler', description: 'Abgelehnte oder fehlgeschlagene Läufe zeigen ein benanntes Ergebnis statt eines stillen Abbruchs.' },
  ],
  AdminPolicy: [
    { title: 'Gate-Status', description: 'Admin & Policy ist in der Beta 0.1 gesperrt: Richtlinien werden angezeigt, nicht durchgesetzt.' },
    { title: 'Nur-Lese-Ansicht', description: 'Ein vorhandenes Richtlinien-Dokument öffnet sich in einer Nur-Lese-Gate-Ansicht; es wird nichts geschrieben.' },
    { title: 'Keine neuen Dokumente', description: 'Neue Admin-Dokumente lassen sich in der Beta nicht anlegen.' },
    { title: 'Was angezeigt wird', description: 'Bereiche wie Rollen, Geräte, Verschlüsselung, DLP, Aufbewahrung, Netzwerk, Audit, Kontinuität, Privatsphäre und Lebenszyklus werden nur zur Einsicht gelistet.' },
    { title: 'Keine Durchsetzungszusage', description: 'Kein Workspace-Modul liest diese Richtlinien bisher an seinen Operationsstellen.' },
    { title: 'Wenn es freigegeben wird', description: 'Eine Freigabe setzt voraus, dass die Durchsetzung an den echten Operationen verdrahtet und getestet ist.' },
    { title: 'Datensicherheit', description: 'Bestehende Richtliniendaten bleiben erhalten; die Gate-Ansicht ändert nichts.' },
  ],
};

const APP_GUIDE_STEPS_EN: AppGuideStepsForLocale = {
  Writer: [
    { title: 'Main text', description: 'Type in the page body; every paragraph stays an editable block you can select and format.' },
    { title: 'Formatting and headings', description: 'Use bold, italic, underline, lists, and heading styles so the structure survives export.' },
    { title: 'Tables', description: 'Insert a table, edit cells, and press Tab in the last cell to add a row.' },
    { title: 'Live Grid table', description: 'A Grid table embedded here stays linked to the Grid document: changes in Grid are pulled into Writer live — not a frozen copy.' },
    { title: 'Save and files', description: 'Save the document and reopen it from the workspace; the status bar says saved only after the file write is confirmed.' },
    { title: 'Export', description: 'Export to DOCX or PDF and read the fidelity report, which names anything that could not be preserved.' },
    { title: 'Review and read mode', description: 'Turn on review mode for tracked changes, or read mode to inspect the document without accidental edits.' },
  ],
  Grid: [
    { title: 'Cells and formulas', description: 'Enter values and formulas starting with = in the formula bar; results update as you type.' },
    { title: 'References', description: 'Use relative and absolute references such as A1 and $A$1, and copy formulas across ranges.' },
    { title: 'Number formats', description: 'Apply number, currency, percent, or date formats from the toolbar to the selected range.' },
    { title: 'Formatting', description: 'Set alignment, wrapping, borders, and conditional formatting for the selected cells.' },
    { title: 'Charts', description: 'Insert a chart that reads the selected range and updates when the data changes.' },
    { title: 'Save and files', description: 'Save the workbook and reopen it; sheets, formulas, and formats are preserved.' },
    { title: 'Export and print', description: 'Export XLSX, CSV, or PDF, or print the sheet with the displayed number formats.' },
  ],
  Present: [
    { title: 'Slides', description: 'Add, reorder, and select slides in the sidebar; the active slide is edited on the canvas.' },
    { title: 'Text and objects', description: 'Place text, images, shapes, and widgets, then move, resize, and rotate them directly.' },
    { title: 'Layouts and cards', description: 'Choose a layout or card style for the slide and edit the content in place.' },
    { title: 'Speaker notes', description: 'Write speaker notes per slide; the presenter view shows them next to the current slide.' },
    { title: 'Start presenting', description: 'Start the presentation and pick display roles in the monitor dialog, or use single-screen presenter mode.' },
    { title: 'Animations', description: 'Assign animations with duration and trigger to objects and preview them before presenting.' },
    { title: 'Export and design', description: 'Export the deck or apply a theme; master styles keep typography and colours consistent.' },
  ],
  Notes: [
    { title: 'Notebooks and pages', description: 'Create notebooks, sections, and pages; the page tree keeps the notebook organized.' },
    { title: 'Markdown editing', description: 'Write Markdown in the page body and switch to preview when you want to read it.' },
    { title: 'Tags and properties', description: 'Add tags, aliases, and properties so notes stay findable and filterable.' },
    { title: 'Search', description: 'Use find and replace inside the page or the notebook search to locate content quickly.' },
    { title: 'Backlinks and graph', description: 'Link notes and open the knowledge graph to inspect backlinks and related notes.' },
    { title: 'Save and files', description: 'Save the notebook and reopen it; page content, links, and tags are preserved.' },
    { title: 'Export and templates', description: 'Export a note as Markdown, HTML, or PDF and start new pages from templates.' },
  ],
  Tasks: [
    { title: 'Quick add', description: 'Add a task from the quick-add field and give it a clear title.' },
    { title: 'Task details', description: 'Set due date, priority, status, and description in the details drawer.' },
    { title: 'Complete tasks', description: 'Tick a task to complete it; completed tasks stay visible in their views.' },
    { title: 'Views and filters', description: 'Switch between list, board, and calendar views and filter by status or tag.' },
    { title: 'Subtasks and dependencies', description: 'Break work into subtasks, link dependencies, and keep parent progress in sync.' },
    { title: 'Save and files', description: 'Save the task document and reopen it; tasks, statuses, and dates remain.' },
    { title: 'Export', description: 'Export tasks as iCalendar, CSV, or JSON, or print them; unsupported fields are named.' },
  ],
  Whiteboard: [
    { title: 'Canvas navigation', description: 'Pan and zoom the infinite canvas; select, pan, and zoom stay within reach in the toolbar.' },
    { title: 'Sticky notes', description: 'Add coloured sticky notes and move them into clusters.' },
    { title: 'Ink and text', description: 'Draw with pen, pencil, highlighter, eraser, and lasso, or add free text blocks.' },
    { title: 'Shapes and connectors', description: 'Insert process, decision, and terminal shapes and connect them with lines.' },
    { title: 'Frames and images', description: 'Add printable frames and place local images or workspace objects on the board.' },
    { title: 'Save and reopen', description: 'Save the board and reopen it from the workspace; objects keep their positions.' },
    { title: 'Export', description: 'Export the canvas as PNG or send the diagram to a Present slide.' },
  ],
  Publish: [
    { title: 'Page setup', description: 'Check paper size, margins, bleed, and columns in the page settings bar before adding content.' },
    { title: 'Text and image frames', description: 'Place text and image frames on the page and resize them with the handles.' },
    { title: 'Shapes and SVG', description: 'Add shapes from the shapes menu or embed an SVG into a graphic frame.' },
    { title: 'Live workspace content', description: 'Place protected Vault assets or drop tables and stories from the workspace onto the page.' },
    { title: 'Preflight', description: 'Run preflight and follow the numbered findings to the affected frame.' },
    { title: 'Save and pages', description: 'Save the publication and reopen it; page geometry, frames, and masters are preserved.' },
    { title: 'Export', description: 'Export PDF/X-4, PDF/X-1a, HTML, EPUB, or a package; the result lists warnings.' },
  ],
  PdfStudio: [
    { title: 'Open and read', description: 'Open a PDF from the workspace and read it page by page with the thumbnail navigator.' },
    { title: 'Annotations', description: 'Highlight, underline, strike through, or comment on selected text; annotations are reversible.' },
    { title: 'Redaction', description: 'Mark redaction areas and export a redacted copy; redaction is permanent in the exported file.' },
    { title: 'Page tools', description: 'Use the page tools to rotate, extract, or assemble pages before exporting.' },
    { title: 'Signatures and protection', description: 'Add a signature stamp or digital signature and apply password protection where supported.' },
    { title: 'OCR and conversion', description: 'Run local OCR or convert the PDF into workspace documents; limited fidelity is reported.' },
    { title: 'Save and export', description: 'Save the annotated PDF and export a copy; the export reports what was written.' },
  ],
  Draw: [
    { title: 'Shapes', description: 'Insert shapes with the Rectangle control or from the searchable shape library.' },
    { title: 'Move and resize', description: 'Select, move, resize, or rotate objects; snapping and the grid help alignment.' },
    { title: 'Pages and layers', description: 'Create pages and layers, rename them, and control visibility, locking, and printing.' },
    { title: 'Connectors', description: 'Connect shapes with straight, orthogonal, or curved routes and add waypoints.' },
    { title: 'Style', description: 'Set fill, stroke, dash style, and corner radius in the shape style inspector.' },
    { title: 'Save and open', description: 'Save the drawing and reopen it; pages, layers, and styles are preserved.' },
    { title: 'Interop', description: 'Import SVG artwork and keep encrypted .vdraw files for portable handoff and SVG export.' },
  ],
  Vault: [
    { title: 'Protection status', description: 'Read the encryption and key policy panel first; it states the protection mode and key generation.' },
    { title: 'Lock and unlock', description: 'Lock the Vault session or let auto-lock run; unlocking with PIN or password validates the credential.' },
    { title: 'Files and folders', description: 'Import local files or link workspace documents into folders and search them locally.' },
    { title: 'Integrity', description: 'Verify file integrity; mismatches are named and quarantined instead of being opened silently.' },
    { title: 'Backup and recovery', description: 'Create encrypted backups and restore from the trash, versions, or a recovery snapshot.' },
    { title: 'Sharing and plaintext export', description: 'Share through grants with recipient and expiry; a plaintext export always shows a warning gate first.' },
    { title: 'Beta limits', description: 'Limits are stated in the app: device mode locks the UI without a credential, the PIN is 4–8 digits, and there is no universal recovery key.' },
  ],
  Insight: [
    { title: 'Data source', description: 'Choose a local dataset or a Workspace source and inspect its fields.' },
    { title: 'Views', description: 'Create a view from the fields and choose rows, columns, and measures.' },
    { title: 'Filters', description: 'Change filters and refresh the view to see which rows are returned.' },
    { title: 'KPIs', description: 'Add KPI tiles with measures and compare them against a previous period.' },
    { title: 'Pivots and segments', description: 'Break totals down with pivots and the segment bar; empty groups are named instead of showing zero.' },
    { title: 'Save and provenance', description: 'Save the analysis; provenance lists linked sources and unresolved edges.' },
    { title: 'Export', description: 'Export the view as XLSX or PDF and check the reported row count.' },
  ],
  Connect: [
    { title: 'Folders', description: 'Browse inbox, drafts, sent, archive, and vault folders.' },
    { title: 'Contacts', description: 'Review contacts and add only peers you recognize.' },
    { title: 'Compose', description: 'Draft a message with recipient, subject, and body.' },
    { title: 'Queue instead of send', description: 'Sending queues the message locally; the notice says queued, not sent, until a mail transport is configured.' },
    { title: 'Protection note', description: 'The compose view states which protection applies; it does not claim encryption that did not run.' },
    { title: 'Search and calendar', description: 'Search local messages and review calendar entries.' },
    { title: 'Account status', description: 'Check connection and TLS status in account settings before expecting delivery.' },
  ],
  Automate: [
    { title: 'Trigger', description: 'Add a Workspace event trigger such as document.saved.' },
    { title: 'Actions', description: 'Add bounded Workspace actions and connect them in order.' },
    { title: 'Preview', description: 'Run the simulated preview; it does not perform external actions.' },
    { title: 'Trace', description: 'Inspect the run trace to see which step produced which result.' },
    { title: 'Bounded execution', description: 'Automation is bounded: no uncontrolled loops and no remote connectors without explicit policy.' },
    { title: 'Save', description: 'Save the automation and reopen it from the workspace.' },
    { title: 'Errors', description: 'Refused or failed runs show a named result instead of a silent stop.' },
  ],
  AdminPolicy: [
    { title: 'Gate status', description: 'Admin & Policy is locked in Beta 0.1: policies are displayed, not enforced.' },
    { title: 'Read-only view', description: 'An existing policy document opens in a read-only gate view; nothing is written.' },
    { title: 'No new documents', description: 'New admin documents cannot be created in the beta.' },
    { title: 'What is shown', description: 'Domains such as roles, devices, encryption, DLP, retention, network, audit, continuity, privacy, and lifecycle are listed for inspection only.' },
    { title: 'No enforcement claim', description: 'No Workspace module consults these policies at its operation sites yet.' },
    { title: 'When it unlocks', description: 'Release requires enforcement to be wired and tested at the real operations.' },
    { title: 'Data safety', description: 'Existing policy data is preserved; the gate view changes nothing.' },
  ],
};

const APP_GUIDE_STEPS_ES: AppGuideStepsForLocale = {
  Writer: [
    { title: 'Texto principal', description: 'Escribe en el cuerpo de la página; cada párrafo sigue siendo un bloque editable que puedes seleccionar y formatear.' },
    { title: 'Formato y títulos', description: 'Usa negrita, cursiva, subrayado, listas y estilos de título para que la estructura sobreviva a la exportación.' },
    { title: 'Tablas', description: 'Inserta una tabla, edita celdas y pulsa Tab en la última celda para añadir una fila.' },
    { title: 'Tabla Grid en vivo', description: 'Una tabla Grid insertada aquí queda vinculada al documento Grid: los cambios en Grid se aplican en Writer en vivo, no como copia congelada.' },
    { title: 'Guardar y archivos', description: 'Guarda el documento y vuelve a abrirlo desde el Workspace; la barra de estado dice «guardado» solo tras confirmar la escritura.' },
    { title: 'Exportar', description: 'Exporta a DOCX o PDF y lee el informe de fidelidad, que nombra lo que no se pudo conservar.' },
    { title: 'Revisión y lectura', description: 'Activa el modo revisión para cambios registrados o el modo lectura para revisar el documento sin ediciones accidentales.' },
  ],
  Grid: [
    { title: 'Celdas y fórmulas', description: 'Introduce valores y fórmulas que empiecen por = en la barra de fórmulas; los resultados se actualizan al escribir.' },
    { title: 'Referencias', description: 'Usa referencias relativas y absolutas como A1 y $A$1, y copia fórmulas por rangos.' },
    { title: 'Formatos numéricos', description: 'Aplica formatos de número, moneda, porcentaje o fecha desde la barra a la selección.' },
    { title: 'Formato', description: 'Define alineación, ajuste, bordes y formato condicional para las celdas seleccionadas.' },
    { title: 'Gráficos', description: 'Inserta un gráfico que lee el rango seleccionado y se actualiza al cambiar los datos.' },
    { title: 'Guardar y archivos', description: 'Guarda el libro y vuelve a abrirlo; las hojas, fórmulas y formatos se conservan.' },
    { title: 'Exportar e imprimir', description: 'Exporta XLSX, CSV o PDF, o imprime la hoja con los formatos numéricos mostrados.' },
  ],
  Present: [
    { title: 'Diapositivas', description: 'Añade, reordena y selecciona diapositivas en la barra lateral; la activa se edita en el lienzo.' },
    { title: 'Texto y objetos', description: 'Coloca texto, imágenes, formas y widgets, y muévelos, redimensiónalos o gíralos directamente.' },
    { title: 'Diseños y tarjetas', description: 'Elige un diseño o estilo de tarjeta para la diapositiva y edita el contenido en su sitio.' },
    { title: 'Notas del ponente', description: 'Escribe notas por diapositiva; la vista del presentador las muestra junto a la diapositiva actual.' },
    { title: 'Iniciar presentación', description: 'Inicia la presentación y elige los roles en el diálogo de monitores, o usa el modo presentador de una pantalla.' },
    { title: 'Animaciones', description: 'Asigna animaciones con duración y disparador a los objetos y previsualízalas antes de presentar.' },
    { title: 'Exportar y diseño', description: 'Exporta la presentación o aplica un tema; los estilos maestros mantienen tipografía y colores.' },
  ],
  Notes: [
    { title: 'Cuadernos y páginas', description: 'Crea cuadernos, secciones y páginas; el árbol de páginas mantiene el cuaderno organizado.' },
    { title: 'Edición Markdown', description: 'Escribe Markdown en el cuerpo de la página y cambia a la vista previa para leer.' },
    { title: 'Etiquetas y propiedades', description: 'Añade etiquetas, alias y propiedades para que las notas sigan siendo localizables y filtrables.' },
    { title: 'Buscar', description: 'Usa buscar y reemplazar en la página o la búsqueda del cuaderno para encontrar contenido rápido.' },
    { title: 'Backlinks y grafo', description: 'Enlaza notas y abre el grafo de conocimiento para revisar backlinks y notas relacionadas.' },
    { title: 'Guardar y archivos', description: 'Guarda el cuaderno y vuelve a abrirlo; contenido, enlaces y etiquetas se conservan.' },
    { title: 'Exportar y plantillas', description: 'Exporta una nota como Markdown, HTML o PDF y empieza páginas nuevas desde plantillas.' },
  ],
  Tasks: [
    { title: 'Alta rápida', description: 'Añade una tarea desde el campo rápido y dale un título claro.' },
    { title: 'Detalles de la tarea', description: 'Define vencimiento, prioridad, estado y descripción en el panel de detalles.' },
    { title: 'Completar tareas', description: 'Marca una tarea como completada; las completadas siguen visibles en sus vistas.' },
    { title: 'Vistas y filtros', description: 'Cambia entre lista, tablero y calendario y filtra por estado o etiqueta.' },
    { title: 'Subtareas y dependencias', description: 'Divide el trabajo en subtareas, enlaza dependencias y mantén sincronizado el progreso del padre.' },
    { title: 'Guardar y archivos', description: 'Guarda el documento de tareas y vuelve a abrirlo; tareas, estados y fechas permanecen.' },
    { title: 'Exportar', description: 'Exporta tareas como iCalendar, CSV o JSON, o imprímelas; los campos no admitidos se nombran.' },
  ],
  Whiteboard: [
    { title: 'Navegar el lienzo', description: 'Desplaza y amplía el lienzo infinito; seleccionar, desplazar y zoom siguen en la barra.' },
    { title: 'Notas adhesivas', description: 'Añade notas adhesivas de colores y muévelas a grupos.' },
    { title: 'Tinta y texto', description: 'Dibuja con lápiz, lápiz fino, resaltador, borrador y lazo, o añade bloques de texto libre.' },
    { title: 'Formas y conectores', description: 'Inserta formas de proceso, decisión y terminal y conéctalas con líneas.' },
    { title: 'Marcos e imágenes', description: 'Añade marcos imprimibles y coloca imágenes locales u objetos del Workspace en el tablero.' },
    { title: 'Guardar y abrir', description: 'Guarda el tablero y vuelve a abrirlo; los objetos conservan sus posiciones.' },
    { title: 'Exportar', description: 'Exporta el lienzo como PNG o envía el diagrama a una diapositiva de Present.' },
  ],
  Publish: [
    { title: 'Configuración de página', description: 'Revisa tamaño, márgenes, sangrado y columnas en la barra de página antes de añadir contenido.' },
    { title: 'Marcos de texto e imagen', description: 'Coloca marcos de texto e imagen en la página y redimensiónalos con los tiradores.' },
    { title: 'Formas y SVG', description: 'Añade formas desde el menú o incrusta un SVG en un marco gráfico.' },
    { title: 'Contenido vivo del Workspace', description: 'Coloca activos de Vault protegidos o arrastra tablas e historias del Workspace a la página.' },
    { title: 'Preflight', description: 'Ejecuta el preflight y sigue los avisos numerados hasta el marco afectado.' },
    { title: 'Guardar y páginas', description: 'Guarda la publicación y vuelve a abrirla; geometría, marcos y maestros se conservan.' },
    { title: 'Exportar', description: 'Exporta PDF/X-4, PDF/X-1a, HTML, EPUB o un paquete; el resultado lista advertencias.' },
  ],
  PdfStudio: [
    { title: 'Abrir y leer', description: 'Abre un PDF del Workspace y léelo página a página con el navegador de miniaturas.' },
    { title: 'Anotaciones', description: 'Resalta, subraya, tacha o comenta el texto seleccionado; las anotaciones son reversibles.' },
    { title: 'Redacción', description: 'Marca áreas de redacción y exporta una copia redactada; la redacción es permanente en el archivo exportado.' },
    { title: 'Herramientas de página', description: 'Usa las herramientas de página para girar, extraer o ensamblar páginas antes de exportar.' },
    { title: 'Firmas y protección', description: 'Añade un sello de firma o firma digital y aplica protección con contraseña donde se admita.' },
    { title: 'OCR y conversión', description: 'Ejecuta OCR local o convierte el PDF en documentos del Workspace; la fidelidad limitada se informa.' },
    { title: 'Guardar y exportar', description: 'Guarda el PDF anotado y exporta una copia; la exportación informa lo escrito.' },
  ],
  Draw: [
    { title: 'Formas', description: 'Inserta formas con el control Rectángulo o desde la biblioteca de formas con búsqueda.' },
    { title: 'Mover y redimensionar', description: 'Selecciona, mueve, redimensiona o gira objetos; el ajuste y la cuadrícula ayudan a alinear.' },
    { title: 'Páginas y capas', description: 'Crea páginas y capas, renómbralas y controla visibilidad, bloqueo e impresión.' },
    { title: 'Conectores', description: 'Conecta formas con rutas rectas, ortogonales o curvas y añade puntos de paso.' },
    { title: 'Estilo', description: 'Define relleno, trazo, estilo de línea y radio de esquina en el inspector de estilo.' },
    { title: 'Guardar y abrir', description: 'Guarda el dibujo y vuelve a abrirlo; páginas, capas y estilos se conservan.' },
    { title: 'Interoperabilidad', description: 'Importa arte SVG y conserva archivos .vdraw cifrados para entrega y exportación SVG.' },
  ],
  Vault: [
    { title: 'Estado de protección', description: 'Lee primero el panel de cifrado y política de claves; indica el modo de protección y la generación de claves.' },
    { title: 'Bloquear y desbloquear', description: 'Bloquea la sesión o deja actuar el autobloqueo; desbloquear con PIN o contraseña valida la credencial.' },
    { title: 'Archivos y carpetas', description: 'Importa archivos locales o vincula documentos del Workspace en carpetas y búscalos localmente.' },
    { title: 'Integridad', description: 'Verifica la integridad; las discrepancias se nombran y se ponen en cuarentena en vez de abrirse en silencio.' },
    { title: 'Copia y recuperación', description: 'Crea copias cifradas y restaura desde papelera, versiones o una instantánea de recuperación.' },
    { title: 'Compartir y exportar en claro', description: 'Comparte con concesiones con destinatario y caducidad; una exportación en claro muestra siempre una advertencia.' },
    { title: 'Límites beta', description: 'Los límites están en la app: el modo dispositivo bloquea la UI sin credencial, el PIN tiene 4–8 dígitos y no hay clave de recuperación universal.' },
  ],
  Insight: [
    { title: 'Fuente de datos', description: 'Elige un conjunto local o una fuente del Workspace y revisa sus campos.' },
    { title: 'Vistas', description: 'Crea una vista desde los campos y elige filas, columnas y medidas.' },
    { title: 'Filtros', description: 'Cambia los filtros y actualiza la vista para ver qué filas se devuelven.' },
    { title: 'KPIs', description: 'Añade tarjetas KPI con medidas y compáralas con un periodo anterior.' },
    { title: 'Pivots y segmentos', description: 'Desglosa totales con pivots y la barra de segmentos; los grupos vacíos se nombran en vez de mostrar cero.' },
    { title: 'Guardar y procedencia', description: 'Guarda el análisis; la procedencia lista fuentes vinculadas y aristas sin resolver.' },
    { title: 'Exportar', description: 'Exporta la vista como XLSX o PDF y comprueba el recuento de filas informado.' },
  ],
  Connect: [
    { title: 'Carpetas', description: 'Explora bandeja, borradores, enviados, archivo y carpetas de Vault.' },
    { title: 'Contactos', description: 'Revisa contactos y añade solo personas que reconozcas.' },
    { title: 'Redactar', description: 'Prepara un mensaje con destinatario, asunto y cuerpo.' },
    { title: 'Cola en lugar de envío', description: 'Enviar encola el mensaje localmente; el aviso dice «en cola», no «enviado», mientras no haya transporte configurado.' },
    { title: 'Nota de protección', description: 'La vista de redacción indica qué protección se aplica; no reclama cifrado que no se ejecutó.' },
    { title: 'Búsqueda y calendario', description: 'Busca mensajes locales y revisa las entradas de calendario.' },
    { title: 'Estado de la cuenta', description: 'Comprueba conexión y TLS en los ajustes de cuenta antes de esperar entrega.' },
  ],
  Automate: [
    { title: 'Disparador', description: 'Añade un disparador de evento del Workspace como document.saved.' },
    { title: 'Acciones', description: 'Añade acciones acotadas del Workspace y conéctalas en orden.' },
    { title: 'Vista previa', description: 'Ejecuta la vista previa simulada; no realiza acciones externas.' },
    { title: 'Traza', description: 'Revisa la traza para ver qué paso produjo cada resultado.' },
    { title: 'Ejecución acotada', description: 'La automatización está acotada: sin bucles sin control y sin conectores remotos sin política explícita.' },
    { title: 'Guardar', description: 'Guarda la automatización y vuelve a abrirla desde el Workspace.' },
    { title: 'Errores', description: 'Las ejecuciones rechazadas o fallidas muestran un resultado nombrado en vez de detenerse en silencio.' },
  ],
  AdminPolicy: [
    { title: 'Estado del gate', description: 'Admin & Policy está bloqueado en la Beta 0.1: las políticas se muestran, no se aplican.' },
    { title: 'Vista de solo lectura', description: 'Un documento de políticas existente se abre en una vista de gate de solo lectura; no se escribe nada.' },
    { title: 'Sin documentos nuevos', description: 'En la beta no se pueden crear nuevos documentos de administración.' },
    { title: 'Qué se muestra', description: 'Dominios como roles, dispositivos, cifrado, DLP, retención, red, auditoría, continuidad, privacidad y ciclo de vida solo se listan para inspección.' },
    { title: 'Sin promesa de aplicación', description: 'Ningún módulo del Workspace consulta estas políticas en sus puntos de operación todavía.' },
    { title: 'Cuándo se libera', description: 'La liberación exige que la aplicación esté conectada y probada en las operaciones reales.' },
    { title: 'Seguridad de datos', description: 'Los datos de políticas existentes se conservan; la vista de gate no cambia nada.' },
  ],
};

const APP_GUIDE_STEPS_IT: AppGuideStepsForLocale = {
  Writer: [
    { title: 'Testo principale', description: 'Scrivi nel corpo della pagina; ogni paragrafo resta un blocco modificabile che puoi selezionare e formattare.' },
    { title: 'Formattazione e titoli', description: 'Usa grassetto, corsivo, sottolineato, elenchi e stili di titolo perché la struttura sopravviva all’esportazione.' },
    { title: 'Tabelle', description: 'Inserisci una tabella, modifica le celle e premi Tab nell’ultima cella per aggiungere una riga.' },
    { title: 'Tabella Grid live', description: 'Una tabella Grid inserita qui resta collegata al documento Grid: le modifiche in Grid arrivano in Writer live, non come copia congelata.' },
    { title: 'Salvataggio e file', description: 'Salva il documento e riaprilo dal Workspace; la barra di stato dice «salvato» solo dopo la conferma della scrittura.' },
    { title: 'Esportazione', description: 'Esporta in DOCX o PDF e leggi il rapporto di fedeltà, che indica ciò che non è stato conservato.' },
    { title: 'Revisione e lettura', description: 'Attiva la modalità revisione per le modifiche tracciate o la modalità lettura per controllare il documento senza modifiche accidentali.' },
  ],
  Grid: [
    { title: 'Celle e formule', description: 'Inserisci valori e formule che iniziano con = nella barra della formula; i risultati si aggiornano mentre scrivi.' },
    { title: 'Riferimenti', description: 'Usa riferimenti relativi e assoluti come A1 e $A$1 e copia le formule tra intervalli.' },
    { title: 'Formati numerici', description: 'Applica formati numero, valuta, percentuale o data dalla barra alla selezione.' },
    { title: 'Formattazione', description: 'Imposta allineamento, ritorno a capo, bordi e formattazione condizionale per le celle selezionate.' },
    { title: 'Grafici', description: 'Inserisci un grafico che legge l’intervallo scelto e si aggiorna al cambio dei dati.' },
    { title: 'Salvataggio e file', description: 'Salva la cartella di lavoro e riaprila; fogli, formule e formati vengono conservati.' },
    { title: 'Esportazione e stampa', description: 'Esporta XLSX, CSV o PDF, oppure stampa il foglio con i formati numerici visualizzati.' },
  ],
  Present: [
    { title: 'Diapositive', description: 'Aggiungi, riordina e seleziona le diapositive nella barra laterale; quella attiva si modifica sulla tela.' },
    { title: 'Testo e oggetti', description: 'Posiziona testo, immagini, forme e widget, poi spostali, ridimensionali o ruotali direttamente.' },
    { title: 'Layout e card', description: 'Scegli un layout o uno stile di card per la diapositiva e modifica il contenuto sul posto.' },
    { title: 'Note del relatore', description: 'Scrivi note per diapositiva; la vista relatore le mostra accanto alla diapositiva corrente.' },
    { title: 'Avviare la presentazione', description: 'Avvia la presentazione e scegli i ruoli nella finestra monitor, oppure usa il relatore a schermo singolo.' },
    { title: 'Animazioni', description: 'Assegna animazioni con durata e trigger agli oggetti e visualizzale in anteprima prima di presentare.' },
    { title: 'Esportazione e design', description: 'Esporta la presentazione o applica un tema; gli stili master mantengono tipografia e colori coerenti.' },
  ],
  Notes: [
    { title: 'Quaderni e pagine', description: 'Crea quaderni, sezioni e pagine; l’albero delle pagine tiene organizzato il quaderno.' },
    { title: 'Modifica Markdown', description: 'Scrivi Markdown nel corpo della pagina e passa all’anteprima quando vuoi leggere.' },
    { title: 'Tag e proprietà', description: 'Aggiungi tag, alias e proprietà perché le note restino trovabili e filtrabili.' },
    { title: 'Ricerca', description: 'Usa trova e sostituisci nella pagina o la ricerca del quaderno per trovare contenuti rapidamente.' },
    { title: 'Backlink e grafo', description: 'Collega le note e apri il grafo della conoscenza per controllare backlink e note correlate.' },
    { title: 'Salvataggio e file', description: 'Salva il quaderno e riaprilo; contenuti, collegamenti e tag vengono conservati.' },
    { title: 'Esportazione e modelli', description: 'Esporta una nota come Markdown, HTML o PDF e inizia nuove pagine dai modelli.' },
  ],
  Tasks: [
    { title: 'Aggiunta rapida', description: 'Aggiungi un’attività dal campo rapido e dalle un titolo chiaro.' },
    { title: 'Dettagli attività', description: 'Imposta scadenza, priorità, stato e descrizione nel pannello dei dettagli.' },
    { title: 'Completare le attività', description: 'Segna un’attività come completata; quelle completate restano visibili nelle viste.' },
    { title: 'Viste e filtri', description: 'Passa tra elenco, board e calendario e filtra per stato o tag.' },
    { title: 'Sottotask e dipendenze', description: 'Suddividi il lavoro in sottotask, collega le dipendenze e mantieni sincronizzato l’avanzamento del genitore.' },
    { title: 'Salvataggio e file', description: 'Salva il documento delle attività e riaprilo; attività, stati e date restano.' },
    { title: 'Esportazione', description: 'Esporta le attività in iCalendar, CSV o JSON, oppure stampale; i campi non supportati vengono indicati.' },
  ],
  Whiteboard: [
    { title: 'Navigare la tela', description: 'Sposta e ingrandisci la tela infinita; selezione, spostamento e zoom restano nella barra.' },
    { title: 'Note adesive', description: 'Aggiungi note adesive colorate e spostale in gruppi.' },
    { title: 'Inchiostro e testo', description: 'Disegna con penna, matita, evidenziatore, gomma e lazo, oppure aggiungi blocchi di testo libero.' },
    { title: 'Forme e connettori', description: 'Inserisci forme processo, decisione e terminale e collegale con linee.' },
    { title: 'Cornici e immagini', description: 'Aggiungi cornici stampabili e colloca immagini locali o oggetti del Workspace sulla board.' },
    { title: 'Salvataggio e apertura', description: 'Salva la board e riaprila; gli oggetti mantengono la loro posizione.' },
    { title: 'Esportazione', description: 'Esporta la tela come PNG o invia il diagramma a una diapositiva Present.' },
  ],
  Publish: [
    { title: 'Impostazione pagina', description: 'Controlla formato, margini, abbondanza e colonne nella barra della pagina prima di aggiungere contenuti.' },
    { title: 'Cornici testo e immagine', description: 'Posiziona cornici di testo e immagine sulla pagina e ridimensionali con le maniglie.' },
    { title: 'Forme e SVG', description: 'Aggiungi forme dal menu o incorpora un SVG in una cornice grafica.' },
    { title: 'Contenuti Workspace live', description: 'Posiziona asset Vault protetti o trascina tabelle e storie dal Workspace alla pagina.' },
    { title: 'Preflight', description: 'Esegui il preflight e segui i rilievi numerati fino alla cornice interessata.' },
    { title: 'Salvataggio e pagine', description: 'Salva la pubblicazione e riaprila; geometria, cornici e master vengono conservati.' },
    { title: 'Esportazione', description: 'Esporta PDF/X-4, PDF/X-1a, HTML, EPUB o un pacchetto; il risultato elenca gli avvisi.' },
  ],
  PdfStudio: [
    { title: 'Aprire e leggere', description: 'Apri un PDF dal Workspace e leggilo pagina per pagina con il navigatore miniature.' },
    { title: 'Annotazioni', description: 'Evidenzia, sottolinea, barra o commenta il testo selezionato; le annotazioni sono reversibili.' },
    { title: 'Oscuramento', description: 'Segna le aree da oscurare ed esporta una copia oscurata; nel file esportato l’oscuramento è permanente.' },
    { title: 'Strumenti pagina', description: 'Usa gli strumenti pagina per ruotare, estrarre o assemblare pagine prima dell’esportazione.' },
    { title: 'Firme e protezione', description: 'Aggiungi un timbro firma o una firma digitale e applica la protezione con password dove supportata.' },
    { title: 'OCR e conversione', description: 'Esegui OCR locale o converti il PDF in documenti del Workspace; la fedeltà limitata viene indicata.' },
    { title: 'Salvataggio ed esportazione', description: 'Salva il PDF annotato ed esporta una copia; l’esportazione riferisce cosa è stato scritto.' },
  ],
  Draw: [
    { title: 'Forme', description: 'Inserisci forme con il controllo Rettangolo o dalla libreria forme con ricerca.' },
    { title: 'Spostare e ridimensionare', description: 'Seleziona, sposta, ridimensiona o ruota oggetti; aggancio e griglia aiutano l’allineamento.' },
    { title: 'Pagine e livelli', description: 'Crea pagine e livelli, rinominali e controlla visibilità, blocco e stampa.' },
    { title: 'Connettori', description: 'Collega forme con percorsi diritti, ortogonali o curvi e aggiungi punti di passaggio.' },
    { title: 'Stile', description: 'Imposta riempimento, contorno, stile tratto e raggio angoli nell’ispettore di stile.' },
    { title: 'Salvataggio e apertura', description: 'Salva il disegno e riaprilo; pagine, livelli e stili vengono conservati.' },
    { title: 'Interoperabilità', description: 'Importa grafica SVG e conserva file .vdraw cifrati per consegna portabile ed esportazione SVG.' },
  ],
  Vault: [
    { title: 'Stato di protezione', description: 'Leggi prima il pannello cifratura e policy chiavi; indica modalità di protezione e generazione della chiave.' },
    { title: 'Bloccare e sbloccare', description: 'Blocca la sessione o lascia agire il blocco automatico; lo sblocco con PIN o password convalida la credenziale.' },
    { title: 'File e cartelle', description: 'Importa file locali o collega documenti del Workspace in cartelle e cercali localmente.' },
    { title: 'Integrità', description: 'Verifica l’integrità; le discrepanze vengono nominate e messe in quarantena invece di essere aperte in silenzio.' },
    { title: 'Backup e ripristino', description: 'Crea backup cifrati e ripristina da cestino, versioni o uno snapshot di ripristino.' },
    { title: 'Condivisione ed export in chiaro', description: 'Condividi tramite concessioni con destinatario e scadenza; un export in chiaro mostra sempre prima un avviso.' },
    { title: 'Limiti beta', description: 'I limiti sono nell’app: la modalità dispositivo blocca la UI senza credenziale, il PIN ha 4–8 cifre e non esiste una chiave di ripristino universale.' },
  ],
  Insight: [
    { title: 'Origine dati', description: 'Scegli un set locale o una fonte Workspace e controlla i campi.' },
    { title: 'Viste', description: 'Crea una vista dai campi e scegli righe, colonne e misure.' },
    { title: 'Filtri', description: 'Cambia i filtri e aggiorna la vista per vedere quali righe vengono restituite.' },
    { title: 'KPI', description: 'Aggiungi riquadri KPI con misure e confrontali con un periodo precedente.' },
    { title: 'Pivot e segmenti', description: 'Scomponi i totali con pivot e barra segmenti; i gruppi vuoti vengono nominati invece di mostrare zero.' },
    { title: 'Salvataggio e provenienza', description: 'Salva l’analisi; la provenienza elenca fonti collegate e archi irrisolti.' },
    { title: 'Esportazione', description: 'Esporta la vista come XLSX o PDF e controlla il conteggio righe riportato.' },
  ],
  Connect: [
    { title: 'Cartelle', description: 'Esplora posta in arrivo, bozze, inviati, archivio e cartelle Vault.' },
    { title: 'Contatti', description: 'Controlla i contatti e aggiungi solo persone che riconosci.' },
    { title: 'Comporre', description: 'Prepara un messaggio con destinatario, oggetto e corpo.' },
    { title: 'Coda invece di invio', description: 'L’invio mette il messaggio in coda localmente; l’avviso dice «in coda», non «inviato», finché non è configurato un trasporto mail.' },
    { title: 'Nota di protezione', description: 'La vista di composizione indica quale protezione si applica; non dichiara cifrature che non sono state eseguite.' },
    { title: 'Ricerca e calendario', description: 'Cerca nei messaggi locali e controlla le voci di calendario.' },
    { title: 'Stato account', description: 'Controlla connessione e TLS nelle impostazioni account prima di attenderti la consegna.' },
  ],
  Automate: [
    { title: 'Trigger', description: 'Aggiungi un trigger di evento Workspace come document.saved.' },
    { title: 'Azioni', description: 'Aggiungi azioni Workspace delimitate e collegale in ordine.' },
    { title: 'Anteprima', description: 'Esegui l’anteprima simulata; non esegue azioni esterne.' },
    { title: 'Traccia', description: 'Controlla la traccia per vedere quale passo ha prodotto quale risultato.' },
    { title: 'Esecuzione delimitata', description: 'L’automazione è delimitata: nessun ciclo incontrollato e nessun connettore remoto senza policy esplicita.' },
    { title: 'Salvataggio', description: 'Salva l’automazione e riaprila dal Workspace.' },
    { title: 'Errori', description: 'Le esecuzioni rifiutate o fallite mostrano un risultato nominato invece di fermarsi in silenzio.' },
  ],
  AdminPolicy: [
    { title: 'Stato del gate', description: 'Admin & Policy è bloccato nella Beta 0.1: le policy vengono mostrate, non applicate.' },
    { title: 'Vista in sola lettura', description: 'Un documento policy esistente si apre in una vista gate in sola lettura; non viene scritto nulla.' },
    { title: 'Nessun nuovo documento', description: 'Nella beta non si possono creare nuovi documenti amministrativi.' },
    { title: 'Cosa viene mostrato', description: 'Domini come ruoli, dispositivi, cifratura, DLP, conservazione, rete, audit, continuità, privacy e ciclo di vita sono elencati solo per ispezione.' },
    { title: 'Nessuna promessa di applicazione', description: 'Nessun modulo Workspace consulta ancora queste policy nei propri punti operativi.' },
    { title: 'Quando verrà rilasciato', description: 'Il rilascio richiede che l’applicazione sia collegata e testata nelle operazioni reali.' },
    { title: 'Sicurezza dei dati', description: 'I dati policy esistenti vengono conservati; la vista gate non cambia nulla.' },
  ],
};

const APP_GUIDE_STEPS_JA: AppGuideStepsForLocale = {
  Writer: [
    { title: '本文', description: 'ページ本文に入力します。各段落は選択して書式設定できる編集可能なブロックのままです。' },
    { title: '書式と見出し', description: '太字、斜体、下線、リスト、見出しスタイルを使い、構造が書き出し後も残るようにします。' },
    { title: '表', description: '表を挿入してセルを編集し、最後のセルで Tab を押すと行が追加されます。' },
    { title: 'Grid ライブ表', description: 'ここに埋め込んだ Grid 表は Grid 文書にリンクしたままです。Grid の変更は固定コピーではなく Writer にライブ反映されます。' },
    { title: '保存とファイル', description: '文書を保存し、Workspace から再度開きます。ステータスバーは書き込み確認後にのみ「保存済み」と表示します。' },
    { title: '書き出し', description: 'DOCX または PDF に書き出し、忠実性レポートで保持できなかった点を確認します。' },
    { title: 'レビューと閲覧モード', description: '変更履歴のレビューモード、または誤編集を避ける閲覧モードを切り替えます。' },
  ],
  Grid: [
    { title: 'セルと数式', description: '数式バーに = で始まる値や数式を入力します。入力中に結果が更新されます。' },
    { title: '参照', description: 'A1 や $A$1 のような相対参照と絶対参照を使い、数式を範囲にコピーします。' },
    { title: '数値形式', description: 'ツールバーから数値、通貨、パーセント、日付の形式を選択範囲に適用します。' },
    { title: '書式設定', description: '選択セルの配置、折り返し、罫線、条件付き書式を設定します。' },
    { title: 'グラフ', description: '選択範囲を読み取り、データ変更で更新されるグラフを挿入します。' },
    { title: '保存とファイル', description: 'ブックを保存して再度開きます。シート、数式、書式は保持されます。' },
    { title: '書き出しと印刷', description: 'XLSX、CSV、PDF に書き出すか、表示中の数値形式でシートを印刷します。' },
  ],
  Present: [
    { title: 'スライド', description: 'サイドバーでスライドを追加、並べ替え、選択します。選択中のスライドはキャンバスで編集します。' },
    { title: 'テキストとオブジェクト', description: 'テキスト、画像、図形、ウィジェットを配置し、直接移動・サイズ変更・回転できます。' },
    { title: 'レイアウトとカード', description: 'スライドのレイアウトまたはカードスタイルを選び、その場で内容を編集します。' },
    { title: '発表者ノート', description: 'スライドごとにノートを書き、プレゼンタービューで現在のスライドの横に表示します。' },
    { title: 'プレゼン開始', description: 'プレゼンを開始し、モニターダイアログで表示ロールを選ぶか、シングルスクリーンのプレゼンターモードを使います。' },
    { title: 'アニメーション', description: 'オブジェクトに再生時間とトリガー付きのアニメーションを割り当て、開始前にプレビューします。' },
    { title: '書き出しとデザイン', description: 'デッキを書き出すかテーマを適用します。マスタースタイルが書体と色を統一します。' },
  ],
  Notes: [
    { title: 'ノートブックとページ', description: 'ノートブック、セクション、ページを作成します。ページツリーが整理を保ちます。' },
    { title: 'Markdown 編集', description: 'ページ本文に Markdown を書き、読みたいときにプレビューへ切り替えます。' },
    { title: 'タグとプロパティ', description: 'タグ、別名、プロパティを追加し、ノートを検索・絞り込み可能に保ちます。' },
    { title: '検索', description: 'ページ内の検索と置換、またはノートブック検索で内容を素早く見つけます。' },
    { title: 'バックリンクとグラフ', description: 'ノートをリンクし、ナレッジグラフでバックリンクと関連ノートを確認します。' },
    { title: '保存とファイル', description: 'ノートブックを保存して再度開きます。本文、リンク、タグは保持されます。' },
    { title: '書き出しとテンプレート', description: 'ノートを Markdown、HTML、PDF として書き出し、テンプレートから新しいページを始めます。' },
  ],
  Tasks: [
    { title: 'すばやく追加', description: 'クイック追加欄からタスクを追加し、明確なタイトルを付けます。' },
    { title: 'タスク詳細', description: '詳細パネルで期限、優先度、ステータス、説明を設定します。' },
    { title: 'タスクの完了', description: 'タスクにチェックを入れて完了します。完了済みも各ビューに残ります。' },
    { title: 'ビューとフィルター', description: 'リスト、ボード、カレンダーを切り替え、ステータスやタグで絞り込みます。' },
    { title: 'サブタスクと依存関係', description: '作業をサブタスクに分け、依存関係をリンクし、親の進捗を同期します。' },
    { title: '保存とファイル', description: 'タスク文書を保存して再度開きます。タスク、状態、日付は保持されます。' },
    { title: '書き出し', description: 'タスクを iCalendar、CSV、JSON に書き出すか印刷します。未対応フィールドは明示されます。' },
  ],
  Whiteboard: [
    { title: 'キャンバスの移動', description: '無限キャンバスを移動・ズームします。選択、移動、ズームはツールバーにあります。' },
    { title: '付箋', description: '色付きの付箋を追加し、まとまりに移動します。' },
    { title: 'インクとテキスト', description: 'ペン、鉛筆、ハイライター、消しゴム、なげなわで描くか、自由テキストブロックを追加します。' },
    { title: '図形とコネクター', description: 'プロセス、判断、端子の図形を挿入し、線で接続します。' },
    { title: 'フレームと画像', description: '印刷可能なフレームを追加し、ローカル画像や Workspace オブジェクトをボードに置きます。' },
    { title: '保存と再オープン', description: 'ボードを保存して再度開きます。オブジェクトは位置を保ちます。' },
    { title: '書き出し', description: 'キャンバスを PNG として書き出すか、図を Present スライドとして送ります。' },
  ],
  Publish: [
    { title: 'ページ設定', description: '内容を追加する前に、ページ設定バーで用紙サイズ、余白、塗り足し、段組を確認します。' },
    { title: 'テキストと画像フレーム', description: 'ページにテキストと画像のフレームを配置し、ハンドルでサイズを変更します。' },
    { title: '図形と SVG', description: '図形メニューから図形を追加するか、SVG をグラフィックフレームに埋め込みます。' },
    { title: 'Workspace のライブ内容', description: '保護された Vault アセットを配置するか、Workspace の表やストーリーをページにドロップします。' },
    { title: 'プリフライト', description: 'プリフライトを実行し、番号付きの指摘から該当フレームへ移動します。' },
    { title: '保存とページ', description: '出版物を保存して再度開きます。ページ形状、フレーム、マスターは保持されます。' },
    { title: '書き出し', description: 'PDF/X-4、PDF/X-1a、HTML、EPUB、またはパッケージを書き出します。結果に警告が並びます。' },
  ],
  PdfStudio: [
    { title: '開いて読む', description: 'Workspace から PDF を開き、サムネイルナビゲーターでページごとに読みます。' },
    { title: '注釈', description: '選択したテキストにハイライト、下線、取り消し線、コメントを付けます。注釈は元に戻せます。' },
    { title: '墨消し', description: '墨消し領域を指定して墨消し済みコピーを書き出します。書き出しファイルでは墨消しは永続的です。' },
    { title: 'ページツール', description: '書き出し前にページツールで回転、抽出、組み立てを行います。' },
    { title: '署名と保護', description: '署名スタンプまたはデジタル署名を追加し、対応箇所ではパスワード保護を設定します。' },
    { title: 'OCR と変換', description: 'ローカル OCR を実行するか PDF を Workspace 文書に変換します。忠実性の限界は報告されます。' },
    { title: '保存と書き出し', description: '注釈付き PDF を保存し、コピーを書き出します。書き出しは書き込んだ内容を報告します。' },
  ],
  Draw: [
    { title: '図形', description: '矩形コントロールまたは検索可能な図形ライブラリから図形を挿入します。' },
    { title: '移動とサイズ変更', description: 'オブジェクトを選択、移動、サイズ変更、回転します。スナップとグリッドが整列を助けます。' },
    { title: 'ページとレイヤー', description: 'ページとレイヤーを作成して名前を付け、表示、ロック、印刷可否を制御します。' },
    { title: 'コネクター', description: '図形を直線、直角、曲線のルートで接続し、経由点を追加します。' },
    { title: 'スタイル', description: 'スタイルインスペクターで塗り、線、破線スタイル、角丸を設定します。' },
    { title: '保存と開く', description: '図面を保存して再度開きます。ページ、レイヤー、スタイルは保持されます。' },
    { title: '相互運用', description: 'SVG アートを読み込み、暗号化 .vdraw ファイルを可搬な受け渡しと SVG 書き出しに保ちます。' },
  ],
  Vault: [
    { title: '保護状態', description: 'まず暗号化と鍵ポリシーのパネルを読みます。保護モードと鍵世代が示されます。' },
    { title: 'ロックと解除', description: 'Vault セッションをロックするか自動ロックを待ちます。PIN またはパスワードでの解除は資格情報を検証します。' },
    { title: 'ファイルとフォルダー', description: 'ローカルファイルを読み込むか Workspace 文書をフォルダーにリンクし、ローカルで検索します。' },
    { title: '整合性', description: 'ファイル整合性を検証します。不一致は名前を付けられ、黙って開かれず隔離されます。' },
    { title: 'バックアップと復元', description: '暗号化バックアップを作成し、ゴミ箱、バージョン、復元スナップショットから復元します。' },
    { title: '共有と平文書き出し', description: '受信者と期限付きのグラントで共有します。平文書き出しは常に最初に警告を示します。' },
    { title: 'ベータの制限', description: '制限はアプリ内に明記されています。デバイスモードは資格情報なしで UI をロックし、PIN は 4～8 桁で、汎用の復元鍵はありません。' },
  ],
  Insight: [
    { title: 'データソース', description: 'ローカルデータセットまたは Workspace ソースを選び、フィールドを確認します。' },
    { title: 'ビュー', description: 'フィールドからビューを作成し、行、列、メジャーを選びます。' },
    { title: 'フィルター', description: 'フィルターを変更してビューを更新し、返される行を確認します。' },
    { title: 'KPI', description: 'メジャー付きの KPI タイルを追加し、前期間と比較します。' },
    { title: 'ピボットとセグメント', description: 'ピボットとセグメントバーで合計を分解します。空のグループはゼロではなく名前で示されます。' },
    { title: '保存と来歴', description: '分析を保存します。来歴はリンクされたソースと未解決のエッジを一覧します。' },
    { title: '書き出し', description: 'ビューを XLSX または PDF に書き出し、報告された行数を確認します。' },
  ],
  Connect: [
    { title: 'フォルダー', description: '受信、下書き、送信済み、アーカイブ、Vault フォルダーを閲覧します。' },
    { title: '連絡先', description: '連絡先を確認し、本人と分かる相手だけを追加します。' },
    { title: '作成', description: '宛先、件名、本文を含むメッセージを下書きします。' },
    { title: '送信ではなくキュー', description: '送信はメッセージをローカルにキューします。メール転送が未設定の間は「送信済み」ではなく「キュー済み」と表示します。' },
    { title: '保護の注記', description: '作成ビューは適用される保護を示します。実行されていない暗号化を主張しません。' },
    { title: '検索とカレンダー', description: 'ローカルメッセージを検索し、カレンダー項目を確認します。' },
    { title: 'アカウント状態', description: '配信を期待する前に、アカウント設定で接続と TLS の状態を確認します。' },
  ],
  Automate: [
    { title: 'トリガー', description: 'document.saved などの Workspace イベントトリガーを追加します。' },
    { title: 'アクション', description: '制限された Workspace アクションを追加し、順に接続します。' },
    { title: 'プレビュー', description: 'シミュレーションのプレビューを実行します。外部アクションは実行しません。' },
    { title: 'トレース', description: '実行トレースで、どのステップがどの結果を出したか確認します。' },
    { title: '制限付き実行', description: '自動化は制限付きです。無制御のループや、明示的なポリシーなしのリモートコネクターはありません。' },
    { title: '保存', description: '自動化を保存し、Workspace から再度開きます。' },
    { title: 'エラー', description: '拒否または失敗した実行は、黙って停止せず名前付きの結果を示します。' },
  ],
  AdminPolicy: [
    { title: 'ゲート状態', description: 'Admin & Policy は Beta 0.1 でロックされています。ポリシーは表示されるだけで適用されません。' },
    { title: '読み取り専用', description: '既存のポリシー文書は読み取り専用のゲートビューで開きます。何も書き込みません。' },
    { title: '新規文書なし', description: 'ベータでは新しい管理文書を作成できません。' },
    { title: '表示内容', description: 'ロール、デバイス、暗号化、DLP、保持、ネットワーク、監査、継続性、プライバシー、ライフサイクルなどの領域は閲覧用にのみ一覧されます。' },
    { title: '適用の約束なし', description: 'まだどの Workspace モジュールも運用箇所でこれらのポリシーを参照していません。' },
    { title: '解放条件', description: '解放には、実際の運用での適用が接続・テストされている必要があります。' },
    { title: 'データ安全', description: '既存のポリシーデータは保持され、ゲートビューは何も変更しません。' },
  ],
};

const APP_GUIDE_STEPS_RU: AppGuideStepsForLocale = {
  Writer: [
    { title: 'Основной текст', description: 'Пишите в теле страницы; каждый абзац остаётся редактируемым блоком, который можно выделить и отформатировать.' },
    { title: 'Форматирование и заголовки', description: 'Используйте полужирный, курсив, подчёркивание, списки и стили заголовков, чтобы структура сохранилась при экспорте.' },
    { title: 'Таблицы', description: 'Вставьте таблицу, редактируйте ячейки и нажмите Tab в последней ячейке, чтобы добавить строку.' },
    { title: 'Живая таблица Grid', description: 'Встроенная сюда таблица Grid остаётся связанной с документом Grid: изменения в Grid передаются в Writer вживую, а не как замороженная копия.' },
    { title: 'Сохранение и файлы', description: 'Сохраните документ и откройте его снова из Workspace; строка состояния говорит «сохранено» только после подтверждённой записи.' },
    { title: 'Экспорт', description: 'Экспортируйте в DOCX или PDF и прочитайте отчёт о точности, где названо всё, что не удалось сохранить.' },
    { title: 'Режим правок и чтения', description: 'Включите режим правок для отслеживаемых изменений или режим чтения, чтобы проверить документ без случайных правок.' },
  ],
  Grid: [
    { title: 'Ячейки и формулы', description: 'Вводите значения и формулы, начиная с =, в строку формул; результаты обновляются по мере ввода.' },
    { title: 'Ссылки', description: 'Используйте относительные и абсолютные ссылки, такие как A1 и $A$1, и копируйте формулы по диапазонам.' },
    { title: 'Числовые форматы', description: 'Применяйте числовой, денежный, процентный или датовый формат с панели к выделенному диапазону.' },
    { title: 'Форматирование', description: 'Настройте выравнивание, перенос, границы и условное форматирование для выбранных ячеек.' },
    { title: 'Диаграммы', description: 'Вставьте диаграмму, которая читает выбранный диапазон и обновляется при изменении данных.' },
    { title: 'Сохранение и файлы', description: 'Сохраните книгу и откройте её снова; листы, формулы и форматы сохраняются.' },
    { title: 'Экспорт и печать', description: 'Экспортируйте XLSX, CSV или PDF либо распечатайте лист с отображаемыми числовыми форматами.' },
  ],
  Present: [
    { title: 'Слайды', description: 'Добавляйте, упорядочивайте и выбирайте слайды на боковой панели; активный слайд редактируется на холсте.' },
    { title: 'Текст и объекты', description: 'Размещайте текст, изображения, фигуры и виджеты, затем перемещайте, масштабируйте и поворачивайте их напрямую.' },
    { title: 'Макеты и карточки', description: 'Выберите макет или стиль карточки для слайда и редактируйте содержимое на месте.' },
    { title: 'Заметки докладчика', description: 'Пишите заметки к каждому слайду; режим докладчика показывает их рядом с текущим слайдом.' },
    { title: 'Запуск презентации', description: 'Запустите презентацию и выберите роли в диалоге мониторов или используйте режим докладчика на одном экране.' },
    { title: 'Анимации', description: 'Назначайте объектам анимации с длительностью и триггером и просматривайте их перед показом.' },
    { title: 'Экспорт и дизайн', description: 'Экспортируйте презентацию или примените тему; мастер-стили сохраняют типографику и цвета.' },
  ],
  Notes: [
    { title: 'Блокноты и страницы', description: 'Создавайте блокноты, разделы и страницы; дерево страниц сохраняет порядок.' },
    { title: 'Редактирование Markdown', description: 'Пишите Markdown в теле страницы и переключайтесь на предпросмотр для чтения.' },
    { title: 'Теги и свойства', description: 'Добавляйте теги, псевдонимы и свойства, чтобы заметки оставались находимыми и фильтруемыми.' },
    { title: 'Поиск', description: 'Используйте поиск с заменой на странице или поиск по блокноту, чтобы быстро находить содержимое.' },
    { title: 'Обратные ссылки и граф', description: 'Связывайте заметки и открывайте граф знаний, чтобы проверить обратные ссылки и связанные заметки.' },
    { title: 'Сохранение и файлы', description: 'Сохраните блокнот и откройте снова; содержимое, ссылки и теги сохраняются.' },
    { title: 'Экспорт и шаблоны', description: 'Экспортируйте заметку как Markdown, HTML или PDF и начинайте новые страницы из шаблонов.' },
  ],
  Tasks: [
    { title: 'Быстрое добавление', description: 'Добавьте задачу через поле быстрого ввода и дайте ей понятное название.' },
    { title: 'Детали задачи', description: 'Задайте срок, приоритет, статус и описание в панели деталей.' },
    { title: 'Завершение задач', description: 'Отметьте задачу выполненной; завершённые задачи остаются видимыми в представлениях.' },
    { title: 'Представления и фильтры', description: 'Переключайтесь между списком, доской и календарём и фильтруйте по статусу или тегу.' },
    { title: 'Подзадачи и зависимости', description: 'Разбивайте работу на подзадачи, связывайте зависимости и синхронизируйте прогресс родителя.' },
    { title: 'Сохранение и файлы', description: 'Сохраните документ задач и откройте снова; задачи, статусы и даты сохраняются.' },
    { title: 'Экспорт', description: 'Экспортируйте задачи как iCalendar, CSV или JSON либо распечатайте; неподдерживаемые поля называются.' },
  ],
  Whiteboard: [
    { title: 'Навигация по холсту', description: 'Перемещайте и масштабируйте бесконечный холст; выбор, перемещение и масштаб остаются на панели.' },
    { title: 'Стикеры', description: 'Добавляйте цветные стикеры и объединяйте их в группы.' },
    { title: 'Перо и текст', description: 'Рисуйте пером, карандашом, маркером, ластиком и лассо или добавляйте свободные текстовые блоки.' },
    { title: 'Фигуры и соединители', description: 'Вставляйте фигуры процесса, решения и терминала и соединяйте их линиями.' },
    { title: 'Рамки и изображения', description: 'Добавляйте печатные рамки и размещайте локальные изображения или объекты Workspace на доске.' },
    { title: 'Сохранение и открытие', description: 'Сохраните доску и откройте снова; объекты сохраняют позиции.' },
    { title: 'Экспорт', description: 'Экспортируйте холст в PNG или отправьте диаграмму на слайд Present.' },
  ],
  Publish: [
    { title: 'Настройка страницы', description: 'Проверьте формат, поля, вылет и колонки на панели страницы перед добавлением содержимого.' },
    { title: 'Текстовые и графические рамки', description: 'Размещайте текстовые и графические рамки на странице и меняйте размер маркерами.' },
    { title: 'Фигуры и SVG', description: 'Добавляйте фигуры из меню или встраивайте SVG в графическую рамку.' },
    { title: 'Живое содержимое Workspace', description: 'Размещайте защищённые ресурсы Vault или перетаскивайте таблицы и истории из Workspace на страницу.' },
    { title: 'Preflight', description: 'Запустите preflight и переходите по нумерованным замечаниям к затронутой рамке.' },
    { title: 'Сохранение и страницы', description: 'Сохраните публикацию и откройте снова; геометрия страниц, рамки и мастеры сохраняются.' },
    { title: 'Экспорт', description: 'Экспортируйте PDF/X-4, PDF/X-1a, HTML, EPUB или пакет; результат перечисляет предупреждения.' },
  ],
  PdfStudio: [
    { title: 'Открытие и чтение', description: 'Откройте PDF из Workspace и читайте его постранично с навигатором миниатюр.' },
    { title: 'Аннотации', description: 'Выделяйте, подчёркивайте, зачёркивайте или комментируйте текст; аннотации обратимы.' },
    { title: 'Редактирование', description: 'Отмечайте области редактирования и экспортируйте отредактированную копию; в экспорте редактирование необратимо.' },
    { title: 'Инструменты страниц', description: 'Используйте инструменты страниц для поворота, извлечения или сборки страниц перед экспортом.' },
    { title: 'Подписи и защита', description: 'Добавьте штамп подписи или цифровую подпись и задайте парольную защиту, где поддерживается.' },
    { title: 'OCR и конвертация', description: 'Запустите локальный OCR или конвертируйте PDF в документы Workspace; ограниченная точность сообщается.' },
    { title: 'Сохранение и экспорт', description: 'Сохраните PDF с аннотациями и экспортируйте копию; экспорт сообщает, что записано.' },
  ],
  Draw: [
    { title: 'Фигуры', description: 'Вставляйте фигуры инструментом «Прямоугольник» или из библиотеки фигур с поиском.' },
    { title: 'Перемещение и размер', description: 'Выбирайте, перемещайте, масштабируйте и поворачивайте объекты; привязка и сетка помогают выравниванию.' },
    { title: 'Страницы и слои', description: 'Создавайте страницы и слои, переименовывайте их и управляйте видимостью, блокировкой и печатью.' },
    { title: 'Соединители', description: 'Соединяйте фигуры прямыми, ортогональными или кривыми маршрутами и добавляйте путевые точки.' },
    { title: 'Стиль', description: 'Задайте заливку, контур, стиль штриха и радиус углов в инспекторе стиля.' },
    { title: 'Сохранение и открытие', description: 'Сохраните чертёж и откройте снова; страницы, слои и стили сохраняются.' },
    { title: 'Совместимость', description: 'Импортируйте SVG-графику и храните зашифрованные .vdraw для передачи и экспорта SVG.' },
  ],
  Vault: [
    { title: 'Состояние защиты', description: 'Сначала прочитайте панель шифрования и политики ключей: она указывает режим защиты и поколение ключа.' },
    { title: 'Блокировка и разблокировка', description: 'Заблокируйте сеанс или дождитесь автоблокировки; разблокировка по PIN или паролю проверяет учётные данные.' },
    { title: 'Файлы и папки', description: 'Импортируйте локальные файлы или связывайте документы Workspace в папках и ищите локально.' },
    { title: 'Целостность', description: 'Проверяйте целостность; расхождения называются и помещаются в карантин вместо тихого открытия.' },
    { title: 'Резервные копии и восстановление', description: 'Создавайте шифрованные копии и восстанавливайте из корзины, версий или снимка восстановления.' },
    { title: 'Общий доступ и открытый экспорт', description: 'Делитесь через разрешения с получателем и сроком; открытый экспорт всегда сначала показывает предупреждение.' },
    { title: 'Ограничения беты', description: 'Ограничения указаны в приложении: режим устройства блокирует UI без учётных данных, PIN — 4–8 цифр, универсального ключа восстановления нет.' },
  ],
  Insight: [
    { title: 'Источник данных', description: 'Выберите локальный набор данных или источник Workspace и проверьте поля.' },
    { title: 'Представления', description: 'Создайте представление из полей и выберите строки, столбцы и меры.' },
    { title: 'Фильтры', description: 'Меняйте фильтры и обновляйте представление, чтобы увидеть возвращаемые строки.' },
    { title: 'KPI', description: 'Добавляйте KPI-плитки с мерами и сравнивайте их с предыдущим периодом.' },
    { title: 'Сводные таблицы и сегменты', description: 'Разбивайте итоги сводными таблицами и панелью сегментов; пустые группы называются, а не показывают ноль.' },
    { title: 'Сохранение и происхождение', description: 'Сохраните анализ; происхождение перечисляет связанные источники и неразрешённые рёбра.' },
    { title: 'Экспорт', description: 'Экспортируйте представление в XLSX или PDF и проверьте сообщённое число строк.' },
  ],
  Connect: [
    { title: 'Папки', description: 'Просматривайте входящие, черновики, отправленные, архив и папки Vault.' },
    { title: 'Контакты', description: 'Проверяйте контакты и добавляйте только знакомых собеседников.' },
    { title: 'Написание', description: 'Готовьте сообщение с получателем, темой и телом.' },
    { title: 'Очередь вместо отправки', description: 'Отправка ставит сообщение в локальную очередь; уведомление говорит «в очереди», а не «отправлено», пока не настроен почтовый транспорт.' },
    { title: 'Заметка о защите', description: 'Вид написания указывает, какая защита применяется; он не заявляет шифрование, которого не было.' },
    { title: 'Поиск и календарь', description: 'Ищите локальные сообщения и просматривайте записи календаря.' },
    { title: 'Состояние учётной записи', description: 'Проверьте подключение и TLS в настройках учётной записи, прежде чем ждать доставку.' },
  ],
  Automate: [
    { title: 'Триггер', description: 'Добавьте триггер события Workspace, например document.saved.' },
    { title: 'Действия', description: 'Добавьте ограниченные действия Workspace и соедините их по порядку.' },
    { title: 'Предпросмотр', description: 'Запустите симулированный предпросмотр; он не выполняет внешние действия.' },
    { title: 'Трассировка', description: 'Проверьте трассировку, чтобы увидеть, какой шаг дал какой результат.' },
    { title: 'Ограниченное выполнение', description: 'Автоматизация ограничена: без неконтролируемых циклов и удалённых коннекторов без явной политики.' },
    { title: 'Сохранение', description: 'Сохраните автоматизацию и откройте её снова из Workspace.' },
    { title: 'Ошибки', description: 'Отклонённые или неудачные запуски показывают названный результат вместо тихой остановки.' },
  ],
  AdminPolicy: [
    { title: 'Статус шлюза', description: 'Admin & Policy заблокирован в Beta 0.1: политики отображаются, но не применяются.' },
    { title: 'Только чтение', description: 'Существующий документ политик открывается в шлюзовом режиме только для чтения; ничего не записывается.' },
    { title: 'Без новых документов', description: 'В бете нельзя создавать новые административные документы.' },
    { title: 'Что показано', description: 'Области роли, устройства, шифрование, DLP, хранение, сеть, аудит, непрерывность, конфиденциальность и жизненный цикл перечислены только для просмотра.' },
    { title: 'Без обещания применения', description: 'Пока ни один модуль Workspace не использует эти политики в своих операциях.' },
    { title: 'Когда откроется', description: 'Для выпуска применение должно быть подключено и проверено на реальных операциях.' },
    { title: 'Сохранность данных', description: 'Существующие данные политик сохраняются; шлюзовой вид ничего не меняет.' },
  ],
};

const APP_GUIDE_STEPS_ZH: AppGuideStepsForLocale = {
  Writer: [
    { title: '正文', description: '在页面正文中输入；每个段落仍是可选中并设置格式的可编辑块。' },
    { title: '格式与标题', description: '使用加粗、斜体、下划线、列表和标题样式，让结构在导出后保留。' },
    { title: '表格', description: '插入表格、编辑单元格，并在最后一个单元格按 Tab 新增一行。' },
    { title: 'Grid 实时表格', description: '在此嵌入的 Grid 表格与 Grid 文档保持链接：Grid 中的更改会实时同步到 Writer，而不是冻结副本。' },
    { title: '保存与文件', description: '保存文档并从工作区重新打开；状态栏只在写入确认后显示“已保存”。' },
    { title: '导出', description: '导出为 DOCX 或 PDF，并查看保真度报告，其中会说明无法保留的内容。' },
    { title: '审阅与阅读模式', description: '开启修订审阅模式，或使用阅读模式检查文档而不误改。' },
  ],
  Grid: [
    { title: '单元格与公式', description: '在编辑栏输入以 = 开头的值和公式；输入时结果随即更新。' },
    { title: '引用', description: '使用 A1 与 $A$1 等相对和绝对引用，并在区域间复制公式。' },
    { title: '数字格式', description: '从工具栏对选中区域应用数字、货币、百分比或日期格式。' },
    { title: '格式设置', description: '为所选单元格设置对齐、换行、边框和条件格式。' },
    { title: '图表', description: '插入读取所选区域的图表，数据变化时随之更新。' },
    { title: '保存与文件', description: '保存工作簿并重新打开；工作表、公式和格式都会保留。' },
    { title: '导出与打印', description: '导出 XLSX、CSV 或 PDF，或按显示的数字格式打印工作表。' },
  ],
  Present: [
    { title: '幻灯片', description: '在侧边栏添加、排序和选择幻灯片；当前幻灯片在画布上编辑。' },
    { title: '文本与对象', description: '放置文本、图片、形状和小组件，并直接移动、缩放或旋转。' },
    { title: '版式与卡片', description: '为幻灯片选择版式或卡片样式，并就地编辑内容。' },
    { title: '演讲者备注', description: '为每张幻灯片写备注；演示者视图会在当前幻灯片旁显示它们。' },
    { title: '开始演示', description: '启动演示并在显示器对话框中选择角色，或使用单屏演示者模式。' },
    { title: '动画', description: '为对象分配带时长和触发器的动画，并在演示前预览。' },
    { title: '导出与设计', description: '导出演示文稿或应用主题；母版样式保持字体与颜色一致。' },
  ],
  Notes: [
    { title: '笔记本与页面', description: '创建笔记本、分区和页面；页面树让笔记本保持有序。' },
    { title: 'Markdown 编辑', description: '在页面正文中写 Markdown，需要阅读时切换到预览。' },
    { title: '标签与属性', description: '添加标签、别名和属性，让笔记可检索、可筛选。' },
    { title: '搜索', description: '使用页内查找替换或笔记本搜索快速定位内容。' },
    { title: '反向链接与图谱', description: '链接笔记并打开知识图谱，查看反向链接和相关笔记。' },
    { title: '保存与文件', description: '保存笔记本并重新打开；页面内容、链接和标签都会保留。' },
    { title: '导出与模板', description: '将笔记导出为 Markdown、HTML 或 PDF，并从模板开始新页面。' },
  ],
  Tasks: [
    { title: '快速添加', description: '通过快速添加栏创建任务并给出清晰标题。' },
    { title: '任务详情', description: '在详情面板中设置截止日期、优先级、状态和描述。' },
    { title: '完成任务', description: '勾选任务即完成；已完成任务仍会在各视图中显示。' },
    { title: '视图与筛选', description: '在列表、看板和日历视图间切换，并按状态或标签筛选。' },
    { title: '子任务与依赖', description: '将工作拆分为子任务、链接依赖，并同步父任务进度。' },
    { title: '保存与文件', description: '保存任务文档并重新打开；任务、状态和日期都会保留。' },
    { title: '导出', description: '将任务导出为 iCalendar、CSV 或 JSON，或打印；不支持的字段会说明。' },
  ],
  Whiteboard: [
    { title: '画布导航', description: '平移和缩放无限画布；选择、平移和缩放都在工具栏中。' },
    { title: '便签', description: '添加彩色便签并把它们归入分组。' },
    { title: '墨迹与文本', description: '用钢笔、铅笔、荧光笔、橡皮和套索绘制，或添加自由文本块。' },
    { title: '形状与连接线', description: '插入流程、判断和起止形状，并用线连接。' },
    { title: '边框与图片', description: '添加可打印边框，并将本地图片或工作区对象放到白板上。' },
    { title: '保存与重新打开', description: '保存白板并重新打开；对象保持位置。' },
    { title: '导出', description: '将画布导出为 PNG，或把图表发送到 Present 幻灯片。' },
  ],
  Publish: [
    { title: '页面设置', description: '在添加内容前，于页面设置栏检查纸张、边距、出血和分栏。' },
    { title: '文本与图像框架', description: '在页面上放置文本和图像框架，并用控制柄调整大小。' },
    { title: '形状与 SVG', description: '从形状菜单添加形状，或将 SVG 嵌入图形框架。' },
    { title: '工作区实时内容', description: '放置受保护的 Vault 资源，或把工作区的表格和故事拖到页面上。' },
    { title: '印前检查', description: '运行印前检查，并按编号提示跳转到受影响的框架。' },
    { title: '保存与页面', description: '保存出版物并重新打开；页面几何、框架和母版都会保留。' },
    { title: '导出', description: '导出 PDF/X-4、PDF/X-1a、HTML、EPUB 或打包文件；结果会列出警告。' },
  ],
  PdfStudio: [
    { title: '打开与阅读', description: '从工作区打开 PDF，并用缩略图导航逐页阅读。' },
    { title: '批注', description: '对选中文本高亮、下划线、删除线或评论；批注可撤销。' },
    { title: '涂黑', description: '标记涂黑区域并导出涂黑副本；在导出文件中涂黑是永久的。' },
    { title: '页面工具', description: '导出前用页面工具旋转、提取或重新组合页面。' },
    { title: '签名与保护', description: '添加签名图章或数字签名，并在支持处应用密码保护。' },
    { title: 'OCR 与转换', description: '运行本地 OCR 或将 PDF 转换为工作区文档；有限保真度会被报告。' },
    { title: '保存与导出', description: '保存带批注的 PDF 并导出一份副本；导出会报告写入内容。' },
  ],
  Draw: [
    { title: '形状', description: '用矩形控件或从可搜索的形状库插入形状。' },
    { title: '移动与缩放', description: '选择、移动、缩放或旋转对象；吸附和网格帮助对齐。' },
    { title: '页面与图层', description: '创建并命名页面和图层，控制可见性、锁定和打印。' },
    { title: '连接线', description: '用直线、直角或曲线路径连接形状，并添加路径点。' },
    { title: '样式', description: '在样式检查器中设置填充、描边、线型和圆角。' },
    { title: '保存与打开', description: '保存绘图并重新打开；页面、图层和样式都会保留。' },
    { title: '互操作', description: '导入 SVG 图形，并保留加密 .vdraw 文件用于携带和 SVG 导出。' },
  ],
  Vault: [
    { title: '保护状态', description: '先阅读加密与密钥策略面板；它会说明保护模式和密钥代次。' },
    { title: '锁定与解锁', description: '锁定 Vault 会话或等待自动锁定；用 PIN 或密码解锁会校验凭据。' },
    { title: '文件与文件夹', description: '导入本地文件或将工作区文档链接到文件夹，并进行本地搜索。' },
    { title: '完整性', description: '校验文件完整性；不匹配会被命名并隔离，而不是被静默打开。' },
    { title: '备份与恢复', description: '创建加密备份，并从回收站、版本或恢复快照恢复。' },
    { title: '共享与明文导出', description: '通过带接收者和有效期的授权共享；明文导出总是先显示警告。' },
    { title: 'Beta 限制', description: '限制在应用中说明：设备模式无凭据即锁定界面，PIN 为 4–8 位，没有通用恢复密钥。' },
  ],
  Insight: [
    { title: '数据源', description: '选择本地数据集或工作区数据源，并检查其字段。' },
    { title: '视图', description: '从字段创建视图，并选择行、列和度量。' },
    { title: '筛选', description: '更改筛选并刷新视图，查看返回的行。' },
    { title: 'KPI', description: '添加带度量的 KPI 图块，并与上一周期比较。' },
    { title: '透视与分段', description: '用透视表和分段栏分解合计；空分组会被命名而不是显示为零。' },
    { title: '保存与来源', description: '保存分析；来源会列出关联数据源和未解析的边。' },
    { title: '导出', description: '将视图导出为 XLSX 或 PDF，并核对报告的行数。' },
  ],
  Connect: [
    { title: '文件夹', description: '浏览收件箱、草稿、已发送、归档和 Vault 文件夹。' },
    { title: '联系人', description: '检查联系人并只添加你认识的对象。' },
    { title: '撰写', description: '撰写包含收件人、主题和正文的消息。' },
    { title: '排队而非发送', description: '发送会把消息排入本地队列；在未配置邮件传输前，提示显示“已排队”而不是“已发送”。' },
    { title: '保护说明', description: '撰写视图说明所应用的保护；不会声称未执行的加密。' },
    { title: '搜索与日历', description: '搜索本地消息并查看日历条目。' },
    { title: '账户状态', description: '在期待投递前，于账户设置中检查连接和 TLS 状态。' },
  ],
  Automate: [
    { title: '触发器', description: '添加 document.saved 等 Workspace 事件触发器。' },
    { title: '动作', description: '添加有界 Workspace 动作并按顺序连接。' },
    { title: '预览', description: '运行模拟预览；它不会执行外部操作。' },
    { title: '轨迹', description: '检查运行轨迹，了解哪个步骤产生了什么结果。' },
    { title: '有界执行', description: '自动化是有界的：没有不受控循环，也没有缺乏明确策略的远程连接器。' },
    { title: '保存', description: '保存自动化并从工作区重新打开。' },
    { title: '错误', description: '被拒绝或失败的运行会显示具名结果，而不是静默停止。' },
  ],
  AdminPolicy: [
    { title: '网关状态', description: 'Admin & Policy 在 Beta 0.1 中已锁定：策略只显示，不执行。' },
    { title: '只读视图', description: '现有策略文档以只读网关视图打开；不会写入任何内容。' },
    { title: '不新建文档', description: '在 Beta 中无法创建新的管理文档。' },
    { title: '显示内容', description: '角色、设备、加密、DLP、保留、网络、审计、连续性、隐私和生命周期等领域仅供查看。' },
    { title: '不承诺执行', description: '目前没有任何工作区模块在其操作点读取这些策略。' },
    { title: '何时开放', description: '开放要求在实际操作中接入并测试执行。' },
    { title: '数据安全', description: '现有策略数据会保留；网关视图不会更改任何内容。' },
  ],
};

/**
 * Die sieben erklärten Punkte je App und Sprache. Der Record ist über `WorkspaceLocale` vollständig —
 * eine fehlende Sprache ist ein Compile-Fehler, ein fehlender Schritt ein Typfehler (7-Tupel).
 */
export const APP_GUIDE_STEPS: Readonly<Record<WorkspaceLocale, AppGuideStepsForLocale>> = Object.freeze({
  'de-DE': APP_GUIDE_STEPS_DE,
  'en-US': APP_GUIDE_STEPS_EN,
  'es-ES': APP_GUIDE_STEPS_ES,
  'it-IT': APP_GUIDE_STEPS_IT,
  'ja-JP': APP_GUIDE_STEPS_JA,
  'ru-RU': APP_GUIDE_STEPS_RU,
  'zh-CN': APP_GUIDE_STEPS_ZH,
});

/** Die sieben Schritte einer App in der gewünschten Sprache. */
export function appGuideSteps(locale: WorkspaceLocale, kind: OpenCoreAppKind): SevenGuideSteps {
  return APP_GUIDE_STEPS[locale][kind];
}

export interface AppGuideAvailabilityCopy {
  readonly className: AppAvailabilityClass;
  readonly label: string;
  readonly hint: string;
  readonly reason: string;
}

/**
 * **Verfügbarkeits-/Alpha-Kennzeichnung im App-Rundgang.**
 *
 * Die Klasse kommt aus der zentralen Release-Registry (`edition/releaseStatus.ts`), die sichtbaren Texte
 * aus dem 7-Sprachen-Katalog (`availability.*`). Damit gibt es keine zweite Einstufung und keine
 * hardcodierten deutschen Einsprengsel in der englischen Ansicht.
 */
export function appGuideAvailabilityCopy(kind: OpenCoreAppKind, locale: WorkspaceLocale): AppGuideAvailabilityCopy {
  const className = availabilityClassOf(kind);
  return Object.freeze({
    className,
    label: workspaceText(className === 'alpha' ? 'availability.alpha' : 'availability.inProgress', locale),
    hint: workspaceText(className === 'alpha' ? 'availability.alphaHint' : 'availability.inProgressHint', locale),
    reason: availabilityReason(kind, locale),
  });
}

export const APP_GUIDE_INTERFACE_COPY: Readonly<Record<WorkspaceLocale, AppGuideInterfaceCopy>> = {
  'de-DE': {
    libraryTitle: 'Hilfe & Rundgänge', libraryLabel: 'App-Rundgänge auswählen', connectedLabel: 'Erstes verbundenes Workspace', openSetup: 'Ersteinrichtung öffnen',
    guideLabel: 'App-Rundgang', connectedTitle: 'Grid mit Writer verbinden', connectedDescription: 'Führe einen kleinen Bereich aus Grid in ein Writer-Dokument über und wähle bewusst zwischen Verknüpfung, Snapshot und statischer Tabelle.',
    stepTitles: ['Mit einer kleinen Änderung beginnen', 'Ergebnis prüfen und erweitern'],
    explanationStep: 'Dieser Schritt erklärt eine Funktion; es wird kein einzelnes Steuerelement markiert.',
    connectedSteps: [
      { title: 'Tabelle in Grid erstellen', description: 'Erstelle in Grid ein kleines Blatt mit Überschrift und wenigen Werten, zum Beispiel im Bereich A1:B2.', app: 'Grid' },
      { title: 'Tabelle in Writer übernehmen', description: 'Öffne in Writer die zusätzlichen Werkzeuge und dann „Workspace-Objekt einbetten“. Wähle das Grid-Dokument, das Blatt und den vorbereiteten Bereich.', app: 'Writer' },
      { title: 'Live, Snapshot und Kopie vergleichen', description: 'Live behält die Grid-Quelle und lässt sich aktualisieren. Snapshot ist eine eingefrorene Ansicht. „Als Writer-Tabelle“ kopiert den Inhalt als statische Tabelle ohne Quellverknüpfung.', app: 'Writer' },
      { title: 'Grid-Daten ändern', description: 'Ändere einen Wert in Grid und speichere das Dokument, damit die Live-Quelle einen neuen Stand hat.', app: 'Grid' },
      { title: 'Live nach dem Speichern prüfen', description: 'Kehre nach dem Speichern in Grid zu Writer zurück. Prüfe, ob die Live-Referenz den neuen Wert zeigt; Snapshot und statische Kopie sollten unverändert bleiben.', app: 'Writer' },
      { title: 'Weitere verbundene Apps ansehen', description: 'Prüfe kompatible Workspace-Verknüpfungen zu Present, Whiteboard und Publish, sofern die jeweilige Quelle und das Ziel vorhanden sind.', app: 'Present' },
    ],
    step: 'Schritt', previous: 'Zurück', next: 'Weiter', confirmStep: 'Ich habe diesen Schritt ausgeführt', finish: 'Rundgang beenden', skip: 'Rundgang überspringen', replay: 'Rundgang erneut starten', close: 'Rundgang schließen', openApp: 'App öffnen', interactiveIntro: 'Interaktive Einführung starten', targetUnavailable: 'Das Zielsteuerelement ist in der aktuellen Ansicht nicht sichtbar.', optOut: 'Diesen Rundgang nicht mehr automatisch anzeigen', confirm: 'Bestätigen', cancel: 'Abbrechen',
    progress: (current, total) => `${current} von ${total}`,
  },
  'en-US': {
    libraryTitle: 'Help & guides', libraryLabel: 'Choose an app guide', connectedLabel: 'First connected workspace', openSetup: 'Open first-run setup',
    guideLabel: 'App guide', connectedTitle: 'Connect Grid to Writer', connectedDescription: 'Bring a small Grid range into a Writer document and choose deliberately between a link, a snapshot, and a static table.',
    stepTitles: ['Start with a small change', 'Check the result before expanding'],
    explanationStep: 'This step explains a feature; no single control is highlighted.',
    connectedSteps: [
      { title: 'Create a table in Grid', description: 'Create a small Grid sheet with a short header and a few values, for example in A1:B2.', app: 'Grid' },
      { title: 'Bring the table into Writer', description: 'In Writer, open additional tools and choose “Embed Workspace object.” Then choose the Grid document, sheet, and prepared range.', app: 'Writer' },
      { title: 'Compare live, snapshot, and copy', description: 'Live keeps the Grid source and can be refreshed. Snapshot is a frozen view. “As Writer table” copies the content into a static table with no source link.', app: 'Writer' },
      { title: 'Change Grid data', description: 'Change a value in Grid and save the document so the live source has a new revision.', app: 'Grid' },
      { title: 'Check Live after saving', description: 'After saving in Grid, return to Writer. Check whether the Live reference shows the new value; Snapshot and the static copy should remain unchanged.', app: 'Writer' },
      { title: 'Explore other connected apps', description: 'Review compatible Workspace links to Present, Whiteboard, and Publish when the matching source and target documents are available.', app: 'Present' },
    ],
    step: 'Step', previous: 'Back', next: 'Next', confirmStep: 'I completed this step', finish: 'Finish guide', skip: 'Skip guide', replay: 'Replay guide', close: 'Close guide', openApp: 'Open app', interactiveIntro: 'Start interactive introduction', targetUnavailable: 'The target control is not visible in the current view.', optOut: 'Do not show this guide automatically again', confirm: 'Confirm', cancel: 'Cancel',
    progress: (current, total) => `${current} of ${total}`,
  },
  'es-ES': {
    libraryTitle: 'Ayuda y guías', libraryLabel: 'Elige una guía de aplicación', connectedLabel: 'Primer Workspace conectado', openSetup: 'Abrir la configuración inicial',
    guideLabel: 'Guía de la aplicación', connectedTitle: 'Conectar Grid con Writer', connectedDescription: 'Lleva un rango pequeño de Grid a un documento de Writer y elige entre vínculo, instantánea y tabla estática.',
    stepTitles: ['Empieza con un cambio pequeño', 'Comprueba el resultado antes de ampliarlo'],
    explanationStep: 'Este paso explica una función; no se resalta un control concreto.',
    connectedSteps: [
      { title: 'Crea una tabla en Grid', description: 'Crea una hoja pequeña en Grid con un encabezado breve y algunos valores, por ejemplo en A1:B2.', app: 'Grid' },
      { title: 'Lleva la tabla a Writer', description: 'En Writer, abre las herramientas adicionales y elige «Insertar objeto de Workspace». Después, elige el documento Grid, la hoja y el rango preparado.', app: 'Writer' },
      { title: 'Compara vínculo, instantánea y copia', description: 'Live conserva la fuente de Grid y se puede actualizar. Snapshot es una vista congelada. «Como tabla de Writer» copia el contenido en una tabla estática sin vínculo a la fuente.', app: 'Writer' },
      { title: 'Cambia los datos de Grid', description: 'Cambia un valor en Grid y guarda el documento para que la fuente Live tenga una revisión nueva.', app: 'Grid' },
      { title: 'Comprueba Live tras guardar', description: 'Después de guardar en Grid, vuelve a Writer. Comprueba si la referencia Live muestra el nuevo valor; la instantánea y la copia estática deberían permanecer sin cambios.', app: 'Writer' },
      { title: 'Explora otras aplicaciones conectadas', description: 'Revisa los vínculos de Workspace compatibles con Present, Whiteboard y Publish cuando existan el origen y el destino correspondientes.', app: 'Present' },
    ],
    step: 'Paso', previous: 'Anterior', next: 'Siguiente', confirmStep: 'He completado este paso', finish: 'Terminar guía', skip: 'Omitir guía', replay: 'Repetir guía', close: 'Cerrar guía', openApp: 'Abrir aplicación', interactiveIntro: 'Iniciar introducción interactiva', targetUnavailable: 'El control de destino no está visible en la vista actual.', optOut: 'No volver a mostrar esta guía automáticamente', confirm: 'Confirmar', cancel: 'Cancelar',
    progress: (current, total) => `${current} de ${total}`,
  },
  'it-IT': {
    libraryTitle: 'Aiuto e guide', libraryLabel: 'Scegli una guida dell’app', connectedLabel: 'Primo Workspace collegato', openSetup: 'Apri la configurazione iniziale',
    guideLabel: 'Guida dell’app', connectedTitle: 'Collega Grid a Writer', connectedDescription: 'Inserisci un piccolo intervallo Grid in un documento Writer e scegli consapevolmente tra collegamento, snapshot e tabella statica.',
    stepTitles: ['Inizia con una piccola modifica', 'Controlla il risultato prima di ampliare'],
    explanationStep: 'Questo passo spiega una funzione; non viene evidenziato un singolo controllo.',
    connectedSteps: [
      { title: 'Crea una tabella in Grid', description: 'Crea un piccolo foglio Grid con una breve intestazione e pochi valori, ad esempio in A1:B2.', app: 'Grid' },
      { title: 'Porta la tabella in Writer', description: 'In Writer apri gli strumenti aggiuntivi e scegli «Incorpora oggetto Workspace». Poi seleziona il documento Grid, il foglio e l’intervallo preparato.', app: 'Writer' },
      { title: 'Confronta collegamento, snapshot e copia', description: 'Live mantiene la fonte Grid e può essere aggiornata. Snapshot è una vista fissa. «Come tabella Writer» copia il contenuto in una tabella statica senza collegamento alla fonte.', app: 'Writer' },
      { title: 'Modifica i dati Grid', description: 'Modifica un valore in Grid e salva il documento, così la fonte Live avrà una nuova revisione.', app: 'Grid' },
      { title: 'Controlla Live dopo il salvataggio', description: 'Dopo aver salvato in Grid, torna in Writer. Verifica se il riferimento Live mostra il nuovo valore; Snapshot e la copia statica dovrebbero restare invariati.', app: 'Writer' },
      { title: 'Scopri altre app collegate', description: 'Esamina i collegamenti Workspace compatibili con Present, Whiteboard e Publish quando sono disponibili la fonte e la destinazione.', app: 'Present' },
    ],
    step: 'Passaggio', previous: 'Indietro', next: 'Avanti', confirmStep: 'Ho completato questo passaggio', finish: 'Termina la guida', skip: 'Salta la guida', replay: 'Ripeti la guida', close: 'Chiudi la guida', openApp: 'Apri app', interactiveIntro: 'Avvia l’introduzione interattiva', targetUnavailable: 'Il controllo indicato non è visibile nella vista attuale.', optOut: 'Non mostrare più automaticamente questa guida', confirm: 'Conferma', cancel: 'Annulla',
    progress: (current, total) => `${current} di ${total}`,
  },
  'ja-JP': {
    libraryTitle: 'ヘルプとガイド', libraryLabel: 'アプリガイドを選択', connectedLabel: '最初の Workspace 接続', openSetup: '初回セットアップを開く',
    guideLabel: 'アプリガイド', connectedTitle: 'Grid を Writer に接続', connectedDescription: 'Grid の小さな範囲を Writer 文書に取り込み、リンク、スナップショット、静的な表から選択します。',
    stepTitles: ['小さな変更から始める', '範囲を広げる前に結果を確認'],
    explanationStep: 'この手順は機能の説明です。特定のコントロールは強調されません。',
    connectedSteps: [
      { title: 'Grid で表を作成', description: 'Grid に短い見出しと少数の値を含む小さなシートを作成します。例: A1:B2。', app: 'Grid' },
      { title: '表を Writer に取り込む', description: 'Writer で追加ツールを開き、「Workspace オブジェクトを埋め込む」を選びます。次に Grid 文書、シート、準備した範囲を選びます。', app: 'Writer' },
      { title: 'Live、Snapshot、コピーを比較', description: 'Live は Grid のソースを保持し、更新できます。Snapshot は固定表示です。「Writer 表として」は内容をソースリンクのない静的な表にコピーします。', app: 'Writer' },
      { title: 'Grid のデータを変更', description: 'Grid の値を変更して保存し、Live ソースの新しい版を作成します。', app: 'Grid' },
      { title: '保存後に Live を確認', description: 'Grid で保存した後 Writer に戻ります。Live 参照に新しい値が表示されるか確認し、Snapshot と静的コピーが変わらないことを確認します。', app: 'Writer' },
      { title: '他の接続アプリを確認', description: '対応するソースとターゲットがある場合、Present、Whiteboard、Publish への Workspace リンクも確認します。', app: 'Present' },
    ],
    step: 'ステップ', previous: '戻る', next: '次へ', confirmStep: 'この手順を完了しました', finish: 'ガイドを終了', skip: 'ガイドをスキップ', replay: 'ガイドを再生', close: 'ガイドを閉じる', openApp: 'アプリを開く', interactiveIntro: 'インタラクティブガイドを開始', targetUnavailable: '対象のコントロールは現在の表示にありません。', optOut: 'このガイドを自動表示しない', confirm: '確認', cancel: 'キャンセル',
    progress: (current, total) => `${current} / ${total}`,
  },
  'ru-RU': {
    libraryTitle: 'Справка и обзоры', libraryLabel: 'Выберите обзор приложения', connectedLabel: 'Первое подключение Workspace', openSetup: 'Открыть первоначальную настройку',
    guideLabel: 'Обзор приложения', connectedTitle: 'Связать Grid и Writer', connectedDescription: 'Перенесите небольшой диапазон Grid в документ Writer и выберите ссылку, снимок или статическую таблицу.',
    stepTitles: ['Начните с небольшого изменения', 'Проверьте результат до расширения'],
    explanationStep: 'Этот шаг объясняет функцию; отдельный элемент управления не выделяется.',
    connectedSteps: [
      { title: 'Создайте таблицу в Grid', description: 'Создайте небольшой лист Grid с коротким заголовком и несколькими значениями, например в A1:B2.', app: 'Grid' },
      { title: 'Перенесите таблицу в Writer', description: 'В Writer откройте дополнительные инструменты и выберите «Встроить объект Workspace». Затем выберите документ Grid, лист и подготовленный диапазон.', app: 'Writer' },
      { title: 'Сравните ссылку, снимок и копию', description: 'Live сохраняет источник Grid и может обновляться. Snapshot — зафиксированный вид. «Как таблица Writer» копирует данные в статическую таблицу без ссылки на источник.', app: 'Writer' },
      { title: 'Измените данные Grid', description: 'Измените значение в Grid и сохраните документ, чтобы у источника Live появилась новая версия.', app: 'Grid' },
      { title: 'Проверьте Live после сохранения', description: 'После сохранения в Grid вернитесь в Writer. Проверьте, появилось ли новое значение в ссылке Live; снимок и статическая копия должны остаться прежними.', app: 'Writer' },
      { title: 'Посмотрите другие связанные приложения', description: 'Проверьте совместимые связи Workspace с Present, Whiteboard и Publish, если доступны соответствующие исходные и целевые документы.', app: 'Present' },
    ],
    step: 'Шаг', previous: 'Назад', next: 'Далее', confirmStep: 'Я выполнил этот шаг', finish: 'Завершить обзор', skip: 'Пропустить обзор', replay: 'Повторить обзор', close: 'Закрыть обзор', openApp: 'Открыть приложение', interactiveIntro: 'Начать интерактивное знакомство', targetUnavailable: 'Целевой элемент не виден в текущем представлении.', optOut: 'Больше не показывать этот обзор автоматически', confirm: 'Подтвердить', cancel: 'Отмена',
    progress: (current, total) => `${current} из ${total}`,
  },
  'zh-CN': {
    libraryTitle: '帮助与指南', libraryLabel: '选择应用指南', connectedLabel: '首次连接 Workspace', openSetup: '打开首次运行设置',
    guideLabel: '应用指南', connectedTitle: '将 Grid 连接到 Writer', connectedDescription: '将一小段 Grid 区域带入 Writer 文档，并在链接、快照和静态表格之间做出选择。',
    stepTitles: ['从一个小改动开始', '扩展前先检查结果'],
    explanationStep: '此步骤说明一项功能；不会高亮单个控件。',
    connectedSteps: [
      { title: '在 Grid 中创建表格', description: '在 Grid 中创建一个小型工作表，添加简短标题和少量数值，例如 A1:B2。', app: 'Grid' },
      { title: '将表格带入 Writer', description: '在 Writer 中打开其他工具并选择“嵌入 Workspace 对象”。然后选择 Grid 文档、工作表和准备好的区域。', app: 'Writer' },
      { title: '比较 Live、Snapshot 和复制', description: 'Live 保留 Grid 来源并可刷新。Snapshot 是冻结视图。“作为 Writer 表格”会将内容复制为不含来源链接的静态表格。', app: 'Writer' },
      { title: '更改 Grid 数据', description: '在 Grid 中更改一个值并保存文档，为 Live 来源生成新版本。', app: 'Grid' },
      { title: '保存后检查 Live', description: '在 Grid 中保存后返回 Writer。检查 Live 引用是否显示新值；Snapshot 和静态副本应保持不变。', app: 'Writer' },
      { title: '查看其他连接应用', description: '在来源和目标文档均可用时，检查与 Present、Whiteboard 和 Publish 兼容的 Workspace 链接。', app: 'Present' },
    ],
    step: '步骤', previous: '上一步', next: '下一步', confirmStep: '我已完成此步骤', finish: '完成指南', skip: '跳过指南', replay: '重新播放指南', close: '关闭指南', openApp: '打开应用', interactiveIntro: '开始交互式介绍', targetUnavailable: '当前视图中看不到目标控件。', optOut: '不再自动显示此指南', confirm: '确认', cancel: '取消',
    progress: (current, total) => `${current} / ${total}`,
  },
};
