export const state = {
    // Firebase
    app: null, db: null, auth: null, userId: null, isAuthReady: false,
    // Data load tracking
    dataLoadedFlags: {
        inventario: false, proveedores: false, contactos: false,
        categories: false, unitsOfMeasure: false, roles: false,
        comisionistas: false, localidades: false, plasticSuppliers: false,
        pendingPayments: false, paymentHistory: false,
        monthlyKiloSummaries: false, faltantes: false
    },
    loadedCollectionsCount: 0,
    // Real-time data arrays
    inventarioData: [], proveedoresData: [], contactosData: [],
    categoriesData: [], unitsOfMeasureData: [], rolesData: [],
    comisionistasData: [], localidadesData: [], plasticSuppliersData: [],
    pendingPaymentsData: [], paymentHistoryData: [],
    monthlyKiloSummariesData: {}, faltantesData: [],
    // UI state
    isSearchMode: false, currentSearchFilter: 'nombre',
    currentActivePanel: 'dashboard',
    activeContactosTab: 'proveedores',
    activeInsumosTab: 'inventario',
    _historialCache: null,
    elements: {},
    // Loading screen
    loadingProgress: 0, loadingTextIndex: 0,
    loadingTexts: ["Calentando extrusoras", "Bobinando láminas", "Controlando soldadura"],
    loadingInterval: null, textInterval: null,
    // Provider card
    showProviderCardTimer: null, hideProviderCardTimer: null,
    // Clock
    _clockInterval: null,
    // Control module
    controlFormulariosData: [], controlHistorialData: [],
    controlEditorItems: [], controlEditorId: null, controlEjecucionActual: null,
    // Bobinas module (separate Firebase project)
    bobinasData: [],
    bobinasHistorialData: [],
    bobinasCartItems: []
};

export const totalCollectionsToLoad = Object.keys(state.dataLoadedFlags).length;
