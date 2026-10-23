// STATUS: PLATIN — BATCH-CONNECT-7: the visible notification surface.
//
// The requirement is "angemessen anzeigen, nicht als Dauer-Popup": this tray is the only place a
// notification is shown, it is bounded, and quiet-hour entries are listed as *held back* rather than
// popping up. The verbatim machine `code` is always rendered, so nothing is paraphrased into a claim.

import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import type { ConnectNotification } from '../domain/types';
import { useConnectExtraCopy } from '../locale/connectLocaleExtra';

export interface ConnectNotificationTrayProps {
  tray: readonly ConnectNotification[];
  onClose: () => void;
  onMarkAllRead?: () => void;
}

export const ConnectNotificationTray: React.FC<ConnectNotificationTrayProps> = ({ tray, onClose, onMarkAllRead }) => {
  const extra = useConnectExtraCopy();
  const visible = tray.slice(-50).reverse();
  const suppressed = tray.filter(entry => !entry.readAt && entry.suppressed).length;

  return (
    <aside
      data-connect-notification-tray="true"
      data-connect-notification-suppressed={suppressed}
      aria-label={extra.notifications}
      className="absolute right-0 top-0 z-30 h-full w-80 border-l border-purple-500/20 bg-[#0a0715] p-3 text-xs text-slate-200 overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
        <h3 className="flex items-center gap-2 font-bold text-purple-200">
          {suppressed > 0 ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
          {extra.notifications}
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" data-connect-notification-mark-all="true" onClick={onMarkAllRead} className="px-2 py-1 rounded border border-purple-500/30 text-slate-300">
            {extra.markAllRead}
          </button>
          <button type="button" onClick={onClose} className="px-2 py-1 rounded text-slate-400 hover:text-slate-200">{extra.close}</button>
        </div>
      </div>

      {suppressed > 0 && (
        <p data-connect-quiet-notice="true" className="mt-2 rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[0.625rem] text-amber-200">
          {extra.notificationsSuppressed(suppressed)}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 text-slate-500">{extra.notificationsEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {visible.map(entry => (
            <li key={entry.id} data-connect-notification={entry.code} data-connect-notification-suppressed={entry.suppressed ? 'true' : 'false'} className="rounded border border-purple-500/20 bg-[#0e0a1b] px-2 py-1.5">
              {/* The machine code is shown verbatim; the tray invents no wording. */}
              <div className="font-mono text-[0.625rem] text-slate-300">{entry.code}</div>
              <div className="text-[0.625rem] text-slate-500">{entry.kind} · {new Date(entry.createdAt).toLocaleString()}</div>
              {entry.suppressed && <div className="text-[0.625rem] text-amber-300">{extra.notificationsSuppressed(1)}</div>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};
