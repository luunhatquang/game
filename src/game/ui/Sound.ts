/**
 * Âm thanh tổng hợp bằng WebAudio (project chưa có file âm thanh).
 * Mỗi âm: danh sách nốt [tần số Hz, thời lượng s], dạng sóng.
 */
const SOUNDS: Record<string, { notes: [number, number][]; wave: OscillatorType; vol: number }> = {
    select: { notes: [[660, 0.04]], wave: 'square', vol: 0.04 },
    order: { notes: [[520, 0.05], [700, 0.05]], wave: 'square', vol: 0.04 },
    attack: { notes: [[300, 0.06], [220, 0.08]], wave: 'sawtooth', vol: 0.05 },
    place: { notes: [[400, 0.06], [600, 0.08]], wave: 'triangle', vol: 0.08 },
    error: { notes: [[200, 0.12]], wave: 'square', vol: 0.05 },
    built: { notes: [[523, 0.08], [659, 0.08], [784, 0.12]], wave: 'triangle', vol: 0.08 },
    trained: { notes: [[600, 0.06], [900, 0.08]], wave: 'triangle', vol: 0.06 },
    alert: { notes: [[880, 0.12], [660, 0.12], [880, 0.12], [660, 0.12]], wave: 'square', vol: 0.06 },
    age: { notes: [[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.25]], wave: 'triangle', vol: 0.1 },
    victory: { notes: [[523, 0.15], [659, 0.15], [784, 0.15], [1046, 0.4]], wave: 'triangle', vol: 0.1 },
    defeat: { notes: [[392, 0.25], [330, 0.25], [262, 0.5]], wave: 'triangle', vol: 0.1 },
    hit: { notes: [[140, 0.03]], wave: 'square', vol: 0.025 },
};

export class Sound {
    muted = false;
    private ctx: AudioContext | null = null;
    private last = new Map<string, number>();

    play(name: string, minGap = 0.08): void {
        if (this.muted) return;
        const def = SOUNDS[name];
        if (!def) return;
        try {
            this.ctx ??= new AudioContext();
        } catch {
            return;
        }
        const ctx = this.ctx;
        if (ctx.state === 'suspended') void ctx.resume();
        const now = ctx.currentTime;
        if (now - (this.last.get(name) ?? -1) < minGap) return;
        this.last.set(name, now);
        let t = now;
        for (const [freq, dur] of def.notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = def.wave;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(def.vol, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + dur);
            t += dur;
        }
    }
}
