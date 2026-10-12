import {useState,useSyncExternalStore} from 'react';
import type {DemoApp} from './core/app';
import {HorizontalPager} from './HorizontalPager';
import {permittedMirrorProfiles} from './mirrorPanelData';
import './mirror-panels.css';

export function MirrorProfiles({app,onSelectProfile,onAccount,onConnections}:{onConnections?:()=>void;app:DemoApp;onSelectProfile:(id:string)=>void;onAccount:()=>void}){
 const state=useSyncExternalStore(app.subscribe,app.getState),[page,setPage]=useState(0),[pending,setPending]=useState(state.activeProfileId),local=app.connection.kind==='local';
 const profiles=permittedMirrorProfiles(state,app.connection.kind),pages=Array.from({length:Math.ceil(profiles.length/4)},(_,index)=>profiles.slice(index*4,index*4+4)),active=profiles.find(p=>p.id===state.activeProfileId),candidate=profiles.find(p=>p.id===pending);
 return <section className="mx-work mx-profile-panel" aria-label="프로필 선택"><h1>마이</h1><h2>프로필</h2>
  <p className="mx-profile-context">사용 중 · {active?.name??'프로필 확인 필요'}</p>
  <HorizontalPager index={Math.min(page,Math.max(0,pages.length-1))} onIndexChange={setPage} label="프로필 가로 탐색" peek={0} gap={8} showControls={pages.length>1}>
   {pages.map((profiles,index)=><div className="mx-profiles-grid" key={index}>{profiles.map(profile=><button type="button" key={profile.id} data-profile-id={profile.id} data-active-profile={profile.id===state.activeProfileId} aria-label={`${profile.name} 프로필 선택`} aria-pressed={profile.id===pending} onClick={()=>setPending(profile.id)}><strong>{profile.name}</strong><span className="mx-profile-check" aria-hidden="true">{profile.id===pending?'✓':''}</span></button>)}</div>)}
  </HorizontalPager>
  <button className="pc-action pc-profile-start" disabled={!candidate} onClick={()=>onSelectProfile(pending)}>이 프로필로 시작</button>
  <small className="mx-profile-context">{candidate&&candidate.id!==state.activeProfileId?`${candidate.name} 선택 · 시작하면 전환돼요`:local?'이 브라우저의 로컬 시연 프로필':'현재 로그인에 허용된 프로필'}</small>
  {!local&&profiles.length===1&&<p className="mx-panel-note">다른 가족 프로필은 공유 권한이 연결되면 표시돼요.</p>}
  <details className="mx-profile-settings"><summary>계정·연결 설정</summary>{onConnections&&<button className="mx-profile-account" onClick={onConnections}>연결·피팅 설정</button>}<button type="button" className="mx-profile-account" onClick={onAccount}>내 계정</button></details>
 </section>;
}