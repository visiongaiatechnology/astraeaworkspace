// STATUS: DIAMANT VGT SUPREME — Typed, searchable, accessible palette for the visual workflow editor.
import React, { useId, useMemo, useState } from 'react';
import { Bug, GitBranch, Plus, PlayCircle, Search, Shield, Zap } from 'lucide-react';
import type { AutomateDocumentModel, AutomateNodeType, JsonValue } from '../model/types';
import { buildNodeFromTemplate, filterAutomateBlocks, MAX_PALETTE_QUERY } from '../model/automateEditingCore';
import { useAutomateCopy } from '../locale/automateLocale';

interface Props {
  onUpdateModel: (updater: (prev: AutomateDocumentModel) => AutomateDocumentModel) => void;
}

interface Template {
  type: AutomateNodeType;
  title: string;
  category: string;
  config: Record<string, JsonValue>;
}

/**
 * Blocks offered by the palette. Exported so contract tests can drive the real set, not a copy.
 *
 * **Zwei Vorlagen teilen sich einen `type`** (`Scheduled Trigger` und `Workspace Event` sind beide
 * `trigger`). Der Render unten schluesselt deshalb nach `type` UND `title` — nach dem `type` allein
 * meldete React „Encountered two children with the same key", und doppelte Schluessel koennen Kinder
 * verdoppeln oder weglassen. Der Zeuge steht in
 * `testing/unit/palette/automatePaletteUniqueKeys.test.tsx`; er war vor dieser Zeile rot.
 */
export const AUTOMATE_BLOCK_TEMPLATES: readonly Template[] = [
  // Trigger configs must satisfy the canonical trigger contract (`triggerFromNodeConfig`), otherwise the
  // block would be admitted here and refused later — the exact "accepted, then reported as checked" hole.
  { type: 'trigger', title: 'Scheduled Trigger', category: 'Trigger', config: { triggerKind: 'schedule', timezone: 'UTC', every: { unit: 'minute', interval: 15 }, startAt: 0, missedRun: 'skip', concurrency: 1 } },
  { type: 'trigger', title: 'Workspace Event', category: 'Trigger', config: { triggerKind: 'workspace-event', event: 'document.saved' } },
  { type: 'condition', title: 'Condition', category: 'Control', config: { expression: { op: 'literal', value: true } } },
  { type: 'switch', title: 'Switch', category: 'Control', config: { cases: [] } },
  { type: 'loop', title: 'Bounded Foreach', category: 'Control', config: { maxIterations: 100 } },
  { type: 'parallel', title: 'Parallel Branches', category: 'Control', config: { maxConcurrency: 4 } },
  { type: 'approval', title: 'Human Approval', category: 'Control', config: { expiresMinutes: 60 } },
  { type: 'action', title: 'Workspace Action', category: 'Action', config: { actionKind: 'workspace', operation: 'task.create' } },
  { type: 'subflow', title: 'Typed Child Flow', category: 'Reuse', config: { childFlowId: 'flow-child' } },
  { type: 'error', title: 'Error Path', category: 'Reliability', config: { mode: 'catch' } },
  { type: 'finally', title: 'Finally Path', category: 'Reliability', config: { mode: 'always' } },
];
const templates = AUTOMATE_BLOCK_TEMPLATES;

function nodeIcon(type: AutomateNodeType): React.ReactNode {
  if (type === 'trigger') return <PlayCircle className="automate-node-icon automate-node-icon--trigger" aria-hidden="true"/>;
  if (type === 'condition' || type === 'switch') return <GitBranch className="automate-node-icon automate-node-icon--control" aria-hidden="true"/>;
  if (type === 'action') return <Zap className="automate-node-icon automate-node-icon--action" aria-hidden="true"/>;
  if (type === 'error' || type === 'finally') return <Bug className="automate-node-icon automate-node-icon--warning" aria-hidden="true"/>;
  return <Shield className="automate-node-icon automate-node-icon--approval" aria-hidden="true"/>;
}

/** Monotonic per-instance seed so two adds in one render window can never collide on a node id. */
let paletteSeed = 0;

export const AutomatePalette: React.FC<Props> = ({ onUpdateModel }) => {
  const copy = useAutomateCopy();
  const [query, setQuery] = useState('');
  const searchId = useId();

  // Search matches localized labels, so a German user can find "Zeitplan-Auslöser" by typing "zeitplan".
  const visibleTemplates = useMemo(
    () => filterAutomateBlocks(templates, query, (template) => ({
      title: copy.templateTitle(template.title),
      category: copy.templateCategory(template.category),
    })),
    [query, copy],
  );

  const add = (template: Template) => {
    paletteSeed += 1;
    onUpdateModel((previous) => {
      // The id is derived from the accumulating document, not from the rendered snapshot.
      const node = buildNodeFromTemplate(previous, template, `${Date.now().toString(36)}-${paletteSeed}`);
      return { ...previous, nodes: [...previous.nodes, node], selectedNodeId: node.id };
    });
  };

  return (
    <aside className="automate-palette w-64 flex flex-col" aria-label={copy.palette}>
      <div className="automate-palette-title p-3 text-xs font-semibold">{copy.palette}</div>
      <div className="px-3 pb-1">
        <label className="automate-palette-search-label flex items-center gap-1.5" htmlFor={searchId}>
          <Search className="automate-palette-search-icon" aria-hidden="true"/>
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          maxLength={MAX_PALETTE_QUERY}
          placeholder={copy.paletteSearch}
          aria-label={copy.paletteSearch}
          onChange={(event) => setQuery(event.target.value)}
          data-automate-palette-search="true"
          className="automate-palette-search w-full mt-1 px-2 py-1.5 text-xs"
        />
      </div>
      <div className="p-3 pt-2 space-y-2 overflow-y-auto">
        <span className="automate-palette-caption text-[0.625rem] font-bold uppercase tracking-wider block">{copy.availableBlocks}</span>
        {visibleTemplates.map((template) => (
          <button key={`${template.type}:${template.title}`} onClick={() => add(template)} data-vgt-app-guide-anchor={template.title === 'Workspace Event' ? 'Automate:first' : undefined} className="automate-palette-item w-full p-2.5 text-left flex items-center justify-between group">
            <span className="flex items-center gap-2">
              {nodeIcon(template.type)}
              <span>
                <span className="automate-palette-item-name block text-xs font-medium">{copy.templateTitle(template.title)}</span>
                <span className="automate-palette-item-category block text-[0.625rem]">{copy.templateCategory(template.category)}</span>
              </span>
            </span>
            <Plus className="automate-palette-add-icon" aria-hidden="true"/>
          </button>
        ))}
        {visibleTemplates.length === 0 && (
          <p data-automate-palette-empty="true" role="status" className="automate-palette-empty text-[0.6875rem]">{copy.noPaletteMatches}</p>
        )}
      </div>
    </aside>
  );
};
