// STATUS: DIAMANT VGT SUPREME — Sovereign Multilevel List & Outline State Hook
import { useState, useCallback } from 'react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterListTemplate } from '../../../../shared/contracts/writer/workspaceWriterList';
import type { WriterDocumentData } from '../../types';

interface UseWriterListStateProps {
  paragraphs: Paragraph[];
  persistParagraphs: (paragraphs: Paragraph[]) => void;
  updateActiveParagraph: (updater: (p: Paragraph) => Paragraph) => void;
  persistWriterData: (data: WriterDocumentData) => void;
}

export function useWriterListState({
  paragraphs,
  persistParagraphs,
  updateActiveParagraph,
  persistWriterData,
}: UseWriterListStateProps) {
  const [isListFormatOpen, setIsListFormatOpen] = useState(false);

  const handleOpenListFormat = useCallback(() => setIsListFormatOpen(true), []);
  const handleCloseListFormat = useCallback(() => setIsListFormatOpen(false), []);

  const handleIndentListLevel = useCallback((_pIdx: number, delta = 1) => {
    updateActiveParagraph((p) => {
      const currentLevel = p.style.list_level ?? 0;
      const nextLevel = Math.max(0, Math.min(8, currentLevel + delta));
      return {
        ...p,
        style: {
          ...p.style,
          list_level: nextLevel,
        },
      };
    });
  }, [updateActiveParagraph]);

  const handleOutdentListLevel = useCallback((_pIdx: number) => {
    updateActiveParagraph((p) => {
      const currentLevel = p.style.list_level ?? 0;
      if (currentLevel <= 0) {
        return {
          ...p,
          style: {
            ...p.style,
            list_style: undefined,
            list_level: undefined,
            list_number_format: undefined,
            list_override_glyph: undefined,
          },
        };
      }
      return {
        ...p,
        style: {
          ...p.style,
          list_level: currentLevel - 1,
        },
      };
    });
  }, [updateActiveParagraph]);

  const handleExitListMode = useCallback((_pIdx: number) => {
    updateActiveParagraph((p) => ({
      ...p,
      style: {
        ...p.style,
        list_style: undefined,
        list_level: undefined,
        list_number_format: undefined,
        list_override_glyph: undefined,
      },
    }));
  }, [updateActiveParagraph]);

  const handleToggleHeadingOutlineNumbering = useCallback((enabled?: boolean) => {
    const nextEnabled = enabled !== undefined ? enabled : !paragraphs.some((p) => p.style.heading_outline_numbered);
    const updated = paragraphs.map((p) => {
      if (p.style.heading_level) {
        return {
          ...p,
          style: {
            ...p.style,
            heading_outline_numbered: nextEnabled,
          },
        };
      }
      return p;
    });
    persistParagraphs(updated);
  }, [paragraphs, persistParagraphs]);

  const handleApplyListTemplate = useCallback((template: WriterListTemplate, isHeadingLinked = false) => {
    if (isHeadingLinked) {
      persistWriterData({
        active_heading_list_template_id: template.id,
      });
      const updated = paragraphs.map((p) => {
        if (p.style.heading_level) {
          return {
            ...p,
            style: {
              ...p.style,
              heading_outline_numbered: true,
            },
          };
        }
        return p;
      });
      persistParagraphs(updated);
    } else {
      updateActiveParagraph((p) => {
        const level = p.style.list_level ?? 0;
        const levelCfg = template.levels.find((l) => l.level === level) ?? template.levels[0];
        const isBullet = levelCfg.numberFormat.startsWith('bullet') || levelCfg.numberFormat === 'custom_glyph';
        return {
          ...p,
          style: {
            ...p.style,
            list_style: isBullet ? 'bullet' : 'number',
            list_number_format: levelCfg.numberFormat,
            list_override_glyph: levelCfg.bulletGlyph,
            left_indent_mm: p.style.left_indent_mm ?? levelCfg.leftIndentMm,
            hanging_indent_mm: p.style.hanging_indent_mm ?? levelCfg.hangingIndentMm,
          },
        };
      });
    }
  }, [paragraphs, persistParagraphs, persistWriterData, updateActiveParagraph]);

  return {
    isListFormatOpen,
    setIsListFormatOpen,
    handleOpenListFormat,
    handleCloseListFormat,
    handleIndentListLevel,
    handleOutdentListLevel,
    handleExitListMode,
    handleToggleHeadingOutlineNumbering,
    handleApplyListTemplate,
  };
}
