// نمایش سه‌بعدی کارت دورو: کارت با ضخامت واقعی حول محور عمودی خودش می‌چرخد (خودکار + کشیدن با دست)،
// با سایه‌ی نرم، درخشش براق روی سطح و انعکاس روی زمین. فقط transform تغییر می‌کند تا روان و سبک بماند.
const { useState, useEffect, useRef, useMemo } = React;

const AUTO_SPEED = 42;          // درجه بر ثانیه (در نزدیکی رو/پشت کندتر می‌شود)
const HOLD_AFTER_FLIP_MS = 2600; // توقف روی یک رو بعد از دکمه‌ی «روی کارت/پشت کارت»
const HOLD_AFTER_DRAG_MS = 1400;
const TILT_X = -7;               // کمی از بالا نگاه می‌کنیم تا لبه‌ی بالایی کارت دیده شود

const norm180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };

/** کپی بوم مبدأ در بوم مقصد با حداکثر عرض مشخص (کار می‌کند حتی اگر مبدأ tainted باشد). */
const copyCanvas = (src, dst, maxW) => {
    if (!src || !dst || !src.width || !src.height) return;
    const scale = Math.min(1, maxW / src.width);
    dst.width = Math.max(1, Math.round(src.width * scale)); dst.height = Math.max(1, Math.round(src.height * scale));
    const ctx = dst.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, dst.width, dst.height);
};

/** رنگ میانگین حاشیه‌ی کارت برای لبه/ضخامت؛ اگر خواندن پیکسل ممکن نباشد رنگ خنثی. */
const edgeColorOf = (canvas) => {
    try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24; const ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 24, 24); const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { if (x > 1 && x < 22 && y > 1 && y < 22) continue; const i = (y * 24 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
    } catch (e) { return '#dfe3ea'; }
};

/**
 * لبه‌ی کارت: نواری پیوسته دور تا دور (خطوط صاف + گوشه‌های گرد با چند قطعه‌ی کوچک)،
 * عمود بر سطح کارت و هم‌ضخامت آن، تا از هر زاویه گوشه‌ها مثل خود کارت گرد دیده شوند.
 */
const edgeSegments = (w, h, r, perCorner = 8) => {
    const segs = [];
    const line = (cx, cy, len, deg) => segs.push({ cx, cy, len, deg });
    line(w / 2, 0, w - 2 * r, 0); line(w, h / 2, h - 2 * r, 90); line(w / 2, h, w - 2 * r, 180); line(0, h / 2, h - 2 * r, 270);
    const corners = [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]];
    const step = 90 / perCorner; const len = 2 * r * Math.sin((step * Math.PI / 180) / 2) * 1.12;
    corners.forEach(([ccx, ccy, a0]) => {
        for (let i = 0; i < perCorner; i++) {
            const phi = (a0 + step * (i + 0.5)) * Math.PI / 180;
            line(ccx + r * Math.cos(phi), ccy + r * Math.sin(phi), len, a0 + step * (i + 0.5) + 90);
        }
    });
    return segs;
};

function CardBody({ w, h, faceRefs, edge, withGloss, glossRefs, withEdge = true }) {
    const t = Math.max(3, Math.round(w * 0.009)); const r = Math.round(Math.min(w, h) * 0.045);
    const face = (side) => (
        <div className="sc-face" style={{ width: w, height: h, borderRadius: r, transform: side === 'front' ? `translateZ(${t / 2}px)` : `rotateY(180deg) translateZ(${t / 2}px)` }}>
            <canvas ref={faceRefs[side]} className="sc-canvas" />
            {withGloss && <><div ref={glossRefs[side + 'Shade']} className="sc-shade" /><div ref={glossRefs[side]} className="sc-gloss" /></>}
        </div>
    );
    const segs = useMemo(() => edgeSegments(w, h, r), [w, h, r]);
    return (
        <>
            {/* در انعکاس (آینه‌شده) لبه رسم نمی‌شود؛ کروم آن قطعه‌ها را جلوی رو و پشت کارت مرتب می‌کند و انعکاس خالی می‌ماند */}
            {withEdge && segs.map((sg, i) => {
                // نور از بالا: لبه‌ی بالایی روشن‌تر، لبه‌ی پایینی تیره‌تر
                const light = -Math.sin((sg.deg - 90) * Math.PI / 180); // ۱ = رو به بالا، ۱- = رو به پایین
                const tone = light >= 0 ? `color-mix(in srgb, ${edge} ${Math.round(100 - light * 35)}%, white)` : `color-mix(in srgb, ${edge} ${Math.round(100 + light * 40)}%, black)`;
                return <div key={i} className="sc-edge" style={{ width: sg.len + 0.6, height: t, left: sg.cx - (sg.len + 0.6) / 2, top: sg.cy - t / 2, background: tone, transform: `rotateZ(${sg.deg}deg) rotateX(90deg)` }} />;
            })}
            {face('front')}{face('back')}
        </>
    );
}

/**
 * @param front, back  بوم‌های رندرشده‌ی دو روی کارت
 * @param version      با هر رندر جدید افزایش می‌یابد تا تصویر کارت به‌روز شود
 */
export function CardShowcase3D({ front, back, version, t, label, Icon }) {
    const stageRef = useRef(null); const cardRef = useRef(null); const reflRef = useRef(null); const shadowRef = useRef(null);
    const faces = { front: useRef(null), back: useRef(null) }; const reflFaces = { front: useRef(null), back: useRef(null) };
    const gloss = { front: useRef(null), back: useRef(null), frontShade: useRef(null), backShade: useRef(null) };
    const [box, setBox] = useState({ w: 0, h: 0 }); const [edge, setEdge] = useState('#dfe3ea');
    const [playing, setPlaying] = useState(true);
    const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // وضعیت حرکت در ref نگه داشته می‌شود تا هر فریم باعث رندر React نشود
    const m = useRef({ angle: -28, vel: 0, target: null, holdUntil: 0, drag: null, playing: true, visible: true });
    useEffect(() => { m.current.playing = playing && !reduceMotion.current; if (playing) m.current.holdUntil = 0; }, [playing]);

    const ratio = front && front.width ? front.height / front.width : 0.625;

    // اندازه‌ی کارت متناسب با عرض محفظه و ارتفاع صفحه
    useEffect(() => {
        const el = stageRef.current; if (!el) return;
        const fit = () => {
            const cw = el.clientWidth || 600; let w = Math.min(cw * 0.78, 540); let h = w * ratio;
            const maxH = Math.max(220, window.innerHeight * 0.5); if (h > maxH) { h = maxH; w = h / ratio; }
            setBox(b => (Math.abs(b.w - w) < 1 && Math.abs(b.h - h) < 1) ? b : { w: Math.round(w), h: Math.round(h) });
        };
        fit(); const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener('resize', fit);
        return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
    }, [ratio]);

    // کپی تصویر دو رو در وجه‌های کارت و انعکاس
    useEffect(() => {
        if (!box.w) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1); const maxW = Math.round(box.w * dpr * 1.25);
        copyCanvas(front, faces.front.current, maxW); copyCanvas(back, faces.back.current, maxW);
        copyCanvas(front, reflFaces.front.current, maxW / 2); copyCanvas(back, reflFaces.back.current, maxW / 2);
        if (front) setEdge(edgeColorOf(front));
    }, [front, back, version, box.w]);

    // توقف حلقه وقتی کارت در صفحه دیده نمی‌شود
    useEffect(() => {
        const el = stageRef.current; if (!el || !window.IntersectionObserver) return;
        const io = new IntersectionObserver(([e]) => { m.current.visible = e.isIntersecting; }); io.observe(el);
        return () => io.disconnect();
    }, []);

    // حلقه‌ی انیمیشن
    useEffect(() => {
        let raf = 0; let last = performance.now();
        const apply = () => {
            const a = m.current.angle; const tr = `rotateX(${TILT_X}deg) rotateY(${a}deg)`;
            if (cardRef.current) cardRef.current.style.transform = tr;
            if (reflRef.current) reflRef.current.style.transform = tr;
            const cos = Math.abs(Math.cos(a * Math.PI / 180));
            if (shadowRef.current) shadowRef.current.style.transform = `translateX(-50%) scaleX(${0.18 + 0.82 * cos})`;
            ['front', 'back'].forEach(side => {
                const local = norm180(side === 'front' ? a : a - 180); // ۰ = رو به بیننده
                const g = gloss[side].current; const s = gloss[side + 'Shade'].current;
                if (g) { g.style.backgroundPosition = `${50 - (local / 90) * 55}% 0`; g.style.opacity = String(0.35 + 0.65 * Math.min(1, Math.abs(local) / 50)); }
                if (s) s.style.opacity = String(Math.min(0.55, (1 - Math.abs(Math.cos(local * Math.PI / 180))) * 0.6));
            });
        };
        const tick = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000); last = now; const s = m.current;
            if (s.visible && !s.drag) {
                if (s.target !== null) {
                    const diff = s.target - s.angle; s.angle += diff * Math.min(1, dt * 5.5);
                    if (Math.abs(diff) < 0.15) { s.angle = s.target; s.target = null; s.holdUntil = now + HOLD_AFTER_FLIP_MS; }
                } else if (Math.abs(s.vel) > 6) {
                    s.angle += s.vel * dt; s.vel *= Math.exp(-dt * 2.6);
                    if (s.playing && Math.abs(s.vel) < AUTO_SPEED * 0.5) s.vel = 0;
                } else if (s.playing && now > s.holdUntil) {
                    // نزدیک رو و پشت کندتر می‌چرخد تا هر رو کمی بیشتر دیده شود
                    const sin = Math.abs(Math.sin(s.angle * Math.PI / 180));
                    s.angle += AUTO_SPEED * (0.32 + 0.68 * sin) * dt;
                }
                if (Math.abs(s.angle) > 3600) s.angle = norm180(s.angle);
            }
            apply(); raf = requestAnimationFrame(tick);
        };
        apply(); raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [box.w]);

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
        const s = m.current; s.drag = { x: e.clientX, angle: s.angle, lastX: e.clientX, lastT: performance.now(), v: 0 }; s.target = null; s.vel = 0;
    };
    const onPointerMove = (e) => {
        const s = m.current; const d = s.drag; if (!d) return;
        const now = performance.now(); const dx = e.clientX - d.x; s.angle = d.angle + dx * 0.55;
        const dtm = Math.max(1, now - d.lastT); d.v = 0.7 * d.v + 0.3 * ((e.clientX - d.lastX) * 0.55 / dtm * 1000); d.lastX = e.clientX; d.lastT = now;
    };
    const onPointerUp = () => {
        const s = m.current; const d = s.drag; if (!d) return;
        s.vel = Math.max(-900, Math.min(900, d.v)); s.drag = null; s.holdUntil = performance.now() + HOLD_AFTER_DRAG_MS;
    };
    /** چرخش نرم تا نزدیک‌ترین زاویه‌ای که رو (۰) یا پشت (۱۸۰) کارت را نشان می‌دهد. */
    const showSide = (side) => {
        const s = m.current; const want = side === 'front' ? 0 : 180;
        s.target = s.angle + norm180(want - s.angle); s.vel = 0;
    };
    const onKeyDown = (e) => {
        const s = m.current;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); s.target = (s.target ?? s.angle) + (e.key === 'ArrowRight' ? 30 : -30); s.vel = 0; }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.target = (s.target ?? s.angle) + 180; s.vel = 0; }
    };

    const btn = 'sc-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold';
    return (
        <div className="sc-wrap w-full flex flex-col items-center print:hidden">
            <div ref={stageRef} className="sc-stage w-full" style={{ height: box.h ? box.h * 1.24 + 24 : 320 }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                tabIndex={0} role="img" aria-roledescription="3D" aria-label={label || t('view_3d')} onKeyDown={onKeyDown}>
                {box.w > 0 && <>
                    {/* انعکاس و سایه اول رسم می‌شوند تا همیشه زیر کارت باشند، نه روی آن */}
                    <div className="sc-reflect" style={{ width: box.w, height: box.h * 0.24, top: 12 + box.h + 3 }} aria-hidden="true">
                        <div className="sc-persp sc-mirror" style={{ width: box.w, height: box.h }}>
                            <div ref={reflRef} className="sc-card" style={{ width: box.w, height: box.h }}>
                                <CardBody w={box.w} h={box.h} faceRefs={reflFaces} edge={edge} withEdge={false} />
                            </div>
                        </div>
                    </div>
                    <div ref={shadowRef} className="sc-shadow" style={{ width: box.w * 0.92, top: 12 + box.h - 9 }} aria-hidden="true" />
                    <div className="sc-persp sc-front" style={{ width: box.w, height: box.h, top: 12 }}>
                        <div ref={cardRef} className="sc-card" style={{ width: box.w, height: box.h }}>
                            <CardBody w={box.w} h={box.h} faceRefs={faces} edge={edge} withGloss glossRefs={gloss} />
                        </div>
                    </div>
                </>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button type="button" className={btn} onClick={() => showSide('front')}><Icon name="CreditCard" className="w-3.5 h-3.5" /> {t('show_front')}</button>
                <button type="button" className={btn} onClick={() => showSide('back')}><Icon name="FlipHorizontal" className="w-3.5 h-3.5" /> {t('show_back')}</button>
                {!reduceMotion.current && <button type="button" className={btn} onClick={() => setPlaying(p => !p)} aria-pressed={!playing}><Icon name={playing ? 'Pause' : 'Play'} className="w-3.5 h-3.5" /> {playing ? t('pause_rotation') : t('play_rotation')}</button>}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{t('showcase_hint')}</p>
        </div>
    );
}
