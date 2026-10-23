// STATUS: DIAMANT VGT SUPREME — Sovereign Document Protection Modal
import React, { useState } from 'react';
import { X, Shield, Lock, AlertTriangle, Check } from 'lucide-react';
import type { WriterProtectionMode } from '../../types';
import {
  hashProtectionPassword,
  isLegacyProtectionHash,
  verifyProtectionPassword,
} from './writerProtectionEngine';

export interface WriterProtectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode?: WriterProtectionMode;
  storedPasswordHash?: string;
  onApplyProtection: (mode: WriterProtectionMode, passwordHash?: string) => void;
}

export const WriterProtectionModal: React.FC<WriterProtectionModalProps> = ({
  isOpen,
  onClose,
  currentMode = 'none',
  storedPasswordHash,
  onApplyProtection,
}) => {
  const [selectedMode, setSelectedMode] = useState<WriterProtectionMode>(currentMode);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const isLockedWithPassword = Boolean(storedPasswordHash && currentMode !== 'none');

  const handleApply = async () => {
    if (isApplying) return;
    setError(null);
    setIsApplying(true);

    try {
      if (isLockedWithPassword) {
        if (!(await verifyProtectionPassword(unlockPassword, storedPasswordHash))) {
          setError('Das eingegebene Entsperrkennwort ist ungültig.');
          return;
        }
      }

      if (selectedMode === 'none') {
        onApplyProtection('none', undefined);
        onClose();
        return;
      }

      let nextPasswordHash = storedPasswordHash;
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setError('Die eingegebenen Kennwörter stimmen nicht überein.');
          return;
        }
        nextPasswordHash = await hashProtectionPassword(newPassword);
      } else if (isLockedWithPassword && isLegacyProtectionHash(storedPasswordHash)) {
        // Successful unlock is enough proof to transparently migrate legacy verifiers.
        nextPasswordHash = await hashProtectionPassword(unlockPassword);
      }

      onApplyProtection(selectedMode, nextPasswordHash);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dokumentschutz konnte nicht angewendet werden.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Shield className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-100">Dokumentschutz einrichten</h3>
          </div>
          <button aria-label="Close Dokumentschutz einrichten dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unlock Prompt if Locked */}
        {isLockedWithPassword && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-rose-300 text-xs font-semibold">
              <Lock className="w-4 h-4" />
              <span>Dokument ist kennwortgeschützt</span>
            </div>
            <p className="text-[0.6875rem] text-slate-400">
              Geben Sie das aktuelle Kennwort ein, um den Schutz zu ändern oder aufzuheben:
            </p>
            <input
              type="password"
              placeholder="Aktuelles Kennwort"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus:border-rose-500 font-mono"
            />
          </div>
        )}

        {/* Protection Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Schutz-Einschränkung</label>
          <div className="space-y-1.5">
            {[
              {
                id: 'none' as const,
                title: 'Ungeschützt (Vollzugriff)',
                desc: 'Alle Bearbeitungen und Formatierungen sind uneingeschränkt erlaubt.',
              },
              {
                id: 'review' as const,
                title: 'Review (Änderungen nachverfolgen)',
                desc: 'Bearbeiten bleibt erlaubt, aber jede Änderung wird zwingend als Revision protokolliert; Accept/Reject und Abschalten des Trackings bleiben gesperrt.',
              },
              {
                id: 'read_only' as const,
                title: 'Schreibgeschützt (Read-Only)',
                desc: 'Text, Formatierungen und Objekte können nicht verändert werden.',
              },
              {
                id: 'comments_only' as const,
                title: 'Nur Kommentare (Track Comments)',
                desc: 'Texte können nicht editiert werden; nur Kommentare hinzufügen ist erlaubt.',
              },
              {
                id: 'form_filling' as const,
                title: 'Formularausfüllung',
                desc: 'Nur das Ausfüllen von Formularfeldern ist gestattet.',
              },
            ].map((option) => (
              <label
                key={option.id}
                className={`p-2.5 rounded-xl border flex items-start space-x-2.5 cursor-pointer transition-all ${
                  selectedMode === option.id
                    ? 'bg-blue-600/15 border-blue-500/50 text-blue-200'
                    : 'bg-slate-950/60 border-white/5 text-slate-400 hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name="protectionMode"
                  value={option.id}
                  checked={selectedMode === option.id}
                  onChange={() => setSelectedMode(option.id)}
                  className="mt-0.5 text-blue-600 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs block text-slate-200">{option.title}</span>
                  <span className="text-[0.6875rem] text-slate-400 block mt-0.5 leading-snug">
                    {option.desc}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Password Setup (Optional) */}
        {selectedMode !== 'none' && (
          <div className="p-3 bg-slate-950/70 border border-white/10 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-300 block">
              Kennwort zum Aufheben des Schutzes (Optional)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                placeholder="Kennwort"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono"
              />
              <input
                type="password"
                placeholder="Bestätigen"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={isApplying}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center space-x-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isApplying ? 'Wird angewendet…' : 'Dokumentschutz anwenden'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
