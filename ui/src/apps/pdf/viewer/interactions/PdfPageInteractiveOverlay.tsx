import React from 'react';
import type { PdfFormField, PdfPageBox, PdfPageModel } from '../../../../shared/contracts/workspace';

interface PdfPageInteractiveOverlayProps {
  page: PdfPageModel;
  mediaBox: PdfPageBox;
  formFields: readonly PdfFormField[];
}

const styleForBox = (box: PdfPageBox, media: PdfPageBox): React.CSSProperties => ({
  left: `${((box.x - media.x) / media.width) * 100}%`,
  bottom: `${((box.y - media.y) / media.height) * 100}%`,
  width: `${(box.width / media.width) * 100}%`,
  height: `${(box.height / media.height) * 100}%`,
});

const fieldText = (field: PdfFormField): string => {
  if (Array.isArray(field.value)) return field.value.join(', ');
  if (typeof field.value === 'boolean') return field.value ? 'X' : '';
  return field.value || field.label || '';
};

export const PdfPageInteractiveOverlay: React.FC<PdfPageInteractiveOverlayProps> = ({ page, mediaBox, formFields }) => (
  <div className="pointer-events-none absolute inset-0 z-20" data-pdf-interactive-geometry="shared-page-points-v1" aria-hidden="true">
    {(page.links ?? []).map((link) => (
      <span
        key={link.id}
        className="absolute rounded-sm ring-1 ring-blue-500/20"
        style={styleForBox(link.bounds, mediaBox)}
        title={link.target.kind === 'url' ? `PDF link: ${link.target.url}` : `PDF link: page ${link.target.pageNumber}`}
        data-pdf-link-id={link.id}
      />
    ))}
    {formFields.filter((field) => field.page === page.pageNumber).map((field) => (
      <span
        key={field.id}
        className="absolute overflow-hidden rounded-[2px] border border-slate-400 bg-white/95 px-[2px] text-[0.5rem] leading-tight text-slate-900"
        style={styleForBox(field.bounds, mediaBox)}
        data-pdf-form-field={field.name}
        title={`${field.type}: ${field.name}`}
      >
        {field.type === 'signature' && !fieldText(field) ? '[Unsigned]' : fieldText(field)}
      </span>
    ))}
  </div>
);
