// STATUS: DIAMANT VGT SUPREME — runtime unlock state and inactivity auto-lock for Notes
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NoteNotebook, NotePage, NoteProtectionPolicy, NoteSection } from '../../../shared/contracts/workspace';
import { createAdditionalUnlockPolicy, pageRequiresUnlock, projectUnlockedNotebooks, protectionKey, verifyAdditionalUnlock } from './notesSecurity';

type ReplaceNotebook = (notebookId: string, update: (notebook: NoteNotebook) => NoteNotebook) => void;

export function useNotesSecurity(notebooks: NoteNotebook[], replaceNotebook: ReplaceNotebook) {
  const [unlocked, setUnlocked] = useState<Set<string>>(() => new Set());
  const [lastActivity, setLastActivity] = useState(Date.now());
  const searchableNotebooks = useMemo(() => projectUnlockedNotebooks(notebooks, unlocked), [notebooks, unlocked]);

  useEffect(() => {
    const activity = () => setLastActivity(Date.now());
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    return () => { window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setUnlocked((current) => {
        let changed = false;
        const next = new Set(current);
        const protectedEntities: Array<{ key: string; policy?: NoteProtectionPolicy }> = [];
        for (const notebook of notebooks) {
          protectedEntities.push({ key: protectionKey('notebook', notebook.id), policy: notebook.protection });
          for (const section of notebook.sections) {
            protectedEntities.push({ key: protectionKey('section', section.id), policy: section.protection });
            for (const page of section.pages) protectedEntities.push({ key: protectionKey('page', page.id), policy: page.protection });
          }
        }
        for (const entity of protectedEntities) {
          const minutes = entity.policy?.mode === 'additional-unlock' ? (entity.policy.autoLockMinutes ?? 10) : 0;
          if (minutes > 0 && next.has(entity.key) && now - lastActivity >= minutes * 60_000) { next.delete(entity.key); changed = true; }
        }
        return changed ? next : current;
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [notebooks, lastActivity]);

  const isPageLocked = useCallback((notebook: NoteNotebook | null, section: NoteSection | null, page: NotePage | null) => {
    if (!notebook || !section || !page) return false;
    return pageRequiresUnlock(notebook, section, page, unlocked);
  }, [unlocked]);

  const unlock = useCallback(async (kind: 'notebook' | 'section' | 'page', id: string, policy: NoteProtectionPolicy | undefined, secret: string) => {
    const valid = await verifyAdditionalUnlock(policy, secret);
    if (valid) setUnlocked((current) => new Set(current).add(protectionKey(kind, id)));
    return valid;
  }, []);
  const lockAll = useCallback(() => setUnlocked(new Set()), []);

  const setPolicy = useCallback(async (notebookId: string, kind: 'notebook' | 'section' | 'page', entityId: string, mode: 'none' | 'workspace' | 'additional-unlock', secret = '', autoLockMinutes = 10) => {
    const policy: NoteProtectionPolicy = mode === 'additional-unlock' ? await createAdditionalUnlockPolicy(secret, autoLockMinutes) : { mode };
    replaceNotebook(notebookId, (notebook) => {
      if (kind === 'notebook' && notebook.id === entityId) return { ...notebook, protection: policy, updatedAt: Date.now() };
      return { ...notebook, updatedAt: Date.now(), sections: notebook.sections.map((section) => {
        if (kind === 'section' && section.id === entityId) return { ...section, protection: policy, updatedAt: Date.now() };
        if (kind === 'page') return { ...section, pages: section.pages.map((page) => page.id === entityId ? { ...page, protection: policy, last_modified: Date.now() } : page) };
        return section;
      }) };
    });
    setUnlocked((current) => { const next = new Set(current); if (mode === 'additional-unlock') next.add(protectionKey(kind, entityId)); else next.delete(protectionKey(kind, entityId)); return next; });
  }, [replaceNotebook]);

  const toggleSensitive = useCallback((notebookId: string, pageId: string, enabled: boolean) => {
    replaceNotebook(notebookId, (notebook) => ({ ...notebook, updatedAt: Date.now(), sections: notebook.sections.map((section) => ({ ...section, pages: section.pages.map((page) => page.id === pageId ? { ...page, sensitiveMode: enabled, last_modified: Date.now() } : page) })) }));
  }, [replaceNotebook]);

  return { searchableNotebooks, isPageLocked, unlock, lockAll, setPolicy, toggleSensitive };
}
