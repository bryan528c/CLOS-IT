import type {DemoApp} from './core/app';
import type {Asset} from './core/types';
import {localPhotoIdentity,localPhotoKey,type LocalPhotoIdentity} from './core/localPhotoReference';
import {LOCAL_LIFE_STORAGE_KEY} from './localLifeStorage';

const DATABASE='smartcloset.local-photos.v1',STORE='photos';
export interface LocalPhotoRecord extends LocalPhotoIdentity {key:string;blob:Blob}
export interface LocalPhotoStore {put(record:LocalPhotoRecord):Promise<void>;get(key:string):Promise<LocalPhotoRecord|undefined>}
export function createBrowserPhotoStore(factory:IDBFactory|undefined=globalThis.indexedDB):LocalPhotoStore {
 const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  if(!factory){reject(new Error('이 브라우저에서 사진 저장소를 사용할 수 없어요.'));return;}
  const request=factory.open(DATABASE,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore(STORE,{keyPath:'key'});};
  request.onerror=()=>reject(request.error??new Error('사진 저장소를 열지 못했어요.'));
  request.onblocked=()=>reject(new Error('다른 창의 사진 저장 작업이 끝난 뒤 다시 시도해 주세요.'));
  request.onsuccess=()=>resolve(request.result);
 });
 return{
  async put(record){
   const db=await open();
   try{await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite');
    // An existing image/version is immutable. Replacing a photo requires a fresh asset ID.
    transaction.objectStore(STORE).add(record);
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error??new Error('사진을 보관하지 못했어요.'));
    transaction.onabort=()=>reject(transaction.error??new Error('사진 보관이 중단되었어요.'));
   });}finally{db.close();}
  },
  async get(key){
   const db=await open();
   try{return await new Promise<LocalPhotoRecord|undefined>((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly'),request=transaction.objectStore(STORE).get(key);
    transaction.oncomplete=()=>resolve(request.result as LocalPhotoRecord|undefined);
    transaction.onerror=()=>reject(transaction.error??new Error('보관한 사진을 읽지 못했어요.'));
    transaction.onabort=()=>reject(transaction.error??new Error('사진 읽기가 중단되었어요.'));
   });}finally{db.close();}
  },
 };
}
/** Persist original image bytes before making the new image the registration draft's photo. */
export async function persistLocalPhoto(blob:Blob,ownerId:string,url:string,store:LocalPhotoStore=createBrowserPhotoStore(),scope=LOCAL_LIFE_STORAGE_KEY):Promise<Asset> {
 if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>10*1024*1024||!ownerId||!scope||!url.startsWith('blob:'))throw new Error('PNG·JPEG·WebP 10MB 이하 사진을 선택해 주세요.');
 const identity={scope,ownerId,assetId:`upload-${crypto.randomUUID()}`,version:1},key=localPhotoKey(identity);
 await store.put({...identity,key,blob});
 return{id:identity.assetId,version:identity.version,source:'upload',url,localPhotoKey:key};
}
/** Restoring is a local read. It cannot alter stored metadata, revisions, or save receipts. */
export function restoreLocalPhotos(app:DemoApp,store:LocalPhotoStore=createBrowserPhotoStore(),scope=LOCAL_LIFE_STORAGE_KEY){
 return app.restoreUploadedPhotos(async(ownerId,asset)=>{
  const identity=localPhotoIdentity(asset.localPhotoKey);
  if(!identity||identity.scope!==scope||identity.ownerId!==ownerId||identity.assetId!==asset.id||identity.version!==asset.version)return null;
  const record=await store.get(asset.localPhotoKey!);
  if(!record||record.key!==asset.localPhotoKey||record.scope!==scope||record.ownerId!==ownerId||record.assetId!==asset.id||record.version!==asset.version||!(record.blob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(record.blob.type)||!record.blob.size||record.blob.size>10*1024*1024)return null;
  return URL.createObjectURL(record.blob);
 });
}
