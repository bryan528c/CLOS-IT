import {useRef,useState} from 'react';
import type {Garment,OutfitDraft} from './core';
import {app} from './appInstance';
import {Icon} from './Icons';
import {MirrorOutfitThumbnail} from './MirrorPanelThumbnail';
import {completeOutfit} from './core/externalOutfits';
import {describeOutfitDraft} from './outfitCardPresentation';
import './mirror-compare.css';

/** Viewing a captured draft never opens its editor or performs a write. */
export function MirrorCompare({draft,garments,hasMedia,status,resultState,onBack,onEdit,onSave,onCommit,onEnd,saving,committing,recorded,onRecords,onSchedule,uiState,onUIStateChange}:{
 onSchedule?:()=>void;resultState?:'ready'|'loading'|'missing'|'error';
 uiState?:{quick:boolean;more:boolean;page:number};onUIStateChange?:(value:{quick:boolean;more:boolean;page:number})=>void;
 draft:OutfitDraft|undefined;garments:Garment[];hasMedia:boolean;status:string;
 onBack:()=>void;onEdit:(slot?:'top')=>void;onChooseTop:(garment:Garment)=>void;
 onSave:()=>void;onCommit:()=>void;onEnd:()=>void;saving:boolean;committing:boolean;recorded:boolean;onRecords:()=>void;
}){
 const [more,setMore]=useState(uiState?.more??false),page=useRef(uiState?.page??0);
 const reveal=(next:boolean)=>{setMore(next);onUIStateChange?.({quick:false,more:next,page:page.current});};
 const heading=draft?describeOutfitDraft(draft,garments,app.outfits()):null;
 const state=resultState??(hasMedia?'ready':/실패|오류|불러오지|연결하지/.test(status)?'error':/확인 중|준비 중|생성 중|불러오는|처리 중/.test(status)?'loading':'missing');
 const message=state==='missing'?'이 코디의 미리보기가 아직 준비되지 않았어요':state==='loading'?'선택한 코디의 결과를 확인하고 있어요':state==='error'?'이 코디의 미리보기를 불러오지 못했어요':status;
 return <section className="mc-compare" data-outfit-view="compare" data-result-status={state} aria-label="전신 비교">
  <div className="mc-heading"><button aria-label="카드 탐색으로 돌아가기" onClick={onBack}><Icon name="back" size={18}/></button><strong title={heading?.title}>입어보기</strong><button className="mc-edit-entry" type="button" onClick={()=>{reveal(false);onEdit();}}>코디 편집</button><button aria-label="비교 더 보기" aria-expanded={more} onClick={()=>reveal(!more)}>···</button></div>
  {draft&&<figure className="mc-snapshot" aria-label="선택한 같은 코디" data-draft-id={draft.draftId} data-draft-revision={draft.revision}><MirrorOutfitThumbnail app={app} outfit={draft} compactMissing/><figcaption>선택한 코디</figcaption></figure>}
  <div className="mc-result-state" data-result-status={state} role="status" aria-live="polite"><p>{message}</p></div>
  {more&&<div className="mc-more" aria-label="비교 보조 작업"><button disabled={saving||!draft||!completeOutfit(draft)} onClick={onSave}>{saving?'카드 저장 중':'코디카드로 저장'}</button><button onClick={()=>{reveal(false);onEnd();}}>비교 종료</button></div>}
  <div className="mc-primary"><button className="mx-primary" disabled={committing||!draft||!completeOutfit(draft)} onClick={onSchedule??onCommit}>{onSchedule?'일정에 코디 저장':committing?'기록하는 중':'이 옷으로 입기'}</button><div className="mc-feedback">{recorded&&<button className="mc-record-link" onClick={onRecords}>오늘 기록 보기</button>}</div></div>
 </section>;
}
