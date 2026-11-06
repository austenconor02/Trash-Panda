import { config } from './config';
import type { Player } from './player';
import type { SaveData, InventoryKey } from './saves';
import { mission } from './progression';
import { fuelTankCapacity } from './fuel';
import { temperatureDamage } from './temperature';
export type HealthPackKey = keyof typeof config.healthPacks.fractions;
export interface FlightControls { up: boolean; left: boolean; right: boolean; boost: boolean; boots?: boolean; teleport?: boolean; healthPack?: HealthPackKey }
export class FlightEquipment {
  fuel = 0; capacity = 0; oxygen = 0; health = 100;
  thrusting = false; horizontalThrust = 0;
  upwardThrust = 0;
  fuelDraining = false; oxygenDraining = false; healthDraining = false;
  coldDamageRate = 0; oxygenDamageRate = 0;
  bootsTime = 0;
  get boosters() { return this.data.inventory.boosters; }
  get boots() { return this.data.inventory.leadBoots; }
  get teleports() { return this.data.inventory.teleporter; }
  get healthPacks() { return this.data.inventory; }
  get oxygenCapacity() {
    const levels = this.data.levels, tiers = config.oxygenTiers;
    const basic = config.survival.baseOxygenSeconds + levels.oxygen * config.upgradeEffects.oxygenPerLevel;
    const second = levels.oxygen2 ? tiers.firstMaximum + levels.oxygen2 * tiers.secondCapacityPerLevel : 0;
    const third = levels.oxygen3 ? tiers.secondMaximum + levels.oxygen3 * tiers.thirdCapacityPerLevel : 0;
    return Math.max(basic, second, third) + (this.data.tier === 'moon' ? levels.lunarOxygen * config.lunar.oxygenPerLevel : 0);
  }
  get oxygenBurnRate() { return Math.max(config.spaceSuit.minimumOxygenBurn, 1 - this.data.levels.suit * config.spaceSuit.oxygenReductionPerLevel); }
  constructor(private data: SaveData, private persist: () => void = () => {}) { this.reset(); }
  private consume(item: InventoryKey) {
    if (this.data.inventory[item] <= 0) return false;
    this.data.inventory[item]--; this.persist(); return true;
  }
  tryHealthPack(item: HealthPackKey) {
    if (this.health <= 0 || this.health >= config.survival.baseHealth || !this.consume(item)) return false;
    const base = config.healthPacks.healingBase === 'maximum' ? config.survival.baseHealth : this.health;
    this.health = Math.min(config.survival.baseHealth, this.health + base * config.healthPacks.fractions[item]);
    return true;
  }
  reset() {
    const e = config.upgradeEffects;
    this.capacity = this.data.levels.jetpack ? fuelTankCapacity(this.data.levels.fuel) + (this.data.tier === 'moon' ? this.data.levels.lunarFuel * config.lunar.fuelPerLevel : 0) : 0;
    this.fuel = this.capacity;
    this.oxygen = this.oxygenCapacity;
    this.health = config.survival.baseHealth; this.thrusting = false; this.horizontalThrust = 0; this.upwardThrust = 0;
    this.bootsTime = 0;
    this.fuelDraining = this.oxygenDraining = this.healthDraining = false; this.coldDamageRate = this.oxygenDamageRate = 0;
  }
  step(player: Player, controls: FlightControls, dt: number) {
    const levels = this.data.levels, e = config.upgradeEffects, p = config.propulsion;
    this.thrusting = false; this.horizontalThrust = 0; this.upwardThrust = 0;
    player.thrustingUp = false;
    this.fuelDraining = this.oxygenDraining = this.healthDraining = false; this.coldDamageRate = this.oxygenDamageRate = 0;
    if (this.health <= 0) return;
    if (controls.healthPack) this.tryHealthPack(controls.healthPack);
    const previousHealth = this.health, previousOxygen = this.oxygen, previousFuel = this.fuel;
    this.bootsTime = Math.max(0, this.bootsTime - dt);
    if (controls.boots && this.boots > 0 && player.vy > -config.leadBoots.maxDownSpeed) {
      player.vy = Math.max(-config.leadBoots.maxDownSpeed, player.vy - config.leadBoots.impulse); this.consume('leadBoots'); this.bootsTime = config.leadBoots.duration;
    }
    player.fallSpeedLimit = this.bootsTime > 0 ? config.leadBoots.maxDownSpeed : config.physics.terminalSpeed;
    if (controls.boost && this.boosters > 0 && player.vy < p.maxBoostVelocity) { player.vy = Math.min(p.maxBoostVelocity, player.vy + e.boosterImpulse); this.consume('boosters'); }
    if (levels.jetpack && this.fuel > 0 && dt > 0) {
      const upActive = controls.up;
      const direction = controls.left && !controls.right && levels.left ? -1 : controls.right && !controls.left && levels.right ? 1 : 0;
      const horizontalLevel = direction < 0 ? levels.left : levels.right;
      const up = upActive ? p.starterThrust + levels.engine * e.enginePerLevel + (this.data.tier === 'moon' ? levels.lunarEngine * config.lunar.enginePerLevel : 0) : 0;
      const horizontal = direction * (p.horizontalAcceleration + Math.max(0, horizontalLevel - 1) * p.horizontalAccelerationPerLevel);
      // Forces accelerate the existing momentum; gravity and drag act separately in Player.
      // Gallons per second scale with delivered thrust, including lunar engines.
      const burn = ((upActive ? p.fuelBurn * up / p.starterThrust : 0) + (direction ? p.horizontalFuelBurn * Math.abs(horizontal) / p.horizontalAcceleration : 0)) / (1 + levels.efficiency * e.efficiencyPerLevel);
      const fraction = burn ? Math.min(1, this.fuel / (burn * dt)) : 0;
      player.vy += up * dt * fraction; player.vx += horizontal * dt * fraction;
      this.fuel = Math.max(0, this.fuel - burn * dt);
      this.thrusting = up > 0 && fraction > 0; this.horizontalThrust = horizontal * fraction;
      this.upwardThrust = up * fraction;
      player.thrustingUp = this.thrusting;
    }
    if (player.y * config.feetPerUnit >= mission(this.data.tier).survivalFeet) {
      const oxygenTime = Math.min(dt, this.oxygen / this.oxygenBurnRate);
      this.oxygen = Math.max(0, this.oxygen - oxygenTime * this.oxygenBurnRate);
      const protection = levels.suit * e.suitProtectionPerLevel + (this.data.tier === 'moon' ? levels.lunarSuit * config.lunar.suitProtectionPerLevel : 0);
      const oxygenDamage = (dt - oxygenTime) * config.survival.damagePerSecond * Math.max(0.1, 1 - protection);
      this.oxygenDamageRate = dt > 0 ? oxygenDamage / dt : 0;
      this.health = Math.max(0, this.health - oxygenDamage);
    } else {
      this.oxygen = Math.min(this.oxygenCapacity, this.oxygen + this.oxygenCapacity * config.survival.refillFractionPerSecond * dt);
    }
    this.coldDamageRate = temperatureDamage(player.y * config.feetPerUnit, levels.suit, this.data.tier);
    this.health = Math.max(0, this.health - this.coldDamageRate * dt);
    this.fuelDraining = this.fuel < previousFuel; this.oxygenDraining = this.oxygen < previousOxygen; this.healthDraining = this.health < previousHealth;
  }
  tryTeleport(player: Player, random = Math.random) {
    if (this.teleports <= 0) return false;
    const t = config.teleporter;
    const x = (random() * 2 - 1) * t.horizontalRange;
    const speed = t.minimumSpeed + random() * (t.maximumSpeed - t.minimumSpeed), angle = random() * Math.PI * 2;
    player.teleport(x, t.altitudeFeet / config.feetPerUnit, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
    this.bootsTime = 0; this.consume('teleporter'); return true;
  }
  bounce() {
    const level = this.data.levels.landingFuel, effect = config.upgradeEffects;
    const absorbed = Math.max(level * effect.landingFuelPerLevel, this.capacity * level * effect.landingFuelCapacityFractionPerLevel);
    this.fuel = Math.min(this.capacity, this.fuel + absorbed);
    this.oxygen = Math.min(this.oxygenCapacity, this.oxygen + this.oxygenCapacity * this.data.levels.oxygenRecycler * config.oxygenRecycler.percentPerLevel);
  }
}
