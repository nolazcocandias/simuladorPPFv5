// script.js - cliente: escribe en el xlsx en memoria y recalcula (o hace fallback manual)
// Asegúrate de tener simulacion.xlsx en la misma carpeta que index.html
const EXCEL_PATH = './simulacion.xlsx';

async function obtenerUF() {
  try {
    const r = await fetch('https://mindicador.cl/api/uf');
    const d = await r.json();
    const ufInput = document.getElementById('valorUF');
    if (ufInput) ufInput.value = Number(d.serie?.[0]?.valor ?? 0).toFixed(2);
  } catch (e) { console.warn('UF API error', e); }
}
window.addEventListener('load', obtenerUF);

function generarMovimientos(pallets, meses) {
  const inVals = new Array(meses).fill(0);
  for (let i = 0; i < pallets; i++) inVals[Math.floor(Math.random() * meses)]++;
  const outVals = new Array(meses).fill(0);
  let stock = 0;
  for (let i = 0; i < meses; i++) {
    stock += inVals[i];
    outVals[i] = (i === meses - 1) ? stock : Math.floor(Math.random() * (stock + 1));
    stock -= outVals[i];
  }
  if (stock !== 0) { outVals[meses - 1] += stock; stock = 0; }
  return { inVals, outVals };
}

// --- Helpers para detectar xlsx-calc de forma estricta ---
function isNativeFunction(fn) {
  try { return typeof fn === 'function' && /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(fn)); }
  catch (e) { return false; }
}

function getCalcFnStrict() {
  const prefer = ['XLSX_CALC', 'xlsx_calc', 'xlsx-calc', 'xlsxCalc', 'xlsxCalcLib', 'xlsxcalc', 'XlsxCalc'];
  for (const name of prefer) {
    try {
      const obj = window[name];
      if (!obj) continue;
      if (obj && typeof obj.default === 'function' && !isNativeFunction(obj.default)) { console.log('xlsx-calc at window.'+name+' (default)'); return obj.default; }
      if (obj && typeof obj.calc === 'function' && !isNativeFunction(obj.calc)) { console.log('xlsx-calc at window.'+name+'.calc'); return obj.calc; }
      if (typeof obj === 'function' && !isNativeFunction(obj)) {
        const keys = Object.keys(obj || {});
        if (keys.includes('IFERROR') || keys.includes('OFFSET') || keys.includes('VLOOKUP')) { console.log('xlsx-calc func at window.'+name); return obj; }
      }
    } catch (e) { /* ignore */ }
  }
  // heurística amplia
  for (const k of Object.keys(window)) {
    try {
      const val = window[k];
      if (!val || (typeof val !== 'object' && typeof val !== 'function')) continue;
      if (val === window || val === document) continue;
      const keys = Object.keys(val || {});
      if (keys.includes('IFERROR') || keys.includes('OFFSET') || keys.includes('VLOOKUP') || keys.includes('SUM')) {
        if (typeof val.default === 'function' && !isNativeFunction(val.default)) { console.log('xlsx-calc heurístico en window.'+k+' (default)'); return val.default; }
        if (typeof val.calc === 'function' && !isNativeFunction(val.calc)) { console.log('xlsx-calc heurístico en window.'+k+'.calc'); return val.calc; }
      }
    } catch (e) { /* ignore */ }
  }
  console.warn('getCalcFnStrict: no se detectó xlsx-calc en globals. Asegúrate de cargar xlsx-calc antes de este script');
  return null;
}

// --- Asegurar que referencias en fórmulas tienen objetos de celdas (evita undefined .calc) ---
function ensureReferencedCellsExist(workbook) {
  const created = [];
  const cellRefRegex = /(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/g;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    for (const addr of Object.keys(sheet)) {
      if (!/^[A-Z]+[0-9]+$/.test(addr)) continue;
      const cell = sheet[addr];
      if (cell && cell.f && typeof cell.f === 'string') {
        let m;
        while ((m = cellRefRegex.exec(cell.f)) !== null) {
          const quotedSheet = m[1];
          const simpleSheet = m[2];
          const targetSheetName = quotedSheet || simpleSheet || sheetName;
          const startCol = m[3];
          const startRow = parseInt(m[4], 10);
          const endCol = m[5];
          const endRow = m[6] ? parseInt(m[6], 10) : null;
          const targetSheet = workbook.Sheets[targetSheetName];
          if (!workbook.Sheets[targetSheetName]) {
            created.push({ sheet: targetSheetName, cell: null, note: 'sheet-not-found' });
            continue;
          }
          if (!endRow) {
            const ref = `${startCol}${startRow}`;
            if (!targetSheet[ref]) { targetSheet[ref] = { t: 'n', v: 0 }; created.push({ sheet: targetSheetName, cell: ref }); }
          } else {
            if (startCol === endCol) {
              for (let r = startRow; r <= endRow; r++) { const rr = `${startCol}${r}`; if (!targetSheet[rr]) { targetSheet[rr] = { t: 'n', v: 0 }; created.push({ sheet: targetSheetName, cell: rr }); } }
            } else {
              const ref1 = `${startCol}${startRow}`, ref2 = `${endCol}${endRow}`;
              if (!targetSheet[ref1]) { targetSheet[ref1] = { t: 'n', v: 0 }; created.push({ sheet: targetSheetName, cell: ref1 }); }
              if (!targetSheet[ref2]) { targetSheet[ref2] = { t: 'n', v: 0 }; created.push({ sheet: targetSheetName, cell: ref2 }); }
            }
          }
        }
      }
    }
  }
  return created;
}

// --- Cálculo manual seguro de KPIs (fallback si xlsx-calc no está disponible) ---
function computeManualKPIs(sheet) {
  function colToNum(col) { let n = 0; for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64); return n; }
  function numToCol(n) { let s = ''; while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); } return s; }
  function sumRowRange(sheet, row, colStart, colEnd) {
    const startNum = colToNum(colStart), endNum = colToNum(colEnd);
    let sum = 0;
    for (let c = startNum; c <= endNum; c++) {
      const addr = numToCol(c) + row;
      const v = sheet[addr]?.v ?? 0;
      sum += Number(v) || 0;
    }
    return sum;
  }

  const p103 = sumRowRange(sheet, 103, 'D', 'O');
  const p104 = sumRowRange(sheet, 104, 'D', 'O');
  const p105 = p104 - p103;

  // escribir en sheet para mantener consistencia con mostrarResultados
  sheet['P103'] = { t: 'n', v: p103 };
  sheet['P104'] = { t: 'n', v: p104 };
  sheet['P105'] = { t: 'n', v: p105 };

  return { palletParking: p103, tradicional: p104, ahorro: p105 };
}

// --- utilities ---
function dumpCells(sheet, refs) {
  return refs.map(r => { const obj = sheet[r]; return { cell: r, present: !!obj, f: obj?.f ?? null, v: obj?.v ?? null, t: obj?.t ?? null }; });
}

// --- Main flow ---
document.querySelector("#btnSimular")?.addEventListener("click", async () => {
  const uf = parseFloat(document.getElementById("valorUF")?.value);
  const pallets = parseInt(document.getElementById("pallets")?.value);
  const meses = parseInt(document.getElementById("meses")?.value);

  if (!uf || !pallets || !meses) { alert("Por favor ingresa UF, pallets y meses."); return; }
  if (meses < 1 || meses > 12) { alert("Meses debe estar entre 1 y 12."); return; }

  try {
    const r = await fetch(EXCEL_PATH);
    if (!r.ok) throw new Error('No se pudo descargar ' + EXCEL_PATH + ' (status ' + r.status + ')');
    const arrayBuffer = await r.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellNF: true, cellDates: true });

    console.log('Workbook SheetNames:', workbook.SheetNames);

    const sheetName = workbook.SheetNames.includes('cliente') ? 'cliente' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

    // escribir entradas/salidas
    const { inVals, outVals } = generarMovimientos(pallets, meses);
    for (let i = 0; i < 12; i++) { sheet['D' + (9 + i)] = { t: 'n', v: 0 }; sheet['E' + (9 + i)] = { t: 'n', v: 0 }; }
    for (let i = 0; i < meses; i++) { sheet['D' + (9 + i)] = { t: 'n', v: inVals[i] }; sheet['E' + (9 + i)] = { t: 'n', v: outVals[i] }; }
    sheet['W57'] = { t: 'n', v: uf };

    console.log('Estado previo P103:P105:', dumpCells(sheet, ['P103','P104','P105']));

    const created = ensureReferencedCellsExist(workbook);
    if (created.length) {
      console.log('Se crearon celdas faltantes (cliente-side):', created.slice(0,200));
      const missingSheets = created.filter(c => c.note === 'sheet-not-found').map(c => c.sheet).filter(Boolean);
      if (missingSheets.length) console.warn('Hojas faltantes (ej):', [...new Set(missingSheets)].slice(0,20));
    } else console.log('No se detectaron celdas faltantes a crear.');

    const calcFn = getCalcFnStrict();
    if (!calcFn) {
      console.error('No se encontró función de cálculo xlsx-calc. Se aplica fallback manual para KPIs.');
      computeManualKPIs(sheet);
      mostrarResultados(sheet, meses);
      return;
    }
    console.log('calcFn detectado:', calcFn);

    try {
      await calcFn(workbook);
      console.log('Recálculo con xlsx-calc OK');
    } catch (calcErr) {
      console.error('Error ejecutando calcFn, aplicando fallback manual:', calcErr && calcErr.message ? calcErr.message : calcErr);
      computeManualKPIs(sheet);
    }

    console.log('Estado POST-calc P103:P105:', dumpCells(sheet, ['P103','P104','P105']));
    mostrarResultados(sheet, meses);
    console.log('Simulación completada en cliente. KPIs leídos (post-calc):', { palletParking: sheet['P103']?.v, tradicional: sheet['P104']?.v, ahorro: sheet['P105']?.v });

  } catch (err) {
    console.error('Error simulando en cliente:', err && err.stack || err);
    alert('Error en el proceso de simulación (ver consola). ' + (err && err.message ? err.message : ''));
  }
});

function mostrarResultados(sheet, meses) {
  const tabla = [];
  for (let i = 0; i < meses; i++) {
    const rnum = 9 + i;
    const entradas = sheet['D' + rnum]?.v || 0;
    const salidas = sheet['E' + rnum]?.v || 0;
    const stock = sheet['G' + rnum]?.v || 0;
    tabla.push({ mes: i + 1, entradas, salidas, stock });
  }

  const palletParking = sheet['P103']?.v || 0;
  const tradicional = sheet['P104']?.v || 0;
  const ahorro = sheet['P105']?.v ?? (tradicional - palletParking);

  const setIfExists = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  setIfExists("#ppUF", Number(palletParking ?? 0).toLocaleString("es-CL"));
  setIfExists("#ppCLP", Number(palletParking ?? 0).toLocaleString("es-CL"));
  setIfExists("#tradUF", Number(tradicional ?? 0).toLocaleString("es-CL"));
  setIfExists("#tradCLP", Number(tradicional ?? 0).toLocaleString("es-CL"));
  setIfExists("#ahorroUF", Number(ahorro ?? 0).toLocaleString("es-CL"));
  setIfExists("#ahorroCLP", Number(ahorro ?? 0).toLocaleString("es-CL"));

  const tbody = document.querySelector("#tabla tbody");
  if (tbody) {
    tbody.innerHTML = "";
    tabla.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.mes}</td><td>${row.entradas}</td><td>${row.salidas}</td><td>${row.stock}</td>`;
      tbody.appendChild(tr);
    });
  }
}
