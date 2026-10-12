import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {app} from '../appInstance';
import {BackendPanel} from '../BackendPanel';
import {FittingControls,type FittingInputSelection} from '../FittingControls';
import {PhotoSuitability} from '../ReferenceInputs';
import {useMirrorPerson} from '../MirrorSceneView';
import {buildFittingSnapshot,type FittingCandidate,type FittingRequest,type FittingStreamBinding} from '../mirrorScene';
import {mirrorFittingSession} from '../mirrorFittingSession';
import './plan-c-connections.css';

/** Only explicit controls may upload, look up a result, preflight or submit a provider request. */
export function PlanCConnections({onClose}:{onClose:()=>void}){
 const state=useSyncExternalStore(app.subscribe,app.getState);
 useSyncExternalStore(app.subscribe,()=>JSON.stringify(app.connection));
 const scope=useRef({owner:state.activeProfileId,repository:app.repository,generation:0});
 if(scope.current.owner!==state.activeProfileId||scope.current.repository!==app.repository)
  scope.current={owner:state.activeProfileId,repository:app.repository,generation:scope.current.generation+1};
 return <ConnectionPages key={scope.current.generation} ownerId={state.activeProfileId} onClose={onClose}/>;
}

function ConnectionPages({ownerId,onClose}:{ownerId:string;onClose:()=>void}){
 const [page,setPage]=useState<'status'|'fitting'|'photo'>('status');
 const [inputs,setInputs]=useState<FittingInputSelection|null>(null);
 const [result,setResult]=useState<FittingCandidate|null>(null);
 const [request,setRequest]=useState<FittingRequest|null>(null);
 const [stream,setStream]=useState<FittingStreamBinding|null>(null);
 const person=useMirrorPerson(ownerId),draft=app.outfitDraft(),remote=app.connection.kind==='supabase';
 const snapshot=buildFittingSnapshot({ownerId,person:person.person,outfit:draft??null,garments:app.garments(),requestVersion:draft?.revision??1});
 const registration=app.registrationDraft();
 useEffect(()=>{
  mirrorFittingSession.bindContext(ownerId,app.repository);
  return()=>{void mirrorFittingSession.stop().catch(()=>undefined);};
 },[ownerId]);
 const close=()=>{void mirrorFittingSession.stop().catch(()=>undefined);onClose();};
 const changePage=(next:typeof page)=>{if(next!==page&&page==='fitting')void mirrorFittingSession.stop().catch(()=>undefined);setPage(next);};
 const processing=app.connection.mode==='live'?'실제 API · 승인 검사':app.connection.mode==='saved_result'?'저장 결과 조회':'준비 예시';
 return <section className="planc-connections" aria-label="연결·피팅 설정">
  <header className="planc-connections-heading"><strong>연결·피팅 설정</strong><button type="button" aria-label="연결·피팅 설정 닫기" onClick={close}>닫기</button></header>
  <nav className="planc-connections-tabs" aria-label="연결 설정 페이지">{([['status','상태'],['fitting','피팅'],['photo','사진']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={page===id} onClick={()=>changePage(id)}>{label}</button>)}</nav>
  <div className="planc-connections-body">
   <section hidden={page!=='status'} aria-label="서버와 실행 상태"><BackendPanel app={app} placement="tools"/></section>
   <section hidden={page!=='fitting'} aria-label="피팅 입력과 실행 조건">
    {!remote?<p>마이에서 본인 계정에 연결하면 비공개 피팅 입력을 선택할 수 있어요. 로컬 코디 편집과 저장은 계속 사용할 수 있어요.</p>:<>
     <p>현재 코디: <strong>{draft?.name??'선택 필요'}</strong></p>
     {!snapshot.snapshot&&<p role="status">{snapshot.issues[0]?.message??'코디와 인물 사진을 먼저 선택해 주세요.'}</p>}
     <label>미러 기준 인물 사진<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{void person.upload(event.target.files?.[0]);event.target.value='';}}/></label>
     <p>기준 사진은 현재 탭에서만 사용해요. 아래 인물 영상과 같은 사람인지 확인해 주세요.</p>
     {person.personMessage&&<p role="status">{person.personMessage}</p>}
     {page==='fitting'&&<FittingControls app={app} sceneSnapshot={snapshot.snapshot} retainedInputs={inputs} onInputsChange={setInputs} onSceneResult={setResult} onSceneRequest={setRequest} onSceneStream={setStream}/>}
     {(result||request||stream)&&<p className="planc-connection-result" role="status">{stream?'실시간 수신 · 의류 표현 확인 필요':result?.origin==='saved'?'저장된 실제 결과':result?'공급자 결과 · 재생 확인 필요':request?.status==='processing'?'요청 처리 중':'현재 입력의 피팅 상태를 위 안내에서 확인해 주세요.'}</p>}
     <p>입력을 연결한 뒤 코디의 입어보기를 선택하세요. 설정을 닫으면 진행 연결은 정리됩니다.</p>
    </>}
   </section>
   <section hidden={page!=='photo'} aria-label="등록 사진 적합성">
    <h3>등록 사진 확인</h3><p>처리: {processing}</p>
    {!remote?<p>본인 계정에 연결한 뒤 등록 중인 사진을 확인할 수 있어요.</p>:<>
     <p>{registration?.asset?'현재 등록 초안의 사진이 분석에 적합한지 확인해요.':'옷장의 사진 등록에서 사진을 먼저 선택해 주세요.'}</p>
     <PhotoSuitability app={app}/>
     <p>이 확인은 의류 저장과 별도예요. 실제 API는 전송 허용과 비용 승인을 검사합니다.</p>
    </>}
   </section>
  </div>
 </section>;
}
