import { state } from './state.js';
import {
    getUserCollection, doc, updateDoc, onSnapshot,
    ingresar, cerrarSesion, cambiarMiContrasena, crearUsuario, crearPrimerAdministrador, usuarioValido
} from './firebase.js';
import { showNotification, showAlert, showConfirm } from './ui.js';

// ---- Roles: qué secciones ve cada uno ----
export const ROLES = {
    admin: {
        label: 'Administrador',
        descripcion: 'Ve y modifica todo, incluida la Configuración y los usuarios.',
        paneles: '*',
        inicio: 'dashboard'
    },
    rrhh: {
        label: 'RRHH',
        descripcion: 'Inicio y Control Horario completo: planilla, reportes y personal.',
        paneles: ['dashboard', 'horarios'],
        inicio: 'horarios'
    },
    operario: {
        label: 'Operario',
        descripcion: 'Insumos, Faltantes, Bobinas, Termos, Control y la planilla del día. Sin Pagos, Contactos, reportes ni Configuración.',
        paneles: ['dashboard', 'insumos', 'faltantes', 'bobinas', 'termos', 'control', 'horarios'],
        pestanasHorario: ['diario'],
        inicio: 'dashboard'
    }
};

// Bloques del inicio y la sección de la que dependen.
const BLOQUES_INICIO = {
    pagos: 'pagos',
    comprar: 'insumos',
    faltantes: 'faltantes',
    novedades: 'control',
    personal: 'horarios',
    compras: 'insumos',
    prevision: 'insumos'
};

const rolActual = () => ROLES[state.usuario?.rol] || null;

window.puedeVerPanel = function(panelId) {
    const rol = rolActual();
    if (!rol) return false;
    return rol.paneles === '*' || rol.paneles.includes(panelId);
};

window.panelInicialPermitido = function() {
    return rolActual()?.inicio || 'dashboard';
};

window.pestanaHorarioPermitida = function(tab) {
    const pestanas = rolActual()?.pestanasHorario;
    return !pestanas || pestanas.includes(tab);
};

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/** Oculta todo lo que el rol no puede usar: botones de la barra, accesos del inicio, pestañas y Configuración. */
export function aplicarPermisos() {
    const rol = rolActual();
    if (!rol) return;
    document.body.dataset.rol = state.usuario.rol;

    document.querySelectorAll('.dock-item[data-panel], .hoja-mas-item[data-panel]').forEach(boton => {
        boton.classList.toggle('sin-permiso', !window.puedeVerPanel(boton.dataset.panel));
    });
    // "Más" en el celular solo si queda alguna sección secundaria visible.
    const hojaVisible = [...document.querySelectorAll('.hoja-mas-item[data-panel]')].some(b => !b.classList.contains('sin-permiso'));
    document.querySelector('.dock-mas')?.classList.toggle('sin-permiso', !hojaVisible);

    document.getElementById('configToggle')?.classList.toggle('sin-permiso', !window.puedeVerPanel('configuracion'));

    Object.entries(BLOQUES_INICIO).forEach(([bloque, panel]) => {
        // Los tres accesos rápidos comparten columna: se oculta cada tarjeta; el resto, su bloque entero.
        const elemento = document.querySelector(`[data-esqueleto="${bloque}"]`);
        const esAcceso = ['pagos', 'comprar', 'faltantes'].includes(bloque);
        const contenedor = esAcceso ? elemento : elemento?.closest('[class^="dash-area-"]') || elemento;
        contenedor?.classList.toggle('sin-permiso', !window.puedeVerPanel(panel));
    });

    ['reportes', 'personal'].forEach(tab => {
        const boton = document.getElementById(`tab-btn-horarios-${tab}`);
        (boton?.closest('li') || boton)?.classList.toggle('sin-permiso', !window.pestanaHorarioPermitida(tab));
    });
    document.getElementById('horarios-btn-agregar-operario')?.classList.toggle('sin-permiso', !window.pestanaHorarioPermitida('personal'));

    document.getElementById('usuario-menu-nombre').textContent = state.usuario.nombre || state.usuario.usuario;
    document.getElementById('usuario-menu-rol').textContent = `${state.usuario.usuario} · ${rol.label}`;
    document.getElementById('usuario-menu').hidden = false;

    if (state.currentActivePanel && !window.puedeVerPanel(state.currentActivePanel)) {
        window.mostrarPanel(window.panelInicialPermitido());
    }
}

// ---- Pantalla de ingreso ----
let modoPrimerAdmin = false;

function mostrarErrorIngreso(mensaje) {
    const error = document.getElementById('ingreso-error');
    error.textContent = mensaje || '';
    error.hidden = !mensaje;
}

export function mostrarIngreso(mensaje = '') {
    document.body.classList.add('sin-sesion');
    document.getElementById('pantalla-ingreso').hidden = false;
    document.getElementById('usuario-menu').hidden = true;
    mostrarErrorIngreso(mensaje);
    setTimeout(() => document.getElementById(modoPrimerAdmin ? 'ingreso-nombre' : 'ingreso-usuario')?.focus(), 50);
}

export function ocultarIngreso() {
    document.body.classList.remove('sin-sesion');
    document.getElementById('pantalla-ingreso').hidden = true;
    document.getElementById('formIngreso').reset();
    mostrarErrorIngreso('');
}

window.accesosAlternarPrimerAdmin = function() {
    modoPrimerAdmin = !modoPrimerAdmin;
    document.getElementById('ingreso-titulo').textContent = modoPrimerAdmin ? 'Crear administrador' : 'Ingresar';
    document.getElementById('ingreso-ayuda').hidden = !modoPrimerAdmin;
    document.getElementById('ingreso-nombre-grupo').hidden = !modoPrimerAdmin;
    document.getElementById('ingreso-nombre').required = modoPrimerAdmin;
    document.getElementById('ingreso-contrasena').autocomplete = modoPrimerAdmin ? 'new-password' : 'current-password';
    document.getElementById('ingreso-boton').textContent = modoPrimerAdmin ? 'Crear y entrar' : 'Ingresar';
    document.getElementById('ingreso-alternar').textContent = modoPrimerAdmin ? 'Ya tengo usuario: ingresar' : 'Primera vez: crear el administrador';
    mostrarErrorIngreso('');
};

function mensajeDeError(error) {
    const codigo = error?.code || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(codigo)) return 'Usuario o contraseña incorrectos.';
    if (/too-many-requests/.test(codigo)) return 'Demasiados intentos. Esperá unos minutos y volvé a probar.';
    if (/network/.test(codigo)) return 'Sin conexión. Revisá internet y volvé a intentar.';
    if (/email-already-in-use/.test(codigo)) return 'Ese usuario ya existe.';
    if (/weak-password/.test(codigo)) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (/operation-not-allowed/.test(codigo)) return 'El ingreso con usuario y contraseña no está habilitado en Firebase todavía.';
    if (/permission-denied/.test(codigo)) return 'Ya existe un administrador. Pedile que te cree un usuario.';
    return 'No se pudo completar. Volvé a intentar.';
}

let ingresando = false;
window.accesosIngresar = async function() {
    if (ingresando) return;
    const usuario = document.getElementById('ingreso-usuario').value.trim().toLowerCase();
    const contrasena = document.getElementById('ingreso-contrasena').value;
    const nombre = document.getElementById('ingreso-nombre').value.trim();
    if (!usuarioValido(usuario)) {
        mostrarErrorIngreso('El usuario va de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
        return;
    }

    const boton = document.getElementById('ingreso-boton');
    ingresando = true;
    boton.disabled = true;
    mostrarErrorIngreso('');
    try {
        if (modoPrimerAdmin) {
            if (contrasena.length < 6) throw { code: 'weak-password' };
            await crearPrimerAdministrador({ usuario, nombre, contrasena });
            modoPrimerAdmin = true;
            window.accesosAlternarPrimerAdmin();
        } else {
            await ingresar(usuario, contrasena);
        }
    } catch (error) {
        console.error('Error de ingreso:', error);
        mostrarErrorIngreso(mensajeDeError(error));
    } finally {
        ingresando = false;
        boton.disabled = false;
    }
};

window.accesosCerrarSesion = function() {
    showConfirm('¿Cerrar la sesión?', async ok => {
        if (!ok) return;
        await cerrarSesion();
        // Se recarga para no dejar datos de la sesión anterior en pantalla.
        location.reload();
    });
};

window.accesosAbrirCambioContrasena = function() {
    const modal = document.getElementById('modalCambioContrasena');
    modal.querySelector('form').reset();
    bootstrap.Modal.getOrCreateInstance(modal).show();
};

window.accesosCambiarContrasena = async function() {
    const actual = document.getElementById('contrasena-actual').value;
    const nueva = document.getElementById('contrasena-nueva').value;
    if (nueva.length < 6) {
        showAlert('La nueva contraseña tiene que tener al menos 6 caracteres.', 'warning');
        return;
    }
    try {
        await cambiarMiContrasena(actual, nueva);
        bootstrap.Modal.getInstance(document.getElementById('modalCambioContrasena'))?.hide();
        showNotification('Contraseña cambiada.', 'success');
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        showAlert(/invalid-credential|wrong-password/.test(error?.code || '') ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.', 'danger');
    }
};

// ---- Administración de usuarios (solo admin) ----
let usuariosData = [];
let escuchandoUsuarios = false;

export function escucharUsuarios() {
    if (escuchandoUsuarios || state.usuario?.rol !== 'admin') return;
    escuchandoUsuarios = true;
    onSnapshot(getUserCollection('usuarios'), snapshot => {
        usuariosData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (document.getElementById('config-seccion-usuarios')?.style.display !== 'none') window.accesosRenderizarUsuarios();
    }, error => console.error('Error cargando usuarios:', error));
}

function opcionesRol(seleccionado) {
    return Object.entries(ROLES).map(([valor, rol]) => `<option value="${valor}"${valor === seleccionado ? ' selected' : ''}>${rol.label}</option>`).join('');
}

window.accesosRenderizarUsuarios = function() {
    const selectRol = document.getElementById('nuevo-usuario-rol');
    if (selectRol && !selectRol.options.length) {
        selectRol.innerHTML = opcionesRol('operario');
        selectRol.onchange = () => { document.getElementById('nuevo-usuario-rol-ayuda').textContent = ROLES[selectRol.value].descripcion; };
        selectRol.onchange();
    }

    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;
    const lista = [...usuariosData].sort((a, b) => String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), 'es'));
    tbody.innerHTML = lista.length ? lista.map(u => {
        const esYo = u.id === state.usuario?.uid;
        const activo = u.activo !== false;
        return `
            <tr class="${activo ? '' : 'hor-inactivo'}">
                <td><strong>${escapeHtml(u.nombre || '—')}</strong>${esYo ? ' <small class="text-muted">(vos)</small>' : ''}</td>
                <td><code>${escapeHtml(u.usuario)}</code></td>
                <td>
                    <select class="form-select form-select-sm" aria-label="Rol de ${escapeHtml(u.usuario)}" ${esYo ? 'disabled title="No podés cambiar tu propio rol"' : ''} onchange="accesosCambiarRol('${u.id}', this.value)">${opcionesRol(u.rol)}</select>
                </td>
                <td class="text-center">
                    <button type="button" class="hor-estado-operario ${activo ? 'activo' : ''}" ${esYo ? 'disabled title="No podés desactivarte"' : 'title="Clic para cambiar"'} onclick="accesosAlternarActivo('${u.id}')">${activo ? 'Activo' : 'Desactivado'}</button>
                </td>
            </tr>`;
    }).join('') : '<tr><td colspan="4" class="text-center text-muted">Sin usuarios.</td></tr>';
};

let creandoUsuario = false;
window.accesosCrearUsuario = async function() {
    if (creandoUsuario) return;
    const nombre = document.getElementById('nuevo-usuario-nombre').value.trim();
    const usuario = document.getElementById('nuevo-usuario-usuario').value.trim().toLowerCase();
    const rol = document.getElementById('nuevo-usuario-rol').value;
    const contrasena = document.getElementById('nuevo-usuario-contrasena').value;

    if (!usuarioValido(usuario)) {
        showAlert('El usuario va de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.', 'warning');
        return;
    }
    if (usuariosData.some(u => u.usuario === usuario)) {
        showAlert(`El usuario <strong>${escapeHtml(usuario)}</strong> ya existe.`, 'warning');
        return;
    }
    if (contrasena.length < 6) {
        showAlert('La contraseña tiene que tener al menos 6 caracteres.', 'warning');
        return;
    }

    creandoUsuario = true;
    document.getElementById('nuevo-usuario-guardar').disabled = true;
    try {
        await crearUsuario({ usuario, nombre, rol, contrasena });
        document.getElementById('formNuevoUsuario').reset();
        document.getElementById('nuevo-usuario-rol').value = 'operario';
        document.getElementById('nuevo-usuario-rol').onchange?.();
        showNotification(`Usuario <strong>${escapeHtml(usuario)}</strong> creado como ${ROLES[rol].label}.`, 'success');
    } catch (error) {
        console.error('Error creando usuario:', error);
        showAlert(mensajeDeError(error), 'danger');
    } finally {
        creandoUsuario = false;
        document.getElementById('nuevo-usuario-guardar').disabled = false;
    }
};

window.accesosCambiarRol = async function(id, rol) {
    const u = usuariosData.find(x => x.id === id);
    if (!u || id === state.usuario?.uid || !ROLES[rol]) return;
    try {
        await updateDoc(doc(getUserCollection('usuarios'), id), { rol, actualizadoEn: new Date() });
        showNotification(`${escapeHtml(u.nombre || u.usuario)} ahora es ${ROLES[rol].label}.`, 'info');
    } catch (error) {
        console.error('Error cambiando rol:', error);
        showAlert('No se pudo cambiar el rol.', 'danger');
        window.accesosRenderizarUsuarios();
    }
};

window.accesosAlternarActivo = async function(id) {
    const u = usuariosData.find(x => x.id === id);
    if (!u || id === state.usuario?.uid) return;
    const activar = u.activo === false;
    try {
        await updateDoc(doc(getUserCollection('usuarios'), id), { activo: activar, actualizadoEn: new Date() });
        showNotification(`${escapeHtml(u.nombre || u.usuario)} quedó ${activar ? 'activo' : 'desactivado'}.`, 'info');
    } catch (error) {
        console.error('Error cambiando estado de usuario:', error);
        showAlert('No se pudo cambiar el estado.', 'danger');
    }
};
