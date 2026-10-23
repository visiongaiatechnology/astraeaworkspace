// STATUS: DIAMANT VGT SUPREME — Astraea Connect Contacts View
//
// BATCH-CONNECT-7: `handleAddContact` used to insert a fabricated contact — "New Sovereign Peer",
// `peer@example.test`, "Peer Enclave" and a **made-up GPG fingerprint** — and then called
// `legacyContactToCore` only for its throwing side effect. The locale also promised a "cryptographically
// verified GPG address book", but nothing verifies a fingerprint. Both are fixed here: the form requires
// real data, the contact is validated by the platform core, and a fingerprint is shown as *stored*, not
// as verified.

import React, { useState } from 'react';
import { Users, Key, Mail, Building, Plus, Search, Info } from 'lucide-react';
import type { ConnectDocumentModel, ConnectContact } from '../domain/types';
import { legacyContactToCore } from '../application/connectUiBridge';
import { useConnectCopy } from '../locale/connectLocale';
import { useConnectExtraCopy } from '../locale/connectLocaleExtra';

interface ConnectContactsViewProps {
  model: ConnectDocumentModel;
  onUpdateModel: (updater: (prev: ConnectDocumentModel) => ConnectDocumentModel) => void;
}

interface ContactDraft {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly organization: string;
  readonly role: string;
  readonly gpgFingerprint: string;
}

const EMPTY_CONTACT: ContactDraft = { fullName: '', email: '', phone: '', organization: '', role: '', gpgFingerprint: '' };

/** Bounded lookups over the stored contacts; nothing is fetched. */
export function filterContacts(contacts: readonly ConnectContact[], query: string): ConnectContact[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...contacts];
  return contacts.filter(contact => [contact.fullName, contact.email, contact.phone ?? '', contact.organization, contact.role]
    .some(field => field.toLowerCase().includes(needle)));
}

export const ConnectContactsView: React.FC<ConnectContactsViewProps> = ({
  model,
  onUpdateModel,
}) => {
  const copy = useConnectCopy();
  const extra = useConnectExtraCopy();
  const { contacts } = model;
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_CONTACT);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const setField = (field: keyof ContactDraft, value: string) => setDraft(current => ({ ...current, [field]: value }));
  const visible = filterContacts(contacts, query);

  /** Create the contact the user typed, validated by `domain/connectContactsCore.validateContact`. */
  const handleAddContact = () => {
    const fullName = draft.fullName.trim();
    const email = draft.email.trim().toLowerCase();
    if (!fullName) { setError('contact-name-required'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('contact-email-invalid'); return; }
    const newContact: ConnectContact = {
      id: `cnt-${Date.now()}`,
      fullName: fullName.slice(0, 512),
      email,
      phone: draft.phone.trim() || undefined,
      organization: draft.organization.trim(),
      role: draft.role.trim(),
      // Stored as given. A fingerprint that was merely typed in is NOT a verified key, and the UI below
      // says so; the value is never used to claim a verification.
      gpgFingerprint: draft.gpgFingerprint.trim() || undefined,
    };
    try {
      legacyContactToCore(newContact);
    } catch {
      setError('contact-invalid');
      return;
    }
    setError('');
    onUpdateModel(prev => ({ ...prev, contacts: [...prev.contacts, newContact] }));
    setDraft(EMPTY_CONTACT);
    setIsFormOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#07050d] text-slate-200 select-none overflow-y-auto">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-purple-500/20">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Connect Contacts · {copy.contactsTitle}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{copy.contactsDescription}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-purple-400" aria-hidden="true" />
            <input
              type="search"
              data-connect-contact-search="true"
              aria-label={copy.searchAccessible}
              placeholder={copy.searchPlaceholder}
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-48 pl-8 pr-3 py-1.5 rounded-lg bg-[#140e24] border border-purple-500/30 text-xs text-slate-100"
            />
          </div>
          <button
            type="button"
            aria-label={copy.addContact}
            data-connect-action="contact-new"
            onClick={() => setIsFormOpen(open => !open)}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{copy.addContact}</span>
          </button>
        </div>
      </div>

      {isFormOpen && (
        <section data-connect-contact-form="true" aria-label={copy.addContact} className="mb-6 rounded-xl border border-purple-500/30 bg-[#0e0a1b] p-4 space-y-3 text-xs">
          {error && <div role="alert" data-connect-contact-error={error} className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-rose-200">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label htmlFor="connect-contact-name" className="text-slate-400 block mb-1">{copy.addContact}</label><input id="connect-contact-name" data-connect-contact-field="fullName" value={draft.fullName} onChange={e => setField('fullName', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-contact-email" className="text-slate-400 block mb-1">email</label><input id="connect-contact-email" data-connect-contact-field="email" value={draft.email} onChange={e => setField('email', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-contact-phone" className="text-slate-400 block mb-1">phone</label><input id="connect-contact-phone" data-connect-contact-field="phone" value={draft.phone} onChange={e => setField('phone', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-contact-org" className="text-slate-400 block mb-1">organization</label><input id="connect-contact-org" data-connect-contact-field="organization" value={draft.organization} onChange={e => setField('organization', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-contact-role" className="text-slate-400 block mb-1">role</label><input id="connect-contact-role" data-connect-contact-field="role" value={draft.role} onChange={e => setField('role', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
            <div><label htmlFor="connect-contact-fpr" className="text-slate-400 block mb-1">fingerprint</label><input id="connect-contact-fpr" data-connect-contact-field="gpgFingerprint" value={draft.gpgFingerprint} onChange={e => setField('gpgFingerprint', e.target.value)} className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100" /></div>
          </div>
          <p data-connect-fingerprint-note="stored-not-verified" className="flex items-start gap-1.5 text-[0.625rem] text-amber-300">
            <Info className="mt-0.5 w-3 h-3 shrink-0" aria-hidden="true" />
            {extra.fingerprintStoredNotVerified}
          </p>
          <div className="flex justify-end">
            <button type="button" data-connect-action="contact-create" onClick={handleAddContact} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold">{copy.addContact}</button>
          </div>
        </section>
      )}

      {visible.length === 0 ? (
        <p data-connect-contacts-empty="true" className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          {copy.noMessages(copy.contacts)}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((cnt) => (
            <div
              key={cnt.id}
              data-connect-contact={cnt.id}
              className="rounded-xl border border-purple-500/20 bg-[#0e0a1b] p-4 space-y-3 hover:border-purple-500/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center font-bold text-purple-200 text-sm">
                  {cnt.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-purple-200">{cnt.fullName}</h3>
                  {cnt.role && <div className="text-xs text-slate-400">{cnt.role}</div>}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-purple-500/10">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-mono">{cnt.email}</span>
                </div>
                {cnt.organization && (
                  <div className="flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{cnt.organization}</span>
                  </div>
                )}
                {cnt.gpgFingerprint && (
                  <div data-connect-fingerprint="stored-not-verified" className="flex items-start gap-2 pt-1 text-[0.6875rem] text-amber-300">
                    <Key className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {/* Stored value, labelled as stored. No verification happened, so no green badge. */}
                    <span className="font-mono break-all leading-tight">{cnt.gpgFingerprint}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
