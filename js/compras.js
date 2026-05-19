import { state } from './state.js';

/**
 * Renders the purchases panel with low stock items, grouped by supplier.
 */
export function renderizarPanelCompras() {
    const tbody = state.elements.comprasTableBody;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    tbody.innerHTML = '';

    const articulosConStockBajo = state.inventarioData.filter(item => {
        const proveedor = state.proveedoresData.find(p => p.id === item.idProveedor);
        const proveedorNombre = proveedor ? proveedor.nombre.toLowerCase() : '';

        const matchesSearch = (
            (state.currentSearchFilter === 'nombreArticulo' && item.nombre.toLowerCase().includes(terminoBusqueda)) ||
            (state.currentSearchFilter === 'proveedorArticulo' && proveedorNombre.includes(terminoBusqueda)) ||
            (terminoBusqueda === '')
        );

        return item.cantidadActual < item.stockMinimo && matchesSearch;
    }).map(item => {
        const cantidadNecesaria = (item.stockMinimo - item.cantidadActual) + 1;
        return { ...item, cantidadNecesaria };
    });

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

    if (articulosConStockBajo.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay artículos con stock bajo que requieran compra.</td></tr>';
    } else {
        sortedProviderNames.forEach(proveedorNombre => {
            tbody.innerHTML += `
                <tr class="table-active">
                    <td colspan="5" class="fw-bold text-start py-2" style="background-color: var(--table-header-bg); border-bottom: 1px solid var(--input-border);">
                        <i class="bi bi-shop me-2"></i> ${proveedorNombre}
                    </td>
                </tr>
            `;
            groupedByProvider[proveedorNombre].forEach(item => {
                const unidadMedida = state.unitsOfMeasureData.find(u => u.id === item.unidadMedida);
                tbody.innerHTML += `
                    <tr class="${item.cantidadActual <= item.stockMinimo ? 'table-danger' : ''}">
                        <td><strong>${item.nombre}</strong><br><small class="text-muted">${item.descripcion || ''}</small></td>
                        <td class="text-end">${Math.round(item.cantidadActual)}</td>
                        <td class="text-end">${Math.round(item.stockMinimo)}</td>
                        <td class="text-end">${Math.round(item.cantidadNecesaria)}</td>
                        <td>${unidadMedida ? unidadMedida.name : 'N/A'}</td>
                    </tr>`;
            });
        });
    }
    if (state.elements.footerCompras) {
        state.elements.footerCompras.innerText = `${articulosConStockBajo.length} artículo(s) con stock bajo.`;
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
            const cantidadNecesaria = (item.stockMinimo - item.cantidadActual) + 1;

            tableDataForProvider.push([
                item.nombre,
                Math.round(item.cantidadActual),
                Math.round(item.stockMinimo),
                Math.round(cantidadNecesaria),
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
