import { state } from './state.js';
import { getUserCollection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where } from './firebase.js';

/**
 * Renders the inventory table based on current state.inventarioData and search filter.
 */
export function renderizarTablaInventario() {
    const tbody = state.elements.inventarioTableBody;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    tbody.innerHTML = '';

    const inventarioFiltrado = state.inventarioData.filter(item => {
        const searchTerm = terminoBusqueda;
        if (state.currentSearchFilter === 'nombre') {
            return item.nombre.toLowerCase().includes(searchTerm);
        } else if (state.currentSearchFilter === 'categoria') {
            const categoryName = state.categoriesData.find(c => c.id === item.categoria)?.name || '';
            return categoryName.toLowerCase().includes(searchTerm);
        } else if (state.currentSearchFilter === 'descripcion') {
            return (item.descripcion && item.descripcion.toLowerCase().includes(searchTerm));
        }
        return true;
    });

    if (inventarioFiltrado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron artículos.</td></tr>';
    } else {
        inventarioFiltrado.forEach(item => {
            const proveedor = state.proveedoresData.find(p => p.id === item.idProveedor);
            const categoria = state.categoriesData.find(c => c.id === item.categoria);
            const esStockBajo = item.cantidadActual < item.stockMinimo;
            tbody.innerHTML += `
                <tr class="${esStockBajo ? 'table-danger' : ''}">
                    <td><strong>${item.nombre}</strong><br><small class="text-muted">${item.descripcion || ''}</small></td>
                    <td>${categoria ? categoria.name : 'N/A'}</td>
                    <td class="text-end">${Math.round(item.cantidadActual)}</td>
                    <td class="text-end">${Math.round(item.stockMinimo)}</td>
                    <td
                        class="text-start"
                        onmouseenter="handleProviderMouseEnter(event, '${item.idProveedor}')"
                        onmouseleave="handleProviderMouseLeave()"
                    >
                        ${proveedor ? proveedor.nombre : 'N/A'}
                    </td>
                    <td class="text-center">
                        <div class="input-group input-group-sm">
                            <button class="btn btn-danger btn-adjust-stock" onclick="ajustarStockDirecto('${item.id}', -1)"><i class="bi bi-dash-circle"></i></button>
                            <input type="number" class="form-control stock-adjust-input" id="adjust-${item.id}" value="1" min="0">
                            <button class="btn btn-success btn-adjust-stock" onclick="ajustarStockDirecto('${item.id}', 1)"><i class="bi bi-plus-circle"></i></button>
                        </div>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-info" onclick="verHistorial('${item.id}')" title="Ver Historial"><i class="bi bi-clock-history"></i></button>
                        <button class="btn btn-sm btn-warning" onclick="prepararModalParaEditar('${item.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="confirmarEliminacion('${item.id}')" title="Eliminar"><i class="bi bi-trash-fill"></i></button>
                    </td>
                </tr>`;
        });
    }
    if (state.elements.footerTabla) {
        state.elements.footerTabla.innerText = `${inventarioFiltrado.length} artículo(s) encontrado(s).`;
    }
}

/**
 * Adjusts the quantity of an article directly from the table.
 */
window.ajustarStockDirecto = async function(id, direction) {
    const inputElement = document.getElementById(`adjust-${id}`);
    if (!inputElement) {
        window.showAlert("Error: No se encontró el campo de ajuste de cantidad.");
        return;
    }

    const cantidadAjuste = parseInt(inputElement.value);
    if (isNaN(cantidadAjuste) || cantidadAjuste <= 0) {
        window.showAlert("Por favor, ingrese una cantidad válida para ajustar.");
        return;
    }

    const delta = direction * cantidadAjuste;
    const tipoMovimiento = direction === 1 ? 'Entrada' : 'Salida';
    const responsable = state.auth.currentUser ? state.auth.currentUser.email || state.auth.currentUser.uid : 'Anónimo';

    const articulo = state.inventarioData.find(item => item.id === id);
    if (!articulo) {
        window.showAlert("Artículo no encontrado.");
        return;
    }

    const stockAnterior = articulo.cantidadActual;
    let nuevoStock = stockAnterior + delta;

    if (nuevoStock < 0) {
        window.showAlert("La cantidad no puede ser negativa. Stock actual: " + Math.round(stockAnterior));
        nuevoStock = 0;
    }

    try {
        await updateDoc(doc(getUserCollection('inventario'), id), { cantidadActual: nuevoStock });
        await registrarMovimiento(id, tipoMovimiento, Math.abs(delta), stockAnterior, nuevoStock, responsable, `Ajuste directo desde tabla`);
    } catch (e) {
        console.error("Error al ajustar cantidad: ", e);
        window.showAlert("Error al ajustar la cantidad. Intente de nuevo.");
    }
}

/**
 * Prepares the article modal for adding a new article.
 */
window.prepararModalParaNuevo = function() {
    if (state.elements.formularioArticulo) state.elements.formularioArticulo.reset();
    if (state.elements.idArticuloInput) state.elements.idArticuloInput.value = '';
    if (state.elements.modalArticuloLabel) state.elements.modalArticuloLabel.innerText = '➕ Agregar Nuevo Artículo';
    actualizarDropdownProveedores();
    actualizarDropdownCategorias();
    actualizarDropdownUnidadesMedida();

    if (state.elements.cantidadActualInputGroup) state.elements.cantidadActualInputGroup.style.display = 'flex';
}

/**
 * Prepares the article modal for editing an existing article.
 */
window.prepararModalParaEditar = function(id) {
    const articulo = state.inventarioData.find(item => item.id === id);
    if (!articulo) {
        window.showAlert("Artículo no encontrado para editar.");
        return;
    }

    if (state.elements.cantidadActualInputGroup) state.elements.cantidadActualInputGroup.style.display = 'none';

    actualizarDropdownProveedores(articulo.idProveedor);
    actualizarDropdownCategorias(articulo.categoria);
    actualizarDropdownUnidadesMedida(articulo.unidadMedida);

    if (state.elements.idArticuloInput) state.elements.idArticuloInput.value = articulo.id;
    if (state.elements.nombreArticuloInput) state.elements.nombreArticuloInput.value = articulo.nombre;
    if (state.elements.descripcionInput) state.elements.descripcionInput.value = articulo.descripcion || '';
    if (state.elements.stockMinimoInput) state.elements.stockMinimoInput.value = Math.round(articulo.stockMinimo);
    if (state.elements.modalArticuloLabel) state.elements.modalArticuloLabel.innerText = '✏️ Modificar Artículo';

    if (state.elements.modalArticulo) state.elements.modalArticulo.dataset.editingArticleId = id;

    new bootstrap.Modal(state.elements.modalArticulo).show();
}

/**
 * Saves a new article or updates an existing one in Firestore.
 */
window.guardarArticulo = async function() {
    const id = state.elements.idArticuloInput ? state.elements.idArticuloInput.value : '';
    const nombre = state.elements.nombreArticuloInput ? state.elements.nombreArticuloInput.value.trim() : '';
    const categoria = state.elements.categoriaSelect ? state.elements.categoriaSelect.value : '';
    const unidadMedida = state.elements.unidadMedidaSelect ? state.elements.unidadMedidaSelect.value : '';
    const stockMinimo = state.elements.stockMinimoInput ? parseInt(state.elements.stockMinimoInput.value) : 0;

    if (!nombre) {
        window.showAlert("El nombre del artículo es obligatorio.");
        return;
    }
    if (isNaN(stockMinimo) || stockMinimo < 0) {
        window.showAlert("El stock mínimo debe ser un número válido y no negativo.");
        return;
    }

    const datos = {
        nombre: nombre,
        descripcion: state.elements.descripcionInput ? state.elements.descripcionInput.value.trim() : '',
        categoria: categoria,
        idProveedor: state.elements.idProveedorArticuloSelect ? state.elements.idProveedorArticuloSelect.value : '',
        unidadMedida: unidadMedida,
        stockMinimo: stockMinimo
    };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('inventario'), id), datos);
            console.log("Artículo actualizado con ID: ", id);
        } else {
            if (state.elements.cantidadActualInput) {
                const cantidadActual = parseInt(state.elements.cantidadActualInput.value);
                if (isNaN(cantidadActual) || cantidadActual < 0) {
                    window.showAlert("La cantidad actual debe ser un número válido y no negativo.");
                    return;
                }
                datos.cantidadActual = cantidadActual;
            } else {
                datos.cantidadActual = 0;
            }

            const docRef = await addDoc(getUserCollection('inventario'), datos);
            console.log("Nuevo artículo añadido con ID: ", docRef.id);
            if (datos.cantidadActual > 0) {
                const responsable = state.auth.currentUser ? state.auth.currentUser.email || state.auth.currentUser.uid : 'Anónimo';
                await registrarMovimiento(docRef.id, 'Entrada Inicial', datos.cantidadActual, 0, datos.cantidadActual, responsable, 'Creación de artículo');
            }
        }
        bootstrap.Modal.getInstance(state.elements.modalArticulo).hide();
    } catch (e) {
        console.error("Error al guardar artículo: ", e);
        window.showAlert("Error al guardar el artículo. Intente de nuevo.");
    }
}

/**
 * Confirms the deletion of an article.
 */
window.confirmarEliminacion = function(id) {
    const articulo = state.inventarioData.find(item => item.id === id);
    if (!articulo) return;

    window.showConfirm(`¿Está seguro de que desea eliminar el artículo <strong>${articulo.nombre}</strong>?`, async (confirmed) => {
        if (confirmed) {
            await eliminarArticulo(id);
        }
    });
}

/**
 * Deletes an article from Firestore.
 */
async function eliminarArticulo(id) {
    try {
        await deleteDoc(doc(getUserCollection('inventario'), id));
        console.log("Artículo eliminado con ID: ", id);
    } catch (e) {
        console.error("Error al eliminar artículo: ", e);
        window.showAlert("Error al eliminar el artículo. Intente de nuevo.");
    }
}

/**
 * Updates the supplier dropdown in the article modal.
 */
export function actualizarDropdownProveedores(idSeleccionado = '') {
    const select = state.elements.idProveedorArticuloSelect;
    if (!select) return;
    select.innerHTML = '<option value="">Sin proveedor</option>';
    state.proveedoresData.forEach(p => {
        select.innerHTML += `<option value="${p.id}" ${p.id === idSeleccionado ? 'selected' : ''}>${p.nombre}</option>`;
    });
}

/**
 * Updates the categories dropdown in the article modal.
 */
export function actualizarDropdownCategorias(idSeleccionado = '') {
    const select = state.elements.categoriaSelect;
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione Categoría</option>';
    state.categoriesData.forEach(c => {
        select.innerHTML += `<option value="${c.id}" ${c.id === idSeleccionado ? 'selected' : ''}>${c.name}</option>`;
    });
}

/**
 * Updates the units of measure dropdown in the article modal.
 */
export function actualizarDropdownUnidadesMedida(idSeleccionado = '') {
    const select = state.elements.unidadMedidaSelect;

    if (select) {
        select.innerHTML = '<option value="">Seleccione Unidad</option>';
        state.unitsOfMeasureData.forEach(u => {
            select.innerHTML += `<option value="${u.id}" ${u.id === idSeleccionado ? 'selected' : ''}>${u.name}</option>`;
        });
    }
}

/**
 * Checks for articles with low stock and displays an alert if any are found.
 */
export function verificarStockBajo() {
    const articulosBajoStock = state.inventarioData.filter(item => item.cantidadActual <= item.stockMinimo);
    const alertaToast = bootstrap.Toast.getOrCreateInstance(state.elements.alertaStockBajo);

    if (articulosBajoStock.length > 0) {
        if (state.elements.alertaStockBajo) state.elements.alertaStockBajo.classList.add('show');
        alertaToast.show();
    } else {
        if (state.elements.alertaStockBajo) state.elements.alertaStockBajo.classList.remove('show');
        alertaToast.hide();
    }
}

/**
 * Displays the movement history for a specific article.
 */
window.verHistorial = async function(id) {
    const articulo = state.inventarioData.find(item => item.id === id);
    if (!articulo) {
        window.showAlert("Artículo no encontrado para ver historial.");
        return;
    }

    if (state.elements.historialNombreArticulo) state.elements.historialNombreArticulo.innerText = `Artículo: ${articulo.nombre} (ID: ${articulo.id})`;
    const tbody = state.elements.tablaHistorialBody;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Cargando historial...</td></tr>';

    try {
        const q = query(getUserCollection('historial'), where("idArticulo", "==", id));
        const querySnapshot = await getDocs(q);
        const historialDataFetched = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (historialDataFetched.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay movimientos registrados para este artículo.</td></tr>';
        } else {
            tbody.innerHTML = '';
            historialDataFetched.forEach(mov => {
                const fechaFormateada = mov.fecha instanceof Date ? mov.fecha.toLocaleString() : new Date(mov.fecha.toDate()).toLocaleString();
                tbody.innerHTML += `
                    <tr>
                        <td>${fechaFormateada}</td>
                        <td>${mov.tipo}</td>
                        <td class="text-end">${Math.round(mov.cantidad)}</td>
                        <td class="text-end">${Math.round(mov.stockAnterior)}</td>
                        <td class="text-end">${Math.round(mov.stockNuevo)}</td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        console.error("Error al cargar historial: ", e);
        window.showAlert("Error al cargar el historial. Intente de nuevo.");
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar el historial.</td></tr>';
    }
    new bootstrap.Modal(state.elements.modalHistorial).show();
}

/**
 * Registers a movement in the article history.
 */
async function registrarMovimiento(idArticulo, tipo, cantidad, stockAnterior, stockNuevo, responsable, notas) {
    try {
        await addDoc(getUserCollection('historial'), {
            idArticulo,
            fecha: new Date(),
            tipo,
            cantidad,
            stockAnterior,
            stockNuevo,
            responsable,
            notas
        });
        console.log("Movimiento registrado para artículo: ", idArticulo);
    } catch (e) {
        console.error("Error al registrar movimiento: ", e);
        window.showAlert("Error al registrar el movimiento. Intente de nuevo.");
    }
}

// --- TABLE SORTING LOGIC ---
export function makeTableSortable(table) {
    if (!table) return;
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        const headerText = header.innerText.trim();
        if (headerText === 'Acciones' || headerText === 'Ajustar Stock') {
            return;
        }
        header.classList.add('sortable-header');
        header.addEventListener('click', () => {
            sortTableByColumn(table, index);
        });
    });
}

function sortTableByColumn(table, columnIndex) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const header = table.querySelector(`thead th:nth-child(${columnIndex + 1})`);
    if(!header) return;
    const sortOrder = header.classList.contains('sort-asc') ? 'desc' : 'asc';

    table.querySelectorAll('thead th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });

    header.classList.add(sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');

    const isNumeric = rows.length > 0 && rows[0].children[columnIndex] && !isNaN(parseFloat(rows[0].children[columnIndex].innerText.trim().replace(/[^0-9.-]+/g,"")));

    rows.sort((a, b) => {
        if (a.children[columnIndex] && b.children[columnIndex]) {
            const aText = a.children[columnIndex].innerText.trim();
            const bText = b.children[columnIndex].innerText.trim();

            if (isNumeric) {
                const aVal = parseFloat(aText.replace(/[^0-9.-]+/g,"")) || 0;
                const bVal = parseFloat(bText.replace(/[^0-9.-]+/g,"")) || 0;
                return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
            } else {
                return sortOrder === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
            }
        }
        return 0;
    });

    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}
