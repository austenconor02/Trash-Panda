# Tablet payday, music, and fuel — November 5, 2026

## Music and audio

The supplied garage track is copied unchanged to `public/audio/garage-idle.mp3`. It loops on the save menu, in the garage, on results, and while paused. The supplied **Tick Tock Steam.mp3** is copied unchanged to `public/audio/flight-tick-tock.mp3` and begins when the launcher releases, continuing through flight and return. Leaving a menu fades its song to silence over 200 ms; aiming and charging stay quiet. Switching between flight and a menu fades the outgoing song out and pauses it before the incoming song fades in over 200 ms. The songs never overlap and preserve their playback positions. Rapid transitions replace the requested mode, so an old fade or delayed playback cannot restart the wrong song.

Music starts after a browser user gesture. Master/music volume and mute control both tracks; effects volume remains separate. Hidden pages stop playback. Coin stacking uses layered, varied metallic clinks, short row-settling sounds, and a cash-register/coin-spill completion sound. Nodes are bounded and disconnected after playing. A runtime-rendered ching sample is saved in `artifacts/payday/cha-ching.wav`.

The current music correction uses one HTML audio element for both sources, with independent saved song positions. The outgoing source finishes fading and pauses before the element changes source. Generation checks cancel stale fades and play callbacks. Replacing the game retires its old audio controller; another focused game tab claims music ownership through BroadcastChannel. Page departure stops playback immediately. See [the current HUD/music notes](modular-hud-music.md) for validation boundaries.

## Tablet and payday

Canvas menus share a beveled technical tablet with screws, a phosphor grid, scanlines, and a top-down digital screen startup. The actual launch-area art is rendered into a cached, blurred backdrop. The pause panel uses the same visual treatment. Mobile menus use a readable native version of the terminal.

Results show only:

- Max height
- Flight time
- Distance
- Space reached and time in space, when the flight reaches the current world's space threshold
- Scrap
- One money-earned total

Each stat shows its complete quantity, earning rate, and a growing line total: for example, `101,056 ft × $0.006/ft = $606.34`. Only one line counts at a time, with a half-second reading pause before the next. The grand total and coin stacks count after the receipt settles, followed by one completion ching. The sequence takes about 9.5 seconds normally or 13 seconds with space rows. Skip Count ends presentation silently; Garage and Launch Again remain usable. Reduced-motion settings display final values immediately.

Stat payouts now add independently, as requested: height earns $0.006/ft, flight time $0.50/s, distance $0.003/ft, reaching space $50, and space time $1.25/s. Rates live in `config.scoring`. Only earned space rows appear. Scrap stays a separate inventory reward. There are no hidden minimum payouts or stacked altitude/airtime/space multipliers. Existing coin and platform value upgrades still determine collected cash; its exact sum appears once beneath the grand total, with any recovery deduction. The equation is `stat earnings + collected cash - recovery = grand total`. Money is credited and saved once before the visual count starts; presentation never writes intermediate balances or awards twice. Pause and hidden tabs freeze the count. Native controls keep keyboard focus throughout, and mobile actions remain visible at the bottom of the scrolling receipt.

## Fuel changes

All tank capacities and upgrade gains increase by **20%**, preserving upgrade levels and prices:

| Capacity | Before | After |
| --- | --- | --- |
| Starter tank | 2.0 gal | 2.4 gal |
| Maximum Earth tank | 40.5 gal | 48.6 gal |
| Each Lunar Fuel level | +2.0 gal | +2.4 gal |
| Maximum Earth + Lunar tanks | 60.5 gal | 72.6 gal |

**Fuel Absorber** replaces the visible name Landing Fuel Cells while retaining the existing `landingFuel` save field. It is available immediately after buying a jetpack, with no debris research requirement; its $85 starting price and five levels remain.

Each fresh platform bounce restores the greater of **0.5 gal per level** or **4% of tank capacity per level**, capped at a full tank. Level 1 restores 0.5 gal with the starter tank. Level 5 restores 9.72 gal with the maximum Earth tank, or 14.52 gal with the maximum combined Lunar tank. Used platforms cannot refill repeatedly. A successful refill shows its gallons gained above the player.

## Verification

- `npm.cmd run build` and `npm.cmd run check` pass; checks include payoff timing, exact/idempotent rewards, stable controls, music routing/autoplay races, tank increases, purchase gates, saves, and fresh-platform refills.
- Production frame-consistency checks pass at 30/60/144 Hz.
- Isolated Chrome testing verified both supplied MP3s advancing during their intended states, menu/flight/pause transitions, independent mute controls, animated payout amounts and one completion event, pause/skip behavior, optional space rows, exact wallet credit, and actual early platform fuel recovery.
- The mobile 390 × 844 space payday fits without scrolling or clipped action buttons. Screenshots and browser observations are in `artifacts/payday/`; no browser runtime errors were recorded.
- Audible output was not listened to; playback, synthesis output, peak level, and routing were verified programmatically.
