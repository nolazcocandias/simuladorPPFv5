// script.js (cliente) - recálculo seguro en navegador
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

// helpers detección estricta calcFn
function isNativeFunction(fn) {
  try { return typeof fn === 'function' && /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(fn)); }
  catch (e) { return false; }
}

function getCalcFnStrict() {
  // nombres preferidos globales
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

  // heurística estricta en globals: buscar objetos con claves típicas
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

  console.warn('getCalcFnStrict: no se detectó xlsx-calc en globals. Asegúrate que index.html carga xlsx-calc@0.4.0 ANTES de script.js');
  return null;
}

// ensure references exist (evita undefined en xlsx-calc)
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

function dumpCells(sheet, refs) {
  return refs.map(r => { const obj = sheet[r]; return { cell: r, present: !!obj, f: obj?.f ?? null, v: obj?.v ?? null, t: obj?.t ?? null }; });
}

document.querySelector(".btn-simular")?.addEventListener("click", async () => {
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

    const { inVals, outVals } = generarMovimientos(pallets, meses);
    for (let i = 0; i < 12; i++) { sheet['D' + (9 + i)] = { t: 'n', v: 0 }; sheet['E' + (9 + i)] = { t: 'n', v: 0 }; }
    for (let i = 0; i < meses; i++) { sheet['D' + (9 + i)] = { t: 'n', v: inVals[i] }; sheet['E' + (9 + i)] = { t: 'n', v: outVals[i] }; }
    sheet['W57'] = { t: 'n', v: uf };

    console.log('Estado PRE-calc P103:P105:', dumpCells(sheet, ['P103','P104','P105']));

    const created = ensureReferencedCellsExist(workbook);
    if (created.length) {
      console.log('Se crearon celdas faltantes (cliente-side):', created.slice(0,200));
      const missingSheets = created.filter(c => c.note === 'sheet-not-found').map(c => c.sheet).filter(Boolean);
      if (missingSheets.length) console.warn('Hojas faltantes (ej):', [...new Set(missingSheets)].slice(0,20));
    } else console.log('No se detectaron celdas faltantes a crear.');

    const calcFn = getCalcFnStrict();
    if (!calcFn) {
      console.error('No se encontró función de cálculo xlsx-calc. No se podrá recalc en navegador.');
      mostrarResultados(sheet, meses);
      return;
    }
    console.log('calcFn detectado:', calcFn);

    try { await calcFn(workbook); }
    catch (calcErr) {
      console.error('Error ejecutando calcFn:', calcErr && calcErr.message ? calcErr.message : calcErr);
      console.log('Estado POST-error P103:P105:', dumpCells(sheet, ['P103','P104','P105']));
      mostrarResultados(sheet, meses);
      return;
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
