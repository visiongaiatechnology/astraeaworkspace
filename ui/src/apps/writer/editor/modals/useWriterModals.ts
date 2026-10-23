// STATUS: DIAMANT VGT SUPREME
import { useCallback, useState } from 'react';

export function useWriterModals() {
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'pageSetup');
  const [isExportOpen, setIsExportOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'export');
  const [isCitationOpen, setIsCitationOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'citation');
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'symbols');
  const [isFootnoteOpen, setIsFootnoteOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'footnote');
  const [isBookmarkOpen, setIsBookmarkOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'bookmark');
  const [isMailMergeOpen, setIsMailMergeOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'mailMerge');
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'findReplace');
  /**
   * WR-036 — `Ctrl+H` must open the replace row, not just the find row.
   *
   * The bar owns the visibility of its replace row, so the shortcut needs a monotonically
   * increasing token instead of a boolean: pressing `Ctrl+H` twice has to expand the row
   * twice, and a boolean would already be `true` on the second press.
   */
  const [findReplaceReplaceToken, setFindReplaceReplaceToken] = useState(0);
  const openFindReplace = useCallback((withReplace: boolean) => {
    setIsFindReplaceOpen(true);
    if (withReplace) setFindReplaceReplaceToken((token) => token + 1);
  }, []);
  const [isParagraphFormatOpen, setIsParagraphFormatOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isStyleInspectorOpen, setIsStyleInspectorOpen] = useState(false);
  const [isCrossReferenceOpen, setIsCrossReferenceOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);
  const [isGridEmbedOpen, setIsGridEmbedOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isLinguisticsOpen, setIsLinguisticsOpen] = useState(false);
  const [isDictationOpen, setIsDictationOpen] = useState(false);
  const [isRoundtripOpen, setIsRoundtripOpen] = useState(false);
  const [isAutoCorrectOpen, setIsAutoCorrectOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'autoCorrect');
  const [isTablePropertiesOpen, setIsTablePropertiesOpen] = useState(false);
  const [selectedTableForProperties, setSelectedTableForProperties] = useState<import('../../../../shared/contracts/workspace').WriterTableBlockData | null>(null);
  const [isImagePropertiesOpen, setIsImagePropertiesOpen] = useState(false);
  const [isMediaObjectOpen, setIsMediaObjectOpen] = useState(false);
  const [selectedImageForProperties, setSelectedImageForProperties] = useState<import('../../../../shared/contracts/workspace').WriterImageBlockData | null>(null);
  const [isEquationModalOpen, setIsEquationModalOpen] = useState(false);
  const [selectedEquationForModal, setSelectedEquationForModal] = useState<import('../../../../shared/contracts/workspace').WriterEquationBlockData | null>(null);
  const [isTableOfFiguresOpen, setIsTableOfFiguresOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isProtectionOpen, setIsProtectionOpen] = useState(false);
  const [isSpecialDirectoriesOpen, setIsSpecialDirectoriesOpen] = useState(false);

  return {
    isTocOpen, setIsTocOpen,
    isPageSetupOpen, setIsPageSetupOpen,
    isExportOpen, setIsExportOpen,
    isCitationOpen, setIsCitationOpen,
    isSymbolsOpen, setIsSymbolsOpen,
    isFootnoteOpen, setIsFootnoteOpen,
    isBookmarkOpen, setIsBookmarkOpen,
    isMailMergeOpen, setIsMailMergeOpen,
    isFindReplaceOpen, setIsFindReplaceOpen,
    findReplaceReplaceToken, openFindReplace,
    isParagraphFormatOpen, setIsParagraphFormatOpen,
    isSortOpen, setIsSortOpen,
    isStyleInspectorOpen, setIsStyleInspectorOpen,
    isCrossReferenceOpen, setIsCrossReferenceOpen,
    isFieldsOpen, setIsFieldsOpen,
    isGridEmbedOpen, setIsGridEmbedOpen,
    isStatsOpen, setIsStatsOpen,
    isLinguisticsOpen, setIsLinguisticsOpen,
    isDictationOpen, setIsDictationOpen,
    isRoundtripOpen, setIsRoundtripOpen,
    isAutoCorrectOpen, setIsAutoCorrectOpen,
    isTablePropertiesOpen, setIsTablePropertiesOpen,
    selectedTableForProperties, setSelectedTableForProperties,
    isImagePropertiesOpen, setIsImagePropertiesOpen,
    isMediaObjectOpen, setIsMediaObjectOpen,
    selectedImageForProperties, setSelectedImageForProperties,
    isEquationModalOpen, setIsEquationModalOpen,
    selectedEquationForModal, setSelectedEquationForModal,
    isTableOfFiguresOpen, setIsTableOfFiguresOpen,
    isCompareOpen, setIsCompareOpen,
    isProtectionOpen, setIsProtectionOpen,
    isSpecialDirectoriesOpen, setIsSpecialDirectoriesOpen,
  };
}
