// STATUS: DIAMANT VGT SUPREME — thin client; native vgt-theme-assets is authoritative.
import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { BetaTemplateId } from './templateCatalog';
import { BETA_TEMPLATES } from './templateCatalog';
import { createBetaTemplate } from './betaTemplates';

type ThemeTokens={palette:Record<string,string>;semantic_colors:Record<string,string>;typography:Record<string,{family:string;size_pt:number;weight:number;line_height:number}>;spacing:Record<string,number>;effects:Record<string,string>;chart_colors:string[]};
const EMPTY_THEME:ThemeTokens={palette:{},semantic_colors:{},typography:{},spacing:{},effects:{},chart_colors:[]};
export async function instantiateNativeBetaTemplate(templateId:BetaTemplateId):Promise<WorkspaceDocument>{
  const meta=BETA_TEMPLATES.find(t=>t.id===templateId);if(!meta)throw new Error('Unknown template.');
  const seed=createBetaTemplate(templateId);
  // Browser previews and web builds have no native template command. Keep those
  // surfaces usable with the same bounded built-in seed; Tauri remains authoritative.
  if(typeof window==='undefined'||!('__TAURI_INTERNALS__' in window))return {...seed,title:meta.name};
  return invoke<WorkspaceDocument>('vgt_template_instantiate',{request:{template:{schema:'vgt.workspace.template/1',id:meta.id,version:1,name:meta.name,categories:[meta.kind],tags:['built-in'],preview_asset_id:null,required_assets:[],required_styles:[],compatibility_version:1,source:'built-in',inert:true,theme_tokens:EMPTY_THEME,document:seed},new_title:meta.name}});
}
