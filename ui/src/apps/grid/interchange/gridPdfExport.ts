// STATUS: DIAMANT VGT SUPREME — selectable-sheet/area Grid PDF export via hardened Writer PDF core.
import type { GridCell, GridPrintSettings, Paragraph, ParagraphStyle, TextSpan, WorkspaceDocument, WriterPageSetupConfig, WriterSectionDefinition } from '../../../shared/contracts/workspace';
import { buildDocumentPdf, assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { formatGridLocaleValue } from '../locale/gridLocale';
import { normalizeGridPrintSettings } from '../print/gridPrint';

const MAX_PDF_CELLS = 100_000;
const MAX_PDF_SHEETS = 64;

export interface GridPdfSelection { sheetId: string; range?: string; }

const baseStyle=(heading=false,pageBreak=false):ParagraphStyle=>({
  style_name:heading?'heading1':'normal',heading_level:heading?1:undefined,alignment:'left',line_height:1.15,space_before:heading?6:0,space_after:heading?6:1,page_break_before:pageBreak,
});
const span=(text:string,bold=false):TextSpan=>({text,bold,italic:false,underline:false,strike:false,font_size:headingSize(bold),font_family:'Arial'} as TextSpan);
const headingSize=(bold:boolean)=>bold?14:8.5;

function writerPageSetup(raw:GridPrintSettings|undefined):WriterPageSetupConfig{
  const settings=normalizeGridPrintSettings(raw??{paperSize:'A4',orientation:'portrait',margins:'normal',fitToWidth:true,showGridlines:true,repeatHeaderRow:true});
  const field=(...parts:Array<string|undefined>)=>parts.filter(Boolean).join('   ').replace(/&[ANFDT]/giu,'').trim();
  return {
    paperSize:settings.paperSize,orientation:settings.orientation,margins:settings.margins,
    ...(settings.margins==='custom'?{customMargins:{top:settings.customMarginsMm?.top??15,bottom:settings.customMarginsMm?.bottom??15,left:settings.customMarginsMm?.left??15,right:settings.customMarginsMm?.right??15}}:{}),
    paperColor:'white',showPageNumbers:true,pageNumberStart:settings.firstPageNumber??1,pageNumberPosition:'footer-center',
    headerText:field(settings.headerLeft,settings.headerCenter,settings.headerRight),footerText:field(settings.footerLeft,settings.footerCenter,settings.footerRight),
  };
}

function usedBounds(cells:Record<string,GridCell>):{startCol:number;endCol:number;startRow:number;endRow:number}{
  let startCol=Infinity,endCol=-1,startRow=Infinity,endRow=-1;
  for(const coord of Object.keys(cells)){const parsed=parseGridRange(coord);if(!parsed)continue;startCol=Math.min(startCol,parsed.startCol);endCol=Math.max(endCol,parsed.endCol);startRow=Math.min(startRow,parsed.startRow);endRow=Math.max(endRow,parsed.endRow);}
  return endRow<0?{startCol:0,endCol:0,startRow:0,endRow:0}:{startCol,endCol,startRow,endRow};
}

export function buildGridPdf(document:WorkspaceDocument,selections:readonly GridPdfSelection[]):Uint8Array{
  if(document.kind!=='Grid'||!document.gridData)throw new Error('grid_pdf_requires_grid_document');
  const unique=selections.slice(0,MAX_PDF_SHEETS);
  if(!unique.length)throw new Error('grid_pdf_selection_required');
  const paragraphs:Paragraph[]=[]; const sections:WriterSectionDefinition[]=[]; let totalCells=0; let firstSetup:WriterPageSetupConfig|undefined;
  unique.forEach((selection,index)=>{
    const sheet=document.gridData!.sheets.find((candidate)=>candidate.id===selection.sheetId);if(!sheet)throw new Error(`grid_pdf_sheet_missing:${selection.sheetId}`);
    const object=document.objects[sheet.tableObjectId];if(object?.type!=='Table')throw new Error(`grid_pdf_table_missing:${sheet.id}`);
    const range=selection.range??sheet.printSettings?.printArea;const bounds=range?parseGridRange(range):usedBounds(object.data.cells);if(!bounds)throw new Error(`grid_pdf_range_invalid:${range}`);
    const count=(bounds.endCol-bounds.startCol+1)*(bounds.endRow-bounds.startRow+1);totalCells+=count;if(totalCells>MAX_PDF_CELLS)throw new Error('grid_pdf_cell_limit');
    const headingId=`grid-pdf-${index}-heading`; const setup=writerPageSetup(sheet.printSettings); if(!firstSetup)firstSetup=setup; else sections.push({id:`grid-pdf-section-${index}`,startParagraphId:headingId,breakType:'next-page',pageSetup:setup});
    paragraphs.push({id:headingId,style:baseStyle(true,index>0),spans:[span(sheet.name,true)]});
    for(let row=bounds.startRow;row<=bounds.endRow;row++){
      const values:string[]=[];for(let col=bounds.startCol;col<=bounds.endCol;col++)values.push(formatGridLocaleValue(object.data.cells[toA1(col,row)],document.gridData!.locale));
      paragraphs.push({id:`grid-pdf-${index}-row-${row}`,style:baseStyle(false,false),spans:[span(values.join('    '),false)]});
    }
  });
  return buildDocumentPdf({title:document.title,paragraphs,config:firstSetup!,sections,metadata:{language:document.gridData.locale}});
}

export function downloadGridPdf(bytes:Uint8Array,filename:string):Promise<ExportDeliveryResult>{
  return deliverExportBytes(bytes,{
    suggestedName:filename,
    extensions:['pdf'],
    mimeType:'application/pdf',
    // A file is only handed to the dialog after the produced bytes are a real PDF.
    assertArtifact:assertPdfExportArtifact,
  });
}
