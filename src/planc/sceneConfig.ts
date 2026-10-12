/** Source-pixel geometry verified against all 14 approved 1448 × 1086 reference PNGs.
 * This is a local demonstration mapping, never a physical sensor/mm calibration.
 */
export type PlanCRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export const PLAN_C_ASSETS = {
  background: '/assets/planc/LOCKED_BACKGROUND.png',
  trench: '/assets/planc/approved_original_trench.png',
} as const;

/** New fixtures stay distinct from older similarly named garments and their histories. */
export const PLAN_C_FIXTURE_IDS = {
  sujinTrench: 'planc:garment:sujin-trench',
  hwijaeNavyJacket: 'planc:garment:hwijae-navy-jacket',
  hwijaeWhiteShirt: 'planc:garment:hwijae-white-shirt',
  hwijaeBeigePants: 'planc:garment:hwijae-beige-pants',
  hwijaeBlackShoes: 'planc:garment:hwijae-black-shoes',
  hwijaeCasualJacket: 'planc:garment:hwijae-casual-jacket',
  hwijaeRoundNeck: 'planc:garment:hwijae-round-neck',
  hwijaeNavyPants: 'planc:garment:hwijae-navy-pants',
  hwijaeWhiteSneakers: 'planc:garment:hwijae-white-sneakers',
  hwijaeRecommendedOutfit: 'planc:outfit:hwijae-recommended',
  hwijaeSelectedOutfit: 'planc:outfit:hwijae-selected',
  hwijaeWeddingEvent: 'planc:event:hwijae-wedding-20261013',
} as const;

export const PLAN_C_PROFILE_IDS = {
  sujin: 'local:scprep-20261009-v1:profile:PSU',
  hwijae: 'local:scprep-20261009-v1:profile:PHW',
} as const;

export const PLAN_C_LED_ANCHORS = {
  'planc-led-a-trench': {
    x: 281, y: 197, bay: 'A', locationId: 'planc-location:a-long-rightmost',
    garmentId: PLAN_C_FIXTURE_IDS.sujinTrench,
    description: '왼쪽 긴 옷 행거 / 미러 쪽 끝 옷걸이 / A 구역 · 맨 오른쪽',
  },
  'planc-led-b-jacket': {
    x: 479, y: 197, bay: 'B', locationId: 'planc-location:b-upper-fourth',
    garmentId: PLAN_C_FIXTURE_IDS.hwijaeCasualJacket,
    description: '미러 왼쪽 행거 / 왼쪽에서 네 번째',
  },
  'planc-led-d-round-neck': {
    x: 965, y: 197, bay: 'D', locationId: 'planc-location:d-upper-second',
    garmentId: PLAN_C_FIXTURE_IDS.hwijaeRoundNeck,
    description: '미러 오른쪽 행거 / 왼쪽에서 두 번째',
  },
  'planc-led-b-pants': {
    x: 378, y: 548, bay: 'B', locationId: 'planc-location:b-lower-first',
    garmentId: PLAN_C_FIXTURE_IDS.hwijaeNavyPants,
    description: '미러 왼쪽 아래 행거 / 왼쪽에서 첫 번째',
  },
} as const;
export type PlanCLedAnchorId = keyof typeof PLAN_C_LED_ANCHORS;

const mirrorRect = { x: 624, y: 129, width: 220, height: 791 } satisfies PlanCRect;
const navigation = { x: 806, y: 296, width: 35, height: 53, rowGap: 65 };
/** Native scene pixels. The full navigation hit width and gap are reserved. */
const contentInsets = {left:8,right:3,navGap:7,top:158,bottom:22};
const contentRect = {
 x:mirrorRect.x+contentInsets.left,y:mirrorRect.y+contentInsets.top,
 width:mirrorRect.width-contentInsets.left-contentInsets.right-navigation.width-contentInsets.navGap,
 height:mirrorRect.height-contentInsets.top-contentInsets.bottom,
} satisfies PlanCRect;
export const PLAN_C_SCENE = {
  width: 1448,
  height: 1086,
  fit: 'contain',
  backgroundUrl: PLAN_C_ASSETS.background,
  backgroundSha256: '52cd52ddab71ce2505e65a8209fe8b112dced09b2918cafe1ce4bff3849d1bcd',
  mirrorRect,
  ledAnchors: PLAN_C_LED_ANCHORS,
  ledBodyRadius: 6.4,
  ledGlowRadius: 24,
  /** DOT source navigation geometry, all coordinates in the same source-pixel space. */
  navigation,contentInsets,contentRect,
  headerRect: {x:632,y:177,width:204,height:68} satisfies PlanCRect,
  actionRect: {x:contentRect.x,y:contentRect.y+contentRect.height-46,width:contentRect.width,height:46} satisfies PlanCRect,
  header: { x: 632, timeBaseline: 209, dateBaseline: 235 },
} as const;

export const PLAN_C_DEMO_CONTEXT = {
  source: 'approved-demonstration-fixture',
  date: '2026-10-13',
  dateLabel: '2026년 10월 13일 화요일',
  weather: '맑음',
  temperatureC: 22,
  sujin: { time: '14:28', name: '김수진', age: 52 },
  hwijae: { time: '17:30', name: '최휘재', occasion: '지원님 결혼식' },
} as const;

export interface PlanCReferenceBinding {
  readonly profileId: string;
  readonly garmentId: string;
  readonly name: string;
  readonly assetId: string | null;
  readonly assetVersion: number | null;
  readonly assetUrl: string | null;
  readonly assetStatus: 'approved-original' | 'missing-separate-original';
  readonly locationId: string | null;
  readonly ledAnchorId: PlanCLedAnchorId | null;
  readonly sourceScreens: readonly string[];
}

/** Null assets/locations are intentional: matching color/name is insufficient evidence. */
export const PLAN_C_REFERENCE_BINDINGS: readonly PlanCReferenceBinding[] = [
  {
    profileId: PLAN_C_PROFILE_IDS.sujin, garmentId: PLAN_C_FIXTURE_IDS.sujinTrench,
    name: '베이지 트렌치코트', assetId: 'planc:asset:approved-original-trench', assetVersion: 1,
    assetUrl: PLAN_C_ASSETS.trench, assetStatus: 'approved-original',
    locationId: 'planc-location:a-long-rightmost', ledAnchorId: 'planc-led-a-trench',
    sourceScreens: ['S01', 'S02', 'S03', 'S04', 'S05'],
  },
  ...[
    [PLAN_C_FIXTURE_IDS.hwijaeNavyJacket, '네이비 재킷'],
    [PLAN_C_FIXTURE_IDS.hwijaeWhiteShirt, '화이트 셔츠'],
    [PLAN_C_FIXTURE_IDS.hwijaeBeigePants, '밝은 베이지 바지'],
    [PLAN_C_FIXTURE_IDS.hwijaeBlackShoes, '블랙 슈즈'],
  ].map(([garmentId, name]): PlanCReferenceBinding => ({
    profileId: PLAN_C_PROFILE_IDS.hwijae, garmentId, name,
    assetId: null, assetVersion: null, assetUrl: null, assetStatus: 'missing-separate-original',
    locationId: null, ledAnchorId: null, sourceScreens: ['H02', 'H03', 'H04'],
  })),
  ...([
    [PLAN_C_FIXTURE_IDS.hwijaeCasualJacket, '베이지 캐주얼 재킷', 'planc-led-b-jacket'],
    [PLAN_C_FIXTURE_IDS.hwijaeRoundNeck, '흰색 라운드넥 상의', 'planc-led-d-round-neck'],
    [PLAN_C_FIXTURE_IDS.hwijaeNavyPants, '네이비 바지', 'planc-led-b-pants'],
  ] as const).map(([garmentId, name, ledAnchorId]): PlanCReferenceBinding => ({
    profileId: PLAN_C_PROFILE_IDS.hwijae, garmentId, name,
    assetId: null, assetVersion: null, assetUrl: null, assetStatus: 'missing-separate-original',
    locationId: PLAN_C_LED_ANCHORS[ledAnchorId].locationId, ledAnchorId,
    sourceScreens: ['H05', 'H06', 'H07', 'H08', 'H09'],
  })),
  {
    profileId: PLAN_C_PROFILE_IDS.hwijae, garmentId: PLAN_C_FIXTURE_IDS.hwijaeWhiteSneakers,
    name: '화이트 스니커즈', assetId: null, assetVersion: null, assetUrl: null,
    assetStatus: 'missing-separate-original', locationId: null, ledAnchorId: null,
    sourceScreens: ['H05', 'H06', 'H07', 'H08', 'H09'],
  },
];

export const PLAN_C_MISSING_ORIGINALS = [
  'Separate approved Hwijae clothing assets for both outfits',
  'Separate approved Hwijae person / saved fitting assets for both outfits',
] as const;
