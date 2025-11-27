
// script.js - Conexión con API Vercel y actualización de UI

async function calcular() {
  const pallets = document.getElementById("inputPallets").value;
  const meses = document.getElementById("inputMeses").value;

  if (!pallets || !meses) {
    alert("Por favor ingresa cantidad de pallets y meses.");
    return;
  }

  try {
    const response = await fetch("https://vercel-project-le9zwp435-nolazcos-projects-d41d5644.vercel.app/api/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cantidad_pallets: pallets, meses_operacion: meses })
    });

    if (!response.ok) {
      throw new Error("Error en la API");
    }

    const data = await response.json();

    // Actualizar tarjetas
    document.getElementById("tarjetaPP").innerText = `PalletParking: ${data.tarjetas.pallet_parking}`;
    document.getElementById("tarjetaTrad").innerText = `Tradicional: ${data.tarjetas.tradicional}`;
    document.getElementById("tarjetaAhorro").innerText = `Ahorro: ${data.tarjetas.ahorro}`;

    // Actualizar tabla
    const tablaHTML = data.tabla.map(row => `
      <tr>
        <td>${row.mes}</td>
        <td>${row.in}</td>
        <td>${row.out}</td>
        <td>${row.stock}</td>
      </tr>
    `).join("");
    document.getElementById("tablaResultados").innerHTML = tablaHTML;

    // Preparar datos para gráfico comparativo
    const mesesLabels = data.tabla.map(row => `Mes ${row.mes}`);
    const costosPP = data.costos.pallet_parking.slice(0, meses);
    const costosTrad = data.costos.tradicional.slice(0, meses);

    // Crear gráfico con Chart.js (si está disponible en tu HTML)
    if (typeof Chart !== "undefined") {
      const ctx = document.getElementById("graficoCostos").getContext("2d");
      if (window.graficoCostos) {
        window.graficoCostos.destroy();
      }
      window.graficoCostos = new Chart(ctx, {
        type: "bar",
        data: {
          labels: mesesLabels,
          datasets: [
            {
              label: "PalletParking",
              data: costosPP,
              backgroundColor: "rgba(54, 162, 235, 0.6)"
            },
            {
              label: "Tradicional",
              data: costosTrad,
              backgroundColor: "rgba(255, 99, 132, 0.6)"
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: "Comparación de costos mensuales"
            }
          }
        }
      });
    }

  } catch (error) {
    console.error(error);
    alert("Hubo un error al calcular. Intenta nuevamente.");
  }
}
