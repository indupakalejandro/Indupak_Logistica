import { state } from './state.js';

// --- Custom Alert and Confirm Modals ---
let currentConfirmCallback = null;

export function showNotification(message, type = 'info', duration = 3500) {
    let container = document.getElementById('app-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app-toast-container';
        document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'glass-toast toast align-items-center border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    let iconHtml = '<i class="bi bi-info-circle-fill text-info fs-5 flex-shrink-0"></i>';
    if (type === 'success') {
        iconHtml = '<i class="bi bi-check-circle-fill text-success fs-5 flex-shrink-0"></i>';
    } else if (type === 'danger' || type === 'error') {
        iconHtml = '<i class="bi bi-exclamation-circle-fill text-danger fs-5 flex-shrink-0"></i>';
    } else if (type === 'warning') {
        iconHtml = '<i class="bi bi-exclamation-triangle-fill text-warning fs-5 flex-shrink-0"></i>';
    }

    toastEl.innerHTML = `
        <div class="toast-body">
            ${iconHtml}
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close me-1 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
        </div>
    `;

    container.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { autohide: true, delay: duration });
    bsToast.show();
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}
window.showNotification = showNotification;
window.showToast = showNotification;

export function showAlert(message, type = 'info') {
    if (type === 'info' && /error|fall|inválid|obligatori|no se encontr|complet|negativ/i.test(message)) {
        type = 'danger';
    } else if (type === 'info' && /éxito|guardad|correct|actualizad|generad|añadid|cread/i.test(message)) {
        type = 'success';
    }
    showNotification(message, type);
}
window.showAlert = showAlert;

export function parseCantidad(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const normalized = String(val).trim().replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
}
window.parseCantidad = parseCantidad;

export function formatCantidad(val, maxDecimals = 3) {
    if (val === null || val === undefined || val === '') return '0';
    const n = Number(val);
    if (isNaN(n)) return '0';
    if (n % 1 === 0) return n.toString();
    return parseFloat(n.toFixed(maxDecimals)).toString();
}
window.formatCantidad = formatCantidad;

export function showConfirm(message, callback) {
    document.getElementById('customConfirmModalBody').innerHTML = message;
    currentConfirmCallback = callback;
    const confirmModal = new bootstrap.Modal(document.getElementById('customConfirmModal'));
    confirmModal.show();
}
window.showConfirm = showConfirm;

document.getElementById('customConfirmBtn').addEventListener('click', () => {
    if (currentConfirmCallback) {
        currentConfirmCallback(true);
    }
    bootstrap.Modal.getInstance(document.getElementById('customConfirmModal')).hide();
    currentConfirmCallback = null;
});

// --- Panel Handlers Registry ---
// Other modules register their render functions here to avoid circular imports
export const panelHandlers = {};

// Map panel IDs to display names for the dropdown
const panelDisplayNames = {
    'dashboard': 'Dashboard',
    'insumos': '<i class="bi bi-boxes"></i> Insumos',
    'contactos': '<i class="bi bi-people-fill"></i> Contactos',
    'bobinas': '<i class="bi bi-layers-fill"></i> Stock Bobinas',
    'faltantes': 'Faltantes',
    'pagos': 'Pagos',
    'control': 'Control',
    'termos': '<i class="bi bi-rulers"></i> Termo',
    'horarios': '<i class="bi bi-clock-history"></i> Control Horario',
    'configuracion': 'Configuración'
};

/**
 * Caches frequently used DOM elements. Should be called after DOMContentLoaded.
 */
export function cacheDOMElements() {
    state.elements.inventarioTableBody = document.getElementById('tabla-inventario-body');
    state.elements.buscador = document.getElementById('buscador');
    state.elements.footerTabla = document.getElementById('footer-tabla');
    state.elements.modalArticulo = document.getElementById('modalArticulo');
    state.elements.modalArticuloLabel = document.getElementById('modalArticuloLabel');
    state.elements.formularioArticulo = document.getElementById('formularioArticulo');
    state.elements.idArticuloInput = document.getElementById('idArticulo');
    state.elements.nombreArticuloInput = document.getElementById('nombreArticulo');
    state.elements.descripcionInput = document.getElementById('descripcion');
    state.elements.categoriaSelect = document.getElementById('categoria');
    state.elements.cantidadActualInputGroup = document.getElementById('cantidadActualInputGroup');
    state.elements.cantidadActualInput = document.getElementById('cantidadActual');
    state.elements.stockMinimoInput = document.getElementById('stockMinimo');
    state.elements.idProveedorArticuloSelect = document.getElementById('idProveedorArticulo');
    state.elements.unidadMedidaSelect = document.getElementById('unidadMedida');
    state.elements.modalHistorial = document.getElementById('modalHistorial');
    state.elements.historialNombreArticulo = document.getElementById('historialNombreArticulo');
    state.elements.tablaHistorialBody = document.getElementById('tabla-historial-body');
    state.elements.alertaStockBajo = document.getElementById('alerta-stock-bajo');
    state.elements.listaProveedoresContainer = document.getElementById('lista-proveedores');
    state.elements.modalProveedor = document.getElementById('modalProveedor');
    state.elements.modalProveedorLabel = document.getElementById('modalProveedorLabel');
    state.elements.formularioProveedor = document.getElementById('formularioProveedor');
    state.elements.idProveedorInput = document.getElementById('idProveedor');
    state.elements.nombreProveedorInput = document.getElementById('nombreProveedor');
    state.elements.descripcionProveedorInput = document.getElementById('descripcionProveedor');
    state.elements.direccionProveedorInput = document.getElementById('direccionProveedor');
    state.elements.cuitProveedorInput = document.getElementById('cuitProveedor');
    state.elements.emailProveedorInput = document.getElementById('emailProveedor');
    state.elements.telefonoProveedorInput = document.getElementById('telefonoProveedor');
    state.elements.modalContacto = document.getElementById('modalContacto');
    state.elements.modalContactoLabel = document.getElementById('modalContactoLabel');
    state.elements.formularioContacto = document.getElementById('formularioContacto');
    state.elements.idContactoInput = document.getElementById('idContacto');
    state.elements.idProveedorContactoInput = document.getElementById('idProveedorContacto');
    state.elements.nombreContactoInput = document.getElementById('nombreContacto');
    state.elements.rolContactoSelect = document.getElementById('rolContacto');
    state.elements.emailContactoInput = document.getElementById('emailContacto');
    state.elements.telefonoContactoInput = document.getElementById('telefonoContacto');
    state.elements.providerCard = document.getElementById('providerCard');
    state.elements.navbar = document.querySelector('.navbar');
    state.elements.searchToggleButton = document.getElementById('searchToggleButton');
    state.elements.fullTitle = document.getElementById('fullTitle');
    state.elements.navbarNavSection = document.getElementById('navbarNavSection');
    state.elements.navbarSearchSection = document.getElementById('navbarSearchSection');
    state.elements.themeToggle = document.getElementById('themeToggle');
    state.elements.themeToggleHotspot = document.getElementById('themeToggleHotspot');
    state.elements.dropdownMenuButton = document.getElementById('dropdownMenuButton');
    state.elements.navbarDropdownMenu = document.getElementById('navbarDropdownMenu');

    // Config elements
    state.elements.inputCategoria = document.getElementById('inputCategoria');
    state.elements.listaCategorias = document.getElementById('listaCategorias');
    state.elements.inputUnidadMedida = document.getElementById('inputUnidadMedida');
    state.elements.listaUnidadesMedida = document.getElementById('listaUnidadesMedida');
    state.elements.inputRol = document.getElementById('inputRol');
    state.elements.listaRoles = document.getElementById('listaRoles');
    state.elements.inputLocalidad = document.getElementById('inputLocalidad');
    state.elements.listaLocalidades = document.getElementById('listaLocalidades');
    state.elements.inputProveedorPlastico = document.getElementById('inputProveedorPlastico');
    state.elements.listaProveedoresPlastico = document.getElementById('listaProveedoresPlastico');

    // Search filter element
    state.elements.searchFilterSelect = document.getElementById('searchFilterSelect');
    state.elements.panelContactos = document.getElementById('panel-contactos');
    state.elements.listaComisionistasContainer = document.getElementById('lista-comisionistas');
    state.elements.modalComisionista = document.getElementById('modalComisionista');
    state.elements.modalComisionistaLabel = document.getElementById('modalComisionistaLabel');
    state.elements.formularioComisionista = document.getElementById('formularioComisionista');
    state.elements.idComisionistaInput = document.getElementById('idComisionista');
    state.elements.nombreComisionistaInput = document.getElementById('nombreComisionista');
    state.elements.telefonoComisionistaInput = document.getElementById('telefonoComisionista');
    state.elements.localidadesCheckboxes = document.getElementById('localidadesCheckboxes');

    // Compras panel elements
    state.elements.comprasTableBody = document.getElementById('tabla-compras-body');
    state.elements.footerCompras = document.getElementById('footer-compras');

    // Pagos panel elements
    state.elements.pagosPendientesTableBody = document.getElementById('tabla-pagos-pendientes-body');
    state.elements.footerPagosPendientes = document.getElementById('footer-pagos-pendientes');
    state.elements.pagosHistorialTableBody = document.getElementById('tabla-pagos-historial-body');
    state.elements.footerPagosHistorial = document.getElementById('footer-pagos-historial');
    state.elements.modalNuevoPagoPlastico = document.getElementById('modalNuevoPagoPlastico');
    state.elements.formularioNuevoPagoPlastico = document.getElementById('formularioNuevoPagoPlastico');
    state.elements.proveedorPlasticoPagoSelect = document.getElementById('proveedorPlasticoPago');
    state.elements.kilosTotalesInput = document.getElementById('kilosTotalesInput');
    state.elements.pagosPendientesTableTfoot = document.getElementById('tabla-pagos-pendientes-tfoot');
    state.elements.tablaMonthlyKilosBody = document.getElementById('tabla-monthly-kilos-body');

    // Pagos chart
    state.elements.pagosKilosChartContainer = document.getElementById('pagosKilosChart');

    // Dashboard elements
    state.elements.dashboardPagosPendientes = document.getElementById('dashboard-pagos-pendientes');
    state.elements.dashboardArticulosComprar = document.getElementById('dashboard-articulos-comprar');
    state.elements.dashboardKilosComprados = document.getElementById('dashboard-kilos-comprados');
    state.elements.dashboardArticulosFaltantes = document.getElementById('dashboard-articulos-faltantes');
    state.elements.dashboardClock = document.getElementById('dashboard-clock');
    state.elements.dashboardTemp = document.getElementById('dashboard-temp');
    state.elements.dashboardNovedadesCount = document.getElementById('dashboard-novedades-count');
    state.elements.dashboardNovedadesList = document.getElementById('dashboard-novedades-list');
    state.elements.dashboardNovedadesFecha = document.getElementById('dashboard-novedades-fecha');

    // Mensaje de inicio
    state.elements.inicioMensaje = document.getElementById('inicio-mensaje');

    // Faltantes elements
    state.elements.faltantesTableBody = document.getElementById('tabla-faltantes-body');
    state.elements.footerFaltantes = document.getElementById('footer-faltantes');
    state.elements.modalFaltante = document.getElementById('modalFaltante');
    state.elements.modalFaltanteLabel = document.getElementById('modalFaltanteLabel');
    state.elements.formularioFaltante = document.getElementById('formularioFaltante');
    state.elements.idFaltanteInput = document.getElementById('idFaltante');
    state.elements.codigoFaltanteInput = document.getElementById('codigoFaltante');
    state.elements.medidaFaltanteInput = document.getElementById('medidaFaltante');
    state.elements.cantidadFaltanteInput = document.getElementById('cantidadFaltante');

    // Version Info Modal elements
    state.elements.modalVersionInfo = document.getElementById('modalVersionInfo');
    state.elements.modalVersionInfoBody = state.elements.modalVersionInfo ? state.elements.modalVersionInfo.querySelector('.modal-body') : null;
}

const DURACION_SALUDO_MS = 1800;
const DURACION_SALIDA_MENSAJE_MS = 900;

/** Saca del esqueleto un bloque del dashboard cuando ya tiene sus datos. */
export function marcarBloqueListo(bloque) {
    const el = document.querySelector(`[data-esqueleto="${bloque}"].esqueleto`);
    if (!el) return;
    el.classList.remove('esqueleto');
    el.classList.add('esqueleto-revelado');
    panelHandlers['comprobarInicio']?.();
}

function cambiarMensajeInicio(texto) {
    const el = state.elements.inicioMensaje;
    if (!el) return;
    el.classList.remove('text-enter');
    void el.offsetWidth;
    el.classList.add('text-exit');
    setTimeout(() => {
        el.textContent = texto;
        el.classList.remove('text-exit');
        void el.offsetWidth;
        el.classList.add('text-enter');
    }, 340);
}

/** Muestra los mensajes de carga mientras el dashboard está en esqueleto. */
export function mostrarEsqueletoInicio() {
    const el = state.elements.inicioMensaje;
    if (!el) return;

    const textos = state.loadingTexts;
    let indice = Math.floor(Math.random() * textos.length);
    el.textContent = textos[indice];
    el.classList.add('text-enter');
    state.textInterval = setInterval(() => {
        indice = (indice + 1) % textos.length;
        cambiarMensajeInicio(textos[indice]);
    }, 2000);
}

/** Con los datos listos, quita el esqueleto, muestra el saludo del día y lo retira con una salida suave. */
export function finalizarEsqueletoInicio() {
    clearInterval(state.textInterval);

    const ahora = new Date();
    const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][ahora.getDay()];
    const diaMayuscula = dia.charAt(0).toUpperCase() + dia.slice(1);
    const saludoHora = ahora.getHours() < 12 ? 'Buen día' : ahora.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';
    const saludos = [
        `¡Ey, feliz ${dia}!`,
        `¡Hola! Feliz ${dia}`,
        `¡Feliz ${dia}!`,
        `¡Buen ${dia}!`,
        `¡${diaMayuscula} con todo!`,
        `¡Que sea un gran ${dia}!`,
        `¡Buenas, feliz ${dia}!`,
        `¡Arrancamos este ${dia}!`,
        `¡Vamos que este ${dia} sale redondo!`,
        `¡A ponerle ganas a este ${dia}!`,
        `¡Hola, equipo! Feliz ${dia}`,
        `¡Este ${dia} pinta bien!`,
        `¡${diaMayuscula} de los buenos!`,
        `¡${saludoHora}! Feliz ${dia}`,
        `¡${saludoHora}, equipo!`
    ];

    cambiarMensajeInicio(saludos[Math.floor(Math.random() * saludos.length)]);
    document.body.classList.remove('app-cargando');
    window.mostrarPanel('dashboard');

    setTimeout(() => {
        const el = state.elements.inicioMensaje;
        if (!el) return;
        el.classList.remove('text-enter');
        el.classList.add('inicio-salida');
        setTimeout(() => el.remove(), DURACION_SALIDA_MENSAJE_MS);
    }, DURACION_SALUDO_MS);
}

/**
 * Applies the correct visual state to the navbar based on search mode and screen size.
 */
function applyNavbarState() {
    if (!state.elements.navbar || !state.elements.searchToggleButton || !state.elements.buscador || !state.elements.fullTitle || !state.elements.navbarNavSection || !state.elements.navbarSearchSection || !state.elements.searchFilterSelect) {
        console.warn("One or more navbar elements not found.");
        return;
    }

    if (window.innerWidth > 991) {
        if (state.isSearchMode) {
            state.elements.navbar.classList.add('search-expanded');
            state.elements.searchToggleButton.innerHTML = '<i class="bi bi-x-circle-fill"></i>';
            state.elements.searchFilterSelect.style.display = 'block';
            setTimeout(() => {
                state.elements.buscador.focus();
            }, 300);
        } else {
            state.elements.navbar.classList.remove('search-expanded');
            state.elements.searchToggleButton.innerHTML = '<i class="bi bi-search"></i>';
            state.elements.buscador.value = '';
            window.mostrarPanel(state.currentActivePanel);
            state.elements.searchFilterSelect.style.display = 'none';
        }
    } else {
        state.elements.navbar.classList.remove('search-expanded');
        state.elements.searchToggleButton.innerHTML = '<i class="bi bi-search"></i>';
        state.elements.buscador.value = '';
        state.elements.searchFilterSelect.style.display = 'none';
    }
}

/**
 * Updates the options in the search filter select element based on the active panel.
 */
function updateSearchFilterOptions(panelId) {
    const select = state.elements.searchFilterSelect;
    if (!select) return;

    select.innerHTML = '';

    if (panelId === 'insumos') {
        if (state.activeInsumosTab === 'inventario') {
            select.innerHTML += '<option value="nombre">Nombre</option>';
            select.innerHTML += '<option value="categoria">Categoría</option>';
            select.innerHTML += '<option value="descripcion">Descripción</option>';
            state.currentSearchFilter = 'nombre';
        } else if (state.activeInsumosTab === 'compras') {
            select.innerHTML += '<option value="nombreArticulo">Artículo</option>';
            select.innerHTML += '<option value="proveedorArticulo">Proveedor</option>';
            state.currentSearchFilter = 'nombreArticulo';
        } else {
            select.innerHTML += '<option value="nombreAnalisis">Artículo</option>';
            state.currentSearchFilter = 'nombreAnalisis';
        }
    } else if (panelId === 'contactos') {
        if (state.activeContactosTab === 'proveedores') {
            select.innerHTML += '<option value="nombreProveedor">Proveedor</option>';
            select.innerHTML += '<option value="nombreContacto">Contacto</option>';
            select.innerHTML += '<option value="descripcionProveedor">Descripción</option>';
            select.innerHTML += '<option value="direccionProveedor">Dirección</option>';
            state.currentSearchFilter = 'nombreProveedor';
        } else {
            select.innerHTML += '<option value="nombreComisionista">Nombre</option>';
            select.innerHTML += '<option value="localidadComisionista">Localidad</option>';
            state.currentSearchFilter = 'nombreComisionista';
        }
    } else if (panelId === 'bobinas') {
        select.innerHTML += '<option value="nombreBobina">Artículo</option>';
        select.innerHTML += '<option value="materialBobina">Material</option>';
        state.currentSearchFilter = 'nombreBobina';
    } else if (panelId === 'faltantes') {
        select.innerHTML += '<option value="codigoFaltante">Código</option>';
        select.innerHTML += '<option value="medidaFaltante">Medida</option>';
        state.currentSearchFilter = 'codigoFaltante';
    } else if (panelId === 'pagos') {
        select.innerHTML += '<option value="proveedorPlasticoPago">Proveedor</option>';
        state.currentSearchFilter = 'proveedorPlasticoPago';
    } else if (panelId === 'horarios') {
        select.innerHTML += '<option value="nombreOperario">Operario</option>';
        select.innerHTML += '<option value="puestoOperario">Puesto</option>';
        state.currentSearchFilter = 'nombreOperario';
    } else if (panelId === 'termos') {
        select.innerHTML += '<option value="none">Sin filtro</option>';
        state.currentSearchFilter = 'none';
    } else if (panelId === 'dashboard') {
        select.innerHTML += '<option value="none">Sin filtro</option>';
        state.currentSearchFilter = 'none';
    }
    select.value = state.currentSearchFilter;
}

/**
 * Displays the specified panel and updates the active navigation link.
 */
window.mostrarPanel = function(panelId, event) {
    if (event && event.detail === 0) return;

    state.currentActivePanel = panelId;

    document.getElementById('panel-dashboard').style.display = 'none';
    document.getElementById('panel-insumos').style.display = 'none';
    document.getElementById('panel-contactos').style.display = 'none';
    document.getElementById('panel-bobinas').style.display = 'none';
    document.getElementById('panel-faltantes').style.display = 'none';
    document.getElementById('panel-pagos').style.display = 'none';
    document.getElementById('panel-control').style.display = 'none';
    const panelHorarios = document.getElementById('panel-horarios');
    if (panelHorarios) panelHorarios.style.display = 'none';
    document.getElementById('panel-termos').style.display = 'none';
    document.getElementById('panel-configuracion').style.display = 'none';
    // Hide bobinas cart bar when leaving the panel
    const bCartBar = document.getElementById('bobinas-cart-bar');
    const bCartDetails = document.getElementById('bobinas-cart-details');
    if (bCartBar && panelId !== 'bobinas') bCartBar.style.display = 'none';
    if (bCartDetails) bCartDetails.style.display = 'none';

    document.querySelectorAll('#navbarDropdownMenu .dropdown-item').forEach(link => {
        link.classList.remove('active');
    });

    updateSearchFilterOptions(panelId);
    // Se limpia antes de dibujar: un texto previo no debe filtrar la lista al abrir el panel.
    if (state.elements.buscador) state.elements.buscador.value = '';

    let panelName = panelDisplayNames[panelId] || 'Panel';
    if (panelId === 'configuracion') {
        panelName = '<i class="bi bi-gear-fill"></i> Configuración';
    }

    if (state.elements.dropdownMenuButton) {
        state.elements.dropdownMenuButton.innerHTML = panelName + ' <span class="caret"></span>';
    }

    if (panelId === 'dashboard') {
        document.getElementById('panel-dashboard').style.display = 'block';
        if (document.getElementById('nav-dashboard')) document.getElementById('nav-dashboard').classList.add('active');
        panelHandlers['dashboard']?.();
    } else if (panelId === 'insumos') {
        document.getElementById('panel-insumos').style.display = 'block';
        if (document.getElementById('nav-insumos')) document.getElementById('nav-insumos').classList.add('active');
        panelHandlers['insumos']?.();
    } else if (panelId === 'contactos') {
        document.getElementById('panel-contactos').style.display = 'block';
        if (document.getElementById('nav-contactos')) document.getElementById('nav-contactos').classList.add('active');
        panelHandlers['contactos']?.();
    } else if (panelId === 'bobinas') {
        document.getElementById('panel-bobinas').style.display = 'block';
        if (document.getElementById('nav-bobinas')) document.getElementById('nav-bobinas').classList.add('active');
        panelHandlers['bobinas']?.();
    } else if (panelId === 'faltantes') {
        document.getElementById('panel-faltantes').style.display = 'block';
        if (document.getElementById('nav-faltantes')) document.getElementById('nav-faltantes').classList.add('active');
        panelHandlers['faltantes']?.();
    } else if (panelId === 'pagos') {
        document.getElementById('panel-pagos').style.display = 'block';
        if (document.getElementById('nav-pagos')) document.getElementById('nav-pagos').classList.add('active');
        panelHandlers['pagos']?.();
    } else if (panelId === 'control') {
        document.getElementById('panel-control').style.display = 'block';
        if (document.getElementById('nav-control')) document.getElementById('nav-control').classList.add('active');
        panelHandlers['control']?.();
    } else if (panelId === 'horarios') {
        if (panelHorarios) panelHorarios.style.display = 'block';
        if (document.getElementById('nav-horarios')) document.getElementById('nav-horarios').classList.add('active');
        panelHandlers['horarios']?.();
    } else if (panelId === 'termos') {
        document.getElementById('panel-termos').style.display = 'block';
        if (document.getElementById('nav-termos')) document.getElementById('nav-termos').classList.add('active');
        panelHandlers['termos']?.();
    } else if (panelId === 'configuracion') {
        document.getElementById('panel-configuracion').style.display = 'block';
        if (document.getElementById('nav-configuracion')) document.getElementById('nav-configuracion').classList.add('active');
    }

    state.currentActivePanel = panelId;
    if (state.elements.buscador) {
        state.elements.buscador.value = '';
    }
}

export function setupUIListeners() {
    // Corner buttons (theme toggle + config)
    const configToggleEl = document.getElementById('configToggle');
    let hideThemeToggleTimeout;

    const showThemeToggle = () => {
        clearTimeout(hideThemeToggleTimeout);
        if (state.elements.themeToggle) state.elements.themeToggle.classList.add('show');
        if (configToggleEl) configToggleEl.classList.add('show');
    };

    const hideThemeToggle = () => {
        hideThemeToggleTimeout = setTimeout(() => {
            if (state.elements.themeToggle) state.elements.themeToggle.classList.remove('show');
            if (configToggleEl) configToggleEl.classList.remove('show');
        }, 200);
    };

    if (state.elements.themeToggleHotspot) state.elements.themeToggleHotspot.addEventListener('mouseenter', showThemeToggle);
    if (state.elements.themeToggleHotspot) state.elements.themeToggleHotspot.addEventListener('mouseleave', hideThemeToggle);
    if (state.elements.themeToggle) state.elements.themeToggle.addEventListener('mouseenter', showThemeToggle);
    if (state.elements.themeToggle) state.elements.themeToggle.addEventListener('mouseleave', hideThemeToggle);
    if (configToggleEl) configToggleEl.addEventListener('mouseenter', showThemeToggle);
    if (configToggleEl) configToggleEl.addEventListener('mouseleave', hideThemeToggle);

    if (state.elements.themeToggle) {
        state.elements.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLightMode = document.body.classList.contains('light-mode');
            localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
        });
    }

    // Apply saved theme on load
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }

    // Search input event listener
    if (state.elements.buscador) {
        state.elements.buscador.addEventListener('input', () => {
            panelHandlers[state.currentActivePanel]?.();
        });
    }

    // Search filter select event listener
    if (state.elements.searchFilterSelect) {
        state.elements.searchFilterSelect.addEventListener('change', () => {
            state.currentSearchFilter = state.elements.searchFilterSelect.value;
            panelHandlers[state.currentActivePanel]?.();
        });
    }

    // Initialize navbar state and re-apply on resize
    applyNavbarState();
    window.addEventListener('resize', applyNavbarState);

    // Listener for the search bar toggle button
    if (state.elements.searchToggleButton) {
        state.elements.searchToggleButton.addEventListener('click', () => {
            if (window.innerWidth > 991) {
                state.isSearchMode = !state.isSearchMode;
                applyNavbarState();
            }
        });
    }

    // Add event listener for Comisionista modal
    if (state.elements.modalComisionista) {
        state.elements.modalComisionista.addEventListener('hidden.bs.modal', function () {
            console.log("Evento 'hidden.bs.modal' del Modal Comisionista disparado por Bootstrap.");
        });
        state.elements.modalComisionista.addEventListener('show.bs.modal', function () {
            console.log("Evento 'show.bs.modal' del Modal Comisionista disparado por Bootstrap.");
        });
    }

    // Resize observer for the pagos chart
    if (state.elements.pagosKilosChartContainer) {
        new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target.id === 'pagosKilosChart') {
                    panelHandlers['renderPagosKilosChart']?.();
                }
            }
        }).observe(state.elements.pagosKilosChartContainer);
    }
}

window.switchInsumosTab = function(tab) {
    state.activeInsumosTab = tab;

    document.getElementById('tab-btn-inventario').classList.toggle('active', tab === 'inventario');
    document.getElementById('tab-btn-compras').classList.toggle('active', tab === 'compras');
    document.getElementById('tab-btn-analisis').classList.toggle('active', tab === 'analisis');

    document.getElementById('insumos-section-inventario').style.display = tab === 'inventario' ? '' : 'none';
    document.getElementById('insumos-section-compras').style.display = tab === 'compras' ? '' : 'none';
    document.getElementById('insumos-section-analisis').style.display = tab === 'analisis' ? '' : 'none';

    document.getElementById('insumos-nuevo-articulo').style.display = tab === 'inventario' ? '' : 'none';
    document.getElementById('insumos-pdf-compras').style.display = tab === 'compras' ? '' : 'none';
    document.getElementById('insumos-btn-actualizar').style.display = tab === 'analisis' ? '' : 'none';

    updateSearchFilterOptions('insumos');
    if (state.elements.buscador) state.elements.buscador.value = '';

    panelHandlers['insumos']?.();
};

window.switchContactosTab = function(tab) {
    state.activeContactosTab = tab;

    // Actualizar botones de pestaña
    document.getElementById('tab-btn-proveedores').classList.toggle('active', tab === 'proveedores');
    document.getElementById('tab-btn-comisionistas').classList.toggle('active', tab === 'comisionistas');

    // Mostrar/ocultar secciones
    document.getElementById('contactos-section-proveedores').style.display = tab === 'proveedores' ? '' : 'none';
    document.getElementById('contactos-section-comisionistas').style.display = tab === 'comisionistas' ? '' : 'none';

    // Mostrar/ocultar botón nuevo
    document.getElementById('contactos-nuevo-proveedor').style.display = tab === 'proveedores' ? '' : 'none';
    document.getElementById('contactos-nuevo-comisionista').style.display = tab === 'comisionistas' ? '' : 'none';

    // Actualizar filtros de búsqueda y limpiar buscador
    updateSearchFilterOptions('contactos');
    if (state.elements.buscador) state.elements.buscador.value = '';

    // Re-renderizar la sección activa
    panelHandlers['contactos']?.();
};
