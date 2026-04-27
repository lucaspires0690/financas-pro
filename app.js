import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCHzkNkJK56L4d7ncVbZfjB9pCWacqF3Cc",
    authDomain: "gestor-cobranca.firebaseapp.com",
    projectId: "gestor-cobranca",
    storageBucket: "gestor-cobranca.firebasestorage.app",
    messagingSenderId: "553918891395",
    appId: "1:553918891395:web:be2d2bcbbe13d33c8ee2b6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let devedores = [];
let pessoaAtivaId = null;
let unsubscribeSnapshot = null;

// Autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('view-auth').classList.add('hidden');
        document.getElementById('view-app').classList.remove('hidden');
        
        const userDisplay = document.getElementById('user-display');
        const userPhoto = document.getElementById('user-photo');
        userDisplay.innerText = user.displayName || user.email;
        if(user.photoURL) {
            userPhoto.src = user.photoURL;
            userPhoto.classList.remove('hidden');
        }
        
        iniciarEscutaDados();
    } else {
        currentUser = null;
        document.getElementById('view-auth').classList.remove('hidden');
        document.getElementById('view-app').classList.add('hidden');
        if (unsubscribeSnapshot) unsubscribeSnapshot();
    }
});

window.fazerLoginGoogle = () => {
    signInWithPopup(auth, provider).catch(err => alert("Falha no login: " + err.message));
};

window.fazerLogout = () => signOut(auth);

// Dados
function iniciarEscutaDados() {
    const colRef = collection(db, "users", currentUser.uid, "devedores");
    unsubscribeSnapshot = onSnapshot(colRef, (snapshot) => {
        devedores = [];
        snapshot.forEach(doc => devedores.push({ id: doc.id, ...doc.data() }));
        renderizarLista();
        if (pessoaAtivaId) atualizarViewDetalhes();
    });
}

const getPessoaDoc = (id) => doc(db, "users", currentUser.uid, "devedores", id);

window.renderizarLista = () => {
    const container = document.getElementById('lista-pessoas');
    const empty = document.getElementById('empty-state');
    if (devedores.length === 0) {
        container.innerHTML = "";
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    container.innerHTML = devedores.map(p => {
        const totalPago = (p.pagamentos || []).reduce((acc, pg) => acc + pg.valor, 0);
        const saldo = Math.max(0, p.meta - totalPago);
        return `
        <div onclick="verPessoa('${p.id}')" class="glass-card p-6 rounded-[2rem] cursor-pointer hover:border-indigo-500/50 transition-all active:scale-95 group">
            <h3 class="font-black text-white uppercase text-sm mb-4 group-hover:text-indigo-400 truncate">${p.nome}</h3>
            <div class="flex justify-between items-end">
                <div>
                    <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Restante</p>
                    <p class="text-xl font-black text-white">R$ ${saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
                <div class="bg-indigo-500/10 p-2 rounded-xl">
                     <svg class="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.verPessoa = (id) => {
    pessoaAtivaId = id;
    document.getElementById('view-lista').classList.add('hidden');
    document.getElementById('view-detalhes').classList.remove('hidden');
    atualizarViewDetalhes();
};

window.voltarParaLista = () => {
    pessoaAtivaId = null;
    document.getElementById('view-lista').classList.remove('hidden');
    document.getElementById('view-detalhes').classList.add('hidden');
};

window.salvarPessoa = async () => {
    const nome = document.getElementById('novo-nome').value.trim();
    const valor = parseFloat(document.getElementById('novo-valor').value);
    if (!nome || isNaN(valor)) return;
    const id = Date.now().toString();
    await setDoc(getPessoaDoc(id), { nome, meta: valor, pagamentos: [], criadoEm: new Date().toISOString() });
    fecharModalPessoa();
    document.getElementById('novo-nome').value = "";
    document.getElementById('novo-valor').value = "";
};

window.lancarPagamento = async () => {
    const input = document.getElementById('input-pagamento');
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
    const p = devedores.find(d => d.id === pessoaAtivaId);
    const novos = [...(p.pagamentos || []), { valor, data: new Date().toLocaleString('pt-BR') }];
    await updateDoc(getPessoaDoc(pessoaAtivaId), { pagamentos: novos });
    input.value = "";
};

window.removerPagamento = async (idx) => {
    const p = devedores.find(d => d.id === pessoaAtivaId);
    const novos = [...p.pagamentos];
    novos.splice(idx, 1);
    await updateDoc(getPessoaDoc(pessoaAtivaId), { pagamentos: novos });
};

window.deletarPessoaAtual = async () => {
    if (confirm("Deseja mesmo excluir permanentemente?")) {
        await deleteDoc(getPessoaDoc(pessoaAtivaId));
        voltarParaLista();
    }
};

window.confirmarNovaMeta = async () => {
    const v = parseFloat(document.getElementById('edit-meta').value);
    if (!isNaN(v)) {
        await updateDoc(getPessoaDoc(pessoaAtivaId), { meta: v });
        fecharModalMeta();
    }
};

function atualizarViewDetalhes() {
    const p = devedores.find(d => d.id === pessoaAtivaId);
    if (!p) return;
    const totalPago = (p.pagamentos || []).reduce((acc, pg) => acc + pg.valor, 0);
    const saldo = Math.max(0, p.meta - totalPago);
    const perc = p.meta > 0 ? (totalPago / p.meta) * 100 : 0;
    document.getElementById('detalhe-nome').innerText = p.nome;
    document.getElementById('detalhe-saldo').innerText = `R$ ${saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('detalhe-barra').style.width = `${perc}%`;
    const container = document.getElementById('detalhe-historico');
    container.innerHTML = [...(p.pagamentos || [])].reverse().map((pg, i) => {
        const realIdx = p.pagamentos.length - 1 - i;
        return `<div class="flex justify-between items-center bg-slate-800/40 p-4 rounded-xl mb-2 border border-white/5">
            <div><p class="text-[8px] text-slate-500 font-bold">${pg.data}</p><p class="text-white font-black text-sm">R$ ${pg.valor.toFixed(2)}</p></div>
            <button onclick="removerPagamento(${realIdx})" class="text-slate-700 hover:text-red-500 transition-colors">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>`;
    }).join('') || `<p class="text-center text-slate-700 text-[10px] py-6 font-bold uppercase">Sem registros</p>`;
}

window.abrirModalPessoa = () => document.getElementById('modal-pessoa').classList.add('active');
window.fecharModalPessoa = () => document.getElementById('modal-pessoa').classList.remove('active');
window.abrirModalMeta = () => {
    const p = devedores.find(d => d.id === pessoaAtivaId);
    document.getElementById('edit-meta').value = p.meta;
    document.getElementById('modal-meta').classList.add('active');
};
window.fecharModalMeta = () => document.getElementById('modal-meta').classList.remove('active');