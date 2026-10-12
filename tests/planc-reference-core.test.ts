import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {StorageLike} from '../src/core/types';
import {stable,isValidState} from '../src/core/repository';
import {createLocalLifeApp} from '../src/localLifeStorage';
import {installPlanCReferences} from '../src/planc/data';
import {PLAN_C_FIXTURE_IDS as ids,PLAN_C_PROFILE_IDS as profiles} from '../src/planc/sceneConfig';
import {applyReviewedReferenceCore,dryRunReferenceCore,installedReferenceCore,normalizedReferenceDigest,referenceSha256,type NormalizedReferenceCore} from '../src/planc/referenceCoreAdapter';
import {readLocalReferenceAsset,referenceVisibleLocation,resolveReferenceSavedFitting} from '../src/planc/referenceCoreFitting';
import {selectFittingPresentation,type FittingSnapshot} from '../src/mirrorScene';

class Store implements StorageLike{values=new Map<string,string>();writes=0;fail=false;getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){if(this.fail)throw new Error('Quota');this.writes++;this.values.set(k,v);}removeItem(){throw new Error('not permitted');}}
// The existing approved PNG is used ONLY as bytes for isolated hash/reader tests.
// These fixtures are never imported by the app and are not claimed to depict the synthetic fitting identities below.
const bytes=Uint8Array.from(readFileSync(new URL('../public/assets/planc/approved_original_trench.png',import.meta.url)));
async function fixture(){
 const store=new Store(),{app}=createLocalLifeApp(store);installPlanCReferences(app);
 const sha256=await referenceSha256(bytes);
 const pack:NormalizedReferenceCore={adapterVersion:'app-reference-core-review-v1',releaseId:'isolated-test-not-a-real-release',version:'test.1',releaseStatus:'version-locked',baseUrl:'/assets/planc/',
  profiles:[{logicalRef:'PHW',runtimeProfileId:profiles.hwijae}],
  assets:['top','bottom','person','result'].map((ref,index)=>({ref,id:`isolated-test-asset-${ref}`,version:index+1,path:`test-${ref}.png`,sha256,mediaType:'image/png'})),
  garments:[{ref:'test-top',logicalProfile:'PHW',runtimeGarmentId:ids.hwijaeWhiteShirt,category:'top',expectedRevision:1,assetRef:'top',visibleLocationRef:'test-explicit-location'},
    {ref:'test-bottom',logicalProfile:'PHW',runtimeGarmentId:ids.hwijaeBeigePants,category:'bottom',expectedRevision:1,assetRef:'bottom'}],
  people:[{ref:'test-person',logicalProfile:'PHW',assetRef:'person'}],
  results:[{id:'test-result',origin:'reference_saved',logicalProfile:'PHW',personRef:'test-person',assetRef:'result',items:[{slot:'top',garmentRef:'test-top',assetRef:'top'},{slot:'bottom',garmentRef:'test-bottom',assetRef:'bottom'}]}]};
 const manifestBytes=new TextEncoder().encode('Isolated app boundary test, not a released pack manifest.');
 const input=async(p=pack)=>({pack:p,manifestBytes,expectedManifestSha256:await referenceSha256(manifestBytes),expectedNormalizedSha256:await normalizedReferenceDigest(p)});
 const dry=async(p=pack,readFile:()=>Promise<Uint8Array|null>=async()=>bytes)=>dryRunReferenceCore(await input(p),app.getState(),{readFile});
 const install=async()=>{const report=await dry();assert.equal(report.status,'ready');assert.equal(applyReviewedReferenceCore(report,app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'installed');return{report,catalog:installedReferenceCore(report,app.getState())!};};
 const snapshot:FittingSnapshot={ownerId:profiles.hwijae,person:{assetId:'isolated-test-asset-person',assetVersion:3},outfit:{draftId:'test-current-draft',outfitId:null,revision:2,items:[
  {slot:'top',garmentId:ids.hwijaeWhiteShirt,assetId:'isolated-test-asset-top',assetVersion:1},{slot:'bottom',garmentId:ids.hwijaeBeigePants,assetId:'isolated-test-asset-bottom',assetVersion:2}]},requestVersion:7};
 return{app,store,pack,input,dry,install,snapshot};
}

test('locked release dry-run verifies actual approved file bytes without repository writes; apply is additive asset attachment only',async()=>{
 const f=await fixture(),before=structuredClone(f.app.getState()),writeCount=f.store.writes,report=await f.dry();
 assert.equal(report.status,'ready');assert.equal(report.changes.length,2);assert.equal(f.store.writes,writeCount);assert.deepEqual(f.app.getState(),before);
 assert.equal(applyReviewedReferenceCore(report,f.app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'installed');
 const after=f.app.getState();assert(isValidState(after));
 for(const key of ['profiles','outfits','outfitDrafts','previousOutfitDrafts','registrationDrafts','events','ui','receipts','intents','activeProfileId'] as const)assert.deepEqual(after[key],before[key],key);
 for(const g of before.garments){const current=after.garments.find(row=>row.id===g.id)!;assert.deepEqual({...current,asset:g.asset,revision:g.revision},g);}
});
test('repeat import and independent restart preserve user edits, explicit location clear, drafts and histories',async()=>{
 const f=await fixture();await f.install();
 f.app.setActiveProfile(profiles.hwijae);f.app.loadOutfitDraft(ids.hwijaeSelectedOutfit);f.app.editOutfitName('사용자 편집 중 · 재설치로 초기화 금지');
 f.app.repository.commit(s=>{const g=s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!;g.name='사용자가 바꾼 이름';g.asset=null;g.location='';g.provenance.location='user';g.revision+=1;},true);
 const before=stable(f.app.getState()),writes=f.store.writes,report=await f.dry();assert.equal(report.status,'restored');
 assert.equal(applyReviewedReferenceCore(report,f.app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'restored');
 const restarted=createLocalLifeApp(f.store).app;assert.equal(stable(restarted.getState()),before);assert.equal(f.store.writes,writes);
});
test('hash errors, intermediate release and unsafe base/path quarantine before writes or unauthorized file access',async()=>{
 const f=await fixture(),before=stable(f.app.getState());
 for(const [field,value,code] of [['releaseStatus','building','unlocked-release'],['baseUrl','https://example.invalid/assets/','bad-base-url']] as const){
  const pack=structuredClone(f.pack);(pack as unknown as Record<string,string>)[field]=value;let reads=0;
  const report=await f.dry(pack,async()=>{reads++;return bytes;});assert.equal(report.status,'quarantined');assert(report.issues.some(i=>i.code===code));assert.equal(reads,0);
 }
 const pack=structuredClone(f.pack);pack.assets[0].path='../private.env';const requested:string[]=[];
 const report=await dryRunReferenceCore(await f.input(pack),f.app.getState(),{readFile:async path=>{requested.push(path);return bytes;}});
 assert(report.issues.some(i=>i.code==='unsafe-path'));assert(!requested.includes('../private.env'));
 const input=await f.input();input.expectedManifestSha256='0'.repeat(64);let reads=0;
 const hashReport=await dryRunReferenceCore(input,f.app.getState(),{readFile:async()=>{reads++;return bytes;}});assert.equal(reads,0);assert(hashReport.issues.some(i=>i.code==='manifest-hash-mismatch'));
 assert.equal(stable(f.app.getState()),before);
});
test('missing and changed bytes, wrong profile/category/raw ID and ambiguous references stay quarantined',async()=>{
 const f=await fixture();
 const missing=await f.dry(f.pack,async()=>null);assert(missing.issues.some(i=>i.code==='file-missing'));
 const changed=await f.dry(f.pack,async()=>new Uint8Array([1,2,3]));assert(changed.issues.some(i=>i.code==='file-hash-mismatch'));
 for(const mutate of [(p:NormalizedReferenceCore)=>{p.garments[0].runtimeGarmentId='H01';},(p:NormalizedReferenceCore)=>{p.profiles[0].runtimeProfileId=profiles.sujin;},(p:NormalizedReferenceCore)=>{p.garments[0].category='hat';},(p:NormalizedReferenceCore)=>{p.assets.push(p.assets[0]);}]){
  const p=structuredClone(f.pack);mutate(p);assert.equal((await f.dry(p)).status,'quarantined');
 }
});
test('existing image/binding, stale revision and different installed version are not overwritten',async()=>{
 const f=await fixture();f.app.repository.commit(s=>{s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!.displayBinding=null;});
 assert((await f.dry()).issues.some(i=>i.code==='asset-conflict'));
 const other=await fixture();other.app.repository.commit(s=>{s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!.revision++;});
 assert((await other.dry()).issues.some(i=>i.code==='revision-conflict'));
 const installed=await fixture();await installed.install();installed.pack.version='test.2';assert((await installed.dry()).issues.some(i=>i.code==='release-conflict'));
});
test('forged/edited dry-run, changed garment after review, remote mode and quota cannot cause partial import',async()=>{
 const f=await fixture(),report=await f.dry(),before=stable(f.app.getState());
 assert.equal(applyReviewedReferenceCore({...report},f.app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'blocked');
 assert.equal(applyReviewedReferenceCore(report,f.app.repository,{connectionKind:'remote',reviewedFingerprint:report.fingerprint}).status,'blocked');
 f.store.fail=true;assert.equal(applyReviewedReferenceCore(report,f.app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'blocked');assert.equal(stable(f.app.getState()),before);
 const g=await fixture(),r=await g.dry();g.app.repository.commit(s=>{s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!.location='사용자가 옮긴 위치';});
 assert.equal(applyReviewedReferenceCore(r,g.app.repository,{connectionKind:'local',reviewedFingerprint:r.fingerprint}).status,'blocked');
 const e=await fixture(),edited=await e.dry();edited.changes=[];assert.equal(applyReviewedReferenceCore(edited,e.app.repository,{connectionKind:'local',reviewedFingerprint:edited.fingerprint}).status,'blocked');
});
test('exact full-profile/person/version outfit produces reference_saved only; stale or changed input never substitutes',async()=>{
 const f=await fixture(),{catalog}=await f.install();
 const resolve=(snapshot=f.snapshot,currentSnapshot=snapshot)=>resolveReferenceSavedFitting({catalog,state:f.app.getState(),snapshot,currentSnapshot});
 const result=resolve();assert.equal(result.status,'ready');if(result.status!=='ready')return;
 assert.equal(result.candidate.origin,'reference_saved');assert.equal(selectFittingPresentation({current:f.snapshot,request:null,result:result.candidate}).label,'준비된 레퍼런스 착장 · 실제 API 결과 아님');
 for(const mutate of [(s:FittingSnapshot)=>{s.ownerId=profiles.sujin;},(s:FittingSnapshot)=>{s.person.assetVersion++;},(s:FittingSnapshot)=>{s.person.assetId='other-person';},(s:FittingSnapshot)=>{s.outfit.items[0].assetVersion++;},(s:FittingSnapshot)=>{s.outfit.items.pop();},(s:FittingSnapshot)=>{s.outfit.items[0].garmentId=ids.hwijaeRoundNeck;},(s:FittingSnapshot)=>{s.outfit.externalItems=[{slot:'shoes',externalItemId:'external',assetId:'external-photo',assetVersion:1}];}]){
  const s=structuredClone(f.snapshot);mutate(s);assert.notEqual(resolve(s).status,'ready');
 }
 const stale=structuredClone(f.snapshot);stale.requestVersion++;assert.equal(resolve(f.snapshot,stale).status,'error');
});
test('current repository asset replacement and tampered prepared catalog reject prior saved result',async()=>{
 const f=await fixture(),{catalog}=await f.install();
 f.app.repository.commit(s=>{s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!.asset!.version++;});
 assert.equal(resolveReferenceSavedFitting({catalog,state:f.app.getState(),snapshot:f.snapshot}).status,'error');
 const g=await fixture(),installed=await g.install();installed.catalog.pack.results[0].assetRef='person';
 assert.equal(resolveReferenceSavedFitting({catalog:installed.catalog,state:g.app.getState(),snapshot:g.snapshot}).status,'error');
});
test('explicit scene location is read-only, profile-scoped and disabled by a user move/clear; shoes are never synthesized',async()=>{
 const f=await fixture(),{catalog}=await f.install(),before=stable(f.app.getState());
 assert.equal(referenceVisibleLocation(catalog,f.app.getState(),profiles.hwijae,ids.hwijaeWhiteShirt),'test-explicit-location');
 assert.equal(referenceVisibleLocation(catalog,f.app.getState(),profiles.sujin,ids.hwijaeWhiteShirt),null);
 assert.equal(referenceVisibleLocation(catalog,f.app.getState(),profiles.hwijae,ids.hwijaeBlackShoes),null);assert.equal(stable(f.app.getState()),before);
 f.app.repository.commit(s=>{s.garments.find(g=>g.id===ids.hwijaeWhiteShirt)!.provenance.location='user';});
 assert.equal(referenceVisibleLocation(catalog,f.app.getState(),profiles.hwijae,ids.hwijaeWhiteShirt),null);
});
test('asset diagnostics separate null/url/base/404/revoked blob/mapping and loader errors without remote fallback',async()=>{
 const origin='http://127.0.0.1:4311',asset={id:'test',version:1,source:'packaged' as const,url:'/assets/planc/approved_original_trench.png'};
 let requests=0;const fetcher=(async()=>{requests++;return new Response(bytes,{headers:{'content-type':'image/png'}});}) as typeof fetch;
 const read=(value:typeof asset|null,fetch=fetcher,expected?:{id:string;version:number})=>readLocalReferenceAsset(value,{origin,fetch,expected});
 assert.equal((await read(asset)).status,'ready');
 const cases=[await read(null),await read({...asset,url:null} as unknown as typeof asset),await read({...asset,url:'https://foreign.invalid/image.png'}),await read(asset,async()=>new Response(null,{status:404})),await read({...asset,url:`blob:${origin}/revoked`},async()=>{throw new TypeError('revoked');}),await read(asset,fetcher,{id:'different',version:1}),await read(asset,async()=>new Response('not image',{headers:{'content-type':'text/html'}}))];
 assert.deepEqual(cases.map(r=>r.status==='ready'?null:r.reason),['null-asset','missing-asset-url','bad-base-url','file-404','revoked-blob','mapping-mismatch','asset-load-error']);assert.equal(requests,1);
 assert.equal(resolveReferenceSavedFitting({catalog:null,state:(await fixture()).app.getState(),snapshot:null}).status,'missing');
});
