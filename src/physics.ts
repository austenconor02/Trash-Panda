import { config } from './config';
import type { Planet } from './progression';
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function gravityScaleAtAltitude(altitudeFeet: number, planet: Planet = 'earth') {
  const p = config.physics;
  const distanceScale = planet === 'moon' ? config.lunar.distanceScale : 1;
  const strengthScale = planet === 'moon' ? config.lunar.gravityScale : 1;
  const altitude = Math.max(0, altitudeFeet) / distanceScale;
  if (altitude <= p.gravityTransitionStartFeet) return Math.max(p.minimumGravityScale, 1 - (1 - p.minimumGravityScale) * smooth(altitude / p.gravityReducedAtFeet)) * strengthScale;
  if (altitude <= p.gravityInvertFeet) return p.minimumGravityScale * (1 - smooth((altitude - p.gravityTransitionStartFeet) / (p.gravityInvertFeet - p.gravityTransitionStartFeet))) * strengthScale;
  return -p.attractionScale * smooth((altitude - p.gravityInvertFeet) / (p.attractionFullFeet - p.gravityInvertFeet));
}
export function gravityAtAltitude(altitudeFeet: number, planet: Planet = 'earth') { return config.physics.gravity * gravityScaleAtAltitude(altitudeFeet, planet); }
