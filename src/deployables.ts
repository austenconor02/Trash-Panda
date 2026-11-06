import type { InventoryKey } from './saves';

/** Shared slot order keeps garage cards, HUD art, taps, and number keys aligned. */
export const deployables = [
  { item:'boosters', action:'boost', key:'1', label:'Emergency Thruster', shortLabel:'THRUSTER', art:'booster' },
  { item:'leadBoots', action:'boots', key:'2', label:'Lead Boots', shortLabel:'BOOTS', art:undefined },
  { item:'teleporter', action:'teleport', key:'3', label:'Teleporter', shortLabel:'TELEPORT', art:'teleporter' },
  { item:'health20', action:'health20', key:'4', label:'20% Health Pack', shortLabel:'HEAL 20', art:undefined },
  { item:'health50', action:'health50', key:'5', label:'50% Health Pack', shortLabel:'HEAL 50', art:undefined },
  { item:'health75', action:'health75', key:'6', label:'75% Health Pack', shortLabel:'HEAL 75', art:undefined },
] as const satisfies readonly { item:InventoryKey; action:string; key:string; label:string; shortLabel:string; art:'booster'|'teleporter'|undefined }[];

export type DeployableAction = typeof deployables[number]['action'];
