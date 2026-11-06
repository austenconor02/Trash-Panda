export interface AudioSettings { master: number; effects: number; music: number; masterMuted: boolean; effectsMuted: boolean; musicMuted: boolean; spokenGuide: boolean }
export type AudioEffect = 'launch' | 'bounce' | 'coin' | 'boost' | 'purchase' | 'impact' | 'paydayTick' | 'paydayRow' | 'paydayComplete' | 'tabletBoot';
type MusicMode = 'menu' | 'flight';
const storageKey = 'trash-panda-aerospace-audio-v1';
const musicOwnerKey = Symbol.for('trash-panda-aerospace-music-owner');
export class GameAudio {
  settings: AudioSettings = { master: 0.7, effects: 0.6, music: 0.5, masterMuted: false, effectsMuted: false, musicMuted: false, spokenGuide: true };
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicMode: MusicMode | null = null;
  private loadedMusicMode: MusicMode | null = null;
  private musicPositions = { menu:0, flight:0 };
  private musicFade = 0;
  private musicTarget = 0;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicPlaying: Promise<void> | null = null;
  private musicGeneration = 0;
  private fadeGeneration = 0;
  private sourceGeneration = 0;
  private disposed = false;
  private musicChannel: BroadcastChannel | null = null;
  private ownsTabMusic = true;
  private readonly focusMusic = () => { if (this.unlocked && !this.disposed) { this.ownsTabMusic = true; this.musicChannel?.postMessage('claim'); this.syncMusic(); } };
  private readonly leavePage = () => this.stopMusic();
  private unlocked = false;
  private coinSequence = 0;
  private lastPaydayTick = -Infinity;
  private activeVoices = 0;
  constructor() {
    // Replacing a game or reloading its module must retire the old music player.
    const registry = globalThis as typeof globalThis & { [musicOwnerKey]?:GameAudio };
    registry[musicOwnerKey]?.dispose(); registry[musicOwnerKey] = this;
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.focusMusic);
      window.addEventListener('pagehide', this.leavePage);
      if (typeof window.BroadcastChannel === 'function') {
        try {
          this.musicChannel = new BroadcastChannel('trash-panda-aerospace-music');
          this.musicChannel.onmessage = event => { if (event.data === 'claim') { this.ownsTabMusic = false; this.stopMusic(); } };
        } catch { /* Browsers without cross-tab messaging still use one local player. */ }
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved && typeof saved === 'object') {
        for (const key of ['master', 'effects', 'music'] as const) if (Number.isFinite(saved[key])) this.settings[key] = Math.max(0, Math.min(1, saved[key]));
        for (const key of ['masterMuted', 'effectsMuted', 'musicMuted', 'spokenGuide'] as const) if (typeof saved[key] === 'boolean') this.settings[key] = saved[key];
      }
    } catch { /* Defaults work when storage is unavailable. */ }
  }
  set<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) {
    this.settings[key] = value;
    this.apply();
    if (this.settings.masterMuted || this.settings.effectsMuted || !this.settings.spokenGuide || this.settings.master * this.settings.effects <= 0) this.cancelGuide();
    try { localStorage.setItem(storageKey, JSON.stringify(this.settings)); } catch { /* Session settings still work. */ }
  }
  cancelGuide() { try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* Text guidance remains available. */ } }
  speak(message: string) {
    if (!this.settings.spokenGuide || this.settings.masterMuted || this.settings.effectsMuted || this.settings.master * this.settings.effects <= 0 || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    this.cancelGuide();
    try {
      const voice = new SpeechSynthesisUtterance(message); voice.volume = this.settings.master * this.settings.effects; voice.rate = 1.05;
      speechSynthesis.speak(voice);
    } catch { /* Unavailable voices never interrupt gameplay. */ }
  }
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    this.ownsTabMusic = true; this.musicChannel?.postMessage('claim');
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.effects = this.context.createGain(); this.effects.connect(this.master); this.apply();
      }
      void this.context.resume().catch(() => {});
    } catch { /* Audio support never blocks the game. */ }
    this.syncMusic();
  }
  /** One requested soundtrack: menus, released flight, or silence while aiming. */
  setMusicMode(mode: MusicMode | null) {
    this.musicMode = mode;
    this.syncMusic();
  }
  private apply() {
    if (this.master) this.master.gain.value = this.settings.masterMuted ? 0 : this.settings.master;
    if (this.effects) this.effects.gain.value = this.settings.effectsMuted ? 0 : this.settings.effects;
    this.applyMusicVolume();
    this.syncMusic();
  }
  private desiredMusic() {
    return !this.disposed && this.ownsTabMusic && this.unlocked && !this.settings.masterMuted && !this.settings.musicMuted
      && this.settings.master * this.settings.music > 0 && (typeof document === 'undefined' || document.visibilityState !== 'hidden') ? this.musicMode : null;
  }
  private applyMusicVolume() {
    const volume = this.settings.masterMuted || this.settings.musicMuted ? 0 : this.settings.master * this.settings.music;
    if (this.music) this.music.volume = Math.max(0, Math.min(1, volume * this.musicFade));
  }
  private fadeMusic(target: number) {
    if (!this.music || this.musicTarget === target) return;
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    this.musicTarget = target;
    const from = this.musicFade, generation = this.musicGeneration, fade = ++this.fadeGeneration;
    let step = 0;
    const advance = () => {
      if (this.disposed || generation !== this.musicGeneration || fade !== this.fadeGeneration) return;
      this.musicTimer = null;
      this.musicFade = from + (target - from) * ++step / 8;
      this.applyMusicVolume();
      if (step < 8) this.musicTimer = setTimeout(advance, 25);
      else if (target === 0) { this.stopMusic(); this.syncMusic(); }
    };
    this.musicTimer = setTimeout(advance, 25);
  }
  private stopMusic() {
    this.musicGeneration++;
    this.fadeGeneration++;
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    this.musicTimer = null; this.musicPlaying = null; this.musicFade = this.musicTarget = 0;
    if (this.music) {
      this.music.volume = 0;
      if (this.loadedMusicMode && Number.isFinite(this.music.currentTime)) this.musicPositions[this.loadedMusicMode] = this.music.currentTime;
      this.music.pause();
    }
  }
  dispose() {
    this.disposed = true; this.stopMusic(); this.musicChannel?.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener?.('focus', this.focusMusic); window.removeEventListener?.('pagehide', this.leavePage);
    }
  }
  private syncMusic() {
    if (this.disposed) return;
    const mode = this.desiredMusic();
    if (!mode || mode !== this.loadedMusicMode) {
      if (this.musicFade > 0) { this.fadeMusic(0); return; }
      this.stopMusic();
      if (!mode) return;
    }
    let track = this.music;
    if (!track) {
      try {
        if (typeof Audio === 'undefined') return;
        track = this.music = new Audio();
        track.loop = true;
        track.preload = 'auto';
        track.volume = 0;
      } catch { return; /* Music support never blocks the game. */ }
    }
    if (this.loadedMusicMode !== mode) {
      this.loadedMusicMode = mode;
      const position = this.musicPositions[mode], source = ++this.sourceGeneration;
      const restore = () => { if (this.loadedMusicMode === mode && source === this.sourceGeneration) try { track.currentTime = position; } catch { /* Retry after metadata. */ } };
      track.onloadedmetadata = restore;
      track.src = mode === 'menu' ? '/audio/garage-idle.mp3' : '/audio/flight-tick-tock.mp3';
      restore();
    }
    if (this.musicPlaying) return;
    if (!track.paused) { this.fadeMusic(1); return; }
    const generation = ++this.musicGeneration;
    let failed = false;
    try {
      const playing = track.play();
      this.musicPlaying = Promise.resolve(playing).then(() => {
        if (generation !== this.musicGeneration) { if (!this.desiredMusic()) track.pause(); return; }
        if (this.desiredMusic() !== mode) this.stopMusic();
      }).catch(() => {
        if (generation !== this.musicGeneration) return;
        failed = true;
        this.stopMusic();
      }).finally(() => {
        if (generation !== this.musicGeneration) return;
        this.musicPlaying = null;
        if (!failed) this.syncMusic();
      });
    } catch { this.stopMusic(); /* A later gesture can retry blocked playback. */ }
  }
  private tone(frequency: number, endFrequency: number, offset: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    if (!this.context || !this.effects || this.activeVoices >= 64) return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain(), start = this.context.currentTime + offset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(this.effects);
    this.activeVoices++;
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.activeVoices--; };
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
  }
  private coinClink(offset: number, strength = 1) {
    const pitches = [1, 1.12, 0.95, 1.23, 1.05, 0.9, 1.16];
    const frequency = 1850 * pitches[this.coinSequence++ % pitches.length];
    // Inharmonic partials give each short hit the ring of metal coins.
    this.tone(frequency, frequency * 0.98, offset, 0.12, 0.026 * strength);
    this.tone(frequency * 1.47, frequency * 1.44, offset + 0.002, 0.085, 0.014 * strength);
    this.tone(frequency * 2.09, frequency * 2.03, offset, 0.055, 0.008 * strength);
  }
  effect(kind: AudioEffect) {
    if (!this.context || !this.effects || this.settings.masterMuted || this.settings.effectsMuted || this.settings.master * this.settings.effects <= 0) return;
    if (kind === 'paydayTick') {
      if (this.context.currentTime - this.lastPaydayTick < 0.045) return;
      this.lastPaydayTick = this.context.currentTime;
      this.coinClink(0);
      return;
    }
    if (kind === 'paydayRow') {
      this.coinClink(0, 0.7); this.coinClink(0.055, 0.55); this.coinClink(0.11, 0.35);
      return;
    }
    if (kind === 'paydayComplete') {
      this.tone(145, 65, 0, 0.08, 0.045, 'triangle');
      this.tone(2600, 1800, 0.025, 0.035, 0.018, 'square');
      this.tone(1320, 1310, 0.075, 0.35, 0.065);
      this.tone(1980, 1965, 0.16, 0.48, 0.047);
      this.tone(3940, 3900, 0.16, 0.28, 0.014);
      for (let i = 0; i < 6; i++) this.coinClink(0.25 + i * 0.053, 0.65 - i * 0.075);
      return;
    }
    if (kind === 'tabletBoot') {
      this.tone(440, 880, 0, 0.055, 0.025, 'triangle');
      this.tone(1320, 1320, 0.075, 0.075, 0.022, 'triangle');
      return;
    }
    const tones = { launch: [180, 500], bounce: [280, 700], coin: [900, 1300], boost: [100, 850], purchase: [600, 1000], impact: [150, 45] };
    this.tone(tones[kind][0], tones[kind][1], 0, 0.15, 0.07);
  }
}
