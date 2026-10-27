// خواندن و ساختن فایل اکسل (xlsx) و CSV برای لیست‌های پایه، بدون کتابخانه‌ی جدید (فایل xlsx یک zip از چند XML است).
// فقط برگه‌ی اول خوانده می‌شود و همه‌ی خانه‌ها به متن تبدیل می‌شوند.
import JSZip from 'jszip';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const parseXml = (text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    return doc;
};
// بعضی برنامه‌ها پیشوند (مثلاً x:) می‌گذارند؛ با NS='*' هر دو حالت پیدا می‌شود
const els = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
const textOf = (node) => els(node, 't').map(t => t.textContent).join('');

/** «AB12» → شماره‌ی ستون (از ۰). */
const colIndex = (ref) => { const m = /^([A-Z]+)/i.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function readXlsx(buf) {
    const zip = await JSZip.loadAsync(buf);
    const read = async (path) => { const f = zip.file(path); return f ? f.async('string') : null; };
    // برگه‌ی اول را از روی workbook و rels پیدا می‌کنیم (نام فایل همیشه sheet1 نیست)
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await read('xl/workbook.xml'); const rels = await read('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
        const first = els(parseXml(wb), 'sheet')[0];
        const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
        const rel = rid && els(parseXml(rels), 'Relationship').find(r => r.getAttribute('Id') === rid);
        if (rel) { const target = rel.getAttribute('Target').replace(/^\//, ''); sheetPath = target.startsWith('xl/') ? target : `xl/${target}`; }
    }
    const sheet = await read(sheetPath);
    if (!sheet) throw new Error('no sheet');
    const sst = await read('xl/sharedStrings.xml');
    const shared = sst ? els(parseXml(sst), 'si').map(textOf) : [];
    const rows = [];
    els(parseXml(sheet), 'row').forEach(row => {
        const out = []; let next = 0;
        els(row, 'c').forEach(c => {
            const idx = c.hasAttribute('r') ? colIndex(c.getAttribute('r')) : next; next = idx + 1;
            const type = c.getAttribute('t'); const v = els(c, 'v')[0];
            let val = '';
            if (type === 's') val = v ? (shared[Number(v.textContent)] ?? '') : '';
            else if (type === 'inlineStr') val = textOf(c);
            else if (type === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
            else val = v ? v.textContent : '';
            out[idx] = val;
        });
        const r = Number(row.getAttribute('r')) - 1; const at = Number.isFinite(r) && r >= 0 ? r : rows.length;
        rows[at] = Array.from(out, x => (x == null ? '' : String(x)));
    });
    return Array.from(rows, r => r || []);
}

/** CSV با جداکننده‌ی , یا ؛ یا Tab (تشخیص خودکار از ردیف اول) و پشتیبانی از "..." */
function readCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const sep = [',', ';', '\t', '؛'].map(s => [s, firstLine.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
        if (ch === '"' && cell === '') q = true;
        else if (ch === sep) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/** فایل انتخاب‌شده (xlsx یا csv) → آرایه‌ای از ردیف‌ها (هر ردیف آرایه‌ای از متن). */
export async function readSpreadsheet(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') return readCsv(await file.text());
    if (name.endsWith('.xls')) { const e = new Error('xls'); e.code = 'xls'; throw e; }
    try { return await readXlsx(await file.arrayBuffer()); }
    catch (err) { const e = new Error('bad file'); e.code = 'bad'; throw e; }
}

// --- ساخت xlsx ---
const esc = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/**
 * ردیف‌ها → فایل xlsx (برگه‌ی راست‌به‌چپ، ردیف اول پررنگ و ثابت).
 * @param rows آرایه‌ای از ردیف‌ها؛ ردیف اول عنوان ستون‌هاست
 */
export async function writeXlsx(rows, { sheetName = 'Sheet1', rtl = true } = {}) {
    const name = esc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    const width = Math.max(1, ...rows.map(r => r.length));
    const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(10, ...rows.map(r => String(r[c] ?? '').length + 2))));
    const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' || v == null) ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    zip.file('xl/worksheets/sheet1.xml', sheet);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
