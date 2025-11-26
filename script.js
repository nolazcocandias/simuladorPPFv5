// script.js (cliente): carga y recalcula el Excel en el navegador (sin backend)
// Requisitos: tener simulacion.xlsx accesible en la misma carpeta (o ajustar EXCEL_PATH)
// index.html ya incluye: xlsx.full.min.js y xlsx-calc.min.js

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

// Generador de movimientos (misma lógica que tenías en backend)
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

// Detectar la función de cálculo expuesta por el bundle xlsx-calc en el navegador
function getCalcFn() {
  // posibles nombres según bundling
  const candidates = [
    window.XLSX_CALC,
    window.xlsx_calc,
    window['xlsx-calc'],
    window.xlsxCalc,
    window['XLSX_CALC'],
    window['xlsxCalc'],
    window?.['default'] // improbable
  ];
  for (const c of candidates) {
    if (typeof c === 'function') return c;
    if (c && typeof c.default === 'function') return c.default;
    if (c && typeof c.calc === 'function') return c.calc;
  }
  // último intento: algunos bundles exponen una función global llamada calc (poco común)
  if (typeof window.calc === 'function') return window.calc;
  throw new Error('No se detectó función de cálculo xlsx-calc en el navegador (revisa que cargaste xlsx-calc)');
}

// Función para asegurar que las referencias en fórmulas tengan objeto en sheet (evita undefined .calc)
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

// Flow principal al pulsar "Simular"
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
    // 1) Cargar el archivo XLSX como ArrayBuffer
    const r = await fetch(EXCEL_PATH);
    if (!r.ok) throw new Error('No se pudo descargar ' + EXCEL_PATH + ' (status ' + r.status + ')');
    const arrayBuffer = await r.arrayBuffer();

    // 2) Leer workbook en memoria
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellNF: true, cellDates: true });
    const sheetName = workbook.SheetNames.includes('cliente') ? 'cliente' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Hoja no encontrada en workbook: ' + sheetName);

    // 3) Generar movimientos y escribir D9:D20, E9:E20, W57
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

    // 4) Asegurar referencias faltantes para evitar errores .calc undefined
    const created = ensureReferencedCellsExist(workbook);
    if (created.length) console.log('Se crearon celdas faltantes (cliente-side):', created.slice(0,200));

    // 5) Ejecutar xlsx-calc en el navegador
    const calcFn = getCalcFn();
    await calcFn(workbook); // recalcula fórmulas en memoria

    // 6) Leer resultados (tabla y KPIs)
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

    // 7) Mostrar resultados en la UI (ids que tiene tu HTML)
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
