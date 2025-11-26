// script.js (cliente): carga y recalcula el Excel en el navegador (sin backend)
// Requisitos: tener simulacion.xlsx accesible y que index.html cargue xlsx y xlsx-calc ANTES de este script

const EXCEL_PATH = './simulacion.xlsx'; // ajustar si lo pones en otra ruta

async function obtenerUF() {
  try {
    const r = await fetch('https://mindicador.cl/api/uf');
    const d = await r.json();
    const ufInput = document.getElementById('valorUF');
    if (ufInput) ufInput.value = Number(d.serie?.[0]?.valor ?? 0).toFixed(2);
  } catch (e) {
    console.warn('UF API error', e);
  }
}
window.addEventListener('load', obtenerUF);

function generarMovimientos(pallets, meses) {
  const inVals = new Array(meses).fill(0);
  for (let i = 0; i < pallets; i++) {
    inVals[Math.floor(Math.random() * meses)]++;
  }

  const outVals = new Array(meses).fill(0);
  let stock = 0;
  for (let i = 0; i < meses; i++) {
    stock += inVals[i];
    if (i === meses - 1) {
      outVals[i] = stock;
    } else {
      outVals[i] = Math.floor(Math.random() * (stock + 1));
    }
    stock -= outVals[i];
  }
  if (stock !== 0) {
    outVals[meses - 1] += stock;
    stock = 0;
  }
  return { inVals, outVals };
}

// Nueva getCalcFn robusta: intenta varias heurísticas y busca en window globals
// Reemplaza solo la función getCalcFn de tu script.js por esta versión más segura:

function getCalcFn() {
  // 1) buscar objeto global que contenga claves típicas de xlsx-calc (IFERROR, OFFSET)
  const winKeys = Object.keys(window);
  for (const k of winKeys) {
    try {
      const val = window[k];
      if (!val || (typeof val !== 'object' && typeof val !== 'function')) continue;
      const keys = Object.keys(val || {});
      // heurística fuerte: debe contener claves de funciones de hoja de cálculo
      if (keys.includes('IFERROR') || keys.includes('OFFSET') || keys.includes('VLOOKUP') || keys.includes('SUM')) {
        if (typeof val.default === 'function') {
          console.log('xlsx-calc detected at window.' + k + ' (default)');
          return val.default;
        }
        if (typeof val.calc === 'function') {
          console.log('xlsx-calc detected at window.' + k + '.calc');
          return val.calc;
        }
        if (typeof val === 'function') {
          // UMD que exporta función directamente
          console.log('xlsx-calc detected as function at window.' + k);
          return val;
        }
      }
    } catch (e) {
      // ignorar propiedades inaccesibles
    }
  }
  // 2) si no se encontró nada, intentar comprobación explícita por nombres comunes (sin fallback a alert/otros)
  const names = ['XLSX_CALC', 'xlsx_calc', 'xlsx-calc', 'xlsxCalc', 'xlsxCalcLib', 'xlsxcalc'];
  for (const name of names) {
    const v = window[name];
    if (!v) continue;
    if (typeof v === 'function') return v;
    if (v && typeof v.default === 'function') return v.default;
    if (v && typeof v.calc === 'function') return v.calc;
  }
  // 3) No devolver ninguna función equivocada; reportar el error de forma clara
  console.warn('getCalcFn: No se detectó xlsx-calc entre globals. Evitando fallback inseguro.');
  return null;
}
// Asegurar referencias faltantes como en la versión server
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
        const formula = cell.f;
        let m;
        while ((m = cellRefRegex.exec(formula)) !== null) {
          const quotedSheet = m[1];
          const simpleSheet = m[2];
          const targetSheetName = quotedSheet || simpleSheet || sheetName;
          const startCol = m[3];
          const startRow = parseInt(m[4], 10);
          const endCol = m[5];
          const endRow = m[6] ? parseInt(m[6], 10) : null;

          const targetSheet = workbook.Sheets[targetSheetName];
          if (!targetSheet) {
            created.push({ sheet: targetSheetName, cell: null, note: 'sheet-not-found' });
            continue;
          }
          if (!endRow) {
            const ref = `${startCol}${startRow}`;
            if (!targetSheet[ref]) {
              targetSheet[ref] = { t: 'n', v: 0 };
              created.push({ sheet: targetSheetName, cell: ref });
            }
          } else {
            if (startCol === endCol) {
              const col = startCol;
              const rStart = startRow;
              const rEnd = endRow;
              for (let r = rStart; r <= rEnd; r++) {
                const rr = `${col}${r}`;
                if (!targetSheet[rr]) {
                  targetSheet[rr] = { t: 'n', v: 0 };
                  created.push({ sheet: targetSheetName, cell: rr });
                }
              }
            } else {
              const ref1 = `${startCol}${startRow}`;
              const ref2 = `${endCol}${endRow}`;
              if (!targetSheet[ref1]) {
                targetSheet[ref1] = { t: 'n', v: 0 };
                created.push({ sheet: targetSheetName, cell: ref1 });
              }
              if (!targetSheet[ref2]) {
                targetSheet[ref2] = { t: 'n', v: 0 };
                created.push({ sheet: targetSheetName, cell: ref2 });
              }
            }
          }
        }
      }
    }
  }
  return created;
}

// Flow principal
document.querySelector(".btn-simular")?.addEventListener("click", async () => {
  const uf = parseFloat(document.getElementById("valorUF")?.value);
  const pallets = parseInt(document.getElementById("pallets")?.value);
  const meses = parseInt(document.getElementById("meses")?.value);

  if (!uf || !pallets || !meses) {
    alert("Por favor ingresa UF, pallets y meses.");
    return;
  }
  if (meses < 1 || meses > 12) {
    alert("Meses debe estar entre 1 y 12.");
    return;
  }

  try {
    const r = await fetch(EXCEL_PATH);
    if (!r.ok) throw new Error('No se pudo descargar ' + EXCEL_PATH + ' (status ' + r.status + ')');
    const arrayBuffer = await r.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellNF: true, cellDates: true });
    const sheetName = workbook.SheetNames.includes('cliente') ? 'cliente' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Hoja no encontrada en workbook: ' + sheetName);

    const { inVals, outVals } = generarMovimientos(pallets, meses);

    for (let i = 0; i < 12; i++) {
      sheet['D' + (9 + i)] = { t: 'n', v: 0 };
      sheet['E' + (9 + i)] = { t: 'n', v: 0 };
    }
    for (let i = 0; i < meses; i++) {
      sheet['D' + (9 + i)] = { t: 'n', v: inVals[i] };
      sheet['E' + (9 + i)] = { t: 'n', v: outVals[i] };
    }
    sheet['W57'] = { t: 'n', v: uf };

    const created = ensureReferencedCellsExist(workbook);
    if (created.length) console.log('Se crearon celdas faltantes (cliente-side):', created.slice(0,200));

    // detectar y ejecutar función de cálculo
    const calcFn = getCalcFn();
    console.log('calcFn detected:', calcFn);
    await calcFn(workbook);

    // leer resultados
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
        tr.innerHTML = `
          <td>${row.mes}</td>
          <td>${row.entradas}</td>
          <td>${row.salidas}</td>
          <td>${row.stock}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    console.log('Simulación completada en cliente. KPIs:', { palletParking, tradicional, ahorro });
  } catch (err) {
    console.error('Error simulando en cliente:', err && err.stack || err);
    alert('Error en el proceso de simulación (ver consola). ' + (err && err.message ? err.message : ''));
  }
});
