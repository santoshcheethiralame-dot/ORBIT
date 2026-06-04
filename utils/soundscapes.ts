// utils/soundscapes.ts — offline, file-free focus soundscapes via the Web Audio API.
// Brown / white noise + a slow "deep-space" hum. No assets, works fully offline (PWA-safe).
// One AudioContext, created lazily on the first user gesture (play()).

export type SoundscapeType = "silence" | "brown" | "white" | "hum";

export const SOUNDSCAPES: { id: SoundscapeType; label: string }[] = [
  { id: "silence", label: "Silence" },
  { id: "brown", label: "Brown noise" },
  { id: "white", label: "White noise" },
  { id: "hum", label: "Deep space" },
];

// per-type loudness trim so all options sit at a comfortable level
const TRIM: Record<Exclude<SoundscapeType, "silence">, number> = {
  brown: 0.55,
  white: 0.22,
  hum: 0.65,
};

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private current: SoundscapeType = "silence";
  private volume = 0.5; // 0..1

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private makeNoiseBuffer(ctx: AudioContext, kind: "brown" | "white"): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 4); // 4s seamless loop
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (kind === "white") {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else {
      // brown noise: integrate white noise, then normalise a touch
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buf;
  }

  private clearNodes() {
    for (const n of this.nodes) {
      try {
        (n as any).stop?.();
      } catch {
        /* osc/source already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];
    if (this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* ignore */
      }
      this.master = null;
    }
  }

  async play(type: SoundscapeType): Promise<void> {
    this.clearNodes();
    this.current = type;
    if (type === "silence") return;

    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const master = ctx.createGain();
    master.gain.value = this.volume * TRIM[type];
    master.connect(ctx.destination);
    this.master = master;

    if (type === "brown" || type === "white") {
      const src = ctx.createBufferSource();
      src.buffer = this.makeNoiseBuffer(ctx, type);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = type === "brown" ? 720 : 1400;
      src.connect(lp);
      lp.connect(master);
      src.start();
      this.nodes = [src, lp];
    } else {
      // deep-space hum: two low sines + a slow LFO breathing the volume
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 58;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 87;
      o2.detune.value = 6;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 280;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = master.gain.value * 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(master.gain);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(master);
      o1.start();
      o2.start();
      lfo.start();
      this.nodes = [o1, o2, lp, lfo, lfoGain];
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx && this.current !== "silence") {
      const trim = TRIM[this.current as Exclude<SoundscapeType, "silence">] ?? 0.5;
      this.master.gain.setTargetAtTime(this.volume * trim, this.ctx.currentTime, 0.05);
    }
  }

  getVolume() {
    return this.volume;
  }

  getCurrent() {
    return this.current;
  }

  stop() {
    this.clearNodes();
    this.current = "silence";
  }
}

export const soundscape = new SoundscapeEngine();

if (typeof window !== "undefined") {
  (window as any).Soundscape = soundscape;
}
