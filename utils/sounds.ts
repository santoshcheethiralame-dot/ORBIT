// utils/sounds.ts - ENHANCED WITH SETTINGS INTEGRATION
// "Zen Garden" Audio Profile - Soft, Organic, Minimal.

class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = false;
  private volume: number = 0.5; // 0-1 scale
  private tickSoundEnabled: boolean = false;
  private completionSoundEnabled: boolean = true;
  private milestoneSoundEnabled: boolean = true;

  constructor() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
    
    // Load initial settings
    this.loadSettings();
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem("orbit-settings-v2");
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.audio) {
          this.enabled = settings.audio.enabled ?? true;
          this.volume = (settings.audio.volume ?? 50) / 100; // Convert 0-100 to 0-1
          this.tickSoundEnabled = settings.audio.tickSound ?? false;
          this.completionSoundEnabled = settings.audio.completionSound ?? true;
          this.milestoneSoundEnabled = settings.audio.milestoneSound ?? true;
        }
      }
    } catch (e) {
      console.warn("Failed to load audio settings:", e);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(volumePercent: number) {
    // volumePercent is 0-100, convert to 0-1
    this.volume = Math.max(0, Math.min(100, volumePercent)) / 100;
  }

  setTickSoundEnabled(enabled: boolean) {
    this.tickSoundEnabled = enabled;
  }

  setCompletionSoundEnabled(enabled: boolean) {
    this.completionSoundEnabled = enabled;
  }

  setMilestoneSoundEnabled(enabled: boolean) {
    this.milestoneSoundEnabled = enabled;
  }

  // Refresh settings from localStorage (called when settings change)
  refreshSettings() {
    this.loadSettings();
  }

  // Soft "Wood Block" Click
  public playClick() {
    if (!this.enabled || !this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
    
    // Apply volume
    const adjustedVolume = 0.15 * this.volume;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(adjustedVolume, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // Gentle "Glass" Tap for Tabs
  public playTab() {
    if (!this.enabled || !this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    
    const adjustedVolume = 0.05 * this.volume;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(adjustedVolume, this.ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // Timer tick sound (only if enabled in settings)
  public playTick() {
    if (!this.enabled || !this.ctx || !this.tickSoundEnabled) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    
    const adjustedVolume = 0.02 * this.volume; // Very quiet tick
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(adjustedVolume, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Soft Chord for Success (respects completionSound setting)
  public playSuccess() {
    if (!this.enabled || !this.ctx || !this.completionSoundEnabled) return;
    const now = this.ctx.currentTime;
    
    // A Major 7th Chord (A4, C#5, E5, G#5) - Very soft
    [440, 554, 659, 830].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        
        const adjustedVolume = 0.05 * this.volume;
        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(adjustedVolume, now + i * 0.05 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 1.5);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 1.5);
    });
  }

  // Milestone celebration sound (respects milestoneSound setting)
  public playMilestone() {
    if (!this.enabled || !this.ctx || !this.milestoneSoundEnabled) return;
    const now = this.ctx.currentTime;
    
    // Ascending arpeggio for milestones
    [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        
        const adjustedVolume = 0.06 * this.volume;
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(adjustedVolume, now + i * 0.08 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.8);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.8);
    });
  }

  // Low Thud for Error (Non-aggressive)
  public playError() {
    if (!this.enabled || !this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.3);
    
    const adjustedVolume = 0.1 * this.volume;
    gain.gain.setValueAtTime(adjustedVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

export const SoundManager = new AudioEngine();

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  (window as any).SoundManager = SoundManager;
}