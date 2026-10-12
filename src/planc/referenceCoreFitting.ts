import type {Asset, DemoState} from '../core/types';
import {stable} from '../core/repository';
import {fittingSnapshotsMatch,type FittingCandidate,type FittingSnapshot} from '../mirrorScene';
import {fittingContentKey} from '../fittingContentIdentity';
import {isVerifiedInstalledReferenceCore,type InstalledReferenceCore} from './referenceCoreAdapter';

export type LocalAssetFailure='null-asset'|'missing-asset-url'|'bad-base-url'|'file-404'|'revoked-blob'|'mapping-mismatch'|'asset-load-error'|'missing-prepared-result'|'stale-request';
export type LocalAssetRead={status:'ready';asset:Asset}|{status:'missing'|'error';reason:LocalAssetFailure;message:string};
export const referenceAssetMessage=(reason:LocalAssetFailure)=>reason==='missing-prepared-result'
  ?'이 코디의 미리보기가 아직 준비되지 않았어요.'
  :['null-asset','missing-asset-url','file-404'].includes(reason)?'사진이 아직 연결되지 않았어요.'
  :reason==='stale-request'?'현재 선택한 코디를 확인해 주세요.':'사진을 불러오지 못했어요.';

/** Read diagnostics remain separate from concise customer text. No remote fallback or paid request. */
export async function readLocalReferenceAsset(asset:Asset|null,ports:{fetch:typeof fetch;origin:string;expected?:{id:string;version:number}}):Promise<LocalAssetRead>{
  const fail=(reason:LocalAssetFailure,status:'missing'|'error'='error'):LocalAssetRead=>({status,reason,message:referenceAssetMessage(reason)});
  if(!asset)return fail('null-asset','missing');
  if(ports.expected&&(asset.id!==ports.expected.id||asset.version!==ports.expected.version))return fail('mapping-mismatch');
  if(!asset.url)return fail('missing-asset-url','missing');
  let url:URL;
  try{url=new URL(asset.url,ports.origin);}catch{return fail('bad-base-url');}
  const isBlob=url.protocol==='blob:';
  if(isBlob?url.origin!==ports.origin:(url.origin!==ports.origin||!url.pathname.startsWith('/assets/')||url.search||url.hash))return fail('bad-base-url');
  try{
    const response=await ports.fetch(url.href,{method:'GET',credentials:'same-origin',cache:'no-store'});
    if(response.status===404)return fail(isBlob?'revoked-blob':'file-404','missing');
    if(!response.ok)return fail('asset-load-error');
    const mime=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
    if(!['image/png','image/webp','image/jpeg'].includes(mime)||!(await response.blob()).size)return fail('asset-load-error');
    return{status:'ready',asset};
  }catch{return fail(isBlob?'revoked-blob':'asset-load-error');}
}

export type ReferenceFittingLookup={status:'ready';candidate:FittingCandidate;releaseId:string;version:string;manifestSha256:string}
  |{status:'missing'|'error';reason:LocalAssetFailure;message:string};
/** Content signature covers every owned/external item, profile and person version. Request epoch is guarded separately. */
export function resolveReferenceSavedFitting(input:{catalog:InstalledReferenceCore|null;state:DemoState;snapshot:FittingSnapshot|null;currentSnapshot?:FittingSnapshot|null}):ReferenceFittingLookup{
  const fail=(reason:LocalAssetFailure,status:'missing'|'error'='missing'):ReferenceFittingLookup=>({status,reason,message:referenceAssetMessage(reason)});
  const {catalog,snapshot,state}=input,current=input.currentSnapshot===undefined?snapshot:input.currentSnapshot;
  if(!catalog||!snapshot)return fail('missing-prepared-result');
  if(!fittingSnapshotsMatch(snapshot,current))return fail('stale-request','error');
  if(!Number.isSafeInteger(snapshot.requestVersion)||snapshot.requestVersion<1||!Number.isSafeInteger(snapshot.outfit.revision)||snapshot.outfit.revision<1
    ||(!snapshot.outfit.draftId&&!snapshot.outfit.outfitId))return fail('mapping-mismatch','error');
  if(!isVerifiedInstalledReferenceCore(catalog,state))return fail('mapping-mismatch','error');
  const logical=catalog.pack.profiles.filter(p=>p.runtimeProfileId===snapshot.ownerId);
  if(logical.length!==1)return fail('mapping-mismatch','error');
  // Re-check repository identities and asset versions, including a user replacement after installation.
  for(const item of snapshot.outfit.items){
    const rows=state.garments.filter(g=>g.id===item.garmentId&&g.ownerId===snapshot.ownerId);
    if(rows.length!==1||rows[0].category!==item.slot||rows[0].asset?.id!==item.assetId||rows[0].asset?.version!==item.assetVersion)return fail('mapping-mismatch','error');
  }
  if(snapshot.outfit.externalItems?.length)return fail('missing-prepared-result');
  const matches=catalog.pack.results.flatMap(result=>{
    if(result.origin!=='reference_saved'||result.logicalProfile!==logical[0].logicalRef)return[];
    const person=catalog.pack.people.find(p=>p.ref===result.personRef&&p.logicalProfile===result.logicalProfile),personAsset=person&&catalog.assets.get(person.assetRef);
    if(!personAsset)return[];
    const items=result.items.map(item=>{const g=catalog.pack.garments.find(g=>g.ref===item.garmentRef&&g.logicalProfile===result.logicalProfile),asset=catalog.assets.get(item.assetRef);return g&&asset?{slot:item.slot,garmentId:g.runtimeGarmentId,assetId:asset.id,assetVersion:asset.version}:null;});
    if(items.some(item=>!item))return[];
    const expected:FittingSnapshot={...snapshot,person:{assetId:personAsset.id,assetVersion:personAsset.version},outfit:{...snapshot.outfit,items:items.filter(item=>item!==null),externalItems:[]}};
    return fittingContentKey(expected)===fittingContentKey(snapshot)?[result]:[];
  });
  if(!matches.length)return fail('missing-prepared-result');
  if(matches.length!==1)return fail('mapping-mismatch','error');
  const result=matches[0],asset=catalog.assets.get(result.assetRef);
  if(!asset?.url)return fail('missing-asset-url');
  return{status:'ready',releaseId:catalog.pack.releaseId,version:catalog.pack.version,manifestSha256:catalog.manifestSha256,
    candidate:{snapshot:structuredClone(snapshot),origin:'reference_saved',content:'fitting-result',status:'ready',media:{kind:'image',url:asset.url},resultId:result.id}};
}

/** Location view is not a physical-location write and respects a user's explicit move or clear. */
export function referenceVisibleLocation(catalog:InstalledReferenceCore|null,state:DemoState,ownerId:string,garmentId:string):string|null{
  if(!catalog||!isVerifiedInstalledReferenceCore(catalog,state))return null;
  const rows=state.garments.filter(g=>g.id===garmentId&&g.ownerId===ownerId),logical=catalog.pack.profiles.find(p=>p.runtimeProfileId===ownerId)?.logicalRef;
  if(rows.length!==1||rows[0].provenance.location==='user'||rows[0].location)return null;
  const bindings=catalog.pack.garments.filter(g=>g.runtimeGarmentId===garmentId&&g.logicalProfile===logical);
  if(bindings.length!==1)return null;
  const asset=catalog.assets.get(bindings[0].assetRef);
  if(!asset||stable(rows[0].asset)!==stable(asset))return null;
  return bindings[0].visibleLocationRef??null;
}
