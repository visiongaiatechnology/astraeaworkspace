// STATUS: PLATIN — Austauschbereich: Dokument hinaus, Dokument hinein, Versionen, Auditnachweis.
//
// Verdrahtet ausschließlich die vorhandenen, bis dahin toten Module `adminInterchangeCore`,
// `adminEncryptedStore` und die Versionsfunktionen aus `adminLifecycleCore`. Der Import hat bewusst
// **zwei** Stufen (prüfen, dann anwenden): ein Richtliniendokument ist feindliche Eingabe, und ein
// Import, der sofort wirkt, kann die eigene Berechtigungslage überschreiben, bevor der Nutzer sie sieht.
import React, { useId, useState } from 'react';
import {
  PolicyInterchangeError,
  applyPolicyPackage,
  decodeContainerBase64,
  decodeRootPublicKey,
  diffPolicyVersions,
  encodeContainerBase64,
  exportPolicyAudit,
  exportPolicyDocument,
  localOnlyFieldNames,
  openEncryptedPolicyDocument,
  packageFieldNames,
  previewPolicyPackage,
  rollbackToPolicyVersion,
  saveEncryptedPolicyDocument,
  snapshotPolicyVersion,
  verifySignedPolicyManifest,
  type PolicyPackagePreview,
} from '../interchange/adminPolicyInterchange';
import type { SignedOrganizationPolicyManifest } from '../security/adminPolicySignatureCore';
import { useGovernanceAction } from './adminGovernanceStatus';
import type { AdminGovernancePanelProps } from './adminGovernancePanelTypes';

export const AdminPolicyInterchangePanel: React.FC<AdminGovernancePanelProps> = ({ model, copy, actorId, onApply }) => {
  const idPrefix = useId();
  const exportAction = useGovernanceAction(copy.exported);
  const importAction = useGovernanceAction(copy.imported);
  const storeAction = useGovernanceAction(copy.storeSaved);
  const versionAction = useGovernanceAction(copy.versionCreated);
  const auditAction = useGovernanceAction(copy.exported);

  const [exportName, setExportName] = useState('');
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<PolicyPackagePreview | null>(null);
  const [password, setPassword] = useState('');
  const [containerText, setContainerText] = useState('');
  const [storeState, setStoreState] = useState('');
  const [fromId, setFromId] = useState(model.lifecycle.versions[0]?.id ?? '');
  const [toId, setToId] = useState(model.lifecycle.versions.at(-1)?.id ?? '');
  const [diffLine, setDiffLine] = useState('');
  const [auditText, setAuditText] = useState('');
  const [manifestText, setManifestText] = useState('');
  const [rootKey, setRootKey] = useState('');
  const [manifestState, setManifestState] = useState('');

  const field = (suffix: string) => `${idPrefix}-${suffix}`;
  const versions = model.lifecycle.versions;

  return (
    <div className="adminPolicy__contentStack" data-admin-interchange="true">
      <section className="adminPolicy__subpanel" aria-labelledby={field('export-heading')}>
        <p className="adminPolicy__eyebrow">{copy.exportDocument}</p>
        <h3 id={field('export-heading')} className="adminPolicy__subheading">{copy.exportPortable}</h3>
        <p className="adminPolicy__bodyCopy">{packageFieldNames().join(', ')}</p>
        <div className="adminPolicy__sectionHeadingRow">
          <button type="button" className="adminPolicy__button" onClick={() => void exportAction.run(() => {
            const exported = exportPolicyDocument(model, 'portable-json');
            setExportName(exported.fileName);
            setExportText(exported.text ?? '');
          })}>
            {copy.exportPortable}
          </button>
          <button type="button" className="adminPolicy__button" onClick={() => void exportAction.run(() => {
            const exported = exportPolicyDocument(model, 'summary-csv');
            setExportName(exported.fileName);
            setExportText(exported.text ?? '');
          })}>
            {copy.exportSummary}
          </button>
        </div>
        {exportAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={exportAction.status.code} data-file={exportName}>
            {exportAction.status.ok ? `${copy.exported}: ${exportName}` : copy.reason(exportAction.status.code)}
          </p>
        )}
        <label htmlFor={field('export-text')} className="adminPolicy__bodyCopy">{copy.exportDocument}
          <textarea id={field('export-text')} className="adminPolicy__input" rows={6} readOnly value={exportText} aria-readonly="true" />
        </label>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('import-heading')}>
        <h3 id={field('import-heading')} className="adminPolicy__subheading">{copy.importDocument}</h3>
        <label htmlFor={field('import-text')} className="adminPolicy__bodyCopy">{copy.importDocument}
          <textarea id={field('import-text')} className="adminPolicy__input" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} />
        </label>
        <div className="adminPolicy__sectionHeadingRow">
          <button type="button" className="adminPolicy__button" onClick={() => void importAction.run(() => {
            setPreview(previewPolicyPackage(new TextEncoder().encode(importText)));
          })}>
            {copy.importPreview}
          </button>
          <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" disabled={!preview} onClick={() => void importAction.run(() => {
            if (!preview) throw new PolicyInterchangeError('admin-portable-schema');
            onApply(applyPolicyPackage(model, preview.package));
            setPreview(null);
          })}>
            {copy.importApply}
          </button>
        </div>
        <p className="adminPolicy__bodyCopy">{copy.retainedLocally}: {localOnlyFieldNames().join(', ')}</p>
        {preview && <p className="adminPolicy__note" data-admin-import-preview="true">{preview.package.roles.length} · {preview.package.dlp.rules.length} · {preview.package.retention.rules.length}</p>}
        {importAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={importAction.status.code}>
            {importAction.status.ok ? copy.imported : copy.reason(importAction.status.code)}
          </p>
        )}
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('store-heading')}>
        <h3 id={field('store-heading')} className="adminPolicy__subheading">{copy.store}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('store-password')} className="adminPolicy__bodyCopy">{copy.password}
            <input id={field('store-password')} className="adminPolicy__input" type="password" value={password} maxLength={128} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
          </label>
        </div>
        <div className="adminPolicy__sectionHeadingRow">
          <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void storeAction.run(async () => {
            const bytes = await saveEncryptedPolicyDocument(model, password);
            setContainerText(encodeContainerBase64(bytes));
            setStoreState(`VGT3:${bytes.byteLength}`);
          })}>
            {copy.save}
          </button>
          <button type="button" className="adminPolicy__button" onClick={() => void storeAction.run(async () => {
            const bytes = decodeContainerBase64(containerText);
            const opened = await openEncryptedPolicyDocument(bytes, password);
            setStoreState(`opened:${opened.roles.length}:${opened.dlp.rules.length}`);
            onApply(opened);
          })}>
            {copy.open}
          </button>
        </div>
        <label htmlFor={field('store-container')} className="adminPolicy__bodyCopy">{copy.store}
          <textarea id={field('store-container')} className="adminPolicy__input" rows={4} value={containerText} onChange={(event) => setContainerText(event.target.value)} />
        </label>
        {storeAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={storeAction.status.code} data-store-state={storeState}>
            {storeAction.status.ok ? copy.storeSaved : copy.reason(storeAction.status.code)}
          </p>
        )}
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('versions-heading')}>
        <h3 id={field('versions-heading')} className="adminPolicy__subheading">{copy.versions}</h3>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void versionAction.run(() => {
          onApply(snapshotPolicyVersion(model, actorId));
        })}>
          {copy.snapshot}
        </button>
        {versions.length === 0
          ? <p className="adminPolicy__emptyState">{copy.noVersions}</p>
          : (
            <ul className="adminPolicy__catalogList">
              {versions.map((version) => (
                <li key={version.id} data-version-id={version.id}>
                  <span>{version.id}</span>
                  <span>{version.sequence}</span>
                  <span>{version.status}</span>
                  <button type="button" className="adminPolicy__button" onClick={() => void versionAction.run(() => {
                    onApply(rollbackToPolicyVersion(model, version.id, actorId));
                  })}>
                    {copy.rollback}
                  </button>
                </li>
              ))}
            </ul>
          )}
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('diff-from')} className="adminPolicy__bodyCopy">{copy.versions}
            <select id={field('diff-from')} className="adminPolicy__select" value={fromId} onChange={(event) => setFromId(event.target.value)}>
              {versions.map((version) => <option key={version.id} value={version.id}>{version.id}</option>)}
            </select>
          </label>
          <label htmlFor={field('diff-to')} className="adminPolicy__bodyCopy">{copy.versions}
            <select id={field('diff-to')} className="adminPolicy__select" value={toId} onChange={(event) => setToId(event.target.value)}>
              {versions.map((version) => <option key={version.id} value={version.id}>{version.id}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="adminPolicy__button" disabled={!fromId || !toId} onClick={() => void versionAction.run(() => {
          const diff = diffPolicyVersions(model, fromId, toId);
          setDiffLine(diff.changes.map((change) => change.path).slice(0, 8).join(', ') || copy.conflictsNone);
        })}>
          {copy.difference}
        </button>
        <p className="adminPolicy__note" data-admin-diff={diffLine.length > 0 ? 'present' : 'absent'}>{diffLine}</p>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('manifest-heading')}>
        <h3 id={field('manifest-heading')} className="adminPolicy__subheading">{copy.signedManifest}</h3>
        <p className="adminPolicy__bodyCopy">{copy.signedManifestHint}</p>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('manifest-root')} className="adminPolicy__bodyCopy">{copy.rootPublicKey}
            <input id={field('manifest-root')} className="adminPolicy__input" value={rootKey} maxLength={512} onChange={(event) => setRootKey(event.target.value)} />
          </label>
        </div>
        <label htmlFor={field('manifest-text')} className="adminPolicy__bodyCopy">{copy.signedManifest}
          <textarea id={field('manifest-text')} className="adminPolicy__input" rows={5} value={manifestText} onChange={(event) => setManifestText(event.target.value)} />
        </label>
        {/*
          Fail-closed in zwei Stufen: eine abgelehnte Signatur **und** eine akzeptierte, aber unbrauchbare
          Nutzlast ergeben beide die strengste Richtlinie — nicht den bisherigen Zustand.
        */}
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void storeAction.run(async () => {
          const manifest = JSON.parse(manifestText) as SignedOrganizationPolicyManifest<unknown>;
          const outcome = await verifySignedPolicyManifest(model, manifest, decodeRootPublicKey(rootKey));
          setManifestState(`${outcome.reason}:${outcome.model.dlp.defaultAction}`);
          onApply(outcome.model);
        })}>
          {copy.verify}
        </button>
        {storeAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={storeAction.status.code}>
            {storeAction.status.ok ? copy.applied : copy.reason(storeAction.status.code)}
          </p>
        )}
        <p className="adminPolicy__note" data-admin-manifest={manifestState.length > 0 ? manifestState : 'absent'}>{manifestState}</p>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('audit-heading')}>
        <h3 id={field('audit-heading')} className="adminPolicy__subheading">{copy.auditExport}</h3>
        <button type="button" className="adminPolicy__button" onClick={() => void auditAction.run(() => {
          const exported = exportPolicyAudit(model);
          setAuditText(exported.ndjson);
        })}>
          {copy.auditExportRun}
        </button>
        {auditAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={auditAction.status.code}>
            {auditAction.status.ok ? `${copy.exported} (${model.audit.events.length})` : copy.reason(auditAction.status.code)}
          </p>
        )}
        <pre aria-label={copy.auditExport} className="adminPolicy__policySource">{auditText}</pre>
      </section>
    </div>
  );
};
