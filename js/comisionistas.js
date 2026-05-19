import { state } from './state.js';
import { getUserCollection, doc, addDoc, updateDoc, deleteDoc } from './firebase.js';

/**
 * Renders the commission agents panel based on current state.comisionistasData and search filter.
 */
export function renderizarPanelComisionistas() {
    const container = state.elements.listaComisionistasContainer;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    if (!container) return;
    container.innerHTML = '';

    const comisionistasFiltrados = state.comisionistasData.filter(comis => {
        const searchTerm = terminoBusqueda;
        if (state.currentSearchFilter === 'nombreComisionista') {
            return comis.nombre.toLowerCase().includes(searchTerm);
        } else if (state.currentSearchFilter === 'localidadComisionista') {
            return comis.localidades.some(locId => {
                const locality = state.localidadesData.find(l => l.id === locId);
                return locality && locality.name.toLowerCase().includes(searchTerm);
            });
        }
        return true;
    });

    if (comisionistasFiltrados.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">No se encontraron comisionistas que coincidan con la búsqueda.</p>';
        return;
    }

    comisionistasFiltrados.forEach(comis => {
        const localidadesNombres = comis.localidades.map(locId => {
            const locality = state.localidadesData.find(l => l.id === locId);
            return locality ? locality.name : 'N/A';
        }).join(', ');

        container.innerHTML += `
        <div class="col-md-6 mb-4">
            <div class="card comisionista-card">
                <div class="card-header">
                    <div><i class="bi bi-person-badge-fill"></i> <strong>${comis.nombre}</strong></div>
                    <div>
                        <button class="btn btn-sm btn-warning" onclick="prepararModalComisionistaParaEditar('${comis.id}')" title="Editar Comisionista"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="confirmarEliminacionComisionista('${comis.id}')" title="Eliminar Comisionista"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="card-text mb-2"><i class="bi bi-telephone"></i> Teléfono: ${comis.telefono || 'N/A'}</p>
                    <p class="card-text"><i class="bi bi-geo-alt-fill"></i> Localidades: ${localidadesNombres || 'N/A'}</p>
                </div>
            </div>
        </div>`;
    });
}

/**
 * Prepares the commission agent modal for adding a new commission agent.
 */
window.prepararModalComisionistaParaNuevo = function() {
    if (state.elements.formularioComisionista) state.elements.formularioComisionista.reset();
    if (state.elements.idComisionistaInput) state.elements.idComisionistaInput.value = '';
    if (state.elements.modalComisionistaLabel) state.elements.modalComisionistaLabel.innerText = '➕ Agregar Nuevo Comisionista';
    renderLocalidadesCheckboxes([]);
    if (state.elements.modalComisionista) state.elements.modalComisionista.dataset.editingComisionistaId = '';
}

/**
 * Prepares the commission agent modal for editing an existing commission agent.
 */
window.prepararModalComisionistaParaEditar = function(id) {
    const comis = state.comisionistasData.find(item => item.id === id);
    if (!comis) {
        window.showAlert("Comisionista no encontrado para editar.");
        return;
    }
    if (state.elements.idComisionistaInput) state.elements.idComisionistaInput.value = comis.id;
    if (state.elements.nombreComisionistaInput) state.elements.nombreComisionistaInput.value = comis.nombre;
    if (state.elements.telefonoComisionistaInput) state.elements.telefonoComisionistaInput.value = comis.telefono || '';
    if (state.elements.modalComisionistaLabel) state.elements.modalComisionistaLabel.innerText = '✏️ Modificar Comisionista';
    renderLocalidadesCheckboxes(comis.localidades || []);
    if (state.elements.modalComisionista) state.elements.modalComisionista.dataset.editingComisionistaId = id;
    new bootstrap.Modal(state.elements.modalComisionista).show();
}

/**
 * Renders the checkboxes for localities in the commission agent modal.
 */
export function renderLocalidadesCheckboxes(selectedLocalities) {
    const container = state.elements.localidadesCheckboxes;
    if (!container) return;
    container.innerHTML = '';
    if (state.localidadesData.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay localidades registradas. Agregue desde Configuración.</p>';
        return;
    }
    [...state.localidadesData].sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(loc => {
        const isChecked = selectedLocalities.includes(loc.id);
        container.innerHTML += `
            <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="loc-${loc.id}" value="${loc.id}" ${isChecked ? 'checked' : ''}>
                <label class="form-check-label" for="loc-${loc.id}">${loc.name}</label>
            </div>
        `;
    });
}

/**
 * Saves a new commission agent or updates an existing one in Firestore.
 */
window.guardarComisionista = async function() {
    const id = state.elements.idComisionistaInput ? state.elements.idComisionistaInput.value : '';
    const nombre = state.elements.nombreComisionistaInput ? state.elements.nombreComisionistaInput.value.trim() : '';
    const telefono = state.elements.telefonoComisionistaInput ? state.elements.telefonoComisionistaInput.value.trim() : '';

    if (!nombre) {
        window.showAlert("El nombre del comisionista es obligatorio.");
        return;
    }

    const selectedLocalities = [];
    if (state.elements.localidadesCheckboxes) {
        state.elements.localidadesCheckboxes.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            selectedLocalities.push(checkbox.value);
        });
    }

    const datos = {
        nombre,
        telefono,
        localidades: selectedLocalities
    };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('comisionistas'), id), datos);
            console.log("Comisionista actualizado con ID: ", id);
        } else {
            const docRef = await addDoc(getUserCollection('comisionistas'), datos);
            console.log("Nuevo comisionista añadido con ID: ", docRef.id);
        }
    } catch (e) {
        console.error("Error al guardar comisionista: ", e);
        window.showAlert("Error al guardar el comisionista. Intente de nuevo.");
    } finally {
        console.log("Intentando ocultar el modal de Comisionista en el bloque finally.");
        const modalInstance = bootstrap.Modal.getInstance(state.elements.modalComisionista);
        if (modalInstance) {
            modalInstance.hide();
        } else {
            console.warn("No se pudo obtener la instancia del modal de Bootstrap para el modal Comisionista. Intentando eliminación manual del backdrop.");
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
        }
    }
}

/**
 * Confirms the deletion of a commission agent.
 */
window.confirmarEliminacionComisionista = function(id) {
    const comis = state.comisionistasData.find(item => item.id === id);
    if (!comis) return;

    window.showConfirm(`¿Está seguro de que desea eliminar al comisionista <strong>${comis.nombre}</strong>?`, async (confirmed) => {
        if (confirmed) {
            await eliminarComisionista(id);
        }
    });
}

/**
 * Deletes a commission agent from Firestore.
 */
async function eliminarComisionista(id) {
    try {
        await deleteDoc(doc(getUserCollection('comisionistas'), id));
        console.log("Comisionista eliminado con ID: ", id);
    } catch (e) {
        console.error("Error al eliminar comisionista: ", e);
        window.showAlert("Error al eliminar el comisionista. Intente de nuevo.");
    }
}
