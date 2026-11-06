/** Visual state only. Clip durations do not change forces, fuel, or collisions. */
export type PlayerPose = 'thrustLeft' | 'thrustRight' | 'brakeRight' | 'brakeLeft'
  | 'turnLeft' | 'turnRight' | 'thrustUp' | 'falling' | 'landing' | 'standing'
  | 'bounce' | 'bounceLeft' | 'bounceRight' | 'recovery' | 'correctLeft' | 'correctRight'
  | 'idleLeft' | 'idleRight' | 'punchLeft' | 'punchRight' | 'cannonball' | 'launch';

export interface AnimationClip { frames: number; seconds: number; loop: boolean }
export const animationClips: Readonly<Record<PlayerPose, AnimationClip>> = {
  thrustLeft: { frames: 8, seconds: .64, loop: true },
  thrustRight: { frames: 8, seconds: .64, loop: true },
  brakeRight: { frames: 8, seconds: .24, loop: false },
  brakeLeft: { frames: 8, seconds: .24, loop: false },
  turnLeft: { frames: 8, seconds: .24, loop: false },
  turnRight: { frames: 8, seconds: .24, loop: false },
  thrustUp: { frames: 8, seconds: .28, loop: false },
  falling: { frames: 8, seconds: .48, loop: true },
  landing: { frames: 8, seconds: .34, loop: false },
  standing: { frames: 8, seconds: 1.6, loop: true },
  bounce: { frames: 8, seconds: .18, loop: false },
  bounceLeft: { frames: 8, seconds: .18, loop: false },
  bounceRight: { frames: 8, seconds: .18, loop: false },
  recovery: { frames: 8, seconds: .24, loop: false },
  correctLeft: { frames: 8, seconds: .22, loop: false },
  correctRight: { frames: 8, seconds: .22, loop: false },
  idleLeft: { frames: 10, seconds: .84, loop: true },
  idleRight: { frames: 10, seconds: .84, loop: true },
  punchLeft: { frames: 8, seconds: .24, loop: false },
  punchRight: { frames: 8, seconds: .24, loop: false },
  cannonball: { frames: 8, seconds: .22, loop: false },
  launch: { frames: 8, seconds: .26, loop: false },
};

export const animationTiming = {
  blendSeconds: .06, blinkInterval: 3, impactSeconds: .32, boosterSeconds: .24,
  headingSpeed: 20, groundedReboundSpeed: 4, standingSpeed: 22, landingSkidHoldSeconds: .14,
} as const;

export interface AnimationPlayer { vx: number; vy: number; grounded: boolean }
export interface AnimationEquipment { horizontalThrust: number; upwardThrust: number; health?: number }
type Direction = -1 | 0 | 1;
type HorizontalStage = 'brake' | 'turn' | 'punch' | 'correct' | 'sustain';

export class PlayerAnimation {
  pose: PlayerPose = 'idleRight';
  frameIndex = 0;
  aimingFrame = 0;
  facing: -1 | 1 = 1;
  grounded = false;
  previousPose: PlayerPose = 'idleRight';
  previousFrameIndex = 0;
  previousFacing: -1 | 1 = 1;
  /** 0 is the previous pose; 1 is the current pose. Ground contacts never crossfade. */
  blend = 1;
  private elapsed = 0;
  private blendElapsed: number = animationTiming.blendSeconds;
  private aimingElapsed = 0;
  private horizontalDirection: Direction = 0;
  private horizontalStage: HorizontalStage = 'sustain';
  private wasPowered = false;
  private contactAge = Infinity;
  private contactFacing: -1 | 1 = 1;
  private previousGroundContact = false;
  private previousVerticalVelocity = 0;
  private landingSkid = false;
  private bounceSignal = false;
  private impactSignal = false;
  private boosterSignal = false;
  private impactRemaining = 0;
  private boosterRemaining = 0;
  private launchRemaining = 0;

  reset() {
    this.pose = this.previousPose = 'idleRight'; this.frameIndex = this.previousFrameIndex = this.aimingFrame = 0;
    this.facing = this.previousFacing = this.contactFacing = 1; this.grounded = this.previousGroundContact = false;
    this.previousVerticalVelocity = 0;
    this.landingSkid = false;
    this.elapsed = this.aimingElapsed = this.impactRemaining = this.boosterRemaining = this.launchRemaining = 0;
    this.blend = 1; this.blendElapsed = animationTiming.blendSeconds;
    this.horizontalDirection = 0; this.horizontalStage = 'sustain'; this.wasPowered = false;
    this.contactAge = Infinity; this.bounceSignal = this.impactSignal = this.boosterSignal = false;
    return this;
  }

  updateAiming(dt: number) {
    this.aimingElapsed += this.validDelta(dt);
    const clip = animationClips.cannonball, phase = this.aimingElapsed % (animationTiming.blinkInterval + clip.seconds);
    this.aimingFrame = phase < animationTiming.blinkInterval ? 0
      : Math.min(clip.frames - 1, Math.floor((phase - animationTiming.blinkInterval) / clip.seconds * clip.frames + 1e-9));
    return this;
  }

  /** Begin unfurling the held tuck; physics and input continue without a delay. */
  beginLaunch(direction?: number) {
    const facingBefore = this.facing;
    if (direction !== undefined && Number.isFinite(direction) && direction !== 0) this.facing = direction < 0 ? -1 : 1;
    this.launchRemaining = animationClips.launch.seconds;
    this.grounded = false;
    this.contactAge = Infinity; this.horizontalDirection = 0; this.wasPowered = this.landingSkid = false;
    this.previousGroundContact = false; this.previousVerticalVelocity = 0;
    this.impactRemaining = this.boosterRemaining = 0;
    this.select('launch', true, facingBefore);
    this.previousPose = 'cannonball'; this.previousFrameIndex = this.aimingFrame; this.previousFacing = facingBefore;
    this.frameIndex = 0; this.blend = this.blendElapsed = 0;
    return this;
  }

  update(dt: number, player: AnimationPlayer, equipment: AnimationEquipment, booster = false, platformBounce = false, impact = false, crashing = false) {
    dt = this.validDelta(dt);
    const facingBefore = this.facing;
    const direction = Math.sign(equipment.horizontalThrust) as Direction;
    const momentumFacing = Math.abs(player.vx) > animationTiming.headingSpeed ? Math.sign(player.vx) as -1 | 1 : this.facing;
    const freshImpact = impact && !this.impactSignal, freshBounce = platformBounce && !this.bounceSignal;
    if (booster && !this.boosterSignal) this.boosterRemaining = Math.max(animationTiming.boosterSeconds, animationClips.thrustUp.seconds);
    if (freshImpact) this.impactRemaining = animationTiming.impactSeconds;
    this.bounceSignal = platformBounce; this.impactSignal = impact; this.boosterSignal = booster;
    const powered = direction !== 0 || equipment.upwardThrust > 0 || this.boosterRemaining > 0;
    const uncontrolled = crashing || equipment.health !== undefined && equipment.health <= 0 || this.impactRemaining > 0;
    // A single physics step at the floor can still have upward rebound velocity.
    // It is an airborne contact, not the beginning of a standing idle.
    const settledGround = player.grounded && player.vy <= animationTiming.groundedReboundSpeed;
    const skidding = settledGround && Math.abs(player.vx) > animationTiming.standingSpeed;
    const groundRebound = player.grounded && !this.previousGroundContact && !settledGround && this.previousVerticalVelocity < 0;
    if ((freshBounce || groundRebound) && !settledGround && !uncontrolled) {
      this.contactAge = 0; this.contactFacing = momentumFacing;
    }
    let next: PlayerPose;
    let restart = false;
    if (settledGround) {
      next = !this.grounded || skidding || this.pose === 'landing' && !this.complete() ? 'landing' : 'standing';
      this.contactAge = Infinity; this.horizontalDirection = 0; this.wasPowered = false;
      this.impactRemaining = this.boosterRemaining = this.launchRemaining = 0;
    } else if (uncontrolled) {
      next = 'falling'; restart = freshImpact;
      this.facing = momentumFacing; this.contactAge = Infinity;
      this.horizontalDirection = 0; this.wasPowered = false; this.launchRemaining = 0;
    } else if (this.launchRemaining > 0) {
      next = 'launch'; this.contactAge = Infinity; this.horizontalDirection = 0; this.wasPowered = false;
    } else if (this.contactAge < animationClips.bounce.seconds) {
      next = this.contactFacing < 0 ? 'bounceLeft' : 'bounceRight'; restart = freshBounce || groundRebound;
      this.facing = this.contactFacing; this.horizontalDirection = 0; this.wasPowered = false;
    } else if (direction) {
      const changed = this.horizontalDirection !== direction;
      if (player.vx * direction < -animationTiming.headingSpeed) this.horizontalStage = 'brake';
      else if (!changed && this.horizontalStage === 'brake') this.horizontalStage = 'turn';
      else if (changed) {
        this.horizontalStage = this.pose === 'launch' ? this.facing === direction ? 'sustain' : 'turn'
          : this.contactAge !== Infinity || this.pose === 'recovery' || this.pose === 'thrustUp' ? 'correct'
          : this.horizontalDirection !== 0 || this.facing !== direction && Math.abs(player.vx) <= animationTiming.headingSpeed ? 'turn' : 'punch';
      } else if (this.horizontalStage !== 'sustain' && this.complete()) this.horizontalStage = 'sustain';
      const side = direction < 0 ? 'Left' : 'Right';
      next = this.horizontalStage === 'sustain' ? `thrust${side}` : `${this.horizontalStage}${side}` as PlayerPose;
      this.facing = this.horizontalStage === 'brake' ? momentumFacing : direction;
      this.horizontalDirection = direction; this.wasPowered = true; this.contactAge = Infinity;
    } else if (powered) {
      next = 'thrustUp'; this.horizontalDirection = 0; this.wasPowered = true; this.contactAge = Infinity;
    } else {
      next = this.contactAge !== Infinity || this.wasPowered || this.pose === 'falling' || this.pose === 'recovery' && !this.complete()
        ? 'recovery' : momentumFacing < 0 ? 'idleLeft' : 'idleRight';
      this.facing = momentumFacing; this.horizontalDirection = 0; this.wasPowered = false; this.contactAge = Infinity;
    }
    this.grounded = settledGround; this.previousGroundContact = player.grounded;
    this.previousVerticalVelocity = player.vy;
    this.select(next, restart, facingBefore);
    if (next === 'landing' && skidding) {
      // Compress into the braced crouch, then keep planted feet through the skid.
      this.elapsed = Math.min(this.elapsed + dt, animationTiming.landingSkidHoldSeconds);
      this.landingSkid = this.elapsed + 1e-9 >= animationTiming.landingSkidHoldSeconds;
    } else {
      // After a held crouch the second half rises into standing over about 180ms.
      if (next === 'landing' && this.landingSkid) this.elapsed = Math.max(this.elapsed, animationClips.landing.seconds / 2);
      this.landingSkid = false; this.elapsed += dt;
    }
    this.blendElapsed += dt;
    this.frameIndex = this.frameAt(this.pose, this.elapsed);
    this.blend = Math.min(1, this.blendElapsed / animationTiming.blendSeconds);
    if (this.contactAge !== Infinity) this.contactAge += dt;
    this.impactRemaining = Math.max(0, this.impactRemaining - dt);
    this.boosterRemaining = Math.max(0, this.boosterRemaining - dt);
    this.launchRemaining = Math.max(0, this.launchRemaining - dt);
    return this;
  }

  private select(pose: PlayerPose, restart: boolean, facingBefore: -1 | 1) {
    if (pose === this.pose && !restart && facingBefore === this.facing) return;
    this.previousPose = this.pose; this.previousFrameIndex = this.frameIndex; this.previousFacing = facingBefore;
    const ground = (value: PlayerPose) => value === 'landing' || value === 'standing';
    this.blendElapsed = ground(this.pose) || ground(pose) ? animationTiming.blendSeconds : 0;
    if (pose !== this.pose || restart) this.elapsed = 0;
    this.pose = pose;
  }
  private complete() { return this.elapsed + 1e-9 >= animationClips[this.pose].seconds; }
  private frameAt(pose: PlayerPose, elapsed: number) {
    const clip = animationClips[pose], index = Math.floor(elapsed / clip.seconds * clip.frames + 1e-9);
    return clip.loop ? index % clip.frames : Math.min(clip.frames - 1, index);
  }
  private validDelta(dt: number) { return Number.isFinite(dt) ? Math.max(0, dt) : 0; }
}
