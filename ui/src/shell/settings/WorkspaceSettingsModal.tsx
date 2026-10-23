// STATUS: GOLD — responsive, keyboard-managed global Workspace settings.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, LockKeyhole, Plus, Save, Trash2, X } from 'lucide-react';
import './WorkspaceSettingsThemes.css';
import { browserShellStorage, type ShellAppearancePreference, type ShellShortcutCommand, type ShellShortcutMap } from '../platform/workspaceShellPlatform';
import { useWorkspaceLocale, workspaceText, type WorkspaceChromeMessage } from '../localization/workspaceLocale';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { buildConnectMailAccount, connectAccountCredentialHandle, connectAccountEndpoint, ConnectSettingsError } from './connectSettingsCore';
import { draftFromAccount, EMPTY_MAIL_PROFILE_DRAFT as EMPTY_DRAFT, type MailProfileDraft } from './connectSettingsDraft';
import type { ConnectAccount } from '../../platform/connectors/connectCoreTypes';
import {
  createWorkspaceSettingsBindingFacade,
  WORKSPACE_SETTINGS_BINDING_IDS,
  WORKSPACE_SETTINGS_BINDINGS,
  WORKSPACE_SETTINGS_SECTIONS,
  workspaceShortcutBindingId,
  type WorkspaceSettingsSectionId,
} from './workspaceSettingsBindings';
import { subscribeToStartSidebarPreference } from '../start-center/navigation/startSidebarPreference';
import { WorkspaceSettingsAppearanceSection } from './WorkspaceSettingsAppearanceSection';
import { APP_GUIDE_INTERFACE_COPY } from '../onboarding/appGuideCatalog';
import { SupportOptions } from '../support/SupportOptions';

const SHORTCUT_MESSAGES: Record<ShellShortcutCommand, WorkspaceChromeMessage> = {
  'command-palette': 'settings.shortcutCommandPalette',
  save: 'settings.shortcutSave',
  'quick-add-task': 'settings.shortcutQuickAddTask',
  'start-center': 'settings.shortcutStartCenter',
  'workspace-explorer': 'settings.shortcutExplorer',
  'new-window': 'settings.shortcutNewWindow',
};

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  initialSection?: WorkspaceSettingsSectionId;
  onClose: () => void;
  appearance: ShellAppearancePreference;
  shortcuts: ShellShortcutMap;
  onAppearanceChange: (next: ShellAppearancePreference) => void;
  onShortcutChange: (command: ShellShortcutCommand, binding: string) => void;
  showToast?: (message: string) => void;
  onOpenSetup?: () => void;
}

function credentialIsStored(account: ConnectAccount, hasCredential: (handle: string) => boolean): boolean {
  const handle = connectAccountCredentialHandle(account);
  if (!handle) return false;
  try { return hasCredential(handle); }
  catch { return false; }
}

function accountHasStoredCredential(accounts: readonly ConnectAccount[], id: string | null, hasCredential: (handle: string) => boolean): boolean {
  const account = accounts.find((candidate) => candidate.id === id);
  return account ? credentialIsStored(account, hasCredential) : false;
}

export const WorkspaceSettingsModal: React.FC<WorkspaceSettingsModalProps> = ({
  isOpen,
  initialSection = 'appearance',
  onClose,
  appearance,
  shortcuts,
  onAppearanceChange,
  onShortcutChange,
  showToast,
  onOpenSetup,
}) => {
  const { locale, preference: localePreference, setPreference: setLocalePreference } = useWorkspaceLocale();
  const storage = useMemo(() => browserShellStorage(), []);
  const bindings = useMemo(() => createWorkspaceSettingsBindingFacade({
    storage,
    onAppearanceChange,
    onLocalePreferenceChange: setLocalePreference,
    onShortcutChange,
  }), [onAppearanceChange, onShortcutChange, setLocalePreference, storage]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const t = useCallback((key: WorkspaceChromeMessage) => workspaceText(key, locale), [locale]);
  const [section, setSection] = useState<WorkspaceSettingsSectionId>(initialSection);
  const [accounts, setAccounts] = useState<ConnectAccount[]>([]);
  const [storeError, setStoreError] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isKeyVaultLoading, setIsKeyVaultLoading] = useState(true);
  const [keyVaultReady, setKeyVaultReady] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MailProfileDraft>(EMPTY_DRAFT);
  const [password, setPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [shortcutDrafts, setShortcutDrafts] = useState<ShellShortcutMap>(shortcuts);
  const [startSidebarCollapsed, setStartSidebarCollapsedState] = useState(() => bindings.general.loadStartSidebarPreference().collapsed);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => setShortcutDrafts(shortcuts), [shortcuts]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setStartSidebarCollapsedState(bindings.general.loadStartSidebarPreference().collapsed);
    return subscribeToStartSidebarPreference(storage, (preference) => {
      setStartSidebarCollapsedState(preference.collapsed);
    });
  }, [bindings.general, isOpen, storage]);

  useEffect(() => {
    if (!isOpen || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const synchronize = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(query.matches);
    query.addEventListener('change', synchronize);
    return () => query.removeEventListener('change', synchronize);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setEditingAccountId(null);
      setPendingDeleteId(null);
      return undefined;
    }
    setStatusMessage('');
    setIsKeyVaultLoading(true);
    setStoreError(false);
    try { setAccounts(bindings.connect.loadMailProfiles()); }
    catch { setAccounts([]); setStoreError(true); }

    let mounted = true;
    void bindings.connect.checkKeyVault().then((result) => {
      if (mounted) setKeyVaultReady(result.ready);
    }).catch(() => {
      if (mounted) setKeyVaultReady(false);
    }).finally(() => {
      if (mounted) setIsKeyVaultLoading(false);
    });

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      mounted = false;
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [bindings.connect, isOpen, storage]);

  const close = () => {
    setPassword('');
    setEditingAccountId(null);
    setPendingDeleteId(null);
    onClose();
  };

  const beginAddAccount = () => {
    setEditingAccountId('new');
    setDraft(EMPTY_DRAFT);
    setPassword('');
    setPendingDeleteId(null);
    setStatusMessage('');
  };

  const beginEditAccount = (account: ConnectAccount) => {
    setEditingAccountId(account.id);
    setDraft(draftFromAccount(account));
    setPassword('');
    setPendingDeleteId(null);
    setStatusMessage('');
  };

  const updateDraft = (field: keyof MailProfileDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingProfile || storeError) return;
    setIsSavingProfile(true);
    setStatusMessage('');
    let newlyStoredHandle: string | undefined;
    try {
      const previous = editingAccountId && editingAccountId !== 'new' ? accounts.find((account) => account.id === editingAccountId) : undefined;
      const previousHandle = connectAccountCredentialHandle(previous);
      if (password) {
        if (!keyVaultReady) throw new Error('connect-keyvault-locked-or-offline');
        newlyStoredHandle = await bindings.connect.storeCredential(password);
      }
      const account = buildConnectMailAccount({
        ...draft,
        imapPort: Number(draft.imapPort),
        smtpPort: Number(draft.smtpPort),
        credentialHandle: newlyStoredHandle ?? previousHandle,
      }, previous);
      const next = [...accounts.filter((candidate) => candidate.id !== account.id), account];
      const saved = bindings.connect.saveMailProfiles(next);
      setAccounts(saved);
      setEditingAccountId(null);
      setPendingDeleteId(null);
      setPassword('');
      setDraft(EMPTY_DRAFT);

      if (previousHandle && previousHandle !== newlyStoredHandle && !saved.some((candidate) => candidate.adapters.some((adapter) => adapter.credentialHandle === previousHandle))) {
        try { bindings.connect.deleteCredential(previousHandle); }
        catch {
            const cleanupMessage = t('settings.credentialCleanupAfterSave');
          setStatusMessage(t('settings.profileSaved') + cleanupMessage);
          return;
        }
      }

      setStatusMessage(t('settings.profileSaved'));
      showToast?.(t('settings.profileSaved'));
    } catch (error) {
      if (newlyStoredHandle) {
        try { bindings.connect.deleteCredential(newlyStoredHandle); }
        catch { setStatusMessage(t('settings.keyVaultError')); setIsSavingProfile(false); return; }
      }
      if (error instanceof ConnectSettingsError && error.code.startsWith('profile-store')) setStatusMessage(t('settings.storageError'));
      else if (error instanceof Error && error.message.startsWith('connect-keyvault')) setStatusMessage(t('settings.keyVaultError'));
      else setStatusMessage(t('settings.accountError'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const removeAccount = (account: ConnectAccount) => {
    try {
      const handle = connectAccountCredentialHandle(account);
      const next = accounts.filter((candidate) => candidate.id !== account.id);
      const saved = bindings.connect.saveMailProfiles(next);
      setAccounts(saved);
      setPendingDeleteId(null);
      setEditingAccountId(null);
      if (handle && !saved.some((candidate) => candidate.adapters.some((adapter) => adapter.credentialHandle === handle))) {
        try { bindings.connect.deleteCredential(handle); }
        catch {
            const cleanupMessage = t('settings.credentialCleanupAfterRemove');
          setStatusMessage(t('settings.profileRemoved') + cleanupMessage);
          return;
        }
      }
      setStatusMessage(t('settings.profileRemoved'));
      showToast?.(t('settings.profileRemoved'));
    } catch {
      setStatusMessage(t('settings.storageError'));
    }
  };

  const applyLocalePreference = (value: string) => {
    try { bindings.language.apply(value); setStatusMessage(''); }
    catch { setStatusMessage(t('settings.storageError')); }
  };

  const applyStartSidebarPreference = () => {
    try {
      const next = bindings.general.setStartSidebarCollapsed(!startSidebarCollapsed);
      setStartSidebarCollapsedState(next.collapsed);
      setStatusMessage('');
    } catch {
      setStatusMessage(t('settings.storageError'));
    }
  };

  if (!isOpen) return null;

  const activeLabel = WORKSPACE_SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? 'settings.general';

  return (
    <div className="workspace-settings-overlay fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-5" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-settings-title"
        aria-describedby="workspace-settings-subtitle"
        tabIndex={-1}
        className="workspace-settings-dialog flex h-[min(820px,calc(100dvh-1rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border text-slate-100 shadow-[0_32px_100px_rgba(0,0,0,.35)] outline-none sm:h-[min(820px,calc(100dvh-2.5rem))] sm:flex-row"
      >
        <aside className="workspace-settings-sidebar flex w-full shrink-0 flex-col border-b sm:w-60 sm:border-b-0 sm:border-r" aria-label={t('settings.title')}>
          <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <AstraeaAppIcon kind="Workspace" alt="Official Astraea Workspace logo" className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <h2 id="workspace-settings-title" className="truncate text-sm font-semibold tracking-wide">{t('settings.title')}</h2>
              <p id="workspace-settings-subtitle" className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{t('settings.subtitle')}</p>
            </div>
            <button type="button" onClick={close} aria-label={t('settings.close')} title={t('settings.close')} data-vgt-initial-focus="true" className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 sm:hidden">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:thin] sm:flex-1 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:px-3 sm:py-3" aria-label={t('settings.title')}>
            {WORKSPACE_SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => { setSection(id); setPassword(''); setStatusMessage(''); }} className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 sm:w-full ${section === id ? 'bg-purple-500/15 text-purple-100 ring-1 ring-inset ring-purple-400/25' : 'text-slate-400 hover:bg-white/[.04] hover:text-slate-100'}`}>
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${section === id ? 'text-purple-300' : 'text-slate-500'}`} />
                <span className="whitespace-nowrap">{t(label)}</span>
                {section === id && <ChevronRight aria-hidden="true" className="ml-auto hidden h-3.5 w-3.5 sm:block" />}
              </button>
            ))}
          </nav>
          {onOpenSetup && (
            <div className="border-t border-purple-400/10 p-2">
              <button
                type="button"
                onClick={() => { close(); onOpenSetup(); }}
                className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/[.04] hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
              >
                {APP_GUIDE_INTERFACE_COPY[locale].openSetup}
              </button>
            </div>
          )}
          <div className="hidden border-t border-purple-400/10 px-5 py-3 text-[9px] font-mono text-slate-600 sm:block">ASTRAEA WORKSPACE · {t('settings.title')}</div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-purple-400/10 px-4 sm:px-6">
            <div className="min-w-0">
              <h3 id="workspace-settings-section-title" className="truncate text-xs font-semibold text-slate-100">{t(activeLabel)}</h3>
              <p className="hidden text-[10px] text-slate-500 sm:block">
                {section === 'general' ? t('settings.generalDescription') : section === 'appearance' ? t('settings.appearanceDescription') : section === 'language' ? t('settings.languageDescription') : section === 'connect' ? t('settings.connectDescription') : section === 'support' ? t('settings.supportDescription') : t('settings.shortcutsDescription')}
              </p>
            </div>
            <button type="button" onClick={close} aria-label={t('settings.close')} title={t('settings.close')} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 sm:flex">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-color:rgba(167,139,250,.8)_rgba(10,8,20,.8)] [scrollbar-width:thin] sm:px-6 sm:py-6" data-settings-control-region={section}>
            {section === 'general' && (
              <div className="mx-auto max-w-3xl">
                <section className="flex flex-col gap-4 border-b border-white/[.08] pb-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="workspace-start-sidebar-label">
                  <div className="min-w-0">
                    <h4 id="workspace-start-sidebar-label" className="text-xs font-semibold text-slate-100">{t('settings.startCenterSidebar')}</h4>
                    <p id="workspace-start-sidebar-description" className="mt-1 max-w-xl text-[10px] leading-relaxed text-slate-400">{t('settings.startCenterSidebarDescription')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="min-w-20 text-right text-[10px] text-slate-400" aria-live="polite">{startSidebarCollapsed ? t('settings.collapsed') : t('settings.expanded')}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={startSidebarCollapsed}
                      aria-labelledby="workspace-start-sidebar-label"
                      aria-describedby="workspace-start-sidebar-description"
                      data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.startCenterSidebarCollapsed}
                      onClick={applyStartSidebarPreference}
                      className={`relative flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 focus-visible:outline-offset-2 ${startSidebarCollapsed ? 'border-purple-300/50 bg-purple-500/35' : 'border-white/15 bg-white/[.06]'}`}
                    >
                      <span aria-hidden="true" className={`block h-5 w-5 rounded-full border border-white/20 bg-gradient-to-b from-slate-100 to-slate-300 shadow-[0_1px_5px_rgba(0,0,0,.35)] transition-transform ${startSidebarCollapsed ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </section>
              </div>
            )}

            {section === 'appearance' && (
              <WorkspaceSettingsAppearanceSection
                appearance={appearance}
                systemPrefersDark={systemPrefersDark}
                translate={t}
                onAppearanceChange={(next) => bindings.appearance.apply(next)}
              />
            )}

            {section === 'language' && (
              <div className="mx-auto max-w-2xl space-y-5">
                <div className="rounded-xl border border-purple-400/15 bg-purple-400/[.04] p-4">
                  <label htmlFor="workspace-language" className="block text-[11px] font-medium text-slate-200">{t('settings.interfaceLanguage')}</label>
                  <select id="workspace-language" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.language} value={localePreference} onChange={(event) => applyLocalePreference(event.currentTarget.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 sm:max-w-sm">
                    <option value="system">{t('settings.systemLanguage')}</option>
                    <option value="de-DE">{t('settings.german')}</option>
                    <option value="en-US">{t('settings.english')}</option>
                    <option value="ru-RU">{t('settings.russian')}</option>
                    <option value="it-IT">{t('settings.italian')}</option>
                    <option value="es-ES">{t('settings.spanish')}</option>
                    <option value="ja-JP">{t('settings.japanese')}</option>
                    <option value="zh-CN">{t('settings.chinese')}</option>
                  </select>
                  <p className="mt-3 max-w-xl text-[10px] leading-relaxed text-slate-400">{t('settings.localeScope')}</p>
                </div>
              </div>
            )}

            {section === 'shortcuts' && (
              <div className="mx-auto max-w-2xl space-y-3">
                {(Object.keys(shortcutDrafts) as ShellShortcutCommand[]).map((command) => (
                  <div key={command} className="flex flex-wrap items-center gap-3 border-b border-white/[.06] py-3 sm:flex-nowrap">
                    <label htmlFor={`workspace-shortcut-${command}`} className="min-w-0 flex-1 text-[11px] text-slate-300">{t(SHORTCUT_MESSAGES[command])}</label>
                    <input id={`workspace-shortcut-${command}`} data-setting-binding={workspaceShortcutBindingId(command)} value={shortcutDrafts[command]} onChange={(event) => { const value = event.currentTarget.value; setShortcutDrafts((previous) => ({ ...previous, [command]: value })); }} className="w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2 font-mono text-[11px] text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 sm:max-w-52" />
                    <button type="button" data-setting-binding={workspaceShortcutBindingId(command)} onClick={() => bindings.shortcuts.apply(command, shortcutDrafts[command])} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-purple-400/20 px-3 text-[10px] text-purple-200 transition-colors hover:bg-purple-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t('settings.apply')}</button>
                  </div>
                ))}
              </div>
            )}

            {section === 'connect' && (
              <div className="mx-auto max-w-3xl space-y-5">
                <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[10px] leading-relaxed ${keyVaultReady ? 'border-emerald-400/20 bg-emerald-400/[.05] text-emerald-200' : 'border-amber-400/20 bg-amber-400/[.04] text-amber-100'}`} id="connect-keyvault-status" role="status" aria-live="polite">
                  {keyVaultReady ? <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{isKeyVaultLoading ? t('settings.keyVaultLoading') : keyVaultReady ? t('settings.keyVaultReady') : t('settings.keyVaultUnavailable')}</span>
                </div>

                {storeError && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[.05] px-3 py-2 text-[10px] text-rose-200">{t('settings.storageError')}</p>}
                {!storeError && accounts.length === 0 && !editingAccountId && <p className="border-l-2 border-purple-400/35 py-1 pl-3 text-[11px] leading-relaxed text-slate-400">{t('settings.noAccounts')}</p>}

                {!storeError && !editingAccountId && (
                  <>
                    {accounts.map((account) => {
                      const smtp = connectAccountEndpoint(account, 'smtp');
                      const handle = connectAccountCredentialHandle(account);
                      const identity = account.identities.find((item) => item.id === account.defaultIdentityId) ?? account.identities[0];
                      const confirmDelete = pendingDeleteId === account.id;
                      return (
                        <article key={account.id} className="flex flex-col gap-3 border-b border-white/[.07] py-4 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-xs font-medium text-slate-100">{account.name}</h4>
                            <p className="mt-1 truncate text-[10px] text-slate-400">{identity?.address ?? ''} · SMTP {smtp?.host ?? '—'}:{smtp?.port ?? '—'}</p>
                            <p className="mt-1 text-[9px] text-slate-500">{handle && credentialIsStored(account, bindings.connect.hasCredential) ? t('settings.passwordStored') : t('settings.passwordNotStored')} · {t('settings.notConnected')}</p>
                          </div>
                          {confirmDelete ? (
                            <div className="flex flex-wrap items-center gap-2 sm:max-w-64">
                              <span className="w-full text-[9px] text-amber-200">{t('settings.profileDeleteConfirm')}</span>
                              <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={() => removeAccount(account)} className="min-h-9 rounded-lg border border-rose-400/25 px-3 text-[10px] text-rose-200 hover:bg-rose-500/10">{t('settings.confirmRemove')}</button>
                              <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={() => setPendingDeleteId(null)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] text-slate-300 hover:bg-white/5">{t('settings.cancel')}</button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 gap-2">
                              <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={() => beginEditAccount(account)} className="min-h-9 rounded-lg border border-purple-400/20 px-3 text-[10px] text-purple-200 hover:bg-purple-500/10">{t('settings.editAccount')}</button>
                              <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={() => setPendingDeleteId(account.id)} aria-label={`${t('settings.removeAccount')} ${account.name}`} className="flex min-h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-400/30 hover:text-rose-200"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={beginAddAccount} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-purple-400/25 bg-purple-500/[.08] px-3.5 text-[11px] font-medium text-purple-100 transition-colors hover:bg-purple-500/[.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"><Plus aria-hidden="true" className="h-4 w-4" />{t('settings.addAccount')}</button>
                  </>
                )}

                {!storeError && editingAccountId && (
                  <form onSubmit={(event) => { void saveProfile(event); }} className="space-y-5" aria-labelledby="connect-profile-form-title" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id}>
                    <div className="flex items-center justify-between gap-3">
                      <h4 id="connect-profile-form-title" className="text-xs font-semibold text-slate-100">{editingAccountId === 'new' ? t('settings.addAccount') : t('settings.editAccount')}</h4>
                      <button type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} onClick={() => { setEditingAccountId(null); setPassword(''); setStatusMessage(''); }} className="min-h-9 rounded-lg px-3 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white">{t('settings.cancel')}</button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-[10px] text-slate-400">{t('settings.accountName')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} maxLength={128} value={draft.accountName} onChange={(event) => updateDraft('accountName', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                      <label className="text-[10px] text-slate-400">{t('settings.displayName')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} maxLength={128} autoComplete="name" value={draft.displayName} onChange={(event) => updateDraft('displayName', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                      <label className="text-[10px] text-slate-400">{t('settings.emailAddress')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} type="email" maxLength={320} autoComplete="email" value={draft.address} onChange={(event) => updateDraft('address', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                      <label className="text-[10px] text-slate-400">{t('settings.username')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} maxLength={320} autoComplete="username" value={draft.username} onChange={(event) => updateDraft('username', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <fieldset className="min-w-0 space-y-3 border-t border-white/[.07] pt-3">
                        <legend className="px-1 text-[10px] font-semibold text-purple-200">{t('settings.imapServer')}</legend>
                        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                          <label className="text-[10px] text-slate-400">{t('settings.serverHost')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} maxLength={253} autoComplete="url" value={draft.imapHost} onChange={(event) => updateDraft('imapHost', event.currentTarget.value)} placeholder="imap.example.com" className="mt-1.5 w-full min-w-0 rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                          <label className="text-[10px] text-slate-400">{t('settings.serverPort')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} type="number" min={1} max={65535} step={1} inputMode="numeric" value={draft.imapPort} onChange={(event) => updateDraft('imapPort', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-2 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                        </div>
                        <label className="block text-[10px] text-slate-400">{t('settings.encryption')}<select data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} value={draft.imapTls} onChange={(event) => updateDraft('imapTls', event.currentTarget.value === 'tls' ? 'tls' : 'starttls-required')} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60"><option value="tls">{t('settings.tls')}</option><option value="starttls-required">{t('settings.startTls')}</option></select></label>
                      </fieldset>

                      <fieldset className="min-w-0 space-y-3 border-t border-white/[.07] pt-3">
                        <legend className="px-1 text-[10px] font-semibold text-purple-200">{t('settings.smtpServer')}</legend>
                        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                          <label className="text-[10px] text-slate-400">{t('settings.serverHost')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} maxLength={253} autoComplete="url" value={draft.smtpHost} onChange={(event) => updateDraft('smtpHost', event.currentTarget.value)} placeholder="smtp.example.com" className="mt-1.5 w-full min-w-0 rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                          <label className="text-[10px] text-slate-400">{t('settings.serverPort')}<input required data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} type="number" min={1} max={65535} step={1} inputMode="numeric" value={draft.smtpPort} onChange={(event) => updateDraft('smtpPort', event.currentTarget.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-2 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-purple-400/60" /></label>
                        </div>
                        <label className="block text-[10px] text-slate-400">{t('settings.encryption')}<select data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} value={draft.smtpTls} onChange={(event) => updateDraft('smtpTls', event.currentTarget.value === 'tls' ? 'tls' : 'starttls-required')} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60"><option value="tls">{t('settings.tls')}</option><option value="starttls-required">{t('settings.startTls')}</option></select></label>
                      </fieldset>
                    </div>

                    <label className="block max-w-xl text-[10px] text-slate-400">{t('settings.password')}<input data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} type="password" autoComplete="new-password" maxLength={4096} value={password} disabled={!keyVaultReady || isKeyVaultLoading || isSavingProfile} onChange={(event) => setPassword(event.currentTarget.value)} placeholder={editingAccountId !== 'new' ? t('settings.passwordKeepPlaceholder') : ''} aria-describedby="connect-keyvault-status" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 disabled:cursor-not-allowed disabled:opacity-50" /><span className="mt-1 block text-[9px] text-slate-500">{keyVaultReady ? (accountHasStoredCredential(accounts, editingAccountId, bindings.connect.hasCredential) ? t('settings.passwordStored') : t('settings.passwordNotStored')) : t('settings.noSecretInBrowser')}</span></label>

                    <div className="flex flex-wrap items-center gap-2 border-t border-white/[.07] pt-4">
                      <button type="submit" data-setting-binding={WORKSPACE_SETTINGS_BINDINGS['connect.mail-profile'].id} disabled={isSavingProfile || storeError} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 text-[11px] font-medium text-white shadow-[0_4px_16px_rgba(124,58,237,.24)] transition hover:from-purple-500 hover:to-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 disabled:cursor-wait disabled:opacity-60"><Save aria-hidden="true" className="h-3.5 w-3.5" />{isSavingProfile ? t('settings.saving') : t('settings.saveProfile')}</button>
                      <p className="max-w-xl text-[9px] leading-relaxed text-slate-500">{t('settings.connectNotLinked')}</p>
                    </div>
                  </form>
                )}
              </div>
            )}

            {statusMessage && <p role="status" aria-live="polite" className="mx-auto mt-5 max-w-3xl border-l-2 border-purple-400/50 py-1 pl-3 text-[10px] leading-relaxed text-purple-200">{statusMessage}</p>}
            {section === 'support' && (
              <div className="mx-auto max-w-3xl">
                <SupportOptions locale={locale} variant="settings" />
              </div>
            )}

          </div>
        </section>
      </div>
    </div>
  );
};
