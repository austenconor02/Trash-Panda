# Collected cash, scrap, deployables, and cold

## Cash contract

During flight, **Cash Collected = collected coin cash + platform cash for the current flight**. `Scoring.collectedCents` exposes that exact sum. The HUD must not show bank balance or the calculated payday. Altitude, distance, duration, space time, earning rates/multipliers, and recovery costs cannot alter this collected-cash readout. The new-flight score reset clears it. Payday continues to show the existing calculations on the results screen; this pass does not change payout rates or formulas. `tests/hud.mjs` guards this distinction with different cash and payday amounts and varying flight stats.

## Artwork and terminology

All public game copy now calls the material **scrap**. Save properties such as `scrap` and `inventory` remain unchanged for compatibility.

Supplied PNGs are copied unchanged from `F:\trash_panda_launcher_ref\image assets`:

| Source | Runtime asset |
| --- | --- |
| booster.png | public/assets/deployable-booster.png |
| teleporter.png | public/assets/deployable-teleporter.png |
| scrap.png | public/assets/orbital-scrap.png |
| scrap_2.png | public/assets/orbital-scrap-alt.png |

`item-art.ts` trims alpha bounds once and draws fitted originals. Scrap pickups use both shapes with stable, varied angles and smooth horizontal/vertical drifting. Drift stays within six/three world pixels around the pickup anchor and fades during magnet capture; collection glints stay centered. Rewards and collision anchors are unchanged.

## Deployables

The garage's **Deployables** category contains six square selection cards, including the supplied thruster and teleporter artwork, stock, price, and shortcuts. Select a card, then Buy One. Prices, ownership rules, item consumption, and save keys remain intact. Native/mobile menus put category choices and cards ahead of the detailed description.

The same slots sit at the top during launch/flight. Narrow mobile screens use two rows of three; every mobile target is at least 44px at the supported 320px width. Tap a slot on mobile, click it on desktop, or press its number:

| Key | Deployable |
| --- | --- |
| 1 | Emergency Thruster |
| 2 | Lead Boots |
| 3 | Teleporter |
| 4 | 20% health pack |
| 5 | 50% health pack |
| 6 | 75% health pack |

Arrow Up/Down and T remain alternate controls. Holds, repeated key events, and pointer-generated click events cannot consume a second item from one press.

## Cold feedback

`coldFeedback` derives exposure from the same `temperatureDamage` function as health damage, using the current suit level and planet. Frost starts subtly when the suit no longer protects the raccoon, grows as exposure and health loss increase, and leaves the screen center clear. Better suits reduce or remove ice at the same altitude. Warm air and adequate protection do not create ice even at low health.

Health damage briefly glows and shakes the clipped LCD contents. Below 50% health, red pulsing and glow intensify as health falls; cold adds icy edges to the health slot. Hardware and slot boundaries remain stable. Reduced motion disables shaking and temporal pulses while keeping steady danger colors and frost.

## Validation

`npm.cmd run check` includes static/mock tests for cash separation, six activation keys and taps, garage purchases, artwork hashes/alpha, bounded scrap motion, suit protection, resource clipping, and frost severity. Build/typechecking is separate. Static HUD/shop sheets in `artifacts/hud` render fixture data without Game, Input, gameplay, or audio. No game was launched or played for this pass.

The earlier preview server was found serving stale transformed modules. It was restarted, its served HUD response was checked for Cash Collected and the new item art, and Vite now polls source files on the external Windows drive to keep updates reliable.
