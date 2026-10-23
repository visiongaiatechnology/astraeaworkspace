// STATUS: DIAMANT VGT SUPREME — Writer Content-Control State Orchestration
import { useCallback, useMemo, useState } from 'react';
import type { Paragraph, WriterContentControl } from '../../../shared/contracts/workspace';
import type { ImageBlockData, WriterDocumentData } from '../types';
import type { WriterHistoryCoalesceRequest } from '../editor/history/writerHistory';
import {
  addWriterRepeatingItem,
  normalizeWriterContentControls,
  removeWriterRepeatingItem,
  updateWriterContentControlValue,
  updateWriterRepeatingItem,
  WriterContentControlError,
} from './content-controls/writerContentControls';

interface UseWriterContentControlStateOptions {
  rawControls: unknown;
  paragraphs: Paragraph[];
  images: ImageBlockData[];
  persistWriterData: (patch: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
}

export function useWriterContentControlState({
  rawControls,
  paragraphs,
  images,
  persistWriterData,
}: UseWriterContentControlStateOptions) {
  const contentControls = useMemo(() => normalizeWriterContentControls(
    rawControls,
    new Set(paragraphs.map((paragraph) => paragraph.id)),
    new Set(images.map((image) => image.id)),
  ), [images, paragraphs, rawControls]);
  const [contentControlError, setContentControlError] = useState<string | null>(null);

  const replaceContentControl = useCallback((updated: WriterContentControl) => {
    persistWriterData({
      contentControls: contentControls.map((control) => control.id === updated.id ? updated : control),
    });
  }, [contentControls, persistWriterData]);

  const fail = useCallback((error: unknown, fallback: string) => {
    setContentControlError(error instanceof WriterContentControlError ? error.message : fallback);
    return false;
  }, []);

  const handleFillContentControl = useCallback((controlId: string, value: unknown) => {
    const control = contentControls.find((candidate) => candidate.id === controlId);
    if (!control) return false;
    try {
      const updated = updateWriterContentControlValue(control, value, new Set(images.map((image) => image.id)));
      setContentControlError(null);
      replaceContentControl(updated);
      return true;
    } catch (error) {
      return fail(error, 'Formularfeld konnte nicht aktualisiert werden.');
    }
  }, [contentControls, fail, images, replaceContentControl]);

  const handleAddRepeatingItem = useCallback((controlId: string) => {
    const control = contentControls.find((candidate) => candidate.id === controlId);
    if (!control) return false;
    try {
      setContentControlError(null);
      replaceContentControl(addWriterRepeatingItem(control));
      return true;
    } catch (error) {
      return fail(error, 'Repeating Section konnte nicht erweitert werden.');
    }
  }, [contentControls, fail, replaceContentControl]);

  const handleUpdateRepeatingItem = useCallback((controlId: string, itemId: string, value: string) => {
    const control = contentControls.find((candidate) => candidate.id === controlId);
    if (!control) return false;
    try {
      setContentControlError(null);
      replaceContentControl(updateWriterRepeatingItem(control, itemId, value));
      return true;
    } catch (error) {
      return fail(error, 'Repeating-Section-Element konnte nicht aktualisiert werden.');
    }
  }, [contentControls, fail, replaceContentControl]);

  const handleRemoveRepeatingItem = useCallback((controlId: string, itemId: string) => {
    const control = contentControls.find((candidate) => candidate.id === controlId);
    if (!control) return false;
    try {
      setContentControlError(null);
      replaceContentControl(removeWriterRepeatingItem(control, itemId));
      return true;
    } catch (error) {
      return fail(error, 'Repeating-Section-Element konnte nicht entfernt werden.');
    }
  }, [contentControls, fail, replaceContentControl]);

  return {
    contentControls,
    contentControlError,
    handleFillContentControl,
    handleAddRepeatingItem,
    handleUpdateRepeatingItem,
    handleRemoveRepeatingItem,
  };
}
