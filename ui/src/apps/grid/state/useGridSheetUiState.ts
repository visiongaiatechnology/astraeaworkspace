import { useState } from 'react';

export function useGridSheetUiState() {
  const [professionalPanelOpen, setProfessionalPanelOpen] = useState(false);
  const [whatIfModalOpen, setWhatIfModalOpen] = useState(false);
  const [findReplaceModalOpen, setFindReplaceModalOpen] = useState(false);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [slicerModalOpen, setSlicerModalOpen] = useState(false);
  const [dataTableModalOpen, setDataTableModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [powerQueryModalOpen, setPowerQueryModalOpen] = useState(false);
  const [solverModalOpen, setSolverModalOpen] = useState(false);
  const [monteCarloModalOpen, setMonteCarloModalOpen] = useState(false);
  const [roundtripModalOpen, setRoundtripModalOpen] = useState(false);
  const [pasteSpecialModalOpen, setPasteSpecialModalOpen] = useState(false);
  const [goalSeekModalOpen, setGoalSeekModalOpen] = useState(false);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  /**
   * Release Beta 0.1 (export integrity): non-error status for exports. It distinguishes a confirmed
   * native file write ("gespeichert") from the browser download fallback and never invents success.
   */
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  return {
    professionalPanelOpen, setProfessionalPanelOpen, whatIfModalOpen, setWhatIfModalOpen,
    findReplaceModalOpen, setFindReplaceModalOpen, chartModalOpen, setChartModalOpen,
    commentsModalOpen, setCommentsModalOpen, slicerModalOpen, setSlicerModalOpen,
    dataTableModalOpen, setDataTableModalOpen, auditModalOpen, setAuditModalOpen,
    powerQueryModalOpen, setPowerQueryModalOpen, solverModalOpen, setSolverModalOpen,
    monteCarloModalOpen, setMonteCarloModalOpen, roundtripModalOpen, setRoundtripModalOpen,
    pasteSpecialModalOpen, setPasteSpecialModalOpen, goalSeekModalOpen, setGoalSeekModalOpen,
    scenarioModalOpen, setScenarioModalOpen, validationModalOpen, setValidationModalOpen,
    exportNotice, setExportNotice,
  };
}
export type GridSheetUiState = ReturnType<typeof useGridSheetUiState>;
