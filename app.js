import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let todasMovimentacoes = [];
let unsubscribeSnapshot = null;
let grafico = null;
let abaAtual = "entrou";

// Data atual
const hoje = new Date();
document.getElementById('filtro-mes').value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

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
        
        iniciarEscuta();
    } else {
        currentUser = null;
        document.getElementById('view-auth').classList.remove('hidden');
        document.getElementById('view-app').classList.add('hidden');
        if (unsubscribeSnapshot) unsubscribeSnapshot();
    }
});

window.fazerLoginGoogle = () => {
    signInWithPopup(auth, provider).catch(err => alert("Erro: " + err.message));
};

window.fazerLogout = () => signOut(auth);

// Escuta dados
function iniciarEscuta() {
    const movRef = collection(db, "users", currentUser.uid, "movimentacoes");
    unsubscribeSnapshot = onSnapshot(movRef, (snapshot) => {
        todasMovimentacoes = [];
        snapshot.forEach(doc => {
            todasMovimentacoes.push({ id: doc.id, ...doc.data() });
        });
        atualizarTela();
    });
}

// Salvar
window.salvar = async () => {
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const descricao = document.getElementById('descricao').value.trim();
    const valor = parseFloat(document.getElementById('valor').value);
    const categoria = document.getElementById('categoria').value;
    let data = document.getElementById('data').value;
    const qtdParcelas = parseInt(document.getElementById('parcelas').value);
    
    if (!descricao || isNaN(valor)) {
        alert("Preencha a descrição e o valor");
        return;
    }
    
    if (!data) data = new Date().toISOString().split('T')[0];
    
    const valorParcela = valor / qtdParcelas;
    const parcelas = [];
    const dataInicial = new Date(data);
    
    for (let i = 0; i < qtdParcelas; i++) {
        const dataVenc = new Date(dataInicial);
        dataVenc.setMonth(dataInicial.getMonth() + i);
        parcelas.push({
            numero: i + 1,
            valor: valorParcela,
            vencimento: dataVenc.toISOString().split('T')[0],
            pago: false
        });
    }
    
    try {
        await addDoc(collection(db, "users", currentUser.uid, "movimentacoes"), {
            tipo, descricao, valorTotal: valor, categoria,
            dataInicio: data, qtdParcelas, parcelas, criadoEm: new Date().toISOString()
        });
        fecharModal();
        document.getElementById('descricao').value = '';
        document.getElementById('valor').value = '';
        document.getElementById('data').value = '';
        document.getElementById('parcelas').value = '1';
    } catch(err) {
        alert("Erro: " + err.message);
    }
};

// Atualizar tela
function atualizarTela() {
    const mesFiltro = document.getElementById('filtro-mes').value;
    const [ano, mes] = mesFiltro.split('-');
    
    let totalEntrou = 0;
    let totalSaiu = 0;
    const gastosPorCategoria = {};
    
    const entradasMes = [];
    const saidasMes = [];
    
    todasMovimentacoes.forEach(mov => {
        mov.parcelas.forEach(parcela => {
            const dataParc = new Date(parcela.vencimento);
            if (dataParc.getFullYear() === parseInt(ano) && dataParc.getMonth()+1 === parseInt(mes) && parcela.pago) {
                if (mov.tipo === 'entrou') {
                    totalEntrou += parcela.valor;
                    entradasMes.push({ ...mov, parcelaAtual: parcela });
                } else {
                    totalSaiu += parcela.valor;
                    saidasMes.push({ ...mov, parcelaAtual: parcela });
                    const cat = mov.categoria;
                    gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + parcela.valor;
                }
            }
        });
    });
    
    const total = totalEntrou - totalSaiu;
    document.getElementById('card-total').innerHTML = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('card-entrou').innerHTML = `R$ ${totalEntrou.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('card-saiu').innerHTML = `R$ ${totalSaiu.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const corTotal = total >= 0 ? 'text-emerald-400' : 'text-rose-400';
    document.getElementById('card-total').className = `text-xl font-black ${corTotal}`;
    
    renderizarLista(entradasMes, 'entrou');
    renderizarLista(saidasMes, 'saiu');
    atualizarGrafico(gastosPorCategoria);
}

function renderizarLista(itens, tipo) {
    const container = document.getElementById(`lista-${tipo}`);
    if (itens.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-500 py-8">Nenhum registro</div>';
        return;
    }
    
    container.innerHTML = itens.map(item => {
        const parcela = item.parcelaAtual;
        const status = parcela.pago ? '✅' : '⏳';
        const cor = tipo === 'entrou' ? 'emerald' : 'rose';
        return `
            <div class="item-lista">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-bold">${item.descricao}</p>
                        <p class="text-[10px] text-slate-400">${item.categoria}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-${cor}-400">R$ ${parcela.valor.toFixed(2)}</p>
                        <p class="text-[9px] text-slate-500">${parcela.numero}/${item.qtdParcelas} • Vence ${formatarData(parcela.vencimento)}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button onclick="togglePago('${item.id}', ${parcela.numero-1})" class="text-[10px] ${parcela.pago ? 'text-slate-500' : 'text-emerald-400'}">${status} ${parcela.pago ? 'Pago' : 'Marcar pago'}</button>
                    ${!parcela.pago ? `<button onclick="editarParcela('${item.id}', ${parcela.numero-1})" class="text-[10px] text-indigo-400">✏️ Editar</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function togglePago(id, parcelaIndex) {
    const mov = todasMovimentacoes.find(m => m.id === id);
    if (!mov) return;
    const novasParcelas = [...mov.parcelas];
    novasParcelas[parcelaIndex].pago = !novasParcelas[parcelaIndex].pago;
    await updateDoc(doc(db, "users", currentUser.uid, "movimentacoes", id), { parcelas: novasParcelas });
}

function atualizarGrafico(dados) {
    const ctx = document.getElementById('grafico').getContext('2d');
    const categorias = Object.keys(dados);
    const valores = Object.values(dados);
    
    if (grafico) grafico.destroy();
    
    if (categorias.length === 0) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Sem dados', ctx.canvas.width/2, ctx.canvas.height/2);
        return;
    }
    
    grafico = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: categorias, datasets: [{ data: valores, backgroundColor: ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6'] }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
    });
}

window.mostrarAba = (aba) => {
    abaAtual = aba;
    document.getElementById('lista-entrou').classList.toggle('hidden', aba !== 'entrou');
    document.getElementById('lista-saiu').classList.toggle('hidden', aba !== 'saiu');
    document.getElementById('aba-entrou').className = aba === 'entrou' ? 'tab-ativa px-4 py-2 rounded-xl text-sm font-bold' : 'tab-inativa px-4 py-2 rounded-xl text-sm font-bold';
    document.getElementById('aba-saiu').className = aba === 'saiu' ? 'tab-ativa px-4 py-2 rounded-xl text-sm font-bold' : 'tab-inativa px-4 py-2 rounded-xl text-sm font-bold';
};

window.abrirModal = () => document.getElementById('modal').classList.add('active');
window.fecharModal = () => document.getElementById('modal').classList.remove('active');

window.mudarCategorias = () => {
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const select = document.getElementById('categoria');
    if (tipo === 'entrou') {
        select.innerHTML = '<option value="Salário">💼 Salário</option><option value="Freela">💻 Freela</option><option value="Outras entradas">📌 Outras</option>';
    } else {
        select.innerHTML = '<option value="Moradia">🏠 Moradia</option><option value="Alimentação">🍔 Alimentação</option><option value="Transporte">🚗 Transporte</option><option value="Lazer">🎬 Lazer</option><option value="Saúde">💊 Saúde</option><option value="Outras despesas">📌 Outras</option>';
    }
};

function formatarData(dataStr) {
    const d = new Date(dataStr);
    return `${d.getDate()}/${d.getMonth()+1}`;
}

document.getElementById('filtro-mes').addEventListener('change', () => atualizarTela());

window.togglePago = togglePago;
window.editarParcela = (id, idx) => alert('Edição em breve');
