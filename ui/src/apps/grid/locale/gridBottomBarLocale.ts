// STATUS: PLATIN — seven-locale copy for Grid sheet, view, and collaboration controls.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type GridBottomBarCopy = {
  sheetOptions: string;
  renameSheet: string;
  duplicateSheet: string;
  left: string;
  right: string;
  tabColor: string;
  setTabColor: (color: string) => string;
  none: string;
  hideSheet: string;
  veryHidden: string;
  deleteSheet: string;
  addSheet: string;
  hiddenCount: (count: number) => string;
  hidden: string;
  veryHiddenCaps: string;
  toggleGridlines: string;
  gridlines: string;
  freezePanes: string;
  frozenPanes: string;
  freezePanesTitle: string;
  canvasActive: string;
  canvas: string;
  canvasTitle: string;
  zoomLevel: string;
  collaborationTitle: string;
  collaborationUnavailable: string;
  collaborationConnecting: string;
  syncGraph: (peers: number) => string;
  conflicts: (count: number) => string;
  collaborationError: string;
  engineActive: string;
};

export const GRID_BOTTOM_BAR_COPY: Readonly<Record<WorkspaceLocale, GridBottomBarCopy>> = {
  'en-US': {
    sheetOptions: 'Sheet options', renameSheet: 'Rename sheet', duplicateSheet: 'Duplicate sheet', left: 'Left', right: 'Right', tabColor: 'Tab color',
    setTabColor: (color) => `Set sheet tab color to ${color}`, none: 'None', hideSheet: 'Hide sheet', veryHidden: 'Very hidden', deleteSheet: 'Delete sheet', addSheet: 'Add new sheet',
    hiddenCount: (count) => `Hidden ${count}`, hidden: 'Hidden', veryHiddenCaps: 'Very hidden', toggleGridlines: 'Toggle gridlines', gridlines: 'Gridlines', freezePanes: 'Freeze panes', frozenPanes: 'Frozen panes',
    freezePanesTitle: 'Freeze or unfreeze the first row and column', canvasActive: 'Canvas 1M (active)', canvas: 'Canvas 1M', canvasTitle: 'Toggle high-performance 1M-row canvas virtualization',
    zoomLevel: 'Zoom level', collaborationTitle: 'Toggle local SyncGraph coauthoring', collaborationUnavailable: 'Native SyncGraph unavailable', collaborationConnecting: 'Connecting…',
    syncGraph: (peers) => `SyncGraph · ${peers} ${peers === 1 ? 'peer' : 'peers'}`, conflicts: (count) => `${count} ${count === 1 ? 'conflict' : 'conflicts'}`,
    collaborationError: 'Local collaboration is unavailable. Your current document remains open.', engineActive: 'Active',
  },
  'de-DE': {
    sheetOptions: 'Blattoptionen', renameSheet: 'Blatt umbenennen', duplicateSheet: 'Blatt duplizieren', left: 'Links', right: 'Rechts', tabColor: 'Registerfarbe',
    setTabColor: (color) => `Registerfarbe auf ${color} setzen`, none: 'Keine', hideSheet: 'Blatt ausblenden', veryHidden: 'Stark ausgeblendet', deleteSheet: 'Blatt löschen', addSheet: 'Neues Blatt hinzufügen',
    hiddenCount: (count) => `Ausgeblendet ${count}`, hidden: 'Ausgeblendet', veryHiddenCaps: 'STARK AUSGEBLENDET', toggleGridlines: 'Gitternetzlinien umschalten', gridlines: 'Gitternetzlinien', freezePanes: 'Fenster fixieren', frozenPanes: 'Fenster fixiert',
    freezePanesTitle: 'Erste Zeile und Spalte fixieren oder lösen', canvasActive: 'Canvas 1M (aktiv)', canvas: 'Canvas 1M', canvasTitle: 'Hochleistungsvirtualisierung für 1 Mio. Zeilen umschalten',
    zoomLevel: 'Zoomstufe', collaborationTitle: 'Lokale SyncGraph-Zusammenarbeit umschalten', collaborationUnavailable: 'Native SyncGraph-Funktion nicht verfügbar', collaborationConnecting: 'Verbindung wird hergestellt…',
    syncGraph: (peers) => `SyncGraph · ${peers} ${peers === 1 ? 'Teilnehmer' : 'Teilnehmer'}`, conflicts: (count) => `${count} ${count === 1 ? 'Konflikt' : 'Konflikte'}`,
    collaborationError: 'Lokale Zusammenarbeit ist nicht verfügbar. Das aktuelle Dokument bleibt geöffnet.', engineActive: 'Aktiv',
  },
  'es-ES': {
    sheetOptions: 'Opciones de hoja', renameSheet: 'Cambiar nombre de hoja', duplicateSheet: 'Duplicar hoja', left: 'Izquierda', right: 'Derecha', tabColor: 'Color de pestaña',
    setTabColor: (color) => `Cambiar el color de pestaña a ${color}`, none: 'Ninguno', hideSheet: 'Ocultar hoja', veryHidden: 'Muy oculta', deleteSheet: 'Eliminar hoja', addSheet: 'Añadir hoja',
    hiddenCount: (count) => `Ocultas ${count}`, hidden: 'Oculta', veryHiddenCaps: 'MUY OCULTA', toggleGridlines: 'Alternar líneas de cuadrícula', gridlines: 'Líneas de cuadrícula', freezePanes: 'Inmovilizar paneles', frozenPanes: 'Paneles inmovilizados',
    freezePanesTitle: 'Inmovilizar o liberar la primera fila y columna', canvasActive: 'Lienzo 1M (activo)', canvas: 'Lienzo 1M', canvasTitle: 'Alternar virtualización de alto rendimiento para 1 millón de filas',
    zoomLevel: 'Nivel de zoom', collaborationTitle: 'Alternar coautoría local de SyncGraph', collaborationUnavailable: 'SyncGraph nativo no disponible', collaborationConnecting: 'Conectando…',
    syncGraph: (peers) => `SyncGraph · ${peers} ${peers === 1 ? 'colaborador' : 'colaboradores'}`, conflicts: (count) => `${count} ${count === 1 ? 'conflicto' : 'conflictos'}`,
    collaborationError: 'La colaboración local no está disponible. El documento actual permanece abierto.', engineActive: 'Activo',
  },
  'it-IT': {
    sheetOptions: 'Opzioni foglio', renameSheet: 'Rinomina foglio', duplicateSheet: 'Duplica foglio', left: 'Sinistra', right: 'Destra', tabColor: 'Colore scheda',
    setTabColor: (color) => `Imposta il colore della scheda su ${color}`, none: 'Nessuno', hideSheet: 'Nascondi foglio', veryHidden: 'Molto nascosto', deleteSheet: 'Elimina foglio', addSheet: 'Aggiungi foglio',
    hiddenCount: (count) => `Nascosti ${count}`, hidden: 'Nascosto', veryHiddenCaps: 'MOLTO NASCOSTO', toggleGridlines: 'Attiva o disattiva le griglie', gridlines: 'Griglie', freezePanes: 'Blocca riquadri', frozenPanes: 'Riquadri bloccati',
    freezePanesTitle: 'Blocca o sblocca la prima riga e colonna', canvasActive: 'Canvas 1M (attivo)', canvas: 'Canvas 1M', canvasTitle: 'Attiva o disattiva la virtualizzazione ad alte prestazioni per 1 milione di righe',
    zoomLevel: 'Livello zoom', collaborationTitle: 'Attiva o disattiva la co-creazione locale SyncGraph', collaborationUnavailable: 'SyncGraph nativo non disponibile', collaborationConnecting: 'Connessione…',
    syncGraph: (peers) => `SyncGraph · ${peers} ${peers === 1 ? 'collaboratore' : 'collaboratori'}`, conflicts: (count) => `${count} ${count === 1 ? 'conflitto' : 'conflitti'}`,
    collaborationError: 'La collaborazione locale non è disponibile. Il documento corrente resta aperto.', engineActive: 'Attivo',
  },
  'ja-JP': {
    sheetOptions: 'シートのオプション', renameSheet: 'シート名を変更', duplicateSheet: 'シートを複製', left: '左へ', right: '右へ', tabColor: 'タブの色',
    setTabColor: (color) => `シートタブの色を ${color} に設定`, none: 'なし', hideSheet: 'シートを非表示', veryHidden: '完全に非表示', deleteSheet: 'シートを削除', addSheet: 'シートを追加',
    hiddenCount: (count) => `非表示 ${count}`, hidden: '非表示', veryHiddenCaps: '完全に非表示', toggleGridlines: 'グリッド線を切り替え', gridlines: 'グリッド線', freezePanes: 'ウィンドウ枠を固定', frozenPanes: 'ウィンドウ枠を固定中',
    freezePanesTitle: '先頭の行と列を固定または解除', canvasActive: 'Canvas 1M（有効）', canvas: 'Canvas 1M', canvasTitle: '100 万行の高性能キャンバス仮想化を切り替え',
    zoomLevel: 'ズーム倍率', collaborationTitle: 'ローカル SyncGraph 共同編集を切り替え', collaborationUnavailable: 'ネイティブ SyncGraph は利用できません', collaborationConnecting: '接続中…',
    syncGraph: (peers) => `SyncGraph · ${peers} 人`, conflicts: (count) => `${count} 件の競合`, collaborationError: 'ローカル共同編集を利用できません。現在の文書は開いたままです。', engineActive: '有効',
  },
  'ru-RU': {
    sheetOptions: 'Параметры листа', renameSheet: 'Переименовать лист', duplicateSheet: 'Дублировать лист', left: 'Влево', right: 'Вправо', tabColor: 'Цвет вкладки',
    setTabColor: (color) => `Задать цвет вкладки листа: ${color}`, none: 'Нет', hideSheet: 'Скрыть лист', veryHidden: 'Скрыть очень глубоко', deleteSheet: 'Удалить лист', addSheet: 'Добавить лист',
    hiddenCount: (count) => `Скрытые: ${count}`, hidden: 'СКРЫТ', veryHiddenCaps: 'ОЧЕНЬ ГЛУБОКО СКРЫТ', toggleGridlines: 'Переключить линии сетки', gridlines: 'Линии сетки', freezePanes: 'Закрепить области', frozenPanes: 'Области закреплены',
    freezePanesTitle: 'Закрепить или снять закрепление первой строки и столбца', canvasActive: 'Canvas 1M (включён)', canvas: 'Canvas 1M', canvasTitle: 'Переключить высокопроизводительную виртуализацию на 1 млн строк',
    zoomLevel: 'Масштаб', collaborationTitle: 'Переключить локальное совместное редактирование SyncGraph', collaborationUnavailable: 'Нативный SyncGraph недоступен', collaborationConnecting: 'Подключение…',
    syncGraph: (peers) => `SyncGraph · участников: ${peers}`, conflicts: (count) => `Конфликтов: ${count}`, collaborationError: 'Локальное совместное редактирование недоступно. Текущий документ остаётся открытым.', engineActive: 'Активен',
  },
  'zh-CN': {
    sheetOptions: '工作表选项', renameSheet: '重命名工作表', duplicateSheet: '复制工作表', left: '左移', right: '右移', tabColor: '标签颜色',
    setTabColor: (color) => `将工作表标签颜色设为 ${color}`, none: '无', hideSheet: '隐藏工作表', veryHidden: '深度隐藏', deleteSheet: '删除工作表', addSheet: '添加工作表',
    hiddenCount: (count) => `已隐藏 ${count}`, hidden: '已隐藏', veryHiddenCaps: '深度隐藏', toggleGridlines: '切换网格线', gridlines: '网格线', freezePanes: '冻结窗格', frozenPanes: '窗格已冻结',
    freezePanesTitle: '冻结或取消冻结首行和首列', canvasActive: 'Canvas 1M（已启用）', canvas: 'Canvas 1M', canvasTitle: '切换 100 万行高性能画布虚拟化',
    zoomLevel: '缩放比例', collaborationTitle: '切换本地 SyncGraph 协同编辑', collaborationUnavailable: '原生 SyncGraph 不可用', collaborationConnecting: '正在连接…',
    syncGraph: (peers) => `SyncGraph · ${peers} 位协作者`, conflicts: (count) => `${count} 个冲突`, collaborationError: '本地协同编辑不可用。当前文档仍保持打开。', engineActive: '已启用',
  },
};

export function gridBottomBarCopy(locale: WorkspaceLocale): GridBottomBarCopy {
  return GRID_BOTTOM_BAR_COPY[locale];
}
