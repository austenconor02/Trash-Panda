import type { Camera } from './camera';
import type { Player } from './player';
import type { Slingshot } from './slingshot';
import { config } from './config';
import type { FlightControls, HealthPackKey } from './flight-equipment';
import { deployables } from './deployables';
import type { DeployableAction } from './deployables';
export class Input {
  dragging = false;
  private pointerId: number | null = null;
  private keys = new Set<string>();
  private boostPending = false;
  private bootsPending = false;
  private teleportPending = false;
  private healthPending: HealthPackKey | undefined;
  private keyboardCharging = false;
  private touchPointers = new Map<number, { key: string; button: HTMLButtonElement }>();
  private grabOffset = { x: 0, y: 0 };
  constructor(private canvas: HTMLCanvasElement, camera: Camera, player: Player, private sling: Slingshot, private ready: () => boolean, private flying: () => boolean, private launch: () => void, reset: () => void) {
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const world = camera.toWorld(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height);
      return world;
    };
    canvas.addEventListener('pointerdown', event => {
      if (!this.ready() || this.dragging || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const point = move(event);
      if (Math.hypot(point.x - player.x, point.y - player.y) > config.player.radius + 22) return;
      event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
      this.keyboardCharging = false; this.keys.delete('arrowdown');
      this.grabOffset = { x: point.x - player.x, y: point.y - player.y };
      this.dragging = true; this.pointerId = event.pointerId;
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const point = move(event); sling.setPull(point.x - this.grabOffset.x, point.y - this.grabOffset.y - sling.restHeight);
    });
    canvas.addEventListener('pointerup', event => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const point = move(event); sling.setPull(point.x - this.grabOffset.x, point.y - this.grabOffset.y - sling.restHeight);
      this.releasePointer(); this.launch();
    });
    const cancel = () => { this.clear(); if (this.ready()) sling.reset(); };
    canvas.addEventListener('pointercancel', event => { if (event.pointerId === this.pointerId) cancel(); });
    canvas.addEventListener('lostpointercapture', event => { if (this.dragging && event.pointerId === this.pointerId) cancel(); });
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '')) return;
      if (!this.ready() && !this.flying()) return;
      const key = this.keyName(event);
      if (['arrowdown', 'arrowleft', 'arrowright', 'arrowup', ' ', 'r', 't', ...deployables.map(item => item.key)].includes(key)) event.preventDefault();
      if (key === 'r') { reset(); return; }
      if (key === 'arrowdown' && this.ready()) {
        if (this.dragging) return;
        this.keyboardCharging = true;
      }
      const wasPressed = this.keys.has(key); this.keys.add(key);
      if (!event.repeat && !wasPressed && this.flying()) {
        const action = deployables.find(item => item.key === key)?.action
          ?? ({ arrowup:'boost', arrowdown:'boots', t:'teleport' } as const)[key as 'arrowup'|'arrowdown'|'t'];
        if (action) this.queueDeployable(action);
      }
    });
    window.addEventListener('keyup', event => {
      this.keys.delete(this.keyName(event));
      if (event.key === 'ArrowDown') {
        const launch = this.keyboardCharging && this.ready() && this.pointerId === null;
        this.keyboardCharging = false;
        if (launch) this.launch();
      }
    });
    canvas.addEventListener('blur', cancel);
    const page = canvas.ownerDocument;
    page?.addEventListener('visibilitychange', () => { if (page.hidden) cancel(); });
    this.createTouchControls();
  }
  private keyName(event: KeyboardEvent) {
    if (event.code === 'Space') return ' ';
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(event.code ?? '');
    return digit?.[1] ?? event.key.toLowerCase();
  }
  private queueDeployable(action: DeployableAction) {
    if (action === 'boost') this.boostPending = true;
    else if (action === 'boots') this.bootsPending = true;
    else if (action === 'teleport') this.teleportPending = true;
    else this.healthPending = action;
  }
  private createTouchControls() {
    if (!this.canvas.parentElement) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'touch-flight-controls'; toolbar.className = 'touch-flight-controls'; toolbar.hidden = true;
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Flight controls');
    const actions = [
      ['left', '←', 'Thrust left'], ['up', '↑', 'Thrust upward'], ['right', '→', 'Thrust right'],
      ...deployables.map(item => [item.action, item.shortLabel, `Deploy ${item.label} / key ${item.key}`]),
    ];
    for (const [key, text, label] of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.control = key;
      const deployable = deployables.find(item => item.action === key);
      if (deployable) { button.dataset.item = deployable.item; button.dataset.key = deployable.key; }
      button.textContent = text; button.setAttribute('aria-label', label); button.title = label;
      button.addEventListener('pointerdown', event => {
        if (!this.flying() || button.disabled || button.hidden || this.touchPointers.has(event.pointerId) || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        this.canvas.focus();
        this.touchPointers.set(event.pointerId, { key, button });
        if (deployable) this.queueDeployable(deployable.action);
      });
      button.addEventListener('click', event => {
        // Pointer presses deploy on pointerdown. A keyboard-generated click has detail=0.
        if (event.detail !== 0 || !deployable || !this.flying() || button.disabled || button.hidden) return;
        event.preventDefault(); this.canvas.focus(); this.queueDeployable(deployable.action);
      });
      const release = (event: PointerEvent) => {
        this.touchPointers.delete(event.pointerId);
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      };
      button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', event => this.touchPointers.delete(event.pointerId));
      toolbar.append(button);
    }
    this.canvas.parentElement.append(toolbar);
  }
  step(dt: number) {
    if (this.ready() && this.keyboardCharging && this.pointerId === null && this.keys.has('arrowdown')) {
      const side = (Number(this.keys.has('arrowright')) - Number(this.keys.has('arrowleft'))) * this.sling.restHeight * config.launcher.keyboardAimPerSecond * dt;
      this.sling.setPull(this.sling.pull.x + side, this.sling.pull.y - this.sling.restHeight / config.launcher.keyboardFullChargeSeconds * dt);
    }
  }
  controls(): FlightControls {
    const touch = (key: string) => Array.from(this.touchPointers.values()).some(pointer => pointer.key === key);
    const controls = { up: this.keys.has(' ') || touch('up'), left: this.keys.has('a') || this.keys.has('arrowleft') || touch('left'), right: this.keys.has('d') || this.keys.has('arrowright') || touch('right'), boost: this.boostPending, boots: this.bootsPending, teleport: this.teleportPending, healthPack: this.healthPending };
    this.boostPending = this.bootsPending = this.teleportPending = false; this.healthPending = undefined; return controls;
  }
  private releasePointer() {
    const pointerId = this.pointerId;
    this.dragging = false; this.pointerId = null;
    if (pointerId !== null && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }
  clear() {
    const wasAiming = this.dragging || this.keyboardCharging;
    this.releasePointer(); this.keyboardCharging = false; this.keys.clear();
    const touches = Array.from(this.touchPointers.entries()); this.touchPointers.clear();
    for (const [pointerId, { button }] of touches) if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    this.boostPending = this.bootsPending = this.teleportPending = false; this.healthPending = undefined;
    if (wasAiming) this.sling.reset();
  }
  finishLaunch() { this.releasePointer(); this.keyboardCharging = false; this.boostPending = this.bootsPending = this.teleportPending = false; this.healthPending = undefined; }
}
