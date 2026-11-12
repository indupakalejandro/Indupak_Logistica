import { state } from './state.js';
import {
    getUserCollection, doc, updateDoc, setDoc, deleteDoc, onSnapshot,
    ingresar, cerrarSesion, cambiarMiContrasena, crearUsuario, crearPrimerAdministrador, usuarioValido,
    guardarClaveObligatoria, CLAVE_INICIAL
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

// Secciones que el administrador puede habilitar o no a cada rol (Configuración es siempre solo del administrador).
const SECCIONES = [
    { id: 'dashboard', label: 'Inicio', icon: 'bi-house' },
    { id: 'insumos', label: 'Insumos', icon: 'bi-box-seam' },
    { id: 'faltantes', label: 'Faltantes', icon: 'bi-exclamation-triangle' },
    { id: 'horarios', label: 'Horario: planilla del día', icon: 'bi-clock' },
    { id: 'horarios-gestion', label: 'Horario: reportes y personal', icon: 'bi-person-badge' },
    { id: 'pagos', label: 'Pagos', icon: 'bi-cash-coin' },
    { id: 'bobinas', label: 'Bobinas', icon: 'bi-record-circle' },
    { id: 'contactos', label: 'Contactos', icon: 'bi-people' },
    { id: 'control', label: 'Control', icon: 'bi-clipboard-check' },
    { id: 'termos', label: 'Termos', icon: 'bi-layers' }
];
const ROLES_EDITABLES = ['rrhh', 'operario'];
const PERMISOS_POR_DEFECTO = {
    rrhh: ['dashboard', 'horarios', 'horarios-gestion'],
    operario: ['dashboard', 'insumos', 'faltantes', 'bobinas', 'termos', 'control', 'horarios']
};
// Los últimos permisos conocidos se recuerdan en el navegador: así, al entrar, cada rol ve desde el
// primer momento su sección (y su esqueleto) sin esperar a que lleguen de la base.
const CLAVE_PERMISOS_LOCAL = 'permisosRoles';
let permisosGuardados = (() => {
    try { return JSON.parse(localStorage.getItem(CLAVE_PERMISOS_LOCAL) || 'null'); } catch (e) { return null; }
})();

// Pasa la lista de secciones habilitadas a la forma que usan los permisos de cada rol.
function aplicarListaARol(rol, lista) {
    ROLES[rol].paneles = lista.filter(id => id !== 'horarios-gestion');
    ROLES[rol].pestanasHorario = lista.includes('horarios-gestion') ? null : ['diario'];
}
const listaDeRol = rol => (permisosGuardados?.[rol] && Array.isArray(permisosGuardados[rol])) ? permisosGuardados[rol] : PERMISOS_POR_DEFECTO[rol];
ROLES_EDITABLES.forEach(rol => aplicarListaARol(rol, listaDeRol(rol)));

let escuchandoPermisos = false;
export function escucharPermisos() {
    if (escuchandoPermisos) return;
    escuchandoPermisos = true;
    onSnapshot(getUserCollection('configuracion'), snapshot => {
        const datos = snapshot.docs.find(d => d.id === 'permisos')?.data() || null;
        permisosGuardados = datos ? { rrhh: datos.rrhh, operario: datos.operario } : null;
        try {
            if (permisosGuardados) localStorage.setItem(CLAVE_PERMISOS_LOCAL, JSON.stringify(permisosGuardados));
            else localStorage.removeItem(CLAVE_PERMISOS_LOCAL);
        } catch (e) { /* sin almacenamiento: se usan los de la base al llegar */ }
        ROLES_EDITABLES.forEach(rol => aplicarListaARol(rol, listaDeRol(rol)));
        if (state.usuario) aplicarPermisos();
        renderizarEditorPermisos();
        document.getElementById('nuevo-usuario-rol')?.onchange?.();
    }, error => console.error('Error cargando permisos:', error));
}

function renderizarEditorPermisos() {
    const tbody = document.getElementById('tabla-permisos-body');
    if (!tbody) return;
    tbody.innerHTML = SECCIONES.map(seccion => `
        <tr>
            <td><i class="bi ${seccion.icon} me-2"></i>${seccion.label}</td>
            <td class="text-center"><div class="form-check form-switch d-inline-block m-0"><input class="form-check-input" type="checkbox" checked disabled aria-label="Administrador: ${seccion.label}"></div></td>
            ${ROLES_EDITABLES.map(rol => `
                <td class="text-center">
                    <div class="form-check form-switch d-inline-block m-0">
                        <input class="form-check-input" type="checkbox" role="switch" aria-label="${ROLES[rol].label}: ${seccion.label}"
                            ${listaDeRol(rol).includes(seccion.id) ? 'checked' : ''}
                            onchange="accesosCambiarPermiso('${rol}', '${seccion.id}', this.checked, this)">
                    </div>
                </td>`).join('')}
        </tr>`).join('');
}

window.accesosCambiarPermiso = async function(rol, seccion, habilitar, interruptor) {
    if (state.usuario?.rol !== 'admin' || !ROLES_EDITABLES.includes(rol)) return;
    let lista = new Set(listaDeRol(rol));
    if (habilitar) lista.add(seccion);
    else lista.delete(seccion);
    // Reportes y personal viven dentro de Horario: si se habilitan, también la planilla.
    if (seccion === 'horarios-gestion' && habilitar) lista.add('horarios');
    if (seccion === 'horarios' && !habilitar) lista.delete('horarios-gestion');
    interruptor.disabled = true;
    try {
        await setDoc(doc(getUserCollection('configuracion'), 'permisos'), {
            ...(permisosGuardados || PERMISOS_POR_DEFECTO),
            [rol]: SECCIONES.map(s => s.id).filter(id => lista.has(id)),
            actualizadoEn: new Date()
        });
        showNotification(`${ROLES[rol].label}: ${habilitar ? 'ahora ve' : 'ya no ve'} ${SECCIONES.find(s => s.id === seccion).label}.`, 'info', 2500);
    } catch (e) {
        console.error('Error guardando permisos:', e);
        showAlert('No se pudo guardar el permiso.', 'danger');
        renderizarEditorPermisos();
    } finally {
        interruptor.disabled = false;
    }
};

const rolActual = () => ROLES[state.usuario?.rol] || null;

window.puedeVerPanel = function(panelId) {
    const rol = rolActual();
    if (!rol) return false;
    return rol.paneles === '*' || rol.paneles.includes(panelId);
};

window.panelInicialPermitido = function() {
    const rol = rolActual();
    if (!rol || rol.paneles === '*') return 'dashboard';
    if (rol.paneles.includes(rol.inicio)) return rol.inicio;
    return rol.paneles[0] || 'dashboard';
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

    // Si el rol no ve la sección actual (o el Inicio, que es lo primero que se muestra), va a su primera sección.
    // Así, mientras carga, ve el esqueleto de su propia sección y no un Inicio vacío.
    if (!window.puedeVerPanel(state.currentActivePanel || 'dashboard')) {
        window.mostrarPanel(window.panelInicialPermitido());
    }
    document.getElementById('menu-hora-configuracion')?.classList.toggle('sin-permiso', !window.puedeVerPanel('configuracion'));
}

// ---- Pantalla de ingreso ----
let modoPrimerAdmin = false;

function mostrarErrorIngreso(mensaje) {
    const error = document.getElementById('ingreso-error');
    error.textContent = mensaje || '';
    error.hidden = !mensaje;
}

// Contraseña escrita en este ingreso: si es la inicial, el cambio obligatorio no la vuelve a pedir.
let claveRecienIngresada = '';

export function mostrarCambioClaveObligatorio(perfil) {
    document.body.classList.add('sin-sesion');
    document.getElementById('pantalla-ingreso').hidden = false;
    document.getElementById('formIngreso').hidden = true;
    const form = document.getElementById('formCambioObligatorio');
    form.hidden = false;
    form.reset();
    document.getElementById('cambio-obligatorio-nombre').textContent = perfil.nombre || perfil.usuario;
    const conocida = !!claveRecienIngresada;
    document.getElementById('cambio-obligatorio-actual-grupo').hidden = conocida;
    document.getElementById('cambio-obligatorio-actual').required = !conocida;
    document.getElementById('cambio-obligatorio-error').hidden = true;
    setTimeout(() => document.getElementById(conocida ? 'cambio-obligatorio-nueva' : 'cambio-obligatorio-actual')?.focus(), 50);
}

window.accesosGuardarClaveNueva = async function() {
    const error = document.getElementById('cambio-obligatorio-error');
    const mostrar = texto => { error.textContent = texto; error.hidden = !texto; };
    const actual = claveRecienIngresada || document.getElementById('cambio-obligatorio-actual').value;
    const nueva = document.getElementById('cambio-obligatorio-nueva').value;
    const repetir = document.getElementById('cambio-obligatorio-repetir').value;
    if (nueva.length < 6) return mostrar('La contraseña tiene que tener al menos 6 caracteres.');
    if (nueva === CLAVE_INICIAL || nueva === actual) return mostrar('Elegí una contraseña distinta de la inicial.');
    if (nueva !== repetir) return mostrar('Las dos contraseñas no coinciden.');

    const boton = document.getElementById('cambio-obligatorio-boton');
    boton.disabled = true;
    mostrar('');
    try {
        await guardarClaveObligatoria(actual, nueva);
        claveRecienIngresada = '';
        document.getElementById('formCambioObligatorio').hidden = true;
        showNotification('Listo, ya tenés tu propia contraseña.', 'success');
    } catch (e) {
        console.error('Error guardando la contraseña nueva:', e);
        mostrar(/invalid-credential|wrong-password/.test(e?.code || '') ? 'La contraseña actual no es correcta.' : mensajeDeError(e));
    } finally {
        boton.disabled = false;
    }
};

window.accesosSalirSinCambiar = async function() {
    claveRecienIngresada = '';
    await cerrarSesion();
    location.reload();
};

export function mostrarIngreso(mensaje = '') {
    document.body.classList.add('sin-sesion');
    document.getElementById('pantalla-ingreso').hidden = false;
    document.getElementById('formIngreso').hidden = false;
    document.getElementById('formCambioObligatorio').hidden = true;
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
    if (/email-already-in-use/.test(codigo)) return 'Ese nombre de usuario ya se usó antes (aunque se haya eliminado). Elegí otro, por ejemplo agregándole un número.';
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
            claveRecienIngresada = contrasena;
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
    renderizarEditorPermisos();
    const selectRol = document.getElementById('nuevo-usuario-rol');
    if (selectRol && !selectRol.options.length) {
        selectRol.innerHTML = opcionesRol('operario');
        selectRol.onchange = () => {
            const rol = selectRol.value;
            document.getElementById('nuevo-usuario-rol-ayuda').textContent = rol === 'admin'
                ? ROLES.admin.descripcion
                : `Ve: ${SECCIONES.filter(s => listaDeRol(rol).includes(s.id)).map(s => s.label).join(', ') || 'ninguna sección'}. Se cambia abajo, en "Qué ve cada rol".`;
        };
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
                <td class="text-center">
                    ${esYo ? '' : `<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" title="Eliminar usuario" aria-label="Eliminar a ${escapeHtml(u.usuario)}" onclick="accesosEliminarUsuario('${u.id}')"><i class="bi bi-trash-fill"></i></button>`}
                </td>
            </tr>`;
    }).join('') : '<tr><td colspan="5" class="text-center text-muted">Sin usuarios.</td></tr>';
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

// Borra el perfil: sin perfil, esa cuenta ya no puede entrar a la web. (La cuenta de Firebase queda
// guardada sin acceso; desde el navegador no se puede borrar la de otra persona.)
window.accesosEliminarUsuario = function(id) {
    const u = usuariosData.find(x => x.id === id);
    if (!u || id === state.usuario?.uid) return;
    showConfirm(`¿Eliminar al usuario <strong>${escapeHtml(u.nombre || u.usuario)}</strong> (${escapeHtml(u.usuario)})?<br><small>No va a poder entrar más. Esto no se puede deshacer; si solo es por un tiempo, conviene Desactivarlo.</small>`, async ok => {
        if (!ok) return;
        try {
            await deleteDoc(doc(getUserCollection('usuarios'), id));
            showNotification(`Usuario ${escapeHtml(u.usuario)} eliminado.`, 'info');
        } catch (error) {
            console.error('Error eliminando usuario:', error);
            showAlert(/permission-denied/.test(error?.code || '')
                ? 'Firebase no permitió eliminarlo: hay que publicar las reglas nuevas (firestore.rules).'
                : 'No se pudo eliminar el usuario.', 'danger');
        }
    });
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
