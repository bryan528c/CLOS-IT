import test from 'node:test';
import assert from 'node:assert/strict';
import type {StorageLike} from '../src/core/types';
import type {LocalPhotoRecord,LocalPhotoStore} from '../src/localPhotoStorage';
import {loadLocalStylePhoto,readLocalStyleReferences,saveLocalStyleReference,LOCAL_STYLE_REFERENCE_SCOPE} from '../src/localStyleReferences';
class Storage implements StorageLike {data=new Map<string,string>();fail=false;getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){if(this.fail)throw new Error('quota');this.data.set(key,value);}removeItem(key:string){this.data.delete(key);}}
class Photos implements LocalPhotoStore {data=new Map<string,LocalPhotoRecord>();fail=false;async put(record:LocalPhotoRecord){if(this.fail)throw new Error('photo quota');this.data.set(record.key,structuredClone(record));}async get(key:string){return this.data.get(key);}}
const photo=()=>new Blob([new Uint8Array([137,80,78,71,10,254])],{type:'image/png'});
test('local style photos restore bytes and remain separate by profile without touching garment storage',async()=>{
 const storage=new Storage(),photos=new Photos();storage.setItem('existing-user-data','unchanged');
 const a=await saveLocalStyleReference(photo(),'수진 참고.png','PSU','blob:temporary',storage,photos);
 const b=await saveLocalStyleReference(photo(),'휘재 참고.png','PHW','blob:temporary-b',storage,photos);
 const saved=readLocalStyleReferences('PSU',storage);assert.equal(saved.length,1);assert.equal(saved[0].id,a.id);assert.equal(saved[0].asset.url,null);assert.equal(readLocalStyleReferences('PHW',storage)[0].id,b.id);
 const url=await loadLocalStylePhoto(saved[0],photos);assert(url);assert.deepEqual(new Uint8Array(await(await fetch(url)).arrayBuffer()),new Uint8Array(await photo().arrayBuffer()));URL.revokeObjectURL(url);
 assert.equal(storage.getItem('existing-user-data'),'unchanged');assert(!Array.from(storage.data.values()).join('').includes('blob:temporary'));
 assert.equal(await loadLocalStylePhoto({...a,ownerId:'PHW'},photos),null);
});
test('failed photo or index writes preserve saved references and existing bytes',async()=>{
 const storage=new Storage(),photos=new Photos();await saveLocalStyleReference(photo(),'original','PSU','blob:a',storage,photos);const before=JSON.stringify([...storage.data]);
 photos.fail=true;await assert.rejects(saveLocalStyleReference(photo(),'new','PSU','blob:b',storage,photos));assert.equal(JSON.stringify([...storage.data]),before);
 photos.fail=false;storage.fail=true;await assert.rejects(saveLocalStyleReference(photo(),'new','PSU','blob:c',storage,photos));assert.equal(JSON.stringify([...storage.data]),before);assert.equal(readLocalStyleReferences('PSU',storage).length,1);
});
test('invalid list is not silently replaced; missing photo is distinguished from saved metadata',async()=>{
 const storage=new Storage(),photos=new Photos(),a=await saveLocalStyleReference(photo(),'original','PSU','blob:a',storage,photos);photos.data.clear();assert.equal(await loadLocalStylePhoto(a,photos),null);
 const key=LOCAL_STYLE_REFERENCE_SCOPE+':PSU';storage.setItem(key,'[{"ownerId":"wrong"}]');const raw=storage.getItem(key);assert.throws(()=>readLocalStyleReferences('PSU',storage));await assert.rejects(saveLocalStyleReference(photo(),'new','PSU','blob:b',storage,photos));assert.equal(storage.getItem(key),raw);
});
