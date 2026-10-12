import type { Garment } from '../core/types';
import {PackCareEvidence} from '../MirrorCareEvidence';
import type {ProfilePackV1CarePresentation} from './profilePackV1Presentation';
import './care.css';

export interface PlanCCareProps {
  garment: Garment;
  view: 'status' | 'guide';
  onView: (view: 'status' | 'guide') => void;
  onLocate: () => void;
  onRecord: () => void;
  onBack: () => void;
  /** Derived from the repository; absence must never imply an approved record exists. */
  recentCareLabel?: string;
  recentWashLabel?: string;
  packCare?: ProfilePackV1CarePresentation | null;
}

const paths = {
  hanger: 'M8 4a2.2 2.2 0 1 1 3.5 1.7L10 7v2 M10 9 2 15q-2 2 0 3h16q2-1 0-3Z',
  clock: 'M10 1a9 9 0 1 0 .01 0 M10 5v6l4 2',
  calendar: 'M3 5h15v14H3z M3 9h15 M7 2v6 M14 2v6 M6 12h1m4 0h1m4 0h.1 M6 16h1m4 0h1m4 0h.1',
  spark: 'M10 0C9 7 7 9 0 10c7 1 9 3 10 10 1-7 3-9 10-10C13 9 11 7 10 0Z',
  pin: 'M10 20S3 12 3 7a7 7 0 0 1 14 0c0 5-7 13-7 13Z M10 4a3 3 0 1 0 .01 0',
  file: 'M4 1h8l5 5v13H4Z M12 1v6h5 M7 10h7m-7 3h7m-7 3h5',
  brush: 'M4 12 13 2l5 4-9 10Z M3 13 8 18 M1 16 5 20 M3 15l4 4 M5 13l4 4',
  wind: 'M0 7h13c7 0 7-7 2-7-3 0-3 3-3 3 M0 11h17c6 0 6 7 1 7-3 0-3-3-3-3 M0 15h8',
  wash: 'M4 6 6 18h11l3-12 M5 9c3 3 4-3 7 0s4 0 7 0 M0 1l22 22 M21 1 0 22',
  thermo: 'M8 13V4a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z M11 7v10 M17 5h3m-3 4h2',
  sun: 'M10 5a5 5 0 1 0 .01 0 M10 0v2m0 16v2M0 10h2m16 0h2 M3 3l1.5 1.5M16 16l1.5 1.5M3 17l1.5-1.5M16 4l1.5-1.5',
  drop: 'M10 0S1 11 1 15a9 9 0 0 0 18 0C19 11 10 0 10 0Z M5 14c-1 3 1 5 3 5',
} as const;

function CareIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="pc-care-icon" viewBox="-1 -1 25 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function CareButton({ icon, children, onClick }: { icon: 'pin' | 'file'; children: string; onClick: () => void }) {
  return <button type="button" className="pc-care-primary" onClick={onClick}><CareIcon name={icon} /><span>{children}</span><span aria-hidden="true">›</span></button>;
}

const guideRows = [
  { icon: 'brush', lines: ['착용 후 부드러운', '브러시로 먼지를 털어주세요.'] },
  { icon: 'wind', lines: ['통풍이 잘되는 곳에서', '충분히 환기시켜주세요.'] },
  { icon: 'wash', lines: ['잦은 세탁은 피하고,', '오염 시 드라이클리닝하세요.'] },
] as const;
const cautions = [
  { icon: 'thermo', lines: ['고온의 열을 피해주세요.'] },
  { icon: 'sun', lines: ['직사광선에 장시간', '노출하지 마세요.'] },
  { icon: 'drop', lines: ['젖었을 경우 그늘에서', '자연 건조해주세요.'] },
] as const;

/** Only the approved Plan C trench fixture uses this screen; other garments retain evidence-based care. */
export function PlanCCare({ garment, view, onView, onLocate, onRecord, onBack, recentCareLabel = '기록 없음', recentWashLabel = '기록 없음', packCare }: PlanCCareProps) {
  const guide = packCare?.garmentId === garment.id ? packCare : null;
  const photo = garment.asset?.url;
  const userCare = garment.provenance.care === 'user';
  const recommendation = userCare ? '직접 입력한 관리법' : guide?.actions.find(action => action.key === 'dryCleaning')?.text ?? '드라이클리닝';
  return <section className={`pc-care pc-care-${view}`} aria-label={`${garment.name} 케어`} data-pack-care={guide?.garmentId}>
    <div className="pc-care-heading"><h2>케어</h2><button type="button" className="pc-care-back" onClick={onBack} aria-label="케어에서 뒤로 가기">‹</button></div>
    <div className="pc-care-tabs" role="tablist" aria-label="케어 정보">
      <button type="button" role="tab" id="pc-care-tab-status" aria-controls="pc-care-panel" aria-selected={view === 'status'} onClick={() => onView('status')}>관리 현황</button>
      <button type="button" role="tab" id="pc-care-tab-guide" aria-controls="pc-care-panel" aria-selected={view === 'guide'} onClick={() => onView('guide')}>관리 가이드</button>
    </div>
    <div id="pc-care-panel" role="tabpanel" aria-labelledby={`pc-care-tab-${view}`}>
      {view === 'status' ? <>
        <div className="pc-care-status-card">
          <h3>{garment.name}</h3>
          <div className="pc-care-status-body">{photo?<img className="pc-care-status-coat" src={photo} alt={garment.name} />:<span>사진 없음</span>}
            <dl className="pc-care-details">
              <div><CareIcon name="hanger" /><dt>카테고리</dt><dd>아우터</dd></div>
              <div><CareIcon name="clock" /><dt>최근 관리</dt><dd>{recentCareLabel}</dd></div>
              <div><CareIcon name="calendar" /><dt>최근 세탁</dt><dd>{recentWashLabel}</dd></div>
              <div><CareIcon name="spark" /><dt>시연 케어</dt><dd>{recommendation}</dd></div>
            </dl>
          </div>
        </div>
        <div className="pc-care-status-actions"><CareButton icon="file" onClick={() => onView('guide')}>관리 가이드 보기</CareButton><CareButton icon="pin" onClick={onLocate}>옷 위치 찾기</CareButton></div>
        <button type="button" className="pc-care-record" onClick={onRecord}>관리 완료 기록</button>
      </> : userCare ? <><h3>{garment.name} 관리법</h3><p>{garment.careNotes || '직접 입력한 관리 내용이 없어요.'}</p><small>사용자 입력 · 시연 가이드로 덮어쓰지 않음</small><CareButton icon="pin" onClick={onLocate}>옷 위치 찾기</CareButton></> : guide ? <><PackCareEvidence guide={guide}/><CareButton icon="pin" onClick={onLocate}>옷 위치 찾기</CareButton></> : <>
        <h3 className="pc-care-guide-title">트렌치코트 케어 가이드</h3>
        <div className="pc-care-material">
          {photo?<img src={photo} alt={garment.name} />:<span>사진 없음</span>}
          <div><strong>트렌치코트</strong><span className="pc-care-muted">소재</span><p>코튼 65%<br />폴리에스터 35%</p><span>드라이클리닝 권장</span></div>
        </div>
        <div className="pc-care-guide-steps"><h4>이렇게 관리하세요</h4><ol>{guideRows.map((row, index) => <li key={row.icon}><span className="pc-care-step-number" aria-hidden="true">{index + 1}</span><CareIcon name={row.icon} /><p>{row.lines[0]}<br />{row.lines[1]}</p></li>)}</ol></div>
        <CareButton icon="pin" onClick={onLocate}>옷 위치 찾기</CareButton>
        <div className="pc-care-cautions"><h4>이런 점에 주의하세요</h4><ul>{cautions.map(row => <li key={row.icon}><CareIcon name={row.icon} /><p>{row.lines.map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p></li>)}</ul></div>
      </>}
    </div>
    <p className="pc-care-provenance">{userCare?'사용자 입력 관리 정보':guide?'시연 관리 정보 · 실제 관리 완료 기록과 별도':'승인 시연 데이터 · 소재·관리 가이드'}</p>
  </section>;
}
