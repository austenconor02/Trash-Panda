import { upgradeDefinitions, upgradeKeys } from './upgrade-definitions';
import type { UpgradeKey } from './upgrade-definitions';
import { config } from './config';
import type { Planet } from './progression';
export type LauncherTier = keyof typeof config.launcherTiers;
export const launcherKeys = ['height', 'width', 'strength'] as const;
export type LauncherLevels = Record<typeof launcherKeys[number], number>;
export const inventoryKeys = ['teleporter', 'leadBoots', 'boosters', 'health20', 'health50', 'health75'] as const;
export type InventoryKey = typeof inventoryKeys[number];
export interface SaveData {
  name: string; moneyCents: number; scrap: number; scrapCollected: number; levels: Record<UpgradeKey, number>;
  bestAltitude: number; bestDistance: number; flights: number; tier: Planet; moonReached: boolean;
  moonBestAltitude: number; moonBestDistance: number; moonFlights: number; marsReached: boolean;
  launcherTier: LauncherTier; launcherLevels: Record<LauncherTier, LauncherLevels>;
  launcherLevelVersion: number;
  inventory: Record<InventoryKey, number>;
}
export function freshSave(name: string): SaveData {
  return { name: name.trim().slice(0, 24) || 'New pilot', moneyCents: 0, scrap: 0, scrapCollected: 0, levels: Object.fromEntries(upgradeKeys.map(key => [key, 0])) as Record<UpgradeKey, number>, inventory: Object.fromEntries(inventoryKeys.map(key => [key, 0])) as Record<InventoryKey, number>, bestAltitude: 0, bestDistance: 0, flights: 0, tier: 'earth', moonReached: false, moonBestAltitude: 0, moonBestDistance: 0, moonFlights: 0, marsReached: false, launcherTier: 1, launcherLevelVersion: 1, launcherLevels: { 1: { height: 0, width: 0, strength: 0 }, 2: { height: 0, width: 0, strength: 0 }, 3: { height: 0, width: 0, strength: 0 } } };
}
function migrateInventory(data: SaveData, oldLevels: Partial<Record<UpgradeKey, number>>) {
  for (const item of inventoryKeys) {
    const old = oldLevels[item];
    if (Number.isSafeInteger(old) && old! > 0) data.inventory[item] = Math.min(item === 'teleporter' ? 1 : 5, old!);
    data.levels[item] = 0;
  }
}
function migrateLauncherLevels(data: SaveData) {
  const oldMax = { height: 10, width: 8, strength: 10 };
  for (const item of launcherKeys) data.launcherLevels[data.launcherTier][item] = data.levels[item];
  for (const tier of [1, 2, 3] as const) for (const item of launcherKeys) data.launcherLevels[tier][item] = Math.min(15, Math.ceil(data.launcherLevels[tier][item] / oldMax[item] * 15));
  for (const item of launcherKeys) data.levels[item] = data.launcherLevels[data.launcherTier][item];
}
const key = 'trash-panda-aerospace-slots-v2';
export function includeStarterThrusters(data: SaveData) {
  if (data.levels.jetpack > 0) {
    data.levels.left = Math.max(1, data.levels.left);
    data.levels.right = Math.max(1, data.levels.right);
  }
}
export class SaveManager {
  slots: (SaveData | null)[] = [null, null, null];
  available = true;
  constructor() {
    try {
      const stored = localStorage.getItem(key);
      const raw = JSON.parse(stored ?? 'null');
      if (Array.isArray(raw)) this.slots = this.slots.map((_, index) => this.validate(raw[index]));
      // Preserve the first foundation's purchases and wallet when upgrading the project.
      if (stored === null) {
        const old = JSON.parse(localStorage.getItem('trash-panda-aerospace-v1') ?? 'null');
        if (old && Number.isFinite(old.money) && old.money >= 0) {
          const migrated = freshSave('Original pilot'); migrated.moneyCents = Math.min(Number.MAX_SAFE_INTEGER, Math.round(old.money * 100));
          for (const item of upgradeKeys) if (Number.isInteger(old.levels?.[item]) && old.levels[item] >= 0) migrated.levels[item] = Math.min(upgradeDefinitions[item].max, old.levels[item]);
          includeStarterThrusters(migrated);
          migrateLauncherLevels(migrated);
          migrateInventory(migrated, old.levels ?? {});
          this.slots[0] = migrated; this.flush();
        }
      }
    } catch { this.available = false; }
  }
  private validate(raw: unknown): SaveData | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Partial<SaveData>;
    if (typeof value.name !== 'string') return null;
    const data = freshSave(value.name);
    for (const field of ['moneyCents', 'scrap', 'scrapCollected', 'flights', 'moonFlights'] as const) if (typeof value[field] === 'number' && Number.isFinite(value[field]) && Number.isInteger(value[field]) && value[field]! >= 0) data[field] = Math.min(Number.MAX_SAFE_INTEGER, value[field]!);
    for (const field of ['bestAltitude', 'bestDistance', 'moonBestAltitude', 'moonBestDistance'] as const) if (typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field]! >= 0) data[field] = value[field]!;
    for (const item of upgradeKeys) {
      const level = value.levels?.[item];
      if (Number.isInteger(level) && level! >= 0) data.levels[item] = Math.min(upgradeDefinitions[item].max, level!);
    }
    includeStarterThrusters(data);
    if (value.inventory && typeof value.inventory === 'object') {
      for (const item of inventoryKeys) {
        const count = value.inventory[item];
        if (Number.isFinite(count) && Number.isInteger(count) && count >= 0) data.inventory[item] = Math.min(Number.MAX_SAFE_INTEGER, count);
        data.levels[item] = 0;
      }
    } else migrateInventory(data, value.levels ?? {});
    data.launcherTier = value.launcherTier === 3 ? 3 : value.launcherTier === 2 ? 2 : 1;
    for (const tier of [1, 2, 3] as const) for (const item of launcherKeys) {
      const level = value.launcherLevels?.[tier]?.[item];
      if (Number.isInteger(level) && level! >= 0) data.launcherLevels[tier][item] = Math.min(upgradeDefinitions[item].max, level!);
    }
    for (const item of launcherKeys) data.launcherLevels[data.launcherTier][item] = data.levels[item];
    if (value.launcherLevelVersion !== 1) migrateLauncherLevels(data);
    // Old altitude records alone are not landings; only the new saved planetary stage unlocks Moon.
    data.tier = value.tier === 'moon' ? 'moon' : 'earth';
    data.moonReached = data.tier === 'moon'; data.marsReached = data.tier === 'moon' && value.marsReached === true;
    data.scrapCollected = Math.max(data.scrapCollected, data.scrap);
    // Older saves predate scrap unlocks: grandfather already purchased equipment.
    for (const item of upgradeKeys) {
      const definition = upgradeDefinitions[item] as import('./upgrade-definitions').UpgradeDefinition;
      if (data.levels[item] > 0) data.scrapCollected = Math.max(data.scrapCollected, definition.scrapUnlock ?? 0);
    }
    return data;
  }
  write(slot: number, data: SaveData) { this.slots[slot] = structuredClone(data); this.flush(); }
  private flush() {
    try { localStorage.setItem(key, JSON.stringify(this.slots)); this.available = true; }
    catch { this.available = false; }
  }
}
