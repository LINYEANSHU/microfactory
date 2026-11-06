// ============================================================
// MicroFactory · 提示音（WebAudio 纯合成，零素材文件）
// 首次用户手势时惰性创建 AudioContext（规避自动播放限制）；
// 顶栏「音效」按钮开关，状态持久化到 localStorage。
// ============================================================

export type SoundName =
  | 'place'    // 放置建筑：短促低木鱼
  | 'remove'   // 拆除：噪声碎裂
  | 'export'   // 单件出货：轻快双音
  | 'order'    // 订单完成：上行琶音
  | 'goal'     // 达成目标：五度双音
  | 'upgrade'  // 升级：上滑扫频
  | 'error';   // 拒绝操作：低频方波

interface Tone { f0: number; f1: number; dur: number; type: OscillatorType; vol: number }
interface Noise { dur: number; vol: number; cutoff: number }

const TONES: Record<SoundName, Tone[]> = {
  place:  [{ f0: 220, f1: 180, dur: 0.07, type: 'triangle', vol: 0.5 }],
  remove: [],
  export: [{ f0: 880, f1: 880, dur: 0.06, type: 'sine', vol: 0.35 }, { f0: 1318, f1: 1318, dur: 0.09, type: 'sine', vol: 0.3 }],
  order:  [
    { f0: 523, f1: 523, dur: 0.1, type: 'triangle', vol: 0.4 },
    { f0: 659, f1: 659, dur: 0.1, type: 'triangle', vol: 0.4 },
    { f0: 784, f1: 784, dur: 0.16, type: 'triangle', vol: 0.45 },
  ],
  goal:   [{ f0: 587, f1: 587, dur: 0.12, type: 'sine', vol: 0.4 }, { f0: 880, f1: 880, dur: 0.2, type: 'sine', vol: 0.4 }],
  upgrade:[{ f0: 300, f1: 900, dur: 0.22, type: 'sawtooth', vol: 0.22 }],
  error:  [{ f0: 130, f1: 110, dur: 0.14, type: 'square', vol: 0.25 }],
};
const NOISES: Partial<Record<SoundName, Noise>> = {
  remove: { dur: 0.16, vol: 0.4, cutoff: 1400 },
};

export class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastAt: Partial<Record<SoundName, number>> = {};
  enabled: boolean;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem('microfactory.sound'); } catch { /* Storage may be unavailable. */ }
    this.enabled = saved !== null ? saved === '1' : true; // 默认开启
  }

  /** 在首次用户手势中调用；之后幂等 */
  unlock() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // 预生成白噪声缓冲（拆除音效用）
      const len = Math.floor(this.ctx.sampleRate * 0.2);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch { /* 无音频设备时静默降级 */ }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem('microfactory.sound', on ? '1' : '0'); } catch { /* Keep the session preference. */ }
  }

  play(name: SoundName) {
    if (!this.enabled || !this.ctx || !this.master) return;
    // 同名音效节流：出货等高频事件最短 70ms 间隔
    const now = performance.now();
    if (now - (this.lastAt[name] || 0) < 70) return;
    this.lastAt[name] = now;
    try {
      const t0 = this.ctx.currentTime;
      for (const tone of TONES[name]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.f0, t0);
        if (tone.f1 !== tone.f0) osc.frequency.exponentialRampToValueAtTime(tone.f1, t0 + tone.dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(tone.vol, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
        osc.connect(gain).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + tone.dur + 0.02);
      }
      const noise = NOISES[name];
      if (noise && this.noiseBuf) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = noise.cutoff;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(noise.vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + noise.dur);
        src.connect(filter).connect(gain).connect(this.master);
        src.start(t0);
        src.stop(t0 + noise.dur + 0.02);
      }
    } catch { /* 任何音频异常都不影响游戏 */ }
  }
}
