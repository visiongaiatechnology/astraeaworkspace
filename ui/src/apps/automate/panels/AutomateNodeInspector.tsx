// STATUS: DIAMANT VGT SUPREME — typed node inspector driven entirely by `automateConfigSchema`.
//
// Before this component there was no way to change a single node parameter: the canvas printed
// `JSON.stringify(node.config)` and every value was frozen at its palette template constant
// (AST-1701, AST-1706, AST-1716, AST-1731).
//
// The form is generated from the schema, so a field can never exist in the UI without a contract and
// bounds, and a label can never be missing (the interface enumerates every key at compile time).
// Editing is draft-based: a text field only commits on blur or Enter, so a half-typed number is never
// written into the document, and the undo history gets one entry per completed edit instead of one
// per keystroke.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Wrench } from 'lucide-react';
import type { AutomateDocumentModel, JsonValue } from '../model/types';
import {
  AutomateConfigError,
  fieldsForNode,
  readFieldValue,
  validateNodeConfig,
  type AutomateConfigField,
} from '../model/automateConfigSchema';import { renameNode, updateNodeField } from '../model/automateEditingCore';
import { useAutomateCopy } from '../locale/automateLocale';

interface Props {
  model: AutomateDocumentModel;
  onUpdateModel: (updater: (prev: AutomateDocumentModel) => AutomateDocumentModel) => void;
}

/** Visible label for one field: the locale declares every field key as a required string. */
function fieldLabel(field: AutomateConfigField, copy: ReturnType<typeof useAutomateCopy>): string {
  const labels = copy as unknown as Record<string, string>;
  return labels[field.key] ?? field.key;
}

function optionLabel(value: string | number | boolean, field: AutomateConfigField, copy: ReturnType<typeof useAutomateCopy>): string {
  const labels = copy as unknown as Record<string, string>;
  const option = (field.options ?? []).find((candidate) => candidate.value === value);
  if (!option) return String(value);
  return labels[option.labelKey] ?? option.labelKey;
}

/** Visible text for a refusal code. Unknown codes are shown as-is rather than blanked. */
function issueLabel(code: string, copy: ReturnType<typeof useAutomateCopy>): string {
  const labels = copy as unknown as Record<string, string | undefined>;
  const key = `config${code.replace(/^(config|automate)-?/, '').replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`;
  return (labels[key] as string | undefined) ?? code;
}

const FIELD_ID_PREFIX = 'automate-cfg';

export const AutomateNodeInspector: React.FC<Props> = ({ model, onUpdateModel }) => {
  const copy = useAutomateCopy();
  const node = model.nodes.find((candidate) => candidate.id === model.selectedNodeId) ?? null;
  const [draft, setDraft] = useState<{ nodeId: string; fieldKey: string; text: string } | null>(null);
  const [refusal, setRefusal] = useState('');

  const fields = useMemo(() => (node ? fieldsForNode(node) : []), [node]);
  const report = useMemo(() => (node ? validateNodeConfig(node) : { issues: [], missing: [], complete: true }), [node]);
  const issues = report.issues;
  const issueFor = (fieldKey: string) => issues.find((issue) => issue.fieldKey === fieldKey);

  const commit = (field: AutomateConfigField, value: JsonValue) => {
    if (!node) return;
    try {
      // Validated against the current document first, so a refusal is a value, not a thrown render.
      const next = updateNodeField(model, node.id, field, value);
      setRefusal('');
      onUpdateModel(() => next);
    } catch (error) {
      setRefusal(error instanceof AutomateConfigError ? error.code : error instanceof Error ? error.message : 'config-value-invalid');
    }
  };

  const commitMapping = (field: AutomateConfigField, raw: string) => {
    // A mapping is authored as JSON text; it is parsed before it is stored, so an invalid mapping can
    // never reach the document. The refusal is surfaced, not swallowed.
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw === '' ? '[]' : raw) as JsonValue;
    } catch {
      setRefusal('config-mapping-not-a-list');
      return;
    }
    commit(field, parsed);
  };

  const commitTitle = (title: string) => {
    if (!node) return;
    try {
      const next = renameNode(model, node.id, title);
      setRefusal('');
      onUpdateModel(() => next);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : 'node-title-boundary');
    }
  };

  if (!node) {
    return (
      <aside className="automate-inspector w-72 flex flex-col" aria-label={copy.inspector}>
        <div className="automate-inspector-header h-10 px-4 flex items-center gap-1.5 text-xs font-semibold">
          <Wrench className="automate-inspector-icon" aria-hidden="true"/>{copy.inspector}
        </div>
        <p data-automate-inspector-empty="true" className="automate-inspector-empty p-4 text-[0.6875rem]">{copy.inspectorEmpty}</p>
      </aside>
    );
  }

  const titleDraft = draft && draft.nodeId === node.id && draft.fieldKey === '__title' ? draft.text : node.title;

  return (
    <aside className="automate-inspector w-72 flex flex-col overflow-y-auto" aria-label={copy.inspector}>
      <div className="automate-inspector-header h-10 px-4 flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5"><Wrench className="automate-inspector-icon" aria-hidden="true"/>{copy.inspector}</span>
        <span data-automate-inspector-node={node.id} className="automate-inspector-node font-mono text-[0.625rem]">{node.type}</span>
      </div>

      <form className="p-4 space-y-3 text-xs" onSubmit={(event) => event.preventDefault()}>
        <label className="automate-inspector-field block" htmlFor={`${FIELD_ID_PREFIX}-title`}>
          <span className="automate-inspector-label block text-[0.625rem] font-bold uppercase tracking-wider mb-1">{copy.nodeTitleLabel}</span>
          <input
            id={`${FIELD_ID_PREFIX}-title`}
            type="text"
            maxLength={160}
            value={titleDraft}
            data-automate-field="__title"
            onChange={(event) => setDraft({ nodeId: node.id, fieldKey: '__title', text: event.target.value })}
            onBlur={(event) => { commitTitle(event.target.value); setDraft(null); }}
            onKeyDown={(event) => { if (event.key === 'Enter') { commitTitle(event.currentTarget.value); setDraft(null); } }}
            className="automate-inspector-input w-full px-2 py-1"
          />
        </label>

        {fields.map((field) => {
          const value = readFieldValue(node.config as Record<string, JsonValue>, field);
          const id = `${FIELD_ID_PREFIX}-${node.id}-${field.path.join('-')}`;
          const issue = issueFor(field.key);
          const text = draft && draft.nodeId === node.id && draft.fieldKey === field.key ? draft.text : String(value ?? '');
          const describedBy = issue ? `${id}-issue` : undefined;
          const common = { id, 'data-automate-field': field.key, 'aria-describedby': describedBy, className: 'automate-inspector-input w-full px-2 py-1' };

          return (
            <div key={field.key} className="automate-inspector-field">
              <label className="automate-inspector-label block text-[0.625rem] font-bold uppercase tracking-wider mb-1" htmlFor={id}>{fieldLabel(field, copy)}</label>
              {field.kind === 'select' && (
                <select
                  {...common}
                  value={String(value)}
                  onChange={(event) => commit(field, event.target.value)}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>{optionLabel(option.value, field, copy)}</option>
                  ))}
                </select>
              )}
              {field.kind === 'boolean' && (
                <input
                  {...common}
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => commit(field, event.target.checked)}
                />
              )}
              {field.kind === 'number' && (
                <input
                  {...common}
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  step={field.integer ? 1 : 'any'}
                  value={text}
                  onChange={(event) => setDraft({ nodeId: node.id, fieldKey: field.key, text: event.target.value })}
                  onBlur={(event) => { if (event.target.value !== '') commit(field, event.target.value); setDraft(null); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { if (event.currentTarget.value !== '') commit(field, event.currentTarget.value); setDraft(null); } }}
                />
              )}
              {field.kind === 'mapping' && (
                <textarea
                  {...common}
                  rows={3}
                  value={text}
                  data-automate-mapping="true"
                  onChange={(event) => setDraft({ nodeId: node.id, fieldKey: field.key, text: event.target.value })}
                  onBlur={(event) => { commitMapping(field, event.target.value); setDraft(null); }}
                />
              )}
              {field.kind === 'textarea' && (
                <textarea
                  {...common}
                  rows={2}
                  maxLength={field.maxLength}
                  value={text}
                  onChange={(event) => setDraft({ nodeId: node.id, fieldKey: field.key, text: event.target.value })}
                  onBlur={(event) => { commit(field, event.target.value); setDraft(null); }}
                />
              )}
              {field.kind === 'text' && (
                <input
                  {...common}
                  type="text"
                  maxLength={field.maxLength}
                  value={text}
                  onChange={(event) => setDraft({ nodeId: node.id, fieldKey: field.key, text: event.target.value })}
                  onBlur={(event) => { commit(field, event.target.value); setDraft(null); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { commit(field, event.currentTarget.value); setDraft(null); } }}
                />
              )}
              {issue && (
                <span id={`${id}-issue`} data-automate-field-issue={issue.code} role="alert" className="automate-inspector-issue block text-[0.625rem] mt-0.5">
                  <AlertTriangle aria-hidden="true"/> {issueLabel(issue.code, copy)}
                </span>
              )}
            </div>
          );
        })}

        {refusal !== '' && (
          <p data-automate-inspector-refusal={refusal} role="alert" className="automate-inspector-refusal text-[0.625rem]">{issueLabel(refusal, copy)}</p>
        )}

        <p data-automate-inspector-state={report.complete ? 'complete' : 'incomplete'} role="status" className="automate-inspector-state text-[0.625rem] flex items-center gap-1">
          {report.complete
            ? <><Check aria-hidden="true"/>{copy.configOk}</>
            : <><AlertTriangle aria-hidden="true"/>{copy.configIssues(issues.length + report.missing.length)}</>}
        </p>
      </form>
    </aside>
  );
};
