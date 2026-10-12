/** Pure local pack projections. No filesystem, clock, network, repository or storage writes. */
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value !== null && typeof value === 'object' ? `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')}}` : JSON.stringify(value);
export function sha256(input) {
  const bytes=typeof input==='string'?new TextEncoder().encode(input):new Uint8Array(input);
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const n=Math.ceil((bytes.length+9)/64)*64,data=new Uint8Array(n);data.set(bytes);data[bytes.length]=128;
  const view=new DataView(data.buffer);view.setUint32(n-8,Math.floor(bytes.length/0x20000000));view.setUint32(n-4,(bytes.length*8)>>>0);
  const rr=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
  for(let off=0;off<n;off+=64){
    for(let j=0;j<16;j++)w[j]=view.getUint32(off+j*4);
    for(let j=16;j<64;j++){const a=w[j-15],b=w[j-2];w[j]=((rr(a,7)^rr(a,18)^(a>>>3))+w[j-16]+(rr(b,17)^rr(b,19)^(b>>>10))+w[j-7])>>>0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let j=0;j<64;j++){const t1=(h+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[j]+w[j])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;[h,g,f,e,d,c,b,a]=[g,f,e,(d+t1)>>>0,c,b,a,(t1+t2)>>>0];}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)>>>0);
  }
  return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}
export const hashRow = row => sha256(canonical(row));
export function safeRelativePath(path){
  if(typeof path!=='string'||!path||path.length>800||/[\\\x00-\x1f:#?%]/.test(path)||path.startsWith('/')||path.split('/').some(s=>!s||s==='.'||s==='..'||s.endsWith('.')||s.endsWith(' ')))throw Error('unsafe_relative_path');
  if(path.split('/').some(s=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))throw Error('reserved_path');
  return path;
}
export function resolveAsset(relativePath,baseUrl='/assets/closit-profile-packs/'){
  safeRelativePath(relativePath);
  if(typeof baseUrl!=='string'||!baseUrl.startsWith('/')||baseUrl.startsWith('//')||/[\\:#?%\x00-\x20]/.test(baseUrl)||baseUrl.split('/').some(x=>x==='.'||x==='..'))throw Error('base_url_must_be_same_origin_absolute_path');
  return baseUrl.replace(/\/+$/,'')+'/'+relativePath.split('/').map(encodeURIComponent).join('/');
}
export function assemblePack(files){
  const get=path=>{safeRelativePath(path);const bytes=files instanceof Map?files.get(path):files[path];if(!bytes)throw Error('missing_file:'+path);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));};
  const manifest=get('manifest.json'),profiles={},shared={};
  for(const ref of manifest.profileRefs){profiles[ref]={};for(const[k,path]of Object.entries(manifest.profiles[ref]))profiles[ref][k]=get(path);}
  for(const[k,path]of Object.entries(manifest.shared))shared[k]=get(path);
  return {manifest,profiles,shared,profileBindings:get(manifest.profileBindingsPath)};
}
export const allGarments=pack=>Object.values(pack.profiles).flatMap(p=>p.garments);
export const allOutfits=pack=>Object.values(pack.profiles).flatMap(p=>p.outfits);
export const allEvents=pack=>Object.values(pack.profiles).flatMap(p=>p.events);
const assetMap=pack=>new Map(pack.shared.assets.map(a=>[a.id,a]));
export function dateInSeoul(iso){
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)||!Number.isFinite(Date.parse(iso)))throw Error('timezone_qualified_instant_required');
  const date=iso.slice(0,10);if(!validDate(date))throw Error('invalid_calendar_date');
  const t=iso.slice(11,19).split(':').map(Number);if(t[0]>23||t[1]>59||t[2]>59)throw Error('invalid_clock_time');
  return new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,10);
}
export function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;}
export function effectiveEvents(events,ownerRef,asOf){
  const day=dateInSeoul(asOf),groups=new Map();
  for(const e of events.filter(e=>e.ownerRef===ownerRef)){const key=e.sourceEventKey??e.ref;groups.set(key,[...(groups.get(key)??[]),e]);}
  const output=[];
  for(const [key,rows]of groups){
    const rev=Math.max(...rows.map(e=>e.revision)),latest=rows.filter(e=>e.revision===rev);
    if(new Set(latest.map(e=>canonical({...e,ref:undefined}))).size>1)throw Error('conflicting_event_revision:'+key);
    const e=latest[0];if(e.voided)continue;
    if(e.kind!=='plan'&&(e.timePrecision==='instant'?Date.parse(e.occurredAt)>Date.parse(asOf):e.date>day))continue;
    output.push(e);
  }
  return output.sort((a,b)=>a.date.localeCompare(b.date)||(a.occurredAt??'').localeCompare(b.occurredAt??'')||a.ref.localeCompare(b.ref));
}
const washing=e=>e.kind==='care'&&['wash_completed','dry_clean_completed','professional_cleaning_completed'].includes(e.subtype);
function isAfter(e,base){if(e.timePrecision==='instant'&&base.timePrecision==='instant')return Date.parse(e.occurredAt)>Date.parse(base.occurredAt);return e.date===base.date?null:e.date>base.date;}
export function deriveGarmentSummary(pack,profileRef,garmentRef){
  const profile=pack.profiles[profileRef];if(!profile?.garments.some(g=>g.ref===garmentRef))throw Error('garment_owner_mismatch');
  const events=effectiveEvents(profile.events,profileRef,profile.profile.asOf).filter(e=>e.garmentRefs.includes(garmentRef));
  const wear=events.filter(e=>e.kind==='wear'),care=events.filter(e=>e.kind==='care'),wash=events.filter(washing).at(-1),latest=care.at(-1),dates=[...new Set(wear.map(e=>e.date))].sort();
  const uncertain=wash&&wear.some(e=>isAfter(e,wash)===null),after=wash?wear.filter(e=>isAfter(e,wash)===true):[],day=dateInSeoul(profile.profile.asOf);
  return {garmentRef,ownerRef:profileRef,asOf:profile.profile.asOf,wearCount:wear.length,wearDays:dates.length,wornDates:dates,lastWornDate:dates.at(-1)??null,lastWashDate:wash?.date??null,lastWashEventRef:wash?.ref??null,lastCareDate:latest?.date??null,lastCareEventRef:latest?.ref??null,daysSinceCare:latest?Math.round((Date.parse(day)-Date.parse(latest.date))/86400000):null,wearsAfterLastWash:wash&&!uncertain?after.length:null,wearDaysAfterLastWash:wash&&!uncertain?new Set(after.map(e=>e.date)).size:null,orderingUnknown:!!uncertain,evidenceEventRefs:events.map(e=>e.ref),provenance:'derived_from_events'};
}
export function fittingSignaturePayload(request){
  return {profileRef:request.profileRef,personRef:request.personRef,person:{assetId:request.person.assetId,assetVersion:request.person.assetVersion,assetHash:request.person.assetHash},items:request.items.map(i=>({slot:i.slot,kind:i.kind,garmentRef:i.garmentRef,assetId:i.assetId,assetVersion:i.assetVersion,assetHash:i.assetHash})).sort((a,b)=>a.slot.localeCompare(b.slot))};
}
export const fittingSignature=request=>'sha256:'+hashRow(fittingSignaturePayload(request));
export function findPreparedFitting(pack,request,currentRequest=request,baseUrl='/assets/closit-profile-packs/'){
  const no=reason=>({status:'unavailable',reason,result:null,providerExecuted:false});
  if(!request||canonical(request)!==canonical(currentRequest))return {status:'stale',reason:'selection_or_request_changed',result:null,providerExecuted:false};
  if(!pack.profiles[request.profileRef]||request.externalItems?.length||!request.person||!Array.isArray(request.items)||request.items.length!==4||new Set(request.items.map(i=>i.slot)).size!==4)return no('not_exact_prepared_outfit');
  const p=pack.shared.people.find(p=>p.ref===request.personRef&&p.ownerRef===request.profileRef),assets=assetMap(pack);
  if(!p||p.referenceAssetId!==request.person.assetId||p.assetVersion!==request.person.assetVersion||assets.get(p.referenceAssetId)?.sha256!==request.person.assetHash)return no('person_asset_mismatch');
  for(const row of request.items){
    const g=pack.profiles[request.profileRef].garments.find(g=>g.ref===row.garmentRef),a=assets.get(row.assetId);
    if(row.kind!=='owned'||!g||g.category!==row.slot||g.mainAssetId!==row.assetId||g.assetVersion!==row.assetVersion||!a||a.version!==row.assetVersion||a.sha256!==row.assetHash)return no('garment_asset_mismatch');
  }
  const matches=pack.shared.prepared_fittings.filter(r=>r.signature===fittingSignature(request)&&r.profileRef===request.profileRef&&r.personRef===request.personRef);
  if(matches.length!==1)return no('no_saved_fitting_for_this_full_combination');
  const result=matches[0],asset=assets.get(result.resultAssetId);if(!asset)return no('missing_result_asset');
  return {status:'ready',preparedRef:result.ref,outfitRef:result.outfitRef,mode:'reference_saved',renderType:'static_image',providerExecutionVerified:false,fitAccuracyVerified:false,result:{assetId:asset.id,assetVersion:asset.version,assetHash:asset.sha256,url:resolveAsset(asset.path,baseUrl)},request:structuredClone(request)};
}
/** Bridge the current app's FittingSnapshot without changing its epoch/revision guards. */
export function matchExistingPreparedSnapshot(pack,snapshot,currentSnapshot=snapshot,bindings=pack.profileBindings,baseUrl='/assets/closit-profile-packs/'){
  if(!snapshot||canonical(snapshot)!==canonical(currentSnapshot)||!Number.isSafeInteger(snapshot.requestVersion)||snapshot.requestVersion<1||!Number.isSafeInteger(snapshot.outfit?.revision)||snapshot.outfit.revision<1||!snapshot.outfit.draftId&&!snapshot.outfit.outfitId||snapshot.outfit.externalItems?.length)return null;
  const profiles=Object.entries(bindings.profiles).filter(([,b])=>b.runtimeProfileId===snapshot.ownerId);if(profiles.length!==1)return null;
  const profileRef=profiles[0][0],people=pack.shared.people.filter(p=>p.ownerRef===profileRef&&p.referenceAssetId===snapshot.person.assetId&&p.assetVersion===snapshot.person.assetVersion);if(people.length!==1)return null;
  const am=assetMap(pack),person=am.get(snapshot.person.assetId);if(!person)return null;
  const request={profileRef,personRef:people[0].ref,person:{assetId:person.id,assetVersion:snapshot.person.assetVersion,assetHash:person.sha256},items:snapshot.outfit.items.map(i=>({slot:i.slot,kind:'owned',garmentRef:i.garmentId,assetId:i.assetId,assetVersion:i.assetVersion,assetHash:am.get(i.assetId)?.sha256??''})),requestVersion:snapshot.requestVersion,draftId:snapshot.outfit.draftId,revision:snapshot.outfit.revision};
  const result=findPreparedFitting(pack,request,request,baseUrl);if(result.status!=='ready')return null;
  return {snapshot:structuredClone(snapshot),origin:'prepared-static',content:'fitting-result',status:'ready',media:{kind:'image',url:result.result.url},resultId:result.preparedRef};
}
export function resolvePackLocation(pack,profileRef,garmentRef,sceneHash,sceneVariant='approved-base'){
  const g=pack.profiles[profileRef]?.garments.find(g=>g.ref===garmentRef);if(!g)return {status:'unknown',anchor:null,reason:'owner_or_garment_not_found'};
  const p=pack.shared.placements.find(p=>p.profileRef===profileRef&&p.garmentRef===garmentRef&&p.sceneVariant===sceneVariant);
  if(!p||p.sourceBackgroundHash!==sceneHash)return {status:'unknown',anchor:null,reason:'scene_unmatched'};
  const label=pack.shared.locations.find(l=>l.ref===p.locationRef)?.labelKo??'위치 미확인';
  return {status:p.bindingLevel,anchor:p.bindingLevel==='exact_demo'?structuredClone(p.ledAnchor):null,label,physicalLocationVerified:false,reason:p.identityReview};
}
export function careGuideFor(pack,profileRef,garmentRef){
  const c=pack.profiles[profileRef]?.care.find(c=>c.ownerRef===profileRef&&c.garmentRef===garmentRef);
  if(!c)return {garmentId:garmentRef,title:'관리 정보 미확인',advice:'의류의 관리 라벨을 확인해주세요.',source:'unconfirmed',actualCareRecorded:false};
  return {garmentId:garmentRef,title:c.title,advice:[c.displayBadge,...c.stepsKo,'보관 · '+c.storageKo,...c.cautionsKo].join('\n'),source:'prepared-demo',actualCareRecorded:false,evidenceState:c.evidenceState,physicalLabelVerified:false};
}
/** Reusable geometry for a NEW owned combination. Produces data, never a fitting image. */
export function createFlatlayLayout(pack,profileRef,garmentRefs){
  const p=pack.profiles[profileRef];if(!p||new Set(garmentRefs).size!==garmentRefs.length)throw Error('invalid_flatlay_selection');
  const gm=new Map(p.garments.map(g=>[g.ref,g])),am=assetMap(pack),garments=garmentRefs.map(id=>gm.get(id));
  if(garments.some(g=>!g)||new Set(garments.map(g=>g.category)).size!==garments.length)throw Error('flatlay_scope_or_duplicate_slot');
  if(garments.some(g=>g.category==='dress'))throw Error('dress_is_read_only_in_current_outfit_slots');
  const rects={outer:[35,40,220,270],top:[302,40,170,235],bottom:[308,300,160,310],shoes:[35,432,220,130],bag:[524,40,176,270],hat:[524,335,176,130],accessory:[524,485,176,130]};
  const items=garments.map((g,zIndex)=>{const a=am.get(g.mainAssetId);if(!a||a.version!==g.assetVersion)throw Error('flatlay_asset_mismatch');const [x,y,w,h]=rects[g.category],[l,t,r,b]=a.contentBounds,scale=Math.min(w/(r-l),h/(b-t)),rw=Math.round((r-l)*scale),rh=Math.round((b-t)*scale);return {slot:g.category,kind:'owned',garmentRef:g.ref,assetId:a.id,assetVersion:a.version,assetHash:a.sha256,x:x+Math.floor((w-rw)/2),y:y+Math.floor((h-rh)/2),w:rw,h:rh,sourceContentBounds:[l,t,r,b],zIndex};});
  return {canvas:{width:garments.some(g=>['bag','hat','accessory'].includes(g.category))?720:512,height:640},items,uiDecorationsBaked:false,preparedFittingAvailable:false};
}
export function toExistingProfileBundle(pack,profileRef,bindings=pack.profileBindings,baseUrl='/assets/closit-profile-packs/'){
  const p=pack.profiles[profileRef],binding=bindings.profiles?.[profileRef];
  if(!p||!binding?.runtimeProfileId||binding.bindingStatus!=='verified_current_source')return {bundle:null,unresolvedBindings:[{profileRef,reason:'runtime_profile_unresolved'}]};
  const ownerId=binding.runtimeProfileId;if(!ownerId.startsWith('local:'))throw Error('local_profile_binding_required');
  const assets=assetMap(pack),unresolvedBindings=[];
  const garments=p.garments.map(g=>{
    const a=assets.get(g.mainAssetId),c=p.care.find(c=>c.ref===g.careRef),l=pack.shared.locations.find(l=>l.ref===g.locationRef);
    if(!a||a.version!==g.assetVersion)throw Error('unresolved_garment_asset');
    return {id:g.ref,ownerId,name:g.name,category:g.category,color:g.color,features:[...g.searchTerms,g.core?'승인 레퍼런스 시연 의류':'가상 소유 의류 · 기존 생성 이미지'],material:c?.fabricComposition?'시연용 소재 · '+c.fabricComposition.map(x=>`${x.name} ${x.percent}%`).join(' / '):'',size:g.size??'',location:l?(g.locationState==='exact_demo'?l.labelKo:`${l.zone} 구역 · 상세 위치 미확정`):'',asset:{id:a.id,version:a.version,source:'packaged',url:resolveAsset(a.path,baseUrl)},careNotes:careGuideFor(pack,profileRef,g.ref).advice,revision:g.revision,provenance:{location:g.locationState==='exact_demo'?'demo':'unconfirmed',size:'unconfirmed',care:'demo'}};
  });
  const outfits=p.outfits.map(o=>({id:o.ref,ownerId,name:o.name,items:Object.fromEntries(o.items.map(i=>[i.slot,i.garmentRef])),revision:o.revision,assetVersions:Object.fromEntries(o.items.map(i=>[i.garmentRef,i.assetVersion])),assetIds:Object.fromEntries(o.items.map(i=>[i.garmentRef,i.assetId])),purpose:'card',nameOrigin:'legacy'}));
  const first=outfits[0];
  const historyOutfitByEvent=new Map(),calendarFixtures=[],deferredEvents=[];
  for(const e of p.events){
    if(e.kind==='plan'&&!e.outfitRef){calendarFixtures.push(structuredClone(e));unresolvedBindings.push({entity:'calendar_event',ref:e.ref,reason:'current_repository_plan_requires_outfit_id',action:'render unassigned read-only schedule; commit a real plan only after user selection'});continue;}
    if(e.kind!=='wear'||e.outfitRef)continue;
    const observed=e.garmentRefs.map(id=>garments.find(g=>g.id===id));
    if(observed.some(g=>!g)||new Set(observed.map(g=>g.category)).size!==observed.length){deferredEvents.push({ref:e.ref,reason:'observed_garments_cannot_be_represented_in_existing_slots'});continue;}
    const items=Object.fromEntries(observed.map(g=>[g.category,g.id])),id=`closit:history-outfit:${profileRef}:${hashRow(items).slice(0,24)}`;
    if(!outfits.some(o=>o.id===id))outfits.push({id,ownerId,name:'착용 이력의 관찰 품목 · 시연',items,revision:1,assetVersions:Object.fromEntries(observed.map(g=>[g.id,g.asset.version])),assetIds:Object.fromEntries(observed.map(g=>[g.id,g.asset.id])),purpose:'wear',nameOrigin:'legacy'});
    historyOutfitByEvent.set(e.ref,id);
  }
  const events=p.events.filter(e=>!calendarFixtures.some(c=>c.ref===e.ref)&&!deferredEvents.some(d=>d.ref===e.ref)).map(e=>({id:e.ref,ownerId,kind:e.kind,date:e.date,value:e.details.title??({wear:'착용 기록 · 시연',care:'관리 기록 · 시연',movement:'이동 기록 · 시연',plan:'코디 계획 · 시연'}[e.kind]),...(e.occurredAt?{occurredAt:e.occurredAt}:{}),timePrecision:e.timePrecision,garmentIds:[...e.garmentRefs],...(e.garmentRefs.length===1?{garmentId:e.garmentRefs[0]}:{}),...(e.outfitRef||historyOutfitByEvent.has(e.ref)?{outfitId:e.outfitRef??historyOutfitByEvent.get(e.ref)}:{}),inputSource:'demo',sourceEventKey:e.sourceEventKey,sourceRef:e.ref,revision:e.revision,voided:e.voided,lifeKind:e.kind==='care'&&['dry_clean_completed','professional_cleaning_completed'].includes(e.subtype)?'wash_completed':e.subtype,details:{...structuredClone(e.details),observedGarmentsOnly:historyOutfitByEvent.has(e.ref),careSubtype:e.kind==='care'?e.subtype:null,plannedOutfitSnapshot:structuredClone(e.plannedOutfitSnapshot),_life_data:{namespace:pack.manifest.namespace,source_ref:e.ref,provenance:'synthetic_life_event',basis:structuredClone(e.provenance)}}}));
  const contexts=p.contexts.map(c=>({id:c.ref,ownerId,asOf:c.asOf,timeZone:c.timezone,purpose:c.purpose,sourceRef:c.ref,provenance:'scenario_fixture',weather:{status:'available',kind:'observation',sourceRef:c.ref,provenance:'scenario_fixture',issuedAt:c.asOf,validFrom:c.asOf,validTo:c.asOf,precipitation:c.weather.precipitation,temperatureC:c.weather.temperatureC}}));
  const preferences=p.preferences.map(x=>({id:x.ref,ownerId,kind:x.kind,sourceRef:x.ref,provenance:'scenario_fixture',...(x.kind==='like'?{outfitId:x.outfitRef}:{key:x.key,value:[...x.value]})}));
  return {bundle:{profile:{id:ownerId,name:p.profile.displayName},garments,outfits,outfitDraft:{draftId:`closit:draft:${profileRef}:initial`,ownerId,revision:1,name:first?.name??'새 코디',items:{...first?.items},assetVersions:{...first?.assetVersions},assetIds:{...first?.assetIds},topLocked:false,...(first?{sourceOutfitId:first.id}:{})}},events,calendarFixtures,deferredEvents,lifeData:{ownerId,namespace:pack.manifest.namespace,provenance:'scenario_fixture',revision:1,preferences,contexts,...(contexts[0]?{activeContextId:contexts[0].id}:{})},careGuides:structuredClone(p.care),careEvidence:[],placements:structuredClone(pack.shared.placements.filter(x=>x.profileRef===profileRef)),unresolvedBindings,warnings:['prepared careGuides는 기존 localLifeCareGuide의 scprep 전용 분기 밖에서 careGuideFor로 연결해야 함.','packaged reference 이미지를 원격 공급자 입력으로 자동 승격하지 않음.','착용 이벤트용 관찰 스냅샷은 purpose=wear이며 카드 목록에 넣지 않음.']};
}
export function importRows(pack,bindings=pack.profileBindings,baseUrl='/assets/closit-profile-packs/'){
  const records=[];
  for(const ref of pack.manifest.profileRefs){
    const mapped=toExistingProfileBundle(pack,ref,bindings,baseUrl);if(!mapped.bundle)continue;
    const p=pack.profiles[ref],b=mapped.bundle;
    const add=(entity,row,source)=>records.push({entity,id:row.id,ownerId:entity==='profile'?row.id:row.ownerId,row,sourceHash:hashRow(source),revision:source.revision??1});
    add('profile',b.profile,p.profile);
    b.garments.forEach((row,i)=>add('garment',row,p.garments[i]));b.outfits.forEach(row=>add('outfit',row,p.outfits.find(o=>o.ref===row.id)??{ref:row.id,revision:row.revision,observedGarmentsOnly:true,items:row.items}));mapped.events.forEach(row=>add('event',row,p.events.find(e=>e.ref===row.id)));
    mapped.lifeData.preferences.forEach((row,i)=>add('preference',row,p.preferences[i]));mapped.lifeData.contexts.forEach((row,i)=>add('context',row,p.contexts[i]));
    p.care.forEach(c=>add('care',{...structuredClone(c),id:c.ref,ownerId:b.profile.id},c));
  }
  for(const a of pack.shared.assets)records.push({entity:'asset',id:a.id,ownerId:null,row:{id:a.id,version:a.version,sha256:a.sha256,path:a.path},sourceHash:hashRow(a),revision:a.version});
  return records;
}
/** Planning only. Matching uses explicit ID and hashes, never names or colors. */
export function previewImport(existing,pack,bindings=pack.profileBindings,baseUrl='/assets/closit-profile-packs/'){
  const incoming=importRows(pack,bindings,baseUrl),known=existing.records??[],items=[];
  const unresolved=pack.manifest.profileRefs.filter(ref=>!bindings.profiles?.[ref]?.runtimeProfileId||bindings.profiles[ref].bindingStatus!=='verified_current_source');
  for(const n of incoming){
    const matches=known.filter(x=>x.entity===n.entity&&x.id===n.id),old=matches[0];let status,reason;
    if(matches.length>1){status='CONFLICT';reason='duplicate_existing_id';}
    else if((existing.tombstones??[]).some(t=>t.entity===n.entity&&t.id===n.id)||old?.deleted){status='DEFERRED';reason='user_deleted_no_resurrection';}
    else if(!old){status='CREATE';reason='new_explicit_id';}
    else if(old.ownerId!==n.ownerId){status='CONFLICT';reason='owner_mismatch';}
    else if(n.entity==='asset'&&old.row.version===n.row.version&&old.row.sha256!==n.row.sha256){status='CONFLICT';reason='immutable_asset_version_hash_changed';}
    else if(canonical(old.row)===canonical(n.row)&&old.sourceHash===n.sourceHash){status='UNCHANGED';reason='same_source_and_content';}
    else if(old.appliedRowHash&&hashRow(old.row)!==old.appliedRowHash){status='CONFLICT';reason='user_edit_preserved';}
    else if(old.revision>n.revision){status='CONFLICT';reason='revision_downgrade';}
    else if(canonical(old.row)===canonical(n.row)){status='LINK';reason='identical_existing_row';}
    else if(old.appliedRowHash&&old.sourceHash&&hashRow(old.row)===old.appliedRowHash&&old.sourceHash!==n.sourceHash){status='LINK';reason='tracked_source_update_unchanged_user_row';}
    else{status='CONFLICT';reason='untracked_existing_value_requires_reviewed_baseline';}
    items.push({...structuredClone(n),status,reason});
  }
  for(const profileRef of unresolved)items.push({entity:'profile',id:profileRef,status:'DEFERRED',reason:'runtime_profile_unresolved'});
  for(const ref of pack.manifest.profileRefs){if(!bindings.profiles?.[ref]?.runtimeProfileId)continue;for(const e of pack.profiles[ref].events.filter(e=>e.kind==='plan'&&!e.outfitRef))items.push({entity:'calendar_fixture',id:e.ref,status:'DEFERRED',reason:'unassigned_schedule_read_projection_not_repository_event'});}
  return {mode:'preview',writeEnabled:false,namespace:pack.manifest.namespace,packVersion:pack.manifest.packVersion,items,counts:Object.fromEntries(['CREATE','LINK','UNCHANGED','CONFLICT','DEFERRED'].map(status=>[status,items.filter(x=>x.status===status).length])),valid:!items.some(x=>x.status==='CONFLICT')&&!unresolved.length};
}
/** Isolated simulation for tests and review. Returns memory only; never commits anywhere. */
export function simulateImport(existing,plan,{failAt=null}={}){
  if(!plan.valid)throw Error('invalid_import_plan');
  const next=structuredClone(existing);next.records??=[];
  for(let i=0;i<plan.items.length;i++){
    if(i===failAt)throw Error('simulated_failure_before_any_commit');const n=plan.items[i];
    if(!['CREATE','LINK'].includes(n.status))continue;
    const row={entity:n.entity,id:n.id,ownerId:n.ownerId,row:structuredClone(n.row),sourceHash:n.sourceHash,appliedRowHash:hashRow(n.row),revision:n.revision,deleted:false};
    const old=next.records.findIndex(x=>x.entity===n.entity&&x.id===n.id);if(old<0)next.records.push(row);else next.records[old]=row;
  }
  return next;
}
