import type {DemoApp} from '../core/app';
import type {StorageLike} from '../core/types';
import {referenceGarments,referenceOutfits,referenceCareEvents} from './data';
import {profilePackV1Catalog as catalog} from './profilePackV1Catalog';
import {applyProfilePackV1,dryRunProfilePackV1,PROFILE_PACK_V1_RECEIPT} from './profilePackV1Adapter';

export const PROFILE_PACK_CHECKPOINT_SUFFIX='.before-profile-packs-v1';
/** Exact private local state. Never sent to a server, logged, or bundled with demo JSON. */
export function checkpointBeforeProfilePack(storage:StorageLike|undefined,key:string){
 if(!storage)return {status:'unavailable'};
 try{const raw=storage.getItem(key),backupKey=key+PROFILE_PACK_CHECKPOINT_SUFFIX;
  if(raw!==null&&storage.getItem(backupKey)===null){storage.setItem(backupKey,raw);if(storage.getItem(backupKey)!==raw)throw Error('backup_readback_failed');}
  return{status:'ready',backupKey};
 }catch{return{status:'failed'};}
}
/** Verify every released PNG before the first state activation. Existing installs keep their
 * current data on any static-file error; no partial asset projection is ever committed. */
export async function verifyProfilePackAssets(fetcher:typeof fetch=fetch){
 const rows=catalog.raw.shared.assets.flatMap((a:any)=>[a,...(a.variants??[])]);
 const queue=[...new Map(rows.map((a:any)=>[a.path,a])).values()];
 let count=0;
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const a=queue.shift()!;
  const response=await fetcher(catalog.baseUrl+a.path,{cache:'no-cache'});if(!response.ok)throw Error('pack_asset_unavailable');
  const bytes=await response.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==a.sha256)throw Error('pack_asset_hash_mismatch');count++;
 }}));return count;
}
export async function installProfilePackV1(app:DemoApp,storage:StorageLike|undefined,key:string){
 const install=async()=>{try{
  if(app.connection.kind!=='local'||!storage||app.persistence.status!=='ready')return{status:'blocked',reason:'local_storage_required'};
  const checkpoint=checkpointBeforeProfilePack(storage,key);if(checkpoint.status!=='ready')return{status:'blocked',reason:'checkpoint_failed'};
  const before=storage.getItem(key);
  const report=dryRunProfilePackV1(catalog,app.getState(),{baseline:{garments:referenceGarments(),outfits:referenceOutfits(),events:referenceCareEvents()}});
  if(report.status==='blocked')return{status:'blocked',report};
  if(report.status!=='restored'){try{await verifyProfilePackAssets();}catch{return{status:'blocked',reason:'asset_verification_failed',report};}}
  if(storage.getItem(key)!==before)return{status:'blocked',reason:'another_tab_changed_state',report};
  const result=applyProfilePackV1(report,app.repository,{connectionKind:app.connection.kind,reviewedFingerprint:report.fingerprint});
  return{...result,report,checkpointKey:checkpoint.backupKey};
 }catch{return{status:'blocked',reason:'storage_read_failed_original_preserved'};}
 };
 // Serializes simultaneous import attempts. Normal repository writes also use a stale-byte guard.
 return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(PROFILE_PACK_V1_RECEIPT,install):install();
}
