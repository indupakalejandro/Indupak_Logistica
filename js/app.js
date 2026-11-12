import { initFirebase, getUserCollection, onSnapshot } from './firebase.js';
import { state } from './state.js';
import { cacheDOMElements, mostrarEsqueletoInicio, finalizarEsqueletoInicio, marcarBloqueListo, panelHandlers, setupUIListeners } from './ui.js';
import { renderizarDashboard, startDashboardClock, renderMonthlyKilosChart, renderizarListaComprasDashboard, renderizarPersonalDashboard, actualizarBloquesDashboard } from './dashboard.js';
import { renderizarTablaInventario, verificarStockBajo, actualizarDropdownProveedores, actualizarDropdownCategorias, actualizarDropdownUnidadesMedida } from './inventario.js';
import { renderizarPanelProveedores, actualizarDropdownRoles, setupProviderCardListeners } from './proveedores.js';
import { renderizarPanelComisionistas, renderLocalidadesCheckboxes } from './comisionistas.js';
import { renderizarListaCategorias, renderizarListaUnidadesMedida, renderizarListaRoles, renderizarListaLocalidades, renderizarListaProveedoresPlastico } from './configuracion.js';
import { renderizarPanelCompras } from './compras.js';
import { renderizarTablaFaltantes, escucharHistorialFaltantes } from './faltantes.js';
import { mostrarIngreso, ocultarIngreso, aplicarPermisos, escucharUsuarios, mostrarCambioClaveObligatorio, escucharPermisos } from './accesos.js';
import { renderizarPanelPagos, actualizarDropdownProveedoresPlastico } from './pagos.js';
import { setupControlListeners, controlRestaurarDesdeLocal, controlMostrarLista } from './control.js';
import { renderizarTablaAnalisis } from './analisis.js';
import { renderizarBobinasPanel, initBobinas, sincronizarCartBar } from './bobinas.js';
import { initTermos } from './termos.js';
import { setupHorariosListeners, renderizarHorariosPanel } from './horarios.js';

// Versión del sistema. Las novedades se escriben en el modal #modalVersionInfo de index.html;
// al cambiar este número, el modal se muestra una vez a cada usuario.
const APP_VERSION = '4.0';

// --- Register panel handlers (avoids circular imports) ---
panelHandlers['dashboard'] = renderizarDashboard;
panelHandlers['dashboardPersonal'] = renderizarPersonalDashboard;
panelHandlers['insumos'] = function() {
    if (state.activeInsumosTab === 'inventario') {
        renderizarTablaInventario();
    } else if (state.activeInsumosTab === 'compras') {
        renderizarPanelCompras();
    } else if (state.activeInsumosTab === 'analisis') {
        renderizarTablaAnalisis();
    }
};
panelHandlers['contactos'] = function() {
    if (state.activeContactosTab === 'proveedores') {
        renderizarPanelProveedores();
    } else {
        renderizarPanelComisionistas();
    }
};
panelHandlers['faltantes'] = renderizarTablaFaltantes;
panelHandlers['pagos'] = renderizarPanelPagos;
panelHandlers['control'] = function() {
    controlRestaurarDesdeLocal();
    if (!state.controlEjecucionActual) {
        controlMostrarLista();
    }
};
panelHandlers['bobinas'] = function() {
    sincronizarCartBar();
    renderizarBobinasPanel();
};
panelHandlers['termos'] = initTermos;
panelHandlers['horarios'] = renderizarHorariosPanel;
panelHandlers['renderPagosKilosChart'] = function() {
    const chartEl  = document.getElementById('pagosKilosChart');
    const legendEl = document.getElementById('pagos-chart-legend');
    if (chartEl) renderMonthlyKilosChart(chartEl, legendEl);
};

// Si un bloque tarda demasiado una vez llegaron los datos principales, se libera igual para no trabar la app.
const ESPERA_MAXIMA_BLOQUES_MS = 8000;
let inicioFinalizado = false;
let esperaBloques = null;

function comprobarInicioCompleto() {
    if (inicioFinalizado || !Object.values(state.dataLoadedFlags).every(Boolean)) return;

    const pendientes = document.querySelectorAll('[data-esqueleto].esqueleto');
    if (pendientes.length > 0) {
        if (!esperaBloques) {
            esperaBloques = setTimeout(() => {
                document.querySelectorAll('[data-esqueleto].esqueleto').forEach(el => marcarBloqueListo(el.dataset.esqueleto));
            }, ESPERA_MAXIMA_BLOQUES_MS);
        }
        return;
    }

    inicioFinalizado = true;
    clearTimeout(esperaBloques);
    finalizarEsqueletoInicio();
}
panelHandlers['comprobarInicio'] = comprobarInicioCompleto;

function checkAllDataLoaded() {
    actualizarBloquesDashboard();
    comprobarInicioCompleto();
}

/**
 * Sets up real-time listeners for all Firestore collections.
 */
function setupRealtimeListeners() {
    if (!state.isAuthReady) return;

    setupControlListeners();
    setupHorariosListeners();

    // Restore any ongoing control from localStorage after listeners are ready
    setTimeout(() => {
        if (state.currentActivePanel === 'control') {
            controlRestaurarDesdeLocal();
        }
    }, 500);

    // Inventario Listener
    onSnapshot(getUserCollection('inventario'), (snapshot) => {
        state.inventarioData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarTablaInventario();
        verificarStockBajo();
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') {
            renderizarPanelCompras();
        }
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        if (!state.dataLoadedFlags.inventario) {
            state.dataLoadedFlags.inventario = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching inventario:", error);
        window.showAlert("Error al cargar el inventario. Por favor, recargue la página.");
    });

    // Proveedores Listener
    onSnapshot(getUserCollection('proveedores'), (snapshot) => {
        state.proveedoresData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarDropdownProveedores();
        if (state.currentActivePanel === 'contactos' && state.activeContactosTab === 'proveedores') {
            renderizarPanelProveedores();
        }
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'inventario') {
            renderizarTablaInventario();
        }
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') {
            renderizarPanelCompras();
        }
        if (!state.dataLoadedFlags.proveedores) {
            state.dataLoadedFlags.proveedores = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching proveedores:", error);
        window.showAlert("Error al cargar los proveedores. Por favor, recargue la página.");
    });

    // Contactos Listener
    onSnapshot(getUserCollection('contactos'), (snapshot) => {
        state.contactosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarDropdownRoles();
        if (state.currentActivePanel === 'contactos' && state.activeContactosTab === 'proveedores') {
            renderizarPanelProveedores();
        }
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') {
            renderizarPanelCompras();
        }
        if (!state.dataLoadedFlags.contactos) {
            state.dataLoadedFlags.contactos = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching contactos:", error);
        window.showAlert("Error al cargar los contactos. Por favor, recargue la página.");
    });

    // Categories Listener
    onSnapshot(getUserCollection('categories'), (snapshot) => {
        state.categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarListaCategorias();
        actualizarDropdownCategorias();
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'inventario') {
            renderizarTablaInventario();
        }
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') {
            renderizarPanelCompras();
        }
        if (!state.dataLoadedFlags.categories) {
            state.dataLoadedFlags.categories = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching categories:", error);
        window.showAlert("Error al cargar las categorías. Por favor, recargue la página.");
    });

    // Units of Measure Listener
    onSnapshot(getUserCollection('unitsOfMeasure'), (snapshot) => {
        state.unitsOfMeasureData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarListaUnidadesMedida();
        actualizarDropdownUnidadesMedida();
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') {
            renderizarPanelCompras();
        }
        if (state.currentActivePanel === 'faltantes') {
            renderizarTablaFaltantes();
        }
        if (!state.dataLoadedFlags.unitsOfMeasure) {
            state.dataLoadedFlags.unitsOfMeasure = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching unitsOfMeasure:", error);
        window.showAlert("Error al cargar las unidades de medida. Por favor, recargue la página.");
    });

    // Roles Listener
    onSnapshot(getUserCollection('roles'), (snapshot) => {
        state.rolesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarListaRoles();
        actualizarDropdownRoles();
        if (!state.dataLoadedFlags.roles) {
            state.dataLoadedFlags.roles = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching roles:", error);
        window.showAlert("Error al cargar los roles. Por favor, recargue la página.");
    });

    // Comisionistas Listener
    onSnapshot(getUserCollection('comisionistas'), (snapshot) => {
        state.comisionistasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.currentActivePanel === 'contactos' && state.activeContactosTab === 'comisionistas') {
            renderizarPanelComisionistas();
        }
        if (!state.dataLoadedFlags.comisionistas) {
            state.dataLoadedFlags.comisionistas = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching comisionistas:", error);
        window.showAlert("Error al cargar los comisionistas. Por favor, recargue la página.");
    });

    // Localidades Listener
    onSnapshot(getUserCollection('localidades'), (snapshot) => {
        state.localidadesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarListaLocalidades();
        // If the comisionista modal is open, re-render its checkboxes
        if (state.elements.modalComisionista && state.elements.modalComisionista.classList.contains('show')) {
            const currentComisionistaId = state.elements.modalComisionista.dataset.editingComisionistaId;
            if (currentComisionistaId) {
                const comis = state.comisionistasData.find(c => c.id === currentComisionistaId);
                renderLocalidadesCheckboxes(comis ? comis.localidades : []);
            } else {
                renderLocalidadesCheckboxes([]);
            }
        }
        if (state.currentActivePanel === 'contactos' && state.activeContactosTab === 'comisionistas') {
            renderizarPanelComisionistas();
        }
        if (!state.dataLoadedFlags.localidades) {
            state.dataLoadedFlags.localidades = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching localidades:", error);
        window.showAlert("Error al cargar las localidades. Por favor, recargue la página.");
    });

    // Plastic Suppliers Listener
    onSnapshot(getUserCollection('plasticSuppliers'), (snapshot) => {
        state.plasticSuppliersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarListaProveedoresPlastico();
        actualizarDropdownProveedoresPlastico();
        if (!state.dataLoadedFlags.plasticSuppliers) {
            state.dataLoadedFlags.plasticSuppliers = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching plasticSuppliers:", error);
        window.showAlert("Error al cargar los proveedores de plástico. Por favor, recargue la página.");
    });

    // Pending Payments Listener
    onSnapshot(getUserCollection('pendingPayments'), (snapshot) => {
        state.pendingPaymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.currentActivePanel === 'pagos') {
            renderizarPanelPagos();
        }
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        if (!state.dataLoadedFlags.pendingPayments) {
            state.dataLoadedFlags.pendingPayments = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching pendingPayments:", error);
        window.showAlert("Error al cargar los pagos pendientes. Por favor, recargue la página.");
    });

    // Payment History Listener
    onSnapshot(getUserCollection('paymentHistory'), (snapshot) => {
        state.paymentHistoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.currentActivePanel === 'pagos') {
            renderizarPanelPagos();
        }
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        if (!state.dataLoadedFlags.paymentHistory) {
            state.dataLoadedFlags.paymentHistory = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching paymentHistory:", error);
        window.showAlert("Error al cargar el historial de pagos. Por favor, recargue la página.");
    });

    // Monthly Kilo Summaries Listener
    onSnapshot(getUserCollection('monthlyKiloSummaries'), (snapshot) => {
        state.monthlyKiloSummariesData = {};
        snapshot.docs.forEach(doc => {
            state.monthlyKiloSummariesData[doc.id] = doc.data().totalKilos;
        });
        if (!state.dataLoadedFlags.monthlyKiloSummaries) {
            state.dataLoadedFlags.monthlyKiloSummaries = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching monthlyKiloSummaries:", error);
        window.showAlert("Error al cargar los resúmenes mensuales de kilos. Por favor, recargue la página.");
    });

    escucharHistorialFaltantes();

    // Faltantes Listener
    onSnapshot(getUserCollection('faltantes'), (snapshot) => {
        state.faltantesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.currentActivePanel === 'faltantes') {
            renderizarTablaFaltantes();
        }
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        if (!state.dataLoadedFlags.faltantes) {
            state.dataLoadedFlags.faltantes = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching faltantes:", error);
        window.showAlert("Error al cargar los artículos faltantes. Por favor, recargue la página.");
    });

    // Control Historial Listener (not part of loading progress)
    onSnapshot(getUserCollection('controlHistorial'), (snapshot) => {
        state.controlHistorialData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        marcarBloqueListo('novedades');
    }, (error) => {
        console.error("Error fetching controlHistorial:", error);
        marcarBloqueListo('novedades');
    });

    // Lista de Compras Compartida Listener (not part of loading progress)
    onSnapshot(getUserCollection('dashboardListaCompras'), (snapshot) => {
        state.listaComprasData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentActivePanel === 'dashboard') {
            renderizarListaComprasDashboard();
        }
        marcarBloqueListo('compras');
    }, (error) => {
        console.error("Error fetching dashboardListaCompras:", error);
        marcarBloqueListo('compras');
    });
}

// --- Initialize Firebase ---
// Sin sesión se muestra el ingreso; con sesión se aplican los permisos del rol antes de cargar los datos.
initFirebase(function onAuthReady() {
    state.isAuthReady = true;
    setupRealtimeListeners();
    // Bobinas también vive en la base protegida: se conecta recién con un usuario con sesión.
    initBobinas();
}, {
    alSinSesion: () => mostrarIngreso(),
    alRechazar: mensaje => mostrarIngreso(mensaje),
    alDebeCambiarClave: perfil => mostrarCambioClaveObligatorio(perfil),
    alIngresar: () => {
        ocultarIngreso();
        aplicarPermisos();
        escucharPermisos();
        escucharUsuarios();
    }
});


// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', function() {
    cacheDOMElements();
    mostrarEsqueletoInicio();
    setupUIListeners();
    setupProviderCardListeners();

    document.querySelectorAll('[data-version-app]').forEach(el => { el.textContent = APP_VERSION; });

    // Las novedades se muestran una sola vez por versión.
    let versionVista = null;
    try { versionVista = localStorage.getItem('versionVista'); } catch (e) { /* sin almacenamiento: no se muestra */ }
    if (versionVista !== APP_VERSION && state.elements.modalVersionInfo) {
        bootstrap.Modal.getOrCreateInstance(state.elements.modalVersionInfo).show();
        try { localStorage.setItem('versionVista', APP_VERSION); } catch (e) { /* nada que guardar */ }
    }
});
