import type {DemoState, Garment, Outfit, OutfitDraft} from '../core/types';
import {fittingSnapshotsMatch, type FittingCandidate, type FittingSnapshot, type MirrorPerson} from '../mirrorScene';
import {isProfilePackV1Installed, type ProfilePackV1Catalog} from './profilePackV1Adapter';
import {matchExistingPreparedSnapshot, resolveAsset} from './profilePackV1Pure.mjs';

type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const one = (values: Row[], predicate: (value: Row) => boolean): Row | null => {
  const matches = values.filter(predicate); return matches.length === 1 ? matches[0] : null;
};
function profileRef(catalog: ProfilePackV1Catalog, ownerId: string): string | null {
  const bindings = Object.entries(catalog.raw.profileBindings.profiles).filter(([, value]) => (value as Row).runtimeProfileId === ownerId);
  return bindings.length === 1 ? bindings[0][0] : null;
}
function packGarment(catalog: ProfilePackV1Catalog, garment: Garment): {profileRef: string; raw: Row; asset: Row} | null {
  const ref = profileRef(catalog, garment.ownerId);
  const raw = ref && one(rows(catalog.raw.profiles[ref]?.garments), row => row.ref === garment.id && row.ownerRef === ref);
  const asset = raw && one(rows(catalog.raw.shared.assets), row => row.id === raw.mainAssetId && row.version === raw.assetVersion);
  if (!ref || !raw || !asset || raw.category !== garment.category || garment.asset?.source !== 'packaged'
    || garment.asset.id !== asset.id || garment.asset.version !== asset.version || garment.asset.needsReselection
    || garment.asset.url !== resolveAsset(asset.path, catalog.baseUrl)) return null;
  return {profileRef: ref, raw, asset};
}

/** Display-only persona, never an automatically approved paid-provider input. */
export function profilePackV1Person(catalog: ProfilePackV1Catalog | null, ownerId: string): MirrorPerson | null {
  if (!catalog || catalog.issues.length) return null;
  const ref = profileRef(catalog, ownerId), person = ref && one(rows(catalog.raw.shared.people), p => p.ownerRef === ref);
  const asset = person && one(rows(catalog.raw.shared.assets), a => a.id === person.referenceAssetId && a.version === person.assetVersion);
  if (!person || !asset || person.displayOnly !== true || asset.alpha !== true || !asset.quality?.displayReady) return null;
  return {id: person.ref, referenceAssetId: asset.id, version: asset.version, ownerId, url: resolveAsset(asset.path, catalog.baseUrl)};
}

export type ProfilePackV1FittingRead =
  | {status: 'ready'; candidate: FittingCandidate; providerExecuted: false; fitAccuracyVerified: false; limitations: string[]}
  | {status: 'missing'; reason: 'pack-unavailable' | 'selection-changed' | 'identity-changed' | 'no-exact-prepared-result' | 'result-unavailable'; message: string; providerExecuted: false; limitations: string[]};

/** Exact reference lookup is presentation-only. Current repository assets and request epoch are both rechecked. */
export function resolveProfilePackV1Fitting(input: {
  catalog: ProfilePackV1Catalog | null; state: DemoState;
  snapshot: FittingSnapshot | null; currentSnapshot?: FittingSnapshot | null;
}): ProfilePackV1FittingRead {
  const fail = (reason: Exclude<ProfilePackV1FittingRead, {status: 'ready'}>['reason']): ProfilePackV1FittingRead => ({
    status: 'missing', reason, message: '이 조합의 준비된 피팅은 없습니다. 편집·카드 저장·일정은 계속 사용할 수 있어요.', providerExecuted: false, limitations: [],
  });
  const {catalog, state, snapshot} = input, current = input.currentSnapshot === undefined ? snapshot : input.currentSnapshot;
  if (!catalog || !snapshot || !isProfilePackV1Installed(catalog, state)) return fail('pack-unavailable');
  if (!fittingSnapshotsMatch(snapshot, current)) return fail('selection-changed');
  if (state.profiles.filter(p => p.id === snapshot.ownerId).length !== 1) return fail('identity-changed');
  const person = profilePackV1Person(catalog, snapshot.ownerId);
  if (!person || person.referenceAssetId !== snapshot.person.assetId || person.version !== snapshot.person.assetVersion) return fail('identity-changed');
  for (const item of snapshot.outfit.items) {
    const matches = state.garments.filter(g => g.id === item.garmentId && g.ownerId === snapshot.ownerId);
    const mapped = matches.length === 1 && packGarment(catalog, matches[0]);
    if (!mapped || item.slot !== matches[0].category || item.assetId !== mapped.asset.id || item.assetVersion !== mapped.asset.version) return fail('identity-changed');
  }
  const candidate = matchExistingPreparedSnapshot(catalog.raw, snapshot, current, catalog.raw.profileBindings, catalog.baseUrl) as FittingCandidate | null;
  if (!candidate) return fail('no-exact-prepared-result');
  const result = one(rows(catalog.raw.shared.prepared_fittings), r => r.ref === candidate.resultId);
  const asset = result && one(rows(catalog.raw.shared.assets), a => a.id === result.resultAssetId);
  if (!result || result.mode !== 'reference_saved' || result.matchPolicy !== 'exact_full_outfit_and_person_assets'
    || result.providerExecutionVerified !== false || result.fitAccuracyVerified !== false || !asset || asset.role !== 'person_result'
    || asset.alpha !== true || asset.quality?.displayReady !== true || !candidate.media || candidate.media.kind !== 'image'
    || candidate.media.url !== resolveAsset(asset.path, catalog.baseUrl)) return fail('result-unavailable');
  const limitations = [...new Set([...(asset.quality?.limitations ?? []), ...snapshot.outfit.items.flatMap(item => {
    const garmentAsset = one(rows(catalog.raw.shared.assets), a => a.id === item.assetId && a.version === item.assetVersion);
    return garmentAsset?.quality?.limitations ?? [];
  })])].filter((text): text is string => typeof text === 'string');
  return {status: 'ready', candidate: {...candidate, origin: 'reference_saved'}, providerExecuted: false, fitAccuracyVerified: false, limitations};
}

export interface ProfilePackV1CarePresentation {
  garmentId: string; title: string; badge: string; evidenceState: string; source: 'prepared-demo';
  physicalLabelVerified: false; productMatchVerified: false; actualCareRecorded: false;
  composition: {name: string; percent: number}[]; compositionBasis: string;
  actions: {key: string; label: string; text: string; basis: string}[];
  steps: string[]; storage: string; cautions: string[];
  label: {assetId: string; url: string; kind: 'authored_text_card_not_photograph'} | null;
  /** Display notes are whitelisted; sourceText/reviewNote are not customer advice. */
  sourceLabel: string; limitations: string[];
}
const actionLabels: Record<string, string> = {washing: '세탁', drying: '건조', ironing: '다림질', bleaching: '표백', dryCleaning: '드라이클리닝'};
export function profilePackV1Care(catalog: ProfilePackV1Catalog | null, garment: Garment): ProfilePackV1CarePresentation | null {
  if (!catalog || catalog.issues.length || garment.provenance.care === 'user') return null;
  const mapped = packGarment(catalog, garment); if (!mapped) return null;
  const guide = one(rows(catalog.raw.profiles[mapped.profileRef]?.care), g => g.garmentRef === garment.id && g.ownerRef === mapped.profileRef && g.ref === mapped.raw.careRef);
  if (!guide || guide.physicalLabelVerified !== false || guide.productMatchVerified !== false) return null;
  const label = one(rows(catalog.raw.shared.assets), a => a.id === guide.labelAssetId && a.role === 'demo_label');
  return {
    garmentId: garment.id, title: guide.title, badge: guide.displayBadge, evidenceState: guide.evidenceState,
    source: 'prepared-demo', physicalLabelVerified: false, productMatchVerified: false, actualCareRecorded: false,
    composition: rows(guide.fabricComposition).map(v => ({name: v.name, percent: v.percent})), compositionBasis: guide.compositionBasis,
    actions: Object.entries(actionLabels).flatMap(([key, name]) => {
      const action = guide.actions?.[key]; return typeof action?.textKo === 'string' ? [{key, label: name, text: action.textKo, basis: action.basis}] : [];
    }),
    steps: [...guide.stepsKo], storage: guide.storageKo, cautions: [...guide.cautionsKo],
    label: label && guide.labelRendering === 'authored_text_card_not_photograph' ? {assetId: label.id, url: resolveAsset(label.path, catalog.baseUrl), kind: 'authored_text_card_not_photograph'} : null,
    sourceLabel: guide.evidenceState === 'approved_reference_demo' ? '승인 화면의 시연 안내 · 실물 라벨 미확인' : '팩의 가상 시연 안내 · 실물 라벨 미확인',
    limitations: ['시연 라벨은 작성된 안내 이미지이며 실물 라벨 사진이 아닙니다.', ...(mapped.asset.quality?.limitations ?? [])],
  };
}

/** A canonical cache is reusable by content, not by a mutable card name or its former ID. */
export function profilePackV1CanonicalCard(catalog: ProfilePackV1Catalog | null, garments: readonly Garment[],
  outfit: Outfit | OutfitDraft | null, purpose: 'master' | 'home' | 'fitting-card' | 'calendar' = 'master') {
  if (!catalog || catalog.issues.length || !outfit || Object.keys(outfit.externalItems ?? {}).length) return null;
  const ref = profileRef(catalog, outfit.ownerId), entries = Object.entries(outfit.items);
  if (!ref || !entries.length || entries.some(([, id]) => !id)) return null;
  const current = entries.map(([slot, garmentId]) => {
    const matches = garments.filter(g => g.id === garmentId && g.ownerId === outfit.ownerId);
    const mapped = matches.length === 1 && packGarment(catalog, matches[0]);
    if (!mapped || slot !== matches[0].category || outfit.assetIds?.[garmentId!] !== mapped.asset.id
      || outfit.assetVersions?.[garmentId!] !== mapped.asset.version) return null;
    return {slot, garmentRef: garmentId, assetId: mapped.asset.id, assetVersion: mapped.asset.version, assetHash: mapped.asset.sha256};
  });
  if (current.some(v => !v)) return null;
  const layout = one(rows(catalog.raw.shared.flatlay_layouts), l => rows(l.items).length === current.length && rows(l.items).every(i =>
    i.kind === 'owned' && current.some(v => v && v.slot === i.slot && v.garmentRef === i.garmentRef && v.assetId === i.assetId && v.assetVersion === i.assetVersion && v.assetHash === i.assetHash)));
  const packOutfit = layout && one(rows(catalog.raw.profiles[ref]?.outfits), o => o.ref === layout.outfitRef && o.ownerRef === ref);
  const asset = layout && one(rows(catalog.raw.shared.assets), a => a.id === layout.cacheAssetId && a.role === 'flatlay' && a.alpha === true);
  if (!layout || !packOutfit || !asset || layout.uiDecorationsBaked !== false) return null;
  const variant = purpose === 'master' ? null : one(rows(asset.variants), v => v.purpose === purpose);
  return {url: resolveAsset(variant?.path ?? asset.path, catalog.baseUrl), masterUrl: resolveAsset(asset.path, catalog.baseUrl),
    assetId: asset.id as string, assetVersion: asset.version as number, assetHash: (variant?.sha256 ?? asset.sha256) as string,
    canonicalOutfitId: packOutfit.ref as string, layoutRef: layout.ref as string, width: (variant?.width ?? asset.width) as number,
    height: (variant?.height ?? asset.height) as number, canvas: {width: layout.canvas.width as number, height: layout.canvas.height as number}};
}

export interface ProfilePackV1LocationItem {
  garmentId: string; garmentName: string; locationId: string | null;
  status: 'exact_demo' | 'zone_only' | 'unknown' | 'user_changed' | 'identity_changed' | 'scene_unmatched';
  displayLabel: string; reason: string; known: boolean; anchorIds: string[]; physicalLocationVerified: false;
}
export interface ProfilePackV1LedAnchor {id: string; garmentId: string; locationId: string; x: number; y: number; width: number; height: number; shape: 'short_segment';}

/** The pack's reviewed geometry is authoritative. A null anchor never falls back to sceneConfig. */
export function resolveProfilePackV1Locations(catalog: ProfilePackV1Catalog | null, garments: readonly Garment[], ownerId: string,
  requested: readonly string[], sceneHash: string, sceneVariant = 'approved-base') {
  const anchors: ProfilePackV1LedAnchor[] = [];
  const items: ProfilePackV1LocationItem[] = [...new Set(requested)].map(garmentId => {
    const owned = garments.filter(g => g.id === garmentId && g.ownerId === ownerId), garment = owned.length === 1 ? owned[0] : null;
    const base: ProfilePackV1LocationItem = {garmentId, garmentName: garment?.name ?? '의류 확인 필요', locationId: null, status: 'unknown', displayLabel: '위치 미확인 · LED 꺼짐', reason: 'no-reviewed-placement', known: false, anchorIds: [], physicalLocationVerified: false};
    if (!catalog || catalog.issues.length || !garment) return base;
    if(garment.provenance.location==='user')return {...base,status:'user_changed',displayLabel:garment.location||'사용자가 변경한 위치 · LED 미연결',reason:'user-location-preserved'};
    const mapped = packGarment(catalog, garment);
    if (!mapped) return {...base, status: 'identity_changed', reason: 'garment-asset-or-profile-changed'};
    const expected = catalog.bundles.find(b => b.profileRef === mapped.profileRef)?.bundle.garments.find(g => g.id === garmentId);
    if (!expected || garment.location !== expected.location) return {...base, status: 'user_changed', displayLabel: garment.location || '사용자가 변경한 위치 · LED 미연결', reason: 'user-location-preserved'};
    const placement = one(rows(catalog.raw.shared.placements), p => p.profileRef === mapped.profileRef && p.garmentRef === garmentId && p.sceneVariant === sceneVariant);
    if (!placement) return base;
    if (catalog.raw.shared.scene?.backgroundSha256 !== sceneHash || placement.sourceBackgroundHash !== sceneHash
      || placement.sourceDimensions?.[0] !== 1448 || placement.sourceDimensions?.[1] !== 1086) return {...base, status: 'scene_unmatched', reason: 'scene-hash-or-dimensions-changed'};
    const location = one(rows(catalog.raw.shared.locations), l => l.ref === placement.locationRef);
    if (!location) return base;
    if (placement.bindingLevel === 'zone_only') return {...base, status: 'zone_only', locationId: location.ref,
      displayLabel: `${location.zone} 구역 · 정확 위치 보류 · LED 꺼짐`, reason: placement.identityReview};
    const led = placement.ledAnchor;
    if (placement.bindingLevel !== 'exact_demo' || !led || led.shape !== 'short_segment'
      || ![led.x, led.y, led.width, led.height].every(Number.isFinite) || led.x < 0 || led.x > 1448 || led.y < 0 || led.y > 1086
      || led.width <= 0 || led.height <= 0) return base;
    const id = `pack-led:${placement.ref}`;
    anchors.push({id, garmentId, locationId: location.ref, x: led.x, y: led.y, width: led.width, height: led.height, shape: 'short_segment'});
    return {...base, status: 'exact_demo', known: true, locationId: location.ref, anchorIds: [id], displayLabel: `${location.labelKo} · 시연 위치`, reason: placement.identityReview};
  });
  return {items, anchors, anchorIds: anchors.map(a => a.id), unknownIds: items.filter(i => !i.known).map(i => i.garmentId), sceneVersion: sceneHash};
}
