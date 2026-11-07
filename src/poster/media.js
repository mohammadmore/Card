// موسیقی (ساخت ترکیبی در مرورگر، بدون فایل صوتی و بدون مشکل حق نشر یا فایل خود کاربر) و خروجی ویدیو:
// مسیر اول: WebCodecs (H.264 داخل MP4، با صدای AAC اگر مرورگر پشتیبانی کند) ← سازگار با اینستاگرام
// مسیر دوم: MediaRecorder (ضبط هم‌زمان؛ MP4 یا WebM) وقتی مسیر اول در دسترس نیست.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { prepare, renderFrame, clamp, seg } from './engine.js';

export const VIDEO_SECONDS = 8;
export const MOODS = ['celebration', 'calm', 'epic'];
const SR = 48000; // Opus فقط ۴۸ کیلوهرتز را قبول می‌کند؛ AAC هم با آن مشکلی ندارد
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** موسیقی کوتاه (هم‌مدت ویدیو) با OfflineAudioContext؛ لحظه‌ی «ضربه» (impact) هم‌زمان با ظاهر شدن کارت است. */
export const synthMusic = async (mood, seconds = VIDEO_SECONDS) => {
    const ctx = new OfflineAudioContext(2, Math.round(seconds * SR), SR);
    const master = ctx.createGain(); master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(0.62, 0.35); master.gain.setValueAtTime(0.62, seconds - 1.6); master.gain.linearRampToValueAtTime(0, seconds);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; master.connect(comp); comp.connect(ctx.destination);
    const noiseBuf = (() => { const b = ctx.createBuffer(1, SR * 2, SR); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
    const tone = (f, t, dur, { type = 'triangle', g = 0.1, a = 0.02, r = 0.3, lp = 0, detune = 0, pan = 0 } = {}) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.setValueAtTime(g, Math.max(t + a, t + dur - r)); e.gain.linearRampToValueAtTime(0.0001, t + dur);
        let n = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
        const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(e); e.connect(p); p.connect(master); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (t, dur, { type = 'highpass', f = 6000, g = 0.1, a = 0.005, f2 = 0 } = {}) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(fl); fl.connect(e); e.connect(master); s.start(t); s.stop(t + dur + 0.05);
    };
    const boom = (t, f0 = 120, f1 = 38, dur = 0.5, g = 0.9) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7); const e = ctx.createGain(); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(e); e.connect(master); o.start(t); o.stop(t + dur + 0.05); };
    const HIT = 1.3; // لحظه‌ی ظاهر شدن کارت

    if (mood === 'celebration') {
        const bpm = 124, beat = 60 / bpm; const prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
        prog.forEach((ch, i) => { const t0 = i * beat * 4; ch.forEach((n, k) => { tone(midi(n), t0, beat * 4.1, { type: 'sawtooth', g: 0.035, a: 0.06, r: 0.5, lp: 1700, detune: k * 5 - 5, pan: (k - 1) * 0.35 }); }); tone(midi(ch[0] - 24), t0, beat * 4, { type: 'sine', g: 0.2, a: 0.01, r: 0.2 }); });
        for (let s = 0; s < seconds / (beat / 2); s++) { const t = s * beat / 2; const ch = prog[Math.floor(t / (beat * 4)) % 4]; const n = ch[s % 3] + 12 + (s % 8 > 4 ? 12 : 0); if (t > 0.9) tone(midi(n), t, 0.22, { type: 'square', g: 0.03, a: 0.004, r: 0.15, lp: 2600, pan: s % 2 ? 0.3 : -0.3 }); }
        for (let b = 0; b * beat < seconds; b++) { const t = b * beat; if (t > 0.9) { boom(t, 140, 48, 0.28, 0.75); noise(t + beat / 2, 0.06, { g: 0.05 }); if (b % 2) noise(t, 0.16, { type: 'bandpass', f: 1800, g: 0.12 }); } }
        noise(0.1, HIT - 0.1, { type: 'bandpass', f: 400, f2: 6000, g: 0.22, a: 0.9 }); boom(HIT, 100, 32, 1.1, 1.0); noise(HIT, 1.4, { type: 'highpass', f: 5000, g: 0.14 }); [72, 76, 79, 84].forEach((n, i) => tone(midi(n), HIT + i * 0.07, 0.9, { type: 'sine', g: 0.05, a: 0.005, r: 0.7 }));
    } else if (mood === 'calm') {
        const prog = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]; const seg = seconds / 3.2; // Am F C G
        prog.forEach((ch, i) => { const t0 = i * seg * 0.8; ch.forEach((n, k) => { tone(midi(n), t0, seg * 1.15, { type: k % 2 ? 'sine' : 'triangle', g: 0.07, a: 0.7, r: 1.1, lp: 1200, pan: (k - 1.5) * 0.3 }); }); tone(midi(ch[0] - 24), t0, seg * 1.1, { type: 'sine', g: 0.16, a: 0.5, r: 1.0 }); });
        [81, 84, 88, 84, 79, 88, 91].forEach((n, i) => tone(midi(n), 0.9 + i * 0.95, 1.8, { type: 'sine', g: 0.04, a: 0.004, r: 1.6, pan: i % 2 ? 0.4 : -0.4 }));
        noise(0.2, HIT, { type: 'bandpass', f: 300, f2: 3000, g: 0.1, a: 0.9 }); tone(midi(96), HIT, 2.6, { type: 'sine', g: 0.05, a: 0.003, r: 2.2 }); boom(HIT, 80, 40, 1.4, 0.5);
    } else { // epic
        const beat = 0.6; const prog = [[50, 57, 62, 65], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]]; // Dm Bb F C
        tone(midi(26), 0, seconds, { type: 'sawtooth', g: 0.1, a: 1.2, r: 1.5, lp: 260 }); tone(midi(33), 0, seconds, { type: 'sawtooth', g: 0.07, a: 1.4, r: 1.5, lp: 320 });
        prog.forEach((ch, i) => { const t0 = i * 2.0; ch.forEach((n, k) => { [-9, 0, 9].forEach(dt => tone(midi(n + 12), t0, 2.2, { type: 'sawtooth', g: 0.018, a: 0.35, r: 0.6, lp: 1500 + i * 300, detune: dt + k, pan: (k - 1.5) * 0.3 })); }); });
        for (let b = 0; b * beat < seconds; b++) { const t = b * beat; if (t > HIT) { boom(t, 95, 40, 0.55, b % 4 === 0 ? 1 : 0.55); if (b % 2) noise(t, 0.2, { type: 'bandpass', f: 1500, g: 0.12 }); } }
        for (let k = 0; k < 14; k++) noise(0.15 + k * 0.08, 0.1, { type: 'bandpass', f: 900, g: 0.04 + k * 0.012 });
        noise(0.1, HIT - 0.1, { type: 'bandpass', f: 300, f2: 8000, g: 0.3, a: 1.0 }); boom(HIT, 90, 28, 1.6, 1.0); noise(HIT, 2.0, { type: 'highpass', f: 4200, g: 0.2 });
    }
    return ctx.startRendering();
};

/** فایل صوتی کاربر ← AudioBuffer هم‌طول ویدیو (حلقه/برش با محو شدن ابتدا و انتها). */
export const fitUserAudio = async (file, seconds = VIDEO_SECONDS) => {
    const ac = new (window.AudioContext || window.webkitAudioContext)(); let src; try { src = await ac.decodeAudioData(await file.arrayBuffer()); } finally { ac.close && ac.close(); }
    const ctx = new OfflineAudioContext(2, Math.round(seconds * SR), SR); const s = ctx.createBufferSource(); s.buffer = src; s.loop = true; const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, 0.4); g.gain.setValueAtTime(1, seconds - 1.4); g.gain.linearRampToValueAtTime(0, seconds); s.connect(g); g.connect(ctx.destination); s.start(0);
    return ctx.startRendering();
};

// ---------- ویدیو ----------
export const frameState = (i, n) => { const t = i / n; return { t, ui: clamp((t - 0.04) / 0.5), fx: seg(t, 0.16, 0.62) > 0 && seg(t, 0.16, 0.62) < 1 ? seg(t, 0.16, 0.62) : -1 }; };
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const tick = () => new Promise(r => setTimeout(r, 0));

/** کدک صدای قابل استفاده در MP4: AAC (سازگارترین با اینستاگرام) ← Opus ← هیچ‌کدام. null = بدون صدا ممکن نیست. */
export const pickAudioCodec = async () => {
    if (typeof AudioEncoder === 'undefined') return null;
    for (const [name, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) { try { const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: SR, numberOfChannels: 2, bitrate: 128000 }); if (r.supported) return { name, codec }; } catch (e) { } }
    return null;
};
export const canEncodeVideo = async (w, h) => { try { if (typeof VideoEncoder === 'undefined') return false; const v = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: w, height: h, bitrate: 5e6, framerate: 30 }); return !!v.supported; } catch (e) { return false; } };
const encodeWebCodecs = async (spec, { seconds, fps, audio, audioCodec, onProgress, signal }) => {
    const W = spec.W, H = spec.H, N = Math.round(seconds * fps); const canvas = document.createElement('canvas');
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, ...(audio ? { audio: { codec: audioCodec.name, sampleRate: SR, numberOfChannels: 2 } } : {}), fastStart: 'in-memory' });
    let fail = null; const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { fail = e; } });
    venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: Math.round(6e6 * (W * H) / (1080 * 1920)), framerate: fps, avc: { format: 'avc' } });
    for (let i = 0; i < N; i++) {
        if (signal && signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); if (fail) throw fail;
        renderFrame(canvas, spec, frameState(i, N)); const fr = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) }); venc.encode(fr, { keyFrame: i % fps === 0 }); fr.close();
        while (venc.encodeQueueSize > 6) await tick(); if (i % 2 === 0) { onProgress && onProgress(i / N * (audio ? 0.92 : 0.98)); await tick(); }
    }
    await venc.flush(); if (fail) throw fail;
    if (audio) {
        const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { fail = e; } }); aenc.configure({ codec: audioCodec.codec, sampleRate: SR, numberOfChannels: 2, bitrate: 128000 });
        const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0); const step = 3840;
        for (let p = 0; p < L.length; p += step) { const n = Math.min(step, L.length - p); const data = new Float32Array(n * 2); data.set(L.subarray(p, p + n), 0); data.set(R.subarray(p, p + n), n); const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(p / SR * 1e6), data }); aenc.encode(ad); ad.close(); }
        await aenc.flush(); if (fail) throw fail;
    }
    muxer.finalize(); onProgress && onProgress(1);
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', mime: 'video/mp4', method: audio ? `webcodecs+${audioCodec.name}` : 'webcodecs' };
};
const encodeRecorder = async (spec, { seconds, fps, audio, onProgress, signal }) => {
    if (typeof MediaRecorder === 'undefined') throw new Error('این مرورگر از ساخت ویدیو پشتیبانی نمی‌کند.');
    const canvas = document.createElement('canvas'); canvas.width = spec.W; canvas.height = spec.H; renderFrame(canvas, spec, frameState(0, 1));
    const stream = canvas.captureStream(fps); let ac = null, src = null;
    if (audio) { ac = new (window.AudioContext || window.webkitAudioContext)(); src = ac.createBufferSource(); src.buffer = audio; const dest = ac.createMediaStreamDestination(); src.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
    // «video/mp4» بدون کدک ممکن است VP9+Opus داخل MP4 بسازد که اینستاگرام نمی‌پذیرد؛ پس فقط با کدک صریح H.264 انتخاب می‌شود
    const mimes = audio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimes.find(m => MediaRecorder.isTypeSupported(m)); if (!mime) throw new Error('هیچ قالب ویدیویی پشتیبانی نمی‌شود.');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5e6, audioBitsPerSecond: 128000 }); const chunks = []; rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; }); rec.start(250); if (src) { await ac.resume(); src.start(); }
    const t0 = performance.now();
    await new Promise((resolve, reject) => { const loop = () => { if (signal && signal.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; } const el = (performance.now() - t0) / 1000; const t = Math.min(1, el / seconds); const n = 1000; renderFrame(canvas, spec, frameState(Math.round(t * n), n)); onProgress && onProgress(t); if (el >= seconds) resolve(); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }).catch(e => { try { rec.stop(); } catch (er) { } if (ac) ac.close(); throw e; });
    rec.stop(); await done; stream.getTracks().forEach(t => t.stop()); if (ac) ac.close();
    const type = mime.split(';')[0]; return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type, method: 'recorder' };
};
/**
 * ساخت ویدیو. input = همان ورودی prepare (بدون اندازه) ؛ quality: 'hd' (۱۰۸۰×۱۹۲۰) یا 'sd' (۷۲۰×۱۲۸۰)
 * اگر مسیر MP4 سازگار ممکن نباشد (مثلاً AAC در دسترس نیست) به ضبط هم‌زمان برمی‌گردد.
 */
export const exportVideo = async (input, { seconds = VIDEO_SECONDS, fps = 30, audio = null, quality = 'hd', onProgress, signal, forceRecorder = false } = {}) => {
    const w = quality === 'sd' ? 720 : 1080, h = quality === 'sd' ? 1280 : 1920; const spec = prepare({ ...input, kind: 'story', size: { w: even(w), h: even(h) } });
    if (!forceRecorder && await canEncodeVideo(spec.W, spec.H)) {
        const audioCodec = audio ? await pickAudioCodec() : null;
        if (!audio || audioCodec) { try { return await encodeWebCodecs(spec, { seconds, fps, audio, audioCodec, onProgress, signal }); } catch (e) { if (e && e.name === 'AbortError') throw e; console.warn('webcodecs failed, falling back', e); } }
    }
    return encodeRecorder(spec, { seconds, fps, audio, onProgress, signal });
};
