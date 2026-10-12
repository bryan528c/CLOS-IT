import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {stable} from '../src/core/repository';
import {createLocalLifeApp,LOCAL_LIFE_STORAGE_KEY} from '../src/localLifeStorage';
import {installPlanCReferences} from '../src/planc/data';
import {PLAN_C_PROFILE_IDS as profiles} from '../src/planc/sceneConfig';
import {checkpointBeforeProfilePack,installProfilePackV1,PROFILE_PACK_CHECKPOINT_SUFFIX,verifyProfilePackAssets} from '../src/planc/profilePackV1Runtime';
import type {StorageLike} from '../src/core/types';

class Store implements StorageLike {
 values=new Map<string,string>();writes:string[]=[];failMain=false;failBackup=false;
 getItem(key:string){return this.values.get(key)??null;}
 setItem(key:string,value:string){if(key===LOCAL_LIFE_STORAGE_KEY&&this.failMain||key.endsWith(PROFILE_PACK_CHECKPOINT_SUFFIX)&&this.failBackup)throw Error('quota');this.values.set(key,value);this.writes.push(key);}
 removeItem(){throw Error('not allowed');}
}
function fixture(){const store=new Store(),{app}=createLocalLifeApp(store);installPlanCReferences(app,store,LOCAL_LIFE_STORAGE_KEY);return{store,app};}
const root=path.resolve('public');
function fetchAssets(hook?:(url:string,bytes:Uint8Array,index:number)=>Response|void){let count=0;return {count:()=>count,fetch:(async(input:RequestInfo|URL)=>{
 const url=String(input);assert(url.startsWith('/assets/closit-profile-packs/assets/'));assert(!url.includes('..'));
 const bytes=fs.readFileSync(path.join(root,url));count++;return hook?.(url,bytes,count)??new Response(bytes);
}) as typeof fetch};}

test('private checkpoint saves exact bytes once and never copies unrelated storage keys',()=>{
 const f=fixture(),before=f.store.getItem(LOCAL_LIFE_STORAGE_KEY)!;f.store.values.set('synthetic-other-session','not-part-of-app-state');
 assert.equal(checkpointBeforeProfilePack(f.store,LOCAL_LIFE_STORAGE_KEY).status,'ready');const key=LOCAL_LIFE_STORAGE_KEY+PROFILE_PACK_CHECKPOINT_SUFFIX;assert.equal(f.store.getItem(key),before);
 f.app.repository.commit(s=>{s.ui[profiles.sujin].query='이후 사용자 검색';},true);
 assert.equal(checkpointBeforeProfilePack(f.store,LOCAL_LIFE_STORAGE_KEY).status,'ready');assert.equal(f.store.getItem(key),before);assert.equal(f.store.writes.filter(k=>k===key).length,1);
 assert.equal(f.store.getItem('synthetic-other-session'),'not-part-of-app-state');
});
test('every mounted master and variant validates and missing/hash-changed files reject',async()=>{
 const valid=fetchAssets();assert.equal(await verifyProfilePackAssets(valid.fetch),211);assert.equal(valid.count(),211);
 for(const reply of [new Response(null,{status:404}),new Response(new Uint8Array([0,1,2]))]){const broken=fetchAssets((_url,_bytes,index)=>index===1?reply:undefined);await assert.rejects(verifyProfilePackAssets(broken.fetch),/pack_asset_/);}
});
test('asset failure leaves repository and original bytes unchanged; retry installs once and replay makes no asset requests',async(t)=>{
 const f=fixture(),original=stable(f.app.getState()),originalBytes=f.store.getItem(LOCAL_LIFE_STORAGE_KEY),saved=globalThis.fetch;t.after(()=>{globalThis.fetch=saved;});
 globalThis.fetch=fetchAssets((_u,_b,index)=>index===1?new Response(null,{status:404}):undefined).fetch;
 const failed=await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY);assert.equal(failed.status,'blocked');assert.equal(stable(f.app.getState()),original);assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY),originalBytes);
 const good=fetchAssets();globalThis.fetch=good.fetch;assert.equal((await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY)).status,'installed');assert.equal(good.count(),211);
 const installed=stable(f.app.getState()),writes=f.store.writes.length;globalThis.fetch=(async()=>{throw Error('replay must not fetch');}) as typeof fetch;
 assert.equal((await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY)).status,'restored');assert.equal(f.store.writes.length,writes);assert.equal(stable(f.app.getState()),installed);
 const restarted=createLocalLifeApp(f.store).app;assert.equal(stable(restarted.getState()),installed);
 assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY+PROFILE_PACK_CHECKPOINT_SUFFIX),originalBytes);
});
test('checkpoint failure blocks before any asset request or state write',async(t)=>{
 const f=fixture(),before=stable(f.app.getState()),bytes=f.store.getItem(LOCAL_LIFE_STORAGE_KEY),writes=f.store.writes.length,saved=globalThis.fetch;t.after(()=>{globalThis.fetch=saved;});f.store.failBackup=true;
 globalThis.fetch=(async()=>{throw Error('should not fetch');}) as typeof fetch;
 const result=await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY);assert.equal(result.status,'blocked');assert.equal(stable(f.app.getState()),before);assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY),bytes);assert.equal(f.store.writes.length,writes);
});
test('a different tab saving during asset validation wins; stale import cannot overwrite it',async(t)=>{
 const f=fixture(),other=createLocalLifeApp(f.store).app,before=stable(f.app.getState()),saved=globalThis.fetch;t.after(()=>{globalThis.fetch=saved;});
 globalThis.fetch=fetchAssets((_u,_b,index)=>{if(index===1)other.repository.commit(s=>{s.ui[profiles.sujin].query='다른 창에서 이미 저장';},true);}).fetch;
 const result=await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY);assert.equal(result.status,'blocked');assert('reason'in result&&result.reason==='another_tab_changed_state');assert.equal(stable(f.app.getState()),before);
 assert.equal(JSON.parse(f.store.getItem(LOCAL_LIFE_STORAGE_KEY)!).ui[profiles.sujin].query,'다른 창에서 이미 저장');
});
test('normal scoped repository writes also reject a stale tab after a successful durable edit',()=>{
 const f=fixture(),other=createLocalLifeApp(f.store).app,before=stable(other.getState());f.app.repository.commit(s=>{s.ui[profiles.sujin].query='먼저 저장한 창';},true);
 const bytes=f.store.getItem(LOCAL_LIFE_STORAGE_KEY);assert.throws(()=>other.repository.commit(s=>{s.ui[profiles.sujin].query='오래된 창의 변경';},true));assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY),bytes);assert.equal(stable(other.getState()),before);
});
test('durable install quota failure preserves source and backup; a restarted app can retry',async(t)=>{
 const f=fixture(),before=stable(f.app.getState()),bytes=f.store.getItem(LOCAL_LIFE_STORAGE_KEY),saved=globalThis.fetch;t.after(()=>{globalThis.fetch=saved;});
 globalThis.fetch=fetchAssets((_u,_b,index)=>{if(index===211)f.store.failMain=true;}).fetch;
 assert.equal((await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY)).status,'blocked');assert.equal(stable(f.app.getState()),before);assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY),bytes);assert.equal(f.store.getItem(LOCAL_LIFE_STORAGE_KEY+PROFILE_PACK_CHECKPOINT_SUFFIX),bytes);
 f.store.failMain=false;const restarted=createLocalLifeApp(f.store).app;globalThis.fetch=fetchAssets().fetch;assert.equal((await installProfilePackV1(restarted,f.store,LOCAL_LIFE_STORAGE_KEY)).status,'installed');
});
test('unexpected storage read failure during verification returns blocked without rejecting or replacing state',async(t)=>{
 const f=fixture(),before=stable(f.app.getState()),saved=globalThis.fetch,read=f.store.getItem.bind(f.store);t.after(()=>{globalThis.fetch=saved;});let failRead=false;
 f.store.getItem=(key:string)=>{if(failRead&&key===LOCAL_LIFE_STORAGE_KEY)throw Error('browser storage inaccessible');return read(key);};
 globalThis.fetch=fetchAssets((_u,_b,index)=>{if(index===211)failRead=true;}).fetch;
 const result=await installProfilePackV1(f.app,f.store,LOCAL_LIFE_STORAGE_KEY);assert.equal(result.status,'blocked');assert('reason'in result&&result.reason==='storage_read_failed_original_preserved');assert.equal(stable(f.app.getState()),before);
});
