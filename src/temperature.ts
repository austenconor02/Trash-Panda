import { config } from './config';
import type { Planet } from './progression';
export function inTemperatureZone(altitudeFeet: number, planet: Planet = 'earth') {
  return recommendedSuitLevel(altitudeFeet, planet) > 0;
}
export function temperatureAtAltitude(altitudeFeet: number, planet: Planet = 'earth') {
  const scale = planet === 'moon' ? config.lunar.distanceScale : 1;
  const altitude = Math.max(0, altitudeFeet) / scale, markers = config.temperature.markers;
  const upper = markers.findIndex(m => m.feet > altitude);
  if (upper === 0) return markers[0].fahrenheit;
  if (upper === -1) return markers[markers.length - 1].fahrenheit;
  const a = markers[upper - 1], b = markers[upper];
  const t = (altitude - a.feet) / (b.feet - a.feet), smooth = t * t * (3 - 2 * t);
  return a.fahrenheit + (b.fahrenheit - a.fahrenheit) * smooth;
}
export function recommendedSuitLevel(altitudeFeet: number, planet: Planet = 'earth') {
  const temperature = temperatureAtAltitude(altitudeFeet, planet);
  const level = config.temperature.suitMinimumF.findIndex(minimum => temperature >= minimum);
  return level < 0 ? config.temperature.suitMinimumF.length - 1 : level;
}
export function temperatureDamage(altitudeFeet: number, suitLevel: number, planet: Planet = 'earth') {
  const level = Math.max(0, Math.min(config.temperature.suitMinimumF.length - 1, Math.floor(suitLevel)));
  const deficit = Math.max(0, config.temperature.suitMinimumF[level] - temperatureAtAltitude(altitudeFeet, planet));
  return Math.min(config.temperature.maximumDamagePerSecond, deficit * config.temperature.damagePerDegree);
}
