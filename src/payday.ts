/** The result screen's presentation clock. It never changes a save or awards money. */
export interface PaydayInput {
  maxHeight: number;
  flightSeconds: number;
  distance: number;
  spaceSeconds: number;
  reachedSpace?: boolean;
  scrap: number;
  /** The already-finalized payout, in whole cents. */
  totalCents: number;
  earnings?: PaydayEarning[];
  collectedCents?: number;
}

export type PaydayRowId = 'height' | 'time' | 'distance' | 'space' | 'spaceTime' | 'scrap';
export type PaydayEvent = 'boot' | 'tick' | 'row' | 'complete';
export interface PaydayEarning { id:Exclude<PaydayRowId, 'scrap'>; target:number; rateCents:number; amountCents:number }

export interface PaydayRow {
  id: PaydayRowId;
  label: string;
  target: number;
  value: number;
  progress: number;
  visible: boolean;
  complete: boolean;
  rateCents: number | null;
  earningsCents: number;
}

export interface PaydaySnapshot {
  elapsed: number;
  duration: number;
  bootProgress: number;
  rows: PaydayRow[];
  moneyCents: number;
  moneyProgress: number;
  moneyVisible: boolean;
  collectedCents: number;
  collectedVisible: boolean;
  complete: boolean;
  /** Only step() emits events; reading snapshot() never replays a sound. */
  events: PaydayEvent[];
}

export const paydayTiming = {
  boot: 0.56,
  rowStart: 0.64,
  rowStagger: 1.75,
  rowCount: 1.25,
  moneyDelay: 0.55,
  moneyCount: 1.60,
  settle: 0.18,
  tickInterval: 0.075,
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const nonnegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const whole = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, Math.floor(nonnegative(value)));
const easeOut = (value: number) => 1 - (1 - value) ** 3;

type RowDefinition = Pick<PaydayRow, 'id' | 'label' | 'target'> & { rateCents?:number; amountCents?:number };

export class PaydayTimeline {
  private definitions: RowDefinition[] = [];
  private elapsed = 0;
  private totalCents = 0;
  private collectedCents = 0;
  private active = false;
  private completedSound = false;
  private instant = false;

  start(input: PaydayInput, options: { reducedMotion?: boolean } = {}): PaydaySnapshot {
    this.definitions = [
      { id: 'height', label: 'Max height', target: nonnegative(input.maxHeight) },
      { id: 'time', label: 'Flight time', target: nonnegative(input.flightSeconds) },
      { id: 'distance', label: 'Distance', target: nonnegative(input.distance) },
    ];
    const spaceSeconds = nonnegative(input.spaceSeconds);
    if (input.reachedSpace || spaceSeconds > 0) {
      this.definitions.push(
        { id: 'space', label: 'Space reached', target: 1 },
        { id: 'spaceTime', label: 'Time in space', target: spaceSeconds },
      );
    }
    this.definitions.push({ id: 'scrap', label: 'Scrap', target: whole(input.scrap) });
    for (const row of this.definitions) {
      const earning = input.earnings?.find(earning => earning.id === row.id);
      if (earning) Object.assign(row, { target:nonnegative(earning.target), rateCents:nonnegative(earning.rateCents), amountCents:whole(earning.amountCents) });
    }
    this.totalCents = whole(input.totalCents);
    this.collectedCents = whole(input.collectedCents ?? 0);
    this.active = true;
    this.completedSound = false;
    this.instant = !!options.reducedMotion;
    this.elapsed = this.instant ? this.duration : 0;
    return this.snapshot();
  }

  /** Supply only visible, unpaused presentation time. Invalid/zero deltas are inert. */
  step(dt: number): PaydaySnapshot {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return this.snapshot();
    const previous = this.elapsed;
    const previousMoney = this.moneyAt(previous);
    this.elapsed = Math.min(this.duration, previous + dt);
    const events: PaydayEvent[] = [];

    // A long frame/fast-forward never releases a backlog of coin or row sounds.
    if (this.elapsed >= this.duration) {
      if (!this.completedSound) {
        events.push('complete');
        this.completedSound = true;
      }
    } else {
      if (previous === 0) events.push('boot');
      if (this.definitions.some((_, index) => {
        const end = this.rowStart(index) + paydayTiming.rowCount;
        return previous < end && this.elapsed >= end;
      })) events.push('row');
      const changedRow = this.definitions.some((row, index) => (row.amountCents ?? 0) > 0
        && this.elapsed > this.rowStart(index) && previous < this.rowStart(index) + paydayTiming.rowCount);
      if (Math.floor(this.elapsed / paydayTiming.tickInterval) > Math.floor(previous / paydayTiming.tickInterval)
        && (changedRow || this.moneyAt(this.elapsed) > previousMoney)) events.push('tick');
    }
    return { ...this.snapshot(), events };
  }

  /** Finish the visual sequence without awarding anything or playing skipped sounds. */
  skip(): PaydaySnapshot {
    if (this.active) {
      this.elapsed = this.duration;
      this.completedSound = true;
    }
    return this.snapshot();
  }

  snapshot(): PaydaySnapshot {
    const moneyProgress = this.active ? clamp01((this.elapsed - this.moneyStart) / paydayTiming.moneyCount) : 0;
    return {
      elapsed: this.elapsed,
      duration: this.active ? this.duration : 0,
      bootProgress: this.active ? clamp01(this.elapsed / paydayTiming.boot) : 0,
      rows: this.definitions.map((row, index) => {
        const progress = clamp01((this.elapsed - this.rowStart(index)) / paydayTiming.rowCount);
        return { ...row, value: row.rateCents !== undefined || progress === 1 ? row.target : row.target * easeOut(progress), progress,
          rateCents:row.rateCents ?? null, earningsCents:Math.floor((row.amountCents ?? 0) * easeOut(progress)),
          visible: this.elapsed >= this.rowStart(index), complete: progress === 1 };
      }),
      moneyCents: this.moneyAt(this.elapsed),
      moneyProgress,
      moneyVisible: this.active && this.elapsed >= this.moneyStart,
      collectedCents:this.collectedCents,
      collectedVisible:this.active && this.elapsed >= this.moneyStart - paydayTiming.moneyDelay,
      complete: this.active && this.elapsed >= this.duration,
      events: [],
    };
  }

  private rowStart(index: number) { return paydayTiming.rowStart + index * paydayTiming.rowStagger; }
  private get moneyStart() {
    return this.rowStart(Math.max(0, this.definitions.length - 1)) + paydayTiming.rowCount + paydayTiming.moneyDelay;
  }
  private get duration() { return this.moneyStart + paydayTiming.moneyCount + paydayTiming.settle; }
  private moneyAt(time: number) {
    if (!this.active) return 0;
    const progress = clamp01((time - this.moneyStart) / paydayTiming.moneyCount);
    return progress === 1 ? this.totalCents : Math.floor(this.totalCents * easeOut(progress));
  }
}
