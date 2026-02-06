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

let processandoAtualmente = false;
let editId = null;
const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// --- ELEMENTOS ---
const monthSelect = document.getElementById("monthSelect");
const conteudoPrincipal = document.getElementById('tela-lancamentos');
const perfilSection = document.getElementById('perfilSection');

// --- AUXILIARES ---
function gerarIdUnico(userId, cotaId, mes, ano) {
    const stringPura = `${userId}_${cotaId}_${mes}_${ano}`;
    return stringPura.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
}

function formatarData(dataISO) {
    if (!dataISO) return "-";
    const p = dataISO.split("-");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : dataISO;
}

// --- AUTOMAÇÃO CONTRA DUPLICIDADE ---
async function processarCotasFixas(userId) {
    if (processandoAtualmente) return;
    processandoAtualmente = true;
    const mesTexto = monthSelect.value;
    const anoAtual = new Date().getFullYear();

    try {
        const qFixas = query(collection(db, "cotas_fixas"), where("userId", "==", userId));
        const snapFixas = await getDocs(qFixas);

        for (const docCota of snapFixas.docs) {
            const cota = docCota.data();
            const idUnicoMes = gerarIdUnico(userId, docCota.id, mesTexto, anoAtual);
            const docRef = doc(db, "lancamentos", idUnicoMes);
            
            const checkDoc = await getDoc(docRef);
            if (!checkDoc.exists()) {
                const mesIndex = months.indexOf(mesTexto);
                await setDoc(docRef, {
                    userId, mes: mesTexto,
                    data: `${anoAtual}-${String(mesIndex + 1).padStart(2, '0')}-01`,
                    cliente: cota.cliente || "Cota Fixa",
                    descricao: cota.descricao,
                    valor: parseFloat(cota.valor) || 0,
                    tipo: cota.tipo,
                    pagamento: cota.pagamento || "Mensal",
                    status: "Pendente",
                    ajudante: parseFloat(cota.ajudante) || 0,
                    isFixaGerada: true,
                    cotaIdOriginal: docCota.id
                });
            }
        }
        await carregarLancamentos();
    } finally { processandoAtualmente = false; }
}

// --- CARREGAR DADOS ---
async function carregarLancamentos() {
    if (!auth.currentUser) return;
    const q = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid), where("mes", "==", monthSelect.value));
    const snap = await getDocs(q);
    
    const entradaBody = document.getElementById("entradaBody");
    const saidaBody = document.getElementById("saidaBody");
    entradaBody.innerHTML = ""; saidaBody.innerHTML = "";
    
    let totE = 0, totS = 0;
    snap.forEach(d => {
        const item = d.data();
        const v = parseFloat(item.valor) || 0;
        const iconeFixa = item.isFixaGerada ? ' <i class="fa-solid fa-thumbtack" style="color:#20B2AA"></i>' : '';
        const row = `<tr>
            <td>${formatarData(item.data)}</td>
            <td>${item.cliente || "-"}</td>
            <td>${item.descricao}${iconeFixa}</td>
            <td>R$ ${v.toFixed(2)}</td>
            <td>R$ ${Number(item.ajudante || 0).toFixed(2)}</td>
            <td>${item.pagamento}</td>
            <td><span class="status-${item.status.toLowerCase().replace(" ","-")}">${item.status}</span></td>
            <td>
                <button class="btn-edit" onclick="prepararEdicao('${d.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-delete" onclick="deletar('${d.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
        if (item.tipo === "entrada") { totE += v; entradaBody.innerHTML += row; }
        else { totS += v; saidaBody.innerHTML += row; }
    });

    // CORES DO LUCRO (RESTAURADO)
    const lucro = totE - totS;
    document.getElementById("totalEntrada").innerText = totE.toFixed(2);
    document.getElementById("totalSaida").innerText = totS.toFixed(2);
    const elLucro = document.getElementById("lucro");
    elLucro.innerText = lucro.toFixed(2);
    elLucro.parentElement.style.color = lucro >= 0 ? "#2ecc71" : "#e74c3c";
}

// --- PDF (RESTAURADO COMPLETO) ---
window.pdf = {
    mensal: async () => {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF("p", "mm", "a4");
        const mes = monthSelect.value;
        const meta = parseFloat(document.getElementById("metaInput").value) || 0;

        try {
            const q = query(collection(db, "lancamentos"), 
                      where("userId", "==", auth.currentUser.uid), 
                      where("mes", "==", mes));
            const snap = await getDocs(q);
            
            let entradas = [];
            let saidas = [];
            let totalE = 0;
            let totalS = 0;

            snap.forEach(d => {
                const item = d.data();
                const valor = parseFloat(item.valor) || 0;
                if (item.tipo === "entrada") {
                    entradas.push({ ...item, valor });
                    totalE += valor;
                } else {
                    saidas.push({ ...item, valor });
                    totalS += valor;
                }
            });

            // ORDENAÇÃO: Do mais ANTIGO para o mais NOVO (a - b)
            entradas.sort((a, b) => new Date(a.data) - new Date(b.data));
            saidas.sort((a, b) => new Date(a.data) - new Date(b.data));

            let y = 20;
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(14);
            docPDF.text("RELATÓRIO FINANCEIRO MENSAL", 105, y, { align: "center" });
            y += 12;

            docPDF.setFontSize(10);
            docPDF.setFont("helvetica", "normal");
            docPDF.text(`Mês de Referência: ${mes}`, 15, y);
            y += 6;
            docPDF.text(`Meta Mensal: R$ ${meta.toFixed(2)}`, 15, y);
            y += 6;
            docPDF.line(15, y, 195, y);
            y += 10;

            docPDF.setFont("helvetica", "bold");
            docPDF.text("RESUMO FINANCEIRO", 15, y);
            y += 8;
            docPDF.setFont("helvetica", "normal");
            docPDF.text(`Faturamento Total: R$ ${totalE.toFixed(2)}`, 15, y);
            y += 6;
            docPDF.text(`Total de Despesas: R$ ${totalS.toFixed(2)}`, 15, y);
            y += 6;
            docPDF.text(`Lucro Líquido: R$ ${(totalE - totalS).toFixed(2)}`, 15, y);
            y += 10;
            docPDF.line(15, y, 195, y);
            y += 10;

            // Tabela Entradas
            docPDF.setFont("helvetica", "bold");
            docPDF.text("ENTRADAS", 15, y);
            y += 7;
            docPDF.setFontSize(9);
            docPDF.text("Data", 15, y);
            docPDF.text("Cliente", 40, y);
            docPDF.text("Descrição", 85, y);
            docPDF.text("Valor", 145, y);
            docPDF.text("Pagamento", 170, y);
            y += 3;
            docPDF.line(15, y, 195, y);
            y += 6;

            docPDF.setFont("helvetica", "normal");
            entradas.forEach(item => {
                docPDF.text(formatarData(item.data), 15, y); // Data em DD-MM-AAAA
                docPDF.text(item.cliente || "-", 40, y);
                docPDF.text(item.descricao || "-", 85, y);
                docPDF.text(`R$ ${item.valor.toFixed(2)}`, 145, y);
                docPDF.text(item.pagamento || "-", 170, y);
                y += 6;
                if (y > 280) { docPDF.addPage(); y = 20; }
            });

            y += 10;
            docPDF.setFont("helvetica", "bold");
            docPDF.text("SAÍDAS", 15, y);
            y += 7;
            docPDF.text("Data", 15, y);
            docPDF.text("Origem", 40, y);
            docPDF.text("Descrição", 85, y);
            docPDF.text("Valor", 145, y);
            docPDF.text("Pagamento", 170, y);
            y += 3;
            docPDF.line(15, y, 195, y);
            y += 6;

            docPDF.setFont("helvetica", "normal");
            saidas.forEach(item => {
                docPDF.text(formatarData(item.data), 15, y); // Data em DD-MM-AAAA
                docPDF.text(item.cliente || "-", 40, y);
                docPDF.text(item.descricao || "-", 85, y);
                docPDF.text(`R$ ${item.valor.toFixed(2)}`, 145, y);
                docPDF.text(item.pagamento || "-", 170, y);
                y += 6;
                if (y > 280) { docPDF.addPage(); y = 20; }
            });

            docPDF.save(`Relatorio_Financeiro_${mes}.pdf`);
        } catch (e) { console.error("Erro PDF Mensal:", e); }
    },

    anual: async () => {
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF("p", "mm", "a4");
        
        try {
            const q = query(collection(db, "lancamentos"), where("userId", "==", auth.currentUser.uid));
            const snap = await getDocs(q);
            
            const resumo = {};
            months.forEach(m => resumo[m] = { e: 0, s: 0 });

            snap.forEach(d => {
                const data = d.data();
                const valor = parseFloat(data.valor) || 0;
                if (resumo[data.mes]) {
                    if (data.tipo === "entrada") resumo[data.mes].e += valor;
                    else resumo[data.mes].s += valor;
                }
            });

            let y = 20;
            docPDF.setFont("helvetica", "bold");
            docPDF.setFontSize(14);
            docPDF.text("RESUMO FINANCEIRO ANUAL", 105, y, { align: "center" });
            y += 15;

            docPDF.setFontSize(10);
            docPDF.text("Mês", 15, y);
            docPDF.text("Entradas", 70, y);
            docPDF.text("Saídas", 115, y);
            docPDF.text("Total", 160, y);
            y += 3;
            docPDF.line(15, y, 195, y);
            y += 7;

            docPDF.setFont("helvetica", "normal");
            months.forEach(m => {
                const totalMes = resumo[m].e - resumo[m].s;
                docPDF.text(m, 15, y);
                docPDF.text(`R$ ${resumo[m].e.toFixed(2)}`, 70, y);
                docPDF.text(`R$ ${resumo[m].s.toFixed(2)}`, 115, y);
                
                if(totalMes < 0) docPDF.setTextColor(231, 76, 60);
                docPDF.text(`R$ ${totalMes.toFixed(2)}`, 160, y);
                docPDF.setTextColor(0, 0, 0);
                y += 6;
            });

            // --- BARRA DE TOTAIS GERAIS (ANUAL) ---
            const totalGeralE = Object.values(resumo).reduce((acc, val) => acc + val.e, 0);
            const totalGeralS = Object.values(resumo).reduce((acc, val) => acc + val.s, 0);
            const lucroGeral = totalGeralE - totalGeralS;

            y += 4;
            docPDF.setFillColor(240, 240, 240);
            docPDF.rect(15, y, 180, 12, "F"); 

            docPDF.setFont("helvetica", "bold");
            docPDF.text("TOTAIS GERAIS:", 17, y + 8);
            docPDF.text(`R$ ${totalGeralE.toFixed(2)}`, 70, y + 8);
            docPDF.text(`R$ ${totalGeralS.toFixed(2)}`, 115, y + 8);

            if(lucroGeral >= 0) docPDF.setTextColor(46, 204, 113);
            else docPDF.setTextColor(231, 76, 60);
            
            docPDF.text(`R$ ${lucroGeral.toFixed(2)}`, 160, y + 8);
            docPDF.setTextColor(0, 0, 0);

            docPDF.save("Resumo_Financeiro_Anual.pdf");
        } catch (error) { console.error("Erro PDF Anual:", error); }
    }
};


// --- NAVEGAÇÃO SPA ---
window.navegar = async (pagina) => {
    const navHome = document.getElementById("nav-home");
    const navConfig = document.getElementById("btnConfiguracoes");
    if (pagina === 'perfil') {
        conteudoPrincipal.style.display = 'none';
        perfilSection.style.display = 'block';
        navConfig.classList.add("active");
        if(navHome) navHome.classList.remove("active");
        carregarDadosPerfil();
        carregarGestaoFixas();
    } else {
        perfilSection.style.display = 'none';
        conteudoPrincipal.style.display = 'block';
        navConfig.classList.remove("active");
        if(navHome) navHome.classList.add("active");
        carregarLancamentos();
    }
};

// --- INICIALIZAÇÃO ---
onAuthStateChanged(auth, user => {
    if (user) {
        document.getElementById("auth").style.display = "none";
        document.getElementById("app").style.display = "block";
        monthSelect.innerHTML = "";
        months.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m; opt.textContent = m;
            monthSelect.appendChild(opt);
        });
        monthSelect.value = months[new Date().getMonth()];
        processarCotasFixas(user.uid);
    } else {
        document.getElementById("auth").style.display = "flex";
        document.getElementById("app").style.display = "none";
    }
});

monthSelect.addEventListener("change", () => {
    if (auth.currentUser) {
        carregarLancamentos();
        processarCotasFixas(auth.currentUser.uid);
    }
});

// Botão Adicionar
window.addLancamento = async () => {
    if (!auth.currentUser) return;
    const isFixa = document.getElementById("isFixa").checked;
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

    if (isFixa) {
        const cotaRef = await addDoc(collection(db, "cotas_fixas"), dados);
        const idFixo = gerarIdUnico(auth.currentUser.uid, cotaRef.id, monthSelect.value, new Date().getFullYear());
        await setDoc(doc(db, "lancamentos", idFixo), { ...dados, isFixaGerada: true, cotaIdOriginal: cotaRef.id });
    } else {
        await addDoc(collection(db, "lancamentos"), { ...dados, isFixaGerada: false });
    }
    carregarLancamentos();
};

window.logout = () => signOut(auth);
window.deletar = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, "lancamentos", id)); carregarLancamentos(); } };

// Funções de Perfil
async function carregarDadosPerfil() {
    const d = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
    if(d.exists()){
        document.getElementById("perfilNome").innerText = d.data().nome;
        document.getElementById("perfilEmail").innerText = auth.currentUser.email;
    }
}

async function carregarGestaoFixas() {
    const container = document.getElementById("listaFixasGerenciamento");
    const q = query(collection(db, "cotas_fixas"), where("userId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    container.innerHTML = "";
    snap.forEach(d => {
        container.innerHTML += `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
            <span>${d.data().descricao}</span>
            <button onclick="removerCotaFixa('${d.id}')" style="color:red; border:none; background:none;">Excluir</button>
        </div>`;
    });
}

window.removerCotaFixa = async (id) => { 
    if(confirm("Remover molde?")) { 
        await deleteDoc(doc(db, "cotas_fixas", id)); carregarGestaoFixas(); } };
// --- FUNÇÕES GLOBAIS PARA A TABELA ---

// 1. Preparar Edição (Torna global para o onclick do botão)
window.prepararEdicao = async (id) => {
    try {
        const docRef = doc(db, "lancamentos", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const dados = docSnap.data();
            editId = id; // Guarda o ID para o salvamento saber quem editar

            // Preenche os campos do modal de edição
            document.getElementById("editData").value = dados.data || "";
            document.getElementById("editCliente").value = dados.cliente || "";
            document.getElementById("editDescricao").value = dados.descricao || "";
            document.getElementById("editValor").value = dados.valor || 0;
            document.getElementById("editTipo").value = dados.tipo || "entrada";
            document.getElementById("editPagamento").value = dados.pagamento || "";
            document.getElementById("editStatus").value = dados.status || "";
            document.getElementById("editAjudante").value = dados.ajudante || 0;

            // Abre o modal
            const modalEdicao = document.getElementById("editModal");
            if (modalEdicao) modalEdicao.style.display = "block";
        }
    } catch (e) { 
        console.error("Erro ao carregar edição:", e); 
    }
};

// 2. Deletar (Torna global para o onclick do botão)
window.deletar = async (id) => {
    if (confirm("Deseja realmente excluir este registro?")) {
        try {
            await deleteDoc(doc(db, "lancamentos", id));
            carregarLancamentos(); // Atualiza a tabela após deletar
        } catch (e) {
            console.error("Erro ao deletar:", e);
        }
    }
};

// 3. Salvar Edição (Torna global para o botão dentro do modal)
window.salvarEdicao = async () => {
    if (!editId) return;

    const dadosAtualizados = {
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
        await setDoc(doc(db, "lancamentos", editId), dadosAtualizados, { merge: true });
        alert("Alterações salvas!");
        window.fecharModal(); 
        carregarLancamentos();
    } catch (e) { 
        console.error("Erro ao salvar:", e);
    }
};

// 4. Fechar Modal
window.fecharModal = () => {
    const modalEdicao = document.getElementById("editModal");
    if (modalEdicao) modalEdicao.style.display = "none";
    editId = null;
};