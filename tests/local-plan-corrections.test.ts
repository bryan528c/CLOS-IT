import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoApp} from '../src/core/app';
import {createSeed,DEMO_PROFILE,emptyUI} from '../src/core/seed';
import {captureSelectionSubmission} from '../src/core/selectionScenario';
import {effectiveLifeEvents,lifeEventDate} from '../src/lifeHistory';
import {isValidState} from '../src/core/repository';
import type {StorageLike} from '../src/core/types';
import type {RemoteBackend} from '../src/integrations/backendClient';
class Storage implements StorageLike {
 data=new Map<string,string>();fail=false;writes=0;
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){if(this.fail)throw new Error('Quota exceeded');this.data.set(key,value);this.writes++;}
 removeItem(key:string){this.data.delete(key);}
}
const fast={delayMs:0},date='2026-10-13';
const setup=()=>{const storage=new Storage(),app=new DemoApp(storage);return{storage,app};};
test('explicit cancellation appends a voided revision, preserves original plan and wear, and replays after restart',async()=>{
 const{app,storage}=setup(),plan=await app.commitCurrentSelection(date,fast);await app.recordWear(plan.savedOutfit.id,date,'actual-wear',fast);
 const before=structuredClone(app.getState()),[first,second]=await Promise.all([app.cancelPlan(plan.event.id,'cancel-once',{delayMs:10}),app.cancelPlan(plan.event.id,'cancel-once',fast)]);
 assert.equal(first.entity.id,second.entity.id);assert.equal(first.entity.voided,true);assert.equal(first.entity.revision,2);assert.equal(first.entity.sourceEventKey,plan.event.id);
 assert.deepEqual(app.events().find(event=>event.id===plan.event.id),plan.event);assert.deepEqual(app.outfit(plan.savedOutfit.id),plan.savedOutfit);assert.equal(app.events().length,before.events.length+1);
 const effective=effectiveLifeEvents(DEMO_PROFILE,app.events());assert.equal(effective.events.filter(e=>e.kind==='plan').length,0);assert.equal(effective.events.filter(e=>e.kind==='wear').length,1);assert.deepEqual(effective.issues,[]);assert(isValidState(app.getState()));
 const restarted=new DemoApp(storage),count=restarted.events().length,retry=await restarted.cancelPlan(plan.event.id,'another-retry-key',fast);assert.equal(retry.replayed,true);assert.equal(retry.entity.id,first.entity.id);assert.equal(restarted.events().length,count);
});
test('plan replacement commits one detached outfit and revised event atomically for the chosen date, preserving cards and original records',async()=>{
 const{app,storage}=setup(),plan=await app.commitCurrentSelection(date,fast),original=structuredClone(app.getState());app.setOutfitItem('bottom','g-jeans');
 const submission=captureSelectionSubmission(app.outfitDraft()!,'2026-10-20',app.garments()),beforeWrites=storage.writes;
 const replaced=await app.replacePlanWithSelection(plan.event.id,submission,'replace-once',fast);assert.equal(storage.writes-beforeWrites,1);
 assert.notEqual(replaced.savedOutfit.id,plan.savedOutfit.id);assert.equal(replaced.savedOutfit.items.bottom,'g-jeans');assert.equal(replaced.event.date,'2026-10-20');assert.equal(replaced.event.revision,2);assert.equal(replaced.event.sourceEventKey,plan.event.id);
 assert.deepEqual(app.events().find(event=>event.id===plan.event.id),plan.event);assert.deepEqual(app.outfit(plan.savedOutfit.id),plan.savedOutfit);assert.equal(app.cardOutfits().length,original.outfits.filter(o=>o.purpose!=='selection').length);assert.equal(app.events().filter(e=>e.kind==='wear').length,0);
 app.setOutfitItem('bottom','g-slacks');assert.equal(app.outfit(replaced.savedOutfit.id).items.bottom,'g-jeans');
 const restarted=new DemoApp(storage),count=restarted.outfits().length,replay=await restarted.replacePlanWithSelection(plan.event.id,submission,'retry-alias',fast);assert.equal(replay.replayed,true);assert.equal(replay.event.id,replaced.event.id);assert.equal(restarted.outfits().length,count);
 const plans=effectiveLifeEvents(DEMO_PROFILE,restarted.events()).events.filter(e=>e.kind==='plan');assert.equal(plans.length,1);assert.equal(lifeEventDate(plans[0]),'2026-10-20');assert(isValidState(restarted.getState()));
 await assert.rejects(restarted.cancelPlan(plan.event.id,'stale-target',fast),/바뀌었/);
 await restarted.cancelPlan(replaced.event.id,'cancel-revised',fast);assert.equal(effectiveLifeEvents(DEMO_PROFILE,restarted.events()).events.filter(e=>e.kind==='plan').length,0);
});
test('concurrent retries deduplicate replacement, while changed content on the original intent conflicts',async()=>{
 const{app}=setup(),plan=await app.commitCurrentSelection(date,fast);app.setOutfitItem('bottom','g-jeans');const submission=captureSelectionSubmission(app.outfitDraft()!,date,app.garments());
 const [first,second]=await Promise.all([app.replacePlanWithSelection(plan.event.id,submission,'replace',{delayMs:10}),app.replacePlanWithSelection(plan.event.id,submission,'replace',fast)]);assert.equal(first.event.id,second.event.id);assert.equal(first.savedOutfit.id,second.savedOutfit.id);
 const before=structuredClone(app.getState()),changed=structuredClone(submission);changed.submittedSnapshot.date='2026-10-21';await assert.rejects(app.replacePlanWithSelection(plan.event.id,changed,'replace',fast),/같은 저장 키/);assert.deepEqual(app.getState(),before);
});
test('quota failures leave both prior plan and outfit intact with no half replacement or cancellation',async()=>{
 const{app,storage}=setup(),plan=await app.commitCurrentSelection(date,fast),submission=captureSelectionSubmission(app.outfitDraft()!,'2026-10-21',app.garments()),before=structuredClone(app.getState());storage.fail=true;
 await assert.rejects(app.replacePlanWithSelection(plan.event.id,submission,'quota-replace',fast),/저장/);assert.deepEqual(app.getState(),before);
 await assert.rejects(app.cancelPlan(plan.event.id,'quota-cancel',fast),/저장/);assert.deepEqual(app.getState(),before);
});
test('corrections reject other-profile plans, invalid dates, changed assets and remote mode without any remote writes',async()=>{
 const storage=new Storage(),seed=createSeed();seed.profiles.push({id:'other',name:'다른 시연 프로필'});seed.ui.other=emptyUI();const app=new DemoApp(storage,()=>seed),plan=await app.commitCurrentSelection(date,fast),submission=captureSelectionSubmission(app.outfitDraft()!,date,app.garments());
 app.setActiveProfile('other');await assert.rejects(app.cancelPlan(plan.event.id,'other',fast),/프로필/);await assert.rejects(app.replacePlanWithSelection(plan.event.id,submission,'other',fast),/프로필/);app.setActiveProfile(DEMO_PROFILE);
 const invalid=structuredClone(submission);invalid.submittedSnapshot.date='2026-02-31';await assert.rejects(app.replacePlanWithSelection(plan.event.id,invalid,'invalid',fast),/날짜/);
 app.repository.commit(state=>{state.garments.find(g=>g.id==='g-knit')!.asset!.version++;});await assert.rejects(app.replacePlanWithSelection(plan.event.id,submission,'stale-photo',fast),/사진/);
 let calls=0;await app.configureRemote({state:async()=>createSeed(),recordEvent:async()=>{calls++;throw new Error('unexpected remote write');}} as unknown as RemoteBackend);
 await assert.rejects(app.cancelPlan('outfit-prepared','remote',fast),/원격/);await assert.rejects(app.replacePlanWithSelection('outfit-prepared',submission,'remote',fast),/원격/);assert.equal(calls,0);
});
