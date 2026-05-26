import { state } from './state.js';
import { getUserCollection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from './firebase.js';

// ---- Local state for article selection modal ----
let controlArticulosSeleccionados = [];

// ---- Guardar/restaurar en localStorage ----
function controlGuardarEnLocal() {
    if (state.controlEjecucionActual) {
        localStorage.setItem('controlEjecucionActual', JSON.stringify(state.controlEjecucionActual));
    }
}
// Expose for inline oninput handlers in rendered HTML
window.controlGuardarEnLocal = controlGuardarEnLocal;

export function controlRestaurarDesdeLocal() {
    const guardado = localStorage.getItem('controlEjecucionActual');
    if (guardado) {
        try {
            state.controlEjecucionActual = JSON.parse(guardado);
            if (state.currentActivePanel === 'control' && state.controlEjecucionActual) {
                document.getElementById('control-vista-ejecucion').style.display = 'block';
                document.getElementById('control-ejecucion-titulo').textContent = state.controlEjecucionActual.nombre;
                document.getElementById('control-ejecucion-fecha').textContent = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                controlRenderizarEjecucion();
            }
        } catch (e) {
            console.error('Error restaurando control:', e);
            localStorage.removeItem('controlEjecucionActual');
        }
    }
}

function controlLimpiarLocal() {
    localStorage.removeItem('controlEjecucionActual');
}

// ---- Firestore listeners ----
export function setupControlListeners() {
    onSnapshot(getUserCollection('controlFormularios'), snap => {
        state.controlFormulariosData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentActivePanel === 'control') controlMostrarLista();
    });
    // controlHistorial listener moved to app.js so it can trigger dashboard re-render
}

// ---- Navegación entre vistas ----
function controlOcultarVistas() {
    ['lista','editor','ejecucion','resumen','historial'].forEach(v =>
        document.getElementById('control-vista-' + v).style.display = 'none'
    );
}

export function controlMostrarLista() {
    controlOcultarVistas();
    document.getElementById('control-vista-lista').style.display = 'block';
    controlRenderizarTablaFormularios();
}

window.controlVolverLista = function() {
    state.controlEditorId = null;
    state.controlEditorItems = [];
    state.controlEjecucionActual = null;
    controlMostrarLista();
}

// ---- Renderizar tabla de formularios ----
function controlRenderizarTablaFormularios() {
    const tbody = document.getElementById('control-tabla-formularios');
    const footer = document.getElementById('control-footer-formularios');
    tbody.innerHTML = '';
    if (state.controlFormulariosData.length === 0) {
        footer.textContent = 'Sin formularios creados.';
        return;
    }
    footer.textContent = `${state.controlFormulariosData.length} formulario(s) registrado(s).`;
    state.controlFormulariosData.forEach(f => {
        const ejecuciones = state.controlHistorialData.filter(h => h.formularioId === f.id);
        const ultima = ejecuciones.sort((a, b) => (b.fecha?.toDate?.() || 0) - (a.fecha?.toDate?.() || 0))[0];
        const fechaUltima = ultima ? (ultima.fecha?.toDate?.() || new Date(ultima.fecha)).toLocaleDateString('es-AR') : '—';
        tbody.innerHTML += `
            <tr>
                <td><strong>${f.nombre}</strong></td>
                <td class="text-center">${(f.items || []).length}</td>
                <td class="text-center">${fechaUltima}</td>
                <td class="text-center">${ejecuciones.length}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-success me-1" title="Ejecutar control" onclick="controlIniciarEjecucion('${f.id}')"><i class="bi bi-play-fill"></i></button>
                    <button class="btn btn-sm btn-outline-secondary me-1" title="Historial" onclick="controlVerHistorial('${f.id}')"><i class="bi bi-clock-history"></i></button>
                    <button class="btn btn-sm btn-outline-primary me-1" title="Editar" onclick="controlEditarFormulario('${f.id}')"><i class="bi bi-pencil-fill"></i></button>
                    <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="controlEliminarFormulario('${f.id}')"><i class="bi bi-trash-fill"></i></button>
                </td>
            </tr>`;
    });
}

// ---- Editor de formulario ----
window.controlNuevoFormulario = function() {
    state.controlEditorId = null;
    state.controlEditorItems = [];
    document.getElementById('control-editor-nombre').value = '';
    document.getElementById('control-editor-badge').textContent = 'Nuevo';
    controlOcultarVistas();
    document.getElementById('control-vista-editor').style.display = 'block';
    controlRenderizarEditorItems();
}

window.controlEditarFormulario = function(id) {
    const f = state.controlFormulariosData.find(x => x.id === id);
    if (!f) return;
    state.controlEditorId = id;
    state.controlEditorItems = JSON.parse(JSON.stringify(f.items || []));
    document.getElementById('control-editor-nombre').value = f.nombre;
    document.getElementById('control-editor-badge').textContent = 'Editando';
    controlOcultarVistas();
    document.getElementById('control-vista-editor').style.display = 'block';
    controlRenderizarEditorItems();
}

// Lee los valores actuales del DOM y los sincroniza en state.controlEditorItems
function controlSincronizarDesdeDOM() {
    const container = document.getElementById('control-editor-items');
    if (!container) return;
    state.controlEditorItems.forEach((item, idx) => {
        if (item.tipo === 'checklist') {
            const input = container.querySelector(`[data-item-idx="${idx}"]`);
            if (input) item.tarea = input.value;
        } else {
            const select = container.querySelector(`[data-item-idx="${idx}"]`);
            if (select) item.articuloId = select.value;
        }
    });
}

window.controlAgregarItemChecklist = function() {
    controlSincronizarDesdeDOM();
    state.controlEditorItems.push({ tipo: 'checklist', tarea: '', id: Date.now() + Math.random() });
    controlRenderizarEditorItems();
}

window.controlAbrirModalArticulos = function() {
    controlSincronizarDesdeDOM();
    controlArticulosSeleccionados = [];
    controlRenderizarListaArticulosModal();
    const modal = new bootstrap.Modal(document.getElementById('controlArticulosModal'));
    modal.show();
}

function controlRenderizarListaArticulosModal() {
    const container = document.getElementById('controlArticulosLista');
    container.innerHTML = '';
    const termino = document.getElementById('controlArticulosSearch').value.toLowerCase();

    const articulosFiltrados = state.inventarioData.filter(a =>
        a.nombre.toLowerCase().includes(termino) ||
        (a.codigo && a.codigo.toLowerCase().includes(termino))
    );

    if (articulosFiltrados.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4"><p>Sin resultados</p></div>';
        return;
    }

    articulosFiltrados.forEach(art => {
        const checked = controlArticulosSeleccionados.includes(art.id);
        const div = document.createElement('div');
        div.className = 'form-check p-2';
        div.style.background = 'var(--input-bg)';
        div.style.borderRadius = '0.5rem';
        div.style.borderLeft = checked ? '3px solid var(--accent-color)' : '3px solid transparent';
        div.innerHTML = `
            <input class="form-check-input" type="checkbox" id="art-${art.id}"
                ${checked ? 'checked' : ''}
                onchange="controlToggleArticuloSeleccionado('${art.id}')">
            <label class="form-check-label w-100 cursor-pointer" for="art-${art.id}">
                <strong>${art.nombre}</strong>
                <br>
                <small class="text-muted">Stock actual: ${art.cantidadActual} | Mínimo: ${art.stockMinimo}</small>
            </label>
        `;
        container.appendChild(div);
    });
}

window.controlToggleArticuloSeleccionado = function(articuloId) {
    const idx = controlArticulosSeleccionados.indexOf(articuloId);
    if (idx > -1) {
        controlArticulosSeleccionados.splice(idx, 1);
    } else {
        controlArticulosSeleccionados.push(articuloId);
    }
    controlRenderizarListaArticulosModal();
}

window.controlFiltrarArticulosModal = function() {
    controlRenderizarListaArticulosModal();
}

window.controlAgregarArticulosSeleccionados = function() {
    controlSincronizarDesdeDOM();
    controlArticulosSeleccionados.forEach(articuloId => {
        state.controlEditorItems.push({ tipo: 'articulo', articuloId, id: Date.now() + Math.random() });
    });
    controlRenderizarEditorItems();
    bootstrap.Modal.getInstance(document.getElementById('controlArticulosModal')).hide();
    controlArticulosSeleccionados = [];
}

window.controlAgregarItemArticulo = function() {
    controlSincronizarDesdeDOM();
    state.controlEditorItems.push({ tipo: 'articulo', articuloId: '', id: Date.now() + Math.random() });
    controlRenderizarEditorItems();
}

window.controlEliminarItemEditor = function(idx) {
    controlSincronizarDesdeDOM();
    state.controlEditorItems.splice(idx, 1);
    controlRenderizarEditorItems();
}

function controlRenderizarEditorItems() {
    const container = document.getElementById('control-editor-items');
    const vacio = document.getElementById('control-editor-vacio');
    container.innerHTML = '';
    if (state.controlEditorItems.length === 0) {
        vacio.style.display = 'block';
        return;
    }
    vacio.style.display = 'none';
    state.controlEditorItems.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'card p-2';
        div.style.background = 'var(--card-bg)';
        div.draggable = true;
        div.dataset.dragIdx = idx;
        div.style.cursor = 'grab';

        div.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.currentTarget);
            div.style.opacity = '0.5';
        });
        div.addEventListener('dragend', () => {
            div.style.opacity = '1';
            document.querySelectorAll('#control-editor-items .card').forEach(c => c.style.borderTop = '');
        });
        div.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (div.dataset.dragIdx != e.dataTransfer.getData('text/html')) {
                div.style.borderTop = '2px solid var(--accent-color)';
            }
        });
        div.addEventListener('dragleave', () => {
            div.style.borderTop = '';
        });
        div.addEventListener('drop', e => {
            e.preventDefault();
            const draggedIdx = parseInt(document.querySelector('#control-editor-items .card[style*="opacity"]')?.dataset.dragIdx || -1);
            if (draggedIdx !== -1 && draggedIdx !== idx) {
                const temp = state.controlEditorItems[draggedIdx];
                if (draggedIdx < idx) {
                    for (let i = draggedIdx; i < idx; i++) {
                        state.controlEditorItems[i] = state.controlEditorItems[i + 1];
                    }
                } else {
                    for (let i = draggedIdx; i > idx; i--) {
                        state.controlEditorItems[i] = state.controlEditorItems[i - 1];
                    }
                }
                state.controlEditorItems[idx] = temp;
                controlRenderizarEditorItems();
            }
            div.style.borderTop = '';
        });

        if (item.tipo === 'checklist') {
            div.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    <span class="cursor-grab me-1" style="font-size:0.9rem; opacity:0.5;" title="Arrastrá para reordenar">&#8942;&#8942;</span>
                    <span class="badge bg-success flex-shrink-0"><i class="bi bi-check2-square"></i> Checklist</span>
                    <input type="text" class="form-control form-control-sm flex-grow-1"
                        placeholder="Nombre de la tarea..."
                        value="${(item.tarea || '').replace(/"/g, '&quot;')}"
                        data-item-idx="${idx}"
                        oninput="window.state.controlEditorItems[${idx}].tarea = this.value">
                    <button class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="controlEliminarItemEditor(${idx})"><i class="bi bi-x"></i></button>
                </div>`;
        } else {
            const opciones = state.inventarioData.map(a =>
                `<option value="${a.id}" ${a.id === item.articuloId ? 'selected' : ''}>${a.nombre}</option>`
            ).join('');
            div.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    <span class="cursor-grab me-1" style="font-size:0.9rem; opacity:0.5;" title="Arrastrá para reordenar">&#8942;&#8942;</span>
                    <span class="badge bg-info text-dark"><i class="bi bi-box-seam"></i> Artículo</span>
                    <select class="form-select form-select-sm flex-grow-1" data-item-idx="${idx}">
                        <option value="">Seleccione un artículo...</option>
                        ${opciones}
                    </select>
                    <button class="btn btn-sm btn-outline-danger" onclick="controlEliminarItemEditor(${idx})"><i class="bi bi-x"></i></button>
                </div>`;
        }
        container.appendChild(div);
    });
}

window.controlGuardarFormulario = async function() {
    controlSincronizarDesdeDOM();
    const nombre = document.getElementById('control-editor-nombre').value.trim();
    if (!nombre) { window.showAlert('Ingresá un nombre para el formulario.'); return; }
    if (state.controlEditorItems.length === 0) { window.showAlert('Agregá al menos un ítem al formulario.'); return; }
    for (let i = 0; i < state.controlEditorItems.length; i++) {
        const it = state.controlEditorItems[i];
        if (it.tipo === 'articulo' && !it.articuloId) {
            window.showAlert(`El ítem artículo #${i+1} no tiene artículo seleccionado.`); return;
        }
    }
    const datos = { nombre, items: state.controlEditorItems.map(it => ({ ...it })) };
    try {
        if (state.controlEditorId) {
            await setDoc(doc(getUserCollection('controlFormularios'), state.controlEditorId), datos, { merge: true });
        } else {
            await addDoc(getUserCollection('controlFormularios'), { ...datos, creadoEn: new Date() });
        }
        window.controlVolverLista();
    } catch (e) {
        console.error(e);
        window.showAlert('Error al guardar el formulario. Intentá de nuevo.');
    }
}

window.controlEliminarFormulario = function(id) {
    window.showConfirm('¿Eliminar este formulario? También se eliminará su historial.', async (ok) => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('controlFormularios'), id));
            const ejecuciones = state.controlHistorialData.filter(h => h.formularioId === id);
            for (const e of ejecuciones) {
                await deleteDoc(doc(getUserCollection('controlHistorial'), e.id));
            }
        } catch (e) { window.showAlert('Error al eliminar. Intentá de nuevo.'); }
    });
}

// ---- Ejecución de control ----
window.controlIniciarEjecucion = function(id) {
    const f = state.controlFormulariosData.find(x => x.id === id);
    if (!f) return;
    state.controlEjecucionActual = {
        formularioId: id,
        nombre: f.nombre,
        items: JSON.parse(JSON.stringify(f.items || [])).map(it => {
            if (it.tipo === 'checklist') {
                return { ...it, completado: false, novedades: [] };
            } else {
                const art = state.inventarioData.find(a => a.id === it.articuloId);
                return { ...it, articuloNombre: art?.nombre || 'N/A', cantidadActual: art?.cantidadActual ?? 0, stockMinimo: art?.stockMinimo ?? 0, cantidadContada: '', novedades: [] };
            }
        })
    };
    controlGuardarEnLocal();
    document.getElementById('control-ejecucion-titulo').textContent = f.nombre;
    document.getElementById('control-ejecucion-fecha').textContent = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    controlOcultarVistas();
    document.getElementById('control-vista-ejecucion').style.display = 'block';
    controlRenderizarEjecucion();
}

function controlRenderizarEjecucion() {
    const container = document.getElementById('control-ejecucion-items');
    container.innerHTML = '';
    state.controlEjecucionActual.items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'card p-3';
        card.style.background = 'var(--card-bg)';
        if (item.tipo === 'checklist') {
            const tachado = item.completado ? 'text-decoration:line-through;opacity:.6' : '';
            card.innerHTML = `
                <div class="d-flex align-items-start gap-3">
                    <div class="form-check mt-2">
                        <input class="form-check-input" type="checkbox" id="chk-${idx}" ${item.completado ? 'checked' : ''}
                            onchange="window.state.controlEjecucionActual.items[${idx}].completado = this.checked; controlActualizarCheckStyle(${idx})">
                    </div>
                    <div class="flex-grow-1">
                        <input type="text"
                            id="chk-label-${idx}"
                            class="form-control form-control-sm mb-2"
                            placeholder="Escribí la tarea a controlar..."
                            value="${(item.tarea || '').replace(/"/g, '&quot;')}"
                            style="${tachado}"
                            oninput="window.state.controlEjecucionActual.items[${idx}].tarea = this.value; window.controlGuardarEnLocal()">
                        <div class="d-flex gap-2 align-items-center flex-wrap" id="novedades-list-${idx}">
                            ${(item.novedades||[]).map((n,ni) => `
                                <span class="badge bg-warning text-dark d-flex align-items-center gap-1" style="font-size:.8rem;">
                                    <i class="bi bi-exclamation-triangle-fill"></i> ${n}
                                    <button type="button" class="btn-close btn-close-sm ms-1" style="font-size:.6rem;" onclick="controlEliminarNovedad(${idx},${ni})"></button>
                                </span>`).join('')}
                        </div>
                        <button class="btn btn-outline-warning btn-sm mt-2" onclick="controlAgregarNovedad(${idx})">
                            <i class="bi bi-plus-circle"></i> Novedad
                        </button>
                    </div>
                </div>`;
        } else {
            const cantidad = item.cantidadContada !== '' ? Number(item.cantidadContada) : null;
            const bajoBadge = cantidad !== null && cantidad < item.stockMinimo
                ? `<span class="badge bg-danger ms-2"><i class="bi bi-exclamation-triangle-fill"></i> Bajo stock</span>` : '';
            card.innerHTML = `
                <div>
                    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                        <span class="badge bg-info text-dark"><i class="bi bi-box-seam"></i></span>
                        <strong>${item.articuloNombre}</strong>
                        <span class="text-muted" style="font-size:.85rem;">Stock mín: ${item.stockMinimo} | Inventario: ${item.cantidadActual}</span>
                        <span id="bajo-badge-${idx}">${bajoBadge}</span>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <label class="form-label mb-0">Cantidad contada:</label>
                        <input type="number" class="form-control form-control-sm" style="width:100px;" min="0"
                            value="${item.cantidadContada}"
                            oninput="controlActualizarCantidad(${idx}, this.value)">
                    </div>
                    <div class="mt-2 d-flex gap-2 align-items-center flex-wrap" id="novedades-list-${idx}">
                        ${(item.novedades||[]).map((n,ni) => `
                            <span class="badge bg-warning text-dark d-flex align-items-center gap-1" style="font-size:.8rem;">
                                <i class="bi bi-exclamation-triangle-fill"></i> ${n}
                                <button type="button" class="btn-close btn-close-sm ms-1" style="font-size:.6rem;" onclick="controlEliminarNovedad(${idx},${ni})"></button>
                            </span>`).join('')}
                    </div>
                    <button class="btn btn-outline-warning btn-sm mt-2" onclick="controlAgregarNovedad(${idx})">
                        <i class="bi bi-plus-circle"></i> Novedad
                    </button>
                </div>`;
        }
        container.appendChild(card);
    });
}

window.controlActualizarCantidad = function(idx, valor) {
    state.controlEjecucionActual.items[idx].cantidadContada = valor;
    controlGuardarEnLocal();
    const badge = document.getElementById('bajo-badge-' + idx);
    if (badge) {
        const cantidad = valor !== '' ? Number(valor) : null;
        const minimo = state.controlEjecucionActual.items[idx].stockMinimo;
        badge.innerHTML = (cantidad !== null && cantidad < minimo)
            ? `<span class="badge bg-danger ms-2"><i class="bi bi-exclamation-triangle-fill"></i> Bajo stock</span>`
            : '';
    }
}

window.controlActualizarCheckStyle = function(idx) {
    const input = document.getElementById('chk-label-' + idx);
    if (input) {
        const done = state.controlEjecucionActual.items[idx].completado;
        input.style.textDecoration = done ? 'line-through' : '';
        input.style.opacity = done ? '.6' : '1';
    }
    controlGuardarEnLocal();
}

window.controlAgregarNovedad = function(idx) {
    const texto = prompt('Ingresá la novedad para este ítem:');
    if (texto && texto.trim()) {
        if (!state.controlEjecucionActual.items[idx].novedades) state.controlEjecucionActual.items[idx].novedades = [];
        state.controlEjecucionActual.items[idx].novedades.push(texto.trim());
        controlGuardarEnLocal();
        controlActualizarNovedadesVisualmente(idx);
    }
}

window.controlEliminarNovedad = function(idx, ni) {
    state.controlEjecucionActual.items[idx].novedades.splice(ni, 1);
    controlGuardarEnLocal();
    controlActualizarNovedadesVisualmente(idx);
}

function controlActualizarNovedadesVisualmente(idx) {
    const container = document.getElementById('novedades-list-' + idx);
    if (container) {
        const novedades = state.controlEjecucionActual.items[idx].novedades || [];
        container.innerHTML = novedades.map((n, ni) => `
            <span class="badge bg-warning text-dark d-flex align-items-center gap-1" style="font-size:.8rem;">
                <i class="bi bi-exclamation-triangle-fill"></i> ${n}
                <button type="button" class="btn-close btn-close-sm ms-1" style="font-size:.6rem;" onclick="controlEliminarNovedad(${idx},${ni})"></button>
            </span>`).join('');
    }
}

window.controlCancelarEjecucion = function() {
    window.showConfirm('¿Cancelar el control en curso? Los datos no serán guardados.', ok => {
        if (ok) { state.controlEjecucionActual = null; controlMostrarLista(); }
    });
}

window.controlCompletarEjecucion = async function() {
    const items = state.controlEjecucionActual.items;
    const sinCantidad = items.filter(it => it.tipo === 'articulo' && it.cantidadContada === '');
    if (sinCantidad.length > 0) {
        window.showAlert(`Hay ${sinCantidad.length} artículo(s) sin cantidad contada. Completalos antes de finalizar.`);
        return;
    }

    try {
        const articulosAActualizar = items.filter(it => it.tipo === 'articulo' && it.articuloId);
        if (articulosAActualizar.length > 0) {
            const batch = writeBatch(state.db);
            articulosAActualizar.forEach(it => {
                const artRef = doc(getUserCollection('inventario'), it.articuloId);
                batch.update(artRef, { cantidadActual: Number(it.cantidadContada) });
            });
            await batch.commit();
        }
    } catch (e) {
        console.error(e);
        window.showAlert('Error al actualizar el inventario. Revisá la conexión.');
        return;
    }

    const ejecucion = {
        formularioId: state.controlEjecucionActual.formularioId,
        formularioNombre: state.controlEjecucionActual.nombre,
        fecha: new Date(),
        items: items.map(it => ({
            tipo: it.tipo,
            tarea: it.tarea || '',
            articuloId: it.articuloId || '',
            articuloNombre: it.articuloNombre || '',
            completado: it.completado || false,
            cantidadContada: it.cantidadContada !== undefined ? Number(it.cantidadContada) : null,
            stockMinimo: it.stockMinimo ?? null,
            cantidadAnterior: it.cantidadActual ?? null,
            novedades: it.novedades || []
        }))
    };
    try {
        await addDoc(getUserCollection('controlHistorial'), ejecucion);
    } catch (e) {
        console.error(e);
        window.showAlert('Control completado pero hubo un error guardando el historial.');
    }

    controlLimpiarLocal();
    controlMostrarResumen(ejecucion);
}

function controlMostrarResumen(ejecucion) {
    controlOcultarVistas();
    document.getElementById('control-vista-resumen').style.display = 'block';
    const fecha = ejecucion.fecha instanceof Date ? ejecucion.fecha : ejecucion.fecha.toDate?.() || new Date(ejecucion.fecha);
    document.getElementById('control-resumen-titulo').textContent = `Resumen: ${ejecucion.formularioNombre}`;
    document.getElementById('control-resumen-fecha').textContent = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const items = ejecucion.items;
    const checklist = items.filter(it => it.tipo === 'checklist');
    const articulos = items.filter(it => it.tipo === 'articulo');
    const pendientes = checklist.filter(it => !it.completado);
    const bajoStock = articulos.filter(it => it.cantidadContada !== null && Number(it.cantidadContada) < Number(it.stockMinimo));
    const conNovedades = items.filter(it => (it.novedades || []).length > 0);

    let html = '';

    html += `<div class="row mb-3">
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:var(--accent-color)">${items.length}</div>
                <small>Ítems totales</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#dc3545">${pendientes.length}</div>
                <small>Tareas pendientes</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#fd7e14">${bajoStock.length}</div>
                <small>Bajo stock mínimo</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#ffc107">${conNovedades.length}</div>
                <small>Con novedades</small>
            </div>
        </div>
    </div>`;

    if (pendientes.length > 0) {
        html += `<h6 class="mt-3"><i class="bi bi-x-circle-fill text-danger me-2"></i>Tareas sin completar</h6><ul class="list-group mb-3">`;
        pendientes.forEach(it => {
            const novs = (it.novedades || []);
            html += `<li class="list-group-item" style="background:var(--card-bg);color:var(--text-color);border-color:var(--input-border)">
                <i class="bi bi-square text-danger me-2"></i>${it.tarea}
                ${novs.length ? `<div class="mt-1">${novs.map(n=>`<span class="badge bg-warning text-dark me-1"><i class="bi bi-exclamation-triangle-fill"></i> ${n}</span>`).join('')}</div>` : ''}
            </li>`;
        });
        html += '</ul>';
    }

    if (bajoStock.length > 0) {
        html += `<h6 class="mt-3"><i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>Artículos bajo stock mínimo</h6>
        <div class="table-responsive mb-3"><table class="table table-sm mb-0">
            <thead><tr><th>Artículo</th><th class="text-end">Contado</th><th class="text-end">Mínimo</th><th class="text-end">Anterior</th></tr></thead><tbody>`;
        bajoStock.forEach(it => {
            html += `<tr class="table-danger">
                <td>${it.articuloNombre}</td>
                <td class="text-end">${it.cantidadContada}</td>
                <td class="text-end">${it.stockMinimo}</td>
                <td class="text-end">${it.cantidadAnterior ?? '—'}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    }

    if (conNovedades.length > 0) {
        html += `<h6 class="mt-3"><i class="bi bi-exclamation-circle-fill text-warning me-2"></i>Novedades registradas</h6><ul class="list-group mb-3">`;
        conNovedades.forEach(it => {
            const label = it.tipo === 'checklist' ? it.tarea : it.articuloNombre;
            html += `<li class="list-group-item" style="background:var(--card-bg);color:var(--text-color);border-color:var(--input-border)">
                <strong>${label}</strong>
                <div class="mt-1">${(it.novedades||[]).map(n=>`<span class="badge bg-warning text-dark me-1"><i class="bi bi-exclamation-triangle-fill"></i> ${n}</span>`).join('')}</div>
            </li>`;
        });
        html += '</ul>';
    }

    if (pendientes.length === 0 && bajoStock.length === 0 && conNovedades.length === 0) {
        html += `<div class="text-center py-4">
            <i class="bi bi-check-circle-fill text-success fs-1"></i>
            <p class="mt-2">¡Todo en orden! El control fue completado sin novedades.</p>
        </div>`;
    }

    document.getElementById('control-resumen-body').innerHTML = html;
    state.controlEjecucionActual = null;
}

// ---- Historial ----
window.controlVerHistorial = function(formularioId) {
    const f = state.controlFormulariosData.find(x => x.id === formularioId);
    document.getElementById('control-historial-titulo').textContent = `Historial: ${f?.nombre || ''}`;
    const ejecuciones = state.controlHistorialData
        .filter(h => h.formularioId === formularioId)
        .sort((a, b) => (b.fecha?.toDate?.() || new Date(b.fecha)) - (a.fecha?.toDate?.() || new Date(a.fecha)));

    const tbody = document.getElementById('control-historial-tbody');
    const footer = document.getElementById('control-historial-footer');
    tbody.innerHTML = '';
    if (ejecuciones.length === 0) {
        footer.textContent = 'Sin ejecuciones registradas.';
    } else {
        footer.textContent = `${ejecuciones.length} ejecución(es) registrada(s).`;
        ejecuciones.forEach(e => {
            const fecha = (e.fecha?.toDate?.() || new Date(e.fecha)).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            const items = e.items || [];
            const total = items.length;
            const pendientes = items.filter(it => it.tipo === 'checklist' && !it.completado).length;
            const ok = items.filter(it => it.tipo === 'checklist' && it.completado).length + items.filter(it => it.tipo === 'articulo' && it.cantidadContada !== null && Number(it.cantidadContada) >= Number(it.stockMinimo)).length;
            const bajoStock = items.filter(it => it.tipo === 'articulo' && it.cantidadContada !== null && Number(it.cantidadContada) < Number(it.stockMinimo)).length;
            const novedades = items.reduce((acc, it) => acc + (it.novedades||[]).length, 0);
            tbody.innerHTML += `<tr>
                <td>${fecha}</td>
                <td class="text-center">${total}</td>
                <td class="text-center text-success">${ok}</td>
                <td class="text-center ${pendientes > 0 ? 'text-danger' : ''}">${pendientes}</td>
                <td class="text-center ${bajoStock > 0 ? 'text-warning' : ''}">${bajoStock}</td>
                <td class="text-center ${novedades > 0 ? 'text-warning' : ''}">${novedades}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-info me-1" onclick="controlVerResumenHistorial('${e.id}')"><i class="bi bi-eye-fill"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="controlEliminarEjecucion('${e.id}')"><i class="bi bi-trash-fill"></i></button>
                </td>
            </tr>`;
        });
    }
    controlOcultarVistas();
    document.getElementById('control-vista-historial').style.display = 'block';
}

window.controlVerResumenHistorial = function(ejecucionId) {
    const e = state.controlHistorialData.find(x => x.id === ejecucionId);
    if (!e) return;
    controlMostrarResumen(e);
}

window.controlEliminarEjecucion = function(ejecucionId) {
    window.showConfirm('¿Eliminar esta ejecución del historial?', async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('controlHistorial'), ejecucionId));
            const e = state.controlHistorialData.find(x => x.id === ejecucionId);
            if (e) window.controlVerHistorial(e.formularioId);
        } catch (err) { window.showAlert('Error al eliminar la ejecución.'); }
    });
}

// Expose state on window so inline HTML handlers referencing window.state work
window.state = state;
