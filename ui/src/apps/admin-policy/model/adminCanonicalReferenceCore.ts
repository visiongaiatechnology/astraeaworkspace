// STATUS: DIAMANT VGT SUPREME — canonical cross-app references for Admin policy scopes
const SAFE=/^[A-Za-z0-9._:-]{1,192}$/;
export type AdminReferenceKind='document'|'space'|'app'|'device-group'|'user'|'group';
export function buildAdminWorkspaceReference(kind:AdminReferenceKind,id:string):string{const clean=id.trim();if(!SAFE.test(clean))throw new Error('admin-canonical-reference-invalid');return`vgt://workspace/${kind}/${encodeURIComponent(clean)}`;}
export function parseAdminWorkspaceReference(value:string):{kind:AdminReferenceKind;id:string}{if(value.length>512)throw new Error('admin-canonical-reference-length');const m=/^vgt:\/\/workspace\/(document|space|app|device-group|user|group)\/([^/?#]+)$/.exec(value);if(!m)throw new Error('admin-canonical-reference-invalid');const id=decodeURIComponent(m[2]);if(!SAFE.test(id))throw new Error('admin-canonical-reference-invalid');return{kind:m[1]as AdminReferenceKind,id};}
export function assertCanonicalReferences(values:readonly string[],kind?:AdminReferenceKind):void{if(values.length>10_000)throw new Error('admin-canonical-reference-count');for(const v of values){const p=parseAdminWorkspaceReference(v);if(kind&&p.kind!==kind)throw new Error('admin-canonical-reference-kind');}}
/**
 * EINE Definition dafür, wann eine kanonische Referenz eine rohe Workspace-ID bezeichnet.
 *
 * **Befund (gemessen, nicht vermutet):** `adminRetentionCore.match` und `adminDlpCore.matcher`
 * verglichen `rule.spaceIds.includes(o.spaceId)` / `approvedSpaceIds.includes(ctx.destinationId)`.
 * Geschrieben wurden dieselben Felder aber über `assertCanonicalReferences(..., 'space')`, also als
 * `vgt://workspace/space/<id>`. Damit konnte eine über die eigene Schreibfunktion gespeicherte
 * Space-Regel **niemals** greifen: die Anzeige sagte „Regel vorhanden", die Auswertung entschied
 * immer „kein Treffer". Zwei Definitionen desselben Fakts — und die Regel war eine Anzeige, keine
 * Autorität.
 *
 * Diese Funktion ist die eine Definition: sie akzeptiert beide Schreibweisen (kanonisch und roh),
 * damit vorhandene Dokumente nicht stillschweigend ungültig werden, und vergleicht dann ID gegen ID.
 */
export function referenceMatchesId(reference:string,kind:AdminReferenceKind,rawId:string):boolean{
  const id=rawId.trim();
  if(!id||id.length>192)return false;
  if(reference===id)return true;
  if(!reference.startsWith('vgt://workspace/'))return false;
  try{const parsed=parseAdminWorkspaceReference(reference);return parsed.kind===kind&&parsed.id===id;}catch{return false;}
}
export function referenceListMatchesId(references:readonly string[],kind:AdminReferenceKind,rawId:string):boolean{
  if(!Array.isArray(references)||references.length>10_000)return false;
  for(const reference of references)if(typeof reference==='string'&&referenceMatchesId(reference,kind,rawId))return true;
  return false;
}
