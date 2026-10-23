// STATUS: DIAMANT VGT SUPREME — consent-gated local OCR & camera/scan adapter
import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, CheckCircle2, Copy, FileText, Scan, Shield, Upload, X } from 'lucide-react';
import { readValidatedNoteImageFile } from '../noteAttachments';
import { isLocalTextDetectionAvailable, performLocalImageOcr, type OcrResult } from '../../../../platform/media/ocr/localTextDetection';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../../notesExtendedLocale';
import { useNotesDialogA11y } from '../../editor/useNotesDialogA11y';

export interface NotesOcrInsertPayload {
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  result: OcrResult;
}

interface NotesOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertOcrText: (text: string) => void;
  onInsertOcrImage?: (payload: NotesOcrInsertPayload) => void;
}

export const NotesOcrModal: React.FC<NotesOcrModalProps> = ({ isOpen, onClose, onInsertOcrText, onInsertOcrImage }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => notesExtendedText(message, locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/jpeg');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);
  useEffect(() => {
    if (!isOpen) stopCamera();
  }, [isOpen]);

  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  if (!isOpen) return null;

  const executeOcr = async (dataUrl: string) => {
    setIsProcessing(true); setErrorMsg(null); setOcrResult(null);
    try { setOcrResult(await performLocalImageOcr(dataUrl)); }
    catch { setErrorMsg(t('Local OCR failed.')); }
    finally { setIsProcessing(false); }
  };

  const loadFile = async (file: File) => {
    try {
      setErrorMsg(null);
      const dataUrl = await readValidatedNoteImageFile(file);
      const mime = file.type as 'image/png' | 'image/jpeg' | 'image/webp';
      setPreviewImage(dataUrl); setPreviewMime(mime); stopCamera();
      await executeOcr(dataUrl);
    } catch { setErrorMsg(t('Image import failed.')); }
  };

  const startCamera = async () => {
    if (!cameraConsent) { setErrorMsg(t('Confirm camera consent before requesting device access.')); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setErrorMsg(t('Camera capture is unavailable in this environment.')); return; }
    try {
      setErrorMsg(null);
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      setCameraStream(stream);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch { setErrorMsg(t('Camera permission or capture failed.')); }
  };

  const captureCamera = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) { setErrorMsg(t('Camera canvas is unavailable.')); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPreviewImage(dataUrl); setPreviewMime('image/jpeg'); stopCamera();
    await executeOcr(dataUrl);
  };

  const handleInsert = () => {
    if (!ocrResult || !previewImage) return;
    if (onInsertOcrImage) onInsertOcrImage({ dataUrl: previewImage, mimeType: previewMime, result: ocrResult });
    else onInsertOcrText(ocrResult.markdownFormatted);
    onClose();
  };
  const handleCopy = async () => {
    if (!ocrResult?.fullText) return;
    try { await navigator.clipboard.writeText(ocrResult.fullText); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setErrorMsg(t('Clipboard access was denied.')); }
  };

  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Notes OCR and scanner')}>
    <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2 text-blue-400"><Scan className="w-5 h-5" /><h3 className="text-sm font-bold text-slate-100">{t('Local OCR & Scan Recognition')}</h3><span className="text-[0.5625rem] text-emerald-400 flex items-center gap-1"><Shield className="w-3 h-3" />{t('Local only · no cloud upload')}</span></div>
        <button type="button" onClick={() => { stopCamera(); onClose(); }} className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10" aria-label="Close OCR"><X className="w-4 h-4" /></button>
      </div>

      {!isLocalTextDetectionAvailable() && <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[0.6875rem] text-amber-200">{t('This platform does not expose a local TextDetector OCR engine. Astraea will not fabricate OCR text and will not upload your scan to a cloud service.')}</div>}
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void loadFile(file); }} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <div onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => { const file = event.dataTransfer.files[0]; if (!file) return; event.preventDefault(); void loadFile(file); }} className="h-52 rounded-xl overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center relative">
            {cameraStream ? <video ref={videoRef} muted playsInline className="max-h-full max-w-full object-contain" /> : previewImage ? <img src={previewImage} alt={t('OCR source preview')} className="max-h-full max-w-full object-contain" /> : <button type="button" onClick={() => fileInputRef.current?.click()} className="h-full w-full border-2 border-dashed border-white/10 hover:border-blue-500/40 flex flex-col items-center justify-center gap-2 text-slate-500"><Upload className="w-6 h-6" /><span className="text-xs">{t('Import/drop PNG, JPEG or WebP')}</span></button>}
            {previewImage && !cameraStream && <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-[0.625rem] rounded border border-white/10">{t('Change image')}</button>}
          </div>
          <div className="p-2 rounded-lg border border-white/10 bg-slate-950/50 space-y-2">
            <label className="flex items-center gap-2 text-[0.625rem] text-slate-400"><input type="checkbox" checked={cameraConsent} onChange={(event) => setCameraConsent(event.target.checked)} />{t('I explicitly allow Astraea to request camera access for this scan.')}</label>
            <div className="flex gap-2"><button type="button" onClick={() => { void startCamera(); }} className="px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300"><Camera className="w-3 h-3 inline mr-1" />{t('Open camera')}</button>{cameraStream && <button type="button" onClick={() => { void captureCamera(); }} className="px-2 py-1 rounded bg-blue-600 text-[0.625rem] text-white">{t('Capture scan')}</button>}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-[0.6875rem] text-slate-400 font-semibold">{t('Extracted text')}</span>{ocrResult?.confidence != null && <span className="text-[0.625rem] font-mono text-emerald-400">{t('Confidence')} {ocrResult.confidence}%</span>}</div>
          <div className="h-52 rounded-xl border border-white/10 bg-slate-950 p-3 overflow-y-auto text-xs font-mono text-slate-300">{isProcessing ? <div className="h-full flex items-center justify-center gap-2 text-slate-500"><Scan className="w-5 h-5 animate-pulse text-blue-400" />{t('Running local OCR…')}</div> : ocrResult ? <div className="whitespace-pre-wrap">{ocrResult.fullText || t('No text detected.')}</div> : errorMsg ? <div className="text-red-300">{errorMsg}</div> : <span className="text-slate-600">{t('Waiting for a local image or scan…')}</span>}</div>
          {ocrResult && <div className="p-2 bg-slate-800/40 rounded-xl border border-white/5 flex items-center justify-between text-[0.625rem]"><span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />{ocrResult.tokens.length} {t('region(s)')}, {ocrResult.processingTimeMs} ms</span><button type="button" onClick={() => { void handleCopy(); }} disabled={!ocrResult.fullText} className="px-2 py-1 bg-white/5 rounded disabled:opacity-30">{copied ? <Check className="w-3 h-3 inline mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 inline mr-1" />}{copied ? t('Copied') : t('Copy text')}</button></div>}
        </div>
      </div>

      {errorMsg && !isProcessing && <div className="text-[0.625rem] text-red-300">{errorMsg}</div>}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10"><button type="button" onClick={() => { stopCamera(); onClose(); }} className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-xs rounded-lg text-slate-300">{t('Cancel')}</button><button type="button" onClick={handleInsert} disabled={!ocrResult || !previewImage} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{t('Insert source + OCR')}</button></div>
    </div>
  </div>;
};
