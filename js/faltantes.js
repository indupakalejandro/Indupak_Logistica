import { state } from './state.js';
import { getUserCollection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from './firebase.js';
import { formatCantidad, parseCantidad } from './ui.js';

// ---- Historial: cuando un faltante se elimina, pasa acá con la fecha en que se cargó y la que se sacó ----
let historialFaltantes = [];
let historialCargado = false;
const MAX_HISTORIAL_VISIBLE = 300;

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Firestore devuelve Timestamp; los registros viejos o de prueba pueden traer Date o texto.
function aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === 'function') return valor.toDate();
    const fecha = valor instanceof Date ? valor : new Date(valor);
    return isNaN(fecha) ? null : fecha;
}

function celdaFecha(fecha) {
    if (!fecha) return '<span class="text-muted">—</span>';
    const corta = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const completa = fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<span title="${completa}">${corta}</span>`;
}

// El mismo buscador sirve para las dos pestañas, con el filtro elegido (código o medida).
function coincideBusqueda(item) {
    const termino = state.elements.buscador ? state.elements.buscador.value.trim().toLowerCase() : '';
    if (!termino) return true;
    const campo = state.currentSearchFilter === 'medidaFaltante' ? item.medida : item.codigo;
    return String(campo || '').toLowerCase().includes(termino);
}

export function escucharHistorialFaltantes() {
    onSnapshot(getUserCollection('faltantesHistorial'), snapshot => {
        historialFaltantes = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(h => !h.accion || h.accion === 'baja')
            .map(h => ({ ...h, eliminadoObj: aFecha(h.eliminadoEn || h.fecha), altaObj: aFecha(h.creadoEn) }))
            .sort((a, b) => (b.eliminadoObj?.getTime() || 0) - (a.eliminadoObj?.getTime() || 0));
        historialCargado = true;
        if (state.currentActivePanel === 'faltantes') renderizarTablaFaltantes();
    }, error => {
        console.error('Error cargando el historial de faltantes:', error);
        historialCargado = true;
        if (state.currentActivePanel === 'faltantes') renderizarTablaFaltantes();
    });
}

window.switchFaltantesTab = function(tab) {
    state.activeFaltantesTab = tab;
    document.getElementById('tab-btn-faltantes-actuales').classList.toggle('active', tab === 'actuales');
    document.getElementById('tab-btn-faltantes-historial').classList.toggle('active', tab === 'historial');
    document.getElementById('faltantes-btn-nuevo').style.display = tab === 'actuales' ? '' : 'none';
    document.getElementById('faltantes-historial-periodo').style.display = tab === 'historial' ? '' : 'none';
    renderizarTablaFaltantes();
};

/**
 * Pinta la pestaña activa: los faltantes de ahora o el historial de los que se eliminaron.
 */
export function renderizarTablaFaltantes() {
    const contador = document.getElementById('faltantes-contador-actuales');
    if (contador) contador.textContent = state.faltantesData.length;
    if (state.activeFaltantesTab === 'historial') renderizarHistorial();
    else renderizarActuales();
}
window.renderizarTablaFaltantes = renderizarTablaFaltantes;

function renderizarActuales() {
    const thead = document.getElementById('tabla-faltantes-head');
    const tbody = state.elements.faltantesTableBody;
    if (!tbody) return;

    if (thead) thead.innerHTML = `
        <tr>
            <th>Código</th>
            <th>Medida</th>
            <th class="text-end">Cantidad</th>
            <th>Cargado</th>
            <th class="text-center">Acciones</th>
        </tr>`;

    const faltantesFiltrados = state.faltantesData
        .filter(coincideBusqueda)
        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }));

    tbody.innerHTML = faltantesFiltrados.length
        ? faltantesFiltrados.map(item => `
            <tr>
                <td class="text-nowrap"><strong>${escapeHtml(item.codigo)}</strong></td>
                <td>${escapeHtml(item.medida || 'N/A')}</td>
                <td class="text-end">${formatCantidad(item.cantidad)}</td>
                <td class="text-nowrap"><small>${celdaFecha(aFecha(item.creadoEn))}</small></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-warning" onclick="prepararModalFaltanteParaEditar('${item.id}')" title="Editar"><i class="bi bi-pencil-fill"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="confirmarEliminacionFaltante('${item.id}')" title="Eliminar y pasar al historial"><i class="bi bi-trash-fill"></i></button>
                </td>
            </tr>`).join('')
        : '<tr><td colspan="5" class="text-center text-muted">No se encontraron artículos faltantes.</td></tr>';

    if (state.elements.footerFaltantes) {
        state.elements.footerFaltantes.innerText = `${faltantesFiltrados.length} artículo(s) faltante(s) encontrado(s).`;
    }
}

function renderizarHistorial() {
    const thead = document.getElementById('tabla-faltantes-head');
    const tbody = state.elements.faltantesTableBody;
    if (!tbody) return;

    if (thead) thead.innerHTML = `
        <tr>
            <th>Código</th>
            <th>Medida</th>
            <th class="text-end">Cantidad</th>
            <th>Cargado</th>
            <th>Eliminado</th>
            <th class="text-center">Acciones</th>
        </tr>`;

    if (!historialCargado) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Cargando historial…</td></tr>';
        if (state.elements.footerFaltantes) state.elements.footerFaltantes.innerText = '';
        return;
    }

    const dias = Number(document.getElementById('faltantes-historial-periodo')?.value || 0);
    const desde = dias ? Date.now() - dias * 864e5 : 0;
    const filtrados = historialFaltantes.filter(h => (!desde || (h.eliminadoObj?.getTime() || 0) >= desde) && coincideBusqueda(h));
    const visibles = filtrados.slice(0, MAX_HISTORIAL_VISIBLE);

    if (!visibles.length) {
        const termino = state.elements.buscador?.value.trim();
        const mensaje = termino ? 'Ningún artículo del historial coincide con la búsqueda.'
            : historialFaltantes.length ? 'No se eliminó ningún faltante en este período.'
            : 'Todavía no hay historial. Cuando elimines un faltante, pasa acá con su fecha.';
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${mensaje}</td></tr>`;
    } else {
        tbody.innerHTML = visibles.map(h => `
            <tr>
                <td class="text-nowrap"><strong>${escapeHtml(h.codigo)}</strong></td>
                <td>${escapeHtml(h.medida || 'N/A')}</td>
                <td class="text-end">${formatCantidad(h.cantidad)}</td>
                <td class="text-nowrap"><small>${celdaFecha(h.altaObj)}</small></td>
                <td class="text-nowrap"><small>${celdaFecha(h.eliminadoObj)}</small></td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-success" onclick="restaurarFaltante('${h.id}')" title="Volver a la lista de faltantes"><i class="bi bi-arrow-counterclockwise"></i></button>
                </td>
            </tr>`).join('');
    }

    if (state.elements.footerFaltantes) {
        state.elements.footerFaltantes.innerText = filtrados.length > visibles.length
            ? `Mostrando los ${visibles.length} más recientes de ${filtrados.length} artículo(s) en el historial.`
            : `${filtrados.length} artículo(s) en el historial.`;
    }
}

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
    if (state.elements.cantidadFaltanteInput) state.elements.cantidadFaltanteInput.value = formatCantidad(faltante.cantidad);
    if (state.elements.medidaFaltanteInput) state.elements.medidaFaltanteInput.value = faltante.medida || '';
    if (state.elements.modalFaltanteLabel) state.elements.modalFaltanteLabel.innerText = '✏️ Modificar Faltante';
    bootstrap.Modal.getOrCreateInstance(state.elements.modalFaltante).show();
}

/**
 * Saves a new faltante item or updates an existing one in Firestore.
 */
window.guardarFaltante = async function() {
    const id = state.elements.idFaltanteInput ? state.elements.idFaltanteInput.value : '';
    const codigo = state.elements.codigoFaltanteInput ? state.elements.codigoFaltanteInput.value.trim() : '';
    const medida = state.elements.medidaFaltanteInput ? state.elements.medidaFaltanteInput.value.trim() : '';
    const cantidad = state.elements.cantidadFaltanteInput ? parseCantidad(state.elements.cantidadFaltanteInput.value) : 0;

    if (!codigo || !medida || isNaN(cantidad) || cantidad < 0) {
        window.showAlert("Por favor, complete todos los campos obligatorios (Código, Medida, Cantidad) y asegúrese que la cantidad sea un número no negativo.");
        return;
    }

    const datos = { codigo, medida, cantidad };

    try {
        if (id) {
            await updateDoc(doc(getUserCollection('faltantes'), id), datos);
        } else {
            await addDoc(getUserCollection('faltantes'), { ...datos, creadoEn: new Date() });
        }
        bootstrap.Modal.getInstance(state.elements.modalFaltante)?.hide();
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

    window.showConfirm(`¿Eliminar el faltante <strong>${escapeHtml(faltante.codigo)}</strong>?<br><small>Pasa al historial con la fecha de hoy.</small>`, async (confirmed) => {
        if (confirmed) {
            await eliminarFaltante(faltante);
        }
    });
}

/**
 * Pasa el faltante al historial y lo saca de la lista. Primero se guarda en el historial para no perderlo si falla la conexión.
 */
async function eliminarFaltante(faltante) {
    try {
        await addDoc(getUserCollection('faltantesHistorial'), {
            accion: 'baja',
            faltanteId: faltante.id,
            codigo: faltante.codigo,
            medida: faltante.medida || '',
            cantidad: parseCantidad(faltante.cantidad),
            creadoEn: faltante.creadoEn || null,
            eliminadoEn: new Date()
        });
        await deleteDoc(doc(getUserCollection('faltantes'), faltante.id));
    } catch (e) {
        console.error("Error al eliminar faltante: ", e);
        window.showAlert("Error al eliminar el artículo faltante. Intente de nuevo.");
    }
}

/**
 * Devuelve un artículo del historial a la lista de faltantes, con su fecha de carga original.
 */
window.restaurarFaltante = function(historialId) {
    const h = historialFaltantes.find(item => item.id === historialId);
    if (!h) return;

    window.showConfirm(`¿Volver a poner <strong>${escapeHtml(h.codigo)}</strong> en la lista de faltantes?`, async (confirmed) => {
        if (!confirmed) return;
        try {
            await addDoc(getUserCollection('faltantes'), {
                codigo: h.codigo,
                medida: h.medida || '',
                cantidad: parseCantidad(h.cantidad),
                creadoEn: h.creadoEn || new Date()
            });
            await deleteDoc(doc(getUserCollection('faltantesHistorial'), historialId));
        } catch (e) {
            console.error('Error al restaurar faltante:', e);
            window.showAlert('No se pudo volver a poner el artículo en la lista. Intente de nuevo.');
        }
    });
};
