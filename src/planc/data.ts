import type {DemoApp} from '../core/app';
import type {DemoEvent,DemoState,Garment,Outfit,Slot,StorageLike} from '../core/types';
import {effectiveLifeEvents,lifeEventDate,lifeEventKind,lifeEventSource} from '../lifeHistory';
import {PLAN_C_FIXTURE_IDS as ids,PLAN_C_REFERENCE_BINDINGS as bindings,PLAN_C_PROFILE_IDS as profiles,PLAN_C_SCENE} from './sceneConfig';

import {profilePackV1Catalog} from './profilePackV1Catalog';
import {resolveProfilePackV1Locations} from './profilePackV1Presentation';

const NAMESPACE='planc-reference-20261013-v1';
export const PLAN_C_CARE_NAMESPACE='planc-care-reference-20261013-v1';
export const PLAN_C_CARE_EVENT_IDS={
 recentCare:'planc:event:sujin-trench-care-20261010',
 recentWash:'planc:event:sujin-trench-wash-20261004',
} as const;
const CARE_FINGERPRINT='approved-S02-recent-care-20261010-recent-wash-20261004-v1';
const categories:Record<string,Slot>={
 [ids.sujinTrench]:'outer',[ids.hwijaeNavyJacket]:'outer',[ids.hwijaeWhiteShirt]:'top',[ids.hwijaeBeigePants]:'bottom',[ids.hwijaeBlackShoes]:'shoes',
 [ids.hwijaeCasualJacket]:'outer',[ids.hwijaeRoundNeck]:'top',[ids.hwijaeNavyPants]:'bottom',[ids.hwijaeWhiteSneakers]:'shoes',
};
export function referenceGarments():Garment[]{return bindings.map(row=>({id:row.garmentId,ownerId:row.profileId,name:row.name,category:categories[row.garmentId],color:'',features:['Plan C 승인 레퍼런스의 시연 항목 · 실제 소유 기록 아님'],material:'',size:'',location:'',careNotes:'',provenance:{location:'unconfirmed',size:'unconfirmed',care:'unconfirmed'},revision:1,asset:row.assetId&&row.assetUrl?{id:row.assetId,version:row.assetVersion!,source:'packaged',url:row.assetUrl}:null}));}
export function referenceOutfits():Outfit[]{return [
 {id:ids.hwijaeRecommendedOutfit,name:'결혼식 추천 코디',items:{outer:ids.hwijaeNavyJacket,top:ids.hwijaeWhiteShirt,bottom:ids.hwijaeBeigePants,shoes:ids.hwijaeBlackShoes}},
 {id:ids.hwijaeSelectedOutfit,name:'스크랩한 캐주얼 코디',items:{outer:ids.hwijaeCasualJacket,top:ids.hwijaeRoundNeck,bottom:ids.hwijaeNavyPants,shoes:ids.hwijaeWhiteSneakers}},
].map(row=>({...row,ownerId:profiles.hwijae,purpose:'card' as const,nameOrigin:'user' as const,revision:1,assetVersions:Object.fromEntries(Object.values(row.items).map(id=>[id,0])),assetIds:Object.fromEntries(Object.values(row.items).map(id=>[id,null]))}));}
/** S02 states only a care date and a wash date; neither a treatment method nor a time was supplied. */
export function referenceCareEvents():DemoEvent[]{return [
 {id:PLAN_C_CARE_EVENT_IDS.recentCare,date:'2026-10-10',value:'관리 기록 · 시연',lifeKind:'user_observation',sourceEventKey:'planc:S02:trench-recent-care',referenceText:'최근 관리 · 3일 전'},
 {id:PLAN_C_CARE_EVENT_IDS.recentWash,date:'2026-10-04',value:'세탁 기록 · 시연',lifeKind:'wash_completed',sourceEventKey:'planc:S02:trench-recent-wash',referenceText:'최근 세탁 · 2026. 10. 04.'},
].map(({referenceText,...row})=>({...row,ownerId:profiles.sujin,kind:'care' as const,garmentId:ids.sujinTrench,garmentIds:[ids.sujinTrench],timePrecision:'date' as const,inputSource:'demo',sourceRef:'planc:approved-reference:S02',revision:1,voided:false,details:{approved_reference_text:referenceText,care_method_unspecified:true,_life_data:{namespace:PLAN_C_CARE_NAMESPACE,source_ref:'S02',provenance:'synthetic_life_event'}}}));}
function careReceipt(){return{version:'1',sourceFingerprint:CARE_FINGERPRINT,installedAt:new Date().toISOString()};}
function preserveBeforePlanC(storage?:StorageLike,storageKey?:string){if(storage&&storageKey){const raw=storage.getItem(storageKey);if(raw&&!storage.getItem(`${storageKey}.before-planc`))storage.setItem(`${storageKey}.before-planc`,raw);}}
/** One migration receipt prevents a later restart from recreating user-deleted demonstration records. */
function migrateReferenceCare(app:DemoApp,storage?:StorageLike,storageKey?:string){
 const state=app.getState();if(state.localDatasets?.[PLAN_C_CARE_NAMESPACE])return{status:'restored'};
 const hasCoat=state.garments.some(row=>row.id===ids.sujinTrench&&row.ownerId===profiles.sujin);
 const missing=hasCoat?referenceCareEvents().filter(row=>!state.events.some(event=>event.id===row.id||event.sourceEventKey===row.sourceEventKey)):[];
 try{
  preserveBeforePlanC(storage,storageKey);
  app.repository.commit(next=>{next.events.push(...missing);next.localDatasets={...next.localDatasets,[PLAN_C_CARE_NAMESPACE]:careReceipt()};},true);
  return{status:'restored',careMigration:'installed',careEvents:missing.length};
 }catch{return{status:'preserved-install-failed'};}
}
/** Additive, once-only, local installation. Neither IDs nor names are used to merge old clothes. */
export function installPlanCReferences(app:DemoApp,storage?:StorageLike,storageKey?:string){
 if(app.connection.kind!=='local'||app.persistence.status!=='ready')return {status:'unavailable'};
 const state=app.getState();if(state.localDatasets?.[NAMESPACE])return migrateReferenceCare(app,storage,storageKey);
 if(!Object.values(profiles).every(id=>state.profiles.some(row=>row.id===id)))return{status:'profile-missing'};
 const garments=referenceGarments(),outfits=referenceOutfits();
 if(garments.some(row=>state.garments.some(g=>g.id===row.id))||outfits.some(row=>state.outfits.some(o=>o.id===row.id)))return{status:'collision-preserved'};
 try{
  preserveBeforePlanC(storage,storageKey);
  app.repository.commit(next=>{next.garments.push(...garments);next.outfits.push(...outfits);next.events.push(...referenceCareEvents().filter(row=>!next.events.some(event=>event.id===row.id||event.sourceEventKey===row.sourceEventKey)));next.localDatasets={...next.localDatasets,[NAMESPACE]:{version:'1',sourceFingerprint:PLAN_C_SCENE.backgroundSha256,installedAt:new Date().toISOString()},[PLAN_C_CARE_NAMESPACE]:careReceipt()};},true);
  return{status:'installed',garments:garments.length,outfits:outfits.length};
 }catch{return{status:'preserved-install-failed'};}
}
/** Read projection: fixture and explicit records share the same correction/void semantics as the calendar. */
export function planCCareLabels(state:Pick<DemoState,'garments'|'events'>,owner:string,garmentId:string,today:string){
 const owned=state.garments.some(row=>row.id===garmentId&&row.ownerId===owner);
 const events=owned?effectiveLifeEvents(owner,state.events).events.filter(event=>event.kind==='care'&&(event.garmentIds?event.garmentIds.includes(garmentId):event.garmentId===garmentId)):[];
 const ordered=[...events].sort((a,b)=>lifeEventDate(a)!.localeCompare(lifeEventDate(b)!)||(lifeEventSource(a)==='scenario_fixture'?0:1)-(lifeEventSource(b)==='scenario_fixture'?0:1));
 const recentCare=ordered.at(-1),recentWash=ordered.filter(event=>lifeEventKind(event)==='wash_completed').at(-1);
 const recentCareDate=recentCare?lifeEventDate(recentCare):null,recentWashDate=recentWash?lifeEventDate(recentWash):null;
 const formatDate=(date:string)=>date.split('-').join('. ')+'.';
 const days=recentCareDate?Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(recentCareDate+'T00:00:00Z'))/86400000):null;
 return{recentCareLabel:recentCareDate?(days===0?'오늘':days!==null&&Number.isFinite(days)&&days>0?`${days}일 전`:formatDate(recentCareDate)):'기록 없음',recentWashLabel:recentWashDate?formatDate(recentWashDate):'기록 없음',recentCareDate,recentWashDate,recentCareEventId:recentCare?.id??null,recentWashEventId:recentWash?.id??null};
}
export function planCOrderedLooks(looks:Outfit[]){const first=[ids.hwijaeRecommendedOutfit,ids.hwijaeSelectedOutfit];return [...looks].sort((a,b)=>(first.includes(a.id as typeof first[number])?first.indexOf(a.id as typeof first[number]):-1)<0?first.includes(b.id as typeof first[number])?1:0:first.includes(b.id as typeof first[number])?first.indexOf(a.id as typeof first[number])-first.indexOf(b.id as typeof first[number]):-1);}
export function resolvePlanCLocations(garments:readonly Garment[],owner:string,requested:readonly string[]){
 return resolveProfilePackV1Locations(profilePackV1Catalog,garments,owner,requested,PLAN_C_SCENE.backgroundSha256);
}
/** The three H09 garments exclude footwear. Single-item shoe lookup still returns its honest unknown state. */
export function planCLocationTargets(garments:readonly Garment[],requested:readonly string[]){return [...new Set(requested)].filter(id=>requested.length===1||garments.find(g=>g.id===id)?.category!=='shoes');}
