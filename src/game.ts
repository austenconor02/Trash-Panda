import { config } from './config';
import { Player } from './player';
import { Slingshot } from './slingshot';
import { Camera } from './camera';
import { World } from './world';
import { Scoring } from './scoring';
import { Economy } from './economy';
import { upgradeKeys, upgradeDefinitions } from './upgrade-definitions';
import type { UpgradeKey } from './upgrade-definitions';
import { SaveManager, freshSave } from './saves';
import { FlightEquipment } from './flight-equipment';
import { Input } from './input';
import { Renderer } from './rendering';
import { Interface } from './interface';
import { isFlightState } from './state';
import type { GameState } from './state';
import { completeLanding } from './progression';
import { GameAudio } from './audio';
import { ThrustParticles } from './thrust-particles';
import { SurvivalGuide } from './survival-guide';
import { mission } from './progression';
import { PaydayTimeline } from './payday';
import { deployables } from './deployables';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export class Game {
  private player = new Player();
  private saves = new SaveManager();
  private data = freshSave('Pilot');
  private activeSlot = 0;
  private economy = new Economy(this.data, () => this.persist());
  private sling = new Slingshot(this.economy);
  private equipment = new FlightEquipment(this.data, () => this.persist());
  private camera = new Camera();
  private world = new World();
  private score = new Scoring();
  private renderer: Renderer;
  private input: Input;
  private ui: Interface;
  private state: GameState = 'menu';
  private accumulator = 0;
  private lastTime = 0;
  private settledTime = 0;
  private failed = false;
  private paused = false;
  private audio = new GameAudio();
  private exhaust = new ThrustParticles();
  private guide = new SurvivalGuide(message => this.audio.speak(message));
  private payday = new PaydayTimeline();
  private presentedState = '';
  constructor() {
    const canvas = element<HTMLCanvasElement>('game');
    this.renderer = new Renderer(canvas);
    this.ui = new Interface(this.renderer.ctx, element('accessible-controls'), action => this.dispatch(action));
    this.input = new Input(canvas, this.camera, this.player, this.sling, () => !this.paused && this.state === 'aiming', () => !this.paused && isFlightState(this.state), () => this.launch(), () => { if (!this.paused && this.state !== 'menu') this.reset(); });
    canvas.addEventListener('click', event => {
      if (this.paused) return;
      if (this.state === 'menu' || this.state === 'garage' || this.state === 'results') {
        const bounds = canvas.getBoundingClientRect(); this.ui.activate(event.clientX - bounds.left, event.clientY - bounds.top);
      }
    });
    element('reset').onclick = () => { if (this.state !== 'menu') { this.setPaused(false); this.reset(); } };
    element('main-menu').onclick = () => { this.setPaused(false); this.state = 'menu'; this.input.clear(); this.ui.confirmOverwrite = false; this.syncUi(); };
    element('garage').onclick = () => { if (this.state === 'aiming' || this.state === 'results') { this.setPaused(false); this.state = 'garage'; this.input.clear(); this.syncUi(); } };
    element('menu-toggle').onclick = () => this.setPaused(!this.paused);
    element('resume').onclick = () => this.setPaused(false);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.setPaused(!this.paused); }
      if (this.paused && event.key === 'Tab') {
        const controls = Array.from(element('game-menu').querySelectorAll<HTMLElement>('button:not(:disabled), input, summary'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    document.addEventListener('keydown', () => this.audio.unlock(), { once: true });
    for (const channel of ['master', 'effects', 'music'] as const) {
      const slider = element<HTMLInputElement>(`${channel}-volume`), mute = element<HTMLInputElement>(`${channel}-mute`);
      const muteKey = `${channel}Muted` as const;
      slider.value = String(Math.round(this.audio.settings[channel] * 100)); mute.checked = this.audio.settings[muteKey];
      const update = () => { element(`${channel}-value`).textContent = `${slider.value}%`; };
      update(); slider.oninput = () => { this.audio.set(channel, Number(slider.value) / 100); update(); };
      mute.onchange = () => this.audio.set(muteKey, mute.checked);
    }
    const guideToggle = element<HTMLInputElement>('spoken-guide'); guideToggle.checked = this.audio.settings.spokenGuide;
    guideToggle.onchange = () => this.audio.set('spokenGuide', guideToggle.checked);
    window.addEventListener('resize', () => {
      this.renderer.resize(); this.sling.setViewport(this.renderer.width, this.renderer.height);
      if (this.state === 'aiming') this.camera.y = this.renderer.height / this.camera.zoom * (config.camera.groundScreenRatio - 0.5);
    });
    document.addEventListener('visibilitychange', () => { this.lastTime = 0; this.accumulator = 0; this.input.clear(); this.syncMusic(); });
    this.syncUi(); requestAnimationFrame(this.frame);
  }
  private persist() { this.saves.write(this.activeSlot, this.data); }
  private reducedMotion() { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private syncMusic() {
    const menu = this.paused || this.state === 'menu' || this.state === 'garage' || this.state === 'results';
    this.audio.setMusicMode(document.hidden ? null : menu ? 'menu' : isFlightState(this.state) ? 'flight' : null);
  }
  private setPaused(paused: boolean) {
    this.audio.cancelGuide();
    this.paused = paused; this.input.clear(); this.accumulator = 0; this.lastTime = 0;
    element('game-menu').hidden = !paused;
    element('menu-toggle').setAttribute('aria-expanded', String(paused));
    element('game').inert = paused; element('accessible-controls').inert = paused;
    this.syncUi();
    element(paused ? 'resume' : 'game').focus();
  }
  private dispatch(action: string) {
    if (this.paused) return;
    this.ui.skipBoot();
    const [verb, argument, levelArgument] = action.split(':');
    if (verb === 'skipPayday' && this.state === 'results') this.payday.skip();
    else if (verb === 'slot' && this.state === 'menu') { this.ui.slot = Number(argument); this.ui.confirmOverwrite = false; }
    else if (verb === 'new' && this.state === 'menu') {
      if (this.saves.slots[this.ui.slot]) this.ui.confirmOverwrite = true;
      else this.startNew();
    } else if (verb === 'overwrite' && this.state === 'menu' && this.ui.confirmOverwrite) this.startNew();
    else if (verb === 'cancelOverwrite') this.ui.confirmOverwrite = false;
    else if (verb === 'continue' && this.state === 'menu') {
      const saved = this.saves.slots[this.ui.slot];
      if (saved) this.openSlot(structuredClone(saved));
    } else if (verb === 'category' && this.state === 'garage') {
      this.ui.category = argument; this.ui.selected = upgradeKeys.find(key => upgradeDefinitions[key].category === argument) ?? 'height'; this.ui.targetLevel = 0;
    } else if ((verb === 'select' || verb === 'level') && this.state === 'garage' && upgradeKeys.includes(argument as UpgradeKey)) { this.ui.selected = argument as UpgradeKey; this.ui.targetLevel = levelArgument ? Number(levelArgument) : this.data.levels[this.ui.selected] + 1; }
    else if (verb === 'buy' && this.state === 'garage' && upgradeKeys.includes(argument as UpgradeKey)) { if (this.economy.purchase(argument as UpgradeKey, Number(levelArgument))) { this.audio.effect('purchase'); this.ui.targetLevel = this.data.levels[argument as UpgradeKey] + 1; } }
    else if (verb === 'launcherTier' && this.state === 'garage') { if (this.economy.upgradeLauncher()) this.ui.targetLevel = 1; }
    else if (verb === 'garage' && this.state === 'results') this.state = 'garage';
    else if (verb === 'launch' && (this.state === 'garage' || this.state === 'results')) this.reset();
    else if (verb === 'menu') { this.state = 'menu'; this.input.clear(); }
    this.syncUi();
  }
  private startNew() {
    const name = element<HTMLInputElement>('pilot-name').value || `Pilot ${this.ui.slot + 1}`;
    this.ui.confirmOverwrite = false; this.openSlot(freshSave(name)); this.persist();
  }
  private openSlot(data: typeof this.data) {
    this.activeSlot = this.ui.slot; this.data = data;
    this.ui.category = data.tier === 'moon' ? 'LUNAR' : 'LAUNCHER';
    this.ui.selected = data.tier === 'moon' ? 'lunarLaunch' : 'height';
    this.ui.targetLevel = 0;
    this.economy.data = data; this.equipment = new FlightEquipment(data, () => this.persist());
    this.reset(); element<HTMLCanvasElement>('game').focus();
  }
  private syncUi() {
    this.syncMusic();
    const touch = document.getElementById('touch-flight-controls');
    if (touch) {
      touch.hidden = this.paused || !isFlightState(this.state);
      for (const button of Array.from(touch.querySelectorAll<HTMLButtonElement>('button'))) {
        const action = button.dataset.control;
        const deployable = deployables.find(item => item.action === action), item = deployable?.item;
        if (item) button.dataset.item = item;
        button.hidden = !!item && this.data.inventory[item] === 0;
        button.disabled = item ? this.state === 'crashing' && item !== 'teleporter' : !this.data.levels.jetpack || this.state === 'crashing';
        if (deployable) button.setAttribute('aria-label', `${deployable.label}: ${this.data.inventory[deployable.item]} available. Press ${deployable.key} or tap to deploy.`);
      }
    }
    element('name-field').hidden = this.state !== 'menu' || this.paused;
    element<HTMLButtonElement>('reset').disabled = this.state === 'menu';
    element<HTMLButtonElement>('garage').disabled = this.state !== 'aiming' && this.state !== 'results';
    element('status').textContent = this.state === 'menu' ? 'Select a pilot to begin.' : `${this.data.name} / ${config.destinations[this.data.tier].name} / ${this.data.flights} flights${this.saves.available ? '' : ' / saving unavailable'}`;
  }
  private reset() {
    this.guide.reset(); this.audio.cancelGuide();
    this.exhaust.reset();
    this.renderer.playerSprite.reset();
    this.sling.setViewport(this.renderer.width, this.renderer.height);
    this.state = 'aiming'; this.sling.reset(); this.input.clear(); this.equipment.reset();
    this.player.reset(this.sling.restHeight);
    this.player.planet = this.world.planet = this.data.tier;
    this.player.dragFactor = 1 / (1 + this.data.levels.aero * config.upgradeEffects.dragReductionPerLevel);
    this.world.reset(); this.score.reset();
    this.world.coinValueLevel = this.data.levels.coinValue; this.world.platformValueLevel = this.data.levels.platformValue;
    this.camera.reset(this.sling.restHeight, this.renderer.height / this.camera.zoom);
    this.camera.y = this.renderer.height / this.camera.zoom * (config.camera.groundScreenRatio - 0.5);
    this.accumulator = this.settledTime = 0; this.failed = false;
    this.world.update(0, this.player.y, this.renderer.width / this.camera.zoom, this.renderer.height / this.camera.zoom, 0);
    this.syncUi();
    element<HTMLCanvasElement>('game').focus();
  }
  private launch() {
    if (this.state !== 'aiming') return;
    const velocity = this.sling.velocity();
    if (!velocity) { this.sling.reset(); return; }
    this.player.x = this.sling.pull.x; this.player.y = this.sling.restHeight + this.sling.pull.y;
    this.player.launch(velocity); this.renderer.playerSprite.beginLaunch(Math.sign(velocity.x)); this.score.reset(); this.state = 'launching'; this.input.finishLaunch(); this.syncUi();
    this.audio.effect('launch');
  }
  private step(dt: number) {
    if (this.paused) return;
    if (this.state === 'menu' || this.state === 'garage' || this.state === 'results') return;
    this.input.step(dt);
    this.world.update(this.player.x, this.player.y, this.renderer.width / this.camera.zoom, this.renderer.height / this.camera.zoom, dt);
    if (this.state === 'aiming') {
      this.renderer.playerSprite.updateAiming(dt);
      this.player.x = this.sling.pull.x; this.player.y = this.sling.restHeight + this.sling.pull.y;
    } else if (isFlightState(this.state)) {
      if (this.state === 'launching') this.state = 'flying';
      const controls = this.input.controls();
      if (controls.teleport && this.equipment.tryTeleport(this.player)) {
        this.world.update(this.player.x, this.player.y, this.renderer.width / this.camera.zoom, this.renderer.height / this.camera.zoom, 0);
        this.camera.reset(this.player.y, this.renderer.height / this.camera.zoom); this.camera.x = this.player.x;
        this.settledTime = 0;
      }
      // Start scoring/contact sweeps at the arrival point, excluding the teleport jump.
      const x = this.player.x, y = this.player.y;
      const boosters = this.equipment.boosters;
      if (this.state !== 'crashing') this.equipment.step(this.player, controls, dt);
      if (this.equipment.boosters < boosters) this.audio.effect('boost');
      if (this.equipment.health <= 0) this.crash();
      this.world.attract(this.player.x, this.player.y, this.data.levels.coinMagnet, this.data.levels.scrapMagnet, dt);
      const rewards = this.player.step(dt, this.world, this.state !== 'crashing');
      const satelliteLanding = !!rewards.satellite?.landing;
      const satelliteHit = !!rewards.satellite && !satelliteLanding;
      const bounced = rewards.platformCents > 0 || satelliteLanding;
      if (satelliteLanding) this.world.effects.push({ x:this.player.x, y:this.player.y,
        text:`SATELLITE SALVAGED / +${config.satellites.landingScrap} SCRAP`, age:0, bounce:true });
      if (satelliteHit) {
        this.equipment.health = Math.max(0, this.equipment.health - config.satellites.damage);
        this.equipment.healthDraining = true;
        this.equipment.thrusting = false; this.equipment.upwardThrust = this.equipment.horizontalThrust = 0;
        this.world.effects.push({ x: this.player.x, y: this.player.y,
          text: `SATELLITE HIT / -${config.satellites.damage} HP / SPEED -75%`, age: 0, bounce: false });
        this.audio.effect('impact');
        if (this.equipment.health <= 0) this.crash();
      }
      this.renderer.playerSprite.update(dt, this.player, this.equipment, this.equipment.boosters < boosters, bounced, this.data.levels.suit === 0, satelliteHit, this.state === 'crashing');
      this.exhaust.update(dt, { x, y }, this.player, this.state === 'crashing' ? 0 : this.equipment.upwardThrust, this.equipment.horizontalThrust, this.equipment.boosters < boosters);
      if (bounced) {
        const beforeFuel = this.equipment.fuel;
        this.equipment.bounce();
        const absorbed = this.equipment.fuel - beforeFuel;
        if (absorbed > .0001) this.world.effects.push({ x: this.player.x, y: this.player.y + 36, text: `+${absorbed.toFixed(1)} GAL`, age: 0, bounce: false });
        this.audio.effect('bounce');
      }
      else if (rewards.coins || rewards.scrap) this.audio.effect('coin');
      this.score.step(this.player, x, y, dt, rewards, this.state !== 'crashing');
      this.guide.update(dt, this.equipment, this.data, this.player.y * config.feetPerUnit);
      if (this.player.arrived) {
        this.score.maxAltitude = Math.max(this.score.maxAltitude, this.world.ceilingY * config.feetPerUnit);
        this.finish(true); return;
      }
      this.settledTime = this.player.grounded && Math.abs(this.player.vx) < config.physics.stopSpeed && this.player.vy === 0 ? this.settledTime + dt : 0;
      if (this.settledTime >= config.flow.landingHoldSeconds) this.finish();
    }
    this.camera.viewWidth = this.renderer.width / this.camera.zoom;
    if (isFlightState(this.state)) this.camera.follow(this.player.x, this.player.y, dt, this.renderer.height / this.camera.zoom);
  }
  private crash() {
    const entering = this.state !== 'crashing';
    this.state = 'crashing'; this.failed = true;
    this.player.thrustingUp = this.equipment.thrusting = false;
    this.equipment.upwardThrust = this.equipment.horizontalThrust = 0;
    this.equipment.fuelDraining = this.equipment.oxygenDraining = this.equipment.healthDraining = false;
    this.equipment.coldDamageRate = this.equipment.oxygenDamageRate = 0;
    if (entering) this.syncUi();
  }
  private finish(landed = false) {
    if (!isFlightState(this.state)) return;
    this.state = 'results'; this.input.clear();
    this.audio.cancelGuide();
    this.ui.resultPlanet = this.data.tier;
    this.ui.landing = null;
    if (this.data.tier === 'earth') {
      this.ui.newRecord = this.score.maxAltitude > this.data.bestAltitude;
      this.data.bestAltitude = Math.max(this.data.bestAltitude, this.score.maxAltitude);
      this.data.bestDistance = Math.max(this.data.bestDistance, this.score.horizontal);
    } else {
      this.ui.newRecord = this.score.maxAltitude > this.data.moonBestAltitude;
      this.data.moonBestAltitude = Math.max(this.data.moonBestAltitude, this.score.maxAltitude);
      this.data.moonBestDistance = Math.max(this.data.moonBestDistance, this.score.horizontal); this.data.moonFlights++;
    }
    if (landed) this.ui.landing = completeLanding(this.data, !this.failed && this.equipment.health > 0);
    if (this.ui.landing === 'Moon') { this.ui.category = 'LUNAR'; this.ui.selected = 'lunarLaunch'; this.ui.targetLevel = 0; }
    this.data.flights++;
    this.score.finalize(this.failed, this.data.levels.funerals);
    this.score.planet = this.ui.resultPlanet;
    const payout = this.score.breakdown(), totalCents = payout.totalCents;
    this.economy.award(totalCents, this.score.scrap);
    this.payday.start({
      maxHeight: this.score.maxAltitude, flightSeconds: this.score.duration, distance: this.score.distance,
      spaceSeconds: this.score.spaceDuration, reachedSpace: this.score.maxAltitude >= mission(this.ui.resultPlanet).survivalFeet,
      scrap: this.score.scrap, totalCents, earnings:payout.rows, collectedCents:payout.collectedCents,
    }, { reducedMotion: this.reducedMotion() });
    this.syncUi();
  }
  private frame = (time: number) => {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, config.physics.maxFrame) : 0;
    this.lastTime = time;
    if (!document.hidden) {
      if (!this.paused) this.accumulator += dt;
      while (this.accumulator >= config.physics.fixedStep) { this.step(config.physics.fixedStep); this.accumulator -= config.physics.fixedStep; }
      const { width, height } = this.renderer;
      this.ui.stepPresentation(this.paused ? 0 : dt, this.state, this.reducedMotion());
      if (this.presentedState !== this.state) {
        this.presentedState = this.state;
        if (this.state === 'menu' || this.state === 'garage') this.audio.effect('tabletBoot');
      }
      if (this.state === 'menu') { this.renderer.drawTabletBackdrop(this.sling, this.data); this.ui.menu(width, height, this.saves); }
      else if (this.state === 'garage') { this.renderer.drawTabletBackdrop(this.sling, this.data); this.ui.garage(width, height, this.economy, this.saves.available); }
      else if (this.state === 'results') {
        const payday = this.payday.step(this.paused ? 0 : dt);
        for (const event of payday.events) this.audio.effect(({ boot: 'tabletBoot', tick: 'paydayTick', row: 'paydayRow', complete: 'paydayComplete' } as const)[event]);
        this.renderer.drawTabletBackdrop(this.sling, this.data);
        this.ui.results(width, height, this.score, this.data, this.failed, payday);
      }
      else {
        this.renderer.draw(this.player, this.sling, this.camera, this.world, this.state === 'aiming', this.equipment, this.data, this.exhaust);
        const hud = this.ui.hud(width, height, this.player, this.score, this.equipment, this.data, this.sling, this.state === 'aiming', this.state === 'crashing', this.saves.available, this.guide.message, this.world);
        // Deployable actions disappear immediately after their final use.
        const touch = document.getElementById('touch-flight-controls');
        if (touch) {
          touch.style.setProperty('--hud-controls-bottom', `${hud.controlsBottom}px`);
          for (const button of Array.from(touch.querySelectorAll<HTMLButtonElement>('button[data-item]'))) {
            const index = deployables.findIndex(item => item.action === button.dataset.control); if (index < 0) continue;
            const rect = hud.items[index].rect;
            button.style.left = `${rect.x}px`; button.style.top = `${rect.y}px`;
            button.style.width = `${rect.width}px`; button.style.height = `${rect.height}px`;
            const deployable = deployables[index];
            button.setAttribute('aria-label', `${deployable.label}: ${this.data.inventory[deployable.item]} available. Press ${deployable.key} or tap to deploy.`);
          }
        }
        if (touch && !touch.hidden) for (const button of Array.from(touch.querySelectorAll<HTMLButtonElement>('button[data-item]'))) button.hidden = this.data.inventory[button.dataset.item as keyof typeof this.data.inventory] === 0;
      }
    }
    requestAnimationFrame(this.frame);
  };
}
