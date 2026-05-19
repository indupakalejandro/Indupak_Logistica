import { state } from './state.js';
import { getUserCollection, doc, addDoc, updateDoc, deleteDoc } from './firebase.js';

/**
 * Renders the faltantes table based on current state.faltantesData and search filter.
 */
export function renderizarTablaFaltantes() {
    const tbody = state.elements.faltantesTableBody;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    tbody.innerHTML = '';

    const faltantesFiltrados = state.faltantesData.filter(item => {
        const medidaName = item.medida ? item.medida.toLowerCase() : '';

        const matchesSearch = (
            (state.currentSearchFilter === 'codigoFaltante' && item.codigo.toLowerCase().includes(terminoBusqueda)) ||
            (state.currentSearchFilter === 'medidaFaltante' && medidaName.includes(terminoBusqueda)) ||
            (terminoBusqueda === '')
        );
        return matchesSearch;
    });

    if (faltantesFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se encontraron artículos faltantes.</td></tr>';
    } else {
        faltantesFiltrados.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.medida || 'N/A'}</td>
                    <td class="text-end">${Math.round(item.cantidad)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-warning" onclick="prepararModalFaltanteParaEditar('${item.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="confirmarEliminacionFaltante('${item.id}')" title="Eliminar"><i class="bi bi-trash-fill"></i></button>
                    </td>
                </tr>`;
        });
    }
    if (state.elements.footerFaltantes) {
        state.elements.footerFaltantes.innerText = `${faltantesFiltrados.length} artículo(s) faltante(s) encontrado(s).`;
    }
}
window.renderizarTablaFaltantes = renderizarTablaFaltantes;

/**
 * Prepares the faltante modal for adding a new item.
 */
window.prepararModalFaltanteParaNuevo = function() {
    if (state.elements.formularioFaltante) state.elements.formularioFaltante.reset();
    if (state.elements.idFaltanteInput) state.elements.idFaltanteInput.value = '';
    if (state.elements.modalFaltanteLabel) state.elements.modalFaltanteLabel.innerText = '➕ Agregar Nuevo Faltante';
}

/**
 * Prepares the faltante modal for editing an existing item.
 */
window.prepararModalFaltanteParaEditar = function(id) {
    const faltante = state.faltantesData.find(item => item.id === id);
    if (!faltante) {
        window.showAlert("Artículo faltante no encontrado para editar.");
        return;
    }
    if (state.elements.idFaltanteInput) state.elements.idFaltanteInput.value = faltante.id;
    if (state.elements.codigoFaltanteInput) state.elements.codigoFaltanteInput.value = faltante.codigo;
    if (state.elements.cantidadFaltanteInput) state.elements.cantidadFaltanteInput.value = Math.round(faltante.cantidad);
    if (state.elements.medidaFaltanteInput) state.elements.medidaFaltanteInput.value = faltante.medida || '';
    if (state.elements.modalFaltanteLabel) state.elements.modalFaltanteLabel.innerText = '✏️ Modificar Faltante';
    new bootstrap.Modal(state.elements.modalFaltante).show();
}

/**
 * Saves a new faltante item or updates an existing one in Firestore.
 */
window.guardarFaltante = async function() {
    const id = state.elements.idFaltanteInput ? state.elements.idFaltanteInput.value : '';
    const codigo = state.elements.codigoFaltanteInput ? state.elements.codigoFaltanteInput.value.trim() : '';
    const medida = state.elements.medidaFaltanteInput ? state.elements.medidaFaltanteInput.value.trim() : '';
    const cantidad = state.elements.cantidadFaltanteInput ? parseInt(state.elements.cantidadFaltanteInput.value) : 0;

    if (!codigo || !medida || isNaN(cantidad) || cantidad < 0) {
        window.showAlert("Por favor, complete todos los campos obligatorios (Código, Medida, Cantidad) y asegúrese que la cantidad sea un número no negativo.");
        return;
    }

    const datos = {
        codigo: codigo,
        medida: medida,
        cantidad: cantidad
    };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('faltantes'), id), datos);
            console.log("Faltante actualizado con ID: ", id);
        } else {
            await addDoc(getUserCollection('faltantes'), datos);
            console.log("Nuevo faltante añadido.");
        }
        bootstrap.Modal.getInstance(state.elements.modalFaltante).hide();
    } catch (e) {
        console.error("Error al guardar faltante:", e);
        window.showAlert("Error al guardar el artículo faltante. Intente de nuevo.");
    }
}

/**
 * Confirms the deletion of a faltante item.
 */
window.confirmarEliminacionFaltante = function(id) {
    const faltante = state.faltantesData.find(item => item.id === id);
    if (!faltante) return;

    window.showConfirm(`¿Está seguro de que desea eliminar el artículo faltante con código <strong>${faltante.codigo}</strong>?`, async (confirmed) => {
        if (confirmed) {
            await eliminarFaltante(id);
        }
    });
}

/**
 * Deletes a faltante item from Firestore.
 */
async function eliminarFaltante(id) {
    try {
        await deleteDoc(doc(getUserCollection('faltantes'), id));
        console.log("Faltante eliminado con ID: ", id);
    } catch (e) {
        console.error("Error al eliminar faltante: ", e);
        window.showAlert("Error al eliminar el artículo faltante. Intente de nuevo.");
    }
}
