import { state } from './state.js';
import { getUserCollection, doc, getDoc, addDoc, updateDoc, deleteDoc } from './firebase.js';
import { renderizarConfigHorario } from './horarios.js';
import { migrarBobinasDesdeBaseVieja } from './bobinas.js';

const ordenarPorNombre = lista => [...lista].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

window.switchConfiguracionTab = function(tab) {
    ['insumos', 'contactos', 'horario', 'usuarios', 'sistema'].forEach(nombre => {
        document.getElementById(`tab-btn-config-${nombre}`).classList.toggle('active', nombre === tab);
        document.getElementById(`config-seccion-${nombre}`).style.display = nombre === tab ? '' : 'none';
    });
    if (tab === 'horario') renderizarConfigHorario();
    if (tab === 'usuarios') window.accesosRenderizarUsuarios?.();
    if (tab === 'sistema') mostrarEstadoMigracionBobinas();
};

// ---- Bobinas: copia única desde la base vieja (abierta) a la principal (protegida) ----
async function mostrarEstadoMigracionBobinas() {
    const estado = document.getElementById('bobinas-migracion-estado');
    if (!estado) return;
    try {
        const registro = await getDoc(doc(getUserCollection('configuracion'), 'bobinasMigracion'));
        if (!registro.exists()) {
            estado.innerHTML = '<i class="bi bi-exclamation-circle text-warning me-1"></i>Todavía no se copiaron.';
            return;
        }
        const { fecha, por, resultado } = registro.data();
        const cuando = (fecha?.toDate ? fecha.toDate() : new Date(fecha)).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        estado.innerHTML = `<i class="bi bi-check-circle-fill text-success me-1"></i>Copiados el ${cuando}${por ? ` por ${por}` : ''}: ${resultado?.inventario?.enLaVieja ?? 0} bobinas y ${resultado?.historial?.enLaVieja ?? 0} movimientos. Ya podés cerrar la base vieja.`;
    } catch (e) {
        console.error('Error leyendo la migración de bobinas:', e);
        estado.textContent = '';
    }
}

window.configMigrarBobinas = function() {
    window.showConfirm('¿Copiar ahora los datos de Bobinas a la base protegida?<br><small>No se borra nada. Si algo ya estaba copiado, no se duplica.</small>', async ok => {
        if (!ok) return;
        const boton = document.getElementById('bobinas-migracion-boton');
        boton.disabled = true;
        boton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Copiando…';
        try {
            const r = await migrarBobinasDesdeBaseVieja();
            window.showNotification(`Bobinas copiadas: ${r.inventario.copiados} bobinas y ${r.historial.copiados} movimientos nuevos.`, 'success');
            await mostrarEstadoMigracionBobinas();
        } catch (e) {
            console.error('Error copiando bobinas:', e);
            window.showAlert(/admin-restricted|operation-not-allowed/.test(e?.code || '')
                ? 'La base vieja ya no permite entrar: no hay nada para copiar desde acá.'
                : 'No se pudieron copiar los datos de Bobinas. Revisá la conexión y volvé a intentar.', 'danger');
        } finally {
            boton.disabled = false;
            boton.innerHTML = '<i class="bi bi-arrow-left-right me-1"></i>Copiar datos de Bobinas';
        }
    });
};

/**
 * Renders the list of categories in the configuration panel.
 */
export function renderizarListaCategorias() {
    const list = state.elements.listaCategorias;
    if (!list) return;
    list.innerHTML = '';
    if (state.categoriesData.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center">No hay categorías registradas.</li>';
        return;
    }
    ordenarPorNombre(state.categoriesData).forEach(cat => {
        list.innerHTML += `
            <li class="list-group-item config-list-item">
                <span>${cat.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="editarItemConfig('categories', '${cat.id}', '${cat.name}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarItemConfig('categories', '${cat.id}', '${cat.name}')"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        `;
    });
}

/**
 * Adds a new category to Firestore.
 */
window.agregarCategoria = async function() {
    const input = state.elements.inputCategoria;
    const categoryName = input.value.trim();
    if (!categoryName) {
        window.showAlert("El nombre de la categoría no puede estar vacío.");
        return;
    }
    try {
        await addDoc(getUserCollection('categories'), { name: categoryName });
        input.value = '';
        console.log("Categoría añadida:", categoryName);
    } catch (e) {
        console.error("Error al añadir categoría:", e);
        window.showAlert("Error al añadir la categoría. Intente de nuevo.");
    }
}

/**
 * Renders the list of units of measure in the configuration panel.
 */
export function renderizarListaUnidadesMedida() {
    const list = state.elements.listaUnidadesMedida;
    if (!list) return;
    list.innerHTML = '';
    if (state.unitsOfMeasureData.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center">No hay unidades de medida registradas.</li>';
        return;
    }
    ordenarPorNombre(state.unitsOfMeasureData).forEach(unit => {
        list.innerHTML += `
            <li class="list-group-item config-list-item">
                <span>${unit.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="editarItemConfig('unitsOfMeasure', '${unit.id}', '${unit.name}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarItemConfig('unitsOfMeasure', '${unit.id}', '${unit.name}')"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        `;
    });
}

/**
 * Adds a new unit of measure to Firestore.
 */
window.agregarUnidadMedida = async function() {
    const input = state.elements.inputUnidadMedida;
    const unitName = input.value.trim();
    if (!unitName) {
        window.showAlert("El nombre de la unidad de medida no puede estar vacío.");
        return;
    }
    try {
        await addDoc(getUserCollection('unitsOfMeasure'), { name: unitName });
        input.value = '';
        console.log("Unidad de medida añadida:", unitName);
    } catch (e) {
        console.error("Error al añadir unidad de medida:", e);
        window.showAlert("Error al añadir la unidad de medida. Intente de nuevo.");
    }
}

/**
 * Renders the list of roles in the configuration panel.
 */
export function renderizarListaRoles() {
    const list = state.elements.listaRoles;
    if (!list) return;
    list.innerHTML = '';
    if (state.rolesData.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center">No hay roles registrados.</li>';
        return;
    }
    ordenarPorNombre(state.rolesData).forEach(rol => {
        list.innerHTML += `
            <li class="list-group-item config-list-item">
                <span>${rol.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="editarItemConfig('roles', '${rol.id}', '${rol.name}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarItemConfig('roles', '${rol.id}', '${rol.name}')"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        `;
    });
}

/**
 * Adds a new role to Firestore.
 */
window.agregarRol = async function() {
    const input = state.elements.inputRol;
    const roleName = input.value.trim();
    if (!roleName) {
        window.showAlert("El nombre del rol no puede estar vacío.");
        return;
    }
    try {
        await addDoc(getUserCollection('roles'), { name: roleName });
        input.value = '';
        console.log("Rol añadido:", roleName);
    } catch (e) {
        console.error("Error al añadir rol:", e);
        window.showAlert("Error al añadir el rol. Intente de nuevo.");
    }
}

/**
 * Renders the list of localities in the configuration panel.
 */
export function renderizarListaLocalidades() {
    const list = state.elements.listaLocalidades;
    if (!list) return;
    list.innerHTML = '';
    if (state.localidadesData.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center">No hay localidades registradas.</li>';
        return;
    }
    ordenarPorNombre(state.localidadesData).forEach(loc => {
        list.innerHTML += `
            <li class="list-group-item config-list-item">
                <span>${loc.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="editarItemConfig('localidades', '${loc.id}', '${loc.name}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarItemConfig('localidades', '${loc.id}', '${loc.name}')"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        `;
    });
}

/**
 * Adds a new locality to Firestore.
 */
window.agregarLocalidad = async function() {
    const input = state.elements.inputLocalidad;
    const localityName = input.value.trim();
    if (!localityName) {
        window.showAlert("El nombre de la localidad no puede estar vacío.");
        return;
    }
    try {
        await addDoc(getUserCollection('localidades'), { name: localityName });
        input.value = '';
        console.log("Localidad añadida:", localityName);
    } catch (e) {
        console.error("Error al añadir localidad:", e);
        window.showAlert("Error al añadir la localidad. Intente de nuevo.");
    }
}

/**
 * Renders the list of plastic suppliers in the configuration panel.
 */
export function renderizarListaProveedoresPlastico() {
    const list = state.elements.listaProveedoresPlastico;
    if (!list) return;
    list.innerHTML = '';
    if (state.plasticSuppliersData.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center">No hay proveedores de plástico registrados.</li>';
        return;
    }
    ordenarPorNombre(state.plasticSuppliersData).forEach(prov => {
        list.innerHTML += `
            <li class="list-group-item config-list-item">
                <span>${prov.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="editarItemConfig('plasticSuppliers', '${prov.id}', '${prov.name}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="eliminarItemConfig('plasticSuppliers', '${prov.id}', '${prov.name}')"><i class="bi bi-trash"></i></button>
                </div>
            </li>
        `;
    });
}

/**
 * Adds a new plastic supplier to Firestore.
 */
window.agregarProveedorPlastico = async function() {
    const input = state.elements.inputProveedorPlastico;
    const supplierName = input.value.trim();
    if (!supplierName) {
        window.showAlert("El nombre del proveedor de plástico no puede estar vacío.");
        return;
    }
    try {
        await addDoc(getUserCollection('plasticSuppliers'), { name: supplierName });
        input.value = '';
        console.log("Proveedor de plástico añadido:", supplierName);
    } catch (e) {
        console.error("Error al añadir proveedor de plástico:", e);
        window.showAlert("Error al añadir el proveedor de plástico. Intente de nuevo.");
    }
}

/**
 * Edits an item in a configuration collection.
 */
window.editarItemConfig = function(collectionName, id, currentName) {
    window.showConfirm(`Editar ${currentName}: <input type="text" id="editConfigInput" class="form-control mt-2" value="${currentName}">`, async (confirmed) => {
        if (confirmed) {
            const newName = document.getElementById('editConfigInput').value.trim();
            if (!newName) {
                window.showAlert("El nombre no puede estar vacío.");
                return;
            }
            try {
                await updateDoc(doc(getUserCollection(collectionName), id), { name: newName });
                console.log(`Item en ${collectionName} actualizado: ${id} a ${newName}`);
            } catch (e) {
                console.error(`Error al editar item en ${collectionName}:`, e);
                window.showAlert("Error al editar el elemento. Intente de nuevo.");
            }
        }
    });
}

/**
 * Deletes an item from a configuration collection.
 */
window.eliminarItemConfig = function(collectionName, id, name) {
    window.showConfirm(`¿Está seguro de que desea eliminar "${name}" de ${collectionName}?`, async (confirmed) => {
        if (confirmed) {
            try {
                await deleteDoc(doc(getUserCollection(collectionName), id));
                console.log(`Item en ${collectionName} eliminado: ${id}`);
            } catch (e) {
                console.error(`Error al eliminar item de ${collectionName}:`, e);
                window.showAlert("Error al eliminar el elemento. Intente de nuevo.");
            }
        }
    });
}
