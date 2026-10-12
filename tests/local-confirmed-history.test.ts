import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalLifeApp} from '../src/localLifeStorage';
import {localLifeId,LOCAL_LIFE_PROFILE_IDS} from '../src/lifeData/localPack';
import {buildLifeSnapshot,lifeHistoryReadOptions} from '../src/lifeSnapshot';
import {effectiveLifeEvents,lifeEventDate,lifeEventSource} from '../src/lifeHistory';
import {installPlanCReferences,PLAN_C_CARE_EVENT_IDS} from '../src/planc/data';
import {PLAN_C_FIXTURE_IDS,PLAN_C_PROFILE_IDS,PLAN_C_SCENE} from '../src/planc/sceneConfig';
import type {StorageLike} from '../src/core/types';
class Store implements StorageLike {values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}}
const fast={delayMs:0};
test('local confirmed care and movement advance the fixture history window at actual confirmation time',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-13T03:00:00Z')});
 const {app}=createLocalLifeApp(new Store()),owner=LOCAL_LIFE_PROFILE_IDS.PSU,garmentId=localLifeId('garment','S12'),contexts=structuredClone(app.getState().lifeData);
 const care=await app.recordActualCare(garmentId,'건조 완료','confirmed-care',fast),move=await app.recordMovementConfirmed(garmentId,'직접 확인 위치','confirmed-move',fast);
 for(const event of [care.entity,move.entity]){assert.equal(event.inputSource,'user_confirmed');assert.equal(event.timePrecision,'instant');assert.equal(event.occurredAt,'2026-10-13T03:00:00.000Z');assert.equal(event.date,'2026-10-13');assert.equal(lifeEventSource(event),'user_confirmed');}
 const visible=effectiveLifeEvents(owner,app.events(),lifeHistoryReadOptions(app.getState(),owner)).events;assert(visible.some(event=>event.id===care.entity.id));assert(visible.some(event=>event.id===move.entity.id));assert.deepEqual(app.getState().lifeData,contexts);
});
test('explicit wear retains its selected date without inventing an occurrence time or using plan date as history time',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-13T03:00:00Z')});
 const {app}=createLocalLifeApp(new Store()),owner=LOCAL_LIFE_PROFILE_IDS.PSU;app.loadOutfitDraft(localLifeId('outfit','LS01'));
 const plan=await app.commitCurrentSelection('2026-12-31',fast),before=lifeHistoryReadOptions(app.getState(),owner).asOf;
 assert.equal(plan.event.timePrecision,'date');assert.equal(plan.event.occurredAt,undefined);assert.equal(lifeEventDate(plan.event),'2026-12-31');
 const wear=await app.recordWear(plan.savedOutfit.id,'2026-10-12','actual-past-wear',fast);assert.equal(wear.entity.date,'2026-10-12');assert.equal(wear.entity.occurredAt,undefined);assert.equal(wear.entity.timePrecision,'date');assert.equal(lifeEventDate(wear.entity),'2026-10-12');
 assert(Date.parse(lifeHistoryReadOptions(app.getState(),owner).asOf)>Date.parse(before));assert(buildLifeSnapshot(app.getState(),owner).events.some(event=>event.id===wear.entity.id));
});
test('installed exact Plan C source exposes approved Oct10 care without rewriting imported context or relabeling fixtures',()=>{
 const {app}=createLocalLifeApp(new Store()),owner=PLAN_C_PROFILE_IDS.sujin,before=structuredClone(app.getState().lifeData);installPlanCReferences(app);
 const options=lifeHistoryReadOptions(app.getState(),owner);assert.equal(options.asOf,'2026-10-13T05:28:00.000Z');assert.deepEqual(app.getState().lifeData,before);
 const events=effectiveLifeEvents(owner,app.events(),options).events;assert(events.some(event=>event.id===PLAN_C_CARE_EVENT_IDS.recentCare));assert.equal(lifeEventSource(events.find(event=>event.id===PLAN_C_CARE_EVENT_IDS.recentCare)!),'scenario_fixture');assert.equal(app.garment(PLAN_C_FIXTURE_IDS.sujinTrench).id,PLAN_C_FIXTURE_IDS.sujinTrench);
 app.repository.commit(state=>{state.localDatasets!['planc-reference-20261013-v1'].sourceFingerprint=PLAN_C_SCENE.backgroundSha256+'-different';});assert.equal(lifeHistoryReadOptions(app.getState(),owner).asOf,before![owner].contexts.find(context=>context.id===before![owner].activeContextId)!.asOf);
});
