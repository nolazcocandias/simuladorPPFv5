
async function obtenerUF(){
  try{
    const r = await fetch('https://mindicador.cl/api/uf');
    const d = await r.json();
    document.getElementById('valorUF').value = Number(d.serie[0].valor).toFixed(2);
  }catch(e){console.warn('UF API error',e);}
}
window.addEventListener('load', obtenerUF);

function randomPartition(total, months){
  const arr = new Array(months).fill(0);
  for(let i=0;i<months;i++) arr[i]=1;
  let rem = total-months;
  while(rem>0){arr[Math.floor(Math.random()*months)]++;rem--;}
  return arr;
}

async function cargarExcel(){const resp=await fetch('simulacion.xlsx');const buf=await resp.arrayBuffer();return XLSX.read(buf,{type:'array'});}

function escribirDatos(ws,inVals,outVals,uf){for(let i=0;i<12;i++){ws['D'+(9+i)]={t:'n',v:0};ws['E'+(9+i)]={t:'n',v:0};}
for(let i=0;i<inVals.length;i++){const r=9+i;ws['D'+r]={t:'n',v:inVals[i]};ws['E'+r]={t:'n',v:outVals[i]};}ws['W57']={t:'n',v:Number(uf)};}

function recalcular(wb){try{XLSX_CALC(wb);}catch(e){console.warn('Recalculo parcial',e);}}

function leerResultados(ws,months){const meses=[],inVals=[],outVals=[],stockFin=[];for(let i=0;i<months;i++){const r=9+i;meses.push(ws['C'+r]?.v||String(i+1));inVals.push(ws['D'+r]?.v||0);outVals.push(ws['E'+r]?.v||0);stockFin.push(ws['G'+r]?.v||0);}const uf=Number(document.getElementById('valorUF').value)||39643.59;const ppCLP=ws['P103']?.v||0;const trCLP=ws['P104']?.v||0;const ahCLP=trCLP-ppCLP;const ppUF=ppCLP/uf,trUF=trCLP/uf,ahUF=ahCLP/uf;const ppMens=[],trMens=[];for(let j=0;j<months;j++){const cellPP=XLSX.utils.encode_cell({r:102,c:3+j});const cellTR=XLSX.utils.encode_cell({r:103,c:3+j});ppMens.push(ws[cellPP]?.v||0);trMens.push(ws[cellTR]?.v||0);}return{meses,inVals,outVals,stockFin,ppCLP,trCLP,ahCLP,ppUF,trUF,ahUF,ppMens,trMens};}

function CLP(n){return Math.round(n).toLocaleString('es-CL');}

function renderTabla(res){const tb=document.querySelector('#tabla tbody');tb.innerHTML='';for(let i=0;i<res.meses.length;i++){const tr=document.createElement('tr');tr.innerHTML=`<td>${res.meses[i]}</td><td>${res.inVals[i]}</td><td>${res.outVals[i]}</td><td>${res.stockFin[i]}</td>`;tb.appendChild(tr);}}
function renderTarjetas(res){document.getElementById('ppUF').textContent=res.ppUF.toFixed(2)+' UF';document.getElementById('ppCLP').textContent=CLP(res.ppCLP);document.getElementById('tradUF').textContent=res.trUF.toFixed(2)+' UF';document.getElementById('tradCLP').textContent=CLP(res.trCLP);document.getElementById('ahorroUF').textContent=res.ahUF.toFixed(2)+' UF';document.getElementById('ahorroCLP').textContent=CLP(res.ahCLP);}
function renderGrafico(res){const labels=res.meses.map((_,i)=>'Mes '+(i+1));if(window._chart)window._chart.destroy();window._chart=new Chart(document.getElementById('chartCostos'),{type:'bar',data:{labels,datasets:[{label:'PalletParking (CLP)',data:res.ppMens,backgroundColor:'rgba(242,139,17,0.35)',borderColor:'#F28B11',borderWidth:1},{label:'Tradicional (CLP)',data:res.trMens,backgroundColor:'rgba(25,135,84,0.35)',borderColor:'#198754',borderWidth:1}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});}

async function simular(){const pallets=parseInt(document.getElementById('pallets').value);let months=parseInt(document.getElementById('meses').value);if(months<1)months=1;if(months>12)months=12;const uf=document.getElementById('valorUF').value;const inVals=randomPartition(pallets,months);const outDesired=randomPartition(pallets,months);const outVals=[];let stock=0;for(let i=0;i<months;i++){const disponible=stock+inVals[i];let out_i=(i===months-1)?disponible:Math.min(outDesired[i],disponible);outVals.push(out_i);stock=disponible-out_i;}const wb=await cargarExcel();const ws=wb.Sheets['cliente'];escribirDatos(ws,inVals,outVals,uf);recalcular(wb);const res=leerResultados(ws,months);renderTabla(res);renderTarjetas(res);renderGrafico(res);}

document.getElementById('btnSimular').addEventListener('click',simular);
