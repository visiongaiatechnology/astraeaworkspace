// STATUS: DIAMANT VGT SUPREME — Astraea Publish PDF/X adapter over deterministic tagged PDF core
import type { PublishDocumentModel } from '../../contracts/types';
import type { IccProfileId } from '../../prepress/publishPrepressEngine';
import { buildPublishPdf, type PublishPrinterMarks } from './publishPdfExportEngine';
import { missingPdfXRequirements, type PublishPdfStructureFinding } from './publishPdfStructure';
export type PdfXStandard='PDF/X-1a:2001'|'PDF/X-4:2010';
export type PrinterMarksOptions=PublishPrinterMarks;
export interface PdfXExportResult {pdfStream:string;bytesCount:number;standard:PdfXStandard;sha256:string;pagesExported:number;marksApplied:string[];outputCondition:string;
  /** Die **gemessene** Pflichtbilanz dieses Standards — leer heisst: alle Pflichten sind erfuellt. */
  missingRequirements:PublishPdfStructureFinding[];}

/**
 * **PDF/X wirklich ausgeben** — und die Pflichten danach **messen** (`AST-1417`, P0).
 *
 * Der Bauer prueft schon **vor** der Herausgabe (`assertPdfXExportable`) und wirft bei einer fehlenden Pflicht.
 * Hier wird dieselbe Pruefung noch einmal **als Ergebnis** mitgegeben: *der Aufrufer soll die Bilanz sehen
 * koennen, ohne sie nachzurechnen* — und `missingRequirements` ist die eine Definition davon, nicht eine zweite.
 *
 * `outputProfileBytes` wird **durchgereicht**, nicht erfunden: PDF/X-1a verlangt ein eingebettetes ICC-Profil,
 * und ein erfundenes waere eine Attrappe.
 */
export async function exportPublishToPdfX(model:PublishDocumentModel,standard:PdfXStandard='PDF/X-4:2010',marks:PrinterMarksOptions={cropMarks:true,bleedMarks:true,registrationMarks:true,colorBars:true,pageInformation:true},profileId:IccProfileId='FOGRA51',outputProfileBytes?:Uint8Array):Promise<PdfXExportResult>{const result=await buildPublishPdf(model,{target:standard,profileId,marks,includeBleed:true,accessible:true,interactive:false,blockOnPreflightErrors:false,...(outputProfileBytes===undefined?{}:{outputProfileBytes})});return{pdfStream:result.text,bytesCount:result.bytes.length,standard,sha256:result.sha256,pagesExported:result.pages,marksApplied:result.marksApplied,outputCondition:result.outputCondition,missingRequirements:missingPdfXRequirements(result.text,standard)};}
