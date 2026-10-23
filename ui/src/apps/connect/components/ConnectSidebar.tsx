// STATUS: DIAMANT VGT SUPREME — Astraea Connect Navigation Sidebar
import React from 'react';
import { Mail, Calendar, Users, Inbox, Send, FileText, Archive, Shield, Plus, Clock, Settings, RefreshCw, FolderPlus, Bell, AlertTriangle, Trash2 } from 'lucide-react';
import type { ConnectDocumentModel } from '../domain/types';
import { CONNECT_QUEUE_FOLDER, countPendingMessages } from '../domain/connectMailboxView';
import { listFolders, unreadCount } from '../domain/connectMailboxCore';
import { connectExtraCopy, connectionStatusText, type ConnectExtraCopy } from '../locale/connectLocaleExtra';
import { useConnectCopy } from '../locale/connectLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';

interface ConnectSidebarProps {
  model: ConnectDocumentModel;
  onUpdateModel: (updater: (prev: ConnectDocumentModel) => ConnectDocumentModel) => void;
  onOpenCompose: () => void;
  /** Opens the account/TLS settings surface. */
  onOpenAccount?: () => void;
  /** Starts a sync attempt. Never called when no transport is connected. */
  onSync?: () => void;
  onOpenFolderManager?: () => void;
  onOpenNotifications?: () => void;
}

export const ConnectSidebar: React.FC<ConnectSidebarProps> = ({
  model,
  onUpdateModel,
  onOpenCompose,
  onOpenAccount,
  onSync,
  onOpenFolderManager,
  onOpenNotifications,
}) => {
  const copy = useConnectCopy();
  const { locale } = useWorkspaceLocale();
  const extra: ConnectExtraCopy = connectExtraCopy(locale);
  const { viewMode, selectedFolder, messages } = model;

  const inboxUnread = unreadCount(messages, 'inbox');
  const vaultCount = messages.filter(m => m.folder === 'vault').length;
  const pendingCount = countPendingMessages(messages);
  const connection = model.connection;
  // MEASURED (BATCH-CONNECT-7): the footer used to render a hardcoded green dot plus
  // `engineer@example.test`, i.e. a permanent "connected" claim with nothing behind it. The dot class
  // and the address are now derived from the real connection state and the configured accounts.
  const isConnected = connection?.status === 'connected';
  const account = model.accounts?.[0];
  const statusText = connectionStatusText(extra, connection);
  const folders = listFolders(account?.id ?? 'connect-ui-local', model.labels ?? []);
  const notifications = (model.notifications ?? []).filter(entry => !entry.readAt);
  const suppressed = notifications.filter(entry => entry.suppressed).length;

  return (
    <div className="w-56 border-r border-purple-500/20 bg-[#0a0715] flex flex-col justify-between select-none">
      {/* Top Section */}
      <div className="min-h-0 overflow-y-auto">
        {/* Mode Switcher */}
        <div className="p-3 border-b border-purple-500/20">
          <button
            onClick={onOpenCompose}
            data-vgt-app-guide-anchor="Connect:first"
            className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{copy.compose}</span>
          </button>

          <div className="grid grid-cols-3 gap-1 mt-3 p-1 rounded-lg bg-purple-950/40 border border-purple-500/20">
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, viewMode: 'mail' }))}
              className={`py-1 rounded flex items-center justify-center transition-colors ${
                viewMode === 'mail' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={copy.mail} aria-label={copy.mail}
            >
              <Mail className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, viewMode: 'calendar' }))}
              className={`py-1 rounded flex items-center justify-center transition-colors ${
                viewMode === 'calendar' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={copy.calendar} aria-label={copy.calendar}
            >
              <Calendar className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, viewMode: 'contacts' }))}
              className={`py-1 rounded flex items-center justify-center transition-colors ${
                viewMode === 'contacts' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={copy.contacts} aria-label={copy.contacts}
            >
              <Users className="w-4 h-4" />
            </button>
          </div>

          {/* Account / sync / notifications: the three entries that were unreachable before. */}
          <div className="grid grid-cols-3 gap-1 mt-2">
            <button
              type="button"
              data-connect-account-entry="true"
              onClick={onOpenAccount}
              aria-label={extra.accountSettings}
              title={extra.accountSettings}
              className="py-1 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 border border-purple-500/20"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-connect-sync-entry="true"
              onClick={onSync}
              aria-label={extra.syncNow}
              title={extra.syncNow}
              className="py-1 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 border border-purple-500/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-connect-notification-entry="true"
              onClick={onOpenNotifications}
              aria-label={extra.notifications}
              title={extra.notifications}
              className="py-1 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 border border-purple-500/20"
            >
              <Bell className="w-3.5 h-3.5" />
              {notifications.length > 0 && (
                <span data-connect-notification-count={notifications.length} className="ml-0.5 font-mono text-[0.5625rem] text-amber-300">{notifications.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Mail Folders (when in mail mode) */}
        {viewMode === 'mail' && (
          <div className="p-2 space-y-0.5 text-xs font-medium">
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'inbox' }))}
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'inbox' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-purple-400" />
                {copy.inbox}
              </span>
              {inboxUnread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] bg-purple-600 text-white font-mono">
                  {inboxUnread}
                </span>
              )}
            </button>

            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'sent' }))}
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'sent' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" />
                {copy.sent}
              </span>
            </button>

            {/* Pending deliveries: queued drafts that no transport has carried yet. */}
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: CONNECT_QUEUE_FOLDER }))}
              data-connect-queue-view="true"
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === CONNECT_QUEUE_FOLDER ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                {copy.queuedMessage}
              </span>
              {pendingCount > 0 && (
                <span data-connect-pending-count={pendingCount} className="px-1.5 py-0.5 rounded-full text-[0.625rem] bg-amber-950 text-amber-300 border border-amber-500/40 font-mono">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'drafts' }))}
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'drafts' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                {copy.drafts}
              </span>
            </button>

            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'archive' }))}
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'archive' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-slate-400" />
                {copy.archive}
              </span>
            </button>

            {/* Junk and trash were in `defaultMailFolders` but had no UI at all. */}
            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'junk' }))}
              data-connect-folder="junk"
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'junk' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                {extra.folderJunk}
              </span>
              {unreadCount(messages, 'junk') > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] bg-amber-950 text-amber-300 font-mono">{unreadCount(messages, 'junk')}</span>
              )}
            </button>

            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'trash' }))}
              data-connect-folder="trash"
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'trash' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-slate-400" />
                {extra.folderTrash}
              </span>
            </button>

            <button
              onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: 'vault' }))}
              className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                selectedFolder === 'vault' ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                {copy.vault}
              </span>
              {vaultCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[0.625rem] bg-emerald-950 text-emerald-300 font-mono">
                  {vaultCount}
                </span>
              )}
            </button>

            {/* Custom IMAP folders (kind `custom`). */}
            {folders.filter(folder => folder.kind === 'custom').map(folder => (
              <button
                key={folder.id}
                data-connect-folder="custom"
                onClick={() => onUpdateModel(prev => ({ ...prev, selectedFolder: folder.name }))}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                  selectedFolder === folder.name ? 'bg-purple-900/40 text-purple-200 font-semibold' : 'text-slate-400 hover:bg-purple-950/30 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-purple-400" />
                  {folder.name}
                </span>
              </button>
            ))}

            <button
              type="button"
              data-connect-folder-manager="true"
              onClick={onOpenFolderManager}
              className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-slate-400 hover:bg-purple-950/30 hover:text-slate-200"
            >
              <FolderPlus className="w-4 h-4" />
              {extra.manageFolders}
            </button>
          </div>
        )}
      </div>

      {/* Account Info Footer: text and colour both come from the measured connection state. */}
      <div data-connect-connection-status={connection?.status ?? 'unknown'} className="p-3 border-t border-purple-500/20 text-[0.6875rem] text-slate-400 space-y-1">
        <div className="flex items-center gap-2">
          {/* States are distinguishable without colour: the glyph and the data attribute carry the
              same information as the dot colour (UI/UX requirement: never colour alone). */}
          <span
            aria-hidden="true"
            data-connect-connection-glyph={isConnected ? 'connected' : connection?.status === 'failed' ? 'failed' : connection?.status === 'connecting' ? 'connecting' : 'disconnected'}
            className={`w-4 shrink-0 text-center font-black ${isConnected ? 'text-emerald-400' : connection?.status === 'failed' ? 'text-rose-400' : 'text-slate-500'}`}
          >
            {isConnected ? '●' : connection?.status === 'failed' ? '×' : connection?.status === 'connecting' ? '◐' : '○'}
          </span>
          <span className="truncate font-mono">{account?.address ?? extra.accountEmpty.split('.')[0]}</span>
        </div>
        <div className="text-[0.625rem] text-slate-500">{statusText}</div>
        {connection?.adapter && <div className="text-[0.625rem] text-slate-500">{extra.statusAdapter(connection.adapter)}</div>}
        {connection?.checkedAt && <div className="text-[0.625rem] text-slate-500">{extra.statusCheckedAt(new Date(connection.checkedAt).toLocaleTimeString())}</div>}
        {suppressed > 0 && <div className="text-[0.625rem] text-amber-300">{extra.notificationsSuppressed(suppressed)}</div>}
      </div>
    </div>
  );
};

