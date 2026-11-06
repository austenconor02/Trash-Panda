// Regression checks for returning to generated areas and swept flight contacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-world-check-'));
try {
  fs.writeFileSync(path.join(temporary, 'package.json'), '{"type":"commonjs"}');
  for (const file of fs.readdirSync('src').filter(file => file.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join('src', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    fs.writeFileSync(path.join(temporary, file.replace(/\.ts$/, '.js')), outputText);
  }
  const require = createRequire(path.join(temporary, 'package.json'));
  const { World } = require('./world.js');
  const { config } = require('./config.js');
  const { Player } = require('./player.js');

  for (const planet of ['earth', 'moon']) {
    for (let seed = 0; seed < 30; seed++) {
      const world = new World(seed); world.planet = planet;
      // Include the first target and the regular/rich orbital scrap regions.
      for (const cy of [0, 10, 30]) {
        world.update(0, (cy + 0.5) * config.generation.chunkHeight, 900, 600, 0);
        const original = structuredClone(world.generate(0, cy));
        for (const platform of world.platforms.filter(p => original.platforms.some(o => o.id === p.id))) world.bounce(platform);
        world.update(100000, cy * config.generation.chunkHeight, 900, 600, 0);
        world.update(0, (cy + 0.5) * config.generation.chunkHeight, 900, 600, 0);
        const returned = world.generate(0, cy);
        assert.deepEqual(returned.coins, original.coins, `${planet}, seed ${seed}, chunk ${cy}: used platforms must not relocate untouched coins or scrap`);
        assert.equal(returned.platforms.length, 0, 'returning cannot restore used platforms');
        // Removing pickups must not alter later debris-overlap placement either.
        for (const coin of world.coins.filter(c => original.coins.some(o => o.id === c.id)).filter((_, i) => i % 2 === 0)) {
          world.collect(coin.x, coin.y, coin.x, coin.y);
        }
        const remainingIds = new Set(world.coins.map(c => c.id));
        const expectedCoins = original.coins.filter(c => remainingIds.has(c.id));
        assert.deepEqual(world.generate(0, cy).coins, expectedCoins, 'collecting coins or debris only removes those objects');
      }
    }
  }

  const emptyRewards = () => ({ coins: 0, coinCents: 0, platformCents: 0, scrap: 0 });
  const sweptWorld = {
    ceilingY: Infinity,
    platforms: [1400, 1000].map((y, i) => ({ id: `swept-${i}`, x: 0, y, width: 150, tier: 'silver', used: false })),
    collect: emptyRewards,
    bounce(platform) { platform.used = true; return { ...emptyRewards(), platformCents: 100 }; },
  };
  const player = new Player(); player.reset(1500); player.vy = -10000;
  player.step(0.1, sweptWorld);
  assert.equal(sweptWorld.platforms[0].used, true, 'high-speed descent chooses the first crossed surface');
  assert.equal(sweptWorld.platforms[1].used, false, 'one bounce cannot also consume a lower platform');

  console.log('World regression checks passed: stable returned layouts across 180 regions and swept platform order.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
