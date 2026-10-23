// STATUS: DIAMANT VGT SUPREME — Document Object Rendering Blocks for Special Views
import React from 'react';
import type { Paragraph, WriterShapeBlockData, WriterStyleCatalog } from '../../../../shared/contracts/workspace';
import type { EquationBlockData, ImageBlockData, TableBlockData } from '../../types';
import { WriterTableBlock } from './tables/WriterTableBlock';
import { WriterImageBlock } from '../../media/images/WriterImageBlock';
import { WriterEquationBlock } from '../../equations/WriterEquationBlock';
import { WriterShapeCanvas } from './shapes/WriterShapeCanvas';

export interface WriterAttachedBlocksProps {
  paragraphId: string;
  tables: TableBlockData[];
  images: ImageBlockData[];
  equations: EquationBlockData[];
  styleCatalog: WriterStyleCatalog;
  onUpdateTable: (table: TableBlockData) => void;
  onDeleteTable: (tableId: string) => void;
  onOpenTableProperties?: (table: TableBlockData) => void;
  onUpdateImage: (imageId: string, patch: Partial<ImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: ImageBlockData) => void;
  onUpdateEquation: (equation: EquationBlockData) => void;
  onDeleteEquation: (equationId: string) => void;
  onOpenEquationModal?: (equation: EquationBlockData) => void;
  readOnly?: boolean;
}

export const WriterAttachedBlocks: React.FC<WriterAttachedBlocksProps> = ({
  paragraphId,
  tables,
  images,
  equations,
  styleCatalog,
  onUpdateTable,
  onDeleteTable,
  onOpenTableProperties,
  onUpdateImage,
  onDeleteImage,
  onOpenImageProperties,
  onUpdateEquation,
  onDeleteEquation,
  onOpenEquationModal,
  readOnly = false,
}) => {
  const attachedImages = images.filter((img) => img.anchorParagraphId === paragraphId);
  const attachedTables = tables.filter((tbl) => tbl.anchorParagraphId === paragraphId);
  const attachedEquations = equations.filter((eq) => eq.anchorParagraphId === paragraphId);

  if (attachedImages.length === 0 && attachedTables.length === 0 && attachedEquations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 my-2 pl-2 border-l-2 border-blue-500/20">
      {attachedImages.map((img) => (
        <WriterImageBlock
          key={img.id}
          image={img}
          onUpdate={(patch) => onUpdateImage(img.id, patch)}
          onDelete={() => onDeleteImage(img.id)}
          onOpenProperties={onOpenImageProperties ? () => onOpenImageProperties(img) : undefined}
          readOnly={readOnly}
        />
      ))}

      {attachedTables.map((tbl) => (
        <div key={tbl.id} className="my-2">
          <WriterTableBlock
            tableData={tbl}
            styleCatalog={styleCatalog}
            tableIndex={tables.findIndex((t) => t.id === tbl.id)}
            onUpdateTable={onUpdateTable}
            onDeleteTable={() => onDeleteTable(tbl.id)}
            onOpenProperties={() => onOpenTableProperties?.(tbl)}
            readOnly={readOnly}
          />
        </div>
      ))}

      {attachedEquations.map((eq) => (
        <WriterEquationBlock
          key={eq.id}
          equation={eq}
          onUpdateEquation={onUpdateEquation}
          onDeleteEquation={onDeleteEquation}
          onOpenEditor={onOpenEquationModal}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};

export interface WriterUnanchoredBlocksProps {
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  equations: EquationBlockData[];
  shapes?: readonly WriterShapeBlockData[];
  styleCatalog: WriterStyleCatalog;
  onUpdateTable: (table: TableBlockData) => void;
  onDeleteTable: (tableId: string) => void;
  onOpenTableProperties?: (table: TableBlockData) => void;
  onUpdateImage: (imageId: string, patch: Partial<ImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: ImageBlockData) => void;
  onUpdateEquation: (equation: EquationBlockData) => void;
  onDeleteEquation: (equationId: string) => void;
  onOpenEquationModal?: (equation: EquationBlockData) => void;
  onUpdateShapes?: (shapes: WriterShapeBlockData[]) => void;
  readOnly?: boolean;
  /** WR-034: zoom of the surrounding view, so a drag stays 1:1 at every zoom level. */
  zoom?: number;
}

export const WriterUnanchoredBlocks: React.FC<WriterUnanchoredBlocksProps> = ({
  paragraphs,
  tables,
  images,
  equations,
  shapes,
  styleCatalog,
  onUpdateTable,
  onDeleteTable,
  onOpenTableProperties,
  onUpdateImage,
  onDeleteImage,
  onOpenImageProperties,
  onUpdateEquation,
  onDeleteEquation,
  onOpenEquationModal,
  onUpdateShapes,
  readOnly = false,
  zoom = 100,
}) => {
  const unanchoredImages = images.filter(
    (img) => !img.anchorParagraphId || !paragraphs.some((p) => p.id === img.anchorParagraphId)
  );
  const unanchoredTables = tables.filter(
    (tbl) => !tbl.anchorParagraphId || !paragraphs.some((p) => p.id === tbl.anchorParagraphId)
  );
  const unanchoredEquations = equations.filter(
    (eq) => !eq.anchorParagraphId || !paragraphs.some((p) => p.id === eq.anchorParagraphId)
  );

  if (
    unanchoredImages.length === 0 &&
    unanchoredTables.length === 0 &&
    unanchoredEquations.length === 0 &&
    (!shapes || shapes.length === 0)
  ) {
    return null;
  }

  return (
    <div className="mt-8 pt-4 border-t border-dashed border-slate-700/60 space-y-4">
      <div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
        <span>Unverankerte Dokumentobjekte & Tabellen</span>
      </div>
      {unanchoredTables.map((tbl) => (
        <div key={tbl.id} className="my-2">
          <WriterTableBlock
            tableData={tbl}
            styleCatalog={styleCatalog}
            tableIndex={tables.findIndex((t) => t.id === tbl.id)}
            onUpdateTable={onUpdateTable}
            onDeleteTable={() => onDeleteTable(tbl.id)}
            onOpenProperties={() => onOpenTableProperties?.(tbl)}
            readOnly={readOnly}
          />
        </div>
      ))}
      {unanchoredImages.map((img) => (
        <WriterImageBlock
          key={img.id}
          image={img}
          onUpdate={(patch) => onUpdateImage(img.id, patch)}
          onDelete={() => onDeleteImage(img.id)}
          onOpenProperties={onOpenImageProperties ? () => onOpenImageProperties(img) : undefined}
          readOnly={readOnly}
        />
      ))}
      {unanchoredEquations.map((eq) => (
        <WriterEquationBlock
          key={eq.id}
          equation={eq}
          onUpdateEquation={onUpdateEquation}
          onDeleteEquation={onDeleteEquation}
          onOpenEditor={onOpenEquationModal}
          readOnly={readOnly}
        />
      ))}
      {shapes && shapes.length > 0 && onUpdateShapes && (
        <WriterShapeCanvas shapes={shapes} onUpdateShapes={onUpdateShapes} readOnly={readOnly} zoom={zoom} />
      )}
    </div>
  );
};
