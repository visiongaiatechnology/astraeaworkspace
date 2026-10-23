// STATUS: DIAMANT VGT SUPREME — Notes hierarchy, tags and smart collections sidebar
import React, { useMemo, useState } from 'react';
import type { NoteNotebook, NoteSection, NoteSmartCollection, NoteSmartCollectionQuery, NoteTagDefinition } from '../../../shared/contracts/workspace';
import { Book, BookOpen, ChevronDown, FolderTree, Layers, Plus, SearchCheck, Tag, Trash2 } from 'lucide-react';
import { NewNotebookModal, NewSectionGroupModal, NewSectionModal } from '../notebooks/NotesModals';
import { noteTagKey } from '../model/notesTagsTasks';

interface NotesSidebarProps {
  notebooks: NoteNotebook[];
  activeNotebook: NoteNotebook | null;
  activeSection: NoteSection | null;
  onSelectNotebook: (id: string) => void;
  onSelectSection: (id: string) => void;
  onCreateNotebook: (title: string) => void;
  onDeleteNotebook: (id: string) => void;
  onCreateSection: (title: string, groupId?: string | null) => void;
  onCreateSectionGroup: (title: string, parentGroupId?: string | null) => void;
  onMoveSectionToGroup: (sectionId: string, groupId: string | null) => void;
  onDeleteSection: (id: string) => void;
  onRestoreSection: (id: string) => void;
  allTagsInNotebook: string[];
  tagDefinitions: NoteTagDefinition[];
  tagSummary: Map<string, number>;
  selectedTagFilter: string | null;
  onSelectTagFilter: (tag: string | null) => void;
  onUpsertCustomTag: (input: { id?: string; name: string; icon: string; color: string }) => void;
  onDeleteCustomTag: (tagId: string) => void;
  smartCollections: NoteSmartCollection[];
  selectedSmartCollectionId: string | null;
  onSelectSmartCollection: (id: string | null) => void;
  onCreateSmartCollection: (name: string, query: NoteSmartCollectionQuery) => void;
  onDeleteSmartCollection: (id: string) => void;
}

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notebooks, activeNotebook, activeSection, onSelectNotebook, onSelectSection,
  onCreateNotebook, onDeleteNotebook, onCreateSection, onCreateSectionGroup,
  onMoveSectionToGroup, onDeleteSection, onRestoreSection, allTagsInNotebook, tagDefinitions, tagSummary, selectedTagFilter,
  onSelectTagFilter, onUpsertCustomTag, onDeleteCustomTag, smartCollections, selectedSmartCollectionId,
  onSelectSmartCollection, onCreateSmartCollection, onDeleteSmartCollection,
}) => {
  const [isNotebookDropdownOpen, setIsNotebookDropdownOpen] = useState(false);
  const [isNewNotebookModalOpen, setIsNewNotebookModalOpen] = useState(false);
  const [isNewSectionModalOpen, setIsNewSectionModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [newSectionGroupId, setNewSectionGroupId] = useState<string | null>(null);
  const [showTagStudio, setShowTagStudio] = useState(false);
  const [customTagName, setCustomTagName] = useState('');
  const [customTagIcon, setCustomTagIcon] = useState('•');
  const [customTagColor, setCustomTagColor] = useState('#64748b');
  const [showSmartBuilder, setShowSmartBuilder] = useState(false);
  const [smartName, setSmartName] = useState('');
  const [smartTags, setSmartTags] = useState('');
  const [smartPropertyKey, setSmartPropertyKey] = useState('');
  const [smartPropertyValue, setSmartPropertyValue] = useState('');
  const [smartText, setSmartText] = useState('');

  const liveNotebooks = useMemo(() => notebooks.filter((notebook) => !notebook.trashedAt), [notebooks]);
  const groups = activeNotebook?.sectionGroups ?? [];
  const liveSections = activeNotebook?.sections.filter((section) => !section.trashedAt) ?? [];
  const trashedSections = activeNotebook?.sections.filter((section) => section.trashedAt).slice(-12) ?? [];
  const ungrouped = liveSections.filter((section) => !section.groupId || !groups.some((group) => group.id === section.groupId));
  const definitionsByKey = useMemo(() => new Map(tagDefinitions.map((definition) => [noteTagKey(definition.name), definition])), [tagDefinitions]);

  const renderSection = (section: NoteSection) => {
    const isActive = section.id === activeSection?.id;
    return <div key={section.id} data-vgt-theme-selected-surface={isActive ? 'true' : undefined} className={`group rounded-lg border ${isActive ? 'bg-blue-600/15 border-blue-500/30' : 'border-transparent hover:bg-white/[0.04]'}`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" data-vgt-theme-selected-text={isActive ? 'true' : undefined} onClick={() => onSelectSection(section.id)} className={`min-w-0 flex-1 text-left text-xs truncate ${isActive ? 'text-blue-200 font-medium' : 'text-slate-400 hover:text-slate-200'}`}><span className="text-slate-600 mr-2">#</span>{section.title}</button>
        <span className="text-[0.5625rem] px-1 rounded bg-white/[0.06] text-slate-500">{section.pages.filter((page) => !page.trashedAt).length}</span>
        <select value={section.groupId ?? ''} onChange={(event) => onMoveSectionToGroup(section.id, event.target.value || null)} onClick={(event) => event.stopPropagation()} title="Move section to group" className="opacity-0 group-hover:opacity-100 max-w-20 bg-slate-950 border border-white/10 rounded text-[0.5625rem] text-slate-400"><option value="">Root</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
        {liveSections.length > 1 && <button type="button" onClick={() => onDeleteSection(section.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400" aria-label="Move section to trash" title="Move section to trash"><Trash2 className="w-3 h-3" /></button>}
      </div>
    </div>;
  };

  const createCustomTag = () => {
    if (!customTagName.trim()) return;
    onUpsertCustomTag({ name: customTagName, icon: customTagIcon, color: customTagColor });
    setCustomTagName(''); setCustomTagIcon('•'); setCustomTagColor('#64748b');
  };
  const createCollection = () => {
    if (!smartName.trim()) return;
    const properties = smartPropertyKey.trim() ? { [smartPropertyKey.trim()]: smartPropertyValue.trim() } : {};
    onCreateSmartCollection(smartName, { tags: smartTags.split(',').map((tag) => tag.trim()).filter(Boolean), properties, text: smartText.trim(), match: 'all' });
    setSmartName(''); setSmartTags(''); setSmartPropertyKey(''); setSmartPropertyValue(''); setSmartText(''); setShowSmartBuilder(false);
  };

  return (
    <aside data-vgt-notes-chrome="sidebar" className="w-60 bg-slate-950/90 border-r border-white/[0.08] flex flex-col shrink-0">
      <div className="p-3 border-b border-white/[0.08] relative">
        <div className="flex items-center justify-between text-[0.6875rem] uppercase font-bold text-slate-400 tracking-wider mb-1.5"><span className="flex items-center gap-1.5"><Book className="w-3.5 h-3.5 text-blue-400" />Notebook</span><button type="button" onClick={() => setIsNewNotebookModalOpen(true)} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" aria-label="Create Notebook" title="Create Notebook"><Plus className="w-3.5 h-3.5" /></button></div>
        <button type="button" onClick={() => setIsNotebookDropdownOpen(!isNotebookDropdownOpen)} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 hover:border-blue-500/40 text-xs font-semibold text-slate-200"><span className="flex items-center gap-2 truncate"><BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" /><span className="truncate">{activeNotebook?.title || 'Select Notebook'}</span></span><ChevronDown className="w-3 h-3 text-slate-400" /></button>
        {isNotebookDropdownOpen && <><div className="fixed inset-0 z-30" onClick={() => setIsNotebookDropdownOpen(false)} /><div className="absolute top-14 left-3 right-3 z-50 glass-dropdown rounded-xl p-1.5 space-y-1 border border-white/15 shadow-2xl">{liveNotebooks.map((notebook) => <div key={notebook.id} role="option" tabIndex={0} aria-selected={notebook.id === activeNotebook?.id} onClick={() => { onSelectNotebook(notebook.id); setIsNotebookDropdownOpen(false); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectNotebook(notebook.id); setIsNotebookDropdownOpen(false); } }} data-vgt-theme-active-control={notebook.id === activeNotebook?.id ? 'soft' : undefined} className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${notebook.id === activeNotebook?.id ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-slate-300 hover:bg-white/5'}`}><span className="truncate">{notebook.title}</span>{liveNotebooks.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteNotebook(notebook.id); }} aria-label="Move notebook to trash" title="Move notebook to trash" className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}</div>)}</div></>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="flex items-center justify-between text-[0.6875rem] uppercase font-bold text-slate-400 tracking-wider px-1"><span className="flex items-center gap-1.5"><Layers className="w-3 h-3" />Sections</span><span className="flex items-center gap-1"><button type="button" onClick={() => setIsNewGroupModalOpen(true)} aria-label="Add Section Group" title="Add Section Group" className="p-0.5 hover:text-violet-300"><FolderTree className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setNewSectionGroupId(null); setIsNewSectionModalOpen(true); }} aria-label="Add Section" title="Add Section" className="p-0.5 hover:text-white"><Plus className="w-3.5 h-3.5" /></button></span></div>
        {ungrouped.map(renderSection)}
        {groups.map((group) => { const sections = liveSections.filter((section) => section.groupId === group.id); return <div key={group.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5"><div className="flex items-center justify-between px-1 py-1 text-[0.625rem] font-semibold text-violet-300"><span className="flex items-center gap-1.5"><FolderTree className="w-3 h-3" />{group.title}</span><button type="button" onClick={() => { setNewSectionGroupId(group.id); setIsNewSectionModalOpen(true); }} className="p-0.5 text-slate-500 hover:text-white" aria-label="Add section to group" title="Add section to group"><Plus className="w-3 h-3" /></button></div><div className="space-y-1">{sections.length ? sections.map(renderSection) : <div className="px-2 py-1 text-[0.625rem] italic text-slate-600">Empty group</div>}</div></div>; })}
        {trashedSections.length > 0 && <div className="rounded-lg border border-red-500/10 bg-red-500/[0.02] p-1.5"><div className="px-1 py-1 text-[0.5625rem] uppercase font-bold tracking-wider text-slate-500">Deleted sections</div>{trashedSections.map((section) => <div key={section.id} className="flex items-center gap-1 px-1 py-1 text-[0.625rem]"><span className="flex-1 truncate text-slate-500">{section.title}</span><button type="button" onClick={() => onRestoreSection(section.id)} className="text-blue-400 hover:text-blue-200">Restore</button></div>)}</div>}

        <div className="pt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between text-[0.625rem] uppercase font-bold tracking-wider text-slate-400 mb-1.5"><span className="flex items-center gap-1"><SearchCheck className="w-3 h-3" />Smart Collections</span><button type="button" onClick={() => setShowSmartBuilder((value) => !value)} className="p-0.5 hover:text-white" aria-label="Create smart collection" title="Create smart collection"><Plus className="w-3 h-3" /></button></div>
          <div className="space-y-1">{smartCollections.map((collection) => <div key={collection.id} className="group flex items-center gap-1"><button type="button" onClick={() => onSelectSmartCollection(selectedSmartCollectionId === collection.id ? null : collection.id)} data-vgt-theme-active-control={selectedSmartCollectionId === collection.id ? 'soft' : undefined} className={`flex-1 text-left px-2 py-1 rounded text-[0.625rem] truncate ${selectedSmartCollectionId === collection.id ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20' : 'text-slate-400 hover:bg-white/[0.04]'}`}>{collection.name}</button><button type="button" onClick={() => onDeleteSmartCollection(collection.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-300" aria-label={`Delete collection ${collection.name}`}><Trash2 className="w-3 h-3" /></button></div>)}{smartCollections.length === 0 && <div className="text-[0.5625rem] italic text-slate-600 px-1">No saved queries</div>}</div>
          {showSmartBuilder && <div className="mt-2 p-2 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] space-y-1.5"><input value={smartName} onChange={(event) => setSmartName(event.target.value)} placeholder="Collection name" className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><input value={smartTags} onChange={(event) => setSmartTags(event.target.value)} placeholder="Tags: research, source" className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><input value={smartText} onChange={(event) => setSmartText(event.target.value)} placeholder="Text contains…" className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><div className="grid grid-cols-2 gap-1"><input value={smartPropertyKey} onChange={(event) => setSmartPropertyKey(event.target.value)} placeholder="Property" className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><input value={smartPropertyValue} onChange={(event) => setSmartPropertyValue(event.target.value)} placeholder="Value" className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /></div><button type="button" onClick={createCollection} className="w-full py-1 rounded bg-cyan-600/25 border border-cyan-500/25 text-[0.625rem] text-cyan-200 hover:bg-cyan-600/35">Save query</button></div>}
        </div>
      </div>

      <div className="p-3 border-t border-white/[0.08] space-y-2">
        <div className="text-[0.625rem] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between"><span className="flex items-center gap-1"><Tag className="w-3 h-3" />Tags Summary</span><span className="flex items-center gap-2">{selectedTagFilter && <button type="button" onClick={() => onSelectTagFilter(null)} className="text-[0.5625rem] text-blue-400 hover:underline">Clear</button>}<button type="button" onClick={() => setShowTagStudio((value) => !value)} className="text-[0.5625rem] text-purple-300 hover:text-white">Manage</button></span></div>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">{allTagsInNotebook.map((tag) => { const definition = definitionsByKey.get(noteTagKey(tag)); const count = tagSummary.get(noteTagKey(tag)) ?? 0; return <button type="button" key={tag} onClick={() => onSelectTagFilter(selectedTagFilter === tag ? null : tag)} title={definition?.builtIn ? 'Built-in tag' : definition ? 'Custom tag' : 'Page tag'} data-vgt-theme-active-control={selectedTagFilter === tag ? 'soft' : undefined} className={`text-[0.625rem] px-1.5 py-0.5 rounded-full border ${selectedTagFilter === tag ? 'bg-blue-600/30 text-blue-100' : 'bg-white/[0.03] text-slate-400 hover:text-slate-200'}`} style={{ borderColor: definition?.color ?? 'rgba(255,255,255,0.08)' }}><span className="mr-1">{definition?.icon ?? '#'}</span>{tag}<span className="ml-1 text-slate-600">{count}</span></button>; })}</div>
        {showTagStudio && <div className="rounded-lg border border-purple-500/15 bg-purple-500/[0.03] p-2 space-y-1.5"><div className="grid grid-cols-[1fr_36px_44px] gap-1"><input value={customTagName} onChange={(event) => setCustomTagName(event.target.value)} placeholder="Custom tag" className="min-w-0 bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><input value={customTagIcon} onChange={(event) => setCustomTagIcon(event.target.value)} maxLength={8} aria-label="Tag icon" className="bg-slate-950 border border-white/10 rounded px-1 py-1 text-center text-[0.625rem] text-slate-200" /><input type="color" value={customTagColor} onChange={(event) => setCustomTagColor(event.target.value)} aria-label="Tag color" className="w-full h-6 bg-transparent" /></div><button type="button" onClick={createCustomTag} className="w-full py-1 rounded bg-purple-600/20 border border-purple-500/20 text-[0.625rem] text-purple-200">Add custom tag</button><div className="space-y-1">{tagDefinitions.filter((tag) => !tag.builtIn).map((tag) => <div key={tag.id} className="flex items-center gap-1 text-[0.625rem] text-slate-400"><span style={{ color: tag.color }}>{tag.icon}</span><span className="flex-1 truncate">{tag.name}</span><button type="button" onClick={() => onDeleteCustomTag(tag.id)} className="text-slate-600 hover:text-red-300" aria-label={`Delete custom tag ${tag.name}`}><Trash2 className="w-3 h-3" /></button></div>)}</div></div>}
      </div>

      <NewNotebookModal isOpen={isNewNotebookModalOpen} onClose={() => setIsNewNotebookModalOpen(false)} onCreate={(title) => { onCreateNotebook(title); setIsNewNotebookModalOpen(false); }} />
      <NewSectionModal isOpen={isNewSectionModalOpen} notebookTitle={activeNotebook?.title || ''} onClose={() => setIsNewSectionModalOpen(false)} onCreate={(title) => { onCreateSection(title, newSectionGroupId); setIsNewSectionModalOpen(false); }} />
      <NewSectionGroupModal isOpen={isNewGroupModalOpen} onClose={() => setIsNewGroupModalOpen(false)} onCreate={(title) => { onCreateSectionGroup(title); setIsNewGroupModalOpen(false); }} />
    </aside>
  );
};
