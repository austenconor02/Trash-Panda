import type { PlayerPose } from './player-animation';

type Point = readonly [number, number];
export interface PlayerAtlasClip {
  pose: PlayerPose; row: number; frameCount: 8 | 10; mirror?: boolean;
  /** Authored head breadth and pelvis registration in normalized logical cell units. */
  headWidth: number | readonly number[];
  pivot: Point | readonly Point[];
  floor?: number | readonly number[];
}
export interface PlayerAtlas { src: string; columns: 4 | 8 | 10; rows: number; clips: readonly PlayerAtlasClip[] }

// Transparent trimming never changes scale: anatomical measurements do.
const punchRoot: readonly Point[] = [[.584,.629],[.537,.632],[.490,.623],[.452,.637],[.419,.662],[.382,.647],[.388,.630],[.452,.628]];
const turnRoot: readonly Point[] = [[.589,.660],[.563,.645],[.502,.585],[.498,.585],[.554,.605],[.580,.589],[.583,.598],[.584,.600]];
const bounceRoot: readonly Point[] = [[.560,.707],[.534,.769],[.540,.654],[.527,.582],[.548,.514],[.555,.550],[.546,.588],[.542,.607]];
const landingRoot: readonly Point[] = [[.50,.67],[.50,.72],[.50,.78],[.50,.78],[.50,.74],[.50,.70],[.50,.67],[.50,.67]];
const brakeRoot: readonly Point[] = [[.499,.605],[.521,.624],[.576,.613],[.603,.612],[.629,.624],[.579,.642],[.560,.672],[.550,.683]];
const correctionRoot: readonly Point[] = [[.549,.640],[.537,.621],[.490,.632],[.455,.635],[.429,.644],[.423,.652],[.407,.623],[.383,.630]];
const flightHead = [.448,.423,.410,.410,.430,.419,.428,.392] as const;
const punchHead = [.41,.40,.43,.44,.43,.44,.44,.43] as const;
const turnHead = [.43,.39,.40,.43,.43,.42,.42,.42] as const;
const brakeHead = [.465,.465,.47,.45,.45,.465,.49,.49] as const;

export const playerAtlases: readonly PlayerAtlas[] = [
  { src: '/assets/raccoon-propulsion-v2.png', columns: 8, rows: 4, clips: [
    { pose: 'thrustRight', row: 0, frameCount: 8, headWidth: flightHead, pivot: [[.465,.63],[.482,.625],[.517,.62],[.505,.603],[.494,.608],[.487,.647],[.485,.646],[.465,.641]] },
    { pose: 'thrustLeft', row: 0, frameCount: 8, headWidth: flightHead, pivot: [[.465,.63],[.482,.625],[.517,.62],[.505,.603],[.494,.608],[.487,.647],[.485,.646],[.465,.641]], mirror: true },
    { pose: 'thrustUp', row: 1, frameCount: 8, headWidth: [.425,.410,.405,.405,.407,.396,.401,.401], pivot: [[.540,.637],[.548,.631],[.540,.619],[.539,.613],[.544,.601],[.538,.597],[.538,.597],[.526,.586]] },
    { pose: 'punchRight', row: 2, frameCount: 8, headWidth: punchHead, pivot: punchRoot },
    { pose: 'punchLeft', row: 2, frameCount: 8, headWidth: punchHead, pivot: punchRoot, mirror: true },
    { pose: 'turnLeft', row: 3, frameCount: 8, headWidth: turnHead, pivot: turnRoot },
    { pose: 'turnRight', row: 3, frameCount: 8, headWidth: turnHead, pivot: turnRoot, mirror: true },
  ] },
  { src: '/assets/raccoon-contacts-v2.png', columns: 8, rows: 3, clips: [
    { pose: 'bounce', row: 0, frameCount: 8, headWidth: .40, pivot: bounceRoot },
    { pose: 'bounceRight', row: 0, frameCount: 8, headWidth: .40, pivot: bounceRoot },
    { pose: 'bounceLeft', row: 0, frameCount: 8, headWidth: .40, pivot: bounceRoot, mirror: true },
    { pose: 'landing', row: 1, frameCount: 8, headWidth: .48, pivot: landingRoot, floor: .90 },
    { pose: 'standing', row: 2, frameCount: 8, headWidth: .48, pivot: [.50,.65], floor: .90 },
  ] },
  { src: '/assets/raccoon-reactions-v2.png', columns: 8, rows: 3, clips: [
    { pose: 'brakeLeft', row: 0, frameCount: 8, headWidth: brakeHead, pivot: brakeRoot },
    { pose: 'brakeRight', row: 0, frameCount: 8, headWidth: brakeHead, pivot: brakeRoot, mirror: true },
    { pose: 'recovery', row: 1, frameCount: 8, headWidth: .49, pivot: [[.550,.610],[.552,.613],[.544,.610],[.501,.624],[.490,.644],[.511,.676],[.521,.675],[.544,.669]] },
    { pose: 'correctRight', row: 2, frameCount: 8, headWidth: .47, pivot: correctionRoot },
    { pose: 'correctLeft', row: 2, frameCount: 8, headWidth: .47, pivot: correctionRoot, mirror: true },
  ] },
  { src: '/assets/raccoon-ready-fall-v2.png', columns: 8, rows: 2, clips: [
    { pose: 'cannonball', row: 0, frameCount: 8, headWidth: .65, pivot: [.52,.57] },
    { pose: 'falling', row: 1, frameCount: 8, headWidth: .65, pivot: [.52,.63] },
  ] },
  { src: '/assets/raccoon-coasting-v2.png', columns: 10, rows: 2, clips: [
    { pose: 'idleLeft', row: 0, frameCount: 10, headWidth: [.54,.55,.55,.52,.54,.54,.535,.55,.55,.54], pivot: [[.514,.656],[.539,.643],[.552,.626],[.577,.647],[.561,.655],[.495,.634],[.449,.624],[.470,.643],[.491,.652],[.490,.655]] },
    { pose: 'idleRight', row: 1, frameCount: 10, headWidth: [.56,.55,.56,.565,.57,.57,.57,.565,.57,.56], pivot: [[.570,.660],[.583,.638],[.581,.613],[.591,.635],[.551,.658],[.539,.620],[.584,.617],[.528,.643],[.518,.650],[.541,.658]] },
  ] },
  { src: '/assets/raccoon-launch-v2.png', columns: 4, rows: 2, clips: [
    { pose: 'launch', row: 0, frameCount: 8, headWidth: [.44,.44,.44,.44,.45,.42,.38,.38], pivot: [[.527,.598],[.541,.630],[.537,.622],[.531,.637],[.528,.645],[.524,.637],[.511,.625],[.495,.608]] },
  ] },
];
