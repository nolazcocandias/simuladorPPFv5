
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
    const resp = await fetch("https://simulador-backend-fdya.onrender.com/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf, pallets, meses })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status} - ${txt}`);
    }

    const data = await resp.json();

    // Mapear resultados a los elementos reales del HTML (revisar ids en index.html)
    // Intentamos varias ids por compatibilidad con distintas versiones del HTML
    const setIfExists = (selector, value) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = value;
    };

    // Los valores devueltos por el backend son números (suponiendo CLP)
    setIfExists("#ppUF", Number(data.palletParking ?? 0).toLocaleString("es-CL"));
    setIfExists("#ppCLP", Number(data.palletParking ?? 0).toLocaleString("es-CL"));
    setIfExists("#tradUF", Number(data.tradicional ?? 0).toLocaleString("es-CL"));
    setIfExists("#tradCLP", Number(data.tradicional ?? 0).toLocaleString("es-CL"));
    setIfExists("#ahorroUF", Number(data.ahorro ?? 0).toLocaleString("es-CL"));
    setIfExists("#ahorroCLP", Number(data.ahorro ?? 0).toLocaleString("es-CL"));

    // Tabla: el HTML tiene id="tabla"
    const tbody = document.querySelector("#tabla tbody");
    if (tbody) {
      tbody.innerHTML = "";
      (data.tabla ?? []).forEach(row => {
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
  } catch (error) {
    console.error("Error al simular:", error);
    alert("Hubo un problema al procesar la simulación. Abre la consola para ver más detalles.");
  }
});
