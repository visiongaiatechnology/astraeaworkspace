// STATUS: DIAMANT VGT SUPREME
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredVaultData } from '../../../contracts/vaultSpaces';
import { createVaultUndoHistory, recordVaultUndoPoint, redoVaultData, undoVaultData } from '../vaultUndoEngine';

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return element.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
};

export function useVaultUndoHistory(current: StoredVaultData, apply: (next: StoredVaultData) => void, disabled: boolean) {
  const historyRef = useRef(createVaultUndoHistory());
  const currentRef = useRef(current);
  const applyRef = useRef(apply);
  const [, setRevision] = useState(0);
  currentRef.current = current;
  applyRef.current = apply;

  const touch = () => setRevision((value) => value + 1);
  const record = useCallback((snapshot: StoredVaultData = currentRef.current) => {
    historyRef.current = recordVaultUndoPoint(historyRef.current, snapshot);
    touch();
  }, []);
  const undo = useCallback(() => {
    if (disabled) throw new Error('vault_undo_disabled');
    const step = undoVaultData(historyRef.current, currentRef.current);
    historyRef.current = step.history;
    applyRef.current(step.data);
    touch();
  }, [disabled]);
  const redo = useCallback(() => {
    if (disabled) throw new Error('vault_redo_disabled');
    const step = redoVaultData(historyRef.current, currentRef.current);
    historyRef.current = step.history;
    applyRef.current(step.data);
    touch();
  }, [disabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || isTextEditingTarget(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && historyRef.current.past.length) { event.preventDefault(); undo(); }
      else if ((key === 'y' || (key === 'z' && event.shiftKey)) && historyRef.current.future.length) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, redo, undo]);

  return { record, undo, redo, canUndo: !disabled && historyRef.current.past.length > 0, canRedo: !disabled && historyRef.current.future.length > 0 };
}
