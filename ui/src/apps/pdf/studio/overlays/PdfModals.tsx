import React from 'react';
import { PdfRedaction } from '../../../../shared/contracts/workspace';
import { ShieldAlert, ShieldCheck, MessageSquare, Lock, X } from 'lucide-react';

interface RedactReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSection: {
    pageNumber: number;
    sectionId: string;
    sampleText: string;
  } | null;
  selectedImage?: {
    pageNumber: number;
    imageId: string;
    sampleText: string;
  } | null;
  selectedRectangle?: {
    pageNumber: number;
    sampleText: string;
  } | null;
  reason: string;
  setReason: (r: string) => void;
  overlayColor: string;
  setOverlayColor: (value: string) => void;
  overlayText: string;
  setOverlayText: (value: string) => void;
  onConfirm: () => void;
}

export const RedactReasonModal: React.FC<RedactReasonModalProps> = ({
  isOpen,
  onClose,
  selectedSection,
  selectedImage,
  selectedRectangle,
  reason,
  setReason,
  overlayColor,
  setOverlayColor,
  overlayText,
  setOverlayText,
  onConfirm,
}) => {
  const target = selectedSection ?? selectedImage ?? selectedRectangle ?? null;
  if (!isOpen || !target) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-dropdown rounded-2xl p-6 border border-red-500/30 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-red-400">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold text-slate-100">
          {selectedRectangle ? 'Destructive Rectangle Redaction' : selectedImage ? 'Destructive Image Redaction' : 'Structured Content Redaction'}
            </h3>
          </div>
          <button aria-label={selectedRectangle ? 'Close destructive rectangle redaction' : selectedImage ? 'Close destructive image redaction' : 'Close structured content redaction'}
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {selectedRectangle
            ? 'This action maps the selected PDF-page rectangle to canonical structured objects, removes intersecting text, vectors, links, form fields and review objects, destructively rewrites intersecting image pixels, then adds only the chosen visual overlay. If an object cannot be mapped safely, the operation fails closed.'
            : selectedImage
              ? 'This action decodes the local JPEG, overwrites the selected source pixels, re-encodes a new JPEG and discards the original payload from the active structured model. Existing file versions, backups and previously exported copies are separate artifacts.'
              : 'This action removes the selected text from the active structured Workspace model and replaces it with a redaction marker. New structured PDF exports omit the original text. Existing file versions, backups, process memory, or previously exported copies are outside this operation and are not claimed to be erased.'}
        </p>

        {/* Target snippet preview */}
        <div className="p-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[0.6875rem] text-red-300 max-h-24 overflow-y-auto">
          "{target.sampleText.slice(0, 140)}{target.sampleText.length > 140 ? '…' : ''}"
        </div>

        {(selectedImage || selectedRectangle) && (
          <div className="grid grid-cols-[110px_1fr] gap-3 items-end">
            <label className="space-y-1.5 text-[0.6875rem] font-bold text-slate-400 uppercase tracking-wider">
              Overlay color
              <input type="color" value={overlayColor} onChange={(event) => setOverlayColor(event.target.value)} className="w-full h-9 rounded-lg border border-white/10 bg-slate-950 p-1" />
            </label>
            <label className="space-y-1.5 text-[0.6875rem] font-bold text-slate-400 uppercase tracking-wider">
              Overlay text (optional)
              <input value={overlayText} onChange={(event) => setOverlayText(event.target.value)} maxLength={128} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 focus:outline-none focus:border-red-500" />
            </label>
          </div>
        )}

        {/* Reason selector */}
        <div className="space-y-1.5">
          <label className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-wider">
            Sanitization Reason / Audit Tag
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 focus:outline-none focus:border-red-500"
          >
            <option value="Confidential Enclave Secret / PII">
              Confidential Enclave Secret / PII
            </option>
            <option value="Cryptographic Key / Seed Phrase">
              Cryptographic Key / Seed Phrase
            </option>
            <option value="Classified Internal LAN Network Route">
              Classified Internal LAN Network Route
            </option>
            <option value="Personal Identity & Personnel Record">
              Personal Identity & Personnel Record
            </option>
            <option value="Proprietary Financial Ledger Data">
              Proprietary Financial Ledger Data
            </option>
          </select>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center space-x-1.5 shadow-lg shadow-red-600/30"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{selectedRectangle ? 'Apply Rectangle Redaction' : 'Apply Model Redaction'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetText: string;
  commentInput: string;
  setCommentInput: (v: string) => void;
  onSave: () => void;
}

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  targetText,
  commentInput,
  setCommentInput,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm glass-dropdown rounded-2xl p-5 border border-white/15 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span>Add Sovereign Comment</span>
          </h3>
          <button aria-label="Close Add Sovereign Comment dialog"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {targetText && (
          <p className="text-[0.6875rem] text-slate-400 italic bg-white/[0.03] p-2 rounded border border-white/10 line-clamp-2">
            "{targetText}"
          </p>
        )}

        <textarea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="Type your review note or security observation..."
          rows={3}
          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          autoFocus
        />

        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-500"
          >
            Post Comment
          </button>
        </div>
      </div>
    </div>
  );
};

interface RedactionAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  totalSanitizedBlocks: number;
  redactions: PdfRedaction[];
  redactedSectionsCount: number;
}

export const RedactionAuditModal: React.FC<RedactionAuditModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  totalSanitizedBlocks,
  redactions,
  redactedSectionsCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass-dropdown rounded-2xl p-6 border border-emerald-500/30 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Structured Redaction Audit Report
            </h3>
          </div>
          <button aria-label="Close Structured Redaction Audit Report dialog"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          This report lists redactions applied to the active structured Workspace model for document{' '}
          <strong className="text-white">{documentTitle}</strong>. Structured PDF export omits redacted section text from newly generated PDF bytes; this report is not a forensic-erasure certificate.
        </p>

        {/* Audit Metrics Table */}
        <div className="bg-slate-950/80 rounded-xl p-3 border border-white/10 space-y-2 text-xs font-mono">
          <div className="flex justify-between py-1 border-b border-white/[0.06]">
            <span className="text-slate-400">Total Sanitized Blocks:</span>
            <span className="text-emerald-400 font-bold">
              {totalSanitizedBlocks} blocks
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.06]">
            <span className="text-slate-400">Export Verification:</span>
            <span className="text-emerald-400 font-bold">Redacted section text omitted</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.06]">
            <span className="text-slate-400">Redaction Scope:</span>
            <span className="text-slate-200">Workspace structured model + new PDF export</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Attestation Timestamp:</span>
            <span className="text-slate-200">{new Date().toUTCString()}</span>
          </div>
        </div>

        {/* Redacted Items Breakdown */}
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          <span className="text-[0.625rem] uppercase font-bold text-slate-400 tracking-wider block">
            Audit Event Log:
          </span>
          {redactions.map((r) => (
            <div
              key={r.id}
              className="p-2 rounded bg-white/[0.03] text-[0.6875rem] font-mono flex items-center justify-between text-slate-300"
            >
              <span className="text-red-400">{r.reason}</span>
              <span className="text-slate-500">Page {r.page} · Recorded</span>
            </div>
          ))}
          {redactions.length === 0 && redactedSectionsCount === 0 && (
            <p className="text-xs text-slate-500 italic">No redactions recorded.</p>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-200 hover:text-white"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
