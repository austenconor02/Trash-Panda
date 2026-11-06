import { config } from './config';

// Normalize increasing upgrade gains to the configured fully upgraded tank.
export function fuelTankCapacity(level: number) {
  const { maximumCapacity, upgradeWeights } = config.fuelTank;
  const count = Math.max(0, Math.min(upgradeWeights.length, Math.floor(level)));
  const totalWeight = upgradeWeights.reduce((total, weight) => total + weight, 0);
  const ownedWeight = upgradeWeights.slice(0, count).reduce((total, weight) => total + weight, 0);
  return config.propulsion.starterFuel + (maximumCapacity - config.propulsion.starterFuel) * ownedWeight / totalWeight;
}
