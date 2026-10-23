import { secureRandomId, secureRandomUint32 } from '../../../shared/crypto/secureRandom';
import React, { useState } from 'react';
import { deliverExportText } from '../../../shared/interchange/exportDelivery';
import { whiteboardDeliveryText, whiteboardExportFailureText } from '../interchange/whiteboardExportStatus';
import {
  X,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Layers,
  Database,
  FileCode,
  Search,
  Sparkles,
  Box
} from 'lucide-react';
import { WhiteboardItem, StickyColor } from '../types';
import {
  exportDrawToVisioXml,
  importVisioXmlToDraw,
  VisioConversionReport
} from '../../../shared/interchange/visioVdx';
import { MAX_VISIO_XML_BYTES } from '../../../shared/interchange/visioVdx/xmlParser';
import {
  runDrawRoundtripTestSuite,
  DrawSuiteReport,
  BUILTIN_STENCIL_LIBRARY,
  DrawStencilItem,
  DrawDataBinding
} from './drawRoundtripTestSuite';

interface DrawAdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  items: WhiteboardItem[];
  onUpdateItems: (newItems: WhiteboardItem[]) => void;
  showToast: (msg: string) => void;
}

export const DrawAdvancedModal: React.FC<DrawAdvancedModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  items,
  onUpdateItems,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'visio' | 'stencils' | 'datagraphics' | 'suite'>('visio');
  const [conversionReport, setConversionReport] = useState<VisioConversionReport | null>(null);
  const [suiteReport, setSuiteReport] = useState<DrawSuiteReport | null>(null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [stencilCategory, setStencilCategory] = useState<'all' | 'uml' | 'bpmn' | 'network' | 'erd'>('all');
  const [stencilSearch, setStencilSearch] = useState('');
  
  // Data Graphics State
  const [dataBindings] = useState<DrawDataBinding[]>([
    {
      shapeId: items[0]?.id || 'shape-1',
      sourceModule: 'database',
      sourceRef: 'db:infra_nodes/node_alpha',
      rules: [
        { id: 'r-1', field: 'load', operator: 'gt', threshold: 85, action: 'setColor', value: 'purple' },
        { id: 'r-2', field: 'status', operator: 'eq', threshold: 'ONLINE', action: 'setBadge', value: 'LIVE' }
      ]
    }
  ]);

  if (!isOpen) return null;

  const handleExportVisio = async () => {
    try {
      const { vdxXml, conversion } = exportDrawToVisioXml(documentTitle, items);
      setConversionReport(conversion);
      const safeBaseName = documentTitle.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').trim().replace(/\s+/gu, '_').slice(0, 80);
      const delivery = await deliverExportText(vdxXml, {
        suggestedName: `${safeBaseName || 'astraea-drawing'}.vdx`,
        extensions: ['vdx'],
        mimeType: 'application/xml;charset=utf-8',
      });
      showToast(`Exported the supported Visio VDX/XML subset. VSDX packages are not generated. ${whiteboardDeliveryText(delivery)}`);
    } catch (error) {
      showToast(whiteboardExportFailureText(error));
    }
  };

  const handleImportVisio = (file: File) => {
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_VISIO_XML_BYTES) {
      showToast('Choose a non-empty VDX/XML file up to 24 MiB. VSDX packages are not supported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xml = e.target?.result;
        if (typeof xml !== 'string') throw new Error('file-read-invalid');
        const result = importVisioXmlToDraw(xml);
        setConversionReport(result.conversion);
        onUpdateItems([...items, ...result.items]);
        showToast(`Imported ${result.items.length} items from Visio XML`);
      } catch {
        showToast('Visio XML import failed. The file may be malformed or outside the supported single-page subset.');
      }
    };
    reader.onerror = () => showToast('The selected Visio XML file could not be read.');
    reader.onabort = () => showToast('Visio XML import was cancelled.');
    try {
      reader.readAsText(file, 'UTF-8');
    } catch {
      showToast('The selected Visio XML file could not be read.');
    }
  };

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const rep = await runDrawRoundtripTestSuite(items, documentTitle);
      setSuiteReport(rep);
      showToast(`Fixture checks: ${rep.passedCount}/${rep.totalTests} passed.`);
    } catch {
      showToast('The Draw fixture checks could not be completed.');
    } finally {
      setIsRunningSuite(false);
    }
  };

  const handleAddStencil = (stencil: DrawStencilItem) => {
    let type: WhiteboardItem['type'] = 'process';
    if (stencil.category === 'bpmn' && stencil.id.includes('event')) {
      type = 'terminal';
    } else if (stencil.category === 'bpmn' && stencil.id.includes('gateway')) {
      type = 'decision';
    }
    const color: StickyColor = stencil.category === 'uml' ? 'cyan' : stencil.category === 'bpmn' ? 'yellow' : 'purple';
    const newItem: WhiteboardItem = {
      id: secureRandomId('stencil'),
      type,
      x: 200 + (secureRandomUint32() % 80),
      y: 180 + (secureRandomUint32() % 80),
      width: stencil.defaultWidth,
      height: stencil.defaultHeight,
      text: stencil.defaultText,
      color
    };
    onUpdateItems([...items, newItem]);
    showToast(`Added ${stencil.title} to canvas`);
  };

  const handleApplyDataGraphics = () => {
    // Simulate live evaluation of data rules against shapes
    const updated = items.map((item) => {
      const binding = dataBindings.find((b) => b.shapeId === item.id);
      if (!binding) return item;
      let newColor: StickyColor | undefined = item.color;
      let newText = item.text;
      for (const rule of binding.rules) {
        if (rule.action === 'setColor') {
          newColor = (rule.value === 'purple' || rule.value === 'yellow' || rule.value === 'cyan') ? rule.value : 'purple';
        } else if (rule.action === 'setBadge') {
          newText = `[${rule.value}] ${newText || ''}`;
        }
      }
      return { ...item, color: newColor, text: newText };
    });
    onUpdateItems(updated);
    showToast('Applied live data graphic rules to bound diagram shapes');
  };

  const filteredStencils = BUILTIN_STENCIL_LIBRARY.filter((s) => {
    const matchesCat = stencilCategory === 'all' || s.category === stencilCategory;
    const matchesSearch = !stencilSearch || s.title.toLowerCase().includes(stencilSearch.toLowerCase()) || s.defaultText.toLowerCase().includes(stencilSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Layers className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Astraea Draw Engineering & Interop Studio
                <span className="text-[0.625rem] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Modul 16 Core
                </span>
              </h2>
              <p className="text-xs text-slate-400">Visio VDX/XML subset conversion, stencils, data graphics & fixture checks</p>
            </div>
          </div>
          <button aria-label="Close Astraea Draw Engineering & Interop Studio Modul 16 Core dialog" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6">
          <button
            onClick={() => setActiveTab('visio')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'visio' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Visio VDX/XML Subset
          </button>
          <button
            onClick={() => setActiveTab('stencils')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'stencils' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-4 h-4" />
            Stencil Packs & Taxonomy
          </button>
          <button
            onClick={() => setActiveTab('datagraphics')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'datagraphics' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Data Graphics & Binding
          </button>
          <button
            onClick={() => setActiveTab('suite')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'suite' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            6-Point Verification Suite
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: VISIO INTEROP */}
          {activeTab === 'visio' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-indigo-400" />
                    Export Microsoft Visio XML (.vdx)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Exports supported basic shapes and bound connectors as a single-page VDX/XML subset. It does not create a zipped VSDX package or preserve ShapeSheet data.
                  </p>
                  <button
                    onClick={handleExportVisio}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export VDX/XML Subset
                  </button>
                </div>

                <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-indigo-400" />
                    Import Visio Drawing File
                  </h3>
                  <p className="text-xs text-slate-400">
                    Imports a bounded single-page XML document. DTDs and custom entities are rejected. Zipped VSDX files and macro-bearing packages are not opened.
                  </p>
                  <label className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-slate-400" />
                    Select VDX/XML File (up to 24 MiB)
                    <input
                      type="file"
                      accept=".vdx,.xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportVisio(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {conversionReport && (
                <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Visio Conversion Summary
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                      {conversionReport.shapesConvertedCount} shapes · {conversionReport.connectorsConvertedCount} connectors
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{conversionReport.summary}</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[0.6875rem] text-emerald-400 font-semibold block mb-1">Converted features:</span>
                      <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                        {conversionReport.supportedFeatures.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[0.6875rem] text-amber-400 font-semibold block mb-1">Omitted from conversion:</span>
                      <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                        {conversionReport.omittedFeatures.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STENCIL PACKS */}
          {activeTab === 'stencils' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 bg-slate-800/60 p-1 rounded-lg border border-slate-700">
                  {(['all', 'uml', 'bpmn', 'network', 'erd'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setStencilCategory(cat)}
                      className={`px-3 py-1 rounded text-xs font-medium uppercase transition-colors ${
                        stencilCategory === cat ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search stencils..."
                    value={stencilSearch}
                    onChange={(e) => setStencilSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredStencils.map((stencil) => (
                  <div
                    key={stencil.id}
                    // GAP-0052: die Karte trug `cursor-pointer` und ein `onClick`,
                    // aber KEINEN Tastaturweg — sie liess sich nur mit der Maus
                    // in die Zeichnung legen.
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAddStencil(stencil)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAddStencil(stencil);
                      }
                    }}
                    className="p-3 bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[0.625rem] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                          {stencil.category}
                        </span>
                        <div
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: stencil.defaultColor }}
                        />
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                        {stencil.title}
                      </h4>
                      <p className="text-[0.6875rem] text-slate-500 font-mono mt-1 truncate">
                        {stencil.defaultText.replace(/\n/g, ' ')}
                      </p>
                    </div>
                    <button className="mt-3 w-full py-1 bg-slate-700/40 hover:bg-indigo-600 text-slate-300 hover:text-white rounded text-[0.6875rem] font-medium transition-colors">
                      + Add Shape
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DATA GRAPHICS & BINDINGS */}
          {activeTab === 'datagraphics' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/30 border border-slate-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      Live Data Graphics Rules
                    </h3>
                    <p className="text-xs text-slate-400">
                      Bind diagram shapes to live Grid cells or Database query records. Rules trigger conditional color fills and status badges without altering base geometry.
                    </p>
                  </div>
                  <button
                    onClick={handleApplyDataGraphics}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Evaluate & Apply Rules
                  </button>
                </div>

                <div className="space-y-2">
                  {dataBindings.map((b, idx) => (
                    <div key={idx} className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-indigo-300">Target Shape: {b.shapeId}</span>
                        <span className="font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                          Source: {b.sourceRef}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {b.rules.map((rule) => (
                          <div key={rule.id} className="p-2 bg-slate-800/40 rounded border border-slate-700/50 flex items-center justify-between">
                            <span className="text-slate-300 font-mono">
                              IF {rule.field} {rule.operator} {rule.threshold}
                            </span>
                            <span className="text-amber-300 font-mono">
                              THEN {rule.action}('{rule.value}')
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: VERIFICATION SUITE */}
          {activeTab === 'suite' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Astraea Draw Fixture Checks
                  </h3>
                  <p className="text-xs text-slate-400">
                    Checks in-memory item data (or a fallback fixture). It does not verify persistence, native .vdraw storage, live data sources, routed canvas output, or Microsoft Visio compatibility.
                  </p>
                </div>
                <button
                  onClick={handleRunSuite}
                  disabled={isRunningSuite}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRunningSuite ? 'animate-spin' : ''}`} />
                  {isRunningSuite ? 'Running Fixture Checks...' : 'Run Fixture Checks'}
                </button>
              </div>

              {suiteReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">Fixture Pass Rate</span>
                      <span className="text-xl font-black text-emerald-400 font-mono">{suiteReport.fixturePassPercent}%</span>
                    </div>
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">Passed Tests</span>
                      <span className="text-xl font-black text-white font-mono">{suiteReport.passedCount} / {suiteReport.totalTests}</span>
                    </div>
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">Fixture JSON SHA-256</span>
                      <span className="text-xs font-mono text-indigo-300 truncate block mt-1">{suiteReport.fixtureSha256.substring(0, 16)}...</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {suiteReport.results.map((res) => (
                      <div
                        key={res.id}
                        className={`p-2.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          res.status === 'passed'
                            ? 'bg-emerald-950/10 border-emerald-500/30 text-emerald-300'
                            : res.status === 'warning'
                            ? 'bg-amber-950/10 border-amber-500/30 text-amber-300'
                            : 'bg-rose-950/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 font-bold">
                            {res.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                            <span>{res.name}</span>
                          </div>
                          <p className="text-[0.6875rem] text-slate-400 pl-6">{res.details}</p>
                        </div>
                        <span className="font-mono text-[0.6875rem] text-slate-500 shrink-0">{res.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
