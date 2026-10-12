import type {Asset,StorageLike} from './core/types';
import {localPhotoIdentity} from './core/localPhotoReference';
import {createBrowserPhotoStore,persistLocalPhoto,type LocalPhotoStore} from './localPhotoStorage';

export const LOCAL_STYLE_REFERENCE_SCOPE='smartcloset.local-style-references.v1';
export interface LocalStyleReference {id:string;ownerId:string;name:string;savedAt:string;asset:Asset}
const key=(owner:string)=>`${LOCAL_STYLE_REFERENCE_SCOPE}:${encodeURIComponent(owner)}`;
/** Separate from garments, shopping candidates and remote assets; a photo grants no ownership. */
export function readLocalStyleReferences(owner:string,storage:StorageLike=localStorage):LocalStyleReference[]{
 const raw=storage.getItem(key(owner));if(!raw)return[];
 let rows:unknown;try{rows=JSON.parse(raw);}catch{throw new Error('보관한 참고 사진 목록을 읽지 못했어요. 기존 자료는 변경하지 않았어요.');}
 if(!Array.isArray(rows))throw new Error('보관한 참고 사진 목록을 확인해 주세요.');
 const valid=rows.every((row):row is LocalStyleReference=>{
  if(!row||typeof row!=='object'||row.ownerId!==owner||typeof row.id!=='string'||typeof row.name!=='string'||typeof row.savedAt!=='string'||!row.asset)return false;
  const identity=localPhotoIdentity(row.asset.localPhotoKey);
  return row.asset.source==='upload'&&identity?.scope===LOCAL_STYLE_REFERENCE_SCOPE&&identity.ownerId===owner&&identity.assetId===row.asset.id&&identity.version===row.asset.version&&row.id===row.asset.id;
 });
 if(!valid)throw new Error('보관한 참고 사진 목록을 확인해 주세요. 기존 자료는 변경하지 않았어요.');
 return (rows as LocalStyleReference[]).map(row=>({...row,asset:{...row.asset,url:null}}));
}
export async function saveLocalStyleReference(file:Blob,name:string,owner:string,url:string,storage:StorageLike=localStorage,photos:LocalPhotoStore=createBrowserPhotoStore()):Promise<LocalStyleReference>{
 readLocalStyleReferences(owner,storage);
 const asset=await persistLocalPhoto(file,owner,url,photos,LOCAL_STYLE_REFERENCE_SCOPE);
 const reference={id:asset.id,ownerId:owner,name:name.slice(0,160),savedAt:new Date().toISOString(),asset};
 // Bytes are durable before publishing metadata. A failed metadata write keeps the prior list intact.
 const rows=readLocalStyleReferences(owner,storage);
 storage.setItem(key(owner),JSON.stringify([...rows,{...reference,asset:{...asset,url:null}}]));
 return reference;
}
export async function loadLocalStylePhoto(reference:LocalStyleReference,photos:LocalPhotoStore=createBrowserPhotoStore()):Promise<string|null>{
 const identity=localPhotoIdentity(reference.asset.localPhotoKey);
 if(!identity||identity.scope!==LOCAL_STYLE_REFERENCE_SCOPE||identity.ownerId!==reference.ownerId||identity.assetId!==reference.id||identity.version!==reference.asset.version)return null;
 const record=await photos.get(reference.asset.localPhotoKey!);
 if(!record||record.key!==reference.asset.localPhotoKey||record.scope!==identity.scope||record.ownerId!==identity.ownerId||record.assetId!==identity.assetId||record.version!==identity.version||!(record.blob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(record.blob.type)||!record.blob.size||record.blob.size>10*1024*1024)return null;
 return URL.createObjectURL(record.blob);
}
