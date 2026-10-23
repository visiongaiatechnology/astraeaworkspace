// STATUS: DIAMANT VGT SUPREME — Fixed Page Image Layer
import React from 'react';
import type { WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { WriterPageGeometry, WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { WriterImageBlock } from '../images/WriterImageBlock';
import { isWriterImageFixedToPage } from '../images/operations/writerMediaOperations';

interface WriterFixedImageLayerProps {
  images: readonly WriterImageBlockData[];
  page: WriterPaginationPage;
  pageGeometry: WriterPageGeometry;
  readOnly: boolean;
  onUpdateImage: (imageId: string, patch: Partial<WriterImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: WriterImageBlockData) => void;
}

export const WriterFixedImageLayer: React.FC<WriterFixedImageLayerProps> = ({
  images, page, pageGeometry, readOnly, onUpdateImage, onDeleteImage, onOpenImageProperties,
}) => (
  <>
    {images.filter((image) => {
      if (!isWriterImageFixedToPage(image)) return false;
      if (image.anchorPageIndex !== undefined) return image.anchorPageIndex === page.pageIndex;
      if (!image.anchorParagraphId) return page.isFirst;
      return page.paragraphs.some((paragraph) => paragraph.id === image.anchorParagraphId);
    }).map((image) => (
      <WriterImageBlock
        key={`fixed:${page.id}:${image.id}`}
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
