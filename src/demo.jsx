// دموی زنده‌ی صفحه‌ی معرفی: بازدیدکننده نام و سمت (و اگر خواست عکس) را می‌نویسد و کارت نمونه همان‌جا،
// روی دستگاه خودش، ساخته و به‌صورت سه‌بعدی نمایش داده می‌شود. هیچ داده‌ای به سرور فرستاده نمی‌شود.
// فقط وقتی دکمه زده شود بارگذاری می‌شود (React، آیکون‌ها، QRious و همین فایل).
import { CardShowcase3D } from './showcase.jsx';

const W = 1012, H = 638; // نسبت کارت استاندارد CR80 (۸۵٫۶ × ۵۴ میلی‌متر)

const Icon = ({ name, className = 'w-4 h-4' }) => {
    const node = window.lucide && (window.lucide.icons[name] || window.lucide.icons[name[0].toLowerCase() + name.slice(1)]);
    const kids = Array.isArray(node) ? (node[0] === 'svg' ? node[2] : node) : [];
    const html = kids.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs || {}).map(([k, v]) => `${k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}="${v}"`).join(' ')}/>`).join('');
    return <span aria-hidden="true" className="inline-flex" dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">${html}</svg>` }} />;
};

const loadImage = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
const faDigits = (s) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
/** متن را در عرض مشخص جا می‌دهد (اندازه‌ی فونت را کم می‌کند). */
const fitText = (ctx, text, maxW, size, weight) => { let s = size; do { ctx.font = `${weight} ${s}px Vazirmatn`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > 18); return s; };
/** عکس به‌صورت cover در قاب. */
const drawCover = (ctx, img, x, y, w, h) => { const r = Math.max(w / img.width, h / img.height); const sw = w / r, sh = h / r; ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); };

function drawFront({ name, role, photo, logo, lang, org, colors }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const rtl = lang === 'fa';
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, colors.c3); g.addColorStop(1, colors.c2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // نقش‌های تزئینی
    ctx.globalAlpha = .16; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(rtl ? 120 : W - 120, -60, 300, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rtl ? W + 40 : -40, H + 30, 260, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .10; ctx.beginPath(); ctx.moveTo(0, H * .72); ctx.bezierCurveTo(W * .3, H * .55, W * .6, H * .95, W, H * .7); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.globalAlpha = 1;
    // سربرگ: لوگو و نام سازمان
    const pad = 54; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    let hx = rtl ? W - pad : pad;
    if (logo) { const s = 70; const lx = rtl ? W - pad - s : pad; ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.92)'; roundRect(ctx, lx - 6, pad - 6, s + 12, s + 12, 18); ctx.fill(); ctx.restore(); ctx.drawImage(logo, lx, pad, s, s); hx = rtl ? lx - 24 : lx + s + 24; }
    ctx.textAlign = rtl ? 'right' : 'left'; ctx.font = '800 34px Vazirmatn'; ctx.fillText(org, hx, pad + 26);
    ctx.font = '500 21px Vazirmatn'; ctx.globalAlpha = .85; ctx.fillText(rtl ? 'کارت شناسایی' : 'IDENTITY CARD', hx, pad + 62); ctx.globalAlpha = 1;
    // قاب عکس
    const pw = 230, ph = 290, px = rtl ? pad : W - pad - pw, py = 200;
    ctx.save(); ctx.shadowColor = 'rgba(15,23,42,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = '#fff'; roundRect(ctx, px - 8, py - 8, pw + 16, ph + 16, 28); ctx.fill(); ctx.restore();
    ctx.save(); roundRect(ctx, px, py, pw, ph, 22); ctx.clip();
    if (photo) drawCover(ctx, photo, px, py, pw, ph);
    else { const pg = ctx.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, '#e2e8f0'); pg.addColorStop(1, '#cbd5e1'); ctx.fillStyle = pg; ctx.fillRect(px, py, pw, ph); ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(px + pw / 2, py + ph * .38, 58, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph + 30, 112, 120, 0, Math.PI, 0); ctx.fill(); }
    ctx.restore();
    // نام، سمت و شماره
    const tx = rtl ? W - pad : pad; const maxW = W - pw - pad * 3;
    ctx.textAlign = rtl ? 'right' : 'left'; ctx.fillStyle = '#fff';
    const ns = fitText(ctx, name, maxW, 60, 900); ctx.font = `900 ${ns}px Vazirmatn`; ctx.fillText(name, tx, 300);
    const rs = fitText(ctx, role, maxW, 34, 600); ctx.font = `600 ${rs}px Vazirmatn`; ctx.globalAlpha = .9; ctx.fillText(role, tx, 368); ctx.globalAlpha = 1;
    const id = '1405-' + String(Math.floor(1000 + Math.random() * 9000));
    ctx.font = '500 24px Vazirmatn'; ctx.globalAlpha = .8; ctx.fillText(rtl ? `شماره کارت: ${faDigits(id)}` : `Card No. ${id}`, tx, 430); ctx.globalAlpha = 1;
    // واترمارک «نمونه»
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.32); ctx.font = '900 150px Vazirmatn'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fillText(rtl ? 'نمونه' : 'SAMPLE', 0, 0); ctx.restore();
    return c;
}

function drawBack({ lang, org, colors, siteUrl }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const rtl = lang === 'fa';
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, colors.c3); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .12; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(rtl ? 0 : W, H, 120 + i * 70, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // QR (لینک صفحه‌ی معرفی)
    const qs = 250, qx = rtl ? 70 : W - 70 - qs, qy = (H - qs) / 2;
    ctx.fillStyle = '#fff'; roundRect(ctx, qx - 18, qy - 18, qs + 36, qs + 36, 26); ctx.fill();
    try { if (window.QRious) { const q = new window.QRious({ value: siteUrl, size: qs, level: 'M', foreground: '#1e1b4b', background: '#ffffff' }); ctx.drawImage(q.canvas || q.image, qx, qy, qs, qs); } } catch (e) { }
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.textAlign = rtl ? 'right' : 'left';
    const tx = rtl ? W - 70 : 70; const maxW = W - qs - 200;
    const os = fitText(ctx, org, maxW, 40, 800); ctx.font = `800 ${os}px Vazirmatn`; ctx.fillText(org, tx, 210);
    ctx.font = '500 25px Vazirmatn'; ctx.globalAlpha = .85;
    const lines = rtl ? ['این کارت نمونه است و اعتبار رسمی ندارد.', 'با اسکن QR، اعتبار کارت استعلام می‌شود.'] : ['This is a sample card with no official validity.', 'Scan the QR code to verify a card.'];
    lines.forEach((l, i) => ctx.fillText(l, tx, 285 + i * 44)); ctx.globalAlpha = 1;
    ctx.font = '600 22px Vazirmatn'; ctx.globalAlpha = .7; ctx.fillText(siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), tx, 440); ctx.globalAlpha = 1;
    return c;
}

function Demo({ front, back, labels, onAgain, orderHref }) {
    const t = (k) => labels[k] || k;
    return (
        <div className="lp-demo-enter">
            <CardShowcase3D front={front} back={back} version={1} t={t} label={labels.view_3d} Icon={Icon} />
            <div className="flex flex-wrap justify-center gap-3 mt-2">
                <a href={orderHref} className="lp-btn rounded-xl px-5 py-2.5 font-bold text-sm inline-flex items-center gap-2"><Icon name="Sparkles" /> {labels.cta_order}</a>
                <button type="button" onClick={onAgain} className="lp-btn-ghost rounded-xl px-5 py-2.5 font-bold text-sm">{labels.again}</button>
            </div>
        </div>
    );
}

let root = null;
/** ساخت کارت و نمایش سه‌بعدی در container. */
async function render(container, opts) {
    try { await Promise.all([document.fonts.load('900 40px Vazirmatn'), document.fonts.load('600 30px Vazirmatn')]); } catch (e) { }
    const [photo, logo] = await Promise.all([opts.photoFile ? loadImage(URL.createObjectURL(opts.photoFile)) : null, loadImage(opts.logoUrl)]);
    const args = { name: opts.name, role: opts.role, photo, logo, lang: opts.lang, org: opts.org, colors: opts.colors, siteUrl: opts.siteUrl };
    const front = drawFront(args); const back = drawBack(args);
    if (!root) root = ReactDOM.createRoot(container);
    root.render(<Demo key={Date.now()} front={front} back={back} labels={opts.labels} orderHref={opts.orderHref} onAgain={opts.onAgain} />);
}
window.CardDemo = { render, reset: () => { if (root) { root.unmount(); root = null; } } };
