import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoApp} from '../src/core/app';
import {createSeed} from '../src/core/seed';
import {captureSelectionSubmission,selectionSnapshotDraft,type SelectionSubmission} from '../src/core/selectionScenario';
import {isValidState,stable} from '../src/core/repository';
import type {StorageLike} from '../src/core/types';
import type {RemoteBackend} from '../src/integrations/backendClient';

class Store implements StorageLike{values=new Map<string,string>();writes=0;getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);this.writes++;}removeItem(){throw new Error('not permitted');}}
const date='2026-10-13',fast={delayMs:0};
const setup=()=>{const storage=new Store(),app=new DemoApp(storage);return{storage,app};};
const capture=(app:DemoApp,title?:string):SelectionSubmission=>({...captureSelectionSubmission(app.outfitDraft()!,date,app.garments(),'local-title-test-intent'),...(title!==undefined?{planTitle:title}:{})});

test('local explicit plan title is trimmed and survives retry/reload without changing snapshot IDs, original cards, drafts or actual wear',async()=>{
 const{app,storage}=setup(),submission=capture(app,'  지원님 결혼식  '),untitled={...submission};delete untitled.planTitle;
 const before=structuredClone(app.getState()),identity=await selectionSnapshotDraft(submission.submittedSnapshot);
 assert.equal(identity.draftId,(await selectionSnapshotDraft(untitled.submittedSnapshot)).draftId);
 const[first,second]=await Promise.all([app.retrySelection(submission,{delayMs:10}),app.retrySelection({...submission,planTitle:'지원님 결혼식'},fast)]);
 assert.equal(first.event.id,second.event.id);assert.equal(first.event.value,'지원님 결혼식');assert.equal(first.planTitle,'지원님 결혼식');assert.equal(second.planTitle,'지원님 결혼식');
 assert.equal(app.events().filter(e=>e.kind==='plan').length,1);assert.equal(app.events().filter(e=>e.kind==='wear').length,0);
 assert.deepEqual(first.submittedSnapshot,submission.submittedSnapshot);assert.deepEqual(app.outfitDraft(),before.outfitDrafts[before.activeProfileId]);assert.deepEqual(app.outfit(before.outfits[0].id),before.outfits[0]);
 app.editOutfitName('보존할 다른 초안 이름');const edited=structuredClone(app.outfitDraft());
 const restarted=new DemoApp(storage),writes=storage.writes,replay=await restarted.retrySelection(submission,fast);
 assert.equal(replay.replayed,true);assert.equal(replay.event.id,first.event.id);assert.equal(replay.event.value,'지원님 결혼식');assert.equal(replay.planTitle,'지원님 결혼식');assert.deepEqual(restarted.outfitDraft(),edited);assert.equal(storage.writes,writes);assert(isValidState(restarted.getState()));
});

test('changing title under the same original intent conflicts instead of overwriting an event or silently joining a pending title',async()=>{
 const{app}=setup(),first=capture(app,'지원님 결혼식'),other={...first,planTitle:'다른 일정'};
 const results=await Promise.allSettled([app.retrySelection(first,{delayMs:10}),app.retrySelection(other,fast)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const winner=results.find(r=>r.status==='fulfilled')!;assert.equal(winner.status,'fulfilled');if(winner.status!=='fulfilled')return;
 const losingTitle=winner.value.planTitle==='지원님 결혼식'?'다른 일정':'지원님 결혼식';
 const before=stable(app.getState());await assert.rejects(app.retrySelection({...first,planTitle:losingTitle},fast),/같은 저장 키/);assert.equal(stable(app.getState()),before);
 assert.equal(app.events().filter(e=>e.kind==='plan').length,1);assert.equal(app.outfits().length,2);
});

test('invalid titles and remote title submissions fail before any storage or remote command; untitled remote path remains available',async()=>{
 const{app,storage}=setup(),submission=capture(app),before=stable(app.getState()),writes=storage.writes;
 for(const title of ['', '  ', '가'.repeat(121),null,17])await assert.rejects(app.retrySelection({...submission,planTitle:title} as unknown as SelectionSubmission,fast),/일정 이름/);
 assert.equal(stable(app.getState()),before);assert.equal(storage.writes,writes);
 let saveCalls=0,eventCalls=0,draftCalls=0;
 await app.configureRemote({mode:'mock',state:async()=>createSeed(),saveOutfit:async()=>{saveCalls++;throw new Error('legacy remote save reached');},recordEvent:async()=>{eventCalls++;throw new Error('unexpected event');},putDraft:async()=>{draftCalls++;}} as unknown as RemoteBackend);
 const remoteBefore=stable(app.getState()),remoteWrites=storage.writes;
 await assert.rejects(app.retrySelection(capture(app,'지원님 결혼식'),fast),/로컬 시연/);
 assert.equal(saveCalls,0);assert.equal(eventCalls,0);assert.equal(draftCalls,0);assert.equal(storage.writes,remoteWrites);assert.equal(stable(app.getState()),remoteBefore);
 await assert.rejects(app.retrySelection(capture(app),fast),/legacy remote save reached/);assert.equal(saveCalls,1);assert.equal(eventCalls,0);
});

test('plan composition replacement keeps its original title and details, with idempotent revised event and no original mutation',async()=>{
 const{app,storage}=setup(),plan=await app.retrySelection(capture(app,'지원님 결혼식'),fast);
 app.repository.commit(s=>{s.events.find(e=>e.id===plan.event.id)!.details={sourceContext:'wedding-demo',userNote:'원래 일정 메모'};},true);
 const original=structuredClone(app.events().find(e=>e.id===plan.event.id)!);app.setOutfitItem('bottom','g-jeans');
 const submission={...captureSelectionSubmission(app.outfitDraft()!,'2026-10-20',app.garments()),planTitle:' 지원님 결혼식 '};
 const changed=await app.replacePlanWithSelection(plan.event.id,submission,'edit-plan-title',fast);
 assert.equal(changed.event.value,'지원님 결혼식');assert.equal(changed.planTitle,'지원님 결혼식');assert.deepEqual(changed.event.details,{...original.details,replacedPlanId:plan.event.id});assert.deepEqual(app.events().find(e=>e.id===plan.event.id),original);
 const restarted=new DemoApp(storage),count=restarted.events().length,replay=await restarted.replacePlanWithSelection(plan.event.id,submission,'edit-plan-title',fast);assert.equal(replay.event.id,changed.event.id);assert.equal(restarted.events().length,count);
 await assert.rejects(restarted.replacePlanWithSelection(changed.event.id,{...submission,planTitle:'다른 일정'},'cannot-rename',fast),/원래 일정 이름/);
 assert.equal(restarted.events().filter(e=>e.kind==='wear').length,0);assert(isValidState(restarted.getState()));
});

test('untitled legacy local selection keeps the previous event value and omits optional title',async()=>{
 const{app}=setup(),result=await app.commitCurrentSelection(date,fast);
 assert.equal(result.event.value,'코디 계획');assert.equal(Object.hasOwn(result,'planTitle'),false);
});
