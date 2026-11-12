import { state } from './state.js';
import { getUserCollection, getDocs } from './firebase.js';
import { parseCantidad, formatCantidad } from './ui.js';

const CACHE_TTL = 5 * 60 * 1000; // 5 min
const DIA_MS = 24 * 60 * 60 * 1000;
const COLUMNAS = 6;

// Se usa la primera ventana con suficientes retiros; así un artículo de poco movimiento también tiene estimación.
const VENTANAS_DIAS = [90, 180, 365];
const MIN_SALIDAS = 3;
// Un artículo recién creado no puede promediar sobre menos de esta cantidad de días.
const MIN_DIAS_HISTORIA = 7;
// Una salida y una entrada de igual cantidad dentro de este lapso son un error corregido, no consumo.
const VENTANA_CORRECCION_MS = 15 * 60 * 1000;
// Antes de esta fecha el stock no se ajustaba con regularidad: esos movimientos no reflejan el consumo real.
const INICIO_DATOS_CONFIABLES = new Date(2026, 5, 1); // 1 de junio de 2026

let ultimoRender = 0;
let historialEnCurso = null;

function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

function toDate(val) {
    if (!val) return null;
    const fecha = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
    return isNaN(fecha.getTime()) ? null : fecha;
}

// Varias vistas pueden pedir el historial a la vez: comparten una sola lectura.
async function obtenerHistorial() {
    const cache = state._historialCache;
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
    if (historialEnCurso) return historialEnCurso;

    historialEnCurso = Promise.all([
        getDocs(getUserCollection('historial')),
        getDocs(getUserCollection('controlHistorial')).catch(e => { console.error('No se pudo leer el historial de controles:', e); return { docs: [] }; })
    ])
        .then(([snapHistorial, snapControles]) => {
            const data = [
                ...snapHistorial.docs.map(d => ({ id: d.id, ...d.data() })),
                ...movimientosDeControles(snapControles.docs.map(d => d.data()))
            ];
            state._historialCache = { data, ts: Date.now() };
            return data;
        })
        .finally(() => { historialEnCurso = null; });
    return historialEnCurso;
}

/**
 * Los controles de stock viejos actualizaban la cantidad sin dejar movimiento en el historial.
 * Cada artículo contado guarda cuánto había en el sistema y cuánto se contó: esa diferencia es el
 * consumo (o la reposición) desde el control anterior. Los controles nuevos ya anotan el movimiento,
 * así que se saltean para no contarlos dos veces.
 */
function movimientosDeControles(controles) {
    const movimientos = [];
    controles.forEach(control => {
        if (control.movimientosRegistrados || !Array.isArray(control.items)) return;
        control.items.forEach(it => {
            if (it.tipo !== 'articulo' || !it.articuloId) return;
            const anterior = Number(it.cantidadAnterior);
            const nuevo = Number(it.cantidadContada);
            if (it.cantidadAnterior === null || it.cantidadContada === null || isNaN(anterior) || isNaN(nuevo) || anterior === nuevo) return;
            movimientos.push({
                idArticulo: it.articuloId,
                fecha: control.fecha,
                tipo: nuevo < anterior ? 'Salida' : 'Entrada',
                cantidad: Math.abs(nuevo - anterior),
                stockAnterior: anterior,
                stockNuevo: nuevo,
                origen: 'control'
            });
        });
    });
    return movimientos;
}

// La variación real de stock manda sobre la cantidad escrita: si se retiró más de lo que había, el stock solo bajó hasta 0.
function normalizarMovimientos(movimientos) {
    return movimientos
        .map(m => {
            const anterior = Number(m.stockAnterior);
            const nuevo = Number(m.stockNuevo);
            const conStock = m.stockAnterior !== undefined && m.stockNuevo !== undefined && !isNaN(anterior) && !isNaN(nuevo);
            return {
                tipo: m.tipo,
                fecha: toDate(m.fecha),
                cantidad: conStock ? Math.abs(nuevo - anterior) : parseCantidad(m.cantidad)
            };
        })
        .filter(m => m.fecha && m.fecha >= INICIO_DATOS_CONFIABLES && m.cantidad > 0)
        .sort((a, b) => a.fecha - b.fecha);
}

function quitarCorrecciones(movimientos) {
    const anulados = new Set();
    const esAjuste = tipo => tipo === 'Salida' || tipo === 'Entrada';

    movimientos.forEach((mov, i) => {
        if (anulados.has(i) || !esAjuste(mov.tipo)) return;
        for (let j = i + 1; j < movimientos.length; j++) {
            const otro = movimientos[j];
            if (otro.fecha - mov.fecha > VENTANA_CORRECCION_MS) break;
            const opuesto = esAjuste(otro.tipo) && otro.tipo !== mov.tipo;
            if (opuesto && !anulados.has(j) && Math.abs(otro.cantidad - mov.cantidad) < 0.0001) {
                anulados.add(i);
                anulados.add(j);
                break;
            }
        }
    });

    return movimientos.filter((_, i) => !anulados.has(i));
}

function calcularMetricas(movimientos, stockActual, stockMinimo) {
    const ahora = Date.now();
    const validos = quitarCorrecciones(normalizarMovimientos(movimientos));
    const diasHistoria = validos.length ? (ahora - validos[0].fecha) / DIA_MS : 0;
    const enVentana = (lista, dias) => lista.filter(m => ahora - m.fecha <= dias * DIA_MS);
    const baseDias = dias => Math.max(MIN_DIAS_HISTORIA, Math.min(dias, diasHistoria));
    const sumar = lista => lista.reduce((total, m) => total + m.cantidad, 0);

    const salidas = validos.filter(m => m.tipo === 'Salida');
    const ventana = VENTANAS_DIAS.find(dias => enVentana(salidas, dias).length >= MIN_SALIDAS) || null;

    const resultado = {
        estado: ventana ? 'con_datos' : salidas.length ? 'pocos_datos' : 'sin_consumo',
        ventana,
        consumoDiario: null,
        diasRestantes: null,
        diasAlMinimo: null,
        stockEn30dias: null,
        reposicionesMes: null,
        cantidadMedia: null
    };

    if (ventana) {
        const consumo = sumar(enVentana(salidas, ventana)) / baseDias(ventana);
        resultado.consumoDiario = consumo;
        resultado.diasRestantes = Math.floor(Math.max(0, stockActual) / consumo);
        resultado.stockEn30dias = stockActual - consumo * 30;
        if (stockMinimo > 0) {
            resultado.diasAlMinimo = stockActual <= stockMinimo ? 0 : Math.floor((stockActual - stockMinimo) / consumo);
        }
    }

    const ventanaEntradas = ventana || VENTANAS_DIAS[0];
    const entradas = enVentana(validos.filter(m => m.tipo === 'Entrada'), ventanaEntradas);
    if (entradas.length > 0) {
        resultado.reposicionesMes = (entradas.length / baseDias(ventanaEntradas)) * 30;
        resultado.cantidadMedia = sumar(entradas) / entradas.length;
    }

    return resultado;
}

const formatearValor = valor => formatCantidad(valor, valor < 1 ? 2 : 1);

function badgeDias({ stock, estado, diasRestantes }) {
    if (stock <= 0) return '<span class="badge bg-danger">Agotado</span>';
    if (estado === 'pocos_datos') return '<span class="badge bg-secondary">Pocos datos</span>';
    if (estado === 'sin_consumo') return '<span class="badge bg-secondary">Sin consumo</span>';
    if (diasRestantes < 7) return `<span class="badge bg-danger">${diasRestantes}d</span>`;
    if (diasRestantes < 15) return `<span class="badge bg-warning text-dark">${diasRestantes}d</span>`;
    if (diasRestantes < 30) return `<span class="badge" style="background:#fd7e14;color:#fff">${diasRestantes}d</span>`;
    return `<span class="badge bg-success">${diasRestantes}d</span>`;
}

function textoConsumo({ consumoDiario, ventana }, unidad) {
    if (consumoDiario === null) return '—';
    const valor = consumoDiario < 0.01 ? '&lt;0.01' : formatearValor(consumoDiario);
    const nota = ventana > VENTANAS_DIAS[0] ? `<br><small class="text-muted">últimos ${ventana} días</small>` : '';
    return `${valor} ${unidad}/día${nota}`;
}

function badgeAlMinimo({ diasAlMinimo }) {
    if (diasAlMinimo === null) return '—';
    if (diasAlMinimo === 0) return '<span class="badge bg-warning text-dark">Bajo mínimo</span>';
    return `en ${diasAlMinimo}d`;
}

function badgeProyeccion({ stockEn30dias, stockMinimo }, unidad) {
    if (stockEn30dias === null) return '—';
    if (stockEn30dias <= 0) return '<span class="badge bg-danger">Agotado</span>';
    const texto = `~${formatearValor(stockEn30dias)} ${unidad}`;
    return stockEn30dias < stockMinimo
        ? `<span class="badge bg-warning text-dark">${texto}</span>`
        : `<span class="badge bg-success">${texto}</span>`;
}

function ordenUrgencia(a, b) {
    const grupo = r => (r.stock <= 0 ? 0 : r.diasRestantes !== null ? 1 : r.estado === 'pocos_datos' ? 2 : 3);
    return grupo(a) - grupo(b) || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0);
}

function metricasDeInventario(historial) {
    const porArticulo = new Map();
    historial.forEach(m => {
        if (!porArticulo.has(m.idArticulo)) porArticulo.set(m.idArticulo, []);
        porArticulo.get(m.idArticulo).push(m);
    });

    return state.inventarioData.map(item => {
        const stock = parseCantidad(item.cantidadActual);
        const stockMinimo = parseCantidad(item.stockMinimo);
        return { item, stock, stockMinimo, ...calcularMetricas(porArticulo.get(item.id) || [], stock, stockMinimo) };
    });
}

const nombreUnidad = item => state.unitsOfMeasureData.find(u => u.id === item.unidadMedida)?.name || '';

// Artículos que llegan a su mínimo (o se agotan, si no tienen mínimo) dentro del plazo, con lo necesario para cubrirlo.
export async function obtenerPrevisionCompras(dias) {
    const metricas = metricasDeInventario(await obtenerHistorial());
    const articulos = metricas
        .filter(r => r.consumoDiario !== null && r.stock > 0)
        .map(r => ({
            nombre: r.item.nombre,
            unidad: nombreUnidad(r.item),
            diasRestantes: r.diasRestantes,
            stock: r.stock,
            bajoMinimo: r.diasAlMinimo === 0,
            diasHastaCompra: r.diasAlMinimo ?? r.diasRestantes,
            cantidad: Math.ceil(r.consumoDiario * dias + r.stockMinimo - r.stock)
        }))
        .filter(r => r.diasHastaCompra <= dias && r.cantidad > 0)
        .sort((a, b) => a.diasRestantes - b.diasRestantes);

    return { articulos, sinDatos: metricas.filter(r => r.consumoDiario === null).length };
}

// Días que le quedan a cada artículo hasta llegar a 0, según su consumo. Clave: id del artículo.
export async function obtenerDiasRestantes() {
    const metricas = metricasDeInventario(await obtenerHistorial());
    return new Map(metricas.map(r => [r.item.id, { diasRestantes: r.stock <= 0 ? 0 : r.diasRestantes, estado: r.estado, consumoDiario: r.consumoDiario }]));
}

// Para pintar sin esperar: devuelve el cálculo si el historial ya está en memoria, o null.
export function diasRestantesEnCache() {
    const cache = state._historialCache;
    if (!cache || Date.now() - cache.ts >= CACHE_TTL) return null;
    const metricas = metricasDeInventario(cache.data);
    return new Map(metricas.map(r => [r.item.id, { diasRestantes: r.stock <= 0 ? 0 : r.diasRestantes, estado: r.estado, consumoDiario: r.consumoDiario }]));
}

// Mismo criterio de colores que el análisis.
export function badgeDiasRestantes(dato, stock) {
    if (stock <= 0) return '<span class="badge bg-danger">Agotado</span>';
    if (!dato) return '<span class="text-muted">…</span>';
    return badgeDias({ stock, estado: dato.estado, diasRestantes: dato.diasRestantes });
}

function resumenPie(resultados) {
    const conProyeccion = resultados.filter(r => r.diasRestantes !== null);
    const contar = condicion => resultados.filter(condicion).length;
    const agotados = contar(r => r.stock <= 0);
    const criticos = contar(r => r.stock > 0 && r.diasRestantes !== null && r.diasRestantes < 7);
    const urgentes = contar(r => r.stock > 0 && r.diasRestantes !== null && r.diasRestantes >= 7 && r.diasRestantes < 15);
    const pocosDatos = contar(r => r.estado === 'pocos_datos');

    const partes = [`${conProyeccion.length} artículo(s) con proyección`];
    if (agotados > 0) partes.push(`<span class="text-danger fw-bold">${agotados} agotado(s)</span>`);
    if (criticos > 0) partes.push(`<span class="text-danger fw-bold">${criticos} crítico(s)</span>`);
    if (urgentes > 0) partes.push(`<span style="color:#fd7e14" class="fw-bold">${urgentes} urgente(s)</span>`);
    if (pocosDatos > 0) partes.push(`${pocosDatos} con pocos datos`);
    partes.push('<small class="text-muted">Calculado con movimientos desde el 01/06/2026</small>');
    return partes.join(' · ');
}

export async function renderizarTablaAnalisis() {
    const tbody = document.getElementById('tabla-analisis-body');
    const footer = document.getElementById('footer-analisis');
    if (!tbody) return;

    const render = ++ultimoRender;
    const cache = state._historialCache;
    if (!cache || Date.now() - cache.ts >= CACHE_TTL) {
        tbody.innerHTML = `<tr><td colspan="${COLUMNAS}" class="text-center text-muted py-4">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>Analizando historial...
        </td></tr>`;
        if (footer) footer.innerHTML = '';
    }

    try {
        const historial = await obtenerHistorial();
        if (render !== ultimoRender) return;

        const termino = (state.elements.buscador?.value || '').toLowerCase();
        const resultados = metricasDeInventario(historial)
            .filter(({ item }) => !termino || `${item.nombre || ''} ${item.descripcion || ''}`.toLowerCase().includes(termino))
            .sort(ordenUrgencia);

        if (resultados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${COLUMNAS}" class="text-center text-muted">${termino ? 'Ningún artículo coincide con la búsqueda.' : 'No hay artículos en el inventario.'}</td></tr>`;
            if (footer) footer.innerHTML = '';
            return;
        }

        tbody.innerHTML = resultados.map(r => {
            const unidad = escapeHtml(nombreUnidad(r.item));
            return `<tr>
                <td><strong>${escapeHtml(r.item.nombre)}</strong><br><small class="text-muted">${escapeHtml(r.item.descripcion)}</small></td>
                <td class="text-end text-nowrap">${textoConsumo(r, unidad)}</td>
                <td class="text-center">${badgeDias(r)}</td>
                <td class="text-center text-nowrap">${badgeAlMinimo(r)}</td>
                <td class="text-end text-nowrap">${r.reposicionesMes !== null
                    ? `${formatearValor(r.reposicionesMes)}/mes &middot; ${formatearValor(r.cantidadMedia)} ${unidad}/vez`
                    : '—'}</td>
                <td class="text-center">${badgeProyeccion(r, unidad)}</td>
            </tr>`;
        }).join('');

        if (footer) footer.innerHTML = resumenPie(resultados);
    } catch (e) {
        console.error('Error en análisis:', e);
        if (render === ultimoRender) {
            tbody.innerHTML = `<tr><td colspan="${COLUMNAS}" class="text-center text-danger">Error al cargar el análisis.</td></tr>`;
        }
    }
}

window.refrescarAnalisis = function() {
    state._historialCache = null;
    renderizarTablaAnalisis();
};
