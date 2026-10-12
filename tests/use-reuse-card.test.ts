import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/core/seed';
import {automaticOutfitTitle,describeOutfitCard,describeOutfitDraft,sameDraftResumeTarget} from '../src/outfitCardPresentation';
import type {ExternalItem,Outfit,OutfitDraft} from '../src/core/types';
const fixture=()=>{const state=createSeed(),outfit=structuredClone(state.outfits[0]);return{state,outfit,describe:(value=outfit)=>describeOutfitCard({outfit:value,ownerId:state.activeProfileId,garments:state.garments,externalItems:state.externalItems??[]})};};
test('card auto description follows current slots while user/legacy names remain intact',()=>{const{state,outfit,describe}=fixture(),before=structuredClone(outfit);assert.match(automaticOutfitTitle(outfit,state.garments),/그레이 스웨트셔츠.*차콜 슬랙스/);assert.equal(describe().title,outfit.name);const changed={...outfit,items:{...outfit.items,bottom:'g-jeans'},nameOrigin:'auto' as const};assert.match(describe(changed).title,/블루 데님/);assert.doesNotMatch(describe(changed).title,/차콜 슬랙스/);assert.equal(describe({...changed,name:'사용자가 남긴 이름',nameOrigin:'user'}).title,'사용자가 남긴 이름');assert.deepEqual(outfit,before);});
test('common card ordering comes from slots, not object insertion order or look filenames',()=>{const{outfit,describe}=fixture();const reversed={...outfit,items:Object.fromEntries(Object.entries(outfit.items).reverse())};assert.deepEqual(describe(reversed).slots.map(s=>[s.slot,s.garmentId]),describe().slots.map(s=>[s.slot,s.garmentId]));assert.deepEqual(describe().slots.slice(0,2).map(s=>s.slot),['top','bottom']);assert.equal(describe().previewKind,'composition');});
test('card verifies captured asset identity and version without borrowing a new garment image',()=>{const{state,outfit,describe}=fixture(),garment=state.garments.find(g=>g.id==='g-knit')!;outfit.assetIds={...outfit.assetIds,[garment.id]:garment.asset!.id};garment.asset={...garment.asset!,id:'different-photo-same-version'};const row=describe().slots.find(s=>s.garmentId===garment.id)!;assert.equal(row.asset,null);assert.equal(row.status,'asset-changed');assert.equal(describe().reuseStatus,'needs-review');});
test('deleted garment or changed owner never becomes a similar replacement or exposes another owner asset',()=>{const{state,outfit,describe}=fixture();state.garments.find(g=>g.id==='g-knit')!.ownerId='other-owner';state.garments.push({...structuredClone(state.garments.find(g=>g.id==='g-jacket')!),id:'similar-name',category:'top',name:'그레이 스웨트셔츠'});const card=describe(),row=card.slots.find(s=>s.garmentId==='g-knit')!;assert.equal(row.asset,null);assert.equal(row.status,'missing-item');assert.equal(card.reuseStatus,'needs-review');assert.deepEqual(describe({...outfit,ownerId:'other-owner'}).slots,[]);});
test('missing photographs keep the original composition reusable and do not mutate a stored snapshot',()=>{const{outfit,describe}=fixture(),before=structuredClone(outfit);const row=describe().slots.find(s=>s.garmentId==='g-slacks')!;assert.equal(row.status,'missing-photo');assert.equal(row.asset,null);assert.equal(describe().reuseStatus,'ready');assert.deepEqual(outfit,before);});
test('external candidates retain provenance and exact identity, never become owned garment rows',()=>{const{state,outfit,describe}=fixture();const item:ExternalItem={id:'external-1',ownerId:state.activeProfileId,name:'기존 구매 후보 신발',category:'shoes',sourceLabel:'제공된 외부 자료',sourceUrl:'https://example.invalid/not-requested',asset:{id:'external-asset',version:2,source:'packaged',url:'/assets/shoes.png'}};state.externalItems=[item];delete outfit.items.shoes;outfit.externalItems={shoes:{externalItemId:item.id,assetId:item.asset!.id,assetVersion:2,name:item.name,sourceLabel:item.sourceLabel,sourceUrl:item.sourceUrl}};const card=describe(),row=card.slots.find(s=>s.slot==='shoes')!;assert.equal(row.source,'external');assert.equal(row.garmentId,undefined);assert.equal(row.externalItemId,item.id);assert.match(card.description,/구매 후보/);item.asset!.version=3;assert.equal(describe().slots.find(s=>s.slot==='shoes')!.asset,null);state.externalItems=[];assert.equal(describe().slots.find(s=>s.slot==='shoes')!.status,'missing-item');});
test('conflicting owned and external slot never silently drops one source or supplies a cover',()=>{const{outfit,describe}=fixture();outfit.externalItems={top:{externalItemId:'x',assetId:null,assetVersion:null,name:'외부 상의',sourceLabel:'자료',sourceUrl:null}};const row=describe().slots.find(s=>s.slot==='top')!;assert.equal(row.status,'conflict');assert.equal(row.asset,null);assert.equal(describe().reuseStatus,'needs-review');});

test('a deliberately absent asset captured as version zero remains a missing photo, not stale selection',()=>{const{state,outfit,describe}=fixture();state.garments.find(g=>g.id==='g-knit')!.asset=null;outfit.assetVersions['g-knit']=0;outfit.assetIds={'g-knit':null};const row=describe().slots.find(s=>s.garmentId==='g-knit')!;assert.equal(row.status,'missing-photo');assert.equal(row.asset,null);});


test('edited source draft displays the current composition without renaming its original card or snapshot',()=>{
 const{state,outfit}=fixture();outfit.name='화이트 셔츠 출근 코디';outfit.nameOrigin='legacy';
 const draft:OutfitDraft={draftId:'display-test',ownerId:outfit.ownerId,revision:1,name:outfit.name,nameOrigin:outfit.nameOrigin,items:{...outfit.items},topLocked:false,sourceOutfitId:outfit.id};
 assert.equal(describeOutfitDraft(draft,state.garments,[outfit]).title,outfit.name);
 assert.equal(describeOutfitDraft(draft,state.garments,[outfit]).sourceRelation,'');
 draft.items.bottom='g-jeans';draft.revision++;const before=structuredClone({draft,outfit}),view=describeOutfitDraft(draft,state.garments,[outfit]);
 assert.match(view.title,/블루 데님/);assert.doesNotMatch(view.title,/화이트 셔츠 출근 코디/);
 assert.equal(view.sourceRelation,'화이트 셔츠 출근 코디에서 수정 중');
 assert.deepEqual({draft,outfit},before);
});

test('a manually named draft keeps its title and source context; foreign owner source never supplies a name',()=>{
 const{state,outfit}=fixture(),draft:OutfitDraft={draftId:'display-user',ownerId:outfit.ownerId,revision:2,name:'나의 주말 약속',nameOrigin:'user',items:{...outfit.items,bottom:'g-jeans'},topLocked:false,sourceOutfitId:outfit.id};
 const view=describeOutfitDraft(draft,state.garments,[outfit]);assert.equal(view.title,draft.name);assert.match(view.composition,/블루 데님/);assert.equal(view.sourceRelation,`${outfit.name}에서 수정 중`);
 const foreign={...outfit,ownerId:'foreign',name:'다른 가족의 비공개 제목'};assert.equal(describeOutfitDraft(draft,state.garments,[foreign]).sourceRelation,'');
});

test('resume display suppresses only the same full draft target and preserves separate revisions and identities',()=>{
 const{state}=fixture(),draft=state.outfitDrafts[state.activeProfileId];assert.ok(draft);
 assert.equal(sameDraftResumeTarget(draft,structuredClone(draft)),true);
 assert.equal(sameDraftResumeTarget(draft,{...draft,draftId:'another-draft'}),false);
 assert.equal(sameDraftResumeTarget(draft,{...draft,revision:draft.revision+1}),false);
 assert.equal(sameDraftResumeTarget(draft,{...draft,name:'별도 편집본'}),false);
 assert.equal(sameDraftResumeTarget(draft,undefined),false);
});
