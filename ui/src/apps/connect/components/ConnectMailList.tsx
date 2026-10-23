// STATUS: DIAMANT VGT SUPREME — Astraea Connect Message List
import React from 'react';
import { Search, Star, Lock, Paperclip, Clock } from 'lucide-react';
import type { ConnectDocumentModel } from '../domain/types';
import { filterLegacyMessages } from '../application/connectUiBridge';
import { mayRenderStoredClaim } from '../domain/connectClaims';
import { useConnectCopy } from '../locale/connectLocale';

interface ConnectMailListProps {
  model: ConnectDocumentModel;
  onUpdateModel: (updater: (prev: ConnectDocumentModel) => ConnectDocumentModel) => void;
}

export const ConnectMailList: React.FC<ConnectMailListProps> = ({
  model,
  onUpdateModel,
}) => {
  const copy = useConnectCopy();
  const { selectedFolder, selectedMessageId, searchQuery } = model;

  const filtered = filterLegacyMessages(model);

  const handleSelect = (id: string) => {
    onUpdateModel(prev => ({
      ...prev,
      selectedMessageId: id,
      messages: prev.messages.map(m => m.id === id ? { ...m, isUnread: false } : m)
    }));
  };

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateModel(prev => ({
      ...prev,
      messages: prev.messages.map(m => m.id === id ? { ...m, isStarred: !m.isStarred } : m)
    }));
  };

  return (
    <div className="w-80 border-r border-purple-500/20 bg-[#0c0817] flex flex-col select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-purple-500/20">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-purple-400" />
          <input
            type="text"
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchAccessible}
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateModel(prev => ({ ...prev, searchQuery: e.target.value }))}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#140e24] border border-purple-500/30 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      {/* Messages List */}
      {/* Runde 275: `role="listbox"` — die Zeilen darunter sind `role="option"`.
          Ohne diese Rolle waeren die Optionen fuer einen Screenreader
          zusammenhanglos, und die Auswahl (`aria-selected`) haette keinen Bezug. */}
      <div
        role="listbox"
        aria-label={copy.mail}
        className="flex-1 overflow-y-auto divide-y divide-purple-500/10"
      >
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {copy.noMessages(selectedFolder === 'inbox' ? copy.inbox : selectedFolder === 'sent' ? copy.sent : selectedFolder === 'drafts' ? copy.drafts : selectedFolder === 'archive' ? copy.archive : copy.vault)}
          </div>
        ) : (
          filtered.map(msg => {
            const isSelected = selectedMessageId === msg.id;
            return (
              <div
                key={msg.id}
                role="option"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => handleSelect(msg.id)}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  // GAP-0050, Runde 275: die Zeile war ein `<div>` mit `onClick`,
                  // `cursor-pointer` und SONST NICHTS — kein Tab erreichte sie,
                  // Enter und Leertaste loesten nichts aus. Fuer Nutzer, die
                  // nicht zeigen koennen, war die Nachrichtenliste damit
                  // unbedienbar, obwohl sie bedienbar AUSSIEHT.
                  //
                  // `preventDefault` bei der Leertaste ist noetig, weil der
                  // Browser sonst scrollt statt auszuwaehlen.
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(msg.id);
                  }
                }}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected 
                    ? 'bg-purple-900/40 border-l-2 border-purple-500' 
                    : msg.isUnread 
                    ? 'bg-purple-950/20 hover:bg-purple-950/40' 
                    : 'hover:bg-purple-950/15'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-semibold truncate ${msg.isUnread ? 'text-white' : 'text-slate-300'}`}>
                    {msg.sender}
                  </span>
                  <div className="flex items-center gap-1">
                    {/*
                      GAP-0057, Runde 295: hier stand `isQueuedDelivery(msg)` —
                      ein Feldvergleich. Der Zusage-Resolver leitet dieselbe
                      Antwort aus derselben Quelle ab (`message.delivery ===
                      'queued'` ergibt die Evidenz `local-queue-entry-created`,
                      und `proveClaim('queued')` verlangt genau sie), aber er
                      geht durch EINEN Pfad: aendert sich die Evidenzregel,
                      folgen alle Anzeigen.
                    */}
                    {mayRenderStoredClaim(msg, 'queued') && (
                      <span data-connect-delivery-state="queued" className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-950/40 px-1 py-0.5 text-[0.5625rem] font-black text-amber-200">
                        <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                        {copy.queuedMessage}
                      </span>
                    )}
                    {/*
                      GAP-0057, Runde 295: hier stand `msg.isEncrypted &&`.
                      Ein nacktes Feld entschied ueber ein Schloss mit dem Titel
                      "Ende-zu-Ende-verschluesselt", und jeder Schreiber des
                      Modells konnte dieses Feld setzen, ohne dass eine
                      Krypto-Operation stattfand. Jetzt entscheidet der
                      Zusage-Resolver des Moduls, und der verlangt die Evidenz
                      `webcrypto-ciphertext-created` — die in diesem Build keine
                      Operation erzeugt.
                    */}
                    {mayRenderStoredClaim(msg, 'encrypted') && (
                      <span title={copy.encryptedTitle}>
                        <Lock className="w-3 h-3 text-emerald-400" />
                      </span>
                    )}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <Paperclip className="w-3 h-3 text-slate-400" />
                    )}
                    <button 
                      onClick={(e: React.MouseEvent) => handleToggleStar(msg.id, e)}
                      aria-label={msg.isStarred ? copy.unstar : copy.star}
                      className="text-slate-500 hover:text-amber-400 ml-1"
                    >
                      <Star className={`w-3.5 h-3.5 ${msg.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className={`text-xs truncate mb-1 ${msg.isUnread ? 'font-medium text-purple-200' : 'text-slate-400'}`}>
                  {msg.subject}
                </div>

                <div className="text-[0.6875rem] text-slate-500 truncate line-clamp-1">
                  {msg.snippet}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
