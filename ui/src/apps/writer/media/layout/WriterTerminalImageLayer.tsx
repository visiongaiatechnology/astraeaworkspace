// STATUS: DIAMANT VGT SUPREME — Inline/Top-Bottom Paragraph Image Layer
import React from 'react';
import type { WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { WriterPageGeometry } from '../../layout/pagination/writerPagination';
import { WriterImageBlock } from '../images/WriterImageBlock';
import { writerTerminalLayerImages } from './writerImageLayerSelection';

interface WriterTerminalImageLayerProps {
  images: readonly WriterImageBlockData[];
  anchorParagraphId: string;
  pageGeometry: WriterPageGeometry;
  readOnly: boolean;
  onUpdateImage: (imageId: string, patch: Partial<WriterImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: WriterImageBlockData) => void;
}

export const WriterTerminalImageLayer: React.FC<WriterTerminalImageLayerProps> = ({
  images, anchorParagraphId, pageGeometry, readOnly, onUpdateImage, onDeleteImage, onOpenImageProperties,
}) => (
  <>
    {writerTerminalLayerImages(images, anchorParagraphId).map((image) => (
      <WriterImageBlock
        key={image.id}
        image={image}
        onUpdate={(patch) => onUpdateImage(image.id, patch)}
        onDelete={() => onDeleteImage(image.id)}
        onOpenProperties={onOpenImageProperties ? () => onOpenImageProperties(image) : undefined}
        readOnly={readOnly}
        pageGeometry={pageGeometry}
      />
    ))}
  </>
);
