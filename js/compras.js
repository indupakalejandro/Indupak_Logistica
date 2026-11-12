import { state } from './state.js';
import { formatCantidad, parseCantidad } from './ui.js';
import { obtenerDiasRestantes, diasRestantesEnCache, badgeDiasRestantes } from './analisis.js';

const SIN_PROVEEDOR = 'Sin Proveedor Asignado';
// Sin orden elegido, la lista va agrupada por proveedor. Al tocar un título se desarma la agrupación
// y toda la lista se ordena por esa columna; "Agrupar por proveedor" vuelve a la vista inicial.
let ordenCompras = null;
const TITULOS_ORDEN = { nombre: 'Artículo', stock: 'Stock actual', minimo: 'Stock mínimo', comprar: 'Cantidad a comprar', unidad: 'Unidad', dias: 'Días restantes' };
let diasRestantes = null;
let calculandoDias = false;

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function cantidadAComprar(item) {
    const diff = Math.max(0, item.stockMinimo - item.cantidadActual);
    const margen = (item.stockMinimo % 1 === 0 && item.stockMinimo >= 1) ? 1 : 0;
    return Number((diff + margen).toFixed(3));
}

const nombreProveedor = item => state.proveedoresData.find(p => p.id === item.idProveedor)?.nombre || SIN_PROVEEDOR;
const nombreUnidad = item => state.unitsOfMeasureData.find(u => u.id === item.unidadMedida)?.name || 'N/A';

/**
 * Artículos bajo el mínimo, con lo que hay que comprar y los días que les quedan. Lo usan esta tabla y el inicio.
 */
export function articulosPorComprar() {
    return state.inventarioData
        .filter(item => item.cantidadActual < item.stockMinimo)
        .map(item => ({
            ...item,
            proveedorNombre: nombreProveedor(item),
            unidadNombre: nombreUnidad(item),
            cantidadNecesaria: cantidadAComprar(item),
            dias: diasRestantes?.get(item.id) || null
        }));
}

// Los días salen del historial de movimientos; si todavía no está en memoria, se calcula y se vuelve a pintar.
export function asegurarDiasRestantes(alTerminar) {
    const enCache = diasRestantesEnCache();
    if (enCache) {
        diasRestantes = enCache;
        return true;
    }
    if (!calculandoDias) {
        calculandoDias = true;
        obtenerDiasRestantes()
            .then(mapa => { diasRestantes = mapa; alTerminar?.(); })
            .catch(e => console.error('No se pudieron calcular los días restantes:', e))
            .finally(() => { calculandoDias = false; });
    }
    return false;
}

const VALOR_ORDEN = {
    nombre: a => String(a.nombre || '').toLowerCase(),
    stock: a => parseCantidad(a.cantidadActual),
    minimo: a => parseCantidad(a.stockMinimo),
    comprar: a => a.cantidadNecesaria,
    unidad: a => a.unidadNombre.toLowerCase(),
    // Sin estimación va al final; agotado (0) va primero.
    dias: a => (a.cantidadActual <= 0 ? 0 : a.dias?.diasRestantes ?? Number.POSITIVE_INFINITY)
};

function compararArticulos(a, b) {
    const orden = ordenCompras || { columna: 'nombre', asc: true };
    const valor = VALOR_ORDEN[orden.columna] || VALOR_ORDEN.nombre;
    const va = valor(a);
    const vb = valor(b);
    // Infinity - Infinity da NaN: dos artículos sin estimación quedan empatados.
    const resultado = typeof va === 'string' ? va.localeCompare(vb, 'es', { numeric: true }) : (va === vb ? 0 : va - vb);
    return (orden.asc ? resultado : -resultado) || String(a.nombre).localeCompare(String(b.nombre), 'es');
}

window.ordenarCompras = function(columna) {
    ordenCompras = ordenCompras?.columna === columna
        ? { columna, asc: !ordenCompras.asc }
        : { columna, asc: true };
    renderizarPanelCompras();
};

window.agruparComprasPorProveedor = function() {
    ordenCompras = null;
    renderizarPanelCompras();
};

function marcarEncabezadosOrden() {
    document.querySelectorAll('#comprasTable thead th[data-orden]').forEach(th => {
        const activa = th.dataset.orden === ordenCompras?.columna;
        th.classList.toggle('sort-asc', activa && ordenCompras.asc);
        th.classList.toggle('sort-desc', activa && !ordenCompras.asc);
        th.setAttribute('aria-sort', activa ? (ordenCompras.asc ? 'ascending' : 'descending') : 'none');
    });
}

function filaArticulo(item, conProveedor) {
    return `
        <tr class="${item.cantidadActual <= item.stockMinimo ? 'table-danger' : ''}">
            <td><strong>${escapeHtml(item.nombre)}</strong>${conProveedor ? `<br><small class="text-muted"><i class="bi bi-shop me-1"></i>${escapeHtml(item.proveedorNombre)}</small>` : item.descripcion ? `<br><small class="text-muted">${escapeHtml(item.descripcion)}</small>` : ''}</td>
            <td class="text-end">${formatCantidad(item.cantidadActual)}</td>
            <td class="text-end">${formatCantidad(item.stockMinimo)}</td>
            <td class="text-end">${formatCantidad(item.cantidadNecesaria)}</td>
            <td>${escapeHtml(item.unidadNombre)}</td>
            <td class="text-end">${badgeDiasRestantes(item.dias, parseCantidad(item.cantidadActual))}</td>
        </tr>`;
}

/**
 * Renders the purchases panel with low stock items, grouped by supplier.
 */
export function renderizarPanelCompras() {
    const tbody = state.elements.comprasTableBody;
    if (!tbody) return;
    asegurarDiasRestantes(() => {
        if (state.currentActivePanel === 'insumos' && state.activeInsumosTab === 'compras') renderizarPanelCompras();
    });

    const termino = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    const articulos = articulosPorComprar().filter(item => !termino || (state.currentSearchFilter === 'proveedorArticulo'
        ? item.proveedorNombre.toLowerCase().includes(termino)
        : String(item.nombre || '').toLowerCase().includes(termino)));

    const grupos = new Map();
    articulos.forEach(item => {
        if (!grupos.has(item.proveedorNombre)) grupos.set(item.proveedorNombre, []);
        grupos.get(item.proveedorNombre).push(item);
    });
    const proveedores = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es'));

    marcarEncabezadosOrden();
    if (articulos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay artículos con stock bajo que requieran compra.</td></tr>';
    } else if (ordenCompras) {
        // Ordenado por una columna: una sola lista, con el proveedor debajo de cada artículo.
        tbody.innerHTML = `
            <tr class="compras-fila-orden">
                <td colspan="6" class="small py-2">
                    <i class="bi bi-sort-${ordenCompras.asc ? 'down' : 'up'} me-1"></i>Ordenado por <strong>${TITULOS_ORDEN[ordenCompras.columna]}</strong>
                    <button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline" onclick="agruparComprasPorProveedor()"><i class="bi bi-shop me-1"></i>Volver a agrupar por proveedor</button>
                </td>
            </tr>
            ${[...articulos].sort(compararArticulos).map(item => filaArticulo(item, true)).join('')}`;
    } else {
        tbody.innerHTML = proveedores.map(proveedor => `
            <tr class="table-active compras-fila-proveedor">
                <td colspan="6" class="fw-bold text-start py-2" style="background-color: var(--table-header-bg); border-bottom: 1px solid var(--input-border);">
                    <i class="bi bi-shop me-2"></i> ${escapeHtml(proveedor)}
                </td>
            </tr>
            ${grupos.get(proveedor).sort(compararArticulos).map(item => filaArticulo(item, false)).join('')}`).join('');
    }
    if (state.elements.footerCompras) {
        state.elements.footerCompras.innerText = `${articulos.length} artículo(s) con stock bajo. Días restantes según el consumo desde el 01/06/2026.`;
    }
}
window.renderizarPanelCompras = renderizarPanelCompras;

/**
 * Generates a PDF with a list of low-stock items, grouped by supplier.
 */
window.generarPdfCompras = async function() {
    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();

    pdfDoc.setFontSize(18);
    pdfDoc.text("Lista de Compras - Artículos con Stock Bajo", 14, 22);

    const articulosConStockBajo = state.inventarioData.filter(item => item.cantidadActual <= item.stockMinimo);

    if (articulosConStockBajo.length === 0) {
        window.showAlert("No hay artículos con stock bajo para generar el PDF.");
        return;
    }

    const groupedByProvider = articulosConStockBajo.reduce((acc, item) => {
        const proveedor = state.proveedoresData.find(p => p.id === item.idProveedor);
        const proveedorNombre = proveedor ? proveedor.nombre : 'Sin Proveedor Asignado';
        if (!acc[proveedorNombre]) {
            acc[proveedorNombre] = [];
        }
        acc[proveedorNombre].push(item);
        return acc;
    }, {});

    const sortedProviderNames = Object.keys(groupedByProvider).sort();

    let yOffset = 30;

    sortedProviderNames.forEach(proveedorNombre => {
        pdfDoc.setFontSize(12);
        pdfDoc.setTextColor(112, 0, 224);
        pdfDoc.text(`Proveedor: ${proveedorNombre}`, 14, yOffset);
        yOffset += 10;

        const tableDataForProvider = [];
        groupedByProvider[proveedorNombre].forEach(item => {
            const unidadMedida = state.unitsOfMeasureData.find(u => u.id === item.unidadMedida);
            const diff = Math.max(0, item.stockMinimo - item.cantidadActual);
            const margen = (item.stockMinimo % 1 === 0 && item.stockMinimo >= 1) ? 1 : 0;
            const cantidadNecesaria = Number((diff + margen).toFixed(3));

            tableDataForProvider.push([
                item.nombre,
                formatCantidad(item.cantidadActual),
                formatCantidad(item.stockMinimo),
                formatCantidad(cantidadNecesaria),
                unidadMedida ? unidadMedida.name : 'N/A'
            ]);
        });

        pdfDoc.autoTable({
            startY: yOffset,
            head: [['Artículo', 'Stock Actual', 'Stock Mínimo', 'Cantidad a Comprar', 'Unidad']],
            body: tableDataForProvider,
            theme: 'striped',
            styles: {
                fontSize: 10,
                cellPadding: 3,
                valign: 'middle'
            },
            headStyles: {
                fillColor: [112, 0, 224],
                textColor: 255,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { cellWidth: 30, halign: 'right' },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 30, halign: 'right' },
                4: { cellWidth: 25 }
            },
            didDrawPage: function (data) {
                let str = "Página " + pdfDoc.internal.getNumberOfPages();
                pdfDoc.setFontSize(10);
                pdfDoc.text(str, data.settings.margin.left, pdfDoc.internal.pageSize.height - 10);
            },
            didParseCell: function (data) {
                pdfDoc.setTextColor(0);
            }
        });
        yOffset = pdfDoc.autoTable.previous.finalY + 10;
    });

    pdfDoc.save("lista_compras_stock_bajo.pdf");
    window.showAlert("PDF de compras generado exitosamente.");
};
