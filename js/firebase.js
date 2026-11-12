import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, increment, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './state.js';

// Re-export Firestore functions so other modules can import from here
export { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, increment, writeBatch };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyBJSEZAZjbClSS9YaDXkoonlI7rTJ7R1dc",
    authDomain: "proveedoresindupak.firebaseapp.com",
    projectId: "proveedoresindupak",
    storageBucket: "proveedoresindupak.firebasestorage.app",
    messagingSenderId: "396009663496",
    appId: "1:396009663496:web:e89e6a1731b1f2f3e675bd"
};

// Firebase pide un correo: cada "usuario" se guarda como usuario@DOMINIO_USUARIOS. Nunca se envían correos.
const DOMINIO_USUARIOS = 'indupak-logistica.local';
export const correoDeUsuario = usuario => `${String(usuario).trim().toLowerCase()}@${DOMINIO_USUARIOS}`;
export const usuarioValido = usuario => /^[a-z0-9._-]{3,30}$/.test(String(usuario).trim().toLowerCase());

export function getUserCollection(collectionName) {
    if (!state.isAuthReady) {
        console.error(`Attempted to access collection ${collectionName} before authentication was ready.`);
    }
    return collection(state.db, `artifacts/${appId}/${collectionName}`);
}

const docUsuario = uid => doc(state.db, `artifacts/${appId}/usuarios`, uid);
const docAccesos = () => doc(state.db, `artifacts/${appId}/configuracion`, 'accesos');

/**
 * Arranca Firebase y espera un usuario con rol.
 * - Sin sesión: alSinSesion() muestra el ingreso.
 * - Con sesión y perfil activo: alIngresar(perfil) y, la primera vez, onAuthReady() para cargar los datos.
 * - Sesión vieja anónima o usuario sin perfil/desactivado: se cierra y vuelve al ingreso.
 */
let manejarSesion = async () => {};
let creandoPrimerAdmin = false;
// Contraseña con la que el administrador crea los usuarios: quien entra con ella tiene que cambiarla.
export const CLAVE_INICIAL = '123456';
let entroConClaveInicial = false;

export function initFirebase(onAuthReady, { alSinSesion, alIngresar, alRechazar, alDebeCambiarClave } = {}) {
    state.app = initializeApp(firebaseConfig);
    state.db = getFirestore(state.app);
    state.auth = getAuth(state.app);

    manejarSesion = async (user) => {
        if (creandoPrimerAdmin) return;
        if (!user) {
            state.usuario = null;
            alSinSesion?.();
            return;
        }
        if (user.isAnonymous) {
            await signOut(state.auth);
            return;
        }
        try {
            const perfilDoc = await getDoc(docUsuario(user.uid));
            const perfil = perfilDoc.exists() ? perfilDoc.data() : null;
            if (!perfil || perfil.activo === false) {
                alRechazar?.(perfil ? 'Tu usuario está desactivado. Hablá con un administrador.' : 'Tu usuario no tiene un rol asignado. Hablá con un administrador.');
                await signOut(state.auth);
                return;
            }
            state.userId = user.uid;
            state.usuario = { uid: user.uid, ...perfil };
            // Primer ingreso: hasta que elija su contraseña no entra a la web ni se cargan los datos.
            if (perfil.debeCambiarClave || entroConClaveInicial) {
                if (entroConClaveInicial && !perfil.debeCambiarClave) {
                    // Queda marcado para que, si cierra sin cambiarla, se la vuelva a pedir.
                    updateDoc(docUsuario(user.uid), { debeCambiarClave: true }).catch(e => console.error('No se pudo marcar el cambio de clave:', e));
                }
                alDebeCambiarClave?.(state.usuario);
                return;
            }
            const primeraVez = !state.isAuthReady;
            state.isAuthReady = true;
            alIngresar?.(state.usuario);
            if (primeraVez) onAuthReady();
        } catch (error) {
            console.error('Error leyendo el perfil del usuario:', error);
            alRechazar?.('No se pudo verificar tu usuario. Revisá la conexión y volvé a intentar.');
            await signOut(state.auth);
        }
    };
    onAuthStateChanged(state.auth, user => manejarSesion(user));
}

export function ingresar(usuario, contrasena) {
    entroConClaveInicial = contrasena === CLAVE_INICIAL;
    return signInWithEmailAndPassword(state.auth, correoDeUsuario(usuario), contrasena);
}

/** Cambio obligatorio del primer ingreso: cambia la contraseña, quita la marca y entra a la web. */
export async function guardarClaveObligatoria(actual, nueva) {
    const user = state.auth.currentUser;
    if (!user) throw new Error('Sin sesión');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actual));
    await updatePassword(user, nueva);
    await updateDoc(docUsuario(user.uid), { debeCambiarClave: false, claveCambiadaEn: new Date() });
    entroConClaveInicial = false;
    await manejarSesion(user);
}

export function cerrarSesion() {
    return signOut(state.auth);
}

export async function cambiarMiContrasena(actual, nueva) {
    const user = state.auth.currentUser;
    if (!user) throw new Error('Sin sesión');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actual));
    await updatePassword(user, nueva);
}

// Una segunda conexión para crear usuarios sin cerrar la sesión del administrador.
function authSecundaria() {
    const existente = getApps().find(a => a.name === 'crear-usuarios');
    return getAuth(existente || initializeApp(firebaseConfig, 'crear-usuarios'));
}

export async function crearUsuario({ usuario, nombre, rol, contrasena }) {
    const auth = authSecundaria();
    const { user } = await createUserWithEmailAndPassword(auth, correoDeUsuario(usuario), contrasena);
    await signOut(auth);
    await setDoc(docUsuario(user.uid), {
        usuario: String(usuario).trim().toLowerCase(),
        nombre: String(nombre || '').trim(),
        rol,
        activo: true,
        // La contraseña la eligió el administrador: la persona la cambia al entrar por primera vez.
        debeCambiarClave: true,
        creadoEn: new Date(),
        creadoPor: state.usuario?.usuario || ''
    });
    return user.uid;
}

/**
 * Primer ingreso: crea el primer administrador. Las reglas de Firestore solo lo permiten
 * mientras no exista configuracion/accesos, que se escribe en el mismo paso.
 */
export async function crearPrimerAdministrador({ usuario, nombre, contrasena }) {
    // Mientras se crea, la sesión nueva todavía no tiene perfil: se pausa la verificación para no rechazarla.
    creandoPrimerAdmin = true;
    try {
        const { user } = await createUserWithEmailAndPassword(state.auth, correoDeUsuario(usuario), contrasena);
        const lote = writeBatch(state.db);
        lote.set(docUsuario(user.uid), {
            usuario: String(usuario).trim().toLowerCase(),
            nombre: String(nombre || '').trim(),
            rol: 'admin',
            activo: true,
            creadoEn: new Date(),
            creadoPor: 'primer ingreso'
        });
        lote.set(docAccesos(), { adminCreado: true, creadoEn: new Date() });
        try {
            await lote.commit();
        } catch (error) {
            // Ya había un administrador: la cuenta recién creada queda sin perfil y se cierra.
            await signOut(state.auth);
            throw error;
        }
    } finally {
        creandoPrimerAdmin = false;
    }
    await manejarSesion(state.auth.currentUser);
}
