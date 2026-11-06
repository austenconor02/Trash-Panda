# Flight animation pass — November 5, 2026

The existing aviator raccoon is preserved: gray/brown fur, cream muzzle and black mask, brass goggles with blue lenses, red scarf, olive flight gear, leather gloves/boots, knee pads, striped tail and metal jetpack. Six new transparent atlases contain **124 unique generated drawings**, used by **22 animation clips / 180 indexed frames** including mirrored directions. Original artwork remains in place.

## Assets and preview

Generated with the built-in image_gen tool, using the original character sheets and approved new sheets as references:

| Saved asset | Layout | Motion |
| --- | --- | --- |
| `public/assets/raccoon-propulsion-v2.png` | 8 × 4 | Powered flight, upward arms, punch ignition, turning |
| `public/assets/raccoon-contacts-v2.png` | 8 × 3 | Platform bounce, landing, standing |
| `public/assets/raccoon-reactions-v2.png` | 8 × 3 | Braking, recovery, correction |
| `public/assets/raccoon-ready-fall-v2.png` | 8 × 2 | Tucked blink, impact/uncontrolled fall |
| `public/assets/raccoon-coasting-v2.png` | 10 × 2 | Left/right controlled coasting and falling |
| `public/assets/raccoon-launch-v2.png` | 4 × 2 | Tuck-to-airborne unfurl, sequentially across both rows |

The five-frame clips now have eight drawings. Powered left/right flight also has eight-frame loops instead of a single held image. The ten-frame coasting loops were redrawn to match the other body proportions. A new eight-frame launch unfurl fills the previous snap from tucked aiming to open flight.

Final prompts and generation output provenance: [animation-generation-prompts.json](animation-generation-prompts.json).

While Vite runs, open `/artifacts/animation-pass/preview.html` to inspect individual clips, scrub frames, slow playback, and compare all poses using the actual runtime loader. The preview is a developer artifact and is not connected to game menus. Browser evidence and a short ordinary-flight WebM are in `artifacts/animation-pass/`.

## Scale and registration

`src/player-animation-assets.ts` authors head breadth, pelvis pivots and planted foot planes for each sequence, with per-frame corrections where needed. `config.playerVisuals.headSize` is the common 32-world-pixel anatomical reference. Character silhouettes can widen or shorten as arms, legs and tails move; those outer bounds no longer resize the entire body.

The loader finds complete figures across nominal grid seams, preserving hands and tail tips that extend slightly into transparent gutters. It trims transparency independently of scale, keeps an authored body root in flight, and anchors landing/standing feet to the ground. Mirrored directions share the same dimensions and registration. Transparent 60 ms airborne blends bridge pose changes without dimming the body; planted ground poses do not crossfade against airborne roots. Camera headroom accounts for the pelvis pivot on narrow screens.

## Playback

| Clip | Timing and behavior |
| --- | --- |
| Launch unfurl | 260 ms; starts from the current tucked/blink frame; mirrors for leftward launches |
| Horizontal powered flight | 640 ms eight-frame loop |
| Braking | 240 ms, then holds the braced pose while velocity still opposes input |
| Turning / punch ignition | 240 ms; a reversal turns once, then enters sustained thrust |
| Upward engagement | 280 ms, then holds the arms-in pose; booster-only activation completes the clip |
| Platform / floor rebound | 180 ms, then recovery or powered correction |
| Air recovery / course correction | 240 / 220 ms |
| Ground landing | 340 ms normally; fast sliding holds crouch frame 3, then settles over about 180 ms after slowing to 22 px/s |
| Standing | 1.6 s breathing/blink loop |
| Controlled coast | 840 ms ten-frame corrective-arm loop |
| Impact / uncontrolled fall | 480 ms loop; a nonlethal satellite reaction lasts 320 ms before recovery |
| Aiming blink | 220 ms, with a three-second open-eye interval |

Animation follows fixed simulation time, so pause freezes it. Contact/impact events are edge latched instead of restarting every frame. A fresh full-pull launch emerging from below the ground plane does not falsely play a rebound. Actual descending ground rebounds still react. Satellite hits and depleted-health crashes select uncontrolled falling. Physics, equipment forces, currencies and save formats are unchanged in this animation pass.

## Verification

- `npm.cmd run build` passes.
- `npm.cmd run check` includes the existing mechanics checks plus animation timing and asset geometry/transparency tests.
- The asset checks validate 124 source figures and all 180 indexed frames, cross-seam extraction, padding, anatomical scale, and stable pelvis/foot registration.
- `node tests/frame-consistency.mjs` verifies identical production physics/resources/scoring at 30/60/144 Hz; this is separate from rendering QA.
- Actual Chrome input tests on an isolated save covered a normal mouse launch through ground rebounds, landing and results; both reversals; all eight upward, bounce and correction frames; all four platform colors; falling-to-thrust ignition; nonlethal impact recovery; crash falling; and pause/resume. Runtime traces are in `live-playtest.json` and `ordinary-flight.webm`.
- Emulated 390 × 844 touch play checked simultaneous left/up thrust and that the character stays clear of the HUD and touch controls. No browser runtime errors were recorded. Physical-device testing is not claimed.

The character still has one aviator outfit; suit upgrades do not introduce a separate visual costume system.
