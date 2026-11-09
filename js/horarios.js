import { state } from './state.js';
import { getUserCollection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from './firebase.js';
import { showNotification, showAlert, showConfirm, parseCantidad, formatCantidad } from './ui.js';

// ---- Reglas del módulo ----
const CONFIG_HORARIO_POR_DEFECTO = {
    turnos: [
        { nombre: 'Mañana', entrada: '06:00' },
        { nombre: 'Tarde', entrada: '14:00' },
        { nombre: 'Noche', entrada: '22:00' }
    ],
    jornadaHs: 8,
    toleranciaMin: 0,
    // Hasta cuántos minutos antes de la entrada se considera que alguien ya viene para ese turno.
    anticipoMin: 60,
    // Las horas extra se proponen en bloques de esta cantidad de minutos (siempre se pueden corregir a mano).
    extrasFraccionMin: 30
};

const ESTADOS = {
    sin_registrar: { label: 'Sin cargar', css: 'pendiente', icon: 'bi-hourglass-split' },
    presente: { label: 'A horario', css: 'presente', icon: 'bi-check-circle-fill' },
    tolerancia: { label: 'En tolerancia', css: 'tolerancia', icon: 'bi-hourglass-bottom' },
    tarde: { label: 'Llegada tarde', css: 'tarde', icon: 'bi-clock-fill' },
    falta_injustificada: { label: 'Falta injustificada', css: 'injustificada', icon: 'bi-x-circle-fill' },
    falta_justificada: { label: 'Falta justificada', css: 'justificada', icon: 'bi-file-earmark-check-fill' },
    franco: { label: 'Franco / Licencia', css: 'franco', icon: 'bi-cup-hot-fill' }
};

const AUSENCIAS = ['falta_injustificada', 'falta_justificada', 'franco'];
const esAusencia = estado => AUSENCIAS.includes(estado);
const esPresencia = estado => ['presente', 'tolerancia', 'tarde'].includes(estado);

// Cada tarjeta del reporte filtra el detalle día por día con una de estas reglas.
const FILTROS_REPORTE = {
    trabajados: { label: 'Días trabajados', coincide: r => esPresencia(r.estado) },
    extras: { label: 'Con horas extras', coincide: r => parseCantidad(r.horasExtras) > 0 },
    tolerancia: { label: 'En tolerancia', coincide: r => r.estado === 'tolerancia' },
    tarde: { label: 'Llegadas tarde', coincide: r => r.estado === 'tarde' },
    falta_injustificada: { label: 'Faltas injustificadas', coincide: r => r.estado === 'falta_injustificada' },
    falta_justificada: { label: 'Faltas justificadas', coincide: r => r.estado === 'falta_justificada' },
    franco: { label: 'Francos / Licencias', coincide: r => r.estado === 'franco' }
};

// ---- Estado interno de la vista ----
const operariosRegistrando = new Set();
let filtroReporte = '';
let configHorario = CONFIG_HORARIO_POR_DEFECTO;
let configCargada = false;
let personalCargado = false;
let asistenciaCargada = false;
let guardandoOperario = false;
let fechaJornadaMostrada = '';
let asistenciaNueva = null;
let mesCalendario = '';
let mesesCalendario = [];

// ---- Helpers de fecha y hora ----
const modulo = (valor, base) => ((valor % base) + base) % base;

function fechaISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parsearFecha(fechaStr) {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
}

function sumarDias(fechaStr, dias) {
    const date = parsearFecha(fechaStr);
    date.setDate(date.getDate() + dias);
    return fechaISO(date);
}

export function formatearFechaTexto(fechaStr) {
    if (!fechaStr) return '';
    const date = parsearFecha(fechaStr);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[date.getDay()]}, ${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

export function formatearFechaCorta(fechaStr) {
    if (!fechaStr) return '';
    const date = parsearFecha(fechaStr);
    const diasCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    return `${diasCortos[date.getDay()]} ${dia}/${mes}/${date.getFullYear()}`;
}

function aMinutos(hhmm) {
    if (!hhmm) return NaN;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function desdeMinutos(min) {
    const total = modulo(min, 1440);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatearMinutos(min) {
    const total = Math.round(min);
    if (total < 60) return `${total} min`;
    const resto = total % 60;
    return resto ? `${Math.floor(total / 60)} h ${resto} min` : `${Math.floor(total / 60)} h`;
}

// ---- Turnos ----
// Cada turno "es dueño" del tiempo que va desde un rato antes de su entrada hasta ese mismo rato antes del turno siguiente.
// Antes de la hora de entrada es a horario; dentro de la tolerancia, en tolerancia; después ya es tarde.
function turnoParaHora(hhmm) {
    const ahora = aMinutos(hhmm);
    if (isNaN(ahora)) return null;

    const { turnos, anticipoMin, toleranciaMin, jornadaHs } = configHorario;
    const ordenados = turnos
        .map(turno => ({ ...turno, inicioVentana: modulo(aMinutos(turno.entrada) - anticipoMin, 1440) }))
        .sort((a, b) => a.inicioVentana - b.inicioVentana);
    const turno = ordenados.filter(t => t.inicioVentana <= ahora).pop() || ordenados[ordenados.length - 1];
    const demora = modulo(ahora - turno.inicioVentana, 1440) - anticipoMin;

    return {
        ...turno,
        salida: desdeMinutos(aMinutos(turno.entrada) + jornadaHs * 60),
        estado: demora <= 0 ? 'presente' : demora <= toleranciaMin ? 'tolerancia' : 'tarde',
        minutosTarde: demora > toleranciaMin ? demora : 0,
        minutosTolerancia: demora > 0 && demora <= toleranciaMin ? demora : 0,
        // Pasada la medianoche, el turno noche sigue perteneciendo a la jornada del día anterior.
        esDelDiaAnterior: ahora < turno.inicioVentana
    };
}

function jornadaActual() {
    const ahora = new Date();
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    const turno = turnoParaHora(hora);
    return { hora, turno, fecha: turno.esDelDiaAnterior ? sumarDias(fechaISO(ahora), -1) : fechaISO(ahora) };
}

// Horas normales y extras propuestas. Llegar antes de la entrada no suma horas.
function calcularHoras(entrada, salida) {
    const turno = turnoParaHora(entrada);
    const fin = aMinutos(salida);
    if (!turno || isNaN(fin)) return { normales: 0, extras: 0 };
    const trabajados = modulo(fin - (aMinutos(turno.entrada) + turno.minutosTarde), 1440);
    const { jornadaHs, extrasFraccionMin } = configHorario;
    const excedente = Math.max(0, trabajados - jornadaHs * 60);
    return {
        normales: Number(Math.min(trabajados / 60, jornadaHs).toFixed(2)),
        extras: (Math.floor(excedente / extrasFraccionMin) * extrasFraccionMin) / 60
    };
}

const turnoDeRegistro = reg => reg.turno || (reg.entrada ? turnoParaHora(reg.entrada)?.nombre : '') || '';

// ---- Helpers generales ----
function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

function iniciales(nombre) {
    const partes = String(nombre || '?').trim().split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const textoBusqueda = valor => String(valor || '').toLowerCase();

function ordenarPorNombre(lista) {
    return [...lista].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

// ---- Inicialización y Listeners Firestore ----
export function setupHorariosListeners() {
    onSnapshot(getUserCollection('personal'), snapshot => {
        state.operariosData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        personalCargado = true;
        if (state.currentActivePanel === 'horarios') renderizarHorariosPanel();
    }, error => {
        console.error('Error fetching personal:', error);
        showAlert('No se pudo cargar el personal. Recargá la página.', 'danger');
    });

    onSnapshot(getUserCollection('asistencia'), snapshot => {
        state.asistenciaData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        asistenciaCargada = true;
        if (state.currentActivePanel === 'horarios') renderizarHorariosPanel();
    }, error => {
        console.error('Error fetching asistencia:', error);
        showAlert('No se pudo cargar la asistencia. Recargá la página.', 'danger');
    });

    onSnapshot(getUserCollection('configuracion'), snapshot => {
        const guardada = snapshot.docs.find(d => d.id === 'controlHorario')?.data();
        configHorario = { ...CONFIG_HORARIO_POR_DEFECTO, ...guardada };
        configCargada = true;
        renderizarConfigHorario();
        if (state.currentActivePanel === 'horarios') renderizarHorariosPanel();
    }, error => {
        console.error('Error fetching configuracion:', error);
        configCargada = true;
        showAlert('No se pudo cargar la configuración de Control Horario. Se usan los valores por defecto.', 'danger');
        if (state.currentActivePanel === 'horarios') renderizarHorariosPanel();
    });

    setInterval(actualizarRelojPlanilla, 1000);
}

export function renderizarHorariosPanel() {
    switchHorariosTab(state.activeHorariosTab || 'diario');
}

export function switchHorariosTab(tabName, render = true) {
    state.activeHorariosTab = tabName;

    ['diario', 'reportes', 'personal'].forEach(nombre => {
        document.getElementById(`tab-btn-horarios-${nombre}`)?.classList.toggle('active', nombre === tabName);
        const vista = document.getElementById(`horarios-vista-${nombre}`);
        if (vista) vista.style.display = nombre === tabName ? 'block' : 'none';
    });

    const visiblesPorTab = {
        'horarios-btn-agregar-operario': ['diario', 'personal'],
        'horarios-btn-exportar-csv': ['reportes'],
        'horarios-btn-imprimir-reporte': ['reportes']
    };
    Object.entries(visiblesPorTab).forEach(([id, tabs]) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = tabs.includes(tabName) ? 'inline-flex' : 'none';
    });

    if (!render) return;
    if (tabName === 'diario') renderizarPlanillaDiaria();
    else if (tabName === 'reportes') renderizarReportesOperario();
    else if (tabName === 'personal') renderizarTablaPersonal();
}
window.switchHorariosTab = switchHorariosTab;

// ══════════════════════════════════════════════════════════════════════════════
// VISTA 1: PLANILLA DIARIA (solo quienes todavía no se registraron en la jornada)
// ══════════════════════════════════════════════════════════════════════════════

function escribirTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function describirLlegada(turno) {
    if (turno.estado === 'tarde') return `tarde (+${formatearMinutos(turno.minutosTarde)})`;
    if (turno.estado === 'tolerancia') return `en tolerancia (+${formatearMinutos(turno.minutosTolerancia)})`;
    return 'a horario';
}

function pintarRelojPlanilla(jornada) {
    escribirTexto('horarios-reloj', jornada.hora);
    escribirTexto('horarios-fecha-titulo', formatearFechaTexto(jornada.fecha));
    escribirTexto('horarios-turno-actual', `Turno ${jornada.turno.nombre}: ${jornada.turno.entrada} a ${jornada.turno.salida}`);

    const llegada = document.getElementById('horarios-llegada-estado');
    if (!llegada) return;
    llegada.dataset.estado = jornada.turno.estado;
    llegada.textContent = `Si llega ahora: ${describirLlegada(jornada.turno)}`;
}

function actualizarRelojPlanilla() {
    if (state.currentActivePanel !== 'horarios' || state.activeHorariosTab !== 'diario') return;
    const jornada = jornadaActual();
    pintarRelojPlanilla(jornada);
    if (jornada.fecha !== fechaJornadaMostrada) renderizarPlanillaDiaria();
}

function coincideBusqueda(op) {
    const termino = textoBusqueda(state.elements.buscador?.value);
    if (!termino) return true;
    if (state.currentSearchFilter === 'puestoOperario') return textoBusqueda(op.puesto).includes(termino);
    return textoBusqueda(op.nombre).includes(termino) ||
        textoBusqueda(op.puesto).includes(termino) ||
        textoBusqueda(op.dni).includes(termino);
}

export function renderizarPlanillaDiaria() {
    const jornada = jornadaActual();
    fechaJornadaMostrada = jornada.fecha;
    pintarRelojPlanilla(jornada);

    const lista = document.getElementById('horarios-diario-lista');
    if (!lista) return;

    if (!personalCargado || !asistenciaCargada || !configCargada) {
        lista.innerHTML = '<div class="hor-vacio"><span class="spinner-border spinner-border-sm me-2"></span>Cargando personal…</div>';
        return;
    }

    const conRegistro = new Set(state.asistenciaData.filter(a => a.fecha === jornada.fecha).map(r => r.operarioId));
    const activos = state.operariosData.filter(op => op.activo !== false);
    const sinRegistro = activos.filter(op => !conRegistro.has(op.id));
    const visibles = ordenarPorNombre(sinRegistro.filter(coincideBusqueda));

    actualizarProgresoDia(activos.length, sinRegistro.length);

    if (visibles.length === 0) {
        lista.innerHTML = mensajeListaVacia(activos.length, sinRegistro.length);
        return;
    }
    sincronizarTarjetas(lista, visibles);
}

function mensajeListaVacia(totalActivos, totalPendientes) {
    if (totalActivos === 0) {
        return `<div class="hor-vacio"><i class="bi bi-people"></i>Todavía no hay operarios cargados.
            <button class="btn btn-sm btn-primary" onclick="horariosAbrirModalOperario()"><i class="bi bi-person-plus-fill me-1"></i>Agregar primer operario</button></div>`;
    }
    if (totalPendientes === 0) {
        return '<div class="hor-vacio"><i class="bi bi-check2-circle"></i>Ya están registrados todos los operarios de esta jornada.</div>';
    }
    return '<div class="hor-vacio"><i class="bi bi-search"></i>Ningún operario pendiente coincide con la búsqueda.</div>';
}

// Agrega y quita solo las tarjetas necesarias, para no perder lo que se esté escribiendo en otra.
function sincronizarTarjetas(lista, operarios) {
    const ids = new Set(operarios.map(op => op.id));
    [...lista.children].forEach(el => {
        if (!ids.has(el.dataset.operarioId)) el.remove();
    });

    let anterior = null;
    operarios.forEach(op => {
        const firma = JSON.stringify([op.nombre, op.puesto]);
        let tarjeta = lista.querySelector(`[data-operario-id="${op.id}"]`);
        if (tarjeta && tarjeta.dataset.firma !== firma && !tarjeta.contains(document.activeElement)) {
            tarjeta.remove();
            tarjeta = null;
        }
        if (!tarjeta) tarjeta = crearTarjetaOperario(op, firma);

        const lugar = anterior ? anterior.nextElementSibling : lista.firstElementChild;
        if (tarjeta !== lugar) lista.insertBefore(tarjeta, lugar);
        anterior = tarjeta;
    });
}

function crearTarjetaOperario(op, firma) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'hor-tarjeta';
    tarjeta.dataset.operarioId = op.id;
    tarjeta.dataset.firma = firma;

    const botonAusencia = (estado, label) => `
        <button type="button" class="hor-ausencia hor-ausencia-${ESTADOS[estado].css}" title="${ESTADOS[estado].label}"
            onclick="horariosRegistrarAusencia('${op.id}', '${estado}')">${label}</button>`;

    tarjeta.innerHTML = `
        <div class="hor-operario">
            <span class="hor-avatar">${escapeHtml(iniciales(op.nombre))}</span>
            <div class="hor-operario-datos">
                <strong>${escapeHtml(op.nombre)}</strong>
                ${op.puesto ? `<small>${escapeHtml(op.puesto)}</small>` : ''}
            </div>
        </div>
        <button type="button" class="btn btn-primary hor-btn-entrada" onclick="horariosRegistrarEntrada('${op.id}')">
            <i class="bi bi-box-arrow-in-right me-1"></i>Registrar entrada
        </button>
        <div class="hor-ausencias">
            ${botonAusencia('falta_injustificada', 'Falta injust.')}
            ${botonAusencia('falta_justificada', 'Falta justif.')}
            ${botonAusencia('franco', 'Franco')}
        </div>
        <input type="text" class="form-control form-control-sm" data-campo="obs" aria-label="Motivo u observación de ${escapeHtml(op.nombre)}" placeholder="Motivo u observación (opcional)">`;
    return tarjeta;
}

function actualizarProgresoDia(totalActivos, totalPendientes) {
    const cargados = totalActivos - totalPendientes;
    const barra = document.getElementById('horarios-progreso-barra');
    if (barra) barra.style.width = totalActivos ? `${(cargados / totalActivos) * 100}%` : '0%';
    escribirTexto('horarios-progreso-texto', totalActivos ? `${cargados} de ${totalActivos} registrados` : 'Sin operarios');
}

function fijarTarjetaOcupada(operarioId, ocupada) {
    document.querySelector(`.hor-tarjeta[data-operario-id="${operarioId}"]`)
        ?.querySelectorAll('button').forEach(btn => { btn.disabled = ocupada; });
}

// Guarda el registro de la jornada; al llegar el snapshot el operario sale solo de la lista.
async function registrarEnJornada(operarioId, armarDatos) {
    const op = state.operariosData.find(o => o.id === operarioId);
    if (!op || operariosRegistrando.has(operarioId)) return;

    const jornada = jornadaActual();
    if (state.asistenciaData.some(a => a.operarioId === operarioId && a.fecha === jornada.fecha)) {
        showAlert(`${escapeHtml(op.nombre)} ya está registrado en esta jornada.`, 'warning');
        renderizarPlanillaDiaria();
        return;
    }

    const tarjeta = document.querySelector(`.hor-tarjeta[data-operario-id="${operarioId}"]`);
    const observaciones = tarjeta?.querySelector('[data-campo="obs"]')?.value.trim() || '';
    const { datos, mensaje, tipo } = armarDatos(jornada);
    const docId = `${jornada.fecha}_${operarioId}`;

    operariosRegistrando.add(operarioId);
    fijarTarjetaOcupada(operarioId, true);
    try {
        await setDoc(doc(getUserCollection('asistencia'), docId), {
            operarioId,
            operarioNombre: op.nombre,
            operarioPuesto: op.puesto || '',
            fecha: jornada.fecha,
            ...datos,
            observaciones,
            motivo: datos.estado.includes('falta') ? observaciones : '',
            actualizadoEn: new Date()
        });
        showNotification(`<strong>${escapeHtml(op.nombre)}</strong>: ${mensaje}
            <button type="button" class="hor-deshacer" onclick="horariosDeshacerRegistro('${docId}', this)">Deshacer</button>`, tipo, 8000);
    } catch (e) {
        console.error('Error registrando asistencia:', e);
        fijarTarjetaOcupada(operarioId, false);
        showAlert(`No se pudo registrar a ${escapeHtml(op.nombre)}. Revisá la conexión y volvé a intentar.`, 'danger');
    } finally {
        operariosRegistrando.delete(operarioId);
    }
}

window.horariosRegistrarEntrada = function(operarioId) {
    registrarEnJornada(operarioId, ({ hora, turno }) => {
        const tarde = turno.minutosTarde;
        const descripcion = describirLlegada(turno);
        return {
            datos: {
                estado: turno.estado,
                turno: turno.nombre,
                entrada: hora,
                salida: turno.salida,
                horasTrabajadas: Number(Math.max(0, configHorario.jornadaHs - tarde / 60).toFixed(2)),
                minutosTarde: tarde,
                minutosTolerancia: turno.minutosTolerancia,
                horasExtras: 0
            },
            mensaje: `entrada ${hora}, turno ${turno.nombre}, ${turno.estado === 'tarde' ? `<strong>${descripcion}</strong>` : descripcion}.`,
            tipo: { presente: 'success', tolerancia: 'info', tarde: 'warning' }[turno.estado]
        };
    });
};

window.horariosRegistrarAusencia = function(operarioId, estado) {
    registrarEnJornada(operarioId, () => ({
        datos: { estado, turno: '', entrada: '', salida: '', horasTrabajadas: 0, minutosTarde: 0, horasExtras: 0 },
        mensaje: `${ESTADOS[estado].label.toLowerCase()}.`,
        tipo: 'info'
    }));
};

window.horariosDeshacerRegistro = async function(docId, boton) {
    boton.disabled = true;
    try {
        await deleteDoc(doc(getUserCollection('asistencia'), docId));
        const toast = boton.closest('.toast');
        if (toast) bootstrap.Toast.getOrCreateInstance(toast).hide();
    } catch (e) {
        console.error('Error deshaciendo registro:', e);
        boton.disabled = false;
        showAlert('No se pudo deshacer el registro.', 'danger');
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// VISTA 2: REPORTE POR OPERARIO
// ══════════════════════════════════════════════════════════════════════════════

// Incluye a operarios eliminados que dejaron historial, para que su reporte siga disponible.
function operariosParaReporte() {
    const conocidos = new Set(state.operariosData.map(op => op.id));
    const eliminados = new Map();
    state.asistenciaData.forEach(r => {
        if (r.operarioId && !conocidos.has(r.operarioId) && !eliminados.has(r.operarioId)) {
            eliminados.set(r.operarioId, { id: r.operarioId, nombre: r.operarioNombre || 'Operario eliminado', puesto: r.operarioPuesto || '', eliminado: true, activo: false });
        }
    });
    return ordenarPorNombre([...state.operariosData, ...eliminados.values()]);
}

export function renderizarReportesOperario() {
    const select = document.getElementById('horarios-reporte-operario-select');
    if (!select) return;

    const operarios = operariosParaReporte();
    if (!operarios.some(op => op.id === state.horariosReporteOperarioId)) {
        state.horariosReporteOperarioId = operarios[0]?.id || '';
    }

    select.innerHTML = operarios.length
        ? operarios.map(op => {
            const extra = op.eliminado ? ' (eliminado)' : op.activo === false ? ' (inactivo)' : '';
            return `<option value="${op.id}">${escapeHtml(op.nombre)}${op.puesto ? ` · ${escapeHtml(op.puesto)}` : ''}${extra}</option>`;
        }).join('')
        : '<option value="">No hay operarios cargados</option>';
    select.value = state.horariosReporteOperarioId;

    actualizarRangoFechasReporte();
    actualizarVistaReporteSeleccionado();
}

function actualizarRangoFechasReporte() {
    const preset = state.horariosReporteRango || 'mes_actual';
    const ahora = new Date();
    const hoy = fechaISO(ahora);
    let desde = '';
    let hasta = hoy;

    if (preset === 'mes_actual') {
        desde = fechaISO(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
        hasta = fechaISO(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));
    } else if (preset === 'mes_anterior') {
        desde = fechaISO(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));
        hasta = fechaISO(new Date(ahora.getFullYear(), ahora.getMonth(), 0));
    } else if (preset === 'ultimos_30') {
        desde = sumarDias(hoy, -30);
    } else if (preset === 'este_ano') {
        desde = `${ahora.getFullYear()}-01-01`;
        hasta = `${ahora.getFullYear()}-12-31`;
    } else if (preset === 'todo') {
        hasta = '';
    } else if (preset === 'personalizado') {
        desde = state.horariosReporteDesde || sumarDias(hoy, -30);
        hasta = state.horariosReporteHasta || hoy;
    }

    state.horariosReporteDesde = desde;
    state.horariosReporteHasta = hasta;

    const inputDesde = document.getElementById('horarios-reporte-desde');
    const inputHasta = document.getElementById('horarios-reporte-hasta');
    const selectRango = document.getElementById('horarios-reporte-rango-select');
    const contCustom = document.getElementById('horarios-reporte-fechas-custom');
    if (inputDesde) inputDesde.value = desde;
    if (inputHasta) inputHasta.value = hasta;
    if (selectRango) selectRango.value = preset;
    if (contCustom) contCustom.style.display = preset === 'personalizado' ? 'block' : 'none';
}

window.horariosCambiarPresetRangoReporte = function(preset) {
    state.horariosReporteRango = preset;
    actualizarRangoFechasReporte();
    actualizarVistaReporteSeleccionado();
};

window.horariosCambiarOperarioReporte = function(operarioId) {
    state.horariosReporteOperarioId = operarioId;
    actualizarVistaReporteSeleccionado();
};

window.horariosMoverOperarioReporte = function(delta) {
    const operarios = operariosParaReporte();
    if (operarios.length === 0) return;
    const actual = operarios.findIndex(op => op.id === state.horariosReporteOperarioId);
    state.horariosReporteOperarioId = operarios[(actual + delta + operarios.length) % operarios.length].id;
    const select = document.getElementById('horarios-reporte-operario-select');
    if (select) select.value = state.horariosReporteOperarioId;
    actualizarVistaReporteSeleccionado();
};

window.horariosCambiarFechasCustom = function() {
    state.horariosReporteDesde = document.getElementById('horarios-reporte-desde')?.value || '';
    state.horariosReporteHasta = document.getElementById('horarios-reporte-hasta')?.value || '';
    actualizarVistaReporteSeleccionado();
};

window.horariosFiltrarReporte = function(filtro) {
    filtroReporte = filtroReporte === filtro ? '' : filtro;
    actualizarVistaReporteSeleccionado();
};

function registrosDelOperario(operarioId, desde, hasta) {
    return state.asistenciaData.filter(a => a.operarioId === operarioId && (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta));
}

function calcularResumen(registros) {
    const r = { presentes: 0, tolerancias: 0, tardes: 0, minutosTarde: 0, justificadas: 0, injustificadas: 0, francos: 0, horasNormales: 0, horasExtras: 0 };
    registros.forEach(reg => {
        if (reg.estado === 'presente') r.presentes++;
        else if (reg.estado === 'tolerancia') r.tolerancias++;
        else if (reg.estado === 'tarde') {
            r.tardes++;
            r.minutosTarde += parseCantidad(reg.minutosTarde);
        } else if (reg.estado === 'falta_justificada') r.justificadas++;
        else if (reg.estado === 'falta_injustificada') r.injustificadas++;
        else if (reg.estado === 'franco') r.francos++;
        r.horasNormales += parseCantidad(reg.horasTrabajadas);
        r.horasExtras += parseCantidad(reg.horasExtras);
    });
    r.trabajados = r.presentes + r.tolerancias + r.tardes;
    const laborables = r.trabajados + r.justificadas + r.injustificadas;
    r.presentismo = laborables > 0 ? (r.trabajados / laborables) * 100 : null;
    return r;
}

function actualizarVistaReporteSeleccionado() {
    const opId = state.horariosReporteOperarioId;
    const op = operariosParaReporte().find(o => o.id === opId);

    document.getElementById('horarios-reporte-vacio').style.display = op ? 'none' : 'block';
    document.getElementById('horarios-reporte-contenido').style.display = op ? 'block' : 'none';
    document.getElementById('horarios-reporte-perfil-card').style.display = op ? '' : 'none';
    document.getElementById('horarios-reporte-calendario-card').style.display = op ? '' : 'none';
    if (!op) return;

    const desde = state.horariosReporteDesde;
    const hasta = state.horariosReporteHasta;
    const registros = registrosDelOperario(opId, desde, hasta).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const resumen = calcularResumen(registros);

    renderizarPerfilReporte(op, resumen);
    renderizarKpisReporte(resumen);
    renderizarCalendario(registros, desde, hasta);
    renderizarHistorialReporte(registros);
}

function renderizarPerfilReporte(op, resumen) {
    const dato = (etiqueta, valor) => valor ? `<span><small>${etiqueta}</small>${escapeHtml(valor)}</span>` : '';
    document.getElementById('horarios-reporte-avatar').textContent = iniciales(op.nombre);
    document.getElementById('horarios-reporte-nombre-operario').textContent = op.nombre;
    document.getElementById('horarios-reporte-info-operario').innerHTML = [
        dato('Puesto', op.puesto),
        dato('DNI / Legajo', op.dni),
        dato('Teléfono', op.telefono),
        op.eliminado ? dato('Situación', 'Eliminado del personal') : op.activo === false ? dato('Situación', 'Inactivo') : ''
    ].join('');

    document.getElementById('rep-kpi-porcentaje-asistencia').textContent = resumen.presentismo === null ? '—' : `${formatCantidad(resumen.presentismo, 1)}%`;
    document.getElementById('rep-presentismo-barra').style.width = `${resumen.presentismo || 0}%`;
}

function renderizarKpisReporte(r) {
    escribirTexto('rep-kpi-dias-trabajados', r.trabajados);
    escribirTexto('rep-kpi-horas-normales', `${formatCantidad(r.horasNormales, 2)} hs`);
    escribirTexto('rep-kpi-horas-extras', `${formatCantidad(r.horasExtras, 2)} hs`);
    escribirTexto('rep-kpi-tolerancias', r.tolerancias);
    escribirTexto('rep-kpi-tardes', r.tardes);
    escribirTexto('rep-kpi-tardes-detalle', r.minutosTarde > 0 ? `${formatearMinutos(r.minutosTarde)} en total` : 'Sin demoras');
    escribirTexto('rep-kpi-justificadas', r.justificadas);
    escribirTexto('rep-kpi-injustificadas', r.injustificadas);
    escribirTexto('rep-kpi-francos', r.francos);
}

function renderizarCalendario(registros, desde, hasta) {
    const cont = document.getElementById('horarios-reporte-calendario');
    const titulo = document.getElementById('horarios-cal-titulo');
    const anterior = document.getElementById('horarios-cal-anterior');
    const siguiente = document.getElementById('horarios-cal-siguiente');
    if (!cont) return;

    const porFecha = new Map(registros.map(r => [r.fecha, r]));
    const fechas = [...porFecha.keys()].sort();
    const hoy = fechaISO(new Date());
    const inicio = desde || fechas[0];
    let fin = hasta || fechas[fechas.length - 1];
    if (fin && fin > hoy) fin = hoy;

    mesesCalendario = [];
    if (!inicio || !fin || inicio > fin) {
        titulo.textContent = 'Calendario';
        anterior.style.visibility = siguiente.style.visibility = 'hidden';
        cont.innerHTML = '<p class="hor-vacio mb-0">No hay días para mostrar en este período.</p>';
        return;
    }

    const cursor = new Date(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, 1);
    const ultimo = new Date(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, 1);
    while (cursor <= ultimo) {
        mesesCalendario.push(fechaISO(cursor).slice(0, 7));
        cursor.setMonth(cursor.getMonth() + 1);
    }
    if (!mesesCalendario.includes(mesCalendario)) mesCalendario = mesesCalendario[mesesCalendario.length - 1];

    const posicion = mesesCalendario.indexOf(mesCalendario);
    const variosMeses = mesesCalendario.length > 1;
    anterior.style.visibility = siguiente.style.visibility = variosMeses ? 'visible' : 'hidden';
    anterior.disabled = posicion === 0;
    siguiente.disabled = posicion === mesesCalendario.length - 1;

    const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const celdasSemana = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="hor-cal-sem">${d}</span>`).join('');

    const y = Number(mesCalendario.slice(0, 4));
    const m = Number(mesCalendario.slice(5, 7)) - 1;
    const totalDias = new Date(y, m + 1, 0).getDate();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    let celdas = '<span class="hor-cal-hueco"></span>'.repeat(offset);

    for (let dia = 1; dia <= totalDias; dia++) {
        const fecha = fechaISO(new Date(y, m, dia));
        const reg = porFecha.get(fecha);
        const enRango = (!desde || fecha >= desde) && (!hasta || fecha <= hasta) && fecha <= hoy;
        const css = reg ? ESTADOS[reg.estado]?.css || 'pendiente' : 'vacio';
        const descripcion = reg
            ? `${formatearFechaCorta(fecha)}: ${ESTADOS[reg.estado]?.label || reg.estado}. Clic para editar.`
            : `${formatearFechaCorta(fecha)}: sin cargar. Clic para cargar.`;
        const accion = reg ? `horariosAbrirModalEditarAsistencia('${reg.id}')` : `horariosAbrirModalNuevaAsistencia('${fecha}')`;
        celdas += enRango
            ? `<button type="button" class="hor-cal-dia hor-cal-${css}${fecha === hoy ? ' hor-cal-hoy' : ''}" title="${descripcion}" aria-label="${descripcion}" onclick="${accion}">${dia}</button>`
            : `<span class="hor-cal-dia hor-cal-fuera">${dia}</span>`;
    }

    titulo.textContent = `${nombresMes[m]} ${y}`;
    cont.innerHTML = `<div class="hor-cal-grid" style="--semanas:${Math.ceil((offset + totalDias) / 7)}">${celdasSemana}${celdas}</div>`;
}

window.horariosMoverMesCalendario = function(delta) {
    const destino = mesesCalendario[mesesCalendario.indexOf(mesCalendario) + delta];
    if (!destino) return;
    mesCalendario = destino;
    actualizarVistaReporteSeleccionado();
};

function renderizarHistorialReporte(registros) {
    const tbody = document.getElementById('horarios-reporte-tbody');
    const footer = document.getElementById('horarios-reporte-footer');
    const filtroActivo = document.getElementById('horarios-reporte-filtro-activo');
    if (!tbody) return;

    document.querySelectorAll('#horarios-vista-reportes .hor-kpi[data-filtro]').forEach(tarjeta => {
        tarjeta.setAttribute('aria-pressed', tarjeta.dataset.filtro === filtroReporte ? 'true' : 'false');
    });

    const filtro = FILTROS_REPORTE[filtroReporte];
    filtroActivo.style.display = filtro ? 'inline-flex' : 'none';
    filtroActivo.innerHTML = filtro ? `${filtro.label}<i class="bi bi-x-lg"></i>` : '';

    const visibles = filtro ? registros.filter(filtro.coincide) : registros;
    footer.textContent = `${visibles.length} de ${registros.length} día(s) cargados en el período.`;

    if (visibles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="hor-vacio">${registros.length ? 'No hay días con este filtro.' : 'Sin registros en el período seleccionado.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = visibles.map(r => {
        const info = ESTADOS[r.estado] || ESTADOS.sin_registrar;
        const extras = parseCantidad(r.horasExtras);
        const tarde = parseCantidad(r.minutosTarde);
        const tolerancia = parseCantidad(r.minutosTolerancia);
        return `
            <tr>
                <td data-label="Fecha"><strong>${formatearFechaCorta(r.fecha)}</strong></td>
                <td data-label="Turno">${escapeHtml(turnoDeRegistro(r)) || '—'}</td>
                <td data-label="Estado"><span class="badge badge-asistencia-${info.css}"><i class="bi ${info.icon} me-1"></i>${info.label}</span></td>
                <td data-label="Horario">${r.entrada && r.salida ? `${r.entrada} a ${r.salida}` : '—'}</td>
                <td data-label="Horas" class="text-end">${formatCantidad(r.horasTrabajadas, 2)} hs</td>
                <td data-label="Extras" class="text-end">${extras > 0 ? `<span class="badge badge-extra-horas">+${formatCantidad(extras, 2)} hs</span>` : '—'}</td>
                <td data-label="Tardanza" class="text-center">${tarde > 0 ? `<span class="badge badge-asistencia-tarde">${formatearMinutos(tarde)}</span>` : tolerancia > 0 ? `<span class="badge badge-asistencia-tolerancia">${formatearMinutos(tolerancia)}</span>` : '—'}</td>
                <td data-label="Observaciones"><small>${escapeHtml(r.observaciones || r.motivo || '—')}</small></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary py-0 px-2" title="Editar registro" aria-label="Editar registro del ${formatearFechaCorta(r.fecha)}" onclick="horariosAbrirModalEditarAsistencia('${r.id}')">
                        <i class="bi bi-pencil-fill" style="font-size:0.75rem;"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

window.horariosExportarCSV = function() {
    const op = operariosParaReporte().find(o => o.id === state.horariosReporteOperarioId);
    if (!op) {
        showAlert('Seleccioná un operario para exportar.', 'warning');
        return;
    }

    const desde = state.horariosReporteDesde;
    const hasta = state.horariosReporteHasta;
    const registros = registrosDelOperario(op.id, desde, hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (registros.length === 0) {
        showAlert('No hay registros para exportar en este período.', 'warning');
        return;
    }

    // Formato para Excel en español: separador ";" y coma decimal. El apóstrofe evita que un texto se tome como fórmula.
    const celda = valor => {
        const texto = String(valor ?? '');
        return `"${(/^[=+\-@]/.test(texto) ? `'${texto}` : texto).replace(/"/g, '""')}"`;
    };
    const numero = valor => formatCantidad(parseCantidad(valor), 2).replace('.', ',');
    const filas = [
        ['Fecha', 'Turno', 'Estado', 'Entrada', 'Salida', 'Horas normales', 'Horas extras', 'Minutos tarde', 'Observaciones'].map(celda).join(';'),
        ...registros.map(r => [
            celda(formatearFechaCorta(r.fecha)),
            celda(turnoDeRegistro(r)),
            celda(ESTADOS[r.estado]?.label || r.estado),
            celda(r.entrada),
            celda(r.salida),
            numero(r.horasTrabajadas),
            numero(r.horasExtras),
            numero(r.minutosTarde),
            celda(r.observaciones || r.motivo)
        ].join(';'))
    ];

    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `asistencia_${String(op.nombre).replace(/[^\p{L}\p{N}]+/gu, '_')}_${desde || 'inicio'}_a_${hasta || 'hoy'}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
};

window.horariosImprimirReporte = function() {
    const op = operariosParaReporte().find(o => o.id === state.horariosReporteOperarioId);
    if (!op) {
        showAlert('Seleccioná un operario para imprimir el reporte.', 'warning');
        return;
    }

    const desde = state.horariosReporteDesde;
    const hasta = state.horariosReporteHasta;
    const registros = registrosDelOperario(op.id, desde, hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const r = calcularResumen(registros);

    let cont = document.getElementById('horarios-print-container');
    if (!cont) {
        cont = document.createElement('div');
        cont.id = 'horarios-print-container';
        document.body.appendChild(cont);
    }

    const emision = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const kpi = (valor, etiqueta) => `<div class="hor-print-kpi"><strong>${valor}</strong><span>${etiqueta}</span></div>`;

    cont.innerHTML = `
        <header class="hor-print-header">
            <div>
                <h2>INDUPAK - LOGÍSTICA &amp; CONTROL</h2>
                <p>Reporte de asistencia, horarios y horas extras</p>
            </div>
            <small>Emitido: ${emision}</small>
        </header>
        <div class="hor-print-datos">
            <strong>Operario:</strong> ${escapeHtml(op.nombre)} &nbsp;|&nbsp;
            <strong>Puesto:</strong> ${escapeHtml(op.puesto || 'General')} &nbsp;|&nbsp;
            <strong>DNI/Legajo:</strong> ${escapeHtml(op.dni || '—')} &nbsp;|&nbsp;
            <strong>Período:</strong> ${desde ? formatearFechaCorta(desde) : 'Inicio'} al ${hasta ? formatearFechaCorta(hasta) : 'hoy'}
        </div>
        <div class="hor-print-kpis">
            ${kpi(r.trabajados, 'Días trabajados')}
            ${kpi(`${formatCantidad(r.horasNormales, 2)} hs`, 'Horas normales')}
            ${kpi(`${formatCantidad(r.horasExtras, 2)} hs`, 'Horas extras')}
            ${kpi(r.tolerancias, 'En tolerancia')}
            ${kpi(`${r.tardes} (${formatearMinutos(r.minutosTarde)})`, 'Llegadas tarde')}
            ${kpi(r.justificadas, 'Faltas justif.')}
            ${kpi(r.injustificadas, 'Faltas injust.')}
            ${kpi(r.francos, 'Francos / Lic.')}
            ${kpi(r.presentismo === null ? '—' : `${formatCantidad(r.presentismo, 1)}%`, 'Presentismo')}
        </div>
        <table class="hor-print-tabla">
            <thead><tr><th>Fecha</th><th>Turno</th><th>Estado</th><th>Horario</th><th>Hs norm.</th><th>Hs extras</th><th>Tarde</th><th>Observaciones / Motivo</th></tr></thead>
            <tbody>
                ${registros.map(reg => `<tr>
                    <td>${formatearFechaCorta(reg.fecha)}</td>
                    <td>${escapeHtml(turnoDeRegistro(reg)) || '—'}</td>
                    <td>${ESTADOS[reg.estado]?.label || escapeHtml(reg.estado)}</td>
                    <td>${reg.entrada && reg.salida ? `${reg.entrada} a ${reg.salida}` : '—'}</td>
                    <td>${formatCantidad(reg.horasTrabajadas, 2)}</td>
                    <td>${parseCantidad(reg.horasExtras) > 0 ? `+${formatCantidad(reg.horasExtras, 2)}` : '—'}</td>
                    <td>${parseCantidad(reg.minutosTarde) > 0 ? formatearMinutos(parseCantidad(reg.minutosTarde)) : '—'}</td>
                    <td>${escapeHtml(reg.observaciones || reg.motivo || '—')}</td>
                </tr>`).join('') || '<tr><td colspan="8">Sin registros en el período.</td></tr>'}
            </tbody>
        </table>
        <footer class="hor-print-firmas"><div>Firma del responsable</div><div>Firma del operario</div></footer>`;

    document.body.classList.add('imprimiendo-horarios');
    window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-horarios'), { once: true });
    window.print();
};

// ══════════════════════════════════════════════════════════════════════════════
// VISTA 3: GESTIÓN DE PERSONAL
// ══════════════════════════════════════════════════════════════════════════════

export function renderizarTablaPersonal() {
    const tbody = document.getElementById('horarios-personal-tbody');
    const footer = document.getElementById('horarios-personal-footer');
    if (!tbody) return;

    const filtro = textoBusqueda(document.getElementById('horarios-personal-search')?.value || state.elements.buscador?.value);
    const operarios = ordenarPorNombre(state.operariosData.filter(op =>
        textoBusqueda(op.nombre).includes(filtro) ||
        textoBusqueda(op.puesto).includes(filtro) ||
        textoBusqueda(op.dni).includes(filtro)
    ));

    if (operarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="hor-vacio">${filtro ? 'Ningún operario coincide con la búsqueda.' : 'Todavía no hay operarios cargados.'}</td></tr>`;
        if (footer) footer.textContent = '0 operarios.';
        return;
    }

    const activos = operarios.filter(op => op.activo !== false).length;
    if (footer) footer.textContent = `${operarios.length} operario(s), ${activos} activo(s).`;

    tbody.innerHTML = operarios.map(op => {
        const activo = op.activo !== false;
        const vacio = '<span class="text-muted">—</span>';
        return `
            <tr class="${activo ? '' : 'hor-inactivo'}">
                <td class="hor-celda-operario">
                    <div class="hor-operario">
                        <span class="hor-avatar">${escapeHtml(iniciales(op.nombre))}</span>
                        <div class="hor-operario-datos"><strong>${escapeHtml(op.nombre)}</strong>${op.telefono ? `<small>${escapeHtml(op.telefono)}</small>` : ''}</div>
                    </div>
                </td>
                <td data-label="DNI / Legajo">${escapeHtml(op.dni) || vacio}</td>
                <td data-label="Puesto">${escapeHtml(op.puesto) || vacio}</td>
                <td data-label="Estado" class="text-center">
                    <button type="button" class="hor-estado-operario ${activo ? 'activo' : ''}" title="Clic para cambiar" onclick="horariosToggleEstadoOperario('${op.id}')">${activo ? 'Activo' : 'Inactivo'}</button>
                </td>
                <td class="text-center text-nowrap hor-celda-acciones">
                    <button class="btn btn-sm btn-outline-info me-1 py-0 px-2" title="Ver reporte" aria-label="Ver reporte de ${escapeHtml(op.nombre)}" onclick="horariosVerReporteDeOperario('${op.id}')"><i class="bi bi-graph-up"></i></button>
                    <button class="btn btn-sm btn-outline-primary me-1 py-0 px-2" title="Editar" aria-label="Editar a ${escapeHtml(op.nombre)}" onclick="horariosAbrirModalOperario('${op.id}')"><i class="bi bi-pencil-fill"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-2" title="Eliminar" aria-label="Eliminar a ${escapeHtml(op.nombre)}" onclick="horariosEliminarOperario('${op.id}')"><i class="bi bi-trash-fill"></i></button>
                </td>
            </tr>`;
    }).join('');
}
window.renderizarTablaPersonal = renderizarTablaPersonal;

window.horariosVerReporteDeOperario = function(operarioId) {
    state.horariosReporteOperarioId = operarioId;
    switchHorariosTab('reportes');
};

window.horariosAbrirModalOperario = function(operarioId = null) {
    const modalEl = document.getElementById('modalOperario');
    const form = document.getElementById('formOperario');
    const titulo = document.getElementById('modalOperarioTitle');
    if (!modalEl || !form) return;

    form.reset();
    const op = operarioId ? state.operariosData.find(o => o.id === operarioId) : null;
    const asignar = (id, valor) => { document.getElementById(id).value = valor; };

    asignar('operario-id', op?.id || '');
    asignar('operario-nombre', op?.nombre || '');
    asignar('operario-dni', op?.dni || '');
    asignar('operario-telefono', op?.telefono || '');
    asignar('operario-puesto', op?.puesto || '');
    asignar('operario-notas', op?.notas || '');
    document.getElementById('operario-activo').checked = op?.activo !== false;
    document.getElementById('operario-btn-guardar-otro').style.display = op ? 'none' : 'inline-block';
    titulo.innerHTML = op
        ? '<i class="bi bi-person-fill me-2"></i>Editar operario'
        : '<i class="bi bi-person-plus-fill me-2"></i>Nuevo operario';

    const puestos = [...new Set(state.operariosData.map(o => o.puesto).filter(Boolean))].sort();
    document.getElementById('operario-puestos-list').innerHTML = puestos.map(p => `<option value="${escapeHtml(p)}"></option>`).join('');

    modalEl.addEventListener('shown.bs.modal', () => document.getElementById('operario-nombre').focus(), { once: true });
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.horariosGuardarOperario = async function(agregarOtro = false) {
    if (guardandoOperario) return;

    const leer = id => document.getElementById(id).value.trim();
    const id = leer('operario-id');
    const nombre = leer('operario-nombre');
    const dni = leer('operario-dni');

    if (!nombre) {
        showAlert('El nombre del operario es obligatorio.', 'warning');
        document.getElementById('operario-nombre').focus();
        return;
    }
    const repetido = dni && state.operariosData.find(o => o.id !== id && String(o.dni || '').trim() === dni);
    if (repetido) {
        showAlert(`El DNI o legajo ${escapeHtml(dni)} ya está cargado para ${escapeHtml(repetido.nombre)}.`, 'warning');
        return;
    }

    const datos = {
        nombre,
        dni,
        telefono: leer('operario-telefono'),
        puesto: leer('operario-puesto'),
        activo: document.getElementById('operario-activo').checked,
        notas: leer('operario-notas'),
        actualizadoEn: new Date()
    };

    guardandoOperario = true;
    try {
        if (id) {
            await updateDoc(doc(getUserCollection('personal'), id), datos);
            showNotification(`Operario ${escapeHtml(nombre)} actualizado.`, 'success');
        } else {
            await addDoc(getUserCollection('personal'), { ...datos, creadoEn: new Date() });
            showNotification(`Operario ${escapeHtml(nombre)} agregado.`, 'success');
        }

        if (agregarOtro) {
            ['operario-nombre', 'operario-dni', 'operario-telefono', 'operario-notas'].forEach(campo => {
                document.getElementById(campo).value = '';
            });
            document.getElementById('operario-nombre').focus();
        } else {
            bootstrap.Modal.getInstance(document.getElementById('modalOperario'))?.hide();
        }
    } catch (e) {
        console.error('Error guardando operario:', e);
        showAlert('No se pudo guardar el operario.', 'danger');
    } finally {
        guardandoOperario = false;
    }
};

window.horariosToggleEstadoOperario = async function(id) {
    const op = state.operariosData.find(o => o.id === id);
    if (!op) return;
    const nuevoEstado = op.activo === false;
    try {
        await updateDoc(doc(getUserCollection('personal'), id), { activo: nuevoEstado });
        showNotification(`${escapeHtml(op.nombre)} ahora está ${nuevoEstado ? 'activo' : 'inactivo'}.`, 'info', 2000);
    } catch (e) {
        console.error('Error cambiando estado:', e);
        showAlert('No se pudo cambiar el estado del operario.', 'danger');
    }
};

window.horariosEliminarOperario = function(id) {
    const op = state.operariosData.find(o => o.id === id);
    if (!op) return;

    showConfirm(`¿Eliminar a <strong>${escapeHtml(op.nombre)}</strong> del personal?<br><small>Su historial sigue disponible en el reporte. Si solo dejó de trabajar, conviene marcarlo como Inactivo.</small>`, async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('personal'), id));
            showNotification(`Operario ${escapeHtml(op.nombre)} eliminado.`, 'info');
        } catch (e) {
            console.error('Error eliminando operario:', e);
            showAlert('No se pudo eliminar el operario.', 'danger');
        }
    });
};

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CARGAR O CORREGIR UN DÍA DESDE EL REPORTE
// ══════════════════════════════════════════════════════════════════════════════

function recalcularHorasModal() {
    const entrada = document.getElementById('edit-asistencia-entrada').value;
    const salida = document.getElementById('edit-asistencia-salida').value;
    if (!entrada || !salida) return;
    const { normales, extras } = calcularHoras(entrada, salida);
    document.getElementById('edit-asistencia-horas').value = formatCantidad(normales);

    // Respeta un valor cargado a mano: solo pisa las extras si seguían siendo el cálculo automático anterior.
    const inputExtras = document.getElementById('edit-asistencia-extras');
    const actual = parseCantidad(inputExtras.value);
    if (actual === 0 || actual === parseCantidad(inputExtras.dataset.auto)) inputExtras.value = formatCantidad(extras);
    inputExtras.dataset.auto = extras;
}

function completarModalAsistencia({ id, nombre, reg, fecha, permiteEliminar }) {
    const asignar = (campo, valor) => { document.getElementById(`edit-asistencia-${campo}`).value = valor; };
    asignar('id', id);
    document.getElementById('edit-asistencia-operario-nombre').textContent = nombre;
    asignar('fecha', fecha);
    asignar('estado', reg?.estado || 'presente');
    asignar('entrada', reg?.entrada || '');
    asignar('salida', reg?.salida || '');
    asignar('horas', formatCantidad(reg?.horasTrabajadas));
    asignar('tarde', parseCantidad(reg?.minutosTarde));
    asignar('extras', formatCantidad(reg?.horasExtras));
    asignar('obs', reg?.observaciones || reg?.motivo || '');
    document.getElementById('edit-asistencia-extras').dataset.auto = reg?.entrada && reg?.salida ? calcularHoras(reg.entrada, reg.salida).extras : 0;
    document.getElementById('edit-asistencia-btn-eliminar').style.visibility = permiteEliminar ? 'visible' : 'hidden';

    window.horariosCambiarEstadoModal();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEditarAsistencia')).show();
}

window.horariosAbrirModalEditarAsistencia = function(asistenciaId) {
    const reg = state.asistenciaData.find(a => a.id === asistenciaId);
    if (!reg) return;
    asistenciaNueva = null;
    completarModalAsistencia({ id: asistenciaId, nombre: reg.operarioNombre || 'Operario', reg, fecha: reg.fecha || '', permiteEliminar: true });
};

window.horariosAbrirModalNuevaAsistencia = function(fecha) {
    const op = operariosParaReporte().find(o => o.id === state.horariosReporteOperarioId);
    if (!op) return;
    asistenciaNueva = { operarioId: op.id, operarioNombre: op.nombre, operarioPuesto: op.puesto || '' };
    completarModalAsistencia({ id: '', nombre: op.nombre, reg: null, fecha, permiteEliminar: false });
};

window.horariosProcesarLlegadaModal = function() {
    const entrada = document.getElementById('edit-asistencia-entrada').value;
    const turno = turnoParaHora(entrada);
    if (!turno) return;

    document.getElementById('edit-asistencia-estado').value = turno.estado;
    window.horariosCambiarEstadoModal();
    document.getElementById('edit-asistencia-tarde').value = turno.minutosTarde;

    const salida = document.getElementById('edit-asistencia-salida');
    if (!salida.value) salida.value = turno.salida;
    recalcularHorasModal();
};

window.horariosCambiarEstadoModal = function() {
    const estado = document.getElementById('edit-asistencia-estado').value;
    const ausencia = esAusencia(estado);
    ['entrada', 'salida', 'horas', 'tarde', 'extras'].forEach(campo => {
        const el = document.getElementById(`edit-asistencia-${campo}`);
        el.disabled = ausencia || (campo === 'tarde' && estado !== 'tarde');
        if (ausencia) el.value = ['entrada', 'salida'].includes(campo) ? '' : '0';
    });
    if (estado !== 'tarde') document.getElementById('edit-asistencia-tarde').value = '0';
};

window.horariosCalcularHorasModal = recalcularHorasModal;

window.horariosGuardarEdicionAsistencia = async function() {
    const id = document.getElementById('edit-asistencia-id').value;
    const reg = state.asistenciaData.find(a => a.id === id);
    const base = reg || asistenciaNueva;
    if (!base) return;

    const leer = campo => document.getElementById(`edit-asistencia-${campo}`).value;
    const fecha = leer('fecha');
    const estado = leer('estado');
    const entrada = leer('entrada');
    const observaciones = leer('obs').trim();

    if (!fecha) {
        showAlert('La fecha es obligatoria.', 'warning');
        return;
    }
    if (esPresencia(estado) && !entrada) {
        showAlert('Cargá la hora de entrada.', 'warning');
        return;
    }
    if (fecha !== reg?.fecha && state.asistenciaData.some(a => a.id !== id && a.operarioId === base.operarioId && a.fecha === fecha)) {
        showAlert(`Este operario ya tiene un registro el ${formatearFechaCorta(fecha)}. Editá ese día o elegí otra fecha.`, 'warning');
        return;
    }

    const datos = {
        fecha,
        estado,
        turno: esPresencia(estado) ? turnoParaHora(entrada)?.nombre || '' : '',
        entrada,
        salida: leer('salida'),
        horasTrabajadas: parseCantidad(leer('horas')),
        minutosTarde: parseCantidad(leer('tarde')),
        minutosTolerancia: estado === 'tolerancia' ? turnoParaHora(entrada)?.minutosTolerancia || 0 : 0,
        horasExtras: parseCantidad(leer('extras')),
        motivo: estado.includes('falta') ? observaciones : '',
        observaciones,
        actualizadoEn: new Date()
    };

    try {
        const nuevoRef = doc(getUserCollection('asistencia'), `${fecha}_${base.operarioId}`);
        if (!reg) {
            await setDoc(nuevoRef, { ...asistenciaNueva, ...datos });
        } else if (fecha === reg.fecha) {
            await updateDoc(doc(getUserCollection('asistencia'), id), datos);
        } else {
            // Cada día de cada operario es un único documento: al cambiar la fecha se mueve el registro.
            const { id: _idAnterior, ...resto } = reg;
            const batch = writeBatch(state.db);
            batch.delete(doc(getUserCollection('asistencia'), id));
            batch.set(nuevoRef, { ...resto, ...datos });
            await batch.commit();
        }
        showNotification('Registro de asistencia guardado.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalEditarAsistencia'))?.hide();
    } catch (e) {
        console.error('Error guardando asistencia:', e);
        showAlert('No se pudo guardar la asistencia.', 'danger');
    }
};

window.horariosEliminarRegistroAsistencia = function() {
    const id = document.getElementById('edit-asistencia-id').value;
    if (!id) return;

    showConfirm('¿Eliminar este registro de asistencia?', async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('asistencia'), id));
            showNotification('Registro de asistencia eliminado.', 'info');
            bootstrap.Modal.getInstance(document.getElementById('modalEditarAsistencia'))?.hide();
        } catch (e) {
            console.error('Error eliminando asistencia:', e);
            showAlert('No se pudo eliminar la asistencia.', 'danger');
        }
    });
};

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE CONTROL HORARIO
// ══════════════════════════════════════════════════════════════════════════════

window.horariosActualizarSalidasConfig = function() {
    const jornada = parseCantidad(document.getElementById('cfg-jornada').value);
    configHorario.turnos.forEach((_, i) => {
        const entrada = document.getElementById(`cfg-turno-${i}`).value;
        document.getElementById(`cfg-salida-${i}`).textContent = entrada && jornada > 0
            ? `Sale ${desdeMinutos(aMinutos(entrada) + jornada * 60)}`
            : '';
    });
};

// No pisa lo que se esté escribiendo si llega una actualización mientras se edita.
export function renderizarConfigHorario() {
    const form = document.getElementById('formConfigHorario');
    if (!form || form.contains(document.activeElement)) return;

    configHorario.turnos.forEach((turno, i) => {
        document.getElementById(`cfg-turno-${i}`).value = turno.entrada;
    });
    document.getElementById('cfg-jornada').value = configHorario.jornadaHs;
    document.getElementById('cfg-tolerancia').value = configHorario.toleranciaMin;
    document.getElementById('cfg-anticipo').value = configHorario.anticipoMin;
    document.getElementById('cfg-extras').value = configHorario.extrasFraccionMin;
    window.horariosActualizarSalidasConfig();
}

window.horariosGuardarConfig = async function() {
    const turnos = configHorario.turnos.map((turno, i) => ({
        nombre: turno.nombre,
        entrada: document.getElementById(`cfg-turno-${i}`).value
    }));
    if (new Set(turnos.map(t => t.entrada)).size !== turnos.length) {
        showAlert('Cada turno tiene que entrar a una hora distinta.', 'warning');
        return;
    }

    try {
        await setDoc(doc(getUserCollection('configuracion'), 'controlHorario'), {
            turnos,
            jornadaHs: parseCantidad(document.getElementById('cfg-jornada').value),
            toleranciaMin: parseCantidad(document.getElementById('cfg-tolerancia').value),
            anticipoMin: parseCantidad(document.getElementById('cfg-anticipo').value),
            extrasFraccionMin: parseCantidad(document.getElementById('cfg-extras').value),
            actualizadoEn: new Date()
        });
        showNotification('Configuración de Control Horario guardada.', 'success');
    } catch (e) {
        console.error('Error guardando configuración:', e);
        showAlert('No se pudo guardar la configuración.', 'danger');
    }
};
