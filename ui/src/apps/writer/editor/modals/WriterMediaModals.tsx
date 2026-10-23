// STATUS: DIAMANT VGT SUPREME — Sovereign Container for Image Properties, Equation & Table of Figures Modals
import React from 'react';
import type {
  WriterImageBlockData,
  WriterEquationBlockData,
  Paragraph,
} from '../../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { WriterImagePropertiesModal } from '../../media/images/WriterImagePropertiesModal';
import { WriterEquationModal } from '../../equations/WriterEquationModal';
import { WriterTableOfFiguresModal } from '../../references/indexes/WriterTableOfFiguresModal';

export interface WriterMediaModalsProps {
  isImagePropertiesOpen: boolean;
  activeImage?: WriterImageBlockData | null;
  onCloseImageProperties: () => void;
  onUpdateImage: (imageId: string, patch: Partial<WriterImageBlockData>) => void;

  isEquationModalOpen: boolean;
  activeEquation?: WriterEquationBlockData | null;
  onCloseEquationModal: () => void;
  onSaveEquation: (equation: WriterEquationBlockData) => void;

  isTableOfFiguresOpen: boolean;
  images: readonly WriterImageBlockData[];
  paginationPages?: readonly WriterPaginationPage[];
  onCloseTableOfFigures: () => void;
  onInsertTableOfFigures: (paragraphs: Paragraph[]) => void;
}

export const WriterMediaModals: React.FC<WriterMediaModalsProps> = ({
  isImagePropertiesOpen,
  activeImage = null,
  onCloseImageProperties,
  onUpdateImage,

  isEquationModalOpen,
  activeEquation = null,
  onCloseEquationModal,
  onSaveEquation,

  isTableOfFiguresOpen,
  images,
  paginationPages = [],
  onCloseTableOfFigures,
  onInsertTableOfFigures,
}) => {
  return (
    <>
      <WriterImagePropertiesModal
        isOpen={isImagePropertiesOpen}
        image={activeImage}
        onClose={onCloseImageProperties}
        onApply={onUpdateImage}
      />

      <WriterEquationModal
        isOpen={isEquationModalOpen}
        equation={activeEquation}
        onClose={onCloseEquationModal}
        onSave={onSaveEquation}
      />

      <WriterTableOfFiguresModal
        isOpen={isTableOfFiguresOpen}
        images={images}
        pages={paginationPages}
        onClose={onCloseTableOfFigures}
        onInsertTableOfFigures={onInsertTableOfFigures}
      />
    </>
  );
};
