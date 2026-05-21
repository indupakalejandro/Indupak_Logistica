import { initFirebase, getUserCollection, onSnapshot } from './firebase.js';
import { state, totalCollectionsToLoad } from './state.js';
import { cacheDOMElements, showLoadingScreen, hideLoadingScreen, updateLoadingProgress, panelHandlers, setupUIListeners } from './ui.js';
import { renderizarDashboard, startDashboardClock, renderMonthlyKilosChart } from './dashboard.js';
import { renderizarTablaInventario, verificarStockBajo, actualizarDropdownProveedores, actualizarDropdownCategorias, actualizarDropdownUnidadesMedida } from './inventario.js';
import { renderizarPanelProveedores, actualizarDropdownRoles, setupProviderCardListeners } from './proveedores.js';
import { renderizarPanelComisionistas, renderLocalidadesCheckboxes } from './comisionistas.js';
import { renderizarListaCategorias, renderizarListaUnidadesMedida, renderizarListaRoles, renderizarListaLocalidades, renderizarListaProveedoresPlastico } from './configuracion.js';
import { renderizarPanelCompras } from './compras.js';
import { renderizarTablaFaltantes } from './faltantes.js';
import { renderizarPanelPagos, actualizarDropdownProveedoresPlastico } from './pagos.js';
import { setupControlListeners, controlRestaurarDesdeLocal, controlMostrarLista } from './control.js';
import { renderizarTablaAnalisis } from './analisis.js';
import { renderizarTablaBobinas, initBobinas, sincronizarCartBar } from './bobinas.js';
import { initTermos } from './termos.js';

// Version information
const APP_VERSION = "1.2";
const APP_IMPROVEMENTS = `
    <p class="lead text-center">Estás usando la versión ${APP_VERSION} del sistema de logística de Indupak</p>
    <p class="text-center text-muted">(¡Sí! Cada vez más útil, menos molesto)</p>
    <hr class="my-3" style="border-color: rgba(255,255,255,0.2);">
    <p>Esta versión trae varias mejoras que veníamos deseando hace tiempo. Algunas ya nos estaban sacando canas verdes, así que tomamos cartas en el asunto:</p>
    <ul>
        <li>El <strong>dashboard</strong> ahora es más interactivo y visual, con nuevas tarjetas y un gráfico de barras para que tengas una visión clara de tus operaciones.</li>
        <li>En la sección <strong>Proveedores</strong> ahora tenés nuevos filtros para buscar más rápido y con precisión quirúrgica.</li>
        <li>Hablando del buscador… corregimos ese error molesto que hacía que la búsqueda quedara activa aunque cerraras el panel. (Sí, ya no vive más en tu pantalla.)</li>
        <li>A los proveedores ahora podés ponerles una <strong>descripción y una dirección</strong>. Ideal para saber quién es quién sin tener que andar adivinando.</li>
        <li>¿Notaste que algunas tablas parecían de otra web? Bueno, por fin unificamos el diseño de las <strong>tablas de configuración</strong>. Chau fondo blanco descolgado.</li>
        <li>El menú tipo carrusel ya era un dolor de cabeza. Lo cambiamos por un <strong>menú desplegable</strong> mucho más ágil. Navegar ahora es cosa seria.</li>
        <li>Y lo mejor: ¡estrenamos la sección <strong>Faltantes</strong>! Acá podés agregar, editar o eliminar productos que están bajos de stock y ver todo en tiempo real. Sí, en tiempo real. Como debe ser.</li>
    </ul>
    <p class="text-center mt-4">Seguimos mejorando con vos. Gracias por bancar cada versión.</p>
`;

// --- Register panel handlers (avoids circular imports) ---
panelHandlers['dashboard'] = renderizarDashboard;
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
    renderizarTablaBobinas();
};
panelHandlers['termos'] = initTermos;
panelHandlers['renderMonthlyKilosChart'] = renderMonthlyKilosChart;
panelHandlers['renderPagosKilosChart'] = function() {
    const chartEl  = document.getElementById('pagosKilosChart');
    const legendEl = document.getElementById('pagos-chart-legend');
    if (chartEl) renderMonthlyKilosChart(chartEl, legendEl);
};

/**
 * Checks if all initial data collections have been loaded.
 * If so, triggers the ready state on the loading screen.
 */
function checkAllDataLoaded() {
    state.loadedCollectionsCount = 0;
    for (const key in state.dataLoadedFlags) {
        if (state.dataLoadedFlags[key]) {
            state.loadedCollectionsCount++;
        }
    }
    const currentProgress = Math.round((state.loadedCollectionsCount / totalCollectionsToLoad) * 100);
    updateLoadingProgress(currentProgress);

    if (state.loadedCollectionsCount === totalCollectionsToLoad) {
        console.log("All initial data collections loaded. Hiding loading screen.");
        hideLoadingScreen();
    } else {
        console.log(`Loaded ${state.loadedCollectionsCount} of ${totalCollectionsToLoad} collections.`);
    }
}

/**
 * Sets up real-time listeners for all Firestore collections.
 */
function setupRealtimeListeners() {
    if (!state.isAuthReady) return;

    setupControlListeners();

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
        if (state.currentActivePanel === 'dashboard') {
            renderizarDashboard();
        }
        if (!state.dataLoadedFlags.monthlyKiloSummaries) {
            state.dataLoadedFlags.monthlyKiloSummaries = true;
            checkAllDataLoaded();
        }
    }, (error) => {
        console.error("Error fetching monthlyKiloSummaries:", error);
        window.showAlert("Error al cargar los resúmenes mensuales de kilos. Por favor, recargue la página.");
    });

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
}

// --- Initialize Firebase ---
initFirebase(function onAuthReady() {
    state.isAuthReady = true;
    setupRealtimeListeners();
});

// --- Initialize Bobinas (separate Firebase project) ---
initBobinas();

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', function() {
    cacheDOMElements();
    showLoadingScreen();
    setupUIListeners();
    setupProviderCardListeners();

    // Show version info modal once on first load
    const hasSeenVersionInfo = localStorage.getItem('hasSeenVersionInfo');
    if (!hasSeenVersionInfo) {
        if (state.elements.modalVersionInfoBody) {
            state.elements.modalVersionInfoBody.innerHTML = APP_IMPROVEMENTS;
        }
        if (state.elements.modalVersionInfo) {
            const versionModal = new bootstrap.Modal(state.elements.modalVersionInfo);
            versionModal.show();
        }
        localStorage.setItem('hasSeenVersionInfo', 'true');
    }
});
