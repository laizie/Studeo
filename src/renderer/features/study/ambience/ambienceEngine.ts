import { type AmbienceId, fillPinkNoise, fillBrownNoise, fillWhiteNoise } from '../../../../shared/ambience';

// Imperative Web Audio engine for Focus Mode ambience. One AudioContext, created
// lazily on first play (browsers only allow audio to start from a user gesture — a
// chip click qualifies). Each sound is a small graph: a looping noise buffer through
// a filter or two into a master gain we ramp for click-free fades. Noise loops
// seamlessly because it has no phase — the seam is just one more random step.
//
// State is deliberately module-level (a singleton): there's only ever one room, and
// keeping the AudioContext out of React means re-renders can't tear down playback.
class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Live sources + LFOs for the current sound, stopped on switch/stop. */
  private nodes: AudioScheduledSourceNode[] = [];
  private current: AmbienceId | null = null;
  private volume = 0.6;

  private ensure(): { ctx: AudioContext; master: GainNode } {
    let ctx = this.ctx;
    let master = this.master;
    if (!ctx || !master) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0; // fade up from silence on the first play
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, master };
  }

  // A few seconds of noise, looped. Long enough that any low-frequency seam in brown
  // noise is rare and subtle; short enough to stay tiny in memory.
  private loopSource(ctx: AudioContext, kind: 'pink' | 'brown' | 'white'): AudioBufferSourceNode {
    const len = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'pink') fillPinkNoise(data);
    else if (kind === 'brown') fillBrownNoise(data);
    else fillWhiteNoise(data);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private filter(ctx: AudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    return f;
  }

  /** Start (or switch to) a sound. Switching noise→noise under a steady master gain
   *  is inaudibly smooth, so we don't dip the volume between sounds. */
  play(id: AmbienceId): void {
    const { ctx, master } = this.ensure();
    this.stopNodes();
    this.current = id;

    // A per-sound gain lets LFOs modulate amplitude without touching master (volume).
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(master);

    if (id === 'white') {
      const src = this.loopSource(ctx, 'white');
      const soften = this.filter(ctx, 'lowpass', 8000); // shave the harshest top
      src.connect(soften); soften.connect(g);
      src.start(); this.nodes.push(src);
    } else if (id === 'brown') {
      const src = this.loopSource(ctx, 'brown');
      src.connect(g);
      src.start(); this.nodes.push(src);
    } else if (id === 'rain') {
      const src = this.loopSource(ctx, 'pink');
      const hp = this.filter(ctx, 'highpass', 500);   // thin out the low rumble
      const lp = this.filter(ctx, 'lowpass', 3200);   // soften the hiss into "shhh"
      src.connect(hp); hp.connect(lp); lp.connect(g);
      // A slow swell so it breathes rather than sitting as flat static.
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
      const depth = ctx.createGain(); depth.gain.value = 0.12;
      lfo.connect(depth); depth.connect(g.gain);
      lfo.start(); this.nodes.push(src, lfo);
    } else { // wind
      const src = this.loopSource(ctx, 'brown');
      const lp = this.filter(ctx, 'lowpass', 500);
      src.connect(lp); lp.connect(g);
      // Sweep the cutoff for the "whoosh", and swell the gain for gusts.
      const sweep = ctx.createOscillator(); sweep.frequency.value = 0.07;
      const sweepDepth = ctx.createGain(); sweepDepth.gain.value = 350;
      sweep.connect(sweepDepth); sweepDepth.connect(lp.frequency);
      const gust = ctx.createOscillator(); gust.frequency.value = 0.1;
      const gustDepth = ctx.createGain(); gustDepth.gain.value = 0.25;
      gust.connect(gustDepth); gustDepth.connect(g.gain);
      src.start(); sweep.start(); gust.start();
      this.nodes.push(src, sweep, gust);
    }

    // Ramp master toward the current volume — a no-op when already there (a switch),
    // a fade-in from 0 when starting fresh.
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(this.volume, now + 0.4);
  }

  /** Fade out and stop everything. Safe to call when nothing is playing. */
  stop(): void {
    this.current = null;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.3);
    const toStop = this.nodes;
    this.nodes = [];
    // Let the fade finish before killing the sources so it doesn't click.
    setTimeout(() => toStop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }), 350);
  }

  private stopNodes(): void {
    this.nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.nodes = [];
  }

  /** 0..1. Applies immediately while playing; remembered for the next play otherwise. */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master && this.current) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.volume, now + 0.1);
    }
  }
}

export const ambienceEngine = new AmbienceEngine();
