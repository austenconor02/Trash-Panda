// Exhaustive shop and persistence checks. Uses an in-memory store, never browser saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-panda-economy-'));
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { Economy } = require('./economy.js');
  const { freshSave, SaveManager } = require('./saves.js');
  const { upgradeDefinitions, upgradeKeys } = require('./upgrade-definitions.js');
  let tiersChecked = 0;
  function richPilot(key, launcherTier = 1) {
    const data = freshSave('Isolated shop audit');
    data.moneyCents = 10 ** 14; data.scrap = data.scrapCollected = 10 ** 9;
    data.launcherTier = launcherTier;
    if (upgradeDefinitions[key].planet) { data.tier = 'moon'; data.moonReached = true; }
    const includeRequirements = item => {
      const rule = upgradeDefinitions[item];
      if (rule.requires) {
        includeRequirements(rule.requires);
        data.levels[rule.requires] = rule.requiresLevel ?? 1;
      }
    };
    includeRequirements(key);
    if (data.levels.jetpack) data.levels.left = data.levels.right = 1;
    return data;
  }

  for (const key of upgradeKeys) {
    const rule = upgradeDefinitions[key];
    for (const launcherTier of ['height', 'width', 'strength'].includes(key) ? [1, 2, 3] : [1]) {
      for (let target = 1; target <= rule.max; target++) {
        const data = richPilot(key, launcherTier), shop = new Economy(data, () => {});
        // Included level-one steering is already owned; test purchasing it from zero too.
        data.levels[key] = 0;
        const cost = shop.cost(key, target), money = data.moneyCents, scrap = data.scrap;
        assert.ok(Number.isSafeInteger(cost.moneyCents) && cost.moneyCents > 0, `${key}:${target} exact positive price`);
        assert.ok(Number.isSafeInteger(cost.scrap) && cost.scrap >= 0, `${key}:${target} exact debris price`);
        assert.equal(shop.purchase(key, target), true, `${key}:${target} direct tier purchase`);
        assert.equal(data.moneyCents, money - cost.moneyCents);
        assert.equal(data.scrap, scrap - cost.scrap);
        assert.equal(data.scrapCollected, 10 ** 9, 'spending debris preserves lifetime research');
        if (rule.consumable) assert.equal(data.inventory[key], 1);
        else {
          assert.equal(data.levels[key], target);
          assert.equal(shop.purchase(key, target), false, 'repeated purchase cannot double-charge');
          assert.equal(shop.purchase(key, target - 1), false, 'purchases cannot downgrade');
        }
        for (const invalid of [0, -1, NaN, Infinity, rule.max + 1, '1']) {
          const before = structuredClone(data);
          assert.equal(shop.purchase(key, invalid), false, `${key} rejects invalid target ${invalid}`);
          assert.deepEqual(data, before);
        }
        const manager = new SaveManager(); manager.write(2, data);
        const loaded = new SaveManager().slots[2];
        assert.deepEqual(loaded, data, `${key}:${target} ownership, inventory, wallet, launcher history round trip`);
        const poor = richPilot(key, launcherTier); poor.levels[key] = 0; poor.moneyCents = cost.moneyCents - 1;
        assert.equal(new Economy(poor, () => {}).purchase(key, target), false, `${key}:${target} insufficient money`);
        if (cost.scrap) {
          poor.moneyCents = money; poor.scrap = cost.scrap - 1;
          assert.equal(new Economy(poor, () => {}).purchase(key, target), false, `${key}:${target} insufficient debris`);
        }
        tiersChecked++;
      }
    }
    if (rule.requires) {
      const data = richPilot(key); data.levels[rule.requires] = (rule.requiresLevel ?? 1) - 1;
      assert.equal(new Economy(data, () => {}).purchase(key, rule.max), false, `${key} cannot bypass prerequisite by direct tier`);
    }
    if (rule.scrapUnlock) {
      const data = richPilot(key); data.scrapCollected = rule.scrapUnlock - 1;
      assert.equal(new Economy(data, () => {}).purchase(key, rule.max), false, `${key} lifetime research gate`);
    }
    if (rule.planet) {
      const data = richPilot(key); data.tier = 'earth'; data.moonReached = false;
      assert.equal(new Economy(data, () => {}).purchase(key, rule.max), false, `${key} planetary gate`);
    }
    if (!rule.consumable) {
      const data = richPilot(key); data.levels[key] = rule.max;
      assert.equal(new Economy(data, () => {}).purchase(key), false, `${key} maximum enforced`);
    }
  }

  const capped = freshSave('Overflow regression');
  capped.moneyCents = capped.scrap = capped.scrapCollected = Number.MAX_SAFE_INTEGER - 1;
  let persists = 0;
  const shop = new Economy(capped, () => { persists++; });
  assert.equal(shop.award(500, 3), true);
  assert.equal(capped.moneyCents, Number.MAX_SAFE_INTEGER);
  assert.equal(capped.scrap, Number.MAX_SAFE_INTEGER);
  assert.equal(capped.scrapCollected, Number.MAX_SAFE_INTEGER);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const before = structuredClone(capped);
    assert.equal(shop.award(invalid, 0), false); assert.equal(shop.award(0, invalid), false);
    assert.deepEqual(capped, before, 'invalid awards leave all balances unchanged');
  }
  assert.equal(persists, 1, 'invalid awards do not persist');
  new SaveManager().write(0, capped);
  assert.equal(new SaveManager().slots[0].moneyCents, Number.MAX_SAFE_INTEGER, 'overflow cannot erase wallet on reload');

  const storageKey = 'trash-panda-aerospace-slots-v2';
  const ordinary = freshSave('Unaffected slot'); ordinary.moneyCents = 12345;
  const oversized = freshSave('Recover old overflow');
  oversized.moneyCents = oversized.scrap = oversized.scrapCollected = Number.MAX_SAFE_INTEGER + 2;
  oversized.inventory.boosters = Number.MAX_SAFE_INTEGER + 2;
  storage.set(storageKey, JSON.stringify([ordinary, oversized, { name: 'Malformed', moneyCents: -50, scrap: 0.5, levels: { height: 9999, fuel: -1 }, inventory: { boosters: -1 } }]));
  const recovered = new SaveManager();
  assert.deepEqual(recovered.slots[0], ordinary, 'repairing another slot preserves this slot');
  assert.equal(recovered.slots[1].moneyCents, Number.MAX_SAFE_INTEGER);
  assert.equal(recovered.slots[1].inventory.boosters, Number.MAX_SAFE_INTEGER);
  assert.equal(recovered.slots[2].moneyCents, 0); assert.equal(recovered.slots[2].scrap, 0);
  assert.equal(recovered.slots[2].levels.height, 15); assert.equal(recovered.slots[2].levels.fuel, 0);
  assert.equal(recovered.slots[2].inventory.boosters, 0);
  storage.delete(storageKey); storage.set('trash-panda-aerospace-v1', JSON.stringify({ money: 1e308, levels: {} }));
  assert.equal(new SaveManager().slots[0].moneyCents, Number.MAX_SAFE_INTEGER, 'oversized legacy wallet migrates without Infinity');
  assert.equal(new SaveManager().slots[0].moneyCents, Number.MAX_SAFE_INTEGER, 'legacy migration remains stable after reload');
  console.log(`Economy audit passed: ${upgradeKeys.length} items, ${tiersChecked} direct tier purchases across all launcher tiers, prerequisites, prices, insufficient funds, save round trips, and currency overflow recovery.`);
} finally {
  if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('trash-panda-economy-')) fs.rmSync(temporary, { recursive: true, force: true });
}
