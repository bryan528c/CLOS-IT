import {PlanCCardCarousel} from './planc/PlanCPanels';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {app} from './appInstance';
import {MirrorStyleReference} from './MirrorStyleReference';
import {loadLocalStylePhoto,type LocalStyleReference} from './localStyleReferences';
import type {ExternalItem,Outfit,OutfitDraft,OutfitItems,Slot} from './core/types';
import {completeOutfit,OUTFIT_SLOT_KEYS,OUTFIT_SLOT_NAMES,slotIsLocked} from './core/externalOutfits';
import {HorizontalPager} from './HorizontalPager';
import {Icon} from './Icons';
import {MirrorGarmentGrid,MirrorPhoto} from './MirrorGarmentGrid';
import {MirrorOutfitThumbnail} from './MirrorPanelThumbnail';
import {describeOutfitDraft,sameDraftResumeTarget} from './outfitCardPresentation';
import './mirror-outfit-workspace.css';

export type MirrorOutfitWorkspaceUI={
 librarySection:'mine'|'styles';libraryFilter:'all'|'instagram'|'shopping';libraryPage:number;stylePage:number;
 selectedSlot:Slot;source:'owned'|'external';candidatePages:Record<string,number>;summaryPage:number;
 styleItemId:string|null;helpOpen:boolean;prompt:string;nameOpen:boolean;notice:string;
};
export const createOutfitWorkspaceUI=():MirrorOutfitWorkspaceUI=>({librarySection:'mine',libraryFilter:'all',libraryPage:0,stylePage:0,selectedSlot:'top',source:'owned',candidatePages:{},summaryPage:0,styleItemId:null,helpOpen:false,prompt:'',nameOpen:false,notice:''});
export interface MirrorOutfitWorkspaceProps {
 onSelected?:(slot:Slot)=>void;onOpenLook:(look:Outfit)=>void;onDraftChange:()=>void;onRequestFitting:()=>void;onNotice?:(message:string)=>void;
 view?:'library'|'builder';onViewChange?:(view:'library'|'builder')=>void;onBack?:()=>void;
 uiState?:MirrorOutfitWorkspaceUI;onUIStateChange?:(state:MirrorOutfitWorkspaceUI)=>void;
 initialTab?:'mine'|'edit';initialSlot?:Slot;
}
const pages=<T,>(items:readonly T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
function Thumb({look,loadEnabled=true}:{look:Parameters<typeof MirrorOutfitThumbnail>[0]['outfit'];loadEnabled?:boolean}){return <MirrorOutfitThumbnail app={app} outfit={look} loadEnabled={loadEnabled} className="mow-card-composition"/>;}

/** L/B surfaces share a draft but only explicit compare delegates to the fitting controller. */
export function MirrorOutfitWorkspace({onSelected,onOpenLook,onDraftChange,onRequestFitting,onNotice,view:controlledView,onViewChange,onBack,uiState,onUIStateChange,initialTab='mine',initialSlot}:MirrorOutfitWorkspaceProps){
 const state=useSyncExternalStore(app.subscribe,app.getState),owner=state.activeProfileId,draft=app.outfitDraft(),repository=app.repository;
 const initialUI=()=>({...createOutfitWorkspaceUI(),...uiState,...(initialSlot?{selectedSlot:initialSlot,summaryPage:Math.floor(OUTFIT_SLOT_KEYS.indexOf(initialSlot)/3)}:{})});
 const [ui,setUI]=useState<MirrorOutfitWorkspaceUI>(initialUI),[localView,setLocalView]=useState<'library'|'builder'>(initialSlot||initialTab==='edit'?'builder':'library');
 const view=controlledView??localView,uiRef=useRef(ui);uiRef.current=ui;
 const [saving,setSaving]=useState(false),[busy,setBusy]=useState(false),[styleUpload,setStyleUpload]=useState(false),[resumeOpen,setResumeOpen]=useState(false);
 const [localReference,setLocalReference]=useState<LocalStyleReference|null>(null),[localReferenceUrl,setLocalReferenceUrl]=useState<string|null>(null);
 const [proposal,setProposal]=useState<{source:OutfitDraft;items:OutfitItems;label:string}|null>(null);
 const current=useRef({owner,repository});current.current={owner,repository};const mounted=useRef(true),saveBusy=useRef(false);
 const patch=(changes:Partial<MirrorOutfitWorkspaceUI>)=>{const next={...uiRef.current,...changes};uiRef.current=next;if(mounted.current)setUI(next);onUIStateChange?.(next);};
 const setView=(next:'library'|'builder')=>{setLocalView(next);onViewChange?.(next);};
 const sameOwner=(captured:{owner:string;repository:typeof repository})=>app.getState().activeProfileId===captured.owner&&app.repository===captured.repository;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const next=initialUI();uiRef.current=next;setUI(next);setProposal(null);setBusy(false);setSaving(false);setStyleUpload(false);setResumeOpen(false);setLocalReference(null);},[owner,repository]);
 useEffect(()=>{let active=true,url:string|null=null;setLocalReferenceUrl(null);if(localReference)void loadLocalStylePhoto(localReference).then(value=>{url=value;if(active)setLocalReferenceUrl(value);else if(value)URL.revokeObjectURL(value);}).catch(()=>{});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[localReference?.id]);
 useEffect(()=>{if(initialSlot&&uiRef.current.selectedSlot!==initialSlot)patch({selectedSlot:initialSlot,source:'owned',summaryPage:Math.floor(OUTFIT_SLOT_KEYS.indexOf(initialSlot)/3)});},[initialSlot]);
 useEffect(()=>{if(proposal&&(proposal.source.draftId!==draft?.draftId||proposal.source.revision!==draft?.revision))setProposal(null);},[draft?.draftId,draft?.revision,proposal]);
 const message=(notice:string)=>patch({notice});
 const run=(fn:()=>void)=>{try{const before=app.outfitDraft();fn();const after=app.outfitDraft();setProposal(null);message('');if(before?.draftId!==after?.draftId||before?.revision!==after?.revision)onDraftChange();}catch(e){message((e as Error).message);}};
 const start=()=>run(()=>{app.startBlankOutfit();patch({selectedSlot:'top',source:'owned',summaryPage:0,helpOpen:false,nameOpen:false});setView('builder');});
 const open=(look:Outfit)=>{message('');onOpenLook(look);};
 const slot=ui.selectedSlot,source=ui.source,pageKey=`${slot}:${source}`,candidatePage=ui.candidatePages[pageKey]??0;
 const setCandidatePage=(index:number)=>patch({candidatePages:{...uiRef.current.candidatePages,[pageKey]:index}});
 const owned=app.garments().filter(item=>item.category===slot),externals=app.externalItems();
 const categoryCandidates=externals.filter(item=>item.category===slot||item.category===undefined);
 const sourceKind=(item:ExternalItem)=>item.sourceUrl&&/^https:\/\/(?:www\.)?instagram\.com(?:\/|$)/i.test(item.sourceUrl)||/인스타|instagram/i.test(item.sourceLabel)?'instagram':/쇼핑|상품|shopping|store/i.test(item.sourceLabel)||!!item.sourceUrl&&/^https:\/\/(?:www\.)?(?:musinsa\.com|29cm\.co\.kr|wconcept\.co\.kr)(?:\/|$)/i.test(item.sourceUrl)?'shopping':'unknown';
 const styles=externals.filter(item=>ui.libraryFilter==='all'||sourceKind(item)===ui.libraryFilter),styleSelected=externals.find(item=>item.id===ui.styleItemId);
 const looks=app.cardOutfits(),previousDraft=app.previousOutfitDraft();
 const draftHeading=draft?describeOutfitDraft(draft,app.garments(),app.outfits()):null,previousHeading=previousDraft?describeOutfitDraft(previousDraft,app.garments(),app.outfits()):null;
 const showPrevious=Boolean(previousDraft&&!sameDraftResumeTarget(draft,previousDraft));
 const selectSlot=(next:Slot)=>patch({selectedSlot:next,source:'owned',helpOpen:false,summaryPage:Math.floor(OUTFIT_SLOT_KEYS.indexOf(next)/3)});
 const selectedGarment=draft&&app.garments().find(item=>item.id===draft.items[slot]),selectedExternal=draft?.externalItems?.[slot],selectedName=selectedGarment?.name??selectedExternal?.name;
 const selected=Boolean(draft?.items[slot]||selectedExternal),locked=Boolean(draft&&slotIsLocked(draft,slot));
 const save=async()=>{
  if(saveBusy.current||!draft)return;
  const captured={owner,repository,draftId:draft.draftId,revision:draft.revision};saveBusy.current=true;setSaving(true);message('코디카드를 저장하고 있어요');
  try{const result=await app.saveOutfit(`mirror-card:${captured.draftId}:${captured.revision}`);if(!sameOwner(captured))return;const latest=app.outfitDraft(),changed=latest?.draftId!==captured.draftId||latest.revision!==captured.revision;const notice=changed?'앞서 요청한 코디카드를 저장했어요. 새 조합은 유지해요.':result.replayed?'이미 저장된 코디카드를 확인했어요.':'코디카드를 저장했어요.';if(mounted.current)message(notice);else onNotice?.(notice);}
  catch(e){if(sameOwner(captured)){if(mounted.current)message((e as Error).message);else onNotice?.((e as Error).message);}}
  finally{saveBusy.current=false;if(mounted.current&&sameOwner(captured))setSaving(false);}
 };
 const ask=async(reference?:string)=>{
  const captured={owner,repository};setBusy(true);message('현재 선택과 고정 조건으로 조합을 추천해요');
  try{const result=await app.proposeOutfit({weather:'unavailable',temperatureC:0,occasion:uiRef.current.prompt.trim()||`${OUTFIT_SLOT_NAMES[slot]} 후보 제안; 고정 품목 유지`},reference,{editableSlot:slot});if(!mounted.current||!sameOwner(captured))return;if(result.status==='success'){setProposal(result.data);message(result.data.label+' · 선택 전에는 바꾸지 않아요');}else message(result.message);}
  catch(e){if(mounted.current&&sameOwner(captured))message((e as Error).message);}
  finally{if(mounted.current&&sameOwner(captured))setBusy(false);}
 };
 const externalGrid=(records:ExternalItem[],index:number,onIndexChange:(index:number)=>void,select:(item:ExternalItem)=>void,label:string)=><HorizontalPager index={index} onIndexChange={onIndexChange} label={label} peek={0} gap={6} items={pages(records,view==='builder'?3:6)} renderItem={(items,pageIndex)=><div className="mow-candidate-grid">{items.map(item=><button key={item.id} type="button" data-external-id={item.id} aria-label={`${item.name} 선택`} aria-pressed={view==='builder'&&selectedExternal?.externalItemId===item.id} onClick={()=>select(item)}><MirrorPhoto asset={item.asset} name={item.name} loadEnabled={Math.abs(pageIndex-index)<=1}/><span title={item.name}>{item.name}</span><small>구매 후보</small></button>)}</div>}/>;
 const styleToBuilder=(item:ExternalItem)=>{patch({selectedSlot:item.category??'outer',source:'external',summaryPage:Math.floor(OUTFIT_SLOT_KEYS.indexOf(item.category??'outer')/3),helpOpen:false});setView('builder');if(item.category)run(()=>{if(!app.outfitDraft())app.startBlankOutfit();if(app.outfitDraft()?.externalItems?.[item.category!]?.externalItemId!==item.id)app.setExternalOutfitItem(item.category!,item.id);});else message('종류 미확인 후보예요. 넣을 품목을 고른 뒤 후보를 선택해 주세요.');};
 const missing=draft&&!draft.items.dress&&!draft.externalItems?.dress?(['top','bottom']as const).filter(value=>!draft.items[value]&&!draft.externalItems?.[value]).map(value=>OUTFIT_SLOT_NAMES[value]):[];
 return <section className="mirror-outfit-workspace" aria-label={view==='library'?'코디 카드 탐색':'의류 선택·조합'} data-owner-id={owner} data-outfit-view={view}>
  {view==='library'?<>
   <header className="mow-library-heading"><h1>코디카드</h1><button type="button" onClick={start}>+ 추가</button></header>
   <nav className="mow-tabs" aria-label="코디 보관함">{([['mine','내 코디'],['styles','스타일 보관함']]as const).map(([id,label])=><button key={id} type="button" aria-pressed={ui.librarySection===id} onClick={()=>{patch({librarySection:id,styleItemId:null,notice:''});setStyleUpload(false);setResumeOpen(false);}}>{label}</button>)}</nav>
   <div className="mow-library-body">
    {ui.librarySection==='mine'?<>
     {resumeOpen?<section className="mow-resume-options" aria-label="보관된 초안 선택"><button type="button" onClick={()=>setResumeOpen(false)}>← 카드 탐색</button><strong>이어서 작업할 코디</strong>{draft&&<button type="button" aria-label="현재 초안 열기" onClick={()=>{setResumeOpen(false);patch({helpOpen:false});setView('builder');}}><span>현재 초안</span><small>{draftHeading?.title}</small></button>}{showPrevious&&<button type="button" aria-label="이전 초안 재개" onClick={()=>run(()=>{app.resumePreviousDraft();setResumeOpen(false);patch({helpOpen:false});setView('builder');})}><span>이전 초안</span><small>{previousHeading?.title}</small></button>}</section>:<PlanCCardCarousel looks={looks} index={ui.libraryPage} onIndexChange={libraryPage=>patch({libraryPage})} onOpen={open}/>}
    </>:styleUpload?<MirrorStyleReference onBack={()=>setStyleUpload(false)} onUseLocalReference={reference=>{setLocalReference(reference);if(!app.outfitDraft())app.startBlankOutfit();patch({helpOpen:false,notice:'참고 사진을 보며 직접 조합해요. 사진 해석·AI 실행은 없어요.'});setView('builder');}} onUseReference={assetId=>{patch({helpOpen:true});setView('builder');void ask(assetId);}}/>:styleSelected?<div className="mow-style-detail">
     <button type="button" onClick={()=>patch({styleItemId:null})}>← 스타일 보관함</button><MirrorPhoto asset={styleSelected.asset} name={styleSelected.name}/><strong title={styleSelected.name}>{styleSelected.name}</strong><p>{styleSelected.sourceLabel} · 구매 후보</p>
     <button type="button" onClick={()=>styleToBuilder(styleSelected)}>상품 자체를 조합에 넣기</button><button type="button" disabled={busy||!styleSelected.asset} onClick={()=>{const asset=styleSelected.asset;if(!asset)return;patch({helpOpen:true});setView('builder');void ask(asset.id);}}>내 옷으로 재구성 제안</button>
     {!styleSelected.asset&&<small>참고 자산 자료 대기</small>}<small>재구성은 보유옷 제안이며 상품을 구매한 것으로 기록하지 않아요.</small>
    </div>:<>
     <div className="mow-style-heading"><span>{externals.length>0?'저장된 참고 자료':''}</span><button type="button" onClick={()=>setStyleUpload(true)}>사진 참고</button></div>
     {externals.length>0&&<nav className="mow-small-tabs" aria-label="스타일 출처">{([['all','전체'],['instagram','인스타'],['shopping','쇼핑몰']]as const).map(([value,label])=><button type="button" key={value} aria-pressed={ui.libraryFilter===value} onClick={()=>patch({libraryFilter:value,stylePage:0})}>{label}</button>)}</nav>}
     {styles.length?externalGrid(styles,ui.stylePage,stylePage=>patch({stylePage}),item=>patch({styleItemId:item.id}),'스타일 참고 페이지'):<p className="mow-empty">아직 저장한 스타일이 없어요.</p>}
    </>}
   </div>
   {ui.librarySection==='mine'&&!resumeOpen&&(draft||showPrevious)&&<footer className="mow-library-resume"><button type="button" aria-label="작성 중인 코디 이어하기" onClick={()=>setResumeOpen(true)}>작성 중인 코디 이어하기</button></footer>}
  </>:<>
   <header className="mow-builder-heading"><button type="button" className="mow-back" aria-label="코디 작업 뒤로" onClick={()=>onBack?onBack():setView('library')}>←</button>{ui.nameOpen?<label className="mow-name-field">코디 이름<input aria-label="코디 이름" maxLength={160} value={draft?.name??''} onChange={event=>{if(event.target.value!==draft?.name)run(()=>app.editOutfitName(event.target.value));}} onKeyDown={event=>{if(event.key==='Enter'||event.key==='Escape')patch({nameOpen:false});}}/></label>:<button type="button" className="mow-name" aria-label="코디 이름 편집" title={draftHeading?.title??'코디 만들기'} onClick={()=>patch({nameOpen:true})}><strong>{ui.helpOpen?'조합 추천':`${OUTFIT_SLOT_NAMES[slot]} 고르기`}</strong><span>{draftHeading?.title??'코디 만들기'} · ✎</span></button>}<button type="button" className="mow-recommend" aria-label={ui.nameOpen?'코디 이름 편집 완료':'조합 추천'} aria-pressed={!ui.nameOpen&&ui.helpOpen} onClick={()=>ui.nameOpen?patch({nameOpen:false}):patch({helpOpen:!ui.helpOpen,notice:''})}>{ui.nameOpen?'완료':<>조합<br/>추천</>}</button></header>
   {draftHeading?.sourceRelation&&<p className="mow-draft-relation">{draftHeading.sourceRelation}</p>}
   {localReference&&localReferenceUrl&&<figure className="mow-local-reference"><img src={localReferenceUrl} alt="직접 조합할 때 보는 로컬 참고 사진"/><figcaption>참고 사진 · 직접 조합</figcaption><button type="button" aria-label="참고 사진 접기" onClick={()=>setLocalReference(null)}>×</button></figure>}
   {!draft?<div className="mow-builder-empty"><p className="mow-empty">새 조합에 넣을 옷을 골라보세요.</p><button type="button" onClick={start}>빈 코디로 시작</button></div>:ui.helpOpen?<div className="mow-help"><label className="mow-label">요청 조건<input aria-label="조합 추천 요청" value={ui.prompt} maxLength={260} placeholder="고정한 상의에 맞는 하의" onChange={event=>patch({prompt:event.target.value})}/></label><button type="button" disabled={busy} onClick={()=>void ask()}>{busy?'추천 중':'현재 조건으로 추천'}</button>{proposal&&<><Thumb look={{name:proposal.label,items:proposal.items}}/><button type="button" onClick={()=>run(()=>app.applyOutfitSuggestion(proposal.source,proposal.items))}>이 제안 선택</button></>}<button type="button" className="mow-text-action" onClick={()=>patch({helpOpen:false})}>의류 선택으로 돌아가기</button></div>:<>
    <p className="mow-pager-role mow-summary-role">현재 코디</p>
    <HorizontalPager className="mow-summary" index={ui.summaryPage} onIndexChange={summaryPage=>patch({summaryPage})} label="구성 슬롯" peek={0} gap={6} items={pages(OUTFIT_SLOT_KEYS.filter(value=>value!=='dress'||app.connection.kind==='local'),3)} renderItem={slots=><div className="mow-slot-grid">{slots.map(value=>{const garment=app.garments().find(item=>item.id===draft.items[value]),external=draft.externalItems?.[value],item=external&&externals.find(item=>item.id===external.externalItemId),hasItem=Boolean(draft.items[value]||external);return <button key={value} type="button" className="mow-slot" data-slot={value} data-garment-id={garment?.id} data-external-item-id={external?.externalItemId} aria-label={`${OUTFIT_SLOT_NAMES[value]} 선택`} aria-pressed={slot===value} title={garment?.name??external?.name??`${OUTFIT_SLOT_NAMES[value]} 선택 전`} onClick={()=>selectSlot(value)}>{hasItem?<MirrorPhoto garment={garment} asset={item?.asset} name={garment?.name??external?.name??OUTFIT_SLOT_NAMES[value]} compact/>:<span className="mow-slot-empty" aria-hidden="true">+</span>}<span className="mow-slot-label"><span className="mow-slot-name">{hasItem?(garment?.name??external?.name??`${OUTFIT_SLOT_NAMES[value]} 확인 필요`):`${OUTFIT_SLOT_NAMES[value]} 선택`}</span>{slotIsLocked(draft,value)&&<Icon name="lock" size={12}/>}</span>{external&&<small>구매 후보</small>}</button>;})}</div>}/>
    <div className="mow-slot-tools"><span title={selectedName}>{selectedName??`${OUTFIT_SLOT_NAMES[slot]} 선택 전`}</span><button type="button" disabled={!selected} aria-label={`${OUTFIT_SLOT_NAMES[slot]} ${locked?'고정 해제':'고정'}`} aria-pressed={locked} onClick={()=>run(()=>app.toggleSlotLock(slot))}>{locked?'고정됨':'고정'}</button><button type="button" disabled={!selected||locked} aria-label={`${OUTFIT_SLOT_NAMES[slot]} 조합에서 빼기`} onClick={()=>run(()=>app.removeOutfitItem(slot))}>빼기</button></div>
    <p className="mow-pager-role">{OUTFIT_SLOT_NAMES[slot]} 후보 · {source==='owned'?'내 옷':'구매 후보'}</p>
    <nav className="mow-small-tabs mow-sources" aria-label="후보 범위"><button type="button" aria-pressed={source==='owned'} onClick={()=>patch({source:'owned'})}>내 옷</button><button type="button" aria-pressed={source==='external'} onClick={()=>patch({source:'external'})}>쇼핑 후보</button></nav>
    <div className="mow-candidates">{source==='owned'?<MirrorGarmentGrid pageSize={3} garments={owned} index={candidatePage} onIndexChange={setCandidatePage} onSelect={garment=>{if(draft.items[slot]!==garment.id){try{app.setOutfitItem(slot,garment.id);setProposal(null);message('');onDraftChange();onSelected?.(slot);}catch(e){message((e as Error).message);}}else onSelected?.(slot);}} selectedId={draft.items[slot]} label={`${OUTFIT_SLOT_NAMES[slot]} 후보`}/>:categoryCandidates.length?externalGrid(categoryCandidates,candidatePage,setCandidatePage,item=>{if(draft.externalItems?.[slot]?.externalItemId!==item.id){try{app.setExternalOutfitItem(slot,item.id);setProposal(null);message('');onDraftChange();onSelected?.(slot);}catch(e){message((e as Error).message);}}else onSelected?.(slot);},`${OUTFIT_SLOT_NAMES[slot]} 외부 후보`):<p className="mow-empty">제공된 {OUTFIT_SLOT_NAMES[slot]} 구매 후보가 없어요.</p>}</div>
   </>}
   {draft&&<footer className="mow-builder-footer"><p className="mow-required" aria-live="polite">{missing.length>0?`${missing.join('·')}를 선택하면 비교·저장할 수 있어요`:''}</p><div className="mow-actions"><button type="button" disabled={!completeOutfit(draft)} onClick={onRequestFitting}>미러로 비교</button><button type="button" disabled={!completeOutfit(draft)||saving} onClick={()=>void save()}>{saving?'저장 중':'카드로 저장'}</button></div></footer>}
  </>}
  <p className="mow-status" role="status">{ui.notice}</p>
 </section>;
}
