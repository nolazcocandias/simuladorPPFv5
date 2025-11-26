
async function obtenerUF() {
  try {
    const r = await fetch('https://mindicador.cl/api/uf');
    const d = await r.json();
    document.getElementById('valorUF').value = Number(d.serie[0].valor).toFixed(2);
  } catch (e) {
    console.warn('UF API error', e);
  }
}

window.addEventListener('load', obtenerUF);

document.querySelector(".btn-simular").addEventListener("click", async () => {
  const uf = parseFloat(document.getElementById("valorUF").value);
  const pallets = parseInt(document.getElementById("pallets").value);
  const meses = parseInt(document.getElementById("meses").value);

  if (!uf || !pallets || !meses) {
    alert("Por favor ingresa todos los datos.");
    return;
  }

  try {
    const resp = await fetch("https://simulador-backend-fdya.onrender.com/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf, pallets, meses })
    });

    const data = await resp.json();

    // Mostrar resultados en tarjetas
    document.querySelector("#pp-value").textContent = data.palletParking.toLocaleString("es-CL");
    document.querySelector("#tradicional-value").textContent = data.tradicional.toLocaleString("es-CL");
    document.querySelector("#ahorro-value").textContent = data.ahorro.toLocaleString("es-CL");

    // Renderizar tabla
    const table = document.querySelector("table");
    table.innerHTML = `<tr><th>Mes</th><th>Entradas</th><th>Salidas</th><th>Stock Final</th></tr>`;
    data.tabla.forEach(row => {
      table.innerHTML += `<tr>
        <td>${row.mes}</td>
        <td>${row.entradas}</td>
        <td>${row.salidas}</td>
        <td>${row.stock}</td>
      </tr>`;
    });
  } catch (error) {
    console.error("Error al simular:", error);
    alert("Hubo un problema al procesar la simulación.");
  }
});

