import type {Asset} from './types';

export interface LocalPhotoIdentity {scope:string;ownerId:string;assetId:string;version:number}
/** The key includes the storage area and owner; asset IDs alone never grant access. */
export function localPhotoKey({scope,ownerId,assetId,version}:LocalPhotoIdentity):string {
 return JSON.stringify(['smartcloset-photo-v1',scope,ownerId,assetId,version]);
}
export function localPhotoIdentity(key:unknown):LocalPhotoIdentity|null {
 if(typeof key!=='string')return null;
 try{
  const value:unknown=JSON.parse(key);
  if(!Array.isArray(value)||value.length!==5||value[0]!=='smartcloset-photo-v1'||value.slice(1,4).some(x=>typeof x!=='string'||!x)||!Number.isSafeInteger(value[4])||value[4]<1)return null;
  return{scope:value[1],ownerId:value[2],assetId:value[3],version:value[4]};
 }catch{return null;}
}
export function validLocalPhotoReference(asset:Pick<Asset,'id'|'version'|'source'|'localPhotoKey'>,ownerId?:string):boolean {
 if(asset.localPhotoKey===undefined)return true;
 const identity=localPhotoIdentity(asset.localPhotoKey);
 return asset.source==='upload'&&!!identity&&identity.assetId===asset.id&&identity.version===asset.version&&(ownerId===undefined||identity.ownerId===ownerId);
}
