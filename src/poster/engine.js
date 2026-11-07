// موتور پوستر و استوری: کارت‌های رو و پشت (بوم) را در یک صحنه‌ی شبه‌سه‌بعدی با دوربین پرسپکتیو، ضخامت لبه، درخشش،
// سایه و بازتاب کف می‌گذارد. همه‌چیز فقط با بوم دوبعدی (بدون کتابخانه) و تابعی از زمان t است؛ پس هم تصویر ثابت
// (پوستر/استوری) و هم فریم‌های ویدیو از یک کد ساخته می‌شوند.

const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const rad = (d) => d * Math.PI / 180;
export const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export const SCENES = ['float', 'neon', 'fan', 'lanyard'];
export const SIZES = {
    story: { w: 1080, h: 1920, label: 'story' },
    feed: { w: 1080, h: 1350, label: 'feed' },
    square: { w: 1080, h: 1080, label: 'square' },
    a4: { w: 1654, h: 2339, label: 'a4' },
};

// ---------- رنگ ----------
const hexToRgb = (h) => { h = String(h || '#6366f1').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
};
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${Math.round(clamp(s) * 100)}%,${Math.round(clamp(l) * 100)}%,${a})`;
/** از یک رنگ پایه، همه‌ی رنگ‌های لازم صحنه ساخته می‌شود. */
export const palette = (rgb) => {
    let [h, s] = rgbToHsl(rgb); s = clamp(s, 0.38, 0.92);
    return { h, s, base: hsl(h, s, 0.5), deep: hsl(h, s * 0.9, 0.1), dark: hsl(h, s * 0.9, 0.22), mid: hsl(h, s, 0.4), light: hsl(h, s * 0.85, 0.8), pale: hsl(h, s * 0.6, 0.94), glow: hsl(h + 18, s, 0.62), accent: hsl(h + 48, Math.min(1, s + 0.1), 0.62), at: (a, l = 0.5) => hsl(h, s, l, a) };
};
/** رنگ غالب (پررنگ‌ترین و پرجمعیت‌ترین) یک تصویر. */
export const dominantColor = (canvas) => {
    try {
        const n = 24; const c = mk(n, n); const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, n, n); const d = x.getImageData(0, 0, n, n).data;
        const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue; const [h, s, l] = rgbToHsl([d[i], d[i + 1], d[i + 2]]); const w = s * (1 - Math.abs(l - 0.5) * 1.6);
            if (w <= 0.02) continue; const b = bins[Math.floor(h / 30) % 12]; b.w += w; b.r += d[i] * w; b.g += d[i + 1] * w; b.b += d[i + 2] * w;
        }
        const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
        if (best.w < 1.2) return [99, 102, 241]; // کارت تقریباً بی‌رنگ: آبی‌بنفش خنثی
        return [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)];
    } catch (e) { return [99, 102, 241]; }
};
const edgeColorOf = (canvas) => {
    try {
        const n = 20; const c = mk(n, n); const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, n, n); const d = x.getImageData(0, 0, n, n).data; let r = 0, g = 0, b = 0, k = 0;
        for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { if (xx > 1 && xx < n - 2 && yy > 1 && yy < n - 2) continue; const i = (yy * n + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
        return [r / k, g / k, b / k];
    } catch (e) { return [223, 227, 234]; }
};
const shade = ([r, g, b], f, a = 1) => { const t = f < 0 ? 0 : 255; const p = Math.abs(f); return `rgba(${Math.round((t - r) * p + r)},${Math.round((t - g) * p + g)},${Math.round((t - b) * p + b)},${a})`; };

// ---------- بافت کارت ----------
/** بوم کارت را (با سقف عرض) برای رسم آماده می‌کند. */
export const makeTex = (src, maxW = 1400) => {
    let c = src;
    if (src.width > maxW) { c = mk(maxW, Math.round(src.height * maxW / src.width)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); }
    return { c, w: c.width, h: c.height, ratio: c.height / c.width, r: Math.round(Math.min(c.width, c.height) * 0.045), edge: edgeColorOf(c), _refl: null, _dof: null };
};
const reflOf = (tex) => {
    if (tex._refl) return tex._refl; const w = Math.min(tex.w, 700); const h = Math.round(w * tex.ratio); const c = mk(w, h); const x = c.getContext('2d'); x.drawImage(tex.c, 0, 0, w, h);
    x.globalCompositeOperation = 'destination-in'; const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(0,0,0,0.34)'); g.addColorStop(0.42, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    return (tex._refl = c);
};
const dofOf = (tex) => { if (tex._dof) return tex._dof; const w = Math.max(24, Math.round(tex.w * 0.045)); const c = mk(w, Math.round(w * tex.ratio)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(tex.c, 0, 0, c.width, c.height); return (tex._dof = c); };
const roundRectPath = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const scratchPool = new Map();
const scratch = (w, h) => { const k = `${w}x${h}`; let c = scratchPool.get(k); if (!c) { c = mk(w, h); scratchPool.set(k, c); if (scratchPool.size > 8) scratchPool.delete(scratchPool.keys().next().value); } return c; };

// ---------- هندسه و دوربین ----------
const makeCam = (W, H) => ({ W, H, f: H * 0.92, cx: W / 2, cy: H / 2 });
const project = (cam, P) => { const z = Math.max(P[2], 1); const s = cam.f / z; return [cam.cx + P[0] * s, cam.cy + P[1] * s]; };
/** نقطه‌ی صفحه‌ی نمایش (sx, sy) در عمق z → مختصات جهان. */
const at = (cam, sx, sy, z) => [(sx - cam.cx) * z / cam.f, (sy - cam.cy) * z / cam.f, z];
const xformOf = (pose) => {
    const cy = Math.cos(rad(pose.yaw || 0)), sy = Math.sin(rad(pose.yaw || 0)), cp = Math.cos(rad(pose.pitch || 0)), sp = Math.sin(rad(pose.pitch || 0)), cr = Math.cos(rad(pose.roll || 0)), sr = Math.sin(rad(pose.roll || 0));
    const pv = pose.pivot || [0, 0]; const [px, py, pz] = pose.pos;
    return (lx, ly, lz = 0) => {
        const x = lx - pv[0], y = ly - pv[1], z = lz;
        const x1 = x * cr - y * sr, y1 = x * sr + y * cr; const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp; const x3 = x1 * cy + z2 * sy, z3 = -x1 * sy + z2 * cy;
        return [px + x3, py + y2, pz + z3];
    };
};
const outlineOf = (w, h, r, per = 7) => {
    const pts = []; const corners = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
    corners.forEach(([cx, cy, a0]) => { for (let i = 0; i <= per; i++) { const a = rad(a0 + 90 * i / per); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } });
    return pts;
};

// ---------- رسم مثلثی (تبدیل افاین هر مثلث) ----------
const tri = (ctx, img, s0, s1, s2, d0, d1, d2, sr) => {
    const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]); if (Math.abs(det) < 1e-6) return;
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const ex = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 1.3, p[1] + dy / l * 1.3]; };
    const a0 = ex(d0), a1 = ex(d1), a2 = ex(d2);
    ctx.save(); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.closePath(); ctx.clip();
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det, c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det, d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
    ctx.transform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
    ctx.drawImage(img, sr[0], sr[1], sr[2], sr[3], sr[0], sr[1], sr[2], sr[3]); ctx.restore();
};
/** تصویر را روی شبکه‌ای از نقاط پرسپکتیوشده می‌نشاند. grid(u,v) → [x,y] صفحه. */
const warp = (ctx, img, grid, cols, rows) => {
    const iw = img.width, ih = img.height; const P = [];
    for (let j = 0; j <= rows; j++) { P[j] = []; for (let i = 0; i <= cols; i++) P[j][i] = grid(i / cols, j / rows); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x0 = i / cols * iw, x1 = (i + 1) / cols * iw, y0 = j / rows * ih, y1 = (j + 1) / rows * ih; const px0 = Math.max(0, Math.floor(x0) - 2), py0 = Math.max(0, Math.floor(y0) - 2), px1 = Math.min(iw, Math.ceil(x1) + 2), py1 = Math.min(ih, Math.ceil(y1) + 2); const sr = [px0, py0, px1 - px0, py1 - py0];
        tri(ctx, img, [x0, y0], [x1, y0], [x0, y1], P[j][i], P[j][i + 1], P[j + 1][i], sr); tri(ctx, img, [x1, y0], [x1, y1], [x0, y1], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i], sr);
    }
};

// ---------- متریال و درخشش ----------
const applyLook = (c, W, H, o) => {
    const mat = o.material || 'gloss';
    if (mat === 'metal') { // خطوط نرم برس‌خورده + نور تیزتر
        c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.22; const g = c.createLinearGradient(0, 0, W, H * 0.4); for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    }
    if (mat === 'holo') { // رنگین‌کمان ملایم که با زاویه جابه‌جا می‌شود
        const sh = (o.sheen || 0) * 360; c.globalCompositeOperation = 'color-dodge'; c.globalAlpha = 0.34; const g = c.createLinearGradient(0, 0, W, H);
        for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(sh + i * 60) % 360},90%,58%)`); c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    }
    if (o.gloss != null && mat !== 'matte') { // نوار درخشش مایل
        const p = o.gloss; const bw = W * (mat === 'metal' ? 0.26 : 0.36); c.save(); c.translate(W / 2, H / 2); c.rotate(-0.38); c.translate(-W / 2, -H / 2);
        const x = p * W; const g = c.createLinearGradient(x - bw, 0, x + bw, 0); const a = o.glossAlpha ?? 0.5;
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalCompositeOperation = 'overlay'; c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
        const g2 = c.createLinearGradient(x - bw * 0.35, 0, x + bw * 0.35, 0); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, `rgba(255,255,255,${a * 0.34})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalCompositeOperation = 'source-over'; c.fillStyle = g2; c.fillRect(-W, -H, W * 3, H * 3); c.restore();
    }
    if (mat === 'matte') { c.globalCompositeOperation = 'source-over'; const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    c.globalCompositeOperation = 'source-over';
};
const faceImage = (tex, img, o) => {
    const W = img.width, H = img.height; const s = scratch(W, H); const c = s.getContext('2d'); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, H); c.drawImage(img, 0, 0, W, H);
    applyLook(c, W, H, o);
    if (o.slot) { // سوراخ آویز (پانچ) بالای کارت؛ با کارت جابه‌جا می‌شود چون جزو بافت است
        const sw = W * 0.15, sh = W * 0.03, sx = W / 2 - sw / 2, sy = W * 0.05; roundRectPath(c, sx, sy, sw, sh, sh / 2); const g = c.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, 'rgba(8,10,24,0.92)'); g.addColorStop(1, 'rgba(30,34,60,0.7)'); c.fillStyle = g; c.fill();
        c.save(); roundRectPath(c, sx, sy, sw, sh, sh / 2); c.clip(); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = sh * 0.5; c.stroke(); c.restore(); roundRectPath(c, sx - 1, sy - 1, sw + 2, sh + 2, sh / 2 + 1); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.4; c.stroke();
    }
    if (o.dim) { c.fillStyle = `rgba(4,6,18,${o.dim})`; c.fillRect(0, 0, W, H); }
    c.globalCompositeOperation = 'destination-in'; roundRectPath(c, 0, 0, W, H, tex.r * W / tex.w); c.fillStyle = '#000'; c.fill(); c.globalCompositeOperation = 'source-over';
    return s;
};
const softEllipse = (ctx, cx, cy, rx, ry, alpha, color = '0,0,0') => {
    if (rx < 1 || ry < 1 || alpha <= 0) return; ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(0.55, `rgba(${color},${alpha * 0.4})`); g.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
};

/**
 * یک کارت را می‌کشد. pose = { pos:[x,y,z], yaw, pitch, roll, w, pivot? }
 * o = { floorY, reflect, material, gloss, dim, dof, alpha, rim, glowColor, dropShadow:{dx,dy,blur,a}, sheen }
 * خروجی: چندضلعی خارجی کارت روی صفحه (برای سایه/درخشش)
 */
const drawCard = (ctx, cam, tex, backTex, pose, o = {}) => {
    const cw = pose.w, ch = cw * tex.ratio, t = Math.max(3, cw * 0.011); const r = cw * 0.045;
    const X = xformOf(pose); const n0 = X(0, 0, -1), n1 = X(0, 0, 0); const frontVisible = (n0[2] - n1[2]) < 0; const nz = Math.abs(n0[2] - n1[2]);
    const visTex = frontVisible || !backTex ? tex : backTex; const edge = tex.edge;
    const out = outlineOf(cw, ch, r); const poly = (lz) => out.map(([x, y]) => project(cam, X(x, y, lz)));
    const faceZ = frontVisible ? -t / 2 : t / 2; const facePoly = poly(faceZ);
    const alpha = o.alpha ?? 1; if (alpha <= 0.003) return facePoly;
    ctx.save(); ctx.globalAlpha = alpha;
    // سایه‌ی نرم روی دیوار/زمین (چندضلعی را بیرون از بوم می‌کشیم و فقط سایه‌اش دیده می‌شود)
    if (o.dropShadow) { const d = o.dropShadow; ctx.save(); ctx.shadowColor = `rgba(8,10,30,${d.a})`; ctx.shadowBlur = d.blur; ctx.shadowOffsetX = d.dx + 20000; ctx.shadowOffsetY = d.dy; ctx.translate(-20000, 0); ctx.beginPath(); facePoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore(); }
    // لبه (ضخامت): برش‌های پشت‌سرهم از دورترین تا نزدیک‌ترین
    if (nz < 0.985) {
        const S = 7; for (let k = 0; k <= S; k++) { const kk = frontVisible ? S - k : k; const lz = lerp(-t / 2, t / 2, kk / S); const p = poly(lz); ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fillStyle = shade(edge, lerp(-0.34, 0.12, kk / S)); ctx.fill(); }
    }
    // بازتاب کف
    // (قبل از خود کارت کشیده می‌شود تا کارت روی آن بنشیند)
    // روی صفحه
    let mnx = 1e9, mxx = -1e9; facePoly.forEach(q => { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); }); const cols = clamp(Math.round((mxx - mnx) / 55), 5, 18), rows = clamp(Math.round(cols * tex.ratio * 1.2), 4, 14);
    const img = faceImage(visTex, o.dof ? dofOf(visTex) : visTex.c, o);
    const sgn = frontVisible ? 1 : -1;
    warp(ctx, img, (u, v) => project(cam, X((u - 0.5) * cw * sgn, (v - 0.5) * ch, faceZ)), cols, rows);
    // لبه‌ی روشن و هموارکننده
    ctx.beginPath(); facePoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = shade(edge, -0.1, 0.75); ctx.lineWidth = 1.2; ctx.stroke();
    if (o.rim) { ctx.save(); ctx.shadowColor = o.glowColor || '#fff'; ctx.shadowBlur = cw * 0.04; ctx.strokeStyle = o.glowColor || '#fff'; ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = Math.max(1.6, cw * 0.004); ctx.stroke(); ctx.restore(); }
    else { const a = 0.14 + 0.38 * (1 - nz); ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = Math.max(1, cw * 0.0028); ctx.stroke(); }
    ctx.restore();
    return facePoly;
};
/**
 * بازتاب کف: کارت وارونه در یک لایه‌ی موقت «کدر» رسم می‌شود (تا هم‌پوشانی مثلث‌ها خط نیندازد)، سپس با ماسک محوشدگی
 * که از خط کف شروع می‌شود روی صحنه می‌نشیند.
 */
let reflLayer = null;
const reflectionLayer = (W, H) => { if (!reflLayer || reflLayer.width !== W || reflLayer.height !== H) reflLayer = mk(W, H); const c = reflLayer.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H); return c; };
const reflectInto = (lc, cam, tex, backTex, pose, floorY) => {
    const cw = pose.w, ch = cw * tex.ratio, t = Math.max(3, cw * 0.011); const X0 = xformOf(pose); const n0 = X0(0, 0, -1), n1 = X0(0, 0, 0); const frontVisible = (n0[2] - n1[2]) < 0;
    const vt = frontVisible || !backTex ? tex : backTex; const img = faceImage(vt, vt.c, { material: 'none', dim: pose.dimR || 0 }); const sgn = frontVisible ? 1 : -1; const lz = frontVisible ? -t / 2 : t / 2;
    const M = (P) => [P[0], 2 * floorY - P[1], P[2]]; lc.save(); lc.globalAlpha = pose.alpha ?? 1; warp(lc, img, (u, v) => project(cam, M(X0((u - 0.5) * cw * sgn, (v - 0.5) * ch, lz))), 10, 8); lc.restore();
};
const flushReflections = (ctx, W, H, floorScreen, strength, fadeLen) => {
    const lc = reflLayer.getContext('2d'); lc.globalCompositeOperation = 'destination-in'; const g = lc.createLinearGradient(0, floorScreen, 0, floorScreen + fadeLen);
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.22})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.fillRect(0, floorScreen - 4, W, fadeLen + 8); lc.fillRect(0, 0, W, 0);
    lc.globalCompositeOperation = 'destination-out'; lc.fillStyle = '#000'; lc.fillRect(0, 0, W, Math.max(0, floorScreen - 4)); lc.globalCompositeOperation = 'source-over'; ctx.drawImage(reflLayer, 0, 0);
};
const floorShadow = (ctx, cam, pose, tex, floorY, k = 1) => {
    const X = xformOf(pose); const c = project(cam, [pose.pos[0], floorY, pose.pos[2]]); const cw = pose.w * (cam.f / pose.pos[2]);
    const hgt = clamp((floorY - pose.pos[1]) / (pose.w * 1.2), 0.15, 1.2); const a = 0.5 / (0.7 + hgt);
    softEllipse(ctx, c[0], c[1], cw * 0.62 * k, cw * 0.075 * k * (cam.f / pose.pos[2]) * 0.0 + cw * 0.07, a * (pose.alpha ?? 1)); softEllipse(ctx, c[0], c[1] + cw * 0.012, cw * 0.95 * k, cw * 0.15, a * 0.32 * (pose.alpha ?? 1));
};

// ---------- پس‌زمینه ----------
const grain = (() => { let c = null; return () => { if (c) return c; c = mk(256, 256); const x = c.getContext('2d'); const id = x.createImageData(256, 256); const r = rng(7); for (let i = 0; i < id.data.length; i += 4) { const v = 110 + r() * 145; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); return c; }; })();
const bokeh = (ctx, W, H, pal, t, n, dark) => {
    const r = rng(11); for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, s = 28 + r() * 150, drift = Math.sin(t * TAU * 0.5 + i) * 14, a = (dark ? 0.05 : 0.07) + r() * 0.09; const hue = r() < 0.5 ? pal.light : pal.glow;
        const g = ctx.createRadialGradient(x, y + drift, 0, x, y + drift, s); g.addColorStop(0, hue.replace(/,[\d.]+\)$/, `,${a})`)); g.addColorStop(0.8, hue.replace(/,[\d.]+\)$/, `,${a * 0.7})`)); g.addColorStop(1, hue.replace(/,[\d.]+\)$/, ',0)')); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + drift, s, 0, TAU); ctx.fill();
    }
};
const backdrop = (ctx, W, H, spec, scene, t, floorLine) => {
    const pal = spec.pal; const bg = spec.bgInfo; ctx.save();
    if (bg.image) { const im = bg.image; const k = Math.max(W / im.width, H / im.height); ctx.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (scene === 'neon') { g.addColorStop(0, '#03040a'); g.addColorStop(0.55, pal.at(1, 0.07)); g.addColorStop(1, '#02030a'); }
    else if (scene === 'lanyard') { g.addColorStop(0, hsl(pal.h, pal.s * 0.55, 0.93)); g.addColorStop(1, hsl(pal.h, pal.s * 0.55, 0.78)); }
    else { g.addColorStop(0, pal.deep); g.addColorStop(0.5, pal.dark); g.addColorStop(1, pal.mid); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const gl = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, H * 0.62);
    if (scene === 'lanyard') { gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { gl.addColorStop(0, pal.at(scene === 'neon' ? 0.38 : 0.55, 0.55)); gl.addColorStop(1, pal.at(0, 0.5)); }
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    if (scene === 'neon') { // پرتوهای نور
        ctx.globalCompositeOperation = 'lighter'; [[0.18, 0.5], [0.5, 0.7], [0.82, 0.5]].forEach(([fx, fa], i) => { const x = W * fx, sway = Math.sin(t * TAU * 0.5 + i * 2) * 40; const b = ctx.createLinearGradient(x, 0, x, H * 0.9); b.addColorStop(0, pal.at(0.2 * fa, 0.6)); b.addColorStop(1, pal.at(0, 0.6)); ctx.fillStyle = b; ctx.beginPath(); ctx.moveTo(x - 20 + sway, 0); ctx.lineTo(x + 20 + sway, 0); ctx.lineTo(x + 220 + sway * 2, H * 0.9); ctx.lineTo(x - 220 + sway * 2, H * 0.9); ctx.closePath(); ctx.fill(); }); ctx.globalCompositeOperation = 'source-over';
    }
    if (scene === 'lanyard') { // لکه‌ی نور پنجره روی دیوار
        ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W * 0.92, 0); ctx.lineTo(W * 0.5, H); ctx.lineTo(W * 0.18, H); ctx.closePath(); ctx.fill(); ctx.restore();
    } else bokeh(ctx, W, H, pal, t, scene === 'neon' ? 10 : 16, scene !== 'lanyard');
    if (floorLine != null) { // کف
        const fg = ctx.createLinearGradient(0, floorLine, 0, H); fg.addColorStop(0, scene === 'neon' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.10)'); fg.addColorStop(0.25, 'rgba(0,0,0,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0.38)'); ctx.fillStyle = fg; ctx.fillRect(0, floorLine, W, H - floorLine);
        const hl = ctx.createLinearGradient(0, 0, W, 0); hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.5, 'rgba(255,255,255,0.28)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(0, floorLine - 1, W, 2);
    }
    ctx.restore();
};
const neonGrid = (ctx, cam, spec, floorY, t) => {
    const pal = spec.pal; ctx.save(); ctx.strokeStyle = pal.at(0.55, 0.62); ctx.lineWidth = Math.max(1.2, cam.W * 0.0016); ctx.shadowColor = pal.at(0.9, 0.6); ctx.shadowBlur = 10;
    const z0 = cam.f * 0.55, z1 = cam.f * 7; for (let i = -14; i <= 14; i++) { const x = i * cam.W * 0.22; const a = project(cam, [x, floorY, z0]), b = project(cam, [x, floorY, z1]); ctx.globalAlpha = 1 - Math.abs(i) / 16; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    const off = (t * 3.2) % 1; for (let k = 0; k < 14; k++) { const z = z0 * Math.pow(1.34, k + off); if (z > z1) break; const a = project(cam, [-cam.W * 4, floorY, z]), b = project(cam, [cam.W * 4, floorY, z]); ctx.globalAlpha = clamp(1 - k / 12) * 0.9; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.restore();
};
const sparks = (ctx, W, H, spec, t, dark) => { const r = rng(5); const pal = spec.pal; ctx.save(); ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'; for (let i = 0; i < 46; i++) { const x = r() * W, sp = 0.15 + r() * 0.35, y0 = r() * H, s = 1.5 + r() * 3.5; const y = (((y0 - t * sp * H) % H) + H) % H; ctx.globalAlpha = (0.25 + r() * 0.6) * (0.6 + 0.4 * Math.sin(t * TAU * 2 + i)); ctx.fillStyle = r() < 0.5 ? pal.light : '#fff'; ctx.beginPath(); ctx.arc(x + Math.sin(t * 3 + i) * 12, y, s, 0, TAU); ctx.fill(); } ctx.restore(); };
const confetti = (ctx, W, H, spec, tf) => { // tf: زمان از لحظه‌ی پرتاب (۰…۱)
    if (tf <= 0 || tf >= 1) return; const r = rng(23); const pal = spec.pal; const cols = [pal.light, pal.accent, '#fbbf24', '#ffffff', pal.glow, '#f472b6']; ctx.save();
    for (let i = 0; i < 56; i++) { const x0 = W * (0.08 + r() * 0.84), vy = 0.4 + r() * 0.6, vx = (r() - 0.5) * 0.5, sz = 10 + r() * 16, rot = r() * TAU, rs = (r() - 0.5) * 14, col = cols[Math.floor(r() * cols.length)]; const y = -60 + (H * 0.62) * vy * easeOut(tf) * 1.05 + tf * tf * H * 0.12; const x = x0 + vx * tf * W + Math.sin(tf * 9 + i) * 24; ctx.globalAlpha = clamp(1 - Math.max(0, tf - 0.7) / 0.3) * clamp((H * 0.655 - y) / (H * 0.06)); ctx.save(); ctx.translate(x, y); ctx.rotate(rot + rs * tf); ctx.scale(1, Math.cos(tf * 12 + i)); ctx.fillStyle = col; ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2); ctx.restore(); }
    ctx.restore();
};

// ---------- صحنه‌ها ----------
/** ناحیه‌ی هنر (stage) و اندازه‌ی پایه‌ی کارت */
const baseCard = (S, ratio, k = 0.82) => Math.min(S.w * k, (S.h * k) / ratio);
const sceneDuo = (ctx, cam, spec, t, S, neon) => {
    const { front, back, W, H } = spec; const f = cam.f; const cw0 = baseCard(S, front.ratio, neon ? 0.68 : 0.70);
    const cardH = cw0 * front.ratio; const yC = S.y + S.h * 0.46; const floorScreen = yC + cardH * 0.64 + cardH * 0.04; const floorY = (floorScreen - cam.cy); backdrop(ctx, W, H, spec, neon ? 'neon' : 'float', t, floorScreen - cardH * 0.06);
    if (neon) neonGrid(ctx, cam, spec, floorY, t);
    const A = easeOutBack(seg(t, 0, 0.16)), fade = easeOut(seg(t, 0, 0.08)), sway = Math.sin(t * TAU * 1.0);
    const bob = Math.sin(t * TAU * 2) * cw0 * 0.012; const holo = spec.material === 'holo' ? t : 0;
    // دو جایگاه: «جلو» و «عقب». تعویض بدون عبور کارت‌ها از داخل هم: کارت جلو اول به بیرون-چپ می‌لغزد، پشت صحنه عمقش عوض می‌شود
    // (خارج از دید)، سپس از چپ و از «پشتِ» کارت دیگر به جایگاه عقب می‌رسد؛ کارت عقب هم هم‌زمان جلو می‌آید.
    const slotFront = { x: cam.cx - S.w * 0.05, y: yC + cardH * 0.04, z: f * 0.97, yaw: -27 + sway * 6, pitch: 9 - sway * 1.5, roll: -2, w: cw0 };
    const slotBack = { x: cam.cx + S.w * 0.19, y: yC - S.h * 0.07, z: f * 1.2, yaw: 34 - sway * 3, pitch: 6, roll: 2, w: cw0 * 0.86 };
    const sw = seg(t, 0.46, 0.84); const prog = easeInOut(seg(sw, 0.42, 0.9)); const offX = cam.cx - S.w * 0.7;
    const outK = easeInOut(seg(sw, 0, 0.4)), inK = easeInOut(seg(sw, 0.55, 1)), ek = easeInOut(seg(sw, 0.3, 0.52)), behind = easeInOut(seg(sw, 0.35, 0.6));
    const pf = { x: sw < 0.5 ? lerp(slotFront.x, offX, outK) : lerp(offX, slotBack.x, inK), y: lerp(slotFront.y, slotBack.y, ek), z: lerp(slotFront.z, slotBack.z, ek) + f * 0.3 * Math.sin(Math.PI * inK), yaw: lerp(slotFront.yaw, slotBack.yaw, ek), pitch: lerp(slotFront.pitch, slotBack.pitch, ek), roll: lerp(slotFront.roll, slotBack.roll, ek), w: lerp(slotFront.w, slotBack.w, ek) };
    const pb = { x: lerp(slotBack.x, slotFront.x, prog), y: lerp(slotBack.y, slotFront.y, prog), z: lerp(slotBack.z, slotFront.z, prog), yaw: lerp(slotBack.yaw, slotFront.yaw, prog), pitch: lerp(slotBack.pitch, slotFront.pitch, prog), roll: lerp(slotBack.roll, slotFront.roll, prog), w: lerp(slotBack.w, slotFront.w, prog) };
    // ورود: کارت جلو از پایین و با چرخش می‌آید
    pf.y += (1 - easeOut(seg(t, 0, 0.16))) * H * 0.35; pf.yaw += (1 - A) * -55; pb.x += (1 - easeOut(seg(t, 0.06, 0.3))) * W * 0.5; const fadeB = easeOut(seg(t, 0.06, 0.2));
    const items = [
        { tex: front, back: null, p: pf, dim: lerp(0, 0.2, behind), dof: behind > 0.7, alpha: fade, g: 0.2 + 0.6 * seg(t, 0.12, 0.5), mat: spec.material },
        { tex: back, back: null, p: pb, dim: lerp(0.2, 0, prog), dof: prog < 0.3, alpha: fadeB, g: 0.2 + 0.6 * seg(t, 0.55, 0.9), mat: spec.material },
    ].map(it => ({ ...it, z: it.p.z })).sort((a, b) => b.z - a.z);
    const ctr = (it) => ({ pos: at(cam, it.p.x, it.p.y + bob * (it === items[0] ? 1 : -0.6), it.p.z), yaw: it.p.yaw, pitch: it.p.pitch, roll: it.p.roll, w: it.p.w, alpha: it.alpha });
    items.forEach(it => { const pose = ctr(it); pose.alpha = it.alpha; floorShadow(ctx, cam, pose, it.tex, floorY, neon ? 0.8 : 1); });
    { const lc = reflectionLayer(W, H); items.forEach(it => { const pose = ctr(it); pose.dimR = it.dim; reflectInto(lc, cam, it.tex, null, pose, floorY); }); flushReflections(ctx, W, H, floorScreen, neon ? 0.5 : 0.4, cardH * 0.7); }
    items.forEach(it => { const pose = ctr(it); drawCard(ctx, cam, it.tex, null, pose, { material: it.mat, gloss: it.g, dim: it.dim, dof: it.dof, alpha: it.alpha, rim: neon, glowColor: spec.pal.glow, sheen: holo + it.p.yaw / 360 }); });
    if (neon) sparks(ctx, W, H, spec, t, true);
};
const sceneFan = (ctx, cam, spec, t, S) => {
    const { front, back, prev, W, H } = spec; const f = cam.f; const cw0 = baseCard(S, front.ratio, 0.58);
    const cardHf = cw0 * front.ratio; const floorScreen = S.y + S.h * 0.5 + cardHf * 0.72; const floorY = floorScreen - cam.cy; backdrop(ctx, W, H, spec, 'fan', t, floorScreen - cardHf * 0.06);
    const open = easeOutBack(seg(t, 0.02, 0.34)), sway = Math.sin(t * TAU) , pop = easeInOut(seg(t, 0.5, 0.7)) * (1 - easeInOut(seg(t, 0.82, 1)));
    const cardH = cw0 * front.ratio; const yC = S.y + S.h * 0.5 - S.h * 0.04; const left = prev || null;
    const cards = [];
    const R = back; const Lt = left || null;
    const spread = S.w * (Lt ? 0.29 : 0.20) * open;
    if (Lt) cards.push({ tex: Lt, p: { x: cam.cx - spread, y: yC + cardH * 0.06, z: f * 1.16, yaw: 30 * open, pitch: 6, roll: -9 * open, w: cw0 * 0.8 }, dim: 0.28, dof: true, role: 'prev' });
    cards.push({ tex: R, p: { x: cam.cx + spread * (Lt ? 1 : 1), y: yC + cardH * 0.04, z: f * 1.16, yaw: -30 * open, pitch: 6, roll: 9 * open, w: cw0 * 0.8 }, dim: 0.12, dof: false, role: 'back' });
    cards.push({ tex: front, p: { x: cam.cx - (Lt ? 0 : spread * 0.55), y: yC - cardH * 0.02 - pop * cardH * 0.04, z: f * (0.9 - pop * 0.05), yaw: -4 + sway * 3.5, pitch: 6 - sway, roll: 0, w: cw0 * (1 + pop * 0.04) }, dim: 0, dof: false, role: 'front' });
    const fade = easeOut(seg(t, 0, 0.1)); const holo = spec.material === 'holo' ? t : 0;
    cards.forEach(c => { c.pose = { pos: at(cam, c.p.x, c.p.y + (1 - open) * H * 0.2, c.p.z), yaw: c.p.yaw, pitch: c.p.pitch, roll: c.p.roll, w: c.p.w, alpha: fade }; });
    const order = [...cards].sort((a, b) => b.p.z - a.p.z);
    order.forEach(c => floorShadow(ctx, cam, c.pose, c.tex, floorY, 0.9)); { const lc = reflectionLayer(W, H); order.forEach(c => { c.pose.dimR = c.dim; reflectInto(lc, cam, c.tex, null, c.pose, floorY); }); flushReflections(ctx, W, H, floorScreen, 0.4, cardHf * 0.7); }
    order.forEach(c => drawCard(ctx, cam, c.tex, null, c.pose, { material: spec.material, gloss: c.role === 'front' ? 0.15 + 0.85 * seg(t, 0.3, 0.75) : null, dim: c.dim, dof: c.dof, alpha: fade, sheen: holo + c.p.yaw / 300 }));
    // مسیر نور بین رده‌ی قبلی و جدید
    if (Lt) { ctx.save(); const a = project(cam, c3(cam, cards[0], 0.62)), b = project(cam, c3(cam, cards[2], -0.3)); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, spec.pal.at(0, 0.6)); g.addColorStop(0.5, spec.pal.at(0.55 * seg(t, 0.2, 0.4), 0.7)); g.addColorStop(1, spec.pal.at(0, 0.6)); ctx.strokeStyle = g; ctx.lineWidth = cw0 * 0.02; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1] - cw0 * 0.28); ctx.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - cw0 * 0.62, b[0], b[1] - cw0 * 0.28); ctx.stroke(); ctx.restore(); }
};
const c3 = (cam, c, k) => [c.pose.pos[0] + k * c.pose.w * 0.5, c.pose.pos[1], c.pose.pos[2]];
/** چندضلعی در مختصات محلی کارت (صفحه‌ی z=0) را با همان تبدیل کارت به صفحه می‌برد؛ پس سخت‌افزار با کارت حرکت می‌کند. */
const projPoly = (cam, X, pts) => pts.map(([x, y]) => project(cam, X(x, y, 0)));
const pathOf = (ctx, p) => { ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); };
const rrPts = (cx, cy, w, h, r) => outlineOf(w, h, r, 5).map(([x, y]) => [x + cx, y + cy]);
const metalStroke = (ctx, p, lw) => { pathOf(ctx, p); ctx.lineJoin = 'round'; ctx.strokeStyle = '#475569'; ctx.lineWidth = lw; ctx.stroke(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = lw * 0.62; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = lw * 0.18; ctx.stroke(); };
const sceneLanyard = (ctx, cam, spec, t, S) => {
    const { front, back, W, H } = spec; const f = cam.f; const cw0 = baseCard(S, front.ratio, 0.9); const ch = cw0 * front.ratio;
    backdrop(ctx, W, H, spec, 'lanyard', t, null); const pal = spec.pal;
    const drop = easeOutBack(seg(t, 0, 0.18)); const decay = Math.exp(-3.0 * seg(t, 0.12, 1)); const swing = Math.sin(seg(t, 0.1, 1) * TAU * 2.4) * 9 * decay;
    const flipK = easeInOut(seg(t, 0.46, 0.72)); const yaw = -14 + flipK * 180 + Math.sin(t * TAU) * 4; const roll = swing;
    // کل مجموعه (بند، گیره و کارت) یک پاندول سخت است که از نقطه‌ای بالای قاب آویزان شده
    const rise = (1 - drop) * -S.h * 0.55; const topY = S.y + S.h * 0.02; const pivY = -cw0 * 0.45; const Lpx = topY - pivY;
    const pose = { pos: at(cam, cam.cx, pivY + rise, f), yaw, pitch: 2, roll, w: cw0, pivot: [0, -ch / 2 - Lpx], alpha: easeOut(seg(t, 0, 0.06)) };
    const X = xformOf(pose); const sc = f / pose.pos[2]; const lw = cw0 * 0.02 * sc; const slotY = -ch / 2 + cw0 * 0.065;
    const holo = spec.material === 'holo' ? t : 0;
    const clasp = { cy: slotY - cw0 * 0.075 + cw0 * 0.012, w: cw0 * 0.1, h: cw0 * 0.17 }; const eyeY = clasp.cy - clasp.h / 2 - cw0 * 0.026;
    ctx.save(); ctx.globalAlpha = pose.alpha;
    // بند
    { const ws = cw0 * 0.115, y0 = -ch / 2 - Lpx, y1 = eyeY - cw0 * 0.02; const strap = projPoly(cam, X, [[-ws / 2, y0], [ws / 2, y0], [ws / 2, y1], [-ws / 2, y1]]);
      pathOf(ctx, strap); ctx.shadowColor = 'rgba(15,23,42,0.28)'; ctx.shadowBlur = 14; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 12; const g = ctx.createLinearGradient(strap[0][0], 0, strap[1][0], 0); g.addColorStop(0, pal.at(1, 0.3)); g.addColorStop(0.5, pal.at(1, 0.4)); g.addColorStop(1, pal.at(1, 0.3)); ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = 'transparent';
      [-0.36, 0.36].forEach(k => { const a = projPoly(cam, X, [[ws * k, y0], [ws * k, y1]]); ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); ctx.lineTo(a[1][0], a[1][1]); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1.5, lw * 0.18); ctx.stroke(); });
      // نقطه‌چین دوخت وسط بند
      const mid = projPoly(cam, X, [[0, y0], [0, y1]]); ctx.beginPath(); ctx.moveTo(mid[0][0], mid[0][1]); ctx.lineTo(mid[1][0], mid[1][1]); ctx.setLineDash([lw * 0.9, lw * 1.2]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1.5, lw * 0.14); ctx.stroke(); ctx.setLineDash([]);
      // سردوخت فلزی
      const cr = projPoly(cam, X, rrPts(0, y1 - cw0 * 0.012, ws * 1.12, cw0 * 0.05, cw0 * 0.014)); pathOf(ctx, cr); const cg = ctx.createLinearGradient(cr[0][0], 0, cr[2][0], 0); cg.addColorStop(0, '#f1f5f9'); cg.addColorStop(0.5, '#94a3b8'); cg.addColorStop(1, '#e2e8f0'); ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.restore();
    drawCard(ctx, cam, front, back, pose, { material: spec.material, gloss: 0.1 + 0.9 * seg(t, 0.25, 0.8), alpha: pose.alpha, slot: true, dropShadow: { dx: 26, dy: 40, blur: 46, a: 0.34 }, sheen: holo + yaw / 360 });
    // حلقه و گیره‌ی فلزی که از سوراخ کارت رد می‌شود (با کارت می‌چرخد)
    ctx.save(); ctx.globalAlpha = pose.alpha;
    metalStroke(ctx, projPoly(cam, X, outlineOf(cw0 * 0.052, cw0 * 0.052, cw0 * 0.026, 6).map(([x, y]) => [x, y + eyeY + cw0 * 0.003])), lw * 0.8);
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4; metalStroke(ctx, projPoly(cam, X, rrPts(0, clasp.cy, clasp.w, clasp.h, clasp.w * 0.5)), lw);
    ctx.restore();
};

// ---------- لایه‌ی متن و QR ----------
export const TEXTS = {
    fa: { promoted: 'ارتقا رده', newCard: 'کارت جدید', from: 'از', to: 'به', scan: 'برای تأیید اصالت اسکن کنید', rankNew: 'رده‌ی جدید', verified: 'تأییدشده' },
    en: { promoted: 'PROMOTED', newCard: 'NEW CARD', from: 'from', to: 'to', scan: 'Scan to verify', rankNew: 'New rank', verified: 'Verified' },
    ar: { promoted: 'ترقية', newCard: 'بطاقة جديدة', from: 'من', to: 'إلى', scan: 'امسح للتحقق', rankNew: 'الرتبة الجديدة', verified: 'موثّق' },
    tr: { promoted: 'TERFİ', newCard: 'YENİ KART', from: '', to: '', scan: 'Doğrulamak için tara', rankNew: 'Yeni rütbe', verified: 'Doğrulandı' },
};
const fitFont = (ctx, text, maxW, size, weight = 800, min = 22) => { let s = size; do { ctx.font = `${weight} ${s}px Vazirmatn, Tahoma, sans-serif`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > min); return s; };
const pill = (ctx, cx, cy, text, o) => {
    const size = o.size; ctx.font = `${o.weight || 800} ${size}px Vazirmatn, Tahoma, sans-serif`; const w = ctx.measureText(text).width + size * 1.5, h = size * 1.75; roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = o.bg; ctx.fill(); if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = o.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + size * 0.06); return w;
};
const layoutOf = (kind, W, H) => {
    const u = W / 1080;
    if (kind === 'story') return { stage: { x: 0, y: H * 0.17, w: W, h: H * 0.385 }, logo: { x: W / 2, y: H * 0.085, s: 104 * u }, badgeY: H * 0.598, nameY: H * 0.651, rankY: H * 0.703, dateY: H * 0.745, qrY: H * 0.801, qrS: H * 0.058, unit: u };
    const tall = H / W > 1.3; return { stage: { x: 0, y: H * (tall ? 0.135 : 0.16), w: W, h: H * (tall ? 0.46 : 0.43) }, logo: { x: W / 2, y: H * 0.062, s: 104 * u }, badgeY: -1, nameY: H * (tall ? 0.665 : 0.69), rankY: H * (tall ? 0.725 : 0.75), dateY: H * (tall ? 0.77 : 0.795), qrY: H * (tall ? 0.86 : 0.875), qrS: H * (tall ? 0.058 : 0.07), unit: u };
};
const drawOverlay = (ctx, spec, ui, dark) => {
    const { W, H, kind } = spec; const L = layoutOf(kind, W, H); const u = L.unit; const T = { ...(TEXTS[spec.lang] || TEXTS.en), ...(spec.labels || {}) }; const rtl = spec.lang === 'fa' || spec.lang === 'ar'; const tx = spec.texts; const pal = spec.pal;
    const fg = dark ? '#ffffff' : '#0f172a', sub = dark ? 'rgba(255,255,255,0.74)' : 'rgba(15,23,42,0.66)'; ctx.save(); ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const appear = (a, b) => easeOut(seg(ui, a, b)); const slide = (a, b) => (1 - appear(a, b)) * 36 * u;
    // لوگو (در صحنه‌ی آویز، کنار بالا-چپ تا با بند برخورد نکند)
    const lg = dark ? (spec.logoDark || spec.logo) : spec.logo; const lan = spec.scene === 'lanyard';
    if (lg || tx.orgName) { ctx.save(); ctx.globalAlpha = appear(0.02, 0.14); const ls = (lan ? 84 : 104) * u; const lx = lan ? W * 0.13 : W / 2, ly = lan ? H * 0.07 : L.logo.y;
        if (lg) { const k = Math.min(ls / lg.width, ls / lg.height); const lw = lg.width * k, lh = lg.height * k; ctx.drawImage(lg, lx - lw / 2, ly - lh / 2, lw, lh); }
        if (tx.orgName && kind !== 'story' && !lan) { ctx.fillStyle = sub; const s = fitFont(ctx, tx.orgName, W * 0.8, 38 * u, 700); ctx.font = `700 ${s}px Vazirmatn, Tahoma`; ctx.fillText(tx.orgName, W / 2, ly + (lg ? 78 * u : 0)); } ctx.restore(); }
    // نشان «ارتقا رده» درست بالای نام
    if (kind === 'story' && L.badgeY > 0) { ctx.save(); ctx.globalAlpha = appear(0.06, 0.2); const label = tx.rankNew ? T.promoted : T.newCard; pill(ctx, W / 2, L.badgeY + slide(0.06, 0.2) * 0.5, label, { size: 36 * u, bg: pal.at(1, 0.5), fg: '#fff', weight: 900 }); ctx.restore(); }
    // نام
    if (tx.name) { ctx.save(); ctx.globalAlpha = appear(0.34, 0.5); ctx.fillStyle = fg; const s = fitFont(ctx, tx.name, W * 0.86, (kind === 'story' ? 96 : 80) * u, 900); ctx.font = `900 ${s}px Vazirmatn, Tahoma`; ctx.fillText(tx.name, W / 2, L.nameY + slide(0.34, 0.5)); ctx.restore(); }
    // رده‌ها
    if (tx.rankNew) {
        ctx.save(); ctx.globalAlpha = appear(0.44, 0.6); const y = L.rankY + slide(0.44, 0.6); const sz = 44 * u; const chipNew = { size: sz, bg: pal.at(1, 0.52), fg: '#fff', weight: 900 };
        if (tx.rankOld && kind === 'story') {
            ctx.font = `800 ${sz}px Vazirmatn, Tahoma`; const wOld = ctx.measureText(tx.rankOld).width + sz * 1.5, wNew = ctx.measureText(tx.rankNew).width + sz * 1.5, gap = 92 * u; const total = wOld + wNew + gap; const first = rtl ? 1 : -1;
            const xOld = W / 2 + first * (total / 2 - wOld / 2), xNew = W / 2 - first * (total / 2 - wNew / 2);
            pill(ctx, xOld, y, tx.rankOld, { size: sz, bg: dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)', fg: sub, stroke: dark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.25)', weight: 700 });
            pill(ctx, xNew, y, tx.rankNew, chipNew);
            ctx.strokeStyle = fg; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.globalAlpha *= 0.85; const ax = W / 2, d = 22 * u * (rtl ? -1 : 1); ctx.beginPath(); ctx.moveTo(ax - d, y); ctx.lineTo(ax + d, y); ctx.moveTo(ax + d - Math.sign(d) * 14 * u, y - 14 * u); ctx.lineTo(ax + d, y); ctx.lineTo(ax + d - Math.sign(d) * 14 * u, y + 14 * u); ctx.stroke();
        } else pill(ctx, W / 2, y, tx.rankNew, chipNew);
        ctx.restore();
    }
    // تاریخ و سازمان
    if (tx.date || (kind === 'story' && tx.orgName)) { ctx.save(); ctx.globalAlpha = appear(0.52, 0.68); ctx.fillStyle = sub; ctx.font = `600 ${34 * u}px Vazirmatn, Tahoma`; ctx.fillText([tx.date, kind === 'story' ? tx.orgName : ''].filter(Boolean).join('  ·  '), W / 2, L.dateY + slide(0.52, 0.68)); ctx.restore(); }
    // QR: مربع QR کنار توضیحش (در یک ردیف، تا از حاشیه‌ی امن استوری بیرون نزند)
    if (spec.qr) { ctx.save(); ctx.globalAlpha = appear(0.62, 0.8); const q = L.qrS, pad = 12 * u; ctx.font = `600 ${27 * u}px Vazirmatn, Tahoma`; const tw = ctx.measureText(T.scan).width; const gap = 26 * u; const total = q + 2 * pad + gap + tw; const y = L.qrY + slide(0.62, 0.8);
        const qx = rtl ? W / 2 + total / 2 - q - pad : W / 2 - total / 2 + pad; roundRectPath(ctx, qx - pad, y - q / 2 - pad, q + 2 * pad, q + 2 * pad, 18 * u); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 22 * u; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.drawImage(spec.qr, qx, y - q / 2, q, q);
        ctx.fillStyle = sub; ctx.textAlign = rtl ? 'right' : 'left'; ctx.fillText(T.scan, rtl ? qx - pad - gap : qx + q + pad + gap, y); ctx.restore(); }
    ctx.restore();
};

// ---------- ورودی اصلی ----------
const SCENE_DARK = { float: true, neon: true, fan: true, lanyard: false };
/** آماده‌سازی داده‌های ثابت (یک بار)؛ سپس renderFrame با زمان‌های مختلف. */
export const prepare = (input) => {
    const spec = { ...input }; const size = input.size; spec.W = size.w; spec.H = size.h;
    const bg = input.bg || { mode: 'auto' }; spec.bgInfo = bg;
    let rgb; if (bg.mode === 'custom' && bg.c1) rgb = hexToRgb(bg.c1); else if (bg.mode === 'theme' && bg.theme) rgb = hexToRgb(bg.theme.c3); else rgb = dominantColor(input.front.c);
    if (bg.override) rgb = hexToRgb(bg.override);
    spec.pal = palette(rgb); spec.qr = input.qr || null; spec.texts = input.texts || {}; spec.labels = input.labels || {}; spec.lang = input.lang || 'fa'; spec.material = input.material || 'gloss'; spec.kind = input.kind || 'story';
    return spec;
};
/**
 * @param t   زمان حرکت صحنه (۰…۱)
 * @param ui  زمان ظاهر شدن متن‌ها (۰…۱)
 * @param fx  زمان کنفتی (۰…۱؛ خارج از بازه = خاموش)
 */
export const renderFrame = (canvas, spec, { t = 0.6, ui = 1, fx = -1 } = {}) => {
    const W = spec.W, H = spec.H; if (canvas.width !== W) canvas.width = W; if (canvas.height !== H) canvas.height = H; const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const cam = makeCam(W, H); const L = layoutOf(spec.kind, W, H); const S = L.stage; const scene = spec.scene || 'float';
    if (scene === 'neon') sceneDuo(ctx, cam, spec, t, S, true); else if (scene === 'fan') sceneFan(ctx, cam, spec, t, S); else if (scene === 'lanyard') sceneLanyard(ctx, cam, spec, t, S); else sceneDuo(ctx, cam, spec, t, S, false);
    const dark = SCENE_DARK[scene] !== false;
    if (fx >= 0 && spec.kind === 'story' && scene !== 'neon') confetti(ctx, W, H, spec, fx);
    // حاشیه‌ی تیره و دانه‌ی فیلم
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${dark ? 0.38 : 0.16})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay'; const gp = ctx.createPattern(grain(), 'repeat'); ctx.fillStyle = gp; ctx.fillRect(0, 0, W, H); ctx.restore();
    drawOverlay(ctx, spec, ui, dark);
    return canvas;
};
export const STILL = { float: 0.3, neon: 0.36, fan: 0.52, lanyard: 0.4 };
