import { state } from './state.js';
import { getUserCollection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where } from './firebase.js';

const HOVER_DELAY_MS = 1200;
const HIDE_GRACE_PERIOD_MS = 150;

/**
 * Renders the supplier panel based on current state.proveedoresData and search filter.
 */
export function renderizarPanelProveedores() {
    const container = state.elements.listaProveedoresContainer;
    const terminoBusqueda = state.elements.buscador ? state.elements.buscador.value.toLowerCase() : '';
    if (!container) return;
    container.innerHTML = '';

    const proveedoresFiltrados = state.proveedoresData.filter(prov => {
        const searchTerm = terminoBusqueda;
        if (state.currentSearchFilter === 'nombreProveedor') {
            return prov.nombre.toLowerCase().includes(searchTerm);
        } else if (state.currentSearchFilter === 'nombreContacto') {
            return state.contactosData.some(contact =>
                contact.idProveedor === prov.id && contact.nombre.toLowerCase().includes(searchTerm)
            );
        } else if (state.currentSearchFilter === 'descripcionProveedor') {
            return (prov.descripcion && prov.descripcion.toLowerCase().includes(searchTerm));
        } else if (state.currentSearchFilter === 'direccionProveedor') {
            return (prov.direccion && prov.direccion.toLowerCase().includes(searchTerm));
        }
        return true;
    });

    if (proveedoresFiltrados.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">No se encontraron proveedores que coincidan con la búsqueda.</p>';
        return;
    }

    proveedoresFiltrados.forEach(prov => {
        const contactosHtml = state.contactosData
            .filter(c => c.idProveedor === prov.id)
            .map(c => {
                const rolName = state.rolesData.find(r => r.id === c.rol)?.name || 'N/A';
                return `
                    <li class="contact-list-item">
                        <div>
                            <strong>${c.nombre}</strong> (${rolName})<br>
                            <small class="text-muted">${c.email || ''} - ${c.telefono || ''}</small>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="prepararModalContactoParaEditar('${c.id}')"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarContacto('${c.id}')"><i class="bi bi-trash"></i></button>
                        </div>
                    </li>
                `;
            }).join('');

        container.innerHTML += `
        <div class="col-md-6 mb-4">
            <div class="card proveedor-card">
                <div class="card-header">
                    <div><i class="bi bi-truck"></i> <strong>${prov.nombre}</strong></div>
                    <div>
                        <button class="btn btn-sm btn-primary" onclick="prepararModalContactoParaNuevo('${prov.id}')" title="Agregar Contacto" data-bs-toggle="modal" data-bs-target="#modalContacto"><i class="bi bi-person-plus"></i></button>
                        <button class="btn btn-sm btn-warning" onclick="prepararModalProveedorParaEditar('${prov.id}')" title="Editar Proveedor" data-bs-toggle="modal" data-bs-target="#modalProveedor"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="confirmarEliminacionProveedor('${prov.id}')" title="Eliminar Proveedor"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="card-text mb-2"><i class="bi bi-info-circle"></i> CUIT: ${prov.cuit || 'N/A'}</p>
                    <p class="card-text mb-2"><i class="bi bi-geo-alt"></i> Dirección: ${prov.direccion || 'N/A'}</p>
                    <p class="card-text mb-2"><i class="bi bi-card-text"></i> Descripción: ${prov.descripcion || 'N/A'}</p>
                    <p class="card-text mb-2"><i class="bi bi-envelope"></i> ${prov.email || 'N/A'}</p>
                    <p class="card-text"><i class="bi bi-telephone"></i> ${prov.telefono || 'N/A'}</p>
                </div>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item card-header"><strong>Contactos</strong></li>
                    ${contactosHtml || '<li class="list-group-item text-muted">Sin contactos.</li>'}
                </ul>
            </div>
        </div>`;
    });
}

/**
 * Prepares the supplier modal for adding a new supplier.
 */
window.prepararModalProveedorParaNuevo = function() {
    if (state.elements.formularioProveedor) state.elements.formularioProveedor.reset();
    if (state.elements.idProveedorInput) state.elements.idProveedorInput.value = '';
    if (state.elements.modalProveedorLabel) state.elements.modalProveedorLabel.innerText = '➕ Agregar Nuevo Proveedor';
}

/**
 * Prepares the supplier modal for editing an existing supplier.
 */
window.prepararModalProveedorParaEditar = function(id) {
    const prov = state.proveedoresData.find(p => p.id === id);
    if (!prov) {
        window.showAlert("Proveedor no encontrado para editar.");
        return;
    }
    if (state.elements.idProveedorInput) state.elements.idProveedorInput.value = prov.id;
    if (state.elements.nombreProveedorInput) state.elements.nombreProveedorInput.value = prov.nombre;
    if (state.elements.descripcionProveedorInput) state.elements.descripcionProveedorInput.value = prov.descripcion || '';
    if (state.elements.direccionProveedorInput) state.elements.direccionProveedorInput.value = prov.direccion || '';
    if (state.elements.cuitProveedorInput) state.elements.cuitProveedorInput.value = prov.cuit || '';
    if (state.elements.emailProveedorInput) state.elements.emailProveedorInput.value = prov.email || '';
    if (state.elements.telefonoProveedorInput) state.elements.telefonoProveedorInput.value = prov.telefono || '';
    if (state.elements.modalProveedorLabel) state.elements.modalProveedorLabel.innerText = '✏️ Modificar Proveedor';
}

/**
 * Saves a new supplier or updates an existing one in Firestore.
 */
window.guardarProveedor = async function() {
    const id = state.elements.idProveedorInput ? state.elements.idProveedorInput.value : '';
    const nombre = state.elements.nombreProveedorInput ? state.elements.nombreProveedorInput.value.trim() : '';
    if(!nombre) {
        window.showAlert("El nombre del proveedor es obligatorio.");
        return;
    }

    const datos = {
        nombre,
        descripcion: state.elements.descripcionProveedorInput ? state.elements.descripcionProveedorInput.value.trim() : '',
        direccion: state.elements.direccionProveedorInput ? state.elements.direccionProveedorInput.value.trim() : '',
        cuit: state.elements.cuitProveedorInput ? state.elements.cuitProveedorInput.value.trim() : '',
        email: state.elements.emailProveedorInput ? state.elements.emailProveedorInput.value.trim() : '',
        telefono: state.elements.telefonoProveedorInput ? state.elements.telefonoProveedorInput.value.trim() : ''
    };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('proveedores'), id), datos);
            console.log("Proveedor actualizado con ID: ", id);
        } else {
            const docRef = await addDoc(getUserCollection('proveedores'), datos);
            console.log("Nuevo proveedor añadido con ID: ", docRef.id);
        }
        bootstrap.Modal.getInstance(state.elements.modalProveedor).hide();
    } catch (e) {
        console.error("Error al guardar proveedor: ", e);
        window.showAlert("Error al guardar el proveedor. Intente de nuevo.");
    }
}

/**
 * Confirms the deletion of a supplier.
 */
window.confirmarEliminacionProveedor = function(id) {
    const proveedor = state.proveedoresData.find(p => p.id === id);
    if (!proveedor) return;

    window.showConfirm(`¿Está seguro de que desea eliminar al proveedor <strong>${proveedor.nombre}</strong>? Se desvinculará de todos los artículos y sus contactos serán eliminados.`, async (confirmed) => {
        if (confirmed) {
            await eliminarProveedor(id);
        }
    });
}

/**
 * Deletes a supplier and its associated contacts and unlinks articles.
 */
async function eliminarProveedor(id) {
    try {
        const q = query(getUserCollection('contactos'), where("idProveedor", "==", id));
        const querySnapshot = await getDocs(q);
        const deleteContactPromises = [];
        querySnapshot.forEach((d) => {
            deleteContactPromises.push(deleteDoc(d.ref));
        });
        await Promise.all(deleteContactPromises);

        const qArticles = query(getUserCollection('inventario'), where("idProveedor", "==", id));
        const articlesSnapshot = await getDocs(qArticles);
        const updateArticlePromises = [];
        articlesSnapshot.forEach((d) => {
            updateArticlePromises.push(updateDoc(d.ref, { idProveedor: '' }));
        });
        await Promise.all(updateArticlePromises);

        await deleteDoc(doc(getUserCollection('proveedores'), id));
        console.log("Proveedor y contactos asociados eliminados con ID: ", id);
    } catch (e) {
        console.error("Error al eliminar proveedor: ", e);
        window.showAlert("Error al eliminar el proveedor. Intente de nuevo.");
    }
}

/**
 * Prepares the contact modal for adding a new contact.
 */
window.prepararModalContactoParaNuevo = function(idProveedor) {
    if (state.elements.formularioContacto) state.elements.formularioContacto.reset();
    if (state.elements.idContactoInput) state.elements.idContactoInput.value = '';
    if (state.elements.idProveedorContactoInput) state.elements.idProveedorContactoInput.value = idProveedor;
    if (state.elements.modalContactoLabel) state.elements.modalContactoLabel.innerText = '➕ Agregar Nuevo Contacto';
    actualizarDropdownRoles();
}

/**
 * Prepares the contact modal for editing an existing contact.
 */
window.prepararModalContactoParaEditar = function(id) {
    const contacto = state.contactosData.find(c => c.id === id);
    if (!contacto) {
        window.showAlert("Contacto no encontrado para editar.");
        return;
    }
    if (state.elements.idContactoInput) state.elements.idContactoInput.value = contacto.id;
    if (state.elements.idProveedorContactoInput) state.elements.idProveedorContactoInput.value = contacto.idProveedor;
    if (state.elements.nombreContactoInput) state.elements.nombreContactoInput.value = contacto.nombre;
    actualizarDropdownRoles(contacto.rol);
    if (state.elements.emailContactoInput) state.elements.emailContactoInput.value = contacto.email || '';
    if (state.elements.telefonoContactoInput) state.elements.telefonoContactoInput.value = contacto.telefono || '';
    if (state.elements.modalContactoLabel) state.elements.modalContactoLabel.innerText = '✏️ Modificar Contacto';
    new bootstrap.Modal(state.elements.modalContacto).show();
}

/**
 * Saves a new contact or updates an existing one in Firestore.
 */
window.guardarContacto = async function() {
    const id = state.elements.idContactoInput ? state.elements.idContactoInput.value : '';
    const idProveedor = state.elements.idProveedorContactoInput ? state.elements.idProveedorContactoInput.value : '';
    const nombre = state.elements.nombreContactoInput ? state.elements.nombreContactoInput.value.trim() : '';
    const rol = state.elements.rolContactoSelect ? state.elements.rolContactoSelect.value : '';

    if(!nombre) {
        window.showAlert("El nombre del contacto es obligatorio.");
        return;
    }

    const datos = {
        idProveedor,
        nombre,
        rol: rol,
        email: state.elements.emailContactoInput ? state.elements.emailContactoInput.value.trim() : '',
        telefono: state.elements.telefonoContactoInput ? state.elements.telefonoContactoInput.value.trim() : '',
    };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('contactos'), id), datos);
            console.log("Contacto actualizado con ID: ", id);
        } else {
            const docRef = await addDoc(getUserCollection('contactos'), datos);
            console.log("Nuevo contacto añadido con ID: ", docRef.id);
        }
        bootstrap.Modal.getInstance(state.elements.modalContacto).hide();
    } catch (e) {
        console.error("Error al guardar contacto: ", e);
        window.showAlert("Error al guardar el contacto. Intente de nuevo.");
    }
}

/**
 * Deletes a contact from Firestore.
 */
window.eliminarContacto = function(id) {
    window.showConfirm('¿Seguro que desea eliminar este contacto?', async (confirmed) => {
        if (confirmed) {
            try {
                await deleteDoc(doc(getUserCollection('contactos'), id));
                console.log("Contacto eliminado con ID: ", id);
            } catch (e) {
                console.error("Error al eliminar contacto: ", e);
                window.showAlert("Error al eliminar el contacto. Intente de nuevo.");
            }
        }
    });
}

/**
 * Updates the roles dropdown in the contact modal.
 */
export function actualizarDropdownRoles(idSeleccionado = '') {
    const select = state.elements.rolContactoSelect;
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione Rol</option>';
    state.rolesData.forEach(r => {
        select.innerHTML += `<option value="${r.id}" ${r.id === idSeleccionado ? 'selected' : ''}>${r.name}</option>`;
    });
}

// --- Floating Provider Card Logic ---
window.handleProviderMouseEnter = function(event, providerId) {
    clearTimeout(state.hideProviderCardTimer);
    if (!providerId) {
        hideProviderCard();
        return;
    }
    state.showProviderCardTimer = setTimeout(() => {
        displayProviderCard(providerId, event);
    }, HOVER_DELAY_MS);
}

window.handleProviderMouseLeave = function() {
    clearTimeout(state.showProviderCardTimer);
    state.hideProviderCardTimer = setTimeout(() => {
        hideProviderCard();
    }, HIDE_GRACE_PERIOD_MS);
}

function displayProviderCard(providerId, event) {
    const provider = state.proveedoresData.find(p => p.id === providerId);
    const providerCard = state.elements.providerCard;

    if (!provider || !providerCard) {
        hideProviderCard();
        return;
    }

    let contactsHtml = state.contactosData
        .filter(c => c.idProveedor === provider.id)
        .map(c => {
            const rolName = state.rolesData.find(r => r.id === c.rol)?.name || 'N/A';
            return `
                <div class="contact-item">
                    <strong>${c.nombre}</strong>
                    <small>${rolName}</small>
                    <small><i class="bi bi-envelope"></i> ${c.email || 'N/A'}</small>
                    <small><i class="bi bi-telephone"></i> ${c.telefono || 'N/A'}</small>
                </div>
            `;
        }).join('');

    if (!contactsHtml) {
        contactsHtml = '<div class="text-muted">Sin contactos registrados.</div>';
    }

    providerCard.innerHTML = `
        <h6 class="card-title">${provider.nombre}</h6>
        <p class="mb-1"><small><i class="bi bi-info-circle"></i> CUIT: ${provider.cuit || 'N/A'}</small></p>
        <p class="mb-1"><small><i class="bi bi-geo-alt"></i> Dirección: ${provider.direccion || 'N/A'}</small></p>
        <p class="mb-3"><small><i class="bi bi-card-text"></i> Descripción: ${provider.descripcion || 'N/A'}</small></p>
        <p class="mb-3"><small><i class="bi bi-telephone"></i> Teléfono: ${provider.telefono || 'N/A'}</small></p>
        <hr class="my-2" style="border-color: rgba(255,255,255,0.2);">
        <h6 class="card-title mt-3 mb-2">Contactos:</h6>
        ${contactsHtml}
    `;

    const tdRect = event.target.getBoundingClientRect();
    const margin = 10;

    let x = tdRect.right + margin;
    let y = tdRect.top;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    providerCard.style.display = 'block';
    const cardWidth = providerCard.offsetWidth;
    const cardHeight = providerCard.offsetHeight;
    providerCard.style.display = 'none';

    if (x + cardWidth > viewportWidth - margin) {
        x = tdRect.left - cardWidth - margin;
    }
    if (x < margin) {
        x = margin;
    }

    if (y + cardHeight > viewportHeight - margin) {
        y = viewportHeight - cardHeight - margin;
    }
    if (y < margin) {
        y = margin;
    }

    providerCard.style.left = x + 'px';
    providerCard.style.top = y + 'px';

    providerCard.style.display = 'block';
    setTimeout(() => {
        providerCard.classList.add('show');
    }, 10);
}

function hideProviderCard() {
    const providerCard = state.elements.providerCard;
    if (!providerCard) return;
    providerCard.classList.remove('show');
    setTimeout(() => {
        providerCard.style.display = 'none';
    }, 200);
}

export function setupProviderCardListeners() {
    if (state.elements.providerCard) {
        state.elements.providerCard.addEventListener('mouseenter', () => {
            clearTimeout(state.hideProviderCardTimer);
        });
        state.elements.providerCard.addEventListener('mouseleave', () => {
            state.hideProviderCardTimer = setTimeout(() => {
                hideProviderCard();
            }, HIDE_GRACE_PERIOD_MS);
        });
    }
}
