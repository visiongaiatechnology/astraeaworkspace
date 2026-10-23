// STATUS: DIAMANT VGT SUPREME — Flowing Paragraph/Character Anchored Image Layer
import React from 'react';
import type { Paragraph, WriterImageBlockData, WriterLanguageTag, WriterStyleDefinition } from '../../../../shared/contracts/workspace';
import type { WriterPageGeometry, WriterPaginationFragment } from '../../layout/pagination/writerPagination';
import { WriterImageBlock } from '../images/WriterImageBlock';
import { writerAnchoredLayerImages } from './writerImageLayerSelection';
import { resolveWriterImageFlowAnchorPosition } from '../../layout/pagination/media/writerMediaAnchorGeometry';

interface WriterAnchoredImageLayerProps {
  images: readonly WriterImageBlockData[];
  paragraph: Paragraph;
  fragment: WriterPaginationFragment;
  pageGeometry: WriterPageGeometry;
  styles: readonly WriterStyleDefinition[];
  defaultLanguage?: WriterLanguageTag;
  readOnly: boolean;
  onUpdateImage: (imageId: string, patch: Partial<WriterImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: WriterImageBlockData) => void;
}

export const WriterAnchoredImageLayer: React.FC<WriterAnchoredImageLayerProps> = ({
  images, paragraph, fragment, pageGeometry, styles, defaultLanguage = 'de-DE',
  readOnly, onUpdateImage, onDeleteImage, onOpenImageProperties,
}) => {
  const anchored = writerAnchoredLayerImages(images, paragraph.id, fragment);
  if (anchored.length === 0) return null;
  return (
    <>
      {anchored.map((image) => {
        const flowAnchorPosition = resolveWriterImageFlowAnchorPosition(
          image, paragraph, fragment, pageGeometry, styles, defaultLanguage,
        );
        if (!flowAnchorPosition) return null;
        return (
          <WriterImageBlock
            key={`flow-anchor:${fragment.key}:${image.id}`}
            image={image}
            onUpdate={(patch) => onUpdateImage(image.id, patch)}
            onDelete={() => onDeleteImage(image.id)}
            onOpenProperties={onOpenImageProperties ? () => onOpenImageProperties(image) : undefined}
            readOnly={readOnly}
            pageGeometry={pageGeometry}
            flowAnchorPosition={flowAnchorPosition}
          />
        );
      })}
    </>
  );
};
