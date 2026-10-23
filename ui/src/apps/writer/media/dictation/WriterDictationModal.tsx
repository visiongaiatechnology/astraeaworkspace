// STATUS: DIAMANT VGT SUPREME — Speech Dictation & Voice Commands Modal
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, X, Check } from 'lucide-react';
import {
  WriterDictationEngine,
  type DictationStatus,
  getWriterLocalTranscriptionProvider,
  transcribeWriterAudioLocally,
} from '../audio/dictation/writerDictation';

interface WriterDictationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTranscript: (text: string) => void;
  allowBrowserManagedSpeech?: boolean;
}

export const WriterDictationModal: React.FC<WriterDictationModalProps> = ({
  isOpen,
  onClose,
  onInsertTranscript,
  allowBrowserManagedSpeech = false,
}) => {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('de-DE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const engineRef = useRef<WriterDictationEngine | null>(null);
  const localProvider = getWriterLocalTranscriptionProvider();

  useEffect(() => {
    if (isOpen && allowBrowserManagedSpeech && !engineRef.current) {
      const engine = new WriterDictationEngine({ language: lang });
      engine.onStatusChange((newStatus, err) => {
        setStatus(newStatus);
        if (err) setErrorMessage(err);
      });
      engine.onResult((res) => {
        if (res.transcript) {
          setTranscript((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
        }
        setInterim(res.interim);
      });
      engineRef.current = engine;
      setStatus(engine.getStatus());
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, [isOpen, lang, allowBrowserManagedSpeech]);

  if (!isOpen) return null;

  const handleToggleRecord = () => {
    if (!allowBrowserManagedSpeech) {
      setErrorMessage('Browserverwaltetes Live-Diktat benötigt die explizite Network-Capability FullUserApproved.');
      return;
    }
    if (status === 'listening') {
      engineRef.current?.stop();
    } else {
      setErrorMessage(null);
      engineRef.current?.setLanguage(lang);
      engineRef.current?.start();
    }
  };

  const handleClear = () => {
    setTranscript('');
    setInterim('');
  };

  const handleLocalTranscription = async () => {
    if (!localFile || !localProvider || localBusy) return;
    setLocalBusy(true);
    setErrorMessage(null);
    try {
      const localTranscript = await transcribeWriterAudioLocally(localFile, lang, localProvider);
      setTranscript((previous) => previous ? `${previous}
${localTranscript}` : localTranscript);
      setInterim('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lokale Transkription fehlgeschlagen.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleInsert = () => {
    if (transcript.trim()) {
      onInsertTranscript(transcript.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-rose-400">
            <Mic className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">Sprachdiktat & Voice Command Engine</h3>
          </div>
          <button aria-label="Close Sprachdiktat & Voice Command Engine dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status indicator banner */}
        <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-white/5">
          <div className="flex items-center space-x-3">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                status === 'listening'
                  ? 'bg-rose-500 animate-ping'
                  : status === 'error'
                  ? 'bg-amber-500'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-semibold">
              {status === 'listening'
                ? 'Mikrofon aktiv — Aufnahme läuft...'
                : status === 'error'
                ? 'Aufnahmefehler'
                : 'Bereit zur Spracheingabe'}
            </span>
          </div>

          <select
            value={lang}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLang(e.target.value)}
            disabled={status === 'listening'}
            className="bg-slate-900 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          >
            <option value="de-DE">Deutsch (DE)</option>
            <option value="en-US">English (US)</option>
          </select>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        <div className="p-3 bg-amber-500/10 border border-amber-400/25 rounded-xl text-amber-200 text-[0.6875rem] leading-relaxed">
          Live-Diktat nutzt die Browser/Betriebssystem-Speech-API und kann anbieterseitig remote erfolgen. Deshalb bleibt es gesperrt, bis NetGate/Workspace die explizite Capability FullUserApproved gesetzt hat. Astraea fällt niemals automatisch auf diesen Pfad zurück.
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-[0.6875rem]">
            <span className="font-semibold text-emerald-200">Lokale Audio-Transkription</span>
            <span className="text-slate-400">{localProvider ? localProvider.label : 'Kein lokaler STT-Provider registriert'}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" disabled={!localProvider || localBusy} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLocalFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.625rem] disabled:opacity-50" />
            <button type="button" disabled={!localProvider || !localFile || localBusy} onClick={() => void handleLocalTranscription()} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[0.625rem] font-semibold text-white disabled:opacity-40">{localBusy ? 'Transkribiere…' : 'Lokal transkribieren'}</button>
          </div>
          <p className="text-[0.625rem] text-slate-500">Lokale Provider werden explizit als In-Process/Native-Adapter registriert. Ohne Provider gibt es keinen Netzwerk-Fallback.</p>
        </div>

        {/* Editable transcript: supports local provider output, OS dictation, and manual correction. */}
        <div className="p-3 bg-slate-950 border border-white/10 rounded-xl space-y-2">
          <textarea value={transcript} maxLength={200000} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setTranscript(event.target.value)} placeholder="Lokales Transkript, Systemdiktat oder manuelle Korrektur…" className="min-h-[130px] max-h-[220px] w-full resize-y bg-transparent text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70" />
          {interim && <p className="text-[0.6875rem] text-blue-400 italic">Live: {interim}</p>}
        </div>

        {/* Voice Command Hints */}
        <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-1 text-[0.6875rem] text-slate-400">
          <span className="font-semibold text-slate-300">Unterstützte Sprachbefehle:</span>
          <div className="grid grid-cols-2 gap-1 pt-1 font-mono text-[0.625rem]">
            <span>"Punkt" &rarr; .</span>
            <span>"Komma" &rarr; ,</span>
            <span>"Ausrufezeichen" &rarr; !</span>
            <span>"Fragezeichen" &rarr; ?</span>
            <span>"Neue Zeile" &rarr; Zeilenumbruch</span>
            <span>"Neuer Absatz" &rarr; Neuer Absatz</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleToggleRecord}
            disabled={!allowBrowserManagedSpeech}
            title={allowBrowserManagedSpeech ? 'Browserverwaltetes Live-Diktat starten' : 'Erfordert FullUserApproved Network-Capability'}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${
              status === 'listening'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {status === 'listening' ? (
              <>
                <Square className="w-4 h-4 fill-white" />
                <span>Aufnahme stoppen</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Aufnahme starten</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={!transcript}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
            >
              Leeren
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!transcript.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>In Dokument einfügen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
