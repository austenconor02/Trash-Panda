import { upgradeDefinitions, upgradePriceGrowth } from './upgrade-definitions';
import type { UpgradeDefinition, UpgradeKey } from './upgrade-definitions';
import type { SaveData, LauncherTier, InventoryKey } from './saves';
import { launcherKeys, includeStarterThrusters } from './saves';
import { config } from './config';
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export class Economy {
  constructor(public data: SaveData, private persist: () => void) {}
  definition(key: UpgradeKey): UpgradeDefinition { return upgradeDefinitions[key]; }
  cost(key: UpgradeKey, targetLevel = this.definition(key).consumable ? 1 : this.data.levels[key] + 1) {
    const rule = this.definition(key), level = targetLevel - 1;
    if (rule.consumable) return { moneyCents: Math.round(rule.base * 100), scrap: rule.scrapBase ?? 0 };
    const detail = rule.levelDetails?.[level];
    if (detail) return { moneyCents: Math.round(detail.money * 100), scrap: detail.scrap };
    const tierCost = (launcherKeys as readonly string[]).includes(key) ? config.launcherTiers[this.data.launcherTier].upgradeCostMultiplier : 1;
    const planetaryCost = rule.planet === 'moon' ? config.lunar.upgradePriceMultiplier : 1;
    const growth = rule.priceGrowth ?? upgradePriceGrowth;
    return { moneyCents: Math.round(rule.base * 100 * growth ** level * tierCost * planetaryCost), scrap: rule.scrapBase ? Math.ceil(rule.scrapBase * growth ** level) : 0 };
  }
  lockReason(key: UpgradeKey) {
    const rule = this.definition(key), requirement = rule.requires as UpgradeKey | undefined;
    const reasons: string[] = [];
    if (rule.planet && this.data.tier !== rule.planet) reasons.push('Land on the Moon to unlock');
    if (requirement && this.data.levels[requirement] < (rule.requiresLevel ?? 1)) reasons.push(`Requires ${this.definition(requirement).name}${rule.requiresLevel ? ` level ${rule.requiresLevel}` : ''}`);
    if (rule.scrapUnlock && this.data.scrapCollected < rule.scrapUnlock) reasons.push(`Collect ${rule.scrapUnlock} scrap (${this.data.scrapCollected}/${rule.scrapUnlock})`);
    return reasons.join('. ');
  }
  locked(key: UpgradeKey) { return !!this.lockReason(key); }
  canBuy(key: UpgradeKey, targetLevel = this.definition(key).consumable ? 1 : this.data.levels[key] + 1) {
    const cost = this.cost(key, targetLevel), rule = this.definition(key);
    const valid = rule.consumable ? targetLevel === 1 && this.data.inventory[key as InventoryKey] < Number.MAX_SAFE_INTEGER
      : Number.isInteger(targetLevel) && targetLevel > this.data.levels[key] && targetLevel <= rule.max;
    return valid && !this.locked(key) && this.data.moneyCents >= cost.moneyCents && this.data.scrap >= cost.scrap;
  }
  purchase(key: UpgradeKey, targetLevel = this.definition(key).consumable ? 1 : this.data.levels[key] + 1) {
    if (!this.canBuy(key, targetLevel)) return false;
    const cost = this.cost(key, targetLevel); this.data.moneyCents -= cost.moneyCents; this.data.scrap -= cost.scrap;
    if (this.definition(key).consumable) this.data.inventory[key as InventoryKey]++;
    else this.data.levels[key] = targetLevel;
    if (key === 'jetpack') includeStarterThrusters(this.data);
    for (const item of launcherKeys) this.data.launcherLevels[this.data.launcherTier][item] = this.data.levels[item];
    this.persist(); return true;
  }
  get nextLauncherTier(): LauncherTier | null { return this.data.launcherTier < 3 ? (this.data.launcherTier + 1) as LauncherTier : null; }
  canUpgradeLauncher() {
    const next = this.nextLauncherTier;
    if (!next) return false;
    const rule = config.launcherTiers[next];
    return this.data.moneyCents >= rule.priceCents && this.data.scrap >= rule.scrapCost && this.data.scrapCollected >= rule.scrapUnlock;
  }
  upgradeLauncher() {
    if (!this.canUpgradeLauncher()) return false;
    const next = this.nextLauncherTier!, rule = config.launcherTiers[next];
    for (const item of launcherKeys) this.data.launcherLevels[this.data.launcherTier][item] = this.data.levels[item];
    this.data.moneyCents -= rule.priceCents; this.data.scrap -= rule.scrapCost; this.data.launcherTier = next;
    for (const item of launcherKeys) this.data.levels[item] = this.data.launcherLevels[next][item];
    this.persist(); return true;
  }
  award(moneyCents: number, scrap: number) {
    if (![moneyCents, scrap].every(value => Number.isSafeInteger(value) && value >= 0)) return false;
    // Keep every stored currency an exact integer, including very old or edited saves.
    const add = (balance: number, amount: number) => Math.min(Number.MAX_SAFE_INTEGER, balance + amount);
    this.data.moneyCents = add(this.data.moneyCents, moneyCents);
    this.data.scrap = add(this.data.scrap, scrap); this.data.scrapCollected = add(this.data.scrapCollected, scrap);
    this.persist(); return true;
  }
}
