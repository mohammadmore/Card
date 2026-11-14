// حرکت و انیمیشن‌های عمومی رابط: هیچ تغییری «یهویی» نباشد.
//  ۱) فید خروج پنجره‌های مدال (React عنصر را همان لحظه حذف می‌کند؛ نسخه‌ی کپی‌شده‌اش با فید کم‌رنگ می‌شود)
//  ۲) هایلایت لیزنده برای تب‌ها و مراحل (هر ظرفی با data-slide): مستطیل رنگی از آیتم قبلی تا مقصد، از روی آیتم‌های میانی، می‌لغزد
// ورود پنجره‌ها و تعویض محتوا فقط با CSS (styles.css) انجام می‌شود. با تنظیم «کاهش حرکت» سیستم‌عامل همه چیز خاموش است.
(function () {
    if (typeof document === 'undefined' || window.__motionInit) return; window.__motionInit = true;
    const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- ۱) فید خروج ----------
    const OVERLAY = '.fixed.inset-0:not(.liquid-bg), [role="dialog"].fixed, [role="alertdialog"].fixed';
    const ghost = (node) => {
        try {
            const clone = node.cloneNode(true);
            const src = node.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
            src.forEach((c, i) => { const d = dst[i]; if (!d) return; try { d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); } catch (e) { } });
            clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); clone.removeAttribute('id');
            clone.querySelectorAll('video,audio').forEach(m => { try { m.pause(); } catch (e) { } });
            clone.classList.add('mo-ghost'); clone.setAttribute('aria-hidden', 'true'); clone.setAttribute('inert', ''); clone.removeAttribute('role');
            clone.querySelectorAll('[role]').forEach(e => e.removeAttribute('role'));
            [clone, ...clone.querySelectorAll('*')].forEach(e => { [...e.attributes].forEach(at => { if (/^aria-(?!hidden)/.test(at.name) || at.name === 'data-testid') e.removeAttribute(at.name); }); });
            document.body.appendChild(clone); setTimeout(() => clone.remove(), 230);
        } catch (e) { }
    };
    const onRemoved = (node) => {
        if (reduce() || node.nodeType !== 1 || node.classList.contains('mo-ghost') || node.isConnected) return;
        const found = []; if (node.matches(OVERLAY)) found.push(node); else node.querySelectorAll && node.querySelectorAll(OVERLAY).forEach(n => { if (!found.some(f => f.contains(n))) found.push(n); });
        found.forEach(ghost);
    };

    // ---------- ۲) هایلایت لیزنده ----------
    const ACTIVE = '[aria-selected="true"],[aria-current="step"],[aria-pressed="true"],[aria-checked="true"]';
    const ANY = '[aria-selected],[aria-current],[aria-pressed],[aria-checked]';
    const place = (c) => {
        const a = c.querySelector(ACTIVE);
        if (!a || !a.offsetWidth) { c.style.setProperty('--hl-o', '0'); return; }
        const items = [...c.querySelectorAll(ANY)]; const idx = items.indexOf(a); const steps = c._idx == null ? 0 : Math.abs(idx - c._idx);
        const first = c._idx == null; c._idx = idx;
        const dur = first || reduce() ? 0 : Math.min(700, 220 + 85 * steps);
        c.style.setProperty('--hl-d', dur + 'ms');
        c.style.setProperty('--hl-x', a.offsetLeft + 'px'); c.style.setProperty('--hl-y', a.offsetTop + 'px');
        c.style.setProperty('--hl-w', a.offsetWidth + 'px'); c.style.setProperty('--hl-h', a.offsetHeight + 'px');
        c.style.setProperty('--hl-r', getComputedStyle(a).borderTopLeftRadius || '12px'); c.style.setProperty('--hl-o', '1');
    };
    const pending = new Set(); let raf = 0;
    const schedule = (c) => { pending.add(c); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const list = [...pending]; pending.clear(); list.forEach(place); }); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => es.forEach(e => schedule(e.target))) : null;
    const watched = new WeakSet();
    const adopt = (c) => { if (watched.has(c)) { schedule(c); return; } watched.add(c); if (ro) ro.observe(c); schedule(c); };

    new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.type === 'attributes') { const c = m.target.closest && m.target.closest('[data-slide]'); if (c) schedule(c); continue; }
            m.removedNodes.forEach(onRemoved);
            m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches && n.matches('[data-slide]')) adopt(n); n.querySelectorAll && n.querySelectorAll('[data-slide]').forEach(adopt); const c = n.closest && n.closest('[data-slide]'); if (c) schedule(c); });
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed', 'aria-checked', 'data-slide'] });
    window.addEventListener('resize', () => document.querySelectorAll('[data-slide]').forEach(schedule));
    document.fonts && document.fonts.ready && document.fonts.ready.then(() => document.querySelectorAll('[data-slide]').forEach(schedule));
    document.querySelectorAll('[data-slide]').forEach(adopt);
})();
