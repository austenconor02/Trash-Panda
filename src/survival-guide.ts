import { config } from './config';
import { mission } from './progression';
import { recommendedSuitLevel } from './temperature';
import type { FlightEquipment } from './flight-equipment';
import type { SaveData } from './saves';

export class SurvivalGuide {
  message = '';
  private seen = new Set<string>();
  private cooldown = 0;
  constructor(private speak: (message: string) => void = () => {}) {}
  reset() { this.message = ''; this.seen.clear(); this.cooldown = 0; }
  update(dt: number, equipment: FlightEquipment, data: SaveData, altitudeFeet: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const refillAltitude = mission(data.tier).survivalFeet.toLocaleString();
    const suit = ['NONE', 'I', 'II', 'III', 'IV', 'V'][recommendedSuitLevel(altitudeFeet, data.tier)];
    const cold = equipment.coldDamageRate > 0, air = equipment.oxygenDraining || equipment.oxygenDamageRate > 0;
    const hasPack = data.inventory.health20 + data.inventory.health50 + data.inventory.health75 > 0;
    const warnings = [
      { id: 'dead', active: equipment.health <= 0, text: 'Ground Control: Hang tight. On the next flight, better insulation and a bigger oxygen tank will help.' },
      { id: 'air-empty', active: equipment.oxygenDamageRate > 0, text: `Out of air! Drop below ${refillAltitude} ft to refill. Oxygen Tank and Recycler upgrades will help.` },
      { id: 'health-low', active: equipment.health / config.survival.baseHealth <= config.guide.healthLowFraction && (cold || equipment.healthDraining), text: hasPack ? `Health is critical! Use a health pack with 1, 2, or 3, then head down. ${cold ? `Space Suit ${suit} will help with the cold.` : 'A better tank will buy more time.'}` : cold ? `Health is critical! Head down to warmer air. Space Suit ${suit} will protect your whiskers.` : 'Health is critical! Head down to breathable air. A better tank and Space Suit will help.' },
      { id: 'air-low', active: air && (equipment.oxygen / equipment.oxygenCapacity <= config.guide.oxygenLowFraction || equipment.oxygen / equipment.oxygenBurnRate <= config.guide.oxygenWarningSeconds), text: `Oxygen is running low! Drop below ${refillAltitude} ft to refill. Upgrade your tank or Oxygen Recycler.` },
      { id: `cold-${suit}`, active: cold && equipment.healthDraining, text: `Cold is biting! Head down to warmer air. Space Suit ${suit} is the recommended upgrade for this altitude.` },
      { id: 'air-start', active: equipment.oxygenDraining, text: 'Air is getting thin. A bigger Oxygen Tank and a more efficient Space Suit will buy you more time.' },
    ];
    const warning = warnings.find(w => w.active);
    this.message = warning?.text ?? '';
    const urgent = warning && ['dead', 'air-empty', 'health-low', 'air-low'].includes(warning.id);
    if (warning && !this.seen.has(warning.id) && (this.cooldown <= 0 || urgent)) {
      this.seen.add(warning.id); this.cooldown = config.guide.cooldownSeconds; this.speak(warning.text);
    }
  }
}
