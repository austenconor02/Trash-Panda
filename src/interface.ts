import { config } from './config';
import { fuelTankCapacity } from './fuel';
import { dollars } from './economy';
import type { Economy } from './economy';
import { upgradeKeys } from './upgrade-definitions';
import type { UpgradeKey } from './upgrade-definitions';
import type { SaveManager, SaveData, InventoryKey } from './saves';
import type { Player } from './player';
import type { Scoring } from './scoring';
import type { FlightEquipment } from './flight-equipment';
import type { Slingshot } from './slingshot';
import { mission } from './progression';
import type { Planet } from './progression';
import type { PaydaySnapshot } from './payday';
import { FlightHud } from './flight-hud';
import type { World } from './world';
import { deployables } from './deployables';
import { itemArt, itemArtUrls } from './item-art';
import type { ItemArtKey } from './item-art';
interface DeployableTile { art?:ItemArtKey; name:string; stock:number; price:string; shortcut:string; selected:boolean }
interface Button { x: number; y: number; width: number; height: number; action: string; enabled: boolean; label: string; deployable?:DeployableTile }
interface ResultRow { id: string; label: string; value: string; progress: number; visible: boolean; complete: boolean }
interface ResultPresentation { title: string; subtitle: string; rows: ResultRow[]; money: string; moneyProgress: number; complete: boolean; wallet: string; note: string }
interface ResultDom { rows: Map<string, { row: HTMLElement; value: HTMLElement }>; money: HTMLElement; earnings: HTMLElement; coins: HTMLElement[]; wallet: HTMLElement; status: HTMLElement; note: HTMLElement }
const feet = (value: number) => `${Math.round(value).toLocaleString()} ft`;
const categories = ['LAUNCHER', 'JETPACK', 'ADD-ONS', 'GEAR', 'VALUES', 'DEPLOYABLES'];
// All in-game menus, garage, results, and HUD are Canvas text/shapes.
// Equivalent buttons outside the viewport provide keyboard and screen-reader access.
export class Interface {
  buttons: Button[] = [];
  selected: UpgradeKey = 'height';
  targetLevel = 0;
  category = 'LAUNCHER';
  slot = 0;
  confirmOverwrite = false;
  newRecord = false;
  resultPlanet: Planet = 'earth';
  landing: string | null = null;
  private scale = 1; private offsetX = 0; private offsetY = 0;
  private signature = '';
  private summary = '';
  private presentationTime = 0;
  private screenKey = '';
  private boot = 1;
  private reveal = 1;
  private resultDom: ResultDom | null = null;
  private flightHud = new FlightHud();
  private presentationReducedMotion = false;
  constructor(private ctx: CanvasRenderingContext2D, private accessible: HTMLElement, private dispatch: (action: string) => void) {}
  stepPresentation(dt: number, screenKey: string, reducedMotion = false) {
    this.presentationReducedMotion = reducedMotion;
    if (['aiming','launching','flying','crashing'].includes(screenKey)) screenKey = 'hud';
    const elapsed = Math.max(0, Math.min(.1, dt));
    this.presentationTime += elapsed;
    if (screenKey !== this.screenKey) { this.screenKey = screenKey; this.boot = reducedMotion ? 1 : 0; }
    this.boot = reducedMotion ? 1 : Math.min(1, this.boot + elapsed / .62);
    this.accessible.style.setProperty('--scan-y', `${this.boot * 100}%`);
    this.accessible.dataset.booting = String(this.boot < 1);
  }
  skipBoot() { this.boot = 1; this.accessible.dataset.booting = 'false'; }
  activate(x: number, y: number) {
    x = (x - this.offsetX) / this.scale; y = (y - this.offsetY) / this.scale;
    const button = [...this.buttons].reverse().find(b => b.enabled && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
    if (button) this.dispatch(button.action);
  }
  private begin(width: number, height: number, title: string, subtitle: string, reveal = this.boot) {
    const ctx = this.ctx;
    this.buttons = []; ctx.save();
    this.scale = Math.min(width / 1000, height / 680); this.offsetX = (width - 900 * this.scale) / 2; this.offsetY = (height - 600 * this.scale) / 2;
    ctx.translate(this.offsetX, this.offsetY); ctx.scale(this.scale, this.scale);
    // The housing is solid; the launch area remains visible around its edges.
    ctx.shadowColor = '#000b'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 15;
    const shell = ctx.createLinearGradient(0, 8, 0, 592); shell.addColorStop(0, '#57615b'); shell.addColorStop(.08, '#303b35'); shell.addColorStop(.87, '#1b2521'); shell.addColorStop(1, '#0c1411');
    ctx.fillStyle = shell; this.casePath(8, 8, 884, 584, 20); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#849183'; ctx.lineWidth = 2; this.casePath(10, 10, 880, 580, 18); ctx.stroke();
    ctx.strokeStyle = '#070f0b'; ctx.lineWidth = 5; this.casePath(22, 22, 856, 556, 10); ctx.stroke();
    ctx.fillStyle = '#07130c'; ctx.fillRect(28, 28, 844, 544);
    for (const x of [19, 881]) for (const y of [29, 571]) {
      ctx.fillStyle = '#0c1510'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#75816f'; ctx.beginPath(); ctx.arc(x - .5, y - .5, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#28352a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x + 2, y - 2); ctx.stroke();
    }
    this.text('TP / FIELD TERMINAL 08', 39, 20, 8, '#c2c8a7');
    this.text('AEROSPACE DIVISION', 686, 588, 8, '#71806b');
    for (let i = 0; i < 11; i++) { ctx.fillStyle = '#101b14'; ctx.fillRect(44 + i * 9, 580, 5, 4); }
    ctx.fillStyle = '#8bff9b'; ctx.shadowColor = '#85ff9b'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(847, 19, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    this.reveal = Math.max(0, Math.min(1, reveal));
    ctx.save(); ctx.beginPath(); ctx.rect(28, 28, 844, 544 * this.reveal); ctx.clip();
    const screen = ctx.createLinearGradient(28, 28, 872, 572); screen.addColorStop(0, '#132d1b'); screen.addColorStop(.6, '#071c10'); screen.addColorStop(1, '#0b2515');
    ctx.fillStyle = screen; ctx.fillRect(28, 28, 844, 544);
    ctx.strokeStyle = '#7fbd7b0a'; ctx.lineWidth = 1;
    for (let x = 40; x < 872; x += 28) { ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, 572); ctx.stroke(); }
    this.text(title, 48, 61, 22, '#bbffc1'); this.text(subtitle, 48, 86, 12, '#82b88a');
    this.summary = `${title}\n${subtitle}`;
    this.line(48, 101, 852, 101);
  }
  private casePath(x: number, y: number, width: number, height: number, bevel: number) {
    const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(x + bevel, y); ctx.lineTo(x + width - bevel, y); ctx.lineTo(x + width, y + bevel); ctx.lineTo(x + width, y + height - bevel); ctx.lineTo(x + width - bevel, y + height); ctx.lineTo(x + bevel, y + height); ctx.lineTo(x, y + height - bevel); ctx.lineTo(x, y + bevel); ctx.closePath();
  }
  private finish(result?: ResultPresentation) {
    const ctx = this.ctx;
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(28, 28, 844, 544 * this.reveal); ctx.clip();
    ctx.fillStyle = '#00000016';
    for (let y = 29; y < 572; y += 4) ctx.fillRect(28, y, 844, 1);
    const glass = ctx.createLinearGradient(28, 28, 300, 500); glass.addColorStop(0, '#d8ffd607'); glass.addColorStop(.5, '#d8ffd600'); glass.addColorStop(1, '#d8ffd600');
    ctx.fillStyle = glass; ctx.fillRect(28, 28, 844, 544);
    if (this.reveal < 1) {
      const scanY = 28 + 544 * this.reveal;
      const scan = ctx.createLinearGradient(0, scanY - 32, 0, scanY); scan.addColorStop(0, '#9aff9a00'); scan.addColorStop(1, '#aaffb1a0');
      ctx.fillStyle = scan; ctx.fillRect(28, scanY - 32, 844, 32);
      ctx.fillStyle = '#dbffdc'; ctx.fillRect(28, scanY - 2, 844, 2);
    }
    ctx.restore(); ctx.restore();
    const signature = (result ? `results:${result.title}:${result.subtitle}:${result.rows.map(row => row.id).join(',')}` : this.summary) + this.buttons.map(b => `${b.action}:${b.enabled}:${b.label}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature; this.accessible.replaceChildren();
      this.resultDom = null;
      let deployableDetails:HTMLElement | null = null;
      if (result) this.buildResultDom(result);
      else if (this.category === 'DEPLOYABLES' && this.accessible.className.includes('screen-garage')) {
        const [title, subtitle, ...details] = this.summary.split('\n');
        const heading = document.createElement('h1'); heading.className = 'tablet-title'; heading.textContent = title;
        const intro = document.createElement('p'); intro.className = 'tablet-subtitle'; intro.textContent = subtitle;
        this.accessible.append(heading, intro);
        deployableDetails = document.createElement('p'); deployableDetails.className = 'menu-summary deployable-details'; deployableDetails.textContent = details.join('\n');
      } else { const summary = document.createElement('p'); summary.className = 'menu-summary'; summary.textContent = this.summary; this.accessible.append(summary); }
      let actions = this.accessible;
      let deployableGrid:HTMLElement | null = null;
      if (result) { actions = document.createElement('div'); actions.className = 'payday-actions'; this.accessible.append(actions); }
      for (const b of this.buttons) {
        const button = document.createElement('button'); button.textContent = b.label; button.disabled = !b.enabled; button.onclick = () => this.dispatch(b.action);
        const [verb, key] = b.action.split(':');
        if (verb === 'buy' && deployableDetails) { actions.append(deployableDetails); deployableDetails = null; }
        button.className = `menu-action action-${verb}${verb === 'level' && key !== this.selected ? ' unselected-level' : ''}`;
        if (b.deployable) {
          const tile = b.deployable;
          button.className += ` deployable-tile${tile.selected ? ' is-selected' : ''}`;
          button.setAttribute('aria-pressed', String(tile.selected));
          button.setAttribute('aria-label', b.label);
          button.textContent = '';
          const name = document.createElement('span'); name.textContent = tile.name;
          if (tile.art) { const image = document.createElement('img'); image.src = itemArtUrls[tile.art]; image.alt = ''; image.className = 'deployable-art'; button.append(image); }
          else { const icon = document.createElement('span'); icon.className = 'deployable-art deployable-glyph'; icon.textContent = key === 'leadBoots' ? '↓' : '+'; button.append(icon); }
          const stock = document.createElement('span'); stock.textContent = `STOCK ${tile.stock} / [${tile.shortcut}]`;
          const price = document.createElement('span'); price.className = 'deployable-price'; price.textContent = tile.price;
          button.append(name, stock, price);
          if (!deployableGrid) { deployableGrid = document.createElement('div'); deployableGrid.className = 'deployable-grid'; actions.append(deployableGrid); }
          deployableGrid.append(button);
        } else actions.append(button);
      }
      if (deployableDetails) actions.append(deployableDetails);
    }
    if (result && this.resultDom) {
      for (const row of result.rows) {
        const dom = this.resultDom.rows.get(row.id); if (!dom) continue;
        dom.value.textContent = row.visible ? row.value : '—';
        dom.row.className = `payday-stat${row.visible ? ' is-visible' : ''}${row.complete ? ' is-complete' : row.visible ? ' is-counting' : ''}`;
        dom.row.style.setProperty('--progress', String(row.progress));
      }
      this.resultDom.money.textContent = result.money;
      this.resultDom.earnings.style.setProperty('--progress', String(result.moneyProgress));
      this.resultDom.earnings.classList.toggle('is-complete', result.complete);
      this.resultDom.coins.forEach((coin, index) => { coin.style.height = `${Math.max(0, Math.min(8, Math.floor(result.moneyProgress * 40 - index * 6))) * 4}px`; });
      if (this.resultDom.wallet.textContent !== result.wallet) this.resultDom.wallet.textContent = result.wallet;
      if (this.resultDom.note.textContent !== result.note) this.resultDom.note.textContent = result.note;
      this.resultDom.note.hidden = !result.note;
      const status = result.complete ? 'PAYDAY COMPLETE / FUNDS DEPOSITED' : 'COUNTING YOUR FLIGHT';
      if (this.resultDom.status.textContent !== status) this.resultDom.status.textContent = status;
      const skip = this.accessible.querySelector<HTMLButtonElement>('.action-skipPayday');
      if (skip) skip.hidden = result.complete && document.activeElement !== skip;
    }
  }
  private buildResultDom(result: ResultPresentation) {
    const heading = document.createElement('h1'); heading.className = 'tablet-title'; heading.textContent = result.title; this.accessible.append(heading);
    const subtitle = document.createElement('p'); subtitle.className = 'tablet-subtitle'; subtitle.textContent = result.subtitle; this.accessible.append(subtitle);
    const list = document.createElement('dl'); list.className = 'payday-stats'; const rows: ResultDom['rows'] = new Map();
    for (const row of result.rows) {
      const item = document.createElement('div'); const label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = row.label; item.append(label, value); list.append(item); rows.set(row.id, { row: item, value });
    }
    this.accessible.append(list);
    const earnings = document.createElement('section'); earnings.className = 'payday-earnings'; earnings.setAttribute('aria-label', 'Money earned');
    const label = document.createElement('p'); label.className = 'payday-label'; label.textContent = 'GRAND TOTAL';
    const money = document.createElement('p'); money.className = 'payday-money';
    const stacks = document.createElement('div'); stacks.className = 'payday-coin-stacks'; stacks.setAttribute('aria-hidden', 'true');
    const coins: HTMLElement[] = [];
    for (let index = 0; index < 5; index++) { const coin = document.createElement('span'); stacks.append(coin); coins.push(coin); }
    const status = document.createElement('p'); status.className = 'payday-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const note = document.createElement('p'); note.className = 'payday-note';
    const wallet = document.createElement('p'); wallet.className = 'payday-wallet';
    earnings.append(label, money, stacks, status, note, wallet); this.accessible.append(earnings);
    this.resultDom = { rows, money, earnings, coins, wallet, status, note };
  }
  private text(text: string, x: number, y: number, size = 14, color = '#85ffae') {
    this.ctx.font = `${size}px monospace`; this.ctx.fillStyle = color; this.ctx.textAlign = 'left'; this.ctx.fillText(text, x, y);
  }
  private line(x: number, y: number, x2: number, y2: number) {
    this.ctx.strokeStyle = '#245f43'; this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(x, y); this.ctx.lineTo(x2, y2); this.ctx.stroke();
  }
  private wrappedLines(text: string, width: number, size: number) {
    this.ctx.font = `${size}px monospace`; let line = ''; const lines: string[] = [];
    for (const word of text.split(' ')) {
      if (this.ctx.measureText(`${line} ${word}`).width > width && line) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line); return lines;
  }
  private paragraph(text: string, x: number, y: number, width: number, size = 14) {
    for (const line of this.wrappedLines(text, width, size)) { this.text(line, x, y, size, '#a6cbb4'); y += size + 6; }
    return y;
  }
  private button(action: string, label: string, x: number, y: number, width: number, height: number, enabled = true, selected = false, levelRow = false) {
    const ctx = this.ctx;
    const fill = ctx.createLinearGradient(x, y, x, y + height); fill.addColorStop(0, selected ? '#2b5d35' : '#142f1c'); fill.addColorStop(1, selected ? '#163f23' : '#0a2213');
    ctx.fillStyle = fill; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = enabled ? selected ? '#c0ffc0' : '#558e59' : '#2e4933'; ctx.lineWidth = selected ? 2 : 1; ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
    ctx.fillStyle = selected ? '#b5ffb2' : '#75b87c'; ctx.fillRect(x, y, selected ? 4 : 2, height);
    this.text(label, x + 12, y + (levelRow ? 17 : height / 2 + 5), 14, enabled ? '#aff3b7' : '#50765a');
    this.buttons.push({ x, y, width, height, action, enabled, label });
  }
  menu(width: number, height: number, saves: SaveManager) {
    this.accessible.className = 'accessible game-controls screen-menu';
    this.begin(width, height, 'TRASH PANDA AEROSPACE', 'PLANETARY OPERATIONS / THREE INDEPENDENT SAVE SLOTS');
    this.summary += saves.slots.map((data, index) => `\nSLOT ${index + 1}: ${data ? `${data.name} / ${config.destinations[data.tier].name} / ${dollars(data.moneyCents)} / ${data.scrap} scrap / ${data.flights} flights` : 'EMPTY'}`).join('');
    for (let index = 0; index < 3; index++) {
      const data = saves.slots[index], y = 122 + index * 95;
      this.button(`slot:${index}`, `SLOT ${index + 1} / ${data?.name ?? 'EMPTY'}`, 48, y, 804, 75, true, this.slot === index);
      this.text(data ? `${config.destinations[data.tier].name} / ${dollars(data.moneyCents)} / ${data.scrap} scrap / ${data.flights} flights` : 'Start a fresh pilot in this slot.', 64, y + 58, 12, '#8ab59b');
    }
    if (this.confirmOverwrite) {
      this.text('This will replace the selected slot permanently.', 48, 441, 15, '#ffd07d');
      this.button('overwrite', 'REPLACE SAVE', 48, 475, 265, 45);
      this.button('cancelOverwrite', 'CANCEL', 332, 475, 230, 45);
    } else {
      this.text('Name your pilot, then start a new game.', 48, 439, 13, '#a6cbb4');
      this.button('new', 'NEW GAME', 48, 475, 265, 45);
      this.button('continue', 'CONTINUE GAME', 332, 475, 265, 45, !!saves.slots[this.slot]);
    }
    if (!saves.available) this.text('Storage unavailable: progress lasts only for this session.', 48, 416, 12, '#ffd07d');
    this.finish();
  }
  garage(width: number, height: number, economy: Economy, saving: boolean) {
    this.accessible.className = 'accessible game-controls screen-garage';
    const data = economy.data;
    const currentMission = mission(data.tier);
    this.begin(width, height, `${currentMission.origin.toUpperCase()} GARAGE / LAUNCHER ${data.launcherTier}`, `${dollars(data.moneyCents)} / ${data.scrap} SCRAP / ${data.scrapCollected} FOUND / NEXT: ${currentMission.destination.toUpperCase()}`);
    const shownCategories = data.tier === 'moon' ? [...categories, 'LUNAR'] : categories;
    const categoryWidth = 804 / shownCategories.length;
    shownCategories.forEach((name, index) => this.button(`category:${name}`, name, 48 + index * categoryWidth, 118, categoryWidth - 10, 35, true, this.category === name));
    this.line(428, 168, 428, 501);
    const keys = this.category === 'DEPLOYABLES' ? deployables.map(item => item.item) : upgradeKeys.filter(key => economy.definition(key).category === this.category);
    keys.forEach((key, index) => {
      if (this.category === 'DEPLOYABLES') { this.deployableCard(economy, key as InventoryKey, index); return; }
      const rule = economy.definition(key), level = data.levels[key], locked = economy.locked(key), y = 171 + index * 39;
      this.button(`select:${key}`, rule.consumable ? `${rule.name} / STOCK ${data.inventory[key as InventoryKey]}` : `${rule.name}  ${level}/${rule.max}`, 48, y, 358, 36, true, this.selected === key, !rule.consumable);
      for (let square = 0; square < (rule.consumable ? 0 : rule.max); square++) {
        const spacing = Math.min(16, 176 / rule.max), size = Math.min(10, spacing - 3), x = 220 + square * spacing;
        this.ctx.fillStyle = square < level ? '#85ffae' : '#0b2c20'; this.ctx.fillRect(x, y + 26, size, 7);
        this.ctx.strokeStyle = locked ? '#315341' : square === level ? '#e1ffd3' : '#50a46a'; this.ctx.strokeRect(x, y + 26, size, 7);
        if (this.selected === key && this.targetLevel === square + 1) { this.ctx.strokeStyle = '#f5db73'; this.ctx.strokeRect(x - 1, y + 24, size + 2, 11); }
        this.buttons.push({ x: x - 1, y: y + 22, width: spacing - 1, height: 14, action: `level:${key}:${square + 1}`, enabled: true, label: `${rule.name} level ${square + 1}` });
      }
    });
    if (this.category === 'DEPLOYABLES') this.text('SELECT A TILE / BUY ONE / USE [1–6] OR TAP IN FLIGHT', 48, 487, 9, '#91bd96');
    if (this.category === 'LAUNCHER') {
      this.text(`ACTIVE: ${config.launcherTiers[data.launcherTier].name}`, 60, 324, 15);
      const next = economy.nextLauncherTier, rule = next ? config.launcherTiers[next] : null;
      this.paragraph(rule ? `${rule.name}: ${dollars(rule.priceCents)} + ${rule.scrapCost} scrap. Research requires ${rule.scrapUnlock} lifetime scrap (${data.scrapCollected} found). Fresh launcher levels; equipment stays purchased.` : 'Orbital III equipped. The final launcher tier has independent upgrades and purple poles.', 60, 355, 328, 13);
      this.button('launcherTier', rule ? `BUY ${rule.name.toUpperCase()}` : 'FINAL LAUNCHER EQUIPPED', 60, 444, 334, 42, economy.canUpgradeLauncher());
    }
    const selected = economy.definition(this.selected), level = data.levels[this.selected], target = Math.min(selected.max, this.targetLevel || level + 1), cost = economy.cost(this.selected, target);
    this.text(selected.name.toUpperCase(), 451, 188, 21);
    this.text(selected.consumable ? `STOCK ${data.inventory[this.selected as InventoryKey]} / SINGLE-USE ITEM` : `OWNED ${level}/${selected.max} / SELECTED LEVEL ${target}`, 451, 217, 13, '#a6cbb4');
    const benefit = this.selected === 'fuel'
      ? `Level ${target} adds ${(fuelTankCapacity(target) - fuelTankCapacity(target - 1)).toFixed(2)} gal. Base tank total: ${fuelTankCapacity(target).toFixed(2)} gal. Later levels add more; maximum ${config.fuelTank.maximumCapacity.toFixed(1)} gal.`
      : selected.levelDetails?.[target - 1]?.description ?? selected.levelDescriptions?.[target - 1] ?? selected.benefit;
    let detailSize = 13;
    while (detailSize > 10 && (this.wrappedLines(selected.description, 375, detailSize).length + this.wrappedLines(benefit, 375, detailSize).length) * (detailSize + 6) + 12 > 132) detailSize--;
    const y = this.paragraph(selected.description, 451, 247, 375, detailSize);
    this.paragraph(benefit, 451, y + 12, 375, detailSize);
    const status = selected.consumable ? 'Fixed price per item. Unused stock carries over. Using an item consumes it permanently.' : target <= level ? 'SELECTED LEVEL ALREADY OWNED' : economy.locked(this.selected) ? economy.lockReason(this.selected) : 'Buy this level directly; earlier levels are included.';
    this.summary += `\n${selected.name} / ${selected.consumable ? `STOCK ${data.inventory[this.selected as InventoryKey]}` : `OWNED ${level}/${selected.max} / LEVEL ${target}`}\n${selected.description}\n${benefit}\n${status}\nPRICE ${dollars(cost.moneyCents)}${cost.scrap ? ` + ${cost.scrap} scrap` : ''}`;
    this.paragraph(status, 451, 385, 375, 11);
    if (selected.consumable || target > level) this.text(`PRICE ${dollars(cost.moneyCents)}${cost.scrap ? ` + ${cost.scrap} scrap` : ''}`, 451, 447, 14);
    this.button(`buy:${this.selected}:${target}`, economy.canBuy(this.selected, target) ? selected.consumable ? 'BUY ONE' : `PURCHASE LEVEL ${target}` : !selected.consumable && target <= level ? 'ALREADY OWNED' : economy.locked(this.selected) ? 'EQUIPMENT LOCKED' : 'INSUFFICIENT CURRENCY', 451, 465, 377, 44, economy.canBuy(this.selected, target));
    this.button('launch', 'LAUNCH / RETURN TO SLINGSHOT', 48, 518, 546, 36);
    this.button('menu', 'SAVE SLOTS', 615, 518, 213, 36);
    if (!saving) this.text('Saving unavailable', 650, 510, 11, '#ffd07d');
    this.finish();
  }
  private deployableCard(economy:Economy,key:InventoryKey,index:number) {
    const definition = economy.definition(key), deployment = deployables.find(item => item.item === key)!;
    const x = 48 + index % 3 * 123, y = 171 + Math.floor(index / 3) * 160, size = 112;
    const selected = this.selected === key, stock = economy.data.inventory[key], cost = economy.cost(key, 1);
    const price = `${dollars(cost.moneyCents)}${cost.scrap ? ` / ${cost.scrap} scrap` : ''}`;
    this.ctx.fillStyle = selected ? '#204a2b' : '#0c2618'; this.ctx.fillRect(x, y, size, size);
    this.ctx.strokeStyle = selected ? '#c0ffc0' : '#558e59'; this.ctx.lineWidth = selected ? 2 : 1; this.ctx.strokeRect(x+.5, y+.5, size-1, size-1);
    this.text(deployment.shortLabel.toUpperCase(), x+7, y+14, 9, '#baf0b7');
    this.text(`[${deployment.key}]`, x+88, y+14, 9, '#8cb392');
    if (!deployment.art || !itemArt.draw(this.ctx, deployment.art, x+25, y+23, 62, 62)) {
      this.ctx.font = '35px monospace'; this.ctx.fillStyle = '#a5dcb2'; this.ctx.textAlign = 'center';
      this.ctx.fillText(key === 'leadBoots' ? '↓' : deployment.art ? '◈' : '+', x+size/2, y+67);
    }
    this.text(`STOCK ${stock}`, x+8, y+102, 11, '#b7e5ba'); this.text(price, x+1, y+133, 9, '#a5c9a8');
    this.buttons.push({x,y,width:size,height:size,action:`select:${key}`,enabled:true,
      label:`${definition.name} / STOCK ${stock} / ${price} / KEY ${deployment.key}`,
      deployable:{art:deployment.art ?? undefined,name:deployment.shortLabel,stock,price,shortcut:deployment.key,selected}});
  }
  results(width: number, height: number, score: Scoring, data: SaveData, failed: boolean, payday?: PaydaySnapshot) {
    this.accessible.className = 'accessible game-controls screen-results';
    const b = score.breakdown();
    const best = this.resultPlanet === 'earth' ? data.bestAltitude : data.moonBestAltitude;
    const title = this.landing ? `${this.landing.toUpperCase()} LANDING / PAYDAY` : 'FLIGHT PAYDAY';
    const subtitle = this.landing === 'Moon' ? 'MOON GARAGE UNLOCKED / NEXT STOP: MARS' : this.landing === 'Mars' ? 'MARS MISSION COMPLETE / PROGRESS SAVED' : this.newRecord ? `NEW PERSONAL BEST / FLIGHT ${data.flights}` : `FLIGHT ${data.flights} / PERSONAL BEST ${feet(best)}`;
    this.begin(width, height, title, subtitle, payday ? Math.min(this.boot, payday.bootProgress) : this.boot);
    const fallback = [
      { id: 'height', label: 'Max height', value: score.maxAltitude }, { id: 'time', label: 'Flight time', value: score.duration }, { id: 'distance', label: 'Distance', value: score.distance },
      ...(score.spaceDuration > 0 || score.maxAltitude >= mission(this.resultPlanet).survivalFeet ? [{ id: 'space', label: 'Space reached', value: 1 }, { id: 'spaceTime', label: 'Time in space', value: score.spaceDuration }] : []),
      { id: 'scrap', label: 'Scrap', value: score.scrap },
    ].map(row => { const earning = b.rows.find(earning => earning.id === row.id); return { ...row, value:earning?.target ?? row.value, progress:1, visible:true, complete:true, rateCents:earning?.rateCents ?? null, earningsCents:earning?.amountCents ?? 0 }; });
    const rows: ResultRow[] = (payday?.rows ?? fallback).map(row => {
      const unit = row.id === 'height' || row.id === 'distance' ? 'ft' : row.id === 'time' || row.id === 'spaceTime' ? 's' : '';
      const stat = unit === 'ft' ? feet(row.value) : unit === 's' ? `${row.value.toFixed(1)} s` : row.id === 'space' ? '1' : `+${Math.floor(row.value).toLocaleString()}`;
      const rate = row.rateCents === null ? '' : `$${(row.rateCents / 100).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:3 })}${unit ? '/' + unit : ''}`;
      return { ...row, value:rate ? `${stat} × ${rate} = ${dollars(row.earningsCents)}` : stat };
    });
    this.text('STAT EARNINGS', 48, 129, 10, '#70a777');
    const spacing = rows.length > 4 ? 44 : 57;
    rows.forEach((row, index) => {
      const y = 151 + index * spacing;
      this.ctx.fillStyle = row.visible ? '#15351d' : '#0c2313'; this.ctx.fillRect(48, y - 11, 358, spacing - 9);
      this.ctx.fillStyle = '#75d28a'; this.ctx.fillRect(48, y - 11, 3, (spacing - 9) * row.progress);
      this.text(row.label.toUpperCase(), 61, y + 1, 10, row.visible ? '#91bd96' : '#4a7050');
      const value = row.visible ? row.value : '—'; let size = 12;
      this.ctx.font = `${size}px monospace`;
      while (size > 9 && this.ctx.measureText(value).width > 331) { size--; this.ctx.font = `${size}px monospace`; }
      this.text(value, 61, y + 18, size, row.complete ? '#c1ffc4' : '#85d995');
      this.ctx.fillStyle = '#609a6540'; this.ctx.fillRect(61, y + 24, 331 * row.progress, 1);
    });
    this.line(428, 123, 428, 423);
    const complete = payday?.complete ?? true, moneyProgress = payday?.moneyProgress ?? 1;
    const money = dollars(payday?.moneyCents ?? b.totalCents);
    this.text('GRAND TOTAL', 451, 148, 12, '#a0d6a5');
    let moneySize = 44; this.ctx.font = `${moneySize}px monospace`;
    while (moneySize > 26 && this.ctx.measureText(money).width > 377) { moneySize--; this.ctx.font = `${moneySize}px monospace`; }
    this.ctx.shadowColor = '#9bffa0'; this.ctx.shadowBlur = complete ? 8 : 3;
    this.text(money, 451, 205, moneySize, '#d1ffd0'); this.ctx.shadowBlur = 0;
    this.text(complete ? 'FUNDS DEPOSITED' : 'COUNTING YOUR FLIGHT', 453, 235, 11, '#81b78b');
    this.drawCoinStacks(474, 337, moneyProgress, complete);
    this.ctx.fillStyle = '#1b3d22'; this.ctx.fillRect(451, 368, 377, 5);
    this.ctx.fillStyle = '#9bed9c'; this.ctx.fillRect(451, 368, 377 * moneyProgress, 5);
    this.text(complete ? 'PAYDAY COMPLETE' : 'TRANSFERRING EARNINGS', 451, 397, 11, complete ? '#c2ffc0' : '#6e9f77');
    const settled = !payday || payday.collectedVisible;
    const note = settled ? [b.collectedCents ? `Collected cash +${dollars(b.collectedCents)}` : '', failed && b.funeralCents > 0 ? `Recovery −${dollars(b.funeralCents)}` : ''].filter(Boolean).join(' / ') : '';
    if (note) this.text(note, 451, 419, 11, '#c0b98c');
    this.line(48, 440, 828, 440);
    const wallet = `BANK ${dollars(data.moneyCents)} / ${data.scrap} SCRAP`;
    this.text(wallet, 48, 470, 13, '#94bd98');
    // Keep the skip control present in the button tree so counting never steals keyboard focus.
    if (!complete) this.button('skipPayday', 'SKIP COUNT', 678, 455, 150, 30, true);
    else this.buttons.push({ action: 'skipPayday', label: 'SKIP COUNT', x: 678, y: 455, width: 150, height: 30, enabled: true });
    this.button('garage', this.landing === 'Moon' ? 'MOON GARAGE' : 'GARAGE', 48, 512, 383, 42);
    this.button('launch', this.landing === 'Moon' ? 'LAUNCH FROM MOON' : 'LAUNCH AGAIN', 451, 512, 377, 42);
    this.finish({ title, subtitle, rows, money, moneyProgress, complete, wallet, note });
  }
  private drawCoinStacks(x: number, baseline: number, progress: number, complete: boolean) {
    const ctx = this.ctx;
    for (let stack = 0; stack < 5; stack++) {
      const count = Math.max(0, Math.min(8, Math.floor(progress * 40 - stack * 6)));
      const coinX = x + stack * 61;
      ctx.fillStyle = '#00000022'; ctx.beginPath(); ctx.ellipse(coinX + 22, baseline + 12, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
      for (let coin = 0; coin < count; coin++) {
        const y = baseline - coin * 8;
        ctx.fillStyle = '#355a31'; ctx.fillRect(coinX, y - 4, 44, 7);
        ctx.strokeStyle = '#90c887'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(coinX + 22, y + 2, 22, 6, 0, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = complete ? '#a8d990' : '#84bd7d'; ctx.beginPath(); ctx.ellipse(coinX + 22, y - 4, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d5f5b8'; ctx.beginPath(); ctx.ellipse(coinX + 22, y - 4, 16, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  hud(width: number, height: number, player: Player, score: Scoring, equipment: FlightEquipment, data: SaveData, sling: Slingshot, aiming: boolean, crashing: boolean, saving: boolean, guideMessage = '', world?: World) {
    if (this.signature) this.accessible.replaceChildren();
    this.buttons = []; this.signature = ''; this.accessible.className = 'accessible';
    const layout = this.flightHud.draw(this.ctx, width, height, player, score, equipment, data, world, this.presentationTime, this.boot, this.presentationReducedMotion);
    const hint = aiming ? 'DRAG TO LAUNCH / POWER ' + Math.round(sling.power * 100) + '%' : crashing ? 'HEADING HOME / HEALTH DEPLETED' : player.grounded ? 'LANDING / PAYDAY NEXT' : player.vy > 0 ? 'CLIMBING' : 'DESCENDING / LOOK FOR A PLATFORM';
    const y = layout.compact ? height - layout.controlsBottom - 74 : height - 20;
    this.ctx.save(); this.ctx.font = (layout.compact ? 9 : 11) + 'px monospace';
    const hintWidth = Math.min(width - 24, this.ctx.measureText(hint).width + 20);
    this.ctx.textBaseline = 'alphabetic';
    if (!guideMessage) {
      this.ctx.fillStyle = '#0a2018de'; this.ctx.fillRect((width - hintWidth) / 2, y - 14, hintWidth, 23);
      this.text(hint, (width - hintWidth) / 2 + 10, y, layout.compact ? 9 : 11);
    }
    if (!saving) this.text('SAVING UNAVAILABLE', 16, layout.footer.y + 27, 9, '#ffd07d');
    if (guideMessage && height < 500) {
      const top=Math.max(...layout.items.map(item=>item.rect.y+item.rect.height))+8;
      this.ctx.fillStyle = '#0a2018ee'; this.ctx.fillRect(8, top, width - 126, 44);
      this.wrappedLines(guideMessage, width - 146, 10).slice(0, 2).forEach((line, index) => this.text(line, 16, top+17+index*14, 10, '#ffe3aa'));
    } else if (guideMessage) this.guideBox(guideMessage, width, height, layout.compact ? layout.controlsBottom + 68 : 52);
    this.ctx.restore(); return layout;
  }
  private guideBox(message: string, width: number, height: number, bottom = 52) {
    const ctx = this.ctx, boxWidth = Math.min(600, width - 32), x = (width - boxWidth) / 2;
    ctx.font = '12px monospace';
    const lines: string[] = []; let line = '';
    for (const word of message.split(' ')) {
      if (line && ctx.measureText(`${line} ${word}`).width > boxWidth - 28) { lines.push(line); line = word; }
      else line += `${line ? ' ' : ''}${word}`;
    }
    if (line) lines.push(line);
    const boxHeight = 34 + lines.length * 18, y = height - bottom - boxHeight;
    ctx.fillStyle = '#10251ef2'; ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = '#eac075'; ctx.lineWidth = 1; ctx.strokeRect(x, y, boxWidth, boxHeight);
    this.text('GROUND CONTROL', x + 14, y + 17, 10, '#85ffae');
    lines.forEach((text, i) => this.text(text, x + 14, y + 36 + i * 18, 12, '#ffe3aa'));
  }
}
