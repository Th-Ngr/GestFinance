import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB7ugVILO8olKtzkCJI_7BRlzY6Qe0-rCM",
    authDomain: "gst-financeira.firebaseapp.com",
    projectId: "gst-financeira"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- EXPOSIÇÃO GLOBAL IMEDIATA ---
window.db = db;
let editId = null; 

// --- FUNÇÕES DE AÇÃO (DELETAR E EDITAR) ---
window.deletar = async (id) => {
    if (!confirm("Tem certeza que deseja excluir este lançamento?")) return;
    try {
        await deleteDoc(doc(db, "lancamentos", id));
        alert("Lançamento excluído!");
        carregarLancamentos(); 
    } catch (error) {
        console.error("Erro ao deletar:", error);
    }
};

window.prepararEdicao = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "lancamentos", id));
        if (docSnap.exists()) {
            const dados = docSnap.data();
            editId = id;
            
            // Preenche o Modal (ajuste os IDs se necessário)
            document.getElementById("editData").value = dados.data;
            document.getElementById("editCliente").value = dados.cliente;
            document.getElementById("editDescricao").value = dados.descricao;
            document.getElementById("editValor").value = dados.valor;
            document.getElementById("editTipo").value = dados.tipo;
            document.getElementById("editPagamento").value = dados.pagamento;
            document.getElementById("editStatus").value = dados.status;
            document.getElementById("editAjudante").value = dados.ajudante;

            document.getElementById("editModal").style.display = "block";
        }
    } catch (e) { console.error("Erro ao carregar edição:", e); }
};

// --- AUTENTICAÇÃO ---
const authSection = document.getElementById("auth");
const appSection = document.getElementById("app");
const monthSelect = document.getElementById("monthSelect");

onAuthStateChanged(auth, user => {
    if (user) {
        authSection.style.display = "none";
        appSection.style.display = "flex"; // Ajustado para flex por causa da sidebar
        carregarDadosIniciais();
    } else {
        authSection.style.display = "block";
        appSection.style.display = "none";
    }
});

document.getElementById("btnLogin").addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const pass = document.getElementById("password").value;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (e) { alert("Erro ao entrar: " + e.message); }
});

window.logout = () => signOut(auth);

// --- LÓGICA PRINCIPAL ---
const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function carregarDadosIniciais() {
    monthSelect.innerHTML = "";
    months.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        monthSelect.appendChild(opt);
    });
    monthSelect.value = months[new Date().getMonth()];
    carregarLancamentos();
}

monthSelect.addEventListener("change", carregarLancamentos);

window.addLancamento = async () => {
    const dados = {
        userId: auth.currentUser.uid,
        mes: monthSelect.value,
        data: document.getElementById("data").value,
        cliente: document.getElementById("cliente").value,
        descricao: document.getElementById("descricao").value,
        valor: parseFloat(document.getElementById("valor").value) || 0,
        tipo: document.getElementById("tipo").value,
        pagamento: document.getElementById("pagamento").value,
        status: document.getElementById("status").value,
        ajudante: parseFloat(document.getElementById("ajudante").value) || 0
    };

    try {
        await addDoc(collection(db, "lancamentos"), dados);
        limparFormulario();
        carregarLancamentos();
        alert("Lançamento adicionado!");
    } catch (e) { console.error(e); }
};

async function carregarLancamentos() {
    if (!auth.currentUser) return;
    const q = query(collection(db, "lancamentos"), 
              where("userId", "==", auth.currentUser.uid), 
              where("mes", "==", monthSelect.value));

    try {
        const snap = await getDocs(q);
        const entradaBody = document.getElementById("entradaBody");
        const saidaBody = document.getElementById("saidaBody");
        entradaBody.innerHTML = ""; saidaBody.innerHTML = "";
        
        let totE = 0, totS = 0;
        let itens = [];
        snap.forEach(d => itens.push({ id: d.id, ...d.data() }));
        itens.sort((a, b) => a.data.localeCompare(b.data));

        itens.forEach(item => {
            const [ano, mes, dia] = item.data.split("-");
            const row = `
                <tr>
                    <td>${dia}/${mes}/${ano}</td> 
                    <td>${item.cliente || "-"}</td>
                    <td>${item.descricao || "-"}</td>
                    <td>R$ ${item.valor.toFixed(2)}</td>
                    <td>R$ ${Number(item.ajudante || 0).toFixed(2)}</td>
                    <td>${item.pagamento || "-"}</td>
                    <td><span class="status-${item.status.toLowerCase().replace(" ", "-")}">${item.status}</span></td>
                    <td>
                        <button class="btn-edit" onclick="prepararEdicao('${item.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-delete" onclick="deletar('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;

            if (item.tipo === "entrada") {
                totE += item.valor; entradaBody.innerHTML += row;
            } else {
                totS += item.valor; saidaBody.innerHTML += row;
            }
        });

        document.getElementById("totalEntrada").innerText = totE.toFixed(2);
        document.getElementById("totalSaida").innerText = totS.toFixed(2);
        document.getElementById("lucro").innerText = (totE - totS).toFixed(2);
    } catch (e) { console.error(e); }
}

window.salvarEdicao = async () => {
    if (!editId) return;
    const dados = {
        userId: auth.currentUser.uid,
        mes: monthSelect.value,
        data: document.getElementById("editData").value,
        cliente: document.getElementById("editCliente").value,
        descricao: document.getElementById("editDescricao").value,
        valor: parseFloat(document.getElementById("editValor").value) || 0,
        tipo: document.getElementById("editTipo").value,
        pagamento: document.getElementById("editPagamento").value,
        status: document.getElementById("editStatus").value,
        ajudante: parseFloat(document.getElementById("editAjudante").value) || 0
    };
    try {
        await setDoc(doc(db, "lancamentos", editId), dados);
        fecharModal();
        carregarLancamentos();
        alert("Atualizado!");
    } catch (e) { console.error(e); }
};

window.fecharModal = () => {
    document.getElementById("editModal").style.display = "none";
    editId = null;
};

function limparFormulario() {
    ["data", "cliente", "descricao", "valor", "ajudante"].forEach(id => {
        document.getElementById(id).value = "";
    });
}
