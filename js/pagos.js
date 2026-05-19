import { state } from './state.js';
import { getUserCollection, doc, addDoc, setDoc, deleteDoc, increment } from './firebase.js';
import { renderMonthlyKilosChart } from './dashboard.js';

const MONTH_NAMES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTH_NAMES_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SUPPLIER_COLOR = '#60D040';

export function renderizarPanelPagos() {
    renderizarTablaPagosPendientes();
    renderizarTablaHistorialPagos();
    renderizarRankingProveedores();
    const chartEl  = document.getElementById('pagosKilosChart');
    const legendEl = document.getElementById('pagos-chart-legend');
    if (chartEl) renderMonthlyKilosChart(chartEl, legendEl);
}
window.renderizarPanelPagos = renderizarPanelPagos;

/**
 * Renders the pending payments table.
 */
function renderizarTablaPagosPendientes() {
    const tbody = state.elements.pagosPendientesTableBody;
    const tfoot = state.elements.pagosPendientesTableTfoot;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    const pagosFiltrados = state.pendingPaymentsData.filter(pago => {
        const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
        const proveedorNombre = proveedor ? proveedor.name.toLowerCase() : '';

        const matchesSearch = (
            (state.currentSearchFilter === 'proveedorPlasticoPago' && proveedorNombre.includes(terminoBusqueda)) ||
            (terminoBusqueda === '')
        );
        return matchesSearch;
    });

    let totalKilosPorPagar = 0;

    if (pagosFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay pagos pendientes.</td></tr>';
    } else {
        pagosFiltrados.forEach(pago => {
            const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
            const fechaCarga = pago.fechaCarga instanceof Date ? pago.fechaCarga.toLocaleDateString() : new Date(pago.fechaCarga.toDate()).toLocaleDateString();
            tbody.innerHTML += `
                <tr>
                    <td>${fechaCarga}</td>
                    <td>${proveedor ? proveedor.name : 'N/A'}</td>
                    <td class="text-end">${Math.round(pago.kilosTotales)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-success me-1" onclick="pagarPendiente('${pago.id}')" title="Marcar como Pagado"><i class="bi bi-cash-coin"></i> Pagar</button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarPagoPendiente('${pago.id}')" title="Eliminar Registro"><i class="bi bi-trash-fill"></i></button>
                    </td>
                </tr>
            `;
            totalKilosPorPagar += pago.kilosTotales;
        });
    }

    tfoot.innerHTML = `
        <tr>
            <th colspan="2" class="text-end">Total Kilos por Pagar:</th>
            <th class="text-end">${Math.round(totalKilosPorPagar)}</th>
            <th></th>
        </tr>
    `;

    if (state.elements.footerPagosPendientes) {
        state.elements.footerPagosPendientes.innerText = `${pagosFiltrados.length} pago(s) pendiente(s).`;
    }
}

/**
 * Renders the payment history table.
 */
function renderizarTablaHistorialPagos() {
    const tbody = state.elements.pagosHistorialTableBody;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    tbody.innerHTML = '';

    const historialFiltrado = state.paymentHistoryData.filter(pago => {
        const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
        const proveedorNombre = proveedor ? proveedor.name.toLowerCase() : '';

        const matchesSearch = (
            (state.currentSearchFilter === 'proveedorPlasticoPago' && proveedorNombre.includes(terminoBusqueda)) ||
            (terminoBusqueda === '')
        );
        return matchesSearch;
    });

    if (historialFiltrado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay historial de pagos.</td></tr>';
    } else {
        historialFiltrado.forEach(pago => {
            const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
            const fechaCarga = pago.fechaCarga instanceof Date ? pago.fechaCarga.toLocaleDateString() : new Date(pago.fechaCarga.toDate()).toLocaleDateString();
            const fechaPago = pago.fechaPago instanceof Date ? pago.fechaPago.toLocaleDateString() : new Date(pago.fechaPago.toDate()).toLocaleDateString();
            tbody.innerHTML += `
                <tr>
                    <td>${fechaCarga}</td>
                    <td>${fechaPago}</td>
                    <td>${proveedor ? proveedor.name : 'N/A'}</td>
                    <td class="text-end">${Math.round(pago.kilosTotales)}</td>
                </tr>
            `;
        });
    }
    if (state.elements.footerPagosHistorial) {
        state.elements.footerPagosHistorial.innerText = `${historialFiltrado.length} pago(s) en historial.`;
    }
}

/**
 * Prepares the modal for a new plastic payment.
 */
window.prepararModalNuevoPago = function() {
    if (state.elements.formularioNuevoPagoPlastico) state.elements.formularioNuevoPagoPlastico.reset();
    actualizarDropdownProveedoresPlastico();
    if (state.elements.kilosTotalesInput) state.elements.kilosTotalesInput.value = '';
}

/**
 * Updates the plastic suppliers dropdown in the new payment modal.
 */
export function actualizarDropdownProveedoresPlastico(idSeleccionado = '') {
    const select = state.elements.proveedorPlasticoPagoSelect;
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione Proveedor de Plástico</option>';
    state.plasticSuppliersData.forEach(p => {
        select.innerHTML += `<option value="${p.id}" ${p.id === idSeleccionado ? 'selected' : ''}>${p.name}</option>`;
    });
}

/**
 * Saves a new pending plastic payment to Firestore.
 */
window.guardarPagoPendiente = async function() {
    const idProveedorPlastico = state.elements.proveedorPlasticoPagoSelect ? state.elements.proveedorPlasticoPagoSelect.value : '';
    const kilosTotales = state.elements.kilosTotalesInput ? parseInt(state.elements.kilosTotalesInput.value) : 0;

    if (!idProveedorPlastico) {
        window.showAlert("Por favor, seleccione un proveedor de plástico.");
        return;
    }
    if (isNaN(kilosTotales) || kilosTotales <= 0) {
        window.showAlert("Debe ingresar una cantidad válida de kilos totales.");
        return;
    }

    const datos = {
        idProveedorPlastico: idProveedorPlastico,
        fechaCarga: new Date(),
        kilosTotales: kilosTotales,
        estado: 'pendiente'
    };

    try {
        await addDoc(getUserCollection('pendingPayments'), datos);
        console.log("Pago pendiente registrado.");
        bootstrap.Modal.getInstance(state.elements.modalNuevoPagoPlastico).hide();
    } catch (e) {
        console.error("Error al registrar pago pendiente:", e);
        window.showAlert("Error al registrar el pago pendiente. Intente de nuevo.");
    }
}

/**
 * Marks a pending payment as paid and moves it to history.
 */
window.pagarPendiente = function(paymentId) {
    const pago = state.pendingPaymentsData.find(p => p.id === paymentId);
    if (!pago) return;

    const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
    const proveedorNombre = proveedor ? proveedor.name : 'N/A';

    window.showConfirm(`¿Está seguro de que desea marcar el pago de <strong>${Math.round(pago.kilosTotales)} Kilos</strong> a <strong>${proveedorNombre}</strong> como pagado?`, async (confirmed) => {
        if (confirmed) {
            try {
                await addDoc(getUserCollection('paymentHistory'), {
                    ...pago,
                    fechaPago: new Date(),
                    estado: 'pagado'
                });

                const today = new Date();
                const currentMonthYear = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
                const monthlySummaryRef = doc(getUserCollection('monthlyKiloSummaries'), currentMonthYear);

                await setDoc(monthlySummaryRef, { totalKilos: increment(pago.kilosTotales) }, { merge: true });
                console.log(`Kilos totales para ${currentMonthYear} incrementados en ${pago.kilosTotales}`);

                await deleteDoc(doc(getUserCollection('pendingPayments'), paymentId));
                console.log("Pago marcado como pagado y movido a historial:", paymentId);
            } catch (e) {
                console.error("Error al marcar pago como pagado:", e);
                window.showAlert("Error al marcar el pago como pagado. Intente de nuevo.");
            }
        }
    });
}

/**
 * Deletes a pending payment record.
 */
window.eliminarPagoPendiente = function(paymentId) {
    const pago = state.pendingPaymentsData.find(p => p.id === paymentId);
    if (!pago) return;

    const proveedor = state.plasticSuppliersData.find(ps => ps.id === pago.idProveedorPlastico);
    const proveedorNombre = proveedor ? proveedor.name : 'N/A';

    window.showConfirm(`¿Está seguro de que desea eliminar el registro de pago pendiente de <strong>${Math.round(pago.kilosTotales)} Kilos</strong> a <strong>${proveedorNombre}</strong>? Esta acción no se puede deshacer.`, async (confirmed) => {
        if (confirmed) {
            try {
                await deleteDoc(doc(getUserCollection('pendingPayments'), paymentId));
                console.log("Registro de pago pendiente eliminado:", paymentId);
            } catch (e) {
                console.error("Error al eliminar registro de pago pendiente:", e);
                window.showAlert("Error al eliminar el registro de pago pendiente. Intente de nuevo.");
            }
        }
    });
}

/**
 * Displays the modal with the monthly history of total kilos paid.
 */
window.mostrarHistorialMensualKilos = function() {
    const tbody = state.elements.tablaMonthlyKilosBody;
    if (!tbody) return;
    tbody.innerHTML = '';

    const monthlySummariesArray = Object.keys(state.monthlyKiloSummariesData).map(key => ({
        monthYear: key,
        totalKilos: state.monthlyKiloSummariesData[key]
    }));

    monthlySummariesArray.sort((a, b) => a.monthYear.localeCompare(b.monthYear));

    if (monthlySummariesArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No hay historial mensual de kilos pagados.</td></tr>';
    } else {
        monthlySummariesArray.forEach(summary => {
            const [year, monthNum] = summary.monthYear.split('-');
            const monthNames = [
                "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
            ];
            const monthName = monthNames[parseInt(monthNum, 10) - 1];
            const formattedMonthYear = `${monthName} ${year}`;

            tbody.innerHTML += `
                <tr>
                    <td>${formattedMonthYear}</td>
                    <td class="text-end">${Math.round(summary.totalKilos)}</td>
                </tr>
            `;
        });
    }
};

// ── Tab switcher ────────────────────────────────────────────────────────────

window.switchPagosTab = function(tab) {
    document.getElementById('tab-pagos-pendientes').classList.toggle('active', tab === 'pendientes');
    document.getElementById('tab-pagos-historial').classList.toggle('active', tab === 'historial');
    document.getElementById('pagos-section-pendientes').style.display = tab === 'pendientes' ? '' : 'none';
    document.getElementById('pagos-section-historial').style.display  = tab === 'historial'  ? '' : 'none';
    document.getElementById('footer-pagos-pendientes').style.display  = tab === 'pendientes' ? '' : 'none';
    document.getElementById('footer-pagos-historial').style.display   = tab === 'historial'  ? '' : 'none';
};

// ── Ranking de proveedores ───────────────────────────────────────────────────

function renderizarRankingProveedores() {
    const tbody = document.getElementById('tabla-ranking-proveedores-body');
    if (!tbody) return;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const allPayments = [...(state.paymentHistoryData || []), ...(state.pendingPaymentsData || [])];

    const stats = {};
    allPayments.forEach(p => {
        const id = p.idProveedorPlastico;
        if (!id || !p.kilosTotales) return;
        if (!stats[id]) stats[id] = { kgMes: 0, kgTotal: 0, entregas: 0 };
        stats[id].kgTotal += Number(p.kilosTotales);
        stats[id].entregas += 1;
        try {
            const f = p.fechaCarga?.toDate ? p.fechaCarga.toDate() : new Date(p.fechaCarga);
            const key = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`;
            if (key === currentMonthKey) stats[id].kgMes += Number(p.kilosTotales);
        } catch(e) {}
    });

    const ranking = Object.entries(stats)
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => b.kgMes - a.kgMes || b.kgTotal - a.kgTotal);

    if (!ranking.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Sin datos de proveedores.</td></tr>';
        return;
    }

    const MEDALS = ['🥇', '🥈', '🥉'];
    tbody.innerHTML = ranking.map((s, i) => {
        const prov = state.plasticSuppliersData.find(p => p.id === s.id);
        const nombre = prov?.name || 'N/A';
        const pos = MEDALS[i] || `${i + 1}`;
        return `<tr class="ranking-proveedor-row" onclick="abrirModalProveedor('${s.id}')">
            <td class="text-center fw-bold fs-5">${pos}</td>
            <td><strong>${nombre}</strong></td>
            <td class="text-end">${s.kgMes > 0 ? Math.round(s.kgMes).toLocaleString('es-AR') + ' kg' : '—'}</td>
            <td class="text-end">${Math.round(s.kgTotal).toLocaleString('es-AR')} kg</td>
            <td class="text-end text-muted">${s.entregas}</td>
        </tr>`;
    }).join('');
}

// ── Modal detalle de proveedor ───────────────────────────────────────────────

window.abrirModalProveedor = function(supplierId) {
    const prov = state.plasticSuppliersData.find(p => p.id === supplierId);
    if (!prov) return;

    const titleEl = document.getElementById('modal-proveedor-nombre');
    if (titleEl) titleEl.textContent = prov.name;

    const allPayments = [...(state.paymentHistoryData || []), ...(state.pendingPaymentsData || [])]
        .filter(p => p.idProveedorPlastico === supplierId);

    const kgTotal = allPayments.reduce((s, p) => s + Number(p.kilosTotales || 0), 0);

    const byMonth = {};
    allPayments.forEach(p => {
        try {
            const f = p.fechaCarga?.toDate ? p.fechaCarga.toDate() : new Date(p.fechaCarga);
            const key = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`;
            byMonth[key] = (byMonth[key] || 0) + Number(p.kilosTotales || 0);
        } catch(e) {}
    });
    const meses = Object.keys(byMonth).length;
    const kgPromedio = meses > 0 ? Math.round(kgTotal / meses) : 0;

    const statsEl = document.getElementById('modal-proveedor-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="d-flex gap-4 flex-wrap justify-content-center text-center py-1">
                <div>
                    <div class="fs-4 fw-bold" style="color:var(--accent-color)">${Math.round(kgTotal).toLocaleString('es-AR')}</div>
                    <div class="text-muted small">Kg totales</div>
                </div>
                <div>
                    <div class="fs-4 fw-bold" style="color:var(--accent-color)">${kgPromedio.toLocaleString('es-AR')}</div>
                    <div class="text-muted small">Kg prom./mes</div>
                </div>
                <div>
                    <div class="fs-4 fw-bold" style="color:var(--accent-color)">${meses}</div>
                    <div class="text-muted small">Meses activo</div>
                </div>
                <div>
                    <div class="fs-4 fw-bold" style="color:var(--accent-color)">${allPayments.length}</div>
                    <div class="text-muted small">Entregas</div>
                </div>
            </div>`;
    }

    renderGraficoProveedor(byMonth);
    renderPagosProveedor(allPayments);

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalProveedorDetalle')).show();
};

function renderGraficoProveedor(byMonth) {
    const container = document.getElementById('modal-proveedor-chart');
    if (!container) return;
    d3.select(container).selectAll('*').remove();

    const months = Object.keys(byMonth).sort();
    if (!months.length) {
        d3.select(container).append('p').attr('class','text-center text-muted mt-3').text('Sin historial de kilos.');
        return;
    }

    const data = months.map(m => ({ month: m, kilos: byMonth[m] }));
    const parentWidth  = container.clientWidth  || 500;
    const parentHeight = container.clientHeight || 200;
    const margin = { top: 12, right: 16, bottom: 48, left: 52 };
    const width  = parentWidth  - margin.left - margin.right;
    const height = parentHeight - margin.top  - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width', parentWidth).attr('height', parentHeight)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(months).range([0, width]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.kilos) * 1.15 || 1]).range([height, 0]);

    svg.append('g').attr('class','x axis').attr('transform',`translate(0,${height})`)
        .call(d3.axisBottom(x)).selectAll('text')
        .attr('transform','rotate(-45)').style('text-anchor','end')
        .text(d => {
            const [yr, mn] = d.split('-');
            return `${MONTH_NAMES_SHORT[parseInt(mn)-1]} ${yr.substring(2)}`;
        });
    svg.append('g').attr('class','y axis').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0f')));

    const tooltip = d3.select('body').select('.tooltip');
    svg.selectAll('rect').data(data).enter().append('rect')
        .attr('x', d => x(d.month))
        .attr('y', d => y(d.kilos))
        .attr('width', x.bandwidth())
        .attr('height', d => Math.max(0, height - y(d.kilos)))
        .attr('fill', SUPPLIER_COLOR)
        .attr('rx', 2)
        .on('mouseover', function(event, d) {
            d3.select(this).style('opacity', 0.75);
            const [yr, mn] = d.month.split('-');
            tooltip.transition().duration(150).style('opacity', .95);
            tooltip.html(`<strong>${MONTH_NAMES_FULL[parseInt(mn)-1]} ${yr}</strong><br>${Math.round(d.kilos).toLocaleString('es-AR')} kg`)
                .style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 32) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).style('opacity', 1);
            tooltip.transition().duration(400).style('opacity', 0);
        });
}

function renderPagosProveedor(pagos) {
    const tbody = document.getElementById('modal-proveedor-pagos-body');
    if (!tbody) return;

    const sorted = [...pagos].sort((a, b) => {
        const fa = a.fechaCarga?.toDate ? a.fechaCarga.toDate() : new Date(a.fechaCarga);
        const fb = b.fechaCarga?.toDate ? b.fechaCarga.toDate() : new Date(b.fechaCarga);
        return fb - fa;
    });

    if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Sin registros.</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(p => {
        const f = p.fechaCarga?.toDate ? p.fechaCarga.toDate() : new Date(p.fechaCarga);
        const fecha = `${f.getDate()} ${MONTH_NAMES_SHORT[f.getMonth()]} ${f.getFullYear()}`;
        const badge = p.estado === 'pagado'
            ? '<span class="badge bg-success">Pagado</span>'
            : '<span class="badge bg-warning text-dark">Pendiente</span>';
        return `<tr>
            <td>${fecha}</td>
            <td class="text-end">${Math.round(p.kilosTotales).toLocaleString('es-AR')} kg</td>
            <td class="text-center">${badge}</td>
        </tr>`;
    }).join('');
}
