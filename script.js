
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

    // Tarjetas
    const ppEl = document.querySelector("#pp-value");
    const tradEl = document.querySelector("#tradicional-value");
    const ahoEl = document.querySelector("#ahorro-value");
    if (ppEl) ppEl.textContent = Number(data.palletParking ?? 0).toLocaleString("es-CL");
    if (tradEl) tradEl.textContent = Number(data.tradicional ?? 0).toLocaleString("es-CL");
    if (ahoEl) ahoEl.textContent = Number(data.ahorro ?? 0).toLocaleString("es-CL");

    // Tabla
    const tbody = document.querySelector("#tabla-resultados tbody");
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
    alert("Hubo un problema al procesar la simulación. Revisa la consola para más detalles.");
  }
});
