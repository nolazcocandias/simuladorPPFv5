// URL de tu backend en Vercel
const API_URL = 'https://vercel-libreoffice-project-vhat.vercel.app/calcular';


async function calcular() {
  const estado = document.getElementById('estado');
  estado.textContent = 'Enviando solicitud al backend…';

  const cantidadPallets = Number(document.getElementById('cantidad_pallets').value || 0);
  const mesesOperacion = Number(document.getElementById('meses_operacion').value || 12);

  const payload = {
    cantidad_pallets: cantidadPallets,
    meses_operacion: mesesOperacion
  };

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    estado.textContent = 'OK';

    // Tarjetas
    setText('pallet_parking', safeNumber(data?.tarjetas?.pallet_parking));
    setText('tradicional', safeNumber(data?.tarjetas?.tradicional));
    setText('ahorro', safeNumber(data?.tarjetas?.ahorro));

    // Tabla
    const tbody = document.querySelector('#tabla-resultados tbody');
    tbody.innerHTML = '';
    (data?.tabla || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.mes ?? '-'}</td>
        <td>${safeNumber(row.in)}</td>
        <td>${safeNumber(row.out)}</td>
        <td>${safeNumber(row.stock)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Gráfico simple con Canvas
    dibujarGrafico(
      document.getElementById('graficoCostos'),
      data?.costos?.pallet_parking || [],
      data?.costos?.tradicional || []
    );

  } catch (err) {
    console.error('Error en calcular:', err);
    estado.textContent = 'Error: ' + err.message;
    alert('No se pudo calcular. Revisa la consola (F12 → Console) para detalles.');
  }
}

function setText(id, value) {
  document.getElementById(id).textContent = value ?? '-';
}
function safeNumber(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return Intl.NumberFormat('es-CL').format(n);
}

function dibujarGrafico(canvas, seriePP, serieTrad) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = 40;
  const w = canvas.width - padding * 2;
  const h = canvas.height - padding * 2;
  const x0 = padding;
  const y0 = padding + h;

  const maxVal = Math.max(1, ...seriePP.filter(Number.isFinite), ...serieTrad.filter(Number.isFinite));

  // Ejes
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + w, y0);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y0 - h);
  ctx.stroke();

  const stepX = w / 11; // 12 meses

  // Función para dibujar una serie
  function drawSeries(serie, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const val = Number(serie[i] || 0);
      const x = x0 + stepX * i;
      const y = y0 - (val / maxVal) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawSeries(seriePP, '#0f62fe');
  drawSeries(serieTrad, '#20a36e');
}

// Atajos de teclado (Enter para calcular)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') calcular();
});
