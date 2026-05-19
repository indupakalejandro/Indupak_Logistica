import { state } from './state.js';
import { getUserCollection, getDocs } from './firebase.js';

const CACHE_TTL = 5 * 60 * 1000; // 5 min

function toDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
}

async function obtenerHistorial() {
    const cache = state._historialCache;
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
    const snap = await getDocs(getUserCollection('historial'));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state._historialCache = { data, ts: Date.now() };
    return data;
}

function calcularMetricas(movimientos, stockActual) {
    const now = new Date();
    const hace90 = new Date(now - 90 * 24 * 60 * 60 * 1000);

    const salidas = movimientos
        .filter(m => m.tipo === 'Salida')
        .map(m => ({ cantidad: m.cantidad, fecha: toDate(m.fecha) }))
        .filter(m => m.fecha && m.fecha >= hace90)
        .sort((a, b) => a.fecha - b.fecha);

    const entradas = movimientos
        .filter(m => m.tipo === 'Entrada')
        .map(m => ({ cantidad: m.cantidad, fecha: toDate(m.fecha) }))
        .filter(m => m.fecha)
        .sort((a, b) => a.fecha - b.fecha);

    let consumoDiario = null, diasRestantes = null;
    if (salidas.length > 0) {
        const totalSalidas = salidas.reduce((s, m) => s + m.cantidad, 0);
        const diasSpan = Math.max(1, (now - salidas[0].fecha) / (1000 * 60 * 60 * 24));
        consumoDiario = totalSalidas / diasSpan;
        diasRestantes = consumoDiario > 0 ? Math.round(stockActual / consumoDiario) : null;
    }

    let reposicionesMes = null, cantidadMedia = null;
    if (entradas.length > 0) {
        const diasSpan = Math.max(30, (now - entradas[0].fecha) / (1000 * 60 * 60 * 24));
        reposicionesMes = (entradas.length / diasSpan) * 30;
        cantidadMedia = entradas.reduce((s, m) => s + m.cantidad, 0) / entradas.length;
    }

    const stockEn30dias = consumoDiario !== null
        ? Math.round(stockActual - consumoDiario * 30)
        : null;

    return { consumoDiario, diasRestantes, reposicionesMes, cantidadMedia, stockEn30dias };
}

export async function renderizarTablaAnalisis() {
    const tbody = document.getElementById('tabla-analisis-body');
    const footer = document.getElementById('footer-analisis');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>Analizando historial...
    </td></tr>`;
    if (footer) footer.innerHTML = '';

    try {
        const historial = await obtenerHistorial();

        const byArticulo = {};
        historial.forEach(m => {
            if (!byArticulo[m.idArticulo]) byArticulo[m.idArticulo] = [];
            byArticulo[m.idArticulo].push(m);
        });

        const resultados = state.inventarioData.map(item => {
            const movs = byArticulo[item.id] || [];
            return { item, ...calcularMetricas(movs, item.cantidadActual) };
        });

        const conDatos = resultados
            .filter(r => r.diasRestantes !== null)
            .sort((a, b) => a.diasRestantes - b.diasRestantes);
        const sinDatos = resultados.filter(r => r.diasRestantes === null);
        const sorted = [...conDatos, ...sinDatos];

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay artículos en el inventario.</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(({ item, consumoDiario, diasRestantes, reposicionesMes, cantidadMedia, stockEn30dias }) => {
            const unidad = state.unitsOfMeasureData.find(u => u.id === item.unidadMedida);
            const u = unidad ? unidad.name : '';

            let diasBadge;
            if (diasRestantes === null) {
                diasBadge = '<span class="badge bg-secondary">Sin datos</span>';
            } else if (diasRestantes < 7) {
                diasBadge = `<span class="badge bg-danger">${diasRestantes}d</span>`;
            } else if (diasRestantes < 15) {
                diasBadge = `<span class="badge bg-warning text-dark">${diasRestantes}d</span>`;
            } else if (diasRestantes < 30) {
                diasBadge = `<span class="badge" style="background:#fd7e14;color:#fff">${diasRestantes}d</span>`;
            } else {
                diasBadge = `<span class="badge bg-success">${diasRestantes}d</span>`;
            }

            let proyBadge;
            if (stockEn30dias === null) {
                proyBadge = '—';
            } else if (stockEn30dias <= 0) {
                proyBadge = `<span class="badge bg-danger">Agotado</span>`;
            } else if (stockEn30dias < item.stockMinimo) {
                proyBadge = `<span class="badge bg-warning text-dark">~${stockEn30dias} ${u}</span>`;
            } else {
                proyBadge = `<span class="badge bg-success">~${stockEn30dias} ${u}</span>`;
            }

            return `<tr>
                <td><strong>${item.nombre}</strong><br><small class="text-muted">${item.descripcion || ''}</small></td>
                <td class="text-end text-nowrap">${consumoDiario !== null ? consumoDiario.toFixed(1) + ' ' + u + '/día' : '—'}</td>
                <td class="text-center">${diasBadge}</td>
                <td class="text-end text-nowrap">${reposicionesMes !== null
                    ? `${reposicionesMes.toFixed(1)}/mes &middot; ${Math.round(cantidadMedia)} ${u}/vez`
                    : '—'}</td>
                <td class="text-center">${proyBadge}</td>
            </tr>`;
        }).join('');

        if (footer) {
            const criticos = conDatos.filter(r => r.diasRestantes < 7).length;
            const urgentes = conDatos.filter(r => r.diasRestantes >= 7 && r.diasRestantes < 15).length;
            const partes = [`${conDatos.length} artículo(s) con historial`];
            if (criticos > 0) partes.push(`<span class="text-danger fw-bold">${criticos} crítico(s)</span>`);
            if (urgentes > 0) partes.push(`<span style="color:#fd7e14" class="fw-bold">${urgentes} urgente(s)</span>`);
            footer.innerHTML = partes.join(' · ');
        }
    } catch (e) {
        console.error('Error en análisis:', e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar el análisis.</td></tr>';
    }
}

window.refrescarAnalisis = function() {
    state._historialCache = null;
    renderizarTablaAnalisis();
};
