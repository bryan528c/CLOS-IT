import {useState} from 'react';
import type {Asset,Garment} from './core/types';
import {garmentDisplayPresentation} from './lifeData/visualPresentation';
import {HorizontalPager} from './HorizontalPager';
import './mirror-photo.css';
export const GARMENT_PAGE_SIZE=12;
/** Grid copy only: retain color/category and the exact original name everywhere else. */
export function shortGarmentDisplayName(name:string):string {
 const descriptors=new Set(['옥스퍼드','포플린','테일러드','스트레이트']);
 return name.split(/\s+/).filter(word=>!descriptors.has(word)).join(' ').trim()||name;
}
/** A photo is optional. Keep its frame and exact accessible name stable through loading or failure. */
export function MirrorPhoto({asset:originalAsset,garment,example:explicitExample=false,presentationRevision='',name,emptyLabel='사진 준비 중',compact=false,loadEnabled=true}:{asset?:Asset|null;garment?:Garment;example?:boolean;presentationRevision?:string;name:string;emptyLabel?:string;compact?:boolean;loadEnabled?:boolean}){
 const display=garment?garmentDisplayPresentation(garment):null,asset=display?display.asset:originalAsset,example=display?.example??explicitExample;
 const source=asset?.url?`${asset.id}:${asset.version}:${asset.url}:${display?.revision??presentationRevision}`:'', [loaded,setLoaded]=useState(''),[failed,setFailed]=useState('');
 const state=!source?'missing':failed===source?'error':loaded===source?'ready':'loading';
 const status=state==='ready'?'':state==='error'?'사진 로드 실패':state==='loading'?'사진 불러오는 중':emptyLabel;
 return <span className={`mirror-photo${compact?' mirror-photo--compact':''}`} role="img" aria-label={`${name}${example?' · 예시 이미지':''}${status?' · '+status:''}`} title={`${name}${example?' · 생성된 시연 예시 이미지':''}`} data-photo-state={state} data-example-image={example||undefined}>
  {loadEnabled&&source&&state!=='error'&&<img key={source} src={asset!.url!} alt="" aria-hidden="true" draggable={false} onLoad={()=>setLoaded(source)} onError={()=>setFailed(source)}/>}
  {example&&state==='ready'&&<small className="mirror-photo-example">예시</small>}
  {state!=='ready'&&<span className="mirror-photo-placeholder" aria-hidden="true"><small>{compact&&state==='loading'?'로딩 중':compact&&state==='error'?'로드 실패':status}</small></span>}
 </span>;
}
export function garmentPages<T>(items:readonly T[],size=GARMENT_PAGE_SIZE):T[][]{const pages:T[][]=[];for(let i=0;i<items.length;i+=size)pages.push(items.slice(i,i+size));return pages;}
export function MirrorGarmentGrid({garments,index,onIndexChange,onSelect,label='의류 탐색',selectedId,pageSize=6}:{garments:Garment[];index:number;onIndexChange:(value:number)=>void;onSelect:(garment:Garment)=>void;label?:string;selectedId?:string;pageSize?:number}){const pages=garmentPages(garments,Math.max(1,Math.min(24,Math.trunc(pageSize)||GARMENT_PAGE_SIZE)));const valid=Math.max(0,Math.min(index,pages.length-1));return pages.length?<HorizontalPager label={label} index={valid} onIndexChange={onIndexChange} peek={0}>{pages.map((page,i)=><div className="mg-grid" key={i} data-garment-page={i}>{page.map(g=><button className="mg-cell" key={g.id} data-garment-id={g.id} title={g.name} aria-label={`${g.name} 선택`} aria-pressed={g.id===selectedId} onClick={()=>onSelect(g)}><MirrorPhoto garment={g} name={g.name} loadEnabled={Math.abs(i-valid)<=1}/><span>{shortGarmentDisplayName(g.name)}</span></button>)}</div>)}</HorizontalPager>:<p className="mx-glass">조건에 맞는 옷이 없어요.</p>;}
