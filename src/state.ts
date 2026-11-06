export type GameState = 'menu' | 'aiming' | 'launching' | 'flying' | 'crashing' | 'results' | 'garage';
export const isFlightState = (state: GameState) => state === 'launching' || state === 'flying' || state === 'crashing';
