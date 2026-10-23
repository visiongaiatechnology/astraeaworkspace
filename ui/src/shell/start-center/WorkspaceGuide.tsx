// STATUS: PLATIN — translated, keyboard-operable Workspace onboarding guide.
import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Compass, FolderSearch, LayoutTemplate, RefreshCw } from 'lucide-react';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export type WorkspaceGuideAction = 'create-writer' | 'show-recent' | 'open-explorer' | 'show-templates' | 'show-recovery';

interface GuideStep {
  title: string;
  description: string;
  actionLabel: string;
  action: WorkspaceGuideAction;
}

interface GuideCopy {
  open: string;
  title: string;
  description: string;
  step: string;
  previous: string;
  next: string;
  finish: string;
  close: string;
  steps: readonly GuideStep[];
}

const GUIDE_COPY: Record<WorkspaceLocale, GuideCopy> = {
  'de-DE': {
    open: 'Workspace-Rundgang',
    title: 'Workspace kennenlernen',
    description: 'Ein kurzer Rundgang durch die wichtigsten Wege. Du bestimmst das Tempo; nichts wird automatisch geöffnet oder geändert.',
    step: 'Schritt', previous: 'Zurück', next: 'Weiter', finish: 'Rundgang beenden', close: 'Rundgang schließen',
    steps: [
      { title: 'Mit einem Dokument starten', description: 'Erstelle ein Writer-Dokument. Änderungen werden lokal gespeichert; der Status in der Fußleiste zeigt den Speicherzustand.', actionLabel: 'Writer öffnen', action: 'create-writer' },
      { title: 'Zuletzt verwendete Inhalte finden', description: 'Die Recent-Ansicht zeigt Workspace-Dokumente und ihren lokalen Verfügbarkeitsstatus.', actionLabel: 'Zuletzt anzeigen', action: 'show-recent' },
      { title: 'Bibliothek und Explorer öffnen', description: 'Im Explorer kannst du gespeicherte Workspace-Objekte durchsuchen und organisieren.', actionLabel: 'Explorer öffnen', action: 'open-explorer' },
      { title: 'Mit einer Vorlage beginnen', description: 'Vorlagen öffnen ein bearbeitbares Dokument mit vorbereiteten Inhalten und Struktur.', actionLabel: 'Vorlagen anzeigen', action: 'show-templates' },
      { title: 'Recovery und Diagnose prüfen', description: 'Die Plattformansicht enthält Recovery-Snapshots, lokale Dateien und Diagnosefunktionen.', actionLabel: 'Recovery anzeigen', action: 'show-recovery' },
    ],
  },
  'en-US': {
    open: 'Workspace guide',
    title: 'Get to know Workspace',
    description: 'A short tour of the main paths. Move at your own pace; nothing opens or changes automatically.',
    step: 'Step', previous: 'Back', next: 'Next', finish: 'Finish tour', close: 'Close tour',
    steps: [
      { title: 'Start with a document', description: 'Create a Writer document. Changes are saved locally; the status bar shows the save state.', actionLabel: 'Open Writer', action: 'create-writer' },
      { title: 'Find recent work', description: 'The Recent view lists Workspace documents and their local availability status.', actionLabel: 'Show Recent', action: 'show-recent' },
      { title: 'Open the library and Explorer', description: 'Use Explorer to browse and organize saved Workspace items.', actionLabel: 'Open Explorer', action: 'open-explorer' },
      { title: 'Start from a template', description: 'Templates create an editable document with prepared content and structure.', actionLabel: 'Browse templates', action: 'show-templates' },
      { title: 'Check recovery and diagnostics', description: 'The platform view contains recovery snapshots, local files, and diagnostics.', actionLabel: 'Show Recovery', action: 'show-recovery' },
    ],
  },
  'es-ES': {
    open: 'Guía de Workspace',
    title: 'Conoce Workspace',
    description: 'Un recorrido breve por las funciones principales. Avanza a tu ritmo; nada se abrirá ni cambiará automáticamente.',
    step: 'Paso', previous: 'Anterior', next: 'Siguiente', finish: 'Terminar recorrido', close: 'Cerrar recorrido',
    steps: [
      { title: 'Empieza con un documento', description: 'Crea un documento de Writer. Los cambios se guardan localmente y la barra de estado muestra el estado del guardado.', actionLabel: 'Abrir Writer', action: 'create-writer' },
      { title: 'Encuentra el trabajo reciente', description: 'La vista Recientes muestra documentos de Workspace y su disponibilidad local.', actionLabel: 'Ver recientes', action: 'show-recent' },
      { title: 'Abre la biblioteca y Explorer', description: 'Usa Explorer para buscar y organizar elementos guardados de Workspace.', actionLabel: 'Abrir Explorer', action: 'open-explorer' },
      { title: 'Empieza con una plantilla', description: 'Las plantillas crean documentos editables con contenido y estructura preparados.', actionLabel: 'Ver plantillas', action: 'show-templates' },
      { title: 'Consulta la recuperación y el diagnóstico', description: 'La vista de plataforma incluye instantáneas de recuperación, archivos locales y diagnóstico.', actionLabel: 'Ver recuperación', action: 'show-recovery' },
    ],
  },
  'it-IT': {
    open: 'Guida di Workspace',
    title: 'Scopri Workspace',
    description: 'Un breve percorso tra le funzioni principali. Procedi con calma: nulla si apre o cambia automaticamente.',
    step: 'Passaggio', previous: 'Indietro', next: 'Avanti', finish: 'Termina il percorso', close: 'Chiudi il percorso',
    steps: [
      { title: 'Inizia con un documento', description: 'Crea un documento Writer. Le modifiche vengono salvate in locale e la barra di stato mostra il salvataggio.', actionLabel: 'Apri Writer', action: 'create-writer' },
      { title: 'Trova il lavoro recente', description: 'La vista Recenti elenca i documenti Workspace e la loro disponibilità locale.', actionLabel: 'Mostra recenti', action: 'show-recent' },
      { title: 'Apri la libreria e Explorer', description: 'Usa Explorer per sfogliare e organizzare gli elementi Workspace salvati.', actionLabel: 'Apri Explorer', action: 'open-explorer' },
      { title: 'Parti da un modello', description: 'I modelli creano documenti modificabili con contenuti e struttura già pronti.', actionLabel: 'Mostra modelli', action: 'show-templates' },
      { title: 'Controlla ripristino e diagnostica', description: 'La vista piattaforma include snapshot di ripristino, file locali e diagnostica.', actionLabel: 'Mostra ripristino', action: 'show-recovery' },
    ],
  },
  'ja-JP': {
    open: 'Workspace ガイド',
    title: 'Workspace を使ってみる',
    description: '主な機能を短く紹介します。自分のペースで進められ、自動で開いたり変更したりすることはありません。',
    step: 'ステップ', previous: '戻る', next: '次へ', finish: 'ガイドを終了', close: 'ガイドを閉じる',
    steps: [
      { title: 'ドキュメントを作成する', description: 'Writer ドキュメントを作成します。変更はローカルに保存され、フッターに保存状態が表示されます。', actionLabel: 'Writer を開く', action: 'create-writer' },
      { title: '最近の作業を探す', description: '最近の表示では Workspace ドキュメントとローカルでの利用状態を確認できます。', actionLabel: '最近を表示', action: 'show-recent' },
      { title: 'ライブラリと Explorer を開く', description: 'Explorer で保存済み Workspace 項目を検索、整理できます。', actionLabel: 'Explorer を開く', action: 'open-explorer' },
      { title: 'テンプレートから始める', description: 'テンプレートを使うと、内容と構成が用意された編集可能なドキュメントを作成できます。', actionLabel: 'テンプレートを表示', action: 'show-templates' },
      { title: '復旧と診断を確認する', description: 'プラットフォーム表示には復旧スナップショット、ローカルファイル、診断機能があります。', actionLabel: '復旧を表示', action: 'show-recovery' },
    ],
  },
  'ru-RU': {
    open: 'Обзор Workspace',
    title: 'Знакомство с Workspace',
    description: 'Краткий обзор основных разделов. Вы задаёте темп; ничего не открывается и не изменяется автоматически.',
    step: 'Шаг', previous: 'Назад', next: 'Далее', finish: 'Завершить обзор', close: 'Закрыть обзор',
    steps: [
      { title: 'Создайте документ', description: 'Создайте документ Writer. Изменения сохраняются локально, а строка состояния показывает результат.', actionLabel: 'Открыть Writer', action: 'create-writer' },
      { title: 'Найдите недавнюю работу', description: 'В разделе «Недавние» перечислены документы Workspace и их локальная доступность.', actionLabel: 'Показать недавние', action: 'show-recent' },
      { title: 'Откройте библиотеку и Explorer', description: 'В Explorer можно искать и упорядочивать сохранённые объекты Workspace.', actionLabel: 'Открыть Explorer', action: 'open-explorer' },
      { title: 'Начните с шаблона', description: 'Шаблоны создают редактируемые документы с подготовленным содержимым и структурой.', actionLabel: 'Показать шаблоны', action: 'show-templates' },
      { title: 'Проверьте восстановление и диагностику', description: 'В разделе платформы доступны снимки восстановления, локальные файлы и диагностика.', actionLabel: 'Показать восстановление', action: 'show-recovery' },
    ],
  },
  'zh-CN': {
    open: 'Workspace 导览',
    title: '了解 Workspace',
    description: '快速浏览主要功能。你可以按自己的节奏操作；系统不会自动打开或更改内容。',
    step: '步骤', previous: '上一步', next: '下一步', finish: '完成导览', close: '关闭导览',
    steps: [
      { title: '从文档开始', description: '创建 Writer 文档。更改会保存在本地，底部状态栏会显示保存状态。', actionLabel: '打开 Writer', action: 'create-writer' },
      { title: '查找最近的工作', description: '“最近”视图会列出 Workspace 文档及其本地可用状态。', actionLabel: '查看最近项目', action: 'show-recent' },
      { title: '打开资料库和 Explorer', description: '使用 Explorer 浏览和整理已保存的 Workspace 项目。', actionLabel: '打开 Explorer', action: 'open-explorer' },
      { title: '从模板开始', description: '模板会创建包含预置内容和结构的可编辑文档。', actionLabel: '浏览模板', action: 'show-templates' },
      { title: '检查恢复和诊断', description: '平台视图包含恢复快照、本地文件和诊断功能。', actionLabel: '查看恢复', action: 'show-recovery' },
    ],
  },
};

interface WorkspaceGuideProps {
  locale: WorkspaceLocale;
  stepIndex: number;
  onStepChange: (step: number) => void;
  onRunAction: (action: WorkspaceGuideAction) => void;
  onClose: () => void;
}

const ACTION_ICON: Record<WorkspaceGuideAction, React.ReactNode> = {
  'create-writer': <BookOpen aria-hidden="true" className="h-4 w-4" />,
  'show-recent': <Compass aria-hidden="true" className="h-4 w-4" />,
  'open-explorer': <FolderSearch aria-hidden="true" className="h-4 w-4" />,
  'show-templates': <LayoutTemplate aria-hidden="true" className="h-4 w-4" />,
  'show-recovery': <RefreshCw aria-hidden="true" className="h-4 w-4" />,
};

export function workspaceGuideButtonLabel(locale: WorkspaceLocale, isOpen: boolean): string {
  return isOpen ? GUIDE_COPY[locale].close : GUIDE_COPY[locale].open;
}

export const WorkspaceGuide: React.FC<WorkspaceGuideProps> = ({ locale, stepIndex, onStepChange, onRunAction, onClose }) => {
  const copy = GUIDE_COPY[locale];
  const step = copy.steps[stepIndex] ?? copy.steps[0];
  const isLastStep = stepIndex === copy.steps.length - 1;

  return (
    <section aria-labelledby="workspace-guide-title" className="overflow-hidden border-y border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--vgt-metal-edge)] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-control-surface)] text-[var(--vgt-accent-strong)]">
            <Compass aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id="workspace-guide-title" className="text-base font-semibold text-[var(--vgt-text-primary)]">{copy.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--vgt-text-secondary)]">{copy.description}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="vgt-button-secondary rounded-md px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]">
          {copy.close}
        </button>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div aria-live="polite" aria-atomic="true" className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--vgt-text-muted)]">
            {copy.step} {stepIndex + 1} / {copy.steps.length}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--vgt-text-primary)]">{step.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--vgt-text-secondary)]">{step.description}</p>
          <div className="mt-4 flex gap-1.5" aria-label={`${copy.step} ${stepIndex + 1} / ${copy.steps.length}`}>
            {copy.steps.map((item, index) => (
              <span key={item.action} aria-current={index === stepIndex ? 'step' : undefined} className={`h-1.5 flex-1 max-w-12 rounded-sm ${index <= stepIndex ? 'bg-[var(--vgt-accent-strong)]' : 'bg-[var(--vgt-control-hover)]'}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button type="button" onClick={() => onStepChange(Math.max(0, stepIndex - 1))} disabled={stepIndex === 0} className="vgt-button-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />{copy.previous}
          </button>
          {isLastStep ? (
            <button type="button" onClick={onClose} className="vgt-button-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]">
              <Check aria-hidden="true" className="h-3.5 w-3.5" />{copy.finish}
            </button>
          ) : (
            <button type="button" onClick={() => onStepChange(Math.min(copy.steps.length - 1, stepIndex + 1))} className="vgt-button-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]">
              {copy.next}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" data-guide-action={step.action} onClick={() => onRunAction(step.action)} className="vgt-button-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]">
            {ACTION_ICON[step.action]}{step.actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
};
