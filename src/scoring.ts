import { config } from './config';
import type { Player } from './player';
import type { Rewards } from './world';
import { mission } from './progression';
import type { Planet } from './progression';
import type { PaydayEarning } from './payday';
export class Scoring {
  maxAltitude = 0; horizontal = 0; distance = 0; duration = 0; coins = 0;
  coinCents = 0; platformCents = 0; scrap = 0;
  spaceDuration = 0;
  retainedFraction = 1;
  planet: Planet = 'earth';
  /** HUD cash is collected coins and platforms only. Payday calculations stay separate. */
  get collectedCents() { return this.coinCents + this.platformCents; }
  reset() { this.retainedFraction = 1; this.spaceDuration = this.maxAltitude = this.horizontal = this.distance = this.duration = this.coins = this.coinCents = this.platformCents = this.scrap = 0; }
  finalize(spaceDeath: boolean, funeralLevel: number) {
    const fractions = config.funerals.retainedFractions;
    this.retainedFraction = spaceDeath ? fractions[Math.max(0, Math.min(fractions.length - 1, Math.floor(funeralLevel)))] : 1;
  }
  step(player: Player, previousX: number, previousY: number, dt: number, rewards: Rewards, surviving = true) {
    this.planet = player.planet;
    this.maxAltitude = Math.max(this.maxAltitude, player.y * config.feetPerUnit);
    this.horizontal = Math.max(this.horizontal, Math.abs(player.x) * config.feetPerUnit);
    this.distance += Math.hypot(player.x - previousX, player.y - previousY) * config.feetPerUnit;
    this.duration += dt; this.coins += rewards.coins; this.coinCents += rewards.coinCents; this.platformCents += rewards.platformCents; this.scrap += rewards.scrap;
    if (surviving) {
      const threshold = mission(player.planet).survivalFeet / config.feetPerUnit;
      const startAbove = previousY >= threshold, endAbove = player.y >= threshold;
      const fraction = startAbove === endAbove ? Number(startAbove)
        : startAbove ? (previousY - threshold) / (previousY - player.y)
        : (player.y - threshold) / (player.y - previousY);
      this.spaceDuration += Math.max(0, dt) * fraction;
    }
  }
  breakdown() {
    const s = config.scoring;
    const rows: PaydayEarning[] = [];
    const add = (id: PaydayEarning['id'], value: number, rate: number, decimals = 0) => {
      const scale = 10 ** decimals, target = Math.round(Math.max(0, value) * scale) / scale;
      const rateCents = rate * 100;
      rows.push({ id, target, rateCents, amountCents:Math.round(target * rateCents) });
    };
    add('height', this.maxAltitude, s.altitude);
    add('time', this.duration, s.flightSecond, 1);
    add('distance', this.distance, s.distance);
    if (this.spaceDuration > 0 || this.maxAltitude >= mission(this.planet).survivalFeet) {
      add('space', 1, s.spaceReached); add('spaceTime', this.spaceDuration, s.spaceSecond, 1);
    }
    const flightCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    const collectedCents = this.collectedCents;
    const grossCents = flightCents + collectedCents;
    const totalCents = Math.floor(grossCents * this.retainedFraction);
    const funeralCents = grossCents - totalCents;
    return { rows, flightCents, collectedCents, grossCents, funeralCents, retainedFraction:this.retainedFraction, totalCents };
  }
}
