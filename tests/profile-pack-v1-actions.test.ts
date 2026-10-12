import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalLifeApp} from '../src/localLifeStorage';
import {stable} from '../src/core/repository';
import {installPlanCReferences,referenceGarments,referenceOutfits,referenceCareEvents} from '../src/planc/data';
import {profilePackV1Catalog as catalog} from '../src/planc/profilePackV1Catalog';
import {applyProfilePackV1,dryRunProfilePackV1} from '../src/planc/profilePackV1Adapter';
import {profilePackV1UnassignedSchedules} from '../src/planc/profilePackV1Calendar';
import {PLAN_C_PROFILE_IDS as profiles,PLAN_C_FIXTURE_IDS as ids} from '../src/planc/sceneConfig';
import {effectiveLifeEvents} from '../src/lifeHistory';
import {captureSelectionSubmission} from '../src/core/selectionScenario';
import type {StorageLike} from '../src/core/types';
class Store implements StorageLike{values=new Map<string,string>();writes=0;fail=false;getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){if(this.fail)throw Error('quota');this.values.set(k,v);this.writes++;}removeItem(){throw Error('no reset');}}
const baseline={garments:referenceGarments(),outfits:referenceOutfits(),events:referenceCareEvents()};
function fixture(){const store=new Store(),{app}=createLocalLifeApp(store);installPlanCReferences(app);const report=dryRunProfilePackV1(catalog,app.getState(),{baseline});assert.equal(applyProfilePackV1(report,app.repository,{connectionKind:'local',reviewedFingerprint:report.fingerprint}).status,'installed');app.setActiveProfile(profiles.hwijae);return{store,app};}
test('bookmark is an explicit owner-scoped durable preference, separate from card save, recommendation and wear',()=>{
 const {app,store}=fixture();assert.equal(app.isOutfitBookmarked(ids.hwijaeRecommendedOutfit),false);assert.equal(app.isOutfitBookmarked(ids.hwijaeSelectedOutfit),true);
 const before=structuredClone(app.getState());assert.equal(app.setOutfitBookmark(ids.hwijaeRecommendedOutfit,true),true);assert.equal(app.isOutfitBookmarked(ids.hwijaeRecommendedOutfit),true);
 assert.deepEqual(app.getState().outfits,before.outfits);assert.deepEqual(app.getState().events,before.events);assert.deepEqual(app.getState().outfitDrafts,before.outfitDrafts);assert.deepEqual(app.getState().lifeData?.[profiles.sujin],before.lifeData?.[profiles.sujin]);
 const writes=store.writes;app.setOutfitBookmark(ids.hwijaeRecommendedOutfit,true);assert.equal(store.writes,writes);
 app.setOutfitBookmark(ids.hwijaeSelectedOutfit,false);assert.equal(app.isOutfitBookmarked(ids.hwijaeSelectedOutfit),false);
 const raw=stable(app.getState()),restarted=createLocalLifeApp(store).app;assert.equal(stable(restarted.getState()),raw);assert.equal(restarted.isOutfitBookmarked(ids.hwijaeSelectedOutfit),false);
 const replay=dryRunProfilePackV1(catalog,restarted.getState(),{baseline});assert.equal(applyProfilePackV1(replay,restarted.repository,{connectionKind:'local',reviewedFingerprint:replay.fingerprint}).status,'restored');assert.equal(restarted.isOutfitBookmarked(ids.hwijaeSelectedOutfit),false);
 restarted.setActiveProfile(profiles.sujin);assert.equal(restarted.isOutfitBookmarked(ids.hwijaeRecommendedOutfit),false);assert.throws(()=>restarted.setOutfitBookmark(ids.hwijaeRecommendedOutfit,true));
});
test('bookmark write failure retains prior preference and no unrelated preference is removed',()=>{
 const {app,store}=fixture(),before=structuredClone(app.getState()),unrelated=before.lifeData![profiles.hwijae].preferences.filter(p=>p.outfitId!==ids.hwijaeSelectedOutfit);store.fail=true;assert.throws(()=>app.setOutfitBookmark(ids.hwijaeSelectedOutfit,false));assert.deepEqual(app.getState(),before);
 store.fail=false;const restarted=createLocalLifeApp(store).app;restarted.setOutfitBookmark(ids.hwijaeSelectedOutfit,false);assert.deepEqual(restarted.getState().lifeData![profiles.hwijae].preferences,unrelated);
});
test('unassigned schedule projection has no invented outfit and disappears only after exact title/date selection; cancellation restores projection',async()=>{
 const {app}=fixture(),read=()=>profilePackV1UnassignedSchedules(catalog,app.getState(),profiles.hwijae,effectiveLifeEvents(profiles.hwijae,app.events()).events),before=stable(app.getState());
 assert.equal(read().length,1);assert.equal(read()[0].date,'2026-10-13');assert.equal(read()[0].title,'지원님 결혼식');assert.equal(read()[0].startsAt,null);assert.equal(stable(app.getState()),before);
 assert.deepEqual(profilePackV1UnassignedSchedules(catalog,app.getState(),profiles.sujin,app.events()),[]);
 await app.planOutfit(ids.hwijaeSelectedOutfit,'2026-10-13','other-title-plan',{delayMs:0});assert.equal(read().length,1);
 app.loadOutfitDraft(ids.hwijaeSelectedOutfit);const submission={...captureSelectionSubmission(app.outfitDraft()!,'2026-10-13',app.garments(),'bookmark-test-wedding'),planTitle:'지원님 결혼식'};
 const saved=await app.retrySelection(submission,{delayMs:0});assert.equal(read().length,0);assert.equal(app.getState().events.filter(e=>e.id==='planc:event:hwijae-wedding-20261013').length,0);
 const wearCount=app.events().filter(e=>e.kind==='wear').length;await app.cancelPlan(saved.event.id,'cancel-wedding',{delayMs:0});assert.equal(read().length,1);assert.equal(app.events().filter(e=>e.kind==='wear').length,wearCount);
});
