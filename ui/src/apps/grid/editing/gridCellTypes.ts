// STATUS: DIAMANT VGT SUPREME
// Canonical bounded Grid cell input typing. Locale-specific display is separate from internal values.
import type { GridCell } from '../../../shared/contracts/workspace';

const ERROR_TOKEN=/^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A!?|CALC!|SPILL!|CIRCULAR!)$/i;
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;
const ISO_DATETIME=/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DURATION=/^P(?=\d|T\d)(?:\d+D)?(?:T(?:(?:\d+(?:\.\d+)?)H)?(?:(?:\d+(?:\.\d+)?)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/i;

function canStoreAsGridNumber(source: string, parsed: number): boolean {
  return Number.isFinite(parsed)
    && !(parsed === 0 && /[1-9]/.test(source))
    && !(Number.isInteger(parsed) && !Number.isSafeInteger(parsed));
}

export function parseGridCellInput(input: string): GridCell {
  const raw=input; const value=input.trim();
  if(value==='') return {value:'',dataType:'empty'};
  if(ERROR_TOKEN.test(value)) return {value:value.toUpperCase(),dataType:'error'};
  if(/^true$/i.test(value)||/^false$/i.test(value)) return {value:/^true$/i.test(value),dataType:'boolean'};
  if(/^[-+]?\d+$/.test(value)) {
    const numeric=Number(value);
    if(canStoreAsGridNumber(value,numeric)) return {value:numeric,format:'number',dataType:'integer'};
  }
  if(/^[-+]?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) {
    const numeric=Number(value);
    if(canStoreAsGridNumber(value,numeric)) return {value:numeric,format:'number',dataType:'decimal'};
  }
  if(/^[-+]?\d+(?:\.\d+)?%$/.test(value)) {
    const numericInput=value.slice(0,-1);
    const numeric=Number(numericInput)/100;
    if(canStoreAsGridNumber(numericInput,numeric)) return {value:numeric,format:'percent',dataType:'percent'};
  }
  if(/^[€$£]\s*[-+]?\d+(?:[.,]\d+)?$/.test(value)) {
    const numericInput=value.replace(/^[€$£]\s*/,'').replace(',','.');
    const numeric=Number(numericInput);
    if(canStoreAsGridNumber(numericInput,numeric)) return {value:numeric,format:'currency',dataType:'currency'};
  }
  if(ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return {value,format:'date',dataType:'date'};
  if(ISO_DATETIME.test(value) && !Number.isNaN(Date.parse(value.replace(' ','T')))) return {value:value.replace(' ','T'),format:'datetime',dataType:'datetime'};
  if(ISO_TIME.test(value)) return {value,format:'time',dataType:'time'};
  if(ISO_DURATION.test(value)) return {value:value.toUpperCase(),format:'duration',dataType:'duration'};
  return {value:raw,dataType:'text'};
}

export function mergeGridCellInput(currentCell: GridCell, parsedInput: GridCell): GridCell {
  const isPlainNumber = parsedInput.dataType === 'integer' || parsedInput.dataType === 'decimal';
  const preserveCurrentFormat = isPlainNumber && currentCell.format !== undefined;
  return {
    ...currentCell,
    ...parsedInput,
    ...(preserveCurrentFormat ? { format: currentCell.format } : {}),
  };
}

export interface GridRichTextRun { text:string; bold?:boolean; italic?:boolean; underline?:boolean; textColor?:string }
export interface GridRichTextCell extends GridCell { dataType:'rich-text'; richTextRuns:GridRichTextRun[] }
export function createGridRichTextCell(runs: readonly GridRichTextRun[]): GridRichTextCell {
  const bounded=runs.slice(0,256).map(r=>({...r,text:r.text.slice(0,4096)}));
  return {value:bounded.map(r=>r.text).join('').slice(0,65_536),dataType:'rich-text',richTextRuns:bounded};
}
