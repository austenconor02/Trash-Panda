import { config } from './config';
import type { Economy } from './economy';
import { upgradeDefinitions } from './upgrade-definitions';
export interface Vector { x: number; y: number }
export class Slingshot {
  pull: Vector = { x: 0, y: 0 };
  private viewWidth = 1000;
  private viewHeight = 700;
  setViewport(width: number, height: number) { this.viewWidth = width; this.viewHeight = height; }
  constructor(private upgrades: Economy) {}
  private effectiveLevel(key: 'height' | 'width' | 'strength') {
    const tier = this.upgrades.data.launcherTier;
    const baseline = tier === 1 ? 0 : tier === 2 ? upgradeDefinitions[key].max + 1 : upgradeDefinitions[key].max + 2 + upgradeDefinitions[key].max * config.launcherTiers[2].multiplier;
    return baseline + this.upgrades.data.levels[key] * config.launcherTiers[tier].multiplier;
  }
  get restHeight() { return config.launcher.restHeight + this.upgrades.data.levels.height / upgradeDefinitions.height.max * Math.max(0, this.viewHeight * config.launcherVisuals.heightFraction - config.launcher.restHeight); }
  get halfWidth() { return config.launcher.halfWidth + this.upgrades.data.levels.width / upgradeDefinitions.width.max * Math.max(0, this.viewWidth * config.launcherVisuals.halfWidthFraction - config.launcher.halfWidth); }
  get referenceStretch() { return config.launcher.referenceStretch + this.effectiveLevel('height') * config.upgradeEffects.pullPerLevel; }
  get poleColor() { return this.upgrades.data.tier === 'moon' ? '#b0bbc6' : config.launcherTiers[this.upgrades.data.launcherTier].poleColor; }
  private get strength() { return config.launcher.strength * (1 + this.effectiveLevel('strength') * config.upgradeEffects.strengthPerLevel) * config.launcherTiers[this.upgrades.data.launcherTier].multiplier * (this.upgrades.data.tier === 'moon' ? config.lunar.launchMultiplier * (1 + this.upgrades.data.levels.lunarLaunch * config.lunar.launchPerLevel) : 1); }
  get posts() {
    return (['left', 'right'] as const).map(side => {
      const post = config.launcher.posts[side], band = config.launcher.bands[side];
      return { side, x: (side === 'left' ? -1 : 1) * this.halfWidth, y: this.restHeight + post.heightOffset, thickness: post.thickness, efficiency: post.launchEfficiency, stiffness: band.stiffness, slack: band.slack };
    });
  }
  get speedCapacity() {
    const data = this.upgrades.data, tier = config.launcherTiers[data.launcherTier], weights = config.launcherEnergy;
    const progress = data.levels.height / upgradeDefinitions.height.max * weights.heightWeight
      + data.levels.strength / upgradeDefinitions.strength.max * weights.strengthWeight
      + data.levels.width / upgradeDefinitions.width.max * weights.widthWeight;
    return (tier.baseSpeed + (tier.maxSpeed - tier.baseSpeed) * progress)
      * (data.tier === 'moon' ? config.lunar.launchMultiplier * (1 + data.levels.lunarLaunch * config.lunar.launchPerLevel) : 1);
  }
  get power() { const velocity = this.velocity(); return velocity ? Math.hypot(velocity.x, velocity.y) / this.speedCapacity : 0; }
  get bandColor() { return config.bandColors[Math.min(config.bandColors.length - 1, Math.floor(Math.max(0, this.upgrades.data.levels.strength - 1) / config.bandColorMilestone))]; }
  get bandThickness() { return config.launcherVisuals.bandThicknesses[Math.max(0, this.upgrades.data.levels.strength - 1) % config.bandColorMilestone]; }
  setPull(x: number, y: number) {
    if (Number.isFinite(x) && Number.isFinite(y)) this.pull = { x, y };
  }
  velocity(): Vector | null {
    if (Math.hypot(this.pull.x, this.pull.y) < config.launcher.minimumPull) return null;
    const strength = this.strength;
    const force = { x: 0, y: 0 };
    for (const post of this.posts) {
      const dx = post.x - this.pull.x, dy = post.y - (this.restHeight + this.pull.y);
      const length = Math.hypot(dx, dy);
      const restingLength = Math.hypot(post.x, post.y - this.restHeight) + post.slack;
      const extension = Math.max(0, length - restingLength);
      if (!length || !extension) continue;
      const tension = extension * strength * post.stiffness * post.efficiency;
      force.x += dx / length * tension; force.y += dy / length * tension;
    }
    // Wider posts improve lateral leverage; taller posts increase the usable spring-energy scale.
    force.x *= 1 + (this.halfWidth - config.launcher.halfWidth) / config.launcher.halfWidth * config.launcher.widthLeverage;
    const magnitude = Math.hypot(force.x, force.y);
    if (!magnitude) return null;
    // Resting pouch to ground is a full pull; half that distance gives half speed.
    // Extra dragging stays unrestricted while launch speed respects tier capacity.
    const speed = this.speedCapacity * Math.min(1, Math.hypot(this.pull.x, this.pull.y) / this.restHeight);
    return { x: force.x / magnitude * speed, y: force.y / magnitude * speed };
  }
  reset() { this.pull = { x: 0, y: 0 }; }
}
