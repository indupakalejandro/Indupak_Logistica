import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './state.js';

// Re-export Firestore functions so other modules can import from here
export { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, increment };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyBJSEZAZjbClSS9YaDXkoonlI7rTJ7R1dc",
    authDomain: "proveedoresindupak.firebaseapp.com",
    projectId: "proveedoresindupak",
    storageBucket: "proveedoresindupak.firebasestorage.app",
    messagingSenderId: "396009663496",
    appId: "1:396009663496:web:e89e6a1731b1f2f3e675bd"
};

export function getUserCollection(collectionName) {
    if (!state.isAuthReady) {
        console.error(`Attempted to access collection ${collectionName} before authentication was ready.`);
    }
    const fullPath = `artifacts/${appId}/${collectionName}`;
    console.log(`Accessing Firestore collection: ${fullPath} with appId: ${appId}`);
    return collection(state.db, fullPath);
}

export function initFirebase(onAuthReady) {
    state.app = initializeApp(firebaseConfig);
    state.db = getFirestore(state.app);
    state.auth = getAuth(state.app);

    onAuthStateChanged(state.auth, async (user) => {
        if (user) {
            state.userId = user.uid;
            console.log("Authenticated with Firebase UID:", state.userId);
            if (!state.isAuthReady) {
                state.isAuthReady = true;
                console.log("Auth is ready. Setting up listeners...");
                onAuthReady();
            }
        } else {
            console.log("No user signed in or signed out, attempting anonymous sign-in...");
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(state.auth, __initial_auth_token);
                    console.log("Signed in with custom token.");
                } else {
                    await signInAnonymously(state.auth);
                    console.log("Signed in anonymously.");
                }
            } catch (error) {
                console.error("Error during anonymous sign-in:", error);
                window.showAlert("Error al iniciar sesión anónimamente. Por favor, recargue la página.");
            }
        }
    });
}
