import { state } from './state.js';
import { getUserCollection, doc, updateDoc, addDoc, deleteDoc } from './firebase.js';

// Paleta de colores para proveedores
const SUPPLIER_COLORS = ['#60D040','#9060e0','#fd7e14','#20c997','#e83e8c','#0dcaf0','#ffc107','#6610f2'];

/**
 * Renders the dashboard with key metrics and the monthly kilos chart.
 */
export function renderizarDashboard() {
    if (state.elements.dashboardPagosPendientes) {
        state.elements.dashboardPagosPendientes.innerText = state.pendingPaymentsData.length;
    }
    const articulosConStockBajo = state.inventarioData.filter(item => item.cantidadActual < item.stockMinimo);
    if (state.elements.dashboardArticulosComprar) {
        state.elements.dashboardArticulosComprar.innerText = articulosConStockBajo.length;
    }
    if (state.elements.dashboardArticulosFaltantes) {
        state.elements.dashboardArticulosFaltantes.innerText = state.faltantesData.length;
    }

    startDashboardClock();

    if (!window._weatherFetched) {
        window._weatherFetched = true;
        fetchWeatherDashboard();
    }

    renderDashboardNovedades();
    renderizarListaComprasDashboard();
    renderMonthlyKilosChart();
}

export function startDashboardClock() {
    if (state._clockInterval) return;
    state._clockInterval = setInterval(() => {
        if (state.elements.dashboardClock) {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            state.elements.dashboardClock.textContent = `${h}:${m}`;
        }
    }, 1000);
    // Tick inmediato
    if (state.elements.dashboardClock) {
        const now = new Date();
        state.elements.dashboardClock.textContent =
            `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }
}

export function fetchWeatherDashboard() {
    const CACHE_KEY = '_wx_cache';
    const TTL = 30 * 60 * 1000; // 30 min

    function applyWeather(icon, temp) {
        if (state.elements.dashboardTemp) state.elements.dashboardTemp.textContent = `${icon} ${temp}°C`;
    }

    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < TTL) {
            applyWeather(cached.icon, cached.temp);
            return;
        }
    } catch(e) {}

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const { latitude, longitude } = pos.coords;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
            const resp = await fetch(url);
            const data = await resp.json();
            const temp = Math.round(data.current.temperature_2m);
            const icon = wmoToIcon(data.current.weather_code);
            localStorage.setItem(CACHE_KEY, JSON.stringify({ icon, temp, ts: Date.now() }));
            applyWeather(icon, temp);
        } catch(e) {}
    }, () => {}, { timeout: 6000 });
}

function wmoToIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 2)  return '🌤️';
    if (code === 3) return '☁️';
    if (code <= 49) return '🌫️';
    if (code <= 69) return '🌧️';
    if (code <= 79) return '🌨️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

function renderDashboardNovedades() {
    const listEl  = state.elements.dashboardNovedadesList;
    const countEl = state.elements.dashboardNovedadesCount;
    const fechaEl = state.elements.dashboardNovedadesFecha;
    if (!listEl) return;

    if (!state.controlHistorialData || state.controlHistorialData.length === 0) {
        listEl.innerHTML = '<div class="novedades-empty">Sin novedades registradas</div>';
        if (countEl) countEl.style.display = 'none';
        return;
    }

    const sorted = [...state.controlHistorialData].sort((a, b) => {
        const da = a.fecha?.toDate?.() || new Date(a.fecha);
        const db = b.fecha?.toDate?.() || new Date(b.fecha);
        return db - da;
    });
    const ultima = sorted[0];
    const items  = ultima.items || [];
    const ctrlId = ultima.id || 'unknown';

    const conNovedades = items.filter(it => (it.novedades || []).length > 0);
    const total = conNovedades.reduce((acc, it) => acc + (it.novedades||[]).length, 0);

    if (total === 0) {
        listEl.innerHTML = '<div class="novedades-empty">Sin novedades en el último control</div>';
        if (countEl) countEl.style.display = 'none';
        return;
    }

    if (countEl) { countEl.style.display = ''; countEl.textContent = total; }
    if (fechaEl) {
        const f = ultima.fecha?.toDate?.() || new Date(ultima.fecha);
        fechaEl.textContent = f.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
    }

    const resolved = new Set(ultima.novedadesResueltas || []);

    const rows = [];
    conNovedades.forEach(it => {
        const label = it.tipo === 'checklist' ? it.tarea : it.articuloNombre;
        (it.novedades || []).forEach(n => {
            const key = `${label}||${n}`;
            rows.push({ label, text: n, key, done: resolved.has(key) });
        });
    });

    rows.sort((a, b) => a.done - b.done);

    listEl.innerHTML = rows.map(r => `
        <div class="novedades-row${r.done ? ' resolved' : ''}"
             onclick="window.toggleNovedad('${ctrlId}', ${JSON.stringify(r.key).replace(/"/g,'&quot;')})">
            <div class="novedades-row-label">${r.label}</div>
            <div>${r.text}</div>
        </div>`).join('');
}

window.toggleNovedad = async function(ctrlId, key) {
    const entry = state.controlHistorialData.find(d => d.id === ctrlId);
    if (!entry) return;
    const resolved = new Set(entry.novedadesResueltas || []);
    if (resolved.has(key)) resolved.delete(key); else resolved.add(key);
    const newResolved = [...resolved];
    // Optimistic update: renders instantly for this session
    entry.novedadesResueltas = newResolved;
    renderDashboardNovedades();
    // Firestore write: triggers onSnapshot on all other connected sessions
    try {
        await updateDoc(doc(getUserCollection('controlHistorial'), ctrlId), { novedadesResueltas: newResolved });
    } catch(e) {
        console.error('Error guardando estado de novedad:', e);
    }
};

/**
 * Renders the bar chart for monthly kilos purchased.
 * @param {HTMLElement} [containerEl] - defaults to the dashboard chart container
 * @param {HTMLElement} [legendEl] - defaults to #chart-legend
 */
export function renderMonthlyKilosChart(containerEl, legendEl) {
    const container = containerEl || state.elements.monthlyKilosChartContainer;
    if (!container) return;

    d3.select(container).selectAll("*").remove();
    const legendElFinal = legendEl || document.getElementById('chart-legend');
    if (legendElFinal) legendElFinal.innerHTML = '';

    const allPayments = [...(state.paymentHistoryData || []), ...(state.pendingPaymentsData || [])];

    const monthSet = new Set();
    allPayments.forEach(p => {
        try {
            const f = p.fechaCarga?.toDate ? p.fechaCarga.toDate() : new Date(p.fechaCarga);
            if (isNaN(f.getTime())) return;
            monthSet.add(`${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`);
        } catch(e) {}
    });
    const months = [...monthSet].sort();

    const suppliers = (state.plasticSuppliersData || []);
    const activeIds = suppliers
        .map(s => s.id)
        .filter(id => allPayments.some(p => p.idProveedorPlastico === id && p.kilosTotales));

    if (months.length === 0 || activeIds.length === 0) {
        d3.select(container).append("p")
            .attr("class","text-center text-muted")
            .text("No hay datos de kilos para mostrar.");
        return;
    }

    const monthIdx = Object.fromEntries(months.map((m,i) => [m,i]));
    const matrix = months.map(m => {
        const row = { monthYear: m };
        activeIds.forEach(id => row[id] = 0);
        return row;
    });
    allPayments.forEach(p => {
        if (!p.kilosTotales || !p.idProveedorPlastico) return;
        try {
            const f = p.fechaCarga?.toDate ? p.fechaCarga.toDate() : new Date(p.fechaCarga);
            if (isNaN(f.getTime())) return;
            const key = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`;
            const i = monthIdx[key];
            if (i !== undefined && matrix[i][p.idProveedorPlastico] !== undefined) {
                matrix[i][p.idProveedorPlastico] += Number(p.kilosTotales);
            }
        } catch(e) {}
    });

    if (legendElFinal) {
        activeIds.forEach((id, i) => {
            const name = suppliers.find(s => s.id === id)?.name || id;
            const color = SUPPLIER_COLORS[i % SUPPLIER_COLORS.length];
            legendElFinal.innerHTML += `<span class="chart-legend-item">
                <span class="chart-legend-dot" style="background:${color}"></span>${name}
            </span>`;
        });
    }

    const series = d3.stack().keys(activeIds)(matrix);
    const colorScale = d3.scaleOrdinal().domain(activeIds)
        .range(activeIds.map((_, i) => SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]));

    const parentWidth  = container.clientWidth;
    const parentHeight = container.clientHeight;
    const margin = { top: 28, right: 16, bottom: 56, left: 52 };
    const width  = parentWidth  - margin.left - margin.right;
    const height = parentHeight - margin.top  - margin.bottom;

    const svg = d3.select(container).append("svg")
        .attr("width",  parentWidth)
        .attr("height", parentHeight)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(months).range([0, width]).padding(0.3);
    const monthTotals = matrix.map(row => activeIds.reduce((sum, id) => sum + (row[id] || 0), 0));

    const y = d3.scaleLinear()
        .domain([0, d3.max(series, s => d3.max(s, d => d[1])) * 1.20])
        .range([height, 0]);

    svg.append("g").attr("class","x axis")
        .attr("transform",`translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform","rotate(-45)")
        .style("text-anchor","end")
        .text(d => {
            const [yr, mn] = d.split('-');
            const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            return `${names[parseInt(mn)-1]} ${yr.substring(2)}`;
        });
    svg.append("g").attr("class","y axis")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0f")));

    const tooltip = d3.select("body").append("div").attr("class","tooltip").style("opacity",0);
    const monthNamesFull = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    series.forEach(serie => {
        const supplierId = serie.key;
        const supplierName = suppliers.find(s => s.id === supplierId)?.name || supplierId;
        svg.selectAll(null)
            .data(serie)
            .enter().append("rect")
            .attr("x",      d => x(d.data.monthYear))
            .attr("y",      d => y(d[1]))
            .attr("height", d => Math.max(0, y(d[0]) - y(d[1])))
            .attr("width",  x.bandwidth())
            .attr("fill",   colorScale(supplierId))
            .attr("rx", 2)
            .on("mouseover", function(event, d) {
                d3.select(this).style("opacity", 0.75);
                tooltip.transition().duration(150).style("opacity", .95);
                const [yr, mn] = d.data.monthYear.split('-');
                tooltip.html(`<strong>${monthNamesFull[parseInt(mn)-1]} ${yr}</strong><br>${supplierName}<br>${Math.round(d[1]-d[0])} kg`)
                    .style("left", (event.pageX+12)+"px")
                    .style("top",  (event.pageY-32)+"px");
            })
            .on("mouseout", function() {
                d3.select(this).style("opacity", 1);
                tooltip.transition().duration(400).style("opacity", 0);
            });
    });

    // Total labels above each stacked bar
    svg.selectAll('.bar-total')
        .data(months)
        .enter().append('text')
        .attr('class', 'bar-total')
        .attr('x', d => x(d) + x.bandwidth() / 2)
        .attr('y', (d, i) => monthTotals[i] > 0 ? y(monthTotals[i]) - 5 : 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--text-color)')
        .attr('opacity', '0.85')
        .text((d, i) => monthTotals[i] > 0 ? d3.format(',')(monthTotals[i]) : '');
}

// ── Lista de Compras Compartida ──────────────────────────────────────────────
export function renderizarListaComprasDashboard() {
    const listEl = document.getElementById('dashboard-compras-lista');
    const countEl = document.getElementById('dashboard-compras-count');
    if (!listEl) return;

    const items = [...(state.listaComprasData || [])];
    // Ordenar: pendientes primero (más recientes arriba), luego completados
    items.sort((a, b) => {
        if (!!a.completado !== !!b.completado) return a.completado ? 1 : -1;
        const fa = a.creadoEn?.toDate?.() || new Date(a.creadoEn || 0);
        const fb = b.creadoEn?.toDate?.() || new Date(b.creadoEn || 0);
        return fb - fa;
    });

    const pendientes = items.filter(i => !i.completado).length;
    if (countEl) {
        countEl.textContent = `${pendientes} pendiente${pendientes === 1 ? '' : 's'}`;
        countEl.className = pendientes > 0 ? 'badge bg-warning text-dark ms-2' : 'badge bg-secondary ms-2';
    }

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-cart-x fs-2 d-block mb-1 opacity-50"></i>
                <small>No hay artículos en la lista de compras. Agregá uno arriba para que todos lo vean.</small>
            </div>
        `;
        return;
    }

    listEl.innerHTML = items.map(item => `
        <div class="lista-compras-item ${item.completado ? 'completado' : ''}" id="compra-item-${item.id}">
            <div class="form-check mb-0">
                <input class="form-check-input" type="checkbox" id="chk-compra-${item.id}"
                    ${item.completado ? 'checked' : ''}
                    onchange="window.toggleItemListaCompras('${item.id}')"
                    title="${item.completado ? 'Marcar como pendiente' : 'Marcar como comprado'}">
            </div>
            <div class="item-texto flex-grow-1">
                <span>${escapeHtml(item.texto || '')}</span>
            </div>
            ${item.cantidad ? `<span class="item-cantidad">${escapeHtml(item.cantidad)}</span>` : ''}
            <div class="d-flex align-items-center gap-1">
                <button class="btn btn-sm btn-outline-secondary py-0 px-2" title="Editar" onclick="window.editarItemListaCompras('${item.id}')">
                    <i class="bi bi-pencil" style="font-size: 0.8rem;"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2" title="Eliminar" onclick="window.eliminarItemListaCompras('${item.id}')">
                    <i class="bi bi-trash3" style="font-size: 0.8rem;"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

window.agregarItemListaCompras = async function(event) {
    if (event) event.preventDefault();
    const inputTexto = document.getElementById('compras-input-texto');
    const inputCant = document.getElementById('compras-input-cantidad');
    if (!inputTexto) return;
    const texto = inputTexto.value.trim();
    const cantidad = inputCant ? inputCant.value.trim() : '';
    if (!texto) return;

    try {
        await addDoc(getUserCollection('dashboardListaCompras'), {
            texto,
            cantidad,
            completado: false,
            creadoEn: new Date()
        });
        inputTexto.value = '';
        if (inputCant) inputCant.value = '';
        inputTexto.focus();
        if (window.showNotification) {
            window.showNotification('Artículo agregado a la lista de compras', 'success', 2200);
        }
    } catch (e) {
        console.error('Error agregando a la lista de compras:', e);
        if (window.showAlert) window.showAlert('Error al agregar el artículo.', 'error');
    }
};

window.toggleItemListaCompras = async function(id) {
    const item = (state.listaComprasData || []).find(i => i.id === id);
    if (!item) return;
    const nuevoEstado = !item.completado;
    item.completado = nuevoEstado;
    renderizarListaComprasDashboard();
    try {
        await updateDoc(doc(getUserCollection('dashboardListaCompras'), id), {
            completado: nuevoEstado,
            actualizadoEn: new Date()
        });
    } catch (e) {
        console.error('Error actualizando item de compra:', e);
        item.completado = !nuevoEstado;
        renderizarListaComprasDashboard();
    }
};

window.editarItemListaCompras = function(id) {
    const item = (state.listaComprasData || []).find(i => i.id === id);
    if (!item) return;
    const nuevoTexto = prompt('Editar artículo:', item.texto);
    if (nuevoTexto === null) return;
    const trimmed = nuevoTexto.trim();
    if (!trimmed) {
        if (window.showAlert) window.showAlert('El nombre no puede estar vacío.', 'warning');
        return;
    }
    const nuevaCant = prompt('Editar cantidad / detalle (opcional):', item.cantidad || '');
    if (nuevaCant === null) return;

    updateDoc(doc(getUserCollection('dashboardListaCompras'), id), {
        texto: trimmed,
        cantidad: nuevaCant.trim(),
        editadoEn: new Date()
    }).then(() => {
        if (window.showNotification) {
            window.showNotification('Artículo actualizado en la lista', 'success', 2000);
        }
    }).catch(err => {
        console.error(err);
        if (window.showAlert) window.showAlert('Error al editar el artículo.', 'error');
    });
};

window.eliminarItemListaCompras = function(id) {
    const item = (state.listaComprasData || []).find(i => i.id === id);
    const nombre = item ? `"${item.texto}"` : 'este artículo';
    window.showConfirm(`¿Eliminar ${nombre} de la lista de compras?`, async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('dashboardListaCompras'), id));
            if (window.showNotification) {
                window.showNotification('Artículo eliminado de la lista', 'info', 2000);
            }
        } catch (e) {
            console.error(e);
            if (window.showAlert) window.showAlert('Error al eliminar el artículo.', 'error');
        }
    });
};

window.limpiarCompradosListaCompras = function() {
    const comprados = (state.listaComprasData || []).filter(i => i.completado);
    if (comprados.length === 0) {
        if (window.showNotification) window.showNotification('No hay artículos comprados para limpiar.', 'info', 2500);
        return;
    }
    window.showConfirm(`¿Eliminar los ${comprados.length} artículos ya comprados?`, async ok => {
        if (!ok) return;
        try {
            for (const item of comprados) {
                await deleteDoc(doc(getUserCollection('dashboardListaCompras'), item.id));
            }
            if (window.showNotification) {
                window.showNotification(`${comprados.length} artículos comprados eliminados.`, 'success', 2500);
            }
        } catch (e) {
            console.error(e);
            if (window.showAlert) window.showAlert('Error al limpiar los artículos.', 'error');
        }
    });
};
