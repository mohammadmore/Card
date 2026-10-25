// ساخت PDF با ابعاد واقعی (میلی‌متر) از تصاویر JPEG بوم، بدون کتابخانه‌ی خارجی.
const MM_TO_PT = 72 / 25.4;
const A4 = { w: 210, h: 297 };
const enc = new TextEncoder();

/** canvas → بایت‌های JPEG */
export const canvasToJpegBytes = (canvas, quality = 0.95) => {
    const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

/**
 * اندازه‌ی صفحه و جای تصویر:
 * - اگر printW/printH (میلی‌متر) تعیین شده باشد، صفحه دقیقاً همان اندازه است (جهت صفحه با جهت تصویر هماهنگ می‌شود) و تصویر کل صفحه را می‌گیرد.
 * - در غیر این صورت صفحه A4 (عمودی/افقی بر اساس تصویر) است و تصویر با حاشیه‌ی ۱۰ میلی‌متری در وسط قرار می‌گیرد.
 */
export const pageLayout = (imgW, imgH, printW, printH) => {
    const landscape = imgW > imgH;
    if (printW > 0 && printH > 0) {
        let w = printW; let h = printH;
        if ((w > h) !== landscape && w !== h) [w, h] = [h, w];
        return { pageW: w, pageH: h, x: 0, y: 0, w, h };
    }
    const pageW = landscape ? A4.h : A4.w; const pageH = landscape ? A4.w : A4.h; const margin = 10;
    const s = Math.min((pageW - 2 * margin) / imgW, (pageH - 2 * margin) / imgH);
    const w = imgW * s; const h = imgH * s;
    return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
};

/** pages: [{ jpeg: Uint8Array, imgW, imgH }] → Blob (application/pdf) */
export const buildPdf = (pages, { printW = 0, printH = 0 } = {}) => {
    const chunks = []; const offsets = []; let pos = 0;
    const push = (data) => { const bytes = typeof data === 'string' ? enc.encode(data) : data; chunks.push(bytes); pos += bytes.length; };
    const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = pages.length; const pageIds = pages.map((_, i) => 3 + i * 3);
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${n} >>`));
    pages.forEach((pg, i) => {
        const pid = pageIds[i]; const cid = pid + 1; const iid = pid + 2;
        const L = pageLayout(pg.imgW, pg.imgH, printW, printH); const f = (v) => (v * MM_TO_PT).toFixed(2);
        obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(L.pageW)} ${f(L.pageH)}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
        // مبدأ PDF پایین-چپ است
        const content = `q ${f(L.w)} 0 0 ${f(L.h)} ${f(L.x)} ${f(L.pageH - L.y - L.h)} cm /Im${i} Do Q`;
        obj(cid, () => { push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`); });
        obj(iid, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pg.imgW} /Height ${pg.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`); push(pg.jpeg); push('\nendstream'); });
    });
    const total = 3 + n * 3; const xref = pos;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
};

/** canvasها → PDF */
export const canvasesToPdf = (canvases, opts) => buildPdf(canvases.map(c => ({ jpeg: canvasToJpegBytes(c), imgW: c.width, imgH: c.height })), opts);

export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
};
