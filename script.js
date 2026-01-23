const entradaBody = document.getElementById("entradaBody");
const saidaBody = document.getElementById("saidaBody");

const pagamento = document.getElementById("pagamento");
const dataInput = document.getElementById("data");
const cliente = document.getElementById("cliente");
const descricao = document.getElementById("descricao");
const valor = document.getElementById("valor");
const tipo = document.getElementById("tipo");
const status = document.getElementById("status");
const ajudante = document.getElementById("ajudante");
const metaInput = document.getElementById("metaInput");

const totalEntrada = document.getElementById("totalEntrada");
const totalSaida = document.getElementById("totalSaida");
const lucro = document.getElementById("lucro");

let editIndex = null;

const months = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const monthSelect = document.getElementById("monthSelect");

months.forEach(m => {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = m;
  monthSelect.appendChild(opt);
});

monthSelect.value = months[new Date().getMonth()];
monthSelect.addEventListener("change", loadMonth);

function getData() {
  return JSON.parse(localStorage.getItem("financeiro")) || {};
}

function saveData(data) {
  localStorage.setItem("financeiro", JSON.stringify(data));
}

function loadMonth() {
  const data = getData();
  const month = monthSelect.value;

  entradaBody.innerHTML = "";
  saidaBody.innerHTML = "";

  const lancamentos = data[month]?.lancamentos || [];

  lancamentos.forEach((l, i) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${l.data || "-"}</td>
      <td>${l.cliente || "-"}</td>
      <td>${l.descricao || "-"}</td>
      <td>R$ ${l.valor.toFixed(2)}</td>
      <td>R$ ${(l.ajudante || 0).toFixed(2)}</td>
      <td>${l.pagamento}</td>
      <td class="${l.status === "Pago" ? "status-pago" : "status-apagar"}">
        ${l.status}
      </td>
      <td>
        <button class="action-btn" onclick="editLancamento(${i})">
          ✏️
        </button>
      </td>
    `;

    if (l.tipo === "entrada") entradaBody.appendChild(tr);
    else saidaBody.appendChild(tr);
  });

  calculate();
}

function addLancamento() {
  const month = monthSelect.value;
  const data = getData();

  if (!data[month]) {
    data[month] = { meta: 0, lancamentos: [] };
  }

  const novoLancamento = {
    data: dataInput.value,
    cliente: cliente.value,
    descricao: descricao.value,
    valor: Number(valor.value),
    tipo: tipo.value,
    pagamento: pagamento.value,
    status: status.value,
    ajudante: Number(ajudante.value || 0)
  };

  if (editIndex !== null) {
    data[month].lancamentos[editIndex] = novoLancamento;
    editIndex = null;
    document.querySelector(".form button").innerText = "Adicionar";
  } else {
    data[month].lancamentos.push(novoLancamento);
  }

  saveData(data);
  clearForm();
  loadMonth();
}

function editLancamento(index) {
  const data = getData();
  const l = data[monthSelect.value].lancamentos[index];

  dataInput.value = l.data;
  cliente.value = l.cliente;
  descricao.value = l.descricao;
  valor.value = l.valor;
  tipo.value = l.tipo;
  pagamento.value = l.pagamento;
  status.value = l.status;
  ajudante.value = l.ajudante;

  editIndex = index;
  document.querySelector(".form button").innerText = "Salvar edição";
}

function saveMeta() {
  const data = getData();
  const month = monthSelect.value;

  if (!data[month]) {
    data[month] = { meta: 0, lancamentos: [] };
  }

  data[month].meta = Number(metaInput.value || 0);
  saveData(data);
}

function calculate() {
  const data = getData()[monthSelect.value];
  if (!data) return;

  let entrada = 0;
  let saida = 0;

  data.lancamentos.forEach(l => {
    if (l.tipo === "entrada") entrada += l.valor;
    else saida += l.valor;
  });

  totalEntrada.textContent = entrada.toFixed(2);
  totalSaida.textContent = saida.toFixed(2);
  lucro.textContent = (entrada - saida).toFixed(2);
}

function clearForm() {
  dataInput.value = "";
  cliente.value = "";
  descricao.value = "";
  valor.value = "";
  ajudante.value = "";
  tipo.value = "entrada";
  status.value = "Pago";
}

loadMonth();
