import type {Asset, DemoState, Slot} from '../core/types';
import {stable, type DemoRepository} from '../core/repository';

/** App-internal review input, NOT a contract or manifest format imposed on the separately produced pack.
 * An adapter for the released pack must be reviewed when its version-fixed contract arrives. */
export interface NormalizedReferenceCore {
  adapterVersion: 'app-reference-core-review-v1';
  releaseId: string; version: string; releaseStatus: 'version-locked';
  baseUrl: string;
  profiles: {logicalRef: 'PSU'|'PHW'; runtimeProfileId: string}[];
  assets: {ref: string; id: string; version: number; path: string; sha256: string; mediaType: 'image/png'|'image/webp'|'image/jpeg'}[];
  garments: {ref: string; logicalProfile: 'PSU'|'PHW'; runtimeGarmentId: string; category: Slot; expectedRevision: number; assetRef: string;
    /** Informational reviewed scene mapping; never overwrites a user's stored physical location. */
    visibleLocationRef?: string}[];
  people: {ref: string; logicalProfile: 'PSU'|'PHW'; assetRef: string}[];
  results: {id: string; origin: 'reference_saved'; logicalProfile: 'PSU'|'PHW'; personRef: string; assetRef: string;
    items: {slot: Slot; garmentRef: string; assetRef: string}[]}[];
}
export type ReferenceIssueCode = 'contract-unavailable'|'unlocked-release'|'unsafe-path'|'bad-base-url'|'manifest-hash-mismatch'|'normalized-hash-mismatch'
  |'file-missing'|'file-read-error'|'file-hash-mismatch'|'media-mismatch'|'duplicate-ref'|'mapping-mismatch'|'profile-mismatch'
  |'asset-conflict'|'revision-conflict'|'release-conflict'|'stale-review'|'local-only'|'storage-unavailable';
export interface ReferenceIssue {code: ReferenceIssueCode; ref: string; detail: string}
export interface ReferenceDryRun {
  status: 'ready'|'quarantined'|'restored'; releaseId: string; version: string; manifestSha256: string; normalizedSha256: string;
  fingerprint: string; issues: ReferenceIssue[]; changes: {garmentId:string; assetId:string; assetVersion:number}[];
  unchanged: readonly ['profiles','existing-images','locations','outfits','drafts','events','calendar','authentication'];
}
export interface ReferenceReadPorts {readFile:(relativePath:string)=>Promise<Uint8Array|null>}
interface VerifiedInput {pack: NormalizedReferenceCore; assets: Map<string,Asset>; stateFingerprint: string; receiptKey:string; report:ReferenceDryRun}
const verified = new WeakMap<ReferenceDryRun, VerifiedInput>();
const installedCatalogs = new WeakMap<object,{signature:string;receiptKey:string;receiptHash:string;version:string}>();
const hashPattern=/^[a-f0-9]{64}$/;
const slots:readonly Slot[]=['top','bottom','outer','bag','shoes','hat','accessory','dress'];
const safePath=(path:string)=>/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(path)&&!path.split('/').some(part=>!part||part==='.'||part==='..');
const safeBase=(url:string)=>/^\/assets\/[A-Za-z0-9_/-]+\/$/.test(url)&&!url.includes('//')&&!url.split('/').includes('..');
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const unchanged=['profiles','existing-images','locations','outfits','drafts','events','calendar','authentication'] as const;
export async function referenceSha256(bytes:Uint8Array|string):Promise<string>{
  const input=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(input)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const normalizedReferenceDigest=(pack:NormalizedReferenceCore)=>referenceSha256(stable(pack));
const ownerFor=(pack:NormalizedReferenceCore,logical:string)=>pack.profiles.find(p=>p.logicalRef===logical)?.runtimeProfileId;
const stateFingerprint=(state:DemoState,pack:NormalizedReferenceCore,key:string)=>stable({
  profiles:pack.profiles.map(row=>state.profiles.filter(p=>p.id===row.runtimeProfileId)),
  garments:pack.garments.map(row=>state.garments.filter(g=>g.id===row.runtimeGarmentId)),receipt:state.localDatasets?.[key],
});
const mimeMatches=(bytes:Uint8Array,mime:string)=>mime==='image/png'?bytes.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)
  :mime==='image/jpeg'?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  :mime==='image/webp'?bytes.length>12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP':false;

/** Reads only caller-supplied package files. No directory watch, copying, network, repository write or automatic import. */
export async function dryRunReferenceCore(input:{pack:NormalizedReferenceCore; manifestBytes:Uint8Array;
  expectedManifestSha256:string; expectedNormalizedSha256:string},state:DemoState,ports:ReferenceReadPorts):Promise<ReferenceDryRun>{
  const pack=structuredClone(input.pack),issues:ReferenceIssue[]=[],assets=new Map<string,Asset>();
  const issue=(code:ReferenceIssueCode,ref:string,detail:string)=>issues.push({code,ref,detail});
  const actualManifest=await referenceSha256(input.manifestBytes),normalizedSha256=await normalizedReferenceDigest(pack);
  if(pack.adapterVersion!=='app-reference-core-review-v1')issue('contract-unavailable','adapter','Only an explicitly reviewed app normalization is accepted.');
  if(pack.releaseStatus!=='version-locked'||!pack.version?.trim()||!pack.releaseId?.trim())issue('unlocked-release','release','Intermediate pack folders are not importable.');
  if(!hashPattern.test(input.expectedManifestSha256)||actualManifest!==input.expectedManifestSha256)issue('manifest-hash-mismatch','manifest','Received manifest bytes differ from the reviewed release hash.');
  if(!hashPattern.test(input.expectedNormalizedSha256)||normalizedSha256!==input.expectedNormalizedSha256)issue('normalized-hash-mismatch','adapter','Explicit profile/entity mapping differs from the reviewed normalization.');
  if(!safeBase(pack.baseUrl))issue('bad-base-url','baseUrl','Only a project-local /assets/.../ base is accepted.');
  const unique=(values:string[],scope:string)=>{if(values.some(v=>!v?.trim())||new Set(values).size!==values.length)issue('duplicate-ref',scope,'References and runtime identities must be nonempty and unique.');};
  unique(pack.profiles.map(p=>p.logicalRef),'profiles.logicalRef');unique(pack.profiles.map(p=>p.runtimeProfileId),'profiles.runtimeProfileId');
  unique(pack.assets.map(a=>a.ref),'assets.ref');unique(pack.assets.map(a=>a.id),'assets.id');unique(pack.assets.map(a=>a.path),'assets.path');
  unique(pack.garments.map(g=>g.ref),'garments.ref');unique(pack.garments.map(g=>g.runtimeGarmentId),'garments.runtimeGarmentId');
  unique(pack.people.map(p=>p.ref),'people.ref');unique(pack.results.map(r=>r.id),'results.id');
  for(const profile of pack.profiles)if(!['PSU','PHW'].includes(profile.logicalRef)||state.profiles.filter(p=>p.id===profile.runtimeProfileId).length!==1)issue('profile-mismatch',profile.logicalRef,'Logical profile must map to one existing runtime profile; no new Auth/profile ID is created.');
  for(const asset of pack.assets){
    if(!safePath(asset.path)||!hashPattern.test(asset.sha256)||!positive(asset.version)){
      issue('unsafe-path',asset.ref,'Unsafe path or invalid asset hash/version.');continue;
    }
    // Bad manifest/mapping/base is quarantined before any supplied file reader is invoked.
    if(issues.some(row=>['bad-base-url','manifest-hash-mismatch','normalized-hash-mismatch','unlocked-release','contract-unavailable'].includes(row.code)))continue;
    let bytes:Uint8Array|null;try{bytes=await ports.readFile(asset.path);}catch{issue('file-read-error',asset.ref,'Local file could not be read.');continue;}
    if(!bytes?.length){issue('file-missing',asset.ref,'Required release file is missing or empty.');continue;}
    if(await referenceSha256(bytes)!==asset.sha256){issue('file-hash-mismatch',asset.ref,'Asset bytes do not match the locked manifest.');continue;}
    if(!mimeMatches(bytes,asset.mediaType)){issue('media-mismatch',asset.ref,'Image signature does not match the declared media type.');continue;}
    assets.set(asset.ref,{id:asset.id,version:asset.version,source:'packaged',url:pack.baseUrl+asset.path});
  }
  for(const row of pack.garments){
    const found=state.garments.filter(g=>g.id===row.runtimeGarmentId),owner=ownerFor(pack,row.logicalProfile);
    if(found.length!==1||found[0].ownerId!==owner||found[0].category!==row.category||!slots.includes(row.category)||!pack.assets.some(a=>a.ref===row.assetRef))issue('mapping-mismatch',row.ref,'Exact existing garment/profile/category/asset correspondence is required; names and raw IDs are not sufficient.');
  }
  for(const row of pack.people)if(!ownerFor(pack,row.logicalProfile)||!pack.assets.some(a=>a.ref===row.assetRef))issue('mapping-mismatch',row.ref,'Person/profile/asset correspondence is incomplete.');
  for(const row of pack.results){
    const person=pack.people.find(p=>p.ref===row.personRef&&p.logicalProfile===row.logicalProfile);
    if(row.origin!=='reference_saved'||!person||!pack.assets.some(a=>a.ref===row.assetRef)||!row.items.length||new Set(row.items.map(i=>i.slot)).size!==row.items.length
      ||!row.items.some(i=>i.slot==='top')||!row.items.some(i=>i.slot==='bottom')||row.items.some(item=>!pack.garments.some(g=>g.ref===item.garmentRef&&g.logicalProfile===row.logicalProfile&&g.category===item.slot&&g.assetRef===item.assetRef)))issue('mapping-mismatch',row.id,'Prepared result requires the exact person and complete owned outfit asset references; substitutions are rejected.');
  }
  const receiptKey=`reference-core:${pack.releaseId}`,receipt=state.localDatasets?.[receiptKey];
  const receiptHash=`${actualManifest}:${normalizedSha256}`;
  const replay=receipt?.version===pack.version&&receipt.sourceFingerprint===receiptHash;
  if(receipt&&!replay)issue('release-conflict',pack.releaseId,'A different version/mapping is installed. A separately reviewed migration is required.');
  const changes:ReferenceDryRun['changes']=[];
  if(!replay)for(const row of pack.garments){
    const g=state.garments.find(g=>g.id===row.runtimeGarmentId),asset=assets.get(row.assetRef);if(!g||!asset)continue;
    if(g.asset){if(stable(g.asset)!==stable(asset))issue('asset-conflict',row.ref,'Existing image is preserved; explicit replacement review is required.');}
    else if(g.displayBinding!==undefined)issue('asset-conflict',row.ref,'Existing display binding or explicit display clear is preserved.');
    else if(g.revision!==row.expectedRevision)issue('revision-conflict',row.ref,'Garment changed after the mapping review.');
    else changes.push({garmentId:g.id,assetId:asset.id,assetVersion:asset.version});
  }
  const stateHash=stateFingerprint(state,pack,receiptKey),fingerprint=await referenceSha256(stable({receiptHash,stateHash,changes}));
  const report:ReferenceDryRun={status:issues.length?'quarantined':replay?'restored':'ready',releaseId:pack.releaseId,version:pack.version,manifestSha256:actualManifest,normalizedSha256,fingerprint,issues,changes,unchanged};
  // Keep a private clone; neither a forged report nor edits to the displayed report authorize writes.
  if(!issues.length)verified.set(report,{pack,assets,stateFingerprint:stateHash,receiptKey,report:structuredClone(report)});
  return report;
}

/** Explicit local-only application AFTER a matching reviewed dry-run. Never invoked during app startup. */
export function applyReviewedReferenceCore(report:ReferenceDryRun,repository:DemoRepository,options:{connectionKind:string;reviewedFingerprint:string;now?:string}){
  const input=verified.get(report);
  if(options.connectionKind!=='local')return{status:'blocked' as const,code:'local-only' as const};
  if(!input||input.report.status==='quarantined'||input.report.fingerprint!==options.reviewedFingerprint||stable(report)!==stable(input.report))return{status:'blocked' as const,code:'stale-review' as const};
  if(repository.persistence.status!=='ready')return{status:'blocked' as const,code:'storage-unavailable' as const};
  const state=repository.getState();
  if(stateFingerprint(state,input.pack,input.receiptKey)!==input.stateFingerprint)return{status:'blocked' as const,code:'stale-review' as const};
  if(input.report.status==='restored')return{status:'restored' as const,changed:0};
  try{
    repository.commit(next=>{
      for(const change of input.report.changes){const row=input.pack.garments.find(g=>g.runtimeGarmentId===change.garmentId)!,g=next.garments.find(g=>g.id===change.garmentId)!;g.asset=structuredClone(input.assets.get(row.assetRef)!);g.revision+=1;}
      next.localDatasets={...next.localDatasets,[input.receiptKey]:{version:input.pack.version,sourceFingerprint:`${input.report.manifestSha256}:${input.report.normalizedSha256}`,installedAt:options.now??new Date().toISOString()}};
    },true);
    return{status:'installed' as const,changed:input.report.changes.length};
  }catch{return{status:'blocked' as const,code:'storage-unavailable' as const};}
}

/** This read-only registry becomes available only after file/hash validation and a reviewed installation receipt. */
export function installedReferenceCore(report:ReferenceDryRun,state:DemoState){
  const input=verified.get(report),receipt=input&&state.localDatasets?.[input.receiptKey];
  if(!input||receipt?.version!==input.pack.version||receipt.sourceFingerprint!==`${input.report.manifestSha256}:${input.report.normalizedSha256}`)return null;
  const catalog={pack:structuredClone(input.pack),assets:new Map([...input.assets].map(([key,value])=>[key,structuredClone(value)])),manifestSha256:input.report.manifestSha256};
  installedCatalogs.set(catalog,{signature:catalogSignature(catalog),receiptKey:input.receiptKey,receiptHash:`${input.report.manifestSha256}:${input.report.normalizedSha256}`,version:input.pack.version});
  return catalog;
}
export type InstalledReferenceCore=NonNullable<ReturnType<typeof installedReferenceCore>>;
const catalogSignature=(catalog:InstalledReferenceCore)=>stable({pack:catalog.pack,assets:[...catalog.assets],manifestSha256:catalog.manifestSha256});
export function isVerifiedInstalledReferenceCore(catalog:InstalledReferenceCore,state:DemoState){
  const receipt=installedCatalogs.get(catalog),saved=receipt&&state.localDatasets?.[receipt.receiptKey];
  return !!receipt&&receipt.signature===catalogSignature(catalog)&&saved?.version===receipt.version&&saved.sourceFingerprint===receipt.receiptHash;
}
