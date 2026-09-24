import { state } from './state.js';
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, setDoc,
    addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BOBINAS_CONFIG = {
    apiKey: "AIzaSyCdmN2-46flKUuoddEtIzVtZ--egy46ON4",
    authDomain: "inventariopp-f4689.firebaseapp.com",
    projectId: "inventariopp-f4689",
    storageBucket: "inventariopp-f4689.firebasestorage.app",
    messagingSenderId: "683549201271",
    appId: "1:683549201271:web:d02e542ea0a7df39b30772"
};

let bDb, bAuth, bUserId;
let bInventarioReady = false;
let _sacando = null; // coil currently being removed from stock

// ── Solicitudes Pendientes (Local Storage) ──────────────────────────────────
function cargarSolicitudesPendientes() {
    try {
        const guardado = localStorage.getItem('bobinas_solicitudes_pendientes');
        state.bobinasSolicitudesPendientes = guardado ? JSON.parse(guardado) : [];
    } catch (e) {
        console.error('Error cargando solicitudes pendientes:', e);
        state.bobinasSolicitudesPendientes = [];
    }
}

function guardarSolicitudesPendientes() {
    try {
        localStorage.setItem('bobinas_solicitudes_pendientes', JSON.stringify(state.bobinasSolicitudesPendientes || []));
    } catch (e) {
        console.error('Error guardando solicitudes pendientes:', e);
    }
}

function actualizarBadgePendientes() {
    const count = (state.bobinasSolicitudesPendientes || []).length;
    const badge = document.getElementById('bobinas-pendientes-count');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    const btnLimpiar = document.getElementById('bobinas-btn-limpiar-pendientes');
    if (btnLimpiar) {
        btnLimpiar.style.display = count > 1 ? 'inline-block' : 'none';
    }
}

// ── Formulas ─────────────────────────────────────────────────────────────────
function calcKilos(ancho, espesor, metros) {
    const factor = (ancho * espesor * 184) / 10000;
    return parseFloat(((metros * factor) / 1000).toFixed(2));
}
function calcMetros(ancho, espesor, kilos) {
    const factor = (ancho * espesor * 184) / 10000;
    if (!factor) return 0;
    return parseFloat(((kilos * 1000) / factor).toFixed(2));
}

// ── Toast notifications ──────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    if (type === 'error') { window.showAlert(msg); return; }
    const container = document.getElementById('bobinas-toast-container');
    if (!container) return;
    const id = 'bt-' + Date.now();
    const bg = type === 'success' ? 'bg-success' : 'bg-info';
    const el = document.createElement('div');
    el.id = id;
    el.className = `toast align-items-center text-white border-0 ${bg}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    container.appendChild(el);
    const t = new bootstrap.Toast(el, { autohide: true, delay: 3000 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}

// ── Firestore cart persistence ───────────────────────────────────────────────
async function saveCart() {
    if (!bUserId || !bDb) return;
    await setDoc(doc(bDb, 'carritos', bUserId), { items: state.bobinasCartItems }, { merge: true });
}

// ── Cart UI ──────────────────────────────────────────────────────────────────
function updateCartBar() {
    const bar = document.getElementById('bobinas-cart-bar');
    const count = document.getElementById('bobinas-cart-count');
    if (!bar) return;
    const visible = state.bobinasCartItems.length > 0 && state.currentActivePanel === 'bobinas';
    bar.style.display = visible ? 'flex' : 'none';
    if (!visible) {
        const details = document.getElementById('bobinas-cart-details');
        if (details) details.style.display = 'none';
    }
    if (count) count.textContent = state.bobinasCartItems.length;
    renderCartTable();
}

function renderCartTable() {
    const tbody = document.getElementById('bobinas-cart-tbody');
    if (!tbody) return;
    if (!state.bobinasCartItems.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-2">El carrito está vacío.</td></tr>';
        return;
    }
    tbody.innerHTML = state.bobinasCartItems.map((item, i) => `
        <tr>
            <td>${item.articuloNombre}</td>
            <td class="text-end">${Math.round(Number(item.metrosASacar))} m</td>
            <td>${item.cliente || 'N/A'}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="bobinasQuitarItem(${i})" title="Quitar">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        </tr>`).join('');
}

window.bobinasToggleCartDetails = function() {
    const d = document.getElementById('bobinas-cart-details');
    if (!d) return;
    d.style.display = d.style.display === 'none' || !d.style.display ? 'block' : 'none';
};

// ── Pestañas de Stock Bobinas ─────────────────────────────────────────────────
export function switchBobinasTab(tab) {
    state.activeBobinasTab = tab;

    const btnPendientes = document.getElementById('tab-btn-bobinas-pendientes');
    const btnLista = document.getElementById('tab-btn-bobinas-lista');
    const secPendientes = document.getElementById('bobinas-section-pendientes');
    const secLista = document.getElementById('bobinas-section-lista');

    if (btnPendientes) btnPendientes.classList.toggle('active', tab === 'pendientes');
    if (btnLista) btnLista.classList.toggle('active', tab === 'lista');

    if (secPendientes) secPendientes.style.display = tab === 'pendientes' ? 'block' : 'none';
    if (secLista) secLista.style.display = tab === 'lista' ? 'block' : 'none';

    actualizarBadgePendientes();

    if (tab === 'pendientes') {
        renderizarSolicitudesPendientes();
    } else {
        renderizarTablaBobinas();
    }
}
window.switchBobinasTab = switchBobinasTab;

// ── Render Solicitudes Pendientes ────────────────────────────────────────────
export function renderizarSolicitudesPendientes() {
    const tbody = document.getElementById('bobinas-pendientes-tbody');
    const footer = document.getElementById('bobinas-pendientes-footer');
    if (!tbody) return;

    cargarSolicitudesPendientes();
    actualizarBadgePendientes();

    const items = state.bobinasSolicitudesPendientes || [];
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-5">
            <i class="bi bi-bell-slash fs-2 d-block mb-2 opacity-50"></i>
            <strong>No hay solicitudes pendientes</strong>
            <p class="small mb-0 mt-1">Cuando confirmes un pedido desde el carrito y se descargue el PDF, aparecerá acá como recordatorio.</p>
        </td></tr>`;
        if (footer) footer.textContent = 'Sin solicitudes pendientes.';
        return;
    }

    if (footer) footer.textContent = `${items.length} solicitud(es) pendiente(s) de retiro / trabajo.`;

    tbody.innerHTML = items.map((sol) => {
        const fecha = new Date(sol.fecha);
        const fechaStr = isNaN(fecha.getTime()) ? (sol.fecha || '—') : fecha.toLocaleDateString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const articulosTexto = (sol.items || []).map(it => `• <strong>${it.articuloNombre}</strong> (${Math.round(Number(it.metrosASacar))} m)`).join('<br>');
        const clientes = [...new Set((sol.items || []).map(it => it.cliente || it.destino?.cliente || 'Varios'))].join(', ');
        const depositos = [...new Set((sol.items || []).map(it => it.deposito || it.destino?.deposito || 'Depósito General'))].join(', ');
        const totalMetros = (sol.items || []).reduce((s, it) => s + Number(it.metrosASacar || 0), 0);

        return `
            <tr>
                <td class="text-nowrap"><i class="bi bi-calendar3 me-1 text-muted"></i>${fechaStr}</td>
                <td>
                    <div style="font-size:0.9rem;">${articulosTexto}</div>
                    <small class="text-muted">${(sol.items || []).length} ítem(s) en la solicitud</small>
                </td>
                <td><span class="badge bg-secondary">${clientes}</span></td>
                <td><small>${depositos}</small></td>
                <td class="text-end"><strong>${Math.round(totalMetros)}</strong> m</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-outline-info me-1" onclick="bobinasVerDetallePendiente('${sol.id}')" title="Ver detalle">
                        <i class="bi bi-eye-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="bobinasEliminarPendiente('${sol.id}')" title="Eliminar recordatorio">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
window.renderizarSolicitudesPendientes = renderizarSolicitudesPendientes;

window.bobinasVerDetallePendiente = function(id) {
    const sol = (state.bobinasSolicitudesPendientes || []).find(s => s.id === id);
    if (!sol) return;

    const fecha = new Date(sol.fecha);
    const fechaStr = isNaN(fecha.getTime()) ? (sol.fecha || '—') : fecha.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const titleEl = document.getElementById('modalBobinaDetallePendienteTitle');
    const bodyEl = document.getElementById('modalBobinaDetallePendienteBody');
    if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>Solicitud del ${fechaStr}`;

    if (bodyEl) {
        let itemsHtml = (sol.items || []).map((it, idx) => {
            const dest = it.destino;
            return `
                <div class="card mb-3 p-3" style="background:var(--card-bg); border-left: 4px solid var(--accent-color);">
                    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap">
                        <h6 class="mb-0"><strong>Ítem #${idx + 1}: ${it.articuloNombre}</strong></h6>
                        <span class="badge ${it.isFromStock ? 'bg-primary' : 'bg-secondary'}">${it.isFromStock ? 'Desde Stock' : 'Manual'}</span>
                    </div>
                    <div class="row g-2 small">
                        <div class="col-md-6">
                            <strong>Origen:</strong><br>
                            • Material: ${it.material || 'N/A'}<br>
                            • Depósito: ${it.deposito || 'Depósito General'}<br>
                            • Cliente: ${it.cliente || 'Varios'}<br>
                            • Metros: <strong>${Math.round(Number(it.metrosASacar))} m</strong>
                            ${it.ancho ? `<br>• Medidas: ${it.ancho} x ${it.espesor}` : ''}
                        </div>
                        <div class="col-md-6">
                            <strong>Destino:</strong><br>
                            ${dest ? `
                                • Depósito destino: ${dest.deposito}<br>
                                • Cliente destino: ${dest.cliente}<br>
                                • Código destino: ${dest.codigo}<br>
                                • Medidas: ${dest.ancho} x ${dest.largo || '—'} x ${dest.espesor}<br>
                                • Bobinas / Etiquetas: <strong>${dest.cantidad}</strong>
                            ` : '—'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = `
            <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2 pb-2 border-bottom">
                <div>
                    <span class="badge bg-warning text-dark me-2">Recordatorio Pendiente</span>
                    <small class="text-muted">Total: ${Math.round((sol.items || []).reduce((s, it) => s + Number(it.metrosASacar || 0), 0))} metros</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="bootstrap.Modal.getInstance(document.getElementById('modalBobinaDetallePendiente'))?.hide(); bobinasEliminarPendiente('${sol.id}')">
                    <i class="bi bi-trash-fill me-1"></i>Eliminar recordatorio
                </button>
            </div>
            ${itemsHtml}
        `;
    }

    new bootstrap.Modal(document.getElementById('modalBobinaDetallePendiente')).show();
};

window.bobinasEliminarPendiente = function(id) {
    window.showConfirm('¿Eliminar este recordatorio de solicitud? (No altera el inventario ni el historial)', ok => {
        if (!ok) return;
        state.bobinasSolicitudesPendientes = (state.bobinasSolicitudesPendientes || []).filter(s => s.id !== id);
        guardarSolicitudesPendientes();
        renderizarSolicitudesPendientes();
        showToast('Recordatorio eliminado.', 'info');
    });
};

window.bobinasLimpiarTodasPendientes = function() {
    window.showConfirm('¿Eliminar todos los recordatorios de solicitudes pendientes?', ok => {
        if (!ok) return;
        state.bobinasSolicitudesPendientes = [];
        guardarSolicitudesPendientes();
        renderizarSolicitudesPendientes();
        showToast('Todas las solicitudes pendientes fueron eliminadas.', 'info');
    });
};

// ── Render inventory table ───────────────────────────────────────────────────
export function renderizarTablaBobinas() {
    const tbody = document.getElementById('bobinas-tabla-body');
    const footer = document.getElementById('bobinas-footer');
    if (!tbody) return;

    if (!bInventarioReady) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>Conectando con Stock Bobinas...
        </td></tr>`;
        return;
    }

    const search = (state.elements.buscador?.value || '').toLowerCase();
    const filter = state.currentSearchFilter;
    const filtered = state.bobinasData.filter(b => {
        if (!search) return true;
        if (filter === 'materialBobina') return (b.material || '').toLowerCase().includes(search);
        return (b.nombre || '').toLowerCase().includes(search);
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No se encontraron bobinas.</td></tr>';
    } else {
        tbody.innerHTML = filtered.map(item => `
            <tr>
                <td><strong>${item.nombre}</strong></td>
                <td>${item.material || 'N/A'}</td>
                <td class="text-end">${Math.round(Number(item.metros))}</td>
                <td class="text-end">${Number(item.kilos).toFixed(2)}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning" onclick="bobinasAbrirEditar('${item.id}')" title="Editar">
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="bobinasEliminar('${item.id}')" title="Eliminar">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="bobinasAbrirSacar('${item.id}')" title="Sacar Bobina">
                        <i class="bi bi-send-fill"></i>
                    </button>
                </td>
            </tr>`).join('');
    }

    const totalMetros = state.bobinasData.reduce((s, b) => s + Number(b.metros || 0), 0);
    const totalKilos  = state.bobinasData.reduce((s, b) => s + Number(b.kilos  || 0), 0);
    if (footer) footer.innerHTML =
        `${state.bobinasData.length} tipo(s) en stock · <strong>${Math.round(totalMetros)}</strong> m totales · <strong>${totalKilos.toFixed(1)}</strong> kg totales`;

    updateCartBar();
}

export function renderizarBobinasPanel() {
    cargarSolicitudesPendientes();
    const tab = state.activeBobinasTab || 'pendientes';
    switchBobinasTab(tab);
}

// ── Firebase init & listeners ────────────────────────────────────────────────
export function initBobinas() {
    cargarSolicitudesPendientes();
    const existing = getApps().find(a => a.name === 'bobinas-app');
    const app = existing || initializeApp(BOBINAS_CONFIG, 'bobinas-app');
    bDb   = getFirestore(app);
    bAuth = getAuth(app);

    onAuthStateChanged(bAuth, user => {
        if (user) {
            bUserId = user.uid;
            _setupListeners();
        } else {
            signInAnonymously(bAuth).catch(console.error);
        }
    });
}

function _setupListeners() {
    // Inventario
    onSnapshot(collection(bDb, 'inventario'), snap => {
        state.bobinasData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        bInventarioReady = true;
        if (state.currentActivePanel === 'bobinas') {
            if (state.activeBobinasTab === 'lista') {
                renderizarTablaBobinas();
            } else {
                renderizarSolicitudesPendientes();
            }
        }
    }, err => console.error('bobinas/inventario', err));

    // Historial
    onSnapshot(collection(bDb, 'historial'), snap => {
        state.bobinasHistorialData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, err => console.error('bobinas/historial', err));

    // Cart (per user)
    onSnapshot(doc(bDb, 'carritos', bUserId), snap => {
        state.bobinasCartItems = snap.exists() ? (snap.data().items || []) : [];
        updateCartBar();
    }, err => console.error('bobinas/carritos', err));
}

// ── Agregar bobina ───────────────────────────────────────────────────────────
window.bobinasPreparaNueva = function() {
    document.getElementById('bobinas-form-agregar')?.reset();
    document.getElementById('bobinas-kilos-preview').textContent = '';
    const toggle = document.getElementById('b-unit-toggle');
    if (toggle) { toggle.checked = true; document.getElementById('b-unit-label').textContent = 'Metros'; }
};

window.bobinasToggleUnidad = function() {
    const toggle = document.getElementById('b-unit-toggle');
    document.getElementById('b-unit-label').textContent = toggle.checked ? 'Metros' : 'Kilos';
    bobinasPreviewKilos();
};

window.bobinasPreviewKilos = function() {
    const ancho   = parseFloat(document.getElementById('b-ancho').value)   || 0;
    const espesor = parseFloat(document.getElementById('b-espesor').value) || 0;
    const valor   = parseFloat(document.getElementById('b-valor').value)   || 0;
    const esMetros = document.getElementById('b-unit-toggle')?.checked;
    const preview = document.getElementById('bobinas-kilos-preview');
    if (ancho && espesor && valor) {
        const factor = (ancho * espesor * 184) / 10000;
        const kg = esMetros ? (valor * factor) / 1000 : valor;
        const m  = esMetros ? valor : calcMetros(ancho, espesor, valor);
        preview.textContent = esMetros ? `≈ ${kg.toFixed(2)} kg` : `≈ ${Math.round(m)} m`;
    } else {
        preview.textContent = '';
    }
};

window.bobinasGuardar = async function() {
    const material = document.getElementById('b-material').value;
    const ancho    = parseFloat(document.getElementById('b-ancho').value);
    const espesor  = parseFloat(document.getElementById('b-espesor').value);
    const tipo     = document.getElementById('b-tipo').value;
    const valor    = parseFloat(document.getElementById('b-valor').value);
    const esMetros = document.getElementById('b-unit-toggle').checked;

    if (!material || !tipo || isNaN(ancho) || isNaN(espesor) || isNaN(valor) || valor <= 0) {
        window.showAlert('Completá todos los campos con valores válidos.');
        return;
    }
    const factor = (ancho * espesor * 184) / 10000;
    if (!factor) { window.showAlert('Ancho o espesor inválido para el cálculo.'); return; }

    const metros = esMetros ? valor : calcMetros(ancho, espesor, valor);
    const kilos  = esMetros ? calcKilos(ancho, espesor, valor) : valor;
    const nombre = `${ancho}x${espesor} ${tipo}`;

    try {
        const q    = query(collection(bDb, 'inventario'), where('nombre', '==', nombre), where('material', '==', material));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const ex = snap.docs[0];
            const ed = ex.data();
            await updateDoc(doc(bDb, 'inventario', ex.id), {
                metros: Math.round(Number(ed.metros) + metros),
                kilos:  parseFloat((Number(ed.kilos) + kilos).toFixed(2))
            });
            showToast('Bobina existente actualizada con éxito.');
        } else {
            await addDoc(collection(bDb, 'inventario'), { nombre, material, metros: Math.round(metros), kilos });
            showToast('Nueva bobina agregada al stock.');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalBobinaAgregar'))?.hide();
        document.getElementById('bobinas-form-agregar').reset();
        document.getElementById('bobinas-kilos-preview').textContent = '';
    } catch(e) {
        console.error(e);
        window.showAlert('Error al guardar la bobina.');
    }
};

// ── Editar bobina ────────────────────────────────────────────────────────────
window.bobinasAbrirEditar = function(id) {
    const item = state.bobinasData.find(b => b.id === id);
    if (!item) return;
    const parts = item.nombre.split(' ');
    const dims  = parts[0].split('x');

    document.getElementById('b-edit-id').value       = id;
    document.getElementById('b-edit-material').value = item.material || '';
    document.getElementById('b-edit-ancho').value    = dims[0] || '';
    document.getElementById('b-edit-espesor').value  = dims[1] || '';
    document.getElementById('b-edit-tipo').value     = parts.slice(1).join(' ');
    document.getElementById('b-edit-metros').value   = item.metros;

    new bootstrap.Modal(document.getElementById('modalBobinaEditar')).show();
};

window.bobinasGuardarEdicion = async function() {
    const id      = document.getElementById('b-edit-id').value;
    const material= document.getElementById('b-edit-material').value;
    const ancho   = parseFloat(document.getElementById('b-edit-ancho').value);
    const espesor = parseFloat(document.getElementById('b-edit-espesor').value);
    const tipo    = document.getElementById('b-edit-tipo').value;
    const metros  = parseFloat(document.getElementById('b-edit-metros').value);

    if (!id || !material || !tipo || isNaN(ancho) || isNaN(espesor) || isNaN(metros) || metros < 0) {
        window.showAlert('Completá todos los campos correctamente.');
        return;
    }
    const kilos = calcKilos(ancho, espesor, metros);
    try {
        await updateDoc(doc(bDb, 'inventario', id), {
            nombre: `${ancho}x${espesor} ${tipo}`, material, metros, kilos
        });
        showToast('Bobina actualizada.');
        bootstrap.Modal.getInstance(document.getElementById('modalBobinaEditar'))?.hide();
    } catch(e) {
        console.error(e);
        window.showAlert('Error al actualizar la bobina.');
    }
};

// ── Eliminar bobina ──────────────────────────────────────────────────────────
window.bobinasEliminar = function(id) {
    const item = state.bobinasData.find(b => b.id === id);
    if (!item) return;
    window.showConfirm(
        `¿Eliminar la bobina <strong>${item.nombre}</strong> permanentemente? Esta acción no se puede deshacer.`,
        async ok => {
            if (!ok) return;
            try {
                await deleteDoc(doc(bDb, 'inventario', id));
                await addDoc(collection(bDb, 'historial'), {
                    fecha: new Date().toISOString(),
                    articulo: item.nombre,
                    metrosMovidos: Math.round(Number(item.metros)),
                    estado: 'Eliminado Completo',
                    observacion: 'Eliminación directa desde tabla.'
                });
                showToast('Bobina eliminada.');
            } catch(e) {
                console.error(e);
                window.showAlert('Error al eliminar la bobina.');
            }
        }
    );
};

// ── Modal Unificado: Sacar Bobina de Stock vs Movimiento Manual ──────────────
window.bobinasAbrirSacar = async function(id) {
    const item = state.bobinasData.find(b => b.id === id);
    if (!item) return;
    _sacando = item;

    const form = document.getElementById('bobinas-form-manual');
    if (form) form.reset();

    const title = document.getElementById('modalBobinaManualTitle');
    if (title) title.innerHTML = `<i class="bi bi-send-fill me-2"></i>Solicitud de Bobina: <span class="fw-normal" style="color:var(--accent-color)">${item.nombre}</span>`;

    const badge = document.getElementById('b-manual-stock-disponible-badge');
    if (badge) {
        badge.textContent = `Stock disponible: ${Math.round(item.metros)} m · ${item.kilos} kg`;
        badge.style.display = 'inline-block';
    }

    // Autocompletar datos de origen desde la bobina seleccionada
    const parts = (item.nombre || '').split(' ');
    const dims = (parts[0] || '').split('x');
    const ancho = dims[0] || '';
    const espesor = dims[1] || '';

    const origId = document.getElementById('b-manual-origen-id');
    const origDep = document.getElementById('b-manual-origen-deposito');
    const origMat = document.getElementById('b-manual-origen-material');
    const origCli = document.getElementById('b-manual-origen-cliente');
    const origCod = document.getElementById('b-manual-origen-codigo');
    const origAncho = document.getElementById('b-manual-origen-ancho');
    const origEsp = document.getElementById('b-manual-origen-espesor');
    const origMet = document.getElementById('b-manual-origen-metros');
    const kilosCalc = document.getElementById('b-manual-kilos-calc');

    if (origId) origId.value = item.id;
    if (origDep) origDep.value = 'Depósito General';
    if (origMat) origMat.value = item.material || '';
    if (origCli) origCli.value = 'Varios';
    if (origCod) origCod.value = item.nombre;
    if (origAncho) origAncho.value = ancho;
    if (origEsp) origEsp.value = espesor;
    if (origMet) {
        origMet.value = '';
        origMet.placeholder = `Máx: ${Math.round(item.metros)} m`;
    }
    if (kilosCalc) kilosCalc.value = '';

    // Valores iniciales de destino
    const destDep = document.getElementById('b-manual-destino-deposito');
    const destCli = document.getElementById('b-manual-destino-cliente');
    const destCod = document.getElementById('b-manual-destino-codigo');
    const destAncho = document.getElementById('b-manual-destino-ancho');
    const destLargo = document.getElementById('b-manual-destino-largo');
    const destEsp = document.getElementById('b-manual-destino-espesor');
    const destCant = document.getElementById('b-manual-destino-cantidad');

    if (destDep) destDep.value = 'Depósito de Confección';
    if (destCli) destCli.value = 'Varios';
    if (destCod) destCod.value = item.nombre;
    if (destAncho) destAncho.value = ancho;
    if (destLargo) destLargo.value = '';
    if (destEsp) destEsp.value = espesor;
    if (destCant) destCant.value = '1';

    new bootstrap.Modal(document.getElementById('modalBobinaManual')).show();
};

window.bobinasAbrirManual = function() {
    _sacando = null;
    const form = document.getElementById('bobinas-form-manual');
    if (form) form.reset();

    const title = document.getElementById('modalBobinaManualTitle');
    if (title) title.innerHTML = '<i class="bi bi-arrow-left-right me-2"></i>Movimiento Manual de Bobinas';

    const badge = document.getElementById('b-manual-stock-disponible-badge');
    if (badge) badge.style.display = 'none';

    const origId = document.getElementById('b-manual-origen-id');
    if (origId) origId.value = '';

    const origCli = document.getElementById('b-manual-origen-cliente');
    if (origCli) origCli.value = 'Varios';

    const origMet = document.getElementById('b-manual-origen-metros');
    if (origMet) origMet.placeholder = '';

    const kilosCalc = document.getElementById('b-manual-kilos-calc');
    if (kilosCalc) kilosCalc.value = '';

    const destCli = document.getElementById('b-manual-destino-cliente');
    if (destCli) destCli.value = 'Varios';

    new bootstrap.Modal(document.getElementById('modalBobinaManual')).show();
};

window.bobinasCalcularKilosManual = function() {
    const a = parseFloat(document.getElementById('b-manual-origen-ancho').value)   || 0;
    const e = parseFloat(document.getElementById('b-manual-origen-espesor').value) || 0;
    const m = parseFloat(document.getElementById('b-manual-origen-metros').value)  || 0;
    if (a && e && m) {
        document.getElementById('b-manual-kilos-calc').value = calcKilos(a, e, m).toFixed(2);
    } else {
        document.getElementById('b-manual-kilos-calc').value = '';
    }
};

window.bobinasConfirmarManual = async function() {
    const origId = document.getElementById('b-manual-origen-id').value;
    const od = document.getElementById('b-manual-origen-deposito').value;
    const om = document.getElementById('b-manual-origen-material').value;
    const oc = document.getElementById('b-manual-origen-cliente').value.trim();
    const ok2= document.getElementById('b-manual-origen-codigo').value.trim();
    const oa = parseFloat(document.getElementById('b-manual-origen-ancho').value);
    const oe = parseFloat(document.getElementById('b-manual-origen-espesor').value);
    const omet = parseFloat(document.getElementById('b-manual-origen-metros').value);
    const dd = document.getElementById('b-manual-destino-deposito').value;
    const dc = document.getElementById('b-manual-destino-cliente').value.trim();
    const dco= document.getElementById('b-manual-destino-codigo').value.trim();
    const da = parseFloat(document.getElementById('b-manual-destino-ancho').value);
    const dl = parseFloat(document.getElementById('b-manual-destino-largo').value) || 0;
    const de = parseFloat(document.getElementById('b-manual-destino-espesor').value);
    const dq = parseInt(document.getElementById('b-manual-destino-cantidad').value, 10);

    if (!om || !oc || !ok2 || isNaN(oa) || isNaN(oe) || isNaN(omet) || omet <= 0) {
        window.showAlert('Completá todos los campos de Origen con valores válidos.'); return;
    }
    if (!dc || !dco || isNaN(da) || isNaN(de) || isNaN(dq) || dq <= 0) {
        window.showAlert('Completá los campos obligatorios de Destino (Cliente, Código, Ancho, Espesor y Cantidad).'); return;
    }

    // Caso A: Solicitud desde una bobina del stock existente
    if (_sacando || origId) {
        const itemStock = _sacando || state.bobinasData.find(b => b.id === origId);
        if (itemStock) {
            if (omet > itemStock.metros) {
                window.showAlert(`Solo hay ${Math.round(itemStock.metros)} metros disponibles en el stock.`);
                return;
            }
            const ancho = oa;
            const espesor = oe;
            const newMetros = itemStock.metros - omet;
            const newKilos = calcKilos(ancho, espesor, newMetros);

            try {
                if (newMetros <= 0) {
                    await deleteDoc(doc(bDb, 'inventario', itemStock.id));
                } else {
                    await updateDoc(doc(bDb, 'inventario', itemStock.id), {
                        metros: Math.round(newMetros),
                        kilos: newKilos
                    });
                }

                state.bobinasCartItems.push({
                    type: 'movimiento',
                    isFromStock: true,
                    coilId: itemStock.id,
                    articuloNombre: ok2,
                    metrosASacar: omet,
                    cliente: oc,
                    deposito: od,
                    material: om,
                    ancho: oa,
                    espesor: oe,
                    observacion: `Salida de Stock: ${ok2}`,
                    estadoFinal: newMetros <= 0 ? 'Agotado (Pendiente Exportación)' : 'Enviado (Pendiente Exportación)',
                    destino: { deposito: dd, cliente: dc, codigo: dco, ancho: da, largo: dl, espesor: de, cantidad: dq }
                });

                await saveCart();
                updateCartBar();
                showToast('Bobina añadida al carrito. Stock actualizado.');
                bootstrap.Modal.getInstance(document.getElementById('modalBobinaManual'))?.hide();
                _sacando = null;
                return;
            } catch (e) {
                console.error(e);
                window.showAlert('Error al actualizar el stock de la bobina.');
                return;
            }
        }
    }

    // Caso B: Movimiento manual puro
    state.bobinasCartItems.push({
        type: 'movimiento',
        isFromStock: false,
        coilId: `mov-${Date.now()}`,
        articuloNombre: ok2,
        metrosASacar: omet,
        cliente: oc, deposito: od, material: om,
        ancho: oa, espesor: oe,
        observacion: 'Movimiento de Stock Manual',
        estadoFinal: 'Movimiento Pendiente',
        destino: { deposito: dd, cliente: dc, codigo: dco, ancho: da, largo: dl, espesor: de, cantidad: dq }
    });

    await saveCart();
    updateCartBar();
    showToast('Movimiento agregado al carrito.');
    bootstrap.Modal.getInstance(document.getElementById('modalBobinaManual'))?.hide();
    _sacando = null;
};

// ── Historial ────────────────────────────────────────────────────────────────
window.bobinasVerHistorial = function() {
    const tbody = document.getElementById('bobinas-historial-body');
    if (!tbody) return;
    const sorted = [...state.bobinasHistorialData].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    tbody.innerHTML = sorted.length
        ? sorted.map(h => `<tr>
            <td class="text-nowrap">${new Date(h.fecha).toLocaleString('es-ES')}</td>
            <td>${h.articulo || '—'}</td>
            <td class="text-end">${h.metrosMovidos !== undefined ? Math.round(Number(h.metrosMovidos)) : '—'}</td>
            <td><span class="badge ${h.estado?.includes('Eliminado') ? 'bg-danger' : h.estado?.includes('Movimiento') ? 'bg-info text-dark' : 'bg-success'}">${h.estado || '—'}</span></td>
            <td>${h.observacion || '—'}</td>
          </tr>`).join('')
        : '<tr><td colspan="5" class="text-center text-muted">Sin movimientos registrados.</td></tr>';

    new bootstrap.Modal(document.getElementById('modalBobinaHistorial')).show();
};

// ── Cart actions ─────────────────────────────────────────────────────────────
window.bobinasQuitarItem = function(index) {
    const item = state.bobinasCartItems[index];
    if (!item) return;

    if (!item.isFromStock && (!item.coilId || item.coilId.startsWith('mov-'))) {
        state.bobinasCartItems.splice(index, 1);
        saveCart().then(() => { updateCartBar(); showToast(`"${item.articuloNombre}" quitado del carrito.`); });
        return;
    }

    window.showConfirm(
        `¿Quitar <strong>${item.articuloNombre}</strong> del carrito y devolver los metros al inventario?`,
        async ok => {
            if (!ok) return;
            try {
                const ref  = doc(bDb, 'inventario', item.coilId);
                const snap = await getDoc(ref);
                const updM = snap.exists()
                    ? Number(snap.data().metros) + Number(item.metrosASacar)
                    : Number(item.metrosASacar);
                const updK = calcKilos(Number(item.ancho), Number(item.espesor), updM);

                if (snap.exists()) {
                    await updateDoc(ref, { metros: Math.round(updM), kilos: updK });
                } else {
                    await addDoc(collection(bDb, 'inventario'), {
                        nombre: item.articuloNombre, material: item.material,
                        metros: Math.round(updM), kilos: updK
                    });
                }
                state.bobinasCartItems.splice(index, 1);
                await saveCart();
                updateCartBar();
                showToast(`"${item.articuloNombre}" devuelto al inventario.`);
            } catch(e) {
                console.error(e);
                window.showAlert('Error al devolver al inventario.');
            }
        }
    );
};

window.bobinasVaciarCarrito = function() {
    if (!state.bobinasCartItems.length) { showToast('El carrito ya está vacío.', 'info'); return; }
    window.showConfirm('¿Vaciar el carrito y devolver todos los artículos de stock al inventario?', async ok => {
        if (!ok) return;
        for (const item of state.bobinasCartItems) {
            if (!item.isFromStock && (!item.coilId || item.coilId.startsWith('mov-'))) continue;
            try {
                const ref  = doc(bDb, 'inventario', item.coilId);
                const snap = await getDoc(ref);
                const updM = snap.exists()
                    ? Number(snap.data().metros) + Number(item.metrosASacar)
                    : Number(item.metrosASacar);
                const updK = calcKilos(Number(item.ancho), Number(item.espesor), updM);
                if (snap.exists()) {
                    await updateDoc(ref, { metros: Math.round(updM), kilos: updK });
                } else {
                    await addDoc(collection(bDb, 'inventario'), {
                        nombre: item.articuloNombre, material: item.material,
                        metros: Math.round(updM), kilos: updK
                    });
                }
            } catch(e) { console.error(e); }
        }
        state.bobinasCartItems = [];
        await saveCart();
        updateCartBar();
        showToast('Carrito vaciado. Stock restaurado.');
    });
};

window.bobinasExportarPdf = function() {
    if (!state.bobinasCartItems.length) { showToast('No hay artículos en el carrito.', 'info'); return; }
    window.showConfirm('¿Finalizar estas salidas, registrar el historial y generar el PDF?', async ok => {
        if (!ok) return;
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        let y = 25;
        const mg = 15;
        const ph = pdf.internal.pageSize.height;

        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
        pdf.text('Solicitud de bobinas', 105, 15, { align: 'center' });
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
        pdf.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, mg, 20);

        const std = state.bobinasCartItems.filter(i => !i.destino);
        const mov = state.bobinasCartItems.filter(i => !!i.destino);

        if (std.length) {
            pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
            pdf.text('Artículos de Inventario:', mg, y); y += 6;
            pdf.autoTable({
                head: [['Artículo', 'Metros', 'Kilos', 'Cliente', 'Observación', 'Depósito']],
                body: std.map(i => {
                    const k = calcKilos(Number(i.ancho), Number(i.espesor), Number(i.metrosASacar));
                    return [i.articuloNombre, Math.round(Number(i.metrosASacar)), k.toFixed(2),
                            i.cliente || 'N/A', i.observacion || '', i.deposito || 'N/A'];
                }),
                startY: y, headStyles: { fillColor: [100, 79, 154] },
                margin: { left: mg, right: mg }
            });
            y = pdf.lastAutoTable.finalY + 15;
        }

        for (const item of mov) {
            if (y > ph - 60) { pdf.addPage(); y = 20; }
            pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
            pdf.text('--- Movimiento de Stock ---', 105, y, { align: 'center' }); y += 8;
            const xO = 20, xD = 115, lh = 5;
            pdf.setFontSize(11);
            pdf.text('Origen', xO, y); pdf.setFontSize(18); pdf.text('→', 105, y, {align:'center'});
            pdf.setFontSize(11); pdf.text('Destino', xD, y); y += 8;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
            let yO = y, yD = y;
            ['Depósito:'+(item.deposito||'Depósito General'),'Material:'+(item.material||'N/A'),'Cliente:'+(item.cliente||'Varios'),
             'Código:'+item.articuloNombre,'Ancho:'+item.ancho,'Espesor:'+item.espesor,'Metros:'+item.metrosASacar
            ].forEach(t => { pdf.text(t.replace(':',' : '), xO, yO); yO += lh; });
            ['Depósito:'+item.destino.deposito,'Cliente:'+item.destino.cliente,'Código:'+item.destino.codigo,
             'Ancho:'+item.destino.ancho,'Largo:'+(item.destino.largo||'—'),'Espesor:'+item.destino.espesor,'Cantidad:'+item.destino.cantidad
            ].forEach(t => { pdf.text(t.replace(':',' : '), xD, yD); yD += lh; });
            y = Math.max(yO, yD) + 10;

            // Etiquetas
            const lw = 60, lhb = 40, gutter = 5;
            const xPos = [mg, mg + lw + gutter, mg + 2*(lw + gutter)];
            if (y + lhb > ph - mg) { pdf.addPage(); y = 20; }
            pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
            pdf.text(`Etiquetas a generar: ${item.destino.cantidad}`, mg, y); y += 8;
            let col = 0;
            for (let i = 0; i < item.destino.cantidad; i++) {
                if (y + lhb > ph - mg) { pdf.addPage(); y = 20; col = 0; }
                const x = xPos[col];
                pdf.rect(x, y, lw, lhb);
                pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
                pdf.text('ETIQUETA DE RECAMBIO', x + lw/2, y + 6, { align: 'center' });
                pdf.setFont('helvetica', 'normal');
                let ly = y + 14, lw2 = lw - 10;
                const cl = pdf.splitTextToSize(`Cliente: ${item.destino.cliente}`, lw2);
                pdf.text(cl, x+5, ly); ly += cl.length * 4.5;
                const co = pdf.splitTextToSize(`Código: ${item.destino.codigo}`, lw2);
                pdf.text(co, x+5, ly); ly += co.length * 4.5;
                pdf.text(`${item.destino.ancho} X ${item.destino.largo || '—'} X ${item.destino.espesor}`, x+5, ly);
                col++;
                if (col >= 3) { col = 0; y += lhb + gutter; }
            }
            if (col !== 0) y += lhb + gutter;
            y += 10;
        }

        pdf.save('Solicitud_de_bobinas.pdf');

        // Registro en Historial (Firestore)
        for (const item of state.bobinasCartItems) {
            try {
                const obs = item.destino
                    ? `Movimiento a ${item.destino.deposito}. Bobinas: ${item.destino.cantidad}. Cliente: ${item.destino.cliente}.`
                    : (item.observacion || 'Ninguna');
                await addDoc(collection(bDb, 'historial'), {
                    fecha: new Date().toISOString(),
                    articulo: item.articuloNombre,
                    metrosMovidos: Math.round(Number(item.metrosASacar)),
                    estado: item.destino ? 'Movimiento de Bobina'
                          : (item.estadoFinal || 'Salida').replace(' (Pendiente Exportación)', ''),
                    observacion: obs
                });
            } catch(e) { console.error(e); }
        }

        // Crear ítem en Solicitudes Pendientes (recordatorio local en la pestaña principal)
        const nuevaSolicitud = {
            id: 'sol-' + Date.now(),
            fecha: new Date().toISOString(),
            items: state.bobinasCartItems.map(it => ({
                articuloNombre: it.articuloNombre,
                material: it.material,
                metrosASacar: it.metrosASacar,
                cliente: it.cliente,
                deposito: it.deposito,
                ancho: it.ancho,
                espesor: it.espesor,
                isFromStock: !!it.isFromStock,
                destino: it.destino ? { ...it.destino } : null
            }))
        };

        if (!state.bobinasSolicitudesPendientes) state.bobinasSolicitudesPendientes = [];
        state.bobinasSolicitudesPendientes.unshift(nuevaSolicitud);
        guardarSolicitudesPendientes();
        renderizarSolicitudesPendientes();

        state.bobinasCartItems = [];
        await saveCart();
        updateCartBar();
        showToast('PDF generado. Solicitud guardada en Pendientes e historial registrado.');
    });
};

// Called by mostrarPanel to sync cart bar visibility when leaving bobinas
export function sincronizarCartBar() {
    updateCartBar();
}
