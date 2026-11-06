import { config } from './config';
import type { SaveData } from './saves';
export type Planet = 'earth' | 'moon';
export function mission(planet: Planet) {
  const lunar = planet === 'moon';
  return { origin: lunar ? 'Moon' : 'Earth', destination: lunar ? 'Mars' : 'Moon', targetFeet: lunar ? config.destinations.mars.milestoneFeet : config.destinations.moon.milestoneFeet, survivalFeet: config.survival.thresholdFeet * (lunar ? config.lunar.distanceScale : 1) };
}
export function completeLanding(data: SaveData, healthy: boolean) {
  if (!healthy) return null;
  if (data.tier === 'earth') { data.moonReached = true; data.tier = 'moon'; return 'Moon'; }
  data.marsReached = true; return 'Mars';
}
