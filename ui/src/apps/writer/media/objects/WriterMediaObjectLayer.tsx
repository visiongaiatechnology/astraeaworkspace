// STATUS: DIAMANT VGT SUPREME — Writer Audio/Video Flow Layer
import React from 'react';
import type { Paragraph, WriterMediaObjectData } from '../../../../shared/contracts/workspace';
import { WriterMediaObjectBlock } from './WriterMediaObjectBlock';

interface WriterMediaObjectLayerProps {
  mediaObjects: readonly WriterMediaObjectData[];
  paragraphs: readonly Paragraph[];
  anchorParagraphId?: string;
  unanchored?: boolean;
  readOnly?: boolean;
  onDeleteMedia?: (mediaId: string) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

export const WriterMediaObjectLayer: React.FC<WriterMediaObjectLayerProps> = ({
  mediaObjects, paragraphs, anchorParagraphId, unanchored = false, readOnly = false, onDeleteMedia, onOpenExternalUrl,
}) => {
  const paragraphIds = new Set(paragraphs.map((paragraph) => paragraph.id));
  const visible = mediaObjects.filter((media) => unanchored
    ? !media.anchorParagraphId || !paragraphIds.has(media.anchorParagraphId)
    : media.anchorParagraphId === anchorParagraphId);
  if (visible.length === 0) return null;
  return <>{visible.map((media) => <WriterMediaObjectBlock key={media.id} media={media} readOnly={readOnly} onDelete={onDeleteMedia ? () => onDeleteMedia(media.id) : undefined} onOpenExternalUrl={onOpenExternalUrl} />)}</>;
};
