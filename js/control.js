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
            const parsed = JSON.parse(guardado);
            if (parsed && parsed.formularioId && Array.isArray(parsed.items) && parsed.items.length > 0) {
                state.controlEjecucionActual = parsed;
                if (state.currentActivePanel === 'control') {
                    controlOcultarVistas();
                    document.getElementById('control-vista-ejecucion').style.display = 'block';
                    document.getElementById('control-ejecucion-titulo').textContent = state.controlEjecucionActual.nombre;
                    document.getElementById('control-ejecucion-fecha').textContent = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                    controlRenderizarEjecucion();
                }
            } else {
                state.controlEjecucionActual = null;
                controlLimpiarLocal();
            }
        } catch (e) {
            console.error('Error restaurando control:', e);
            state.controlEjecucionActual = null;
            controlLimpiarLocal();
        }
    } else {
        state.controlEjecucionActual = null;
    }
}

function controlLimpiarLocal() {
    localStorage.removeItem('controlEjecucionActual');
}

// ---- Firestore listeners ----
export function setupControlListeners() {
    onSnapshot(getUserCollection('controlFormularios'), snap => {
        state.controlFormulariosData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentActivePanel === 'control' && !state.controlEjecucionActual) controlMostrarLista();
    });
    // controlHistorial listener moved to app.js so it can trigger dashboard re-render
}

// ---- Navegación entre vistas ----
function controlOcultarVistas() {
    ['lista','editor','ejecucion','resumen','historial'].forEach(v => {
        const el = document.getElementById('control-vista-' + v);
        if (el) el.style.display = 'none';
    });
}

export function controlMostrarLista() {
    controlOcultarVistas();
    document.getElementById('control-vista-lista').style.display = 'block';
    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'block';
    const tabForms = document.getElementById('tab-btn-control-formularios');
    const tabHist = document.getElementById('tab-btn-control-historial');
    if (tabForms) tabForms.classList.add('active');
    if (tabHist) tabHist.classList.remove('active');
    const btnNuevo = document.getElementById('control-btn-nuevo');
    if (btnNuevo) btnNuevo.style.display = 'inline-block';
    controlRenderizarTablaFormularios();
}

window.controlMostrarLista = controlMostrarLista;

window.controlVerHistorialGlobal = function() {
    window.controlVerHistorial(null);
};

window.controlVolverLista = function() {
    state.controlEditorId = null;
    state.controlEditorItems = [];
    state.controlEjecucionActual = null;
    controlLimpiarLocal();
    controlMostrarLista();
};

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
                    <button class="btn btn-sm btn-outline-info me-1" title="Historial y Gráficos" onclick="controlVerHistorial('${f.id}')"><i class="bi bi-graph-up"></i></button>
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
    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'none';
    controlRenderizarEditorItems();
};

window.controlEditarFormulario = function(id) {
    const f = state.controlFormulariosData.find(x => x.id === id);
    if (!f) return;
    state.controlEditorId = id;
    state.controlEditorItems = JSON.parse(JSON.stringify(f.items || []));
    document.getElementById('control-editor-nombre').value = f.nombre;
    document.getElementById('control-editor-badge').textContent = 'Editando';
    controlOcultarVistas();
    document.getElementById('control-vista-editor').style.display = 'block';
    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'none';
    controlRenderizarEditorItems();
};

// Lee los valores actuales del DOM y los sincroniza en state.controlEditorItems
function controlSincronizarDesdeDOM() {
    const container = document.getElementById('control-editor-items');
    if (!container) return;
    state.controlEditorItems.forEach((item, idx) => {
        if (item.tipo === 'checklist') {
            const input = container.querySelector(`[data-item-idx="${idx}"]`);
            if (input) item.tarea = input.value;
        } else if (item.tipo === 'articulo') {
            const select = container.querySelector(`[data-item-idx="${idx}"]`);
            if (select) item.articuloId = select.value;
        } else if (item.tipo === 'registro') {
            const inputEtiqueta = container.querySelector(`[data-item-etiqueta="${idx}"]`);
            const inputUnidad = container.querySelector(`[data-item-unidad="${idx}"]`);
            const selectTipoDato = container.querySelector(`[data-item-tipodato="${idx}"]`);
            const selectTipoGrafico = container.querySelector(`[data-item-tipografico="${idx}"]`);
            if (inputEtiqueta) item.etiqueta = inputEtiqueta.value;
            if (inputUnidad) item.unidad = inputUnidad.value;
            if (selectTipoDato) item.tipoDato = selectTipoDato.value;
            if (selectTipoGrafico) item.tipoGrafico = selectTipoGrafico.value;
        }
    });
}

window.controlAgregarItemChecklist = function() {
    controlSincronizarDesdeDOM();
    state.controlEditorItems.push({ tipo: 'checklist', tarea: '', id: Date.now() + Math.random() });
    controlRenderizarEditorItems();
};

window.controlAgregarItemRegistro = function() {
    controlSincronizarDesdeDOM();
    state.controlEditorItems.push({
        tipo: 'registro',
        etiqueta: '',
        unidad: '',
        tipoDato: 'numero',
        tipoGrafico: 'lineas',
        id: Date.now() + Math.random()
    });
    controlRenderizarEditorItems();
};

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
        } else if (item.tipo === 'articulo') {
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
        } else if (item.tipo === 'registro') {
            div.className = 'card p-2 control-item-registro';
            div.innerHTML = `
                <div class="d-flex flex-column gap-2">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="cursor-grab me-1" style="font-size:0.9rem; opacity:0.5;" title="Arrastrá para reordenar">&#8942;&#8942;</span>
                        <span class="badge bg-warning text-dark flex-shrink-0"><i class="bi bi-speedometer2"></i> Registro / Métrica</span>
                        <input type="text" class="form-control form-control-sm flex-grow-1"
                            placeholder="Nombre del registro (ej: kg/h Máquina 1, Temperatura...)"
                            value="${(item.etiqueta || '').replace(/"/g, '&quot;')}"
                            data-item-etiqueta="${idx}"
                            oninput="window.state.controlEditorItems[${idx}].etiqueta = this.value">
                        <input type="text" class="form-control form-control-sm" style="width: 120px;"
                            placeholder="Unidad (kg/h, °C)"
                            value="${(item.unidad || '').replace(/"/g, '&quot;')}"
                            data-item-unidad="${idx}"
                            oninput="window.state.controlEditorItems[${idx}].unidad = this.value">
                        <button class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="controlEliminarItemEditor(${idx})"><i class="bi bi-x"></i></button>
                    </div>
                    <div class="d-flex align-items-center gap-3 ps-4 flex-wrap small">
                        <div class="d-flex align-items-center gap-2">
                            <label class="text-muted mb-0">Tipo de dato:</label>
                            <select class="form-select form-select-sm" style="width: auto;" data-item-tipodato="${idx}"
                                onchange="window.state.controlEditorItems[${idx}].tipoDato = this.value">
                                <option value="numero" ${item.tipoDato === 'numero' ? 'selected' : ''}>Numérico (Decimal / Entero)</option>
                                <option value="texto" ${item.tipoDato === 'texto' ? 'selected' : ''}>Texto libre</option>
                            </select>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <label class="text-muted mb-0">Tipo de gráfico:</label>
                            <select class="form-select form-select-sm" style="width: auto;" data-item-tipografico="${idx}"
                                onchange="window.state.controlEditorItems[${idx}].tipoGrafico = this.value">
                                <option value="lineas" ${item.tipoGrafico === 'lineas' ? 'selected' : ''}>📈 Gráfico de Líneas</option>
                                <option value="barras" ${item.tipoGrafico === 'barras' ? 'selected' : ''}>📊 Gráfico de Barras</option>
                                <option value="ninguno" ${item.tipoGrafico === 'ninguno' ? 'selected' : ''}>📁 Sin gráfico (Solo guardar como dato)</option>
                            </select>
                        </div>
                    </div>
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
        if (it.tipo === 'registro' && !it.etiqueta?.trim()) {
            window.showAlert(`El registro #${i+1} debe tener un nombre (ej: kg/h de una máquina).`); return;
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
            } else if (it.tipo === 'registro') {
                return {
                    ...it,
                    valorIngresado: '',
                    novedades: []
                };
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
    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'none';
    controlRenderizarEjecucion();
};

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
        } else if (item.tipo === 'registro') {
            const isNumero = (item.tipoDato || 'numero') === 'numero';
            const chartBadge = item.tipoGrafico === 'lineas'
                ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-2"><i class="bi bi-graph-up me-1"></i>Líneas</span>'
                : item.tipoGrafico === 'barras'
                ? '<span class="badge bg-info-subtle text-info border border-info-subtle ms-2"><i class="bi bi-bar-chart-fill me-1"></i>Barras</span>'
                : '<span class="badge bg-secondary-subtle text-secondary border ms-2"><i class="bi bi-file-earmark-text me-1"></i>Solo dato</span>';

            card.innerHTML = `
                <div>
                    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                        <span class="badge bg-warning text-dark"><i class="bi bi-speedometer2"></i> Registro / Métrica</span>
                        <strong>${(item.etiqueta || 'Métrica').replace(/</g, '&lt;')}</strong>
                        ${item.unidad ? `<span class="badge bg-dark-subtle text-light border ms-1">[${(item.unidad).replace(/</g, '&lt;')}]</span>` : ''}
                        ${chartBadge}
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <label class="form-label mb-0 small text-muted">Valor registrado:</label>
                        ${isNumero ? `
                            <div class="input-group input-group-sm" style="max-width: 250px;">
                                <input type="number" step="any" class="form-control"
                                    placeholder="0.00"
                                    value="${item.valorIngresado !== undefined && item.valorIngresado !== null ? item.valorIngresado : ''}"
                                    oninput="controlActualizarValorRegistro(${idx}, this.value)">
                                ${item.unidad ? `<span class="input-group-text">${(item.unidad).replace(/</g, '&lt;')}</span>` : ''}
                            </div>
                        ` : `
                            <div class="input-group input-group-sm flex-grow-1" style="max-width: 420px;">
                                <input type="text" class="form-control"
                                    placeholder="Ingresá observación o dato..."
                                    value="${(item.valorIngresado ?? '').replace(/"/g, '&quot;')}"
                                    oninput="controlActualizarValorRegistro(${idx}, this.value)">
                            </div>
                        `}
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
                        <label class="form-label mb-0 small text-muted">Cantidad contada:</label>
                        <input type="number" class="form-control form-control-sm" style="width:110px;" min="0"
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

window.controlActualizarValorRegistro = function(idx, valor) {
    if (!state.controlEjecucionActual || !state.controlEjecucionActual.items[idx]) return;
    state.controlEjecucionActual.items[idx].valorIngresado = valor;
    controlGuardarEnLocal();
};

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
};

window.controlActualizarCheckStyle = function(idx) {
    const input = document.getElementById('chk-label-' + idx);
    if (input) {
        const done = state.controlEjecucionActual.items[idx].completado;
        input.style.textDecoration = done ? 'line-through' : '';
        input.style.opacity = done ? '.6' : '1';
    }
    controlGuardarEnLocal();
};

window.controlAgregarNovedad = function(idx) {
    const texto = prompt('Ingresá la novedad para este ítem:');
    if (texto && texto.trim()) {
        if (!state.controlEjecucionActual.items[idx].novedades) state.controlEjecucionActual.items[idx].novedades = [];
        state.controlEjecucionActual.items[idx].novedades.push(texto.trim());
        controlGuardarEnLocal();
        controlActualizarNovedadesVisualmente(idx);
    }
};

window.controlEliminarNovedad = function(idx, ni) {
    state.controlEjecucionActual.items[idx].novedades.splice(ni, 1);
    controlGuardarEnLocal();
    controlActualizarNovedadesVisualmente(idx);
};

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
        if (ok) {
            state.controlEjecucionActual = null;
            controlLimpiarLocal();
            controlMostrarLista();
        }
    });
};

window.controlCompletarEjecucion = async function() {
    const items = state.controlEjecucionActual.items;
    const sinCantidad = items.filter(it => it.tipo === 'articulo' && (it.cantidadContada === '' || it.cantidadContada === null || it.cantidadContada === undefined));
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
        items: items.map(it => {
            const base = {
                tipo: it.tipo,
                novedades: it.novedades || []
            };
            if (it.tipo === 'checklist') {
                base.tarea = it.tarea || '';
                base.completado = it.completado || false;
            } else if (it.tipo === 'articulo') {
                base.articuloId = it.articuloId || '';
                base.articuloNombre = it.articuloNombre || '';
                base.cantidadContada = (it.cantidadContada !== undefined && it.cantidadContada !== '') ? Number(it.cantidadContada) : null;
                base.stockMinimo = it.stockMinimo ?? null;
                base.cantidadAnterior = it.cantidadActual ?? null;
            } else if (it.tipo === 'registro') {
                base.etiqueta = it.etiqueta || '';
                base.unidad = it.unidad || '';
                base.tipoDato = it.tipoDato || 'numero';
                base.tipoGrafico = it.tipoGrafico || 'lineas';
                if (base.tipoDato === 'numero') {
                    base.valor = (it.valorIngresado !== '' && it.valorIngresado !== null && !isNaN(Number(it.valorIngresado)))
                        ? Number(it.valorIngresado)
                        : null;
                } else {
                    base.valor = it.valorIngresado || '';
                }
            }
            return base;
        })
    };

    try {
        await addDoc(getUserCollection('controlHistorial'), ejecucion);
        if (typeof window.showNotification === 'function') {
            window.showNotification('Control completado y registrado exitosamente.', 'success');
        }
    } catch (e) {
        console.error(e);
        window.showAlert('Control completado pero hubo un error guardando el historial.');
    }

    controlLimpiarLocal();
    controlMostrarResumen(ejecucion);
};

function controlMostrarResumen(ejecucion) {
    controlOcultarVistas();
    document.getElementById('control-vista-resumen').style.display = 'block';
    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'none';

    const fecha = ejecucion.fecha instanceof Date ? ejecucion.fecha : ejecucion.fecha.toDate?.() || new Date(ejecucion.fecha);
    document.getElementById('control-resumen-titulo').textContent = `Resumen: ${ejecucion.formularioNombre}`;
    document.getElementById('control-resumen-fecha').textContent = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const items = ejecucion.items;
    const checklist = items.filter(it => it.tipo === 'checklist');
    const articulos = items.filter(it => it.tipo === 'articulo');
    const registros = items.filter(it => it.tipo === 'registro');
    const pendientes = checklist.filter(it => !it.completado);
    const bajoStock = articulos.filter(it => it.cantidadContada !== null && Number(it.cantidadContada) < Number(it.stockMinimo));
    const conNovedades = items.filter(it => (it.novedades || []).length > 0);

    let html = '';

    html += `<div class="row mb-3">
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:var(--accent-color)">${items.length}</div>
                <small class="text-muted">Ítems totales</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#dc3545">${pendientes.length}</div>
                <small class="text-muted">Tareas pendientes</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#fd7e14">${bajoStock.length}</div>
                <small class="text-muted">Bajo stock mínimo</small>
            </div>
        </div>
        <div class="col-6 col-md-3 mb-2">
            <div class="card text-center p-2" style="background:var(--card-bg)">
                <div style="font-size:1.8rem;font-weight:bold;color:#0dcaf0">${registros.length}</div>
                <small class="text-muted">Registros / Métricas</small>
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

    if (registros.length > 0) {
        html += `<h6 class="mt-3"><i class="bi bi-speedometer2 text-info me-2"></i>Métricas y Registros Guardados</h6>
        <div class="table-responsive mb-3"><table class="table table-sm mb-0">
            <thead><tr><th>Métrica / Registro</th><th>Valor Registrado</th><th>Destino</th><th>Novedades</th></tr></thead><tbody>`;
        registros.forEach(it => {
            const chartBadge = it.tipoGrafico === 'lineas'
                ? '<span class="badge bg-primary-subtle text-primary border"><i class="bi bi-graph-up me-1"></i>Líneas</span>'
                : it.tipoGrafico === 'barras'
                ? '<span class="badge bg-info-subtle text-info border"><i class="bi bi-bar-chart-fill me-1"></i>Barras</span>'
                : '<span class="badge bg-secondary-subtle text-secondary border"><i class="bi bi-file-earmark-text me-1"></i>Solo dato</span>';

            const valorDisplay = it.valor !== null && it.valor !== undefined && it.valor !== ''
                ? `<strong>${it.valor}</strong> ${it.unidad ? `<span class="badge bg-dark-subtle text-light border ms-1">${it.unidad}</span>` : ''}`
                : '<span class="text-muted">—</span>';

            const novs = it.novedades || [];
            html += `<tr>
                <td><strong>${it.etiqueta || 'Métrica'}</strong></td>
                <td>${valorDisplay}</td>
                <td>${chartBadge}</td>
                <td>${novs.length ? novs.map(n => `<span class="badge bg-warning text-dark me-1"><i class="bi bi-exclamation-triangle-fill"></i> ${n}</span>`).join('') : '<span class="text-muted">—</span>'}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    }

    if (conNovedades.length > 0) {
        html += `<h6 class="mt-3"><i class="bi bi-exclamation-circle-fill text-warning me-2"></i>Novedades registradas</h6><ul class="list-group mb-3">`;
        conNovedades.forEach(it => {
            const label = it.tipo === 'checklist' ? it.tarea : (it.tipo === 'registro' ? it.etiqueta : it.articuloNombre);
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

// ---- Historial y Gráficos ----
window.controlVerHistorial = function(formularioId) {
    const f = formularioId ? state.controlFormulariosData.find(x => x.id === formularioId) : null;
    document.getElementById('control-historial-titulo').textContent = f ? `Historial y Métricas: ${f.nombre}` : 'Historial Global y Métricas';

    const topBar = document.getElementById('control-top-bar');
    if (topBar) topBar.style.display = 'block';
    const tabForms = document.getElementById('tab-btn-control-formularios');
    const tabHist = document.getElementById('tab-btn-control-historial');
    if (tabForms) tabForms.classList.remove('active');
    if (tabHist) tabHist.classList.add('active');
    const btnNuevo = document.getElementById('control-btn-nuevo');
    if (btnNuevo) btnNuevo.style.display = 'none';

    const ejecuciones = (formularioId
        ? state.controlHistorialData.filter(h => h.formularioId === formularioId)
        : state.controlHistorialData)
        .sort((a, b) => (b.fecha?.toDate?.() || new Date(b.fecha)) - (a.fecha?.toDate?.() || new Date(a.fecha)));

    // 1. Renderizar Gráficos interactivos D3
    controlRenderizarGraficosHistorial(ejecuciones, f);

    // 2. Renderizar Tabla de ejecuciones
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
                <td><span class="badge bg-secondary-subtle text-light border">${e.formularioNombre || '—'}</span></td>
                <td class="text-center">${total}</td>
                <td class="text-center text-success">${ok}</td>
                <td class="text-center ${pendientes > 0 ? 'text-danger' : ''}">${pendientes}</td>
                <td class="text-center ${bajoStock > 0 ? 'text-warning' : ''}">${bajoStock}</td>
                <td class="text-center ${novedades > 0 ? 'text-warning' : ''}">${novedades}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-info me-1" title="Ver Resumen" onclick="controlVerResumenHistorial('${e.id}')"><i class="bi bi-eye-fill"></i></button>
                    <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="controlEliminarEjecucion('${e.id}', '${formularioId || ''}')"><i class="bi bi-trash-fill"></i></button>
                </td>
            </tr>`;
        });
    }
    controlOcultarVistas();
    document.getElementById('control-vista-historial').style.display = 'block';
};

function controlRenderizarGraficosHistorial(ejecuciones, formularioActual) {
    const container = document.getElementById('control-historial-graficos-container');
    if (!container) return;
    container.innerHTML = '';

    // Cronológico ascendente para gráficos
    const ejecucionesAsc = [...ejecuciones].sort((a, b) => 
        (a.fecha?.toDate?.() || new Date(a.fecha)) - (b.fecha?.toDate?.() || new Date(b.fecha))
    );

    // Mapear métricas
    const metricasMap = new Map();
    let contadorSoloDato = 0;

    // Si hay formulario actual, inicializar con su configuración de items
    if (formularioActual && Array.isArray(formularioActual.items)) {
        formularioActual.items.forEach(it => {
            if (it.tipo === 'registro') {
                const etiqueta = (it.etiqueta || '').trim();
                if (!etiqueta) return;
                if (it.tipoGrafico === 'ninguno' || it.tipoDato === 'texto') {
                    contadorSoloDato++;
                } else {
                    metricasMap.set(etiqueta, {
                        etiqueta,
                        unidad: it.unidad || '',
                        tipoGrafico: it.tipoGrafico || 'lineas',
                        tipoDato: it.tipoDato || 'numero',
                        puntos: []
                    });
                }
            }
        });
    }

    // Recolectar datos desde las ejecuciones
    ejecucionesAsc.forEach(e => {
        const fecha = e.fecha?.toDate?.() || new Date(e.fecha);
        (e.items || []).forEach(it => {
            if (it.tipo === 'registro') {
                const etiqueta = (it.etiqueta || '').trim();
                if (!etiqueta) return;
                const tipoGrafico = it.tipoGrafico || 'lineas';
                const tipoDato = it.tipoDato || 'numero';

                // Si está configurado como 'ninguno' o tipo texto, no graficar
                if (tipoGrafico === 'ninguno' || tipoDato === 'texto') {
                    contadorSoloDato++;
                    return;
                }

                if (!metricasMap.has(etiqueta)) {
                    metricasMap.set(etiqueta, {
                        etiqueta,
                        unidad: it.unidad || '',
                        tipoGrafico,
                        tipoDato,
                        puntos: []
                    });
                }
                const m = metricasMap.get(etiqueta);
                if (it.unidad) m.unidad = it.unidad;
                if (it.tipoGrafico) m.tipoGrafico = it.tipoGrafico;

                const val = Number(it.valor);
                if (it.valor !== null && it.valor !== '' && !isNaN(val)) {
                    m.puntos.push({
                        fecha,
                        valor: val,
                        formularioNombre: e.formularioNombre || '',
                        novedades: it.novedades || []
                    });
                }
            }
        });
    });

    if (metricasMap.size === 0) {
        if (contadorSoloDato > 0) {
            container.innerHTML = `
                <div class="card p-3 mb-3 border-secondary-subtle" style="background: var(--card-bg);">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-info-circle fs-3 text-info"></i>
                        <div>
                            <div class="fw-bold">Métricas configuradas como "Solo dato"</div>
                            <div class="small text-muted">Este formulario contiene ${contadorSoloDato} registro(s) configurado(s) para guardarse únicamente como dato o texto. Sus valores quedan almacenados en cada ejecución y se pueden consultar en los resúmenes.</div>
                        </div>
                    </div>
                </div>`;
        }
        return;
    }

    // Crear tarjetas de gráficos
    let html = '<div class="row g-3">';
    const metricasArray = Array.from(metricasMap.values());

    metricasArray.forEach((m, idx) => {
        const chartId = `control-grafico-${idx}-${m.etiqueta.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const colClass = metricasArray.length === 1 ? 'col-12' : 'col-12 col-xl-6';

        let statsHtml = '';
        if (m.puntos.length > 0) {
            const vals = m.puntos.map(p => p.valor);
            const ult = vals[vals.length - 1];
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const prom = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
            statsHtml = `
                <div class="d-flex align-items-center gap-2 small flex-wrap">
                    <span class="badge bg-dark-subtle text-light border">Último: <strong class="text-info">${ult} ${m.unidad}</strong></span>
                    <span class="d-none d-sm-inline text-muted">| Mín: <strong>${min}</strong> | Máx: <strong>${max}</strong> | Prom: <strong>${prom}</strong></span>
                </div>`;
        }

        html += `
            <div class="${colClass}">
                <div class="card h-100 control-chart-card mb-0">
                    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background: rgba(255,255,255,0.02);">
                        <div class="d-flex align-items-center gap-2">
                            ${m.tipoGrafico === 'lineas'
                                ? '<i class="bi bi-graph-up text-primary fs-5"></i>'
                                : '<i class="bi bi-bar-chart-fill text-info fs-5"></i>'}
                            <h6 class="mb-0 fw-bold">${m.etiqueta}</h6>
                            ${m.unidad ? `<span class="badge bg-secondary-subtle text-light border">${m.unidad}</span>` : ''}
                            <span class="badge ${m.tipoGrafico === 'lineas' ? 'bg-primary-subtle text-primary border-primary-subtle' : 'bg-info-subtle text-info border-info-subtle'} border">
                                ${m.tipoGrafico === 'lineas' ? 'Líneas' : 'Barras'}
                            </span>
                        </div>
                        ${statsHtml}
                    </div>
                    <div class="card-body p-2 position-relative">
                        ${m.puntos.length === 0 ? `
                            <div class="text-center text-muted py-5">
                                <i class="bi bi-speedometer2 fs-2 d-block mb-1 opacity-50"></i>
                                Sin mediciones registradas aún para esta métrica.
                            </div>
                        ` : `
                            <div id="${chartId}" class="control-chart-svg"></div>
                        `}
                    </div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    // Renderizar D3 para cada métrica que tenga puntos
    setTimeout(() => {
        metricasArray.forEach((m, idx) => {
            if (m.puntos.length > 0) {
                const chartId = `control-grafico-${idx}-${m.etiqueta.replace(/[^a-zA-Z0-9]/g, '_')}`;
                controlDibujarGraficoD3(chartId, m);
            }
        });
    }, 50);
}

function controlDibujarGraficoD3(containerId, m) {
    const container = document.getElementById(containerId);
    if (!container || !window.d3) return;
    d3.select(container).selectAll('*').remove();

    const rect = container.getBoundingClientRect();
    const width = Math.max(280, rect.width || container.clientWidth || 550);
    const height = 260;
    const margin = { top: 22, right: 28, bottom: 48, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('width', '100%')
        .attr('height', '100%')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Escala Y
    const yMin = d3.min(m.puntos, d => d.valor);
    const yMax = d3.max(m.puntos, d => d.valor);
    const yDiff = yMax - yMin;
    const yPad = yDiff > 0 ? yDiff * 0.18 : (yMax * 0.15 || 5);
    const yDomainMin = Math.max(0, yMin - yPad);
    const yDomainMax = yMax + yPad;

    const y = d3.scaleLinear()
        .domain([yDomainMin, yDomainMax])
        .range([innerHeight, 0]);

    // Líneas de grilla horizontales
    svg.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(''))
        .selectAll('line')
        .style('stroke', 'rgba(255, 255, 255, 0.08)')
        .style('stroke-dasharray', '3,3');
    svg.select('.grid .domain').remove();

    // Eje Y
    const yAxisG = svg.append('g')
        .attr('class', 'y axis')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}`));
    yAxisG.selectAll('text')
        .style('font-size', '11px')
        .style('fill', 'var(--text-color, #a0aec0)');
    yAxisG.select('.domain').style('stroke', 'rgba(255, 255, 255, 0.15)');

    // Tooltip
    let tooltip = d3.select('body').select('.control-d3-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'control-d3-tooltip');
    }

    const nPuntos = m.puntos.length;

    if (m.tipoGrafico === 'lineas') {
        const x = d3.scalePoint()
            .domain(m.puntos.map((_, i) => i))
            .range([nPuntos === 1 ? innerWidth / 2 : 12, nPuntos === 1 ? innerWidth / 2 : innerWidth - 12]);

        const gradId = `grad-line-${Math.random().toString(36).substring(2, 9)}`;
        const defs = svg.append('defs');
        const linearGrad = defs.append('linearGradient')
            .attr('id', gradId)
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');
        linearGrad.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.45);
        linearGrad.append('stop').attr('offset', '100%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.0);

        if (nPuntos > 1) {
            const area = d3.area()
                .x((d, i) => x(i))
                .y0(innerHeight)
                .y1(d => y(d.valor))
                .curve(d3.curveMonotoneX);

            svg.append('path')
                .datum(m.puntos)
                .attr('fill', `url(#${gradId})`)
                .attr('d', area);

            const line = d3.line()
                .x((d, i) => x(i))
                .y(d => y(d.valor))
                .curve(d3.curveMonotoneX);

            svg.append('path')
                .datum(m.puntos)
                .attr('fill', 'none')
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 2.8)
                .attr('d', line);
        }

        // Puntos y eventos
        svg.selectAll('.dot')
            .data(m.puntos)
            .enter()
            .append('circle')
            .attr('class', 'dot')
            .attr('cx', (d, i) => x(i))
            .attr('cy', d => y(d.valor))
            .attr('r', 5)
            .attr('fill', '#3b82f6')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this).attr('r', 7.5).attr('fill', '#60a5fa');
                tooltip.transition().duration(120).style('opacity', 1);
                const dt = d.fecha;
                const fStr = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                tooltip.html(`
                    <div class="fw-bold mb-1">${m.etiqueta}</div>
                    <div style="font-size: 1.15rem; color: #60a5fa;"><strong>${d.valor} ${m.unidad}</strong></div>
                    <div class="text-muted small mt-1"><i class="bi bi-clock me-1"></i>${fStr}</div>
                    ${d.formularioNombre ? `<div class="small text-muted"><i class="bi bi-file-earmark-text me-1"></i>${d.formularioNombre}</div>` : ''}
                    ${d.novedades?.length ? `<div class="mt-1"><span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> ${d.novedades.join(', ')}</span></div>` : ''}
                `);
            })
            .on('mousemove', function(event) {
                tooltip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 40) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this).attr('r', 5).attr('fill', '#3b82f6');
                tooltip.transition().duration(200).style('opacity', 0);
            });

        // Eje X
        const xAxis = d3.axisBottom(x)
            .tickFormat(i => {
                const p = m.puntos[i];
                if (!p) return '';
                const dt = p.fecha;
                return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth()+1).toString().padStart(2, '0')} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
            });

        const xAxisG = svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis);

        xAxisG.selectAll('text')
            .attr('transform', 'rotate(-25)')
            .style('text-anchor', 'end')
            .style('font-size', '10px')
            .style('fill', 'var(--text-color, #a0aec0)');
        xAxisG.select('.domain').style('stroke', 'rgba(255, 255, 255, 0.15)');

    } else {
        // Barras
        const xBand = d3.scaleBand()
            .domain(m.puntos.map((_, i) => i))
            .range([0, innerWidth])
            .padding(0.35);

        const gradBarId = `grad-bar-${Math.random().toString(36).substring(2, 9)}`;
        const defsBar = svg.append('defs');
        const linearGradBar = defsBar.append('linearGradient')
            .attr('id', gradBarId)
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');
        linearGradBar.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.95);
        linearGradBar.append('stop').attr('offset', '100%').attr('stop-color', '#0284c7').attr('stop-opacity', 0.65);

        svg.selectAll('.bar')
            .data(m.puntos)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', (d, i) => xBand(i))
            .attr('y', d => y(d.valor))
            .attr('width', xBand.bandwidth())
            .attr('height', d => Math.max(3, innerHeight - y(d.valor)))
            .attr('fill', `url(#${gradBarId})`)
            .attr('rx', 4)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this).style('opacity', 0.8);
                tooltip.transition().duration(120).style('opacity', 1);
                const dt = d.fecha;
                const fStr = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                tooltip.html(`
                    <div class="fw-bold mb-1">${m.etiqueta}</div>
                    <div style="font-size: 1.15rem; color: #38bdf8;"><strong>${d.valor} ${m.unidad}</strong></div>
                    <div class="text-muted small mt-1"><i class="bi bi-clock me-1"></i>${fStr}</div>
                    ${d.formularioNombre ? `<div class="small text-muted"><i class="bi bi-file-earmark-text me-1"></i>${d.formularioNombre}</div>` : ''}
                    ${d.novedades?.length ? `<div class="mt-1"><span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> ${d.novedades.join(', ')}</span></div>` : ''}
                `);
            })
            .on('mousemove', function(event) {
                tooltip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 40) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this).style('opacity', 1);
                tooltip.transition().duration(200).style('opacity', 0);
            });

        // Etiquetas arriba de las barras si son pocas
        if (nPuntos <= 12) {
            svg.selectAll('.bar-label')
                .data(m.puntos)
                .enter()
                .append('text')
                .attr('class', 'bar-label')
                .attr('x', (d, i) => xBand(i) + xBand.bandwidth() / 2)
                .attr('y', d => y(d.valor) - 6)
                .attr('text-anchor', 'middle')
                .style('font-size', '10px')
                .style('fill', '#ffffff')
                .style('font-weight', '600')
                .text(d => `${d.valor}`);
        }

        // Eje X
        const xAxis = d3.axisBottom(xBand)
            .tickFormat(i => {
                const p = m.puntos[i];
                if (!p) return '';
                const dt = p.fecha;
                return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth()+1).toString().padStart(2, '0')} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
            });

        const xAxisG = svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis);

        xAxisG.selectAll('text')
            .attr('transform', 'rotate(-25)')
            .style('text-anchor', 'end')
            .style('font-size', '10px')
            .style('fill', 'var(--text-color, #a0aec0)');
        xAxisG.select('.domain').style('stroke', 'rgba(255, 255, 255, 0.15)');
    }
}

window.controlVerResumenHistorial = function(ejecucionId) {
    const e = state.controlHistorialData.find(x => x.id === ejecucionId);
    if (!e) return;
    controlMostrarResumen(e);
};

window.controlEliminarEjecucion = function(ejecucionId, returnFormId) {
    window.showConfirm('¿Eliminar esta ejecución del historial?', async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('controlHistorial'), ejecucionId));
            if (typeof window.showNotification === 'function') {
                window.showNotification('Ejecución eliminada del historial.', 'info');
            }
            window.controlVerHistorial(returnFormId || null);
        } catch (err) {
            console.error(err);
            window.showAlert('Error al eliminar la ejecución.');
        }
    });
};

// Expose state on window so inline HTML handlers referencing window.state work
window.state = state;
