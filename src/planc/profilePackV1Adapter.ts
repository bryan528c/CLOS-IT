import type {DemoEvent,DemoState,Garment,Outfit,OutfitDraft} from '../core/types';
import {clone,isValidState,stable,type DemoRepository} from '../core/repository';
import {parseLifeProfileData,type LifeProfileData} from '../lifeSnapshot';
import {hashRow,resolveAsset,safeRelativePath,toExistingProfileBundle} from './profilePackV1Pure.mjs';

/** Deserialized release fields are retained verbatim, including quality/provenance metadata.
 * No runtime IDs are inferred from labels, colors, short codes, or image similarity. */
export type ProfilePackV1Record=Record<string,any>;
export interface RawProfilePackV1 {
 manifest:ProfilePackV1Record;
 profiles:Record<string,{profile:ProfilePackV1Record;garments:ProfilePackV1Record[];outfits:ProfilePackV1Record[];events:ProfilePackV1Record[];care:ProfilePackV1Record[];contexts:ProfilePackV1Record[];preferences:ProfilePackV1Record[]}>;
 shared:Record<string,any> & {assets:ProfilePackV1Record[];people:ProfilePackV1Record[];placements:ProfilePackV1Record[];prepared_fittings:ProfilePackV1Record[];locations:ProfilePackV1Record[]};
 profileBindings:ProfilePackV1Record;
}
export interface ProfilePackV1Bundle {
 profileRef:'PSU'|'PHW';
 bundle:{profile:{id:string;name:string};garments:Garment[];outfits:Outfit[];outfitDraft:OutfitDraft};
 events:DemoEvent[];lifeData:LifeProfileData;calendarFixtures:ProfilePackV1Record[];
 careGuides:ProfilePackV1Record[];placements:ProfilePackV1Record[];deferredEvents:ProfilePackV1Record[];
}
export interface ProfilePackV1Catalog {raw:RawProfilePackV1;baseUrl:string;fingerprint:string;bundles:ProfilePackV1Bundle[];issues:ProfilePackV1Issue[];assetValidation:'catalog-only'}
export interface ProfilePackV1Issue {entity:string;id:string;reason:string}
export const PROFILE_PACK_V1_RECEIPT='closit-profile-packs:integrated:1.0.0';
export const PROFILE_PACK_V1_PROFILE_IDS={PSU:'local:scprep-20261009-v1:profile:PSU',PHW:'local:scprep-20261009-v1:profile:PHW'} as const;
export interface ProfilePackV1Baseline {garments:Garment[];outfits:Outfit[];events:DemoEvent[]}
export interface ProfilePackV1Change {entity:'garment'|'outfit'|'event'|'preference'|'context';id:string;action:'create'|'link'|'unchanged'}
export interface ProfilePackV1DryRun {
 status:'ready'|'ready-with-conflicts'|'restored'|'blocked';fingerprint:string;sourceFingerprint:string;
 changes:ProfilePackV1Change[];conflicts:ProfilePackV1Issue[];deferred:ProfilePackV1Issue[];
 counts:{create:number;link:number;unchanged:number;conflict:number;deferred:number};
 preserved:readonly string[];
}
const reviewed=new WeakMap<ProfilePackV1DryRun,{report:ProfilePackV1DryRun;stateFingerprint:string;candidate:DemoState;catalogFingerprint:string}>();
const catalogProofs=new WeakMap<ProfilePackV1Catalog,string>();
const catalogSignature=(catalog:ProfilePackV1Catalog)=>hashRow({raw:catalog.raw,baseUrl:catalog.baseUrl,bundles:catalog.bundles,issues:catalog.issues});
const preserved=['profile IDs/names','existing edited/deleted garments','user cards/events','current and previous drafts','UI/search/date','receipts','location overrides','authentication'] as const;
const unique=(rows:any[],key:string)=>Array.isArray(rows)&&new Set(rows.map(row=>row[key])).size===rows.length;
const profiles=['PSU','PHW'] as const;

/** Validates and projects JSON only. ZIP CRC/SHA and mounted file bytes are checked separately
 * by the release verifier; catalog validation alone is deliberately not called asset verification. */
export function buildProfilePackV1(input:RawProfilePackV1,baseUrl='/assets/closit-profile-packs/'):ProfilePackV1Catalog {
 const raw=clone(input),issues:ProfilePackV1Issue[]=[],bundles:ProfilePackV1Bundle[]=[];
 const issue=(entity:string,id:string,reason:string)=>issues.push({entity,id,reason});
 try{
  if(raw.manifest.namespace!=='closit-profile-packs'||raw.manifest.packVersion!=='1.0.0'||raw.manifest.edition!=='integrated'||stable(raw.manifest.profileRefs)!==stable(profiles))throw Error('locked_combined_release_required');
  if(!/^\/assets\/[A-Za-z0-9_/-]+\/$/.test(baseUrl)||baseUrl.includes('//')||baseUrl.includes('..'))throw Error('same_origin_asset_base_required');
  if(!unique(raw.shared.assets,'id'))throw Error('duplicate_asset_id');
  for(const asset of raw.shared.assets){safeRelativePath(asset.path);resolveAsset(asset.path,baseUrl);if(!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.version!==1||asset.mimeType!=='image/png')throw Error('invalid_asset_contract');}
  for(const ref of profiles){
   const p=raw.profiles[ref],binding=raw.profileBindings.profiles?.[ref];
   if(binding?.runtimeProfileId!==PROFILE_PACK_V1_PROFILE_IDS[ref]||binding?.bindingStatus!=='verified_current_source')throw Error('profile_binding_mismatch');
   if(p.garments.length!==24||p.care.length!==24||p.outfits.length!==(ref==='PSU'?5:6))throw Error('incomplete_combined_release');
   for(const key of ['garments','outfits','events','care','contexts','preferences'] as const)if(!unique(p[key],'ref'))throw Error(`duplicate_${key}`);
   for(const garment of p.garments){
    if(garment.ownerRef!==ref||!raw.shared.assets.some(a=>a.id===garment.mainAssetId&&a.version===garment.assetVersion))throw Error('garment_owner_or_asset_mismatch');
   }
   for(const outfit of p.outfits)if(outfit.ownerRef!==ref||outfit.items.some((item:any)=>!p.garments.some(g=>g.ref===item.garmentRef&&g.category===item.slot&&g.mainAssetId===item.assetId&&g.assetVersion===item.assetVersion)))throw Error('outfit_item_mismatch');
   for(const event of p.events)if(event.ownerRef!==ref||event.garmentRefs.some((id:string)=>!p.garments.some(g=>g.ref===id)))throw Error('event_owner_or_garment_mismatch');
   for(const care of p.care)if(care.ownerRef!==ref||!p.garments.some(g=>g.ref===care.garmentRef))throw Error('care_owner_or_garment_mismatch');
   const mapped=toExistingProfileBundle(raw,ref,raw.profileBindings,baseUrl);
   if(!mapped.bundle||!parseLifeProfileData(mapped.lifeData,binding.runtimeProfileId))throw Error('invalid_projected_profile');
   bundles.push({...mapped,profileRef:ref});
  }
  if(raw.shared.prepared_fittings.length!==2)throw Error('prepared_result_count_mismatch');
  const ids=bundles.flatMap(b=>b.bundle.garments.map(g=>g.id));if(new Set(ids).size!==48)throw Error('cross_profile_garment_id_collision');
 }catch(error){issue('release','closit-profile-packs',error instanceof Error?error.message:'invalid_release');}
 const catalog:ProfilePackV1Catalog={raw,baseUrl,fingerprint:hashRow({raw,baseUrl}),bundles,issues,assetValidation:'catalog-only'};
 if(!issues.length)catalogProofs.set(catalog,catalogSignature(catalog));
 return catalog;
}

/** Side-effect-free plan. Baseline is the already-shipped app fixture, never a guessed row.
 * A reviewed normal subset may install while conflicts remain individually preserved. */
export function dryRunProfilePackV1(catalog:ProfilePackV1Catalog,state:DemoState,options:{baseline:ProfilePackV1Baseline}):ProfilePackV1DryRun {
 const next=clone(state),conflicts:ProfilePackV1Issue[]=clone(catalog.issues),deferred:ProfilePackV1Issue[]=[],changes:ProfilePackV1Change[]=[];
 const conflict=(entity:string,id:string,reason:string)=>conflicts.push({entity,id,reason});
 const defer=(entity:string,id:string,reason:string)=>deferred.push({entity,id,reason});
 const change=(entity:ProfilePackV1Change['entity'],id:string,action:ProfilePackV1Change['action'])=>changes.push({entity,id,action});
 const receipt=state.localDatasets?.[PROFILE_PACK_V1_RECEIPT];
 const sourceMatches=receipt?.version==='1.0.0'&&receipt.sourceFingerprint===catalog.fingerprint;
 let blocked=catalog.issues.length>0||!isValidState(state);
 if(hashRow({raw:catalog.raw,baseUrl:catalog.baseUrl})!==catalog.fingerprint||catalogProofs.get(catalog)!==catalogSignature(catalog)){conflict('release',PROFILE_PACK_V1_RECEIPT,'catalog_changed_after_projection');blocked=true;}
 if(receipt&&!sourceMatches){conflict('release',PROFILE_PACK_V1_RECEIPT,'different_release_or_mount_requires_reviewed_migration');blocked=true;}
 if(!blocked&&!receipt){
  const installedCore=!!state.localDatasets?.['planc-reference-20261013-v1'];
  for(const mapped of catalog.bundles){
   const owner=mapped.bundle.profile.id;
   if(!state.profiles.some(p=>p.id===owner)){conflict('profile',owner,'existing_profile_required');blocked=true;continue;}
   for(const incoming of mapped.bundle.garments){
    const current=next.garments.find(g=>g.id===incoming.id),baseline=options.baseline.garments.find(g=>g.id===incoming.id);
    if(!current){if(installedCore&&baseline){defer('garment',incoming.id,'deleted_core_not_resurrected');continue;}next.garments.push(clone(incoming));change('garment',incoming.id,'create');}
    else if(current.ownerId!==owner||current.category!==incoming.category)conflict('garment',incoming.id,'owner_or_category_conflict');
    else if(stable(current)===stable(incoming))change('garment',incoming.id,'unchanged');
    else if(baseline&&stable(current)===stable(baseline)){
     // Preserve stable identity; only untouched former fixture rows adopt approved release content.
     next.garments[next.garments.indexOf(current)]={...clone(incoming),revision:Math.max(current.revision,incoming.revision)+1};change('garment',incoming.id,'link');
    }else conflict('garment',incoming.id,'existing_edit_or_untracked_value_preserved');
   }
   for(const incoming of mapped.bundle.outfits){
    if(!Object.values(incoming.items).every(id=>next.garments.some(g=>g.id===id&&g.ownerId===owner))){defer('outfit',incoming.id,'missing_or_cross_owner_garment');continue;}
    const current=next.outfits.find(o=>o.id===incoming.id),baseline=options.baseline.outfits.find(o=>o.id===incoming.id);
    if(!current){if(installedCore&&baseline){defer('outfit',incoming.id,'deleted_core_not_resurrected');continue;}next.outfits.push(clone(incoming));change('outfit',incoming.id,'create');}
    else if(current.ownerId!==owner)conflict('outfit',incoming.id,'owner_conflict');
    else if(stable(current)===stable(incoming))change('outfit',incoming.id,'unchanged');
    else if(baseline&&stable(current)===stable(baseline)){next.outfits[next.outfits.indexOf(current)]={...clone(incoming),revision:Math.max(current.revision,incoming.revision)+1};change('outfit',incoming.id,'link');}
    else conflict('outfit',incoming.id,'existing_edit_or_untracked_value_preserved');
   }
   for(const incoming of mapped.events){
    if((incoming.garmentIds??[]).some(id=>!next.garments.some(g=>g.id===id&&g.ownerId===owner))||incoming.outfitId&&!next.outfits.some(o=>o.id===incoming.outfitId&&o.ownerId===owner)){defer('event',incoming.id,'missing_or_cross_owner_dependency');continue;}
    const current=next.events.find(e=>e.id===incoming.id||!!incoming.sourceEventKey&&e.sourceEventKey===incoming.sourceEventKey),baseline=options.baseline.events.find(e=>e.id===incoming.id);
    if(!current){if(state.localDatasets?.['planc-care-reference-20261013-v1']&&baseline){defer('event',incoming.id,'deleted_core_care_not_resurrected');continue;}next.events.push(clone(incoming));change('event',incoming.id,'create');}
    else if(current.ownerId!==owner)conflict('event',incoming.id,'owner_conflict');
    // The old S02 records remain exactly as recorded. Additional fictional method details
    // are available in the read-only guide, not retroactively written into prior history.
    else if(stable(current)===stable(incoming)||baseline&&stable(current)===stable(baseline))change('event',incoming.id,'unchanged');
    else conflict('event',incoming.id,'existing_event_revision_or_edit_preserved');
   }
   next.lifeData??={};
   const existing=next.lifeData[owner];
   if(existing&&!parseLifeProfileData(existing,owner)){conflict('lifeData',owner,'invalid_existing_profile_data_preserved');}
   else if(!existing){next.lifeData[owner]=clone(mapped.lifeData);for(const row of mapped.lifeData.preferences)change('preference',row.id,'create');for(const row of mapped.lifeData.contexts)change('context',row.id,'create');}
   else{
    for(const kind of ['preferences','contexts'] as const)for(const row of mapped.lifeData[kind]){
     const entity=kind==='preferences'?'preference':'context',old=existing[kind].find(p=>p.id===row.id);
     if(!old){if(kind==='preferences'&&'outfitId'in row&&row.outfitId&&!next.outfits.some(o=>o.id===row.outfitId&&o.ownerId===owner)){defer(entity,row.id,'outfit_dependency_missing');continue;}
      (existing[kind] as {id:string}[]).push(clone(row));change(entity,row.id,'create');}
     else if(stable(old)===stable(row))change(entity,row.id,'unchanged');else conflict(entity,row.id,'existing_edit_preserved');
    }
   }
   for(const row of mapped.calendarFixtures)defer('calendar_fixture',row.ref,'unassigned_schedule_read_projection');
   for(const row of mapped.deferredEvents)defer('event',row.ref,row.reason);
  }
 }
 if(!blocked&&!isValidState(next)){conflict('state','candidate','candidate_contract_failed');blocked=true;}
 const status=blocked?'blocked':sourceMatches?'restored':conflicts.length?'ready-with-conflicts':'ready';
 const sourceFingerprint=catalog.fingerprint;
 const fingerprint=hashRow({state,catalog:sourceFingerprint,changes,conflicts,deferred,status});
 const report:ProfilePackV1DryRun={status,fingerprint,sourceFingerprint,changes,conflicts,deferred,counts:{create:changes.filter(c=>c.action==='create').length,link:changes.filter(c=>c.action==='link').length,unchanged:changes.filter(c=>c.action==='unchanged').length,conflict:conflicts.length,deferred:deferred.length},preserved};
 if(!blocked)reviewed.set(report,{report:clone(report),stateFingerprint:hashRow(state),candidate:next,catalogFingerprint:sourceFingerprint});
 return report;
}

/** One durable Repository write installs entities and receipt together, or retains original state.
 * The caller must explicitly supply local mode and the exact dry-run fingerprint. */
export function applyProfilePackV1(report:ProfilePackV1DryRun,repository:DemoRepository,options:{connectionKind:string;reviewedFingerprint:string;now?:string}){
 const saved=reviewed.get(report);
 if(options.connectionKind!=='local')return{status:'blocked' as const,reason:'local_only'};
 if(!saved||stable(saved.report)!==stable(report)||report.fingerprint!==options.reviewedFingerprint||hashRow(repository.getState())!==saved.stateFingerprint)return{status:'blocked' as const,reason:'stale_or_forged_dry_run'};
 if(report.status==='restored')return{status:'restored' as const,changed:0};
 if(repository.persistence.status!=='ready')return{status:'blocked' as const,reason:'storage_unavailable'};
 const candidate=clone(saved.candidate),now=options.now??new Date().toISOString();
 candidate.localDatasets={...candidate.localDatasets,[PROFILE_PACK_V1_RECEIPT]:{version:'1.0.0',sourceFingerprint:saved.catalogFingerprint,installedAt:now}};
 candidate.localRepairs={...candidate.localRepairs,[PROFILE_PACK_V1_RECEIPT]:{version:'1.0.0',sourceFingerprint:saved.catalogFingerprint,appliedAt:now,changedIds:report.changes.filter(c=>c.action!=='unchanged').map(c=>c.id),conflicts:[...report.conflicts,...report.deferred].map(c=>({id:c.id,reason:`${c.entity}:${c.reason}`}))}};
 if(!isValidState(candidate))return{status:'blocked' as const,reason:'candidate_contract_failed'};
 try{repository.commit(next=>Object.assign(next,candidate),true);return{status:'installed' as const,changed:report.counts.create+report.counts.link,conflicts:report.conflicts.length};}
 catch{return{status:'blocked' as const,reason:'durable_write_failed_original_preserved'};}
}

export function isProfilePackV1Installed(catalog:ProfilePackV1Catalog,state:DemoState){const receipt=state.localDatasets?.[PROFILE_PACK_V1_RECEIPT];return catalog.issues.length===0&&receipt?.version==='1.0.0'&&receipt.sourceFingerprint===catalog.fingerprint;}
