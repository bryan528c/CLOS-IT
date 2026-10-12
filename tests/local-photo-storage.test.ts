import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoApp} from '../src/core/app';
import {createSeed,DEMO_PROFILE,REGISTRATION_ASSET,STORAGE_KEY} from '../src/core/seed';
import {localPhotoKey} from '../src/core/localPhotoReference';
import type {StorageLike} from '../src/core/types';
import {persistLocalPhoto,restoreLocalPhotos,type LocalPhotoStore,type LocalPhotoRecord} from '../src/localPhotoStorage';

class Storage implements StorageLike {
 values=new Map<string,string>();fail=false;
 getItem(key:string){return this.values.get(key)??null;}
 setItem(key:string,value:string){if(this.fail)throw new Error('Quota exceeded');this.values.set(key,value);}
 removeItem(key:string){this.values.delete(key);}
}
class Photos implements LocalPhotoStore {
 records=new Map<string,LocalPhotoRecord>();fail=false;
 async put(record:LocalPhotoRecord){if(this.fail)throw new Error('photo quota');if(this.records.has(record.key))throw new Error('immutable');this.records.set(record.key,structuredClone(record));}
 async get(key:string){return this.records.get(key);}
}
const blob=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,255])],{type:'image/png'}),fast={delayMs:0};

test('durable image restores original bytes, draft, garment and receipt without rewriting metadata or duplicating saves',async()=>{
 const storage=new Storage(),photos=new Photos(),app=new DemoApp(storage),original=blob();app.beginRegistration();app.editRegistration({name:'영속 사진 의류',color:'직접 확인'});
 const asset=await persistLocalPhoto(original,DEMO_PROFILE,'blob:first-session',photos,STORAGE_KEY);app.replaceRegistrationPhoto(asset);
 const saved=await app.saveGarment('save-once',fast),raw=storage.getItem(STORAGE_KEY)!;
 assert(!raw.includes('blob:first-session'));assert(!raw.includes('base64'));assert.equal(photos.records.size,1);
 const restarted=new DemoApp(storage),revision=restarted.registrationDraft()!.revision;
 assert.equal(restarted.garment(saved.entity.id).asset!.url,null);
 assert.deepEqual(await restoreLocalPhotos(restarted,photos,STORAGE_KEY),{restored:1,missing:0});
 const restored=restarted.garment(saved.entity.id).asset!;
 assert(restored.url?.startsWith('blob:'));assert.equal(restored.needsReselection,false);
 assert.deepEqual(new Uint8Array(await(await fetch(restored.url!)).arrayBuffer()),new Uint8Array(await original.arrayBuffer()));
 assert.equal(restarted.registrationDraft()!.asset!.url,restored.url);assert.equal(restarted.registrationDraft()!.revision,revision);assert.equal(restarted.registrationDraft()!.color,'직접 확인');
 assert.equal((restarted.receipts()[0].result as typeof saved.entity).asset!.url,restored.url);assert.equal(storage.getItem(STORAGE_KEY),raw);
 const replay=await restarted.saveGarment('different-retry-key',fast);assert.equal(replay.entity.id,saved.entity.id);assert.equal(restarted.garments().length,8);restarted.dispose();
});
test('blob write failure and metadata quota failure preserve the prior registration photograph and manual fields',async()=>{
 const storage=new Storage(),photos=new Photos(),app=new DemoApp(storage);app.beginRegistration();app.replaceRegistrationPhoto(REGISTRATION_ASSET);app.editRegistration({name:'변경 전',material:'수동 입력'});
 const before=structuredClone(app.registrationDraft());photos.fail=true;
 await assert.rejects(persistLocalPhoto(blob(),DEMO_PROFILE,'blob:new',photos,STORAGE_KEY));assert.deepEqual(app.registrationDraft(),before);
 photos.fail=false;const asset=await persistLocalPhoto(blob(),DEMO_PROFILE,'blob:new',photos,STORAGE_KEY);storage.fail=true;
 assert.throws(()=>app.replaceRegistrationPhoto(asset),/저장/);assert.deepEqual(app.registrationDraft(),before);assert.equal(app.persistence.status,'memory-only');
});
test('photo keys reject cross-profile references and wrong scope or missing bytes cannot substitute another photograph',async()=>{
 const storage=new Storage(),photos=new Photos(),app=new DemoApp(storage);app.beginRegistration();app.editRegistration({name:'same owner'});
 const asset=await persistLocalPhoto(blob(),DEMO_PROFILE,'blob:first',photos,STORAGE_KEY);
 assert.throws(()=>app.replaceRegistrationPhoto({...asset,localPhotoKey:localPhotoKey({scope:STORAGE_KEY,ownerId:'another-owner',assetId:asset.id,version:1})}),/프로필/);
 app.replaceRegistrationPhoto(asset);const saved=await app.saveGarment('own',fast),raw=storage.getItem(STORAGE_KEY);
 const wrongScope=new DemoApp(storage);assert.deepEqual(await restoreLocalPhotos(wrongScope,photos,'another-storage-area'),{restored:0,missing:1});assert.equal(wrongScope.garment(saved.entity.id).asset!.url,null);assert.equal(wrongScope.garment(saved.entity.id).asset!.needsReselection,true);assert.equal(storage.getItem(STORAGE_KEY),raw);
 photos.records.clear();const missing=new DemoApp(storage);assert.deepEqual(await restoreLocalPhotos(missing,photos,STORAGE_KEY),{restored:0,missing:1});assert.equal(missing.garment(saved.entity.id).asset!.needsReselection,true);assert.equal(storage.getItem(STORAGE_KEY),raw);
 const corrupt=JSON.parse(raw!);corrupt.garments.find((g:{id:string})=>g.id===saved.entity.id).asset.localPhotoKey=localPhotoKey({scope:STORAGE_KEY,ownerId:'another-owner',assetId:asset.id,version:1});storage.setItem(STORAGE_KEY,JSON.stringify(corrupt));assert.equal(new DemoApp(storage).persistence.reason,'corrupt');
});
test('late hydration cannot overwrite a replaced photo and disposal cancels pending hydration',async()=>{
 const storage=new Storage(),photos=new Photos(),app=new DemoApp(storage);app.beginRegistration();const asset=await persistLocalPhoto(blob(),DEMO_PROFILE,'blob:old',photos,STORAGE_KEY);app.replaceRegistrationPhoto(asset);
 const raw=storage.getItem(STORAGE_KEY)!;
 for(const action of ['replace','dispose'] as const){
  storage.setItem(STORAGE_KEY,raw);
  const restarted=new DemoApp(storage);let finish!:(url:string)=>void;const pending=restarted.restoreUploadedPhotos(()=>new Promise(resolve=>{finish=resolve;}));
  if(action==='replace')restarted.replaceRegistrationPhoto(REGISTRATION_ASSET);else restarted.dispose();
  finish(URL.createObjectURL(blob()));assert.deepEqual(await pending,{restored:0,missing:0});
  assert.equal(restarted.registrationDraft()!.asset!.url,action==='replace'?REGISTRATION_ASSET.url:null);
 }
});
test('legacy temporary uploads remain readable and explicitly require reselection without a destructive migration',async()=>{
 const storage=new Storage(),app=new DemoApp(storage,createSeed);app.beginRegistration();app.replaceRegistrationPhoto({id:'legacy-upload',version:1,source:'upload',url:'blob:legacy'});app.editRegistration({name:'기존 업로드'});const saved=await app.saveGarment('legacy',fast),raw=storage.getItem(STORAGE_KEY);
 const restarted=new DemoApp(storage);assert.deepEqual(await restoreLocalPhotos(restarted,new Photos(),STORAGE_KEY),{restored:0,missing:0});assert.equal(restarted.garment(saved.entity.id).asset!.needsReselection,true);assert.equal(storage.getItem(STORAGE_KEY),raw);
});
