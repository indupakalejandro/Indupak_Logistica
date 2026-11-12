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
    // Real-time data arrays
    inventarioData: [], proveedoresData: [], contactosData: [],
    categoriesData: [], unitsOfMeasureData: [], rolesData: [],
    comisionistasData: [], localidadesData: [], plasticSuppliersData: [],
    pendingPaymentsData: [], paymentHistoryData: [],
    monthlyKiloSummariesData: {}, faltantesData: [],
    listaComprasData: [],
    // UI state
    isSearchMode: false, currentSearchFilter: 'nombre',
    currentActivePanel: 'dashboard',
    activeContactosTab: 'proveedores',
    activeInsumosTab: 'inventario',
    activeFaltantesTab: 'actuales',
    _historialCache: null,
    elements: {},
    // Mensajes de inicio
    loadingTexts: [
        "Calentando extrusoras", "Bobinando láminas", "Controlando soldadura",
        "Inflando el globo de film", "Midiendo micrones", "Ajustando la tensión",
        "Afilando cuchillas", "Contando bobinas", "Pesando los kilos del día",
        "Enfriando rodillos", "Acomodando pallets", "Cebando el primer mate"
    ],
    textInterval: null,
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
    bobinasCartItems: [],
    activeBobinasTab: 'pendientes',
    bobinasSolicitudesPendientes: [],
    // Control Horario / Personal module
    operariosData: [],
    asistenciaData: [],
    activeHorariosTab: 'diario',
    horariosReporteOperarioId: '',
    horariosReporteRango: 'mes_actual',
    horariosReporteDesde: '',
    horariosReporteHasta: ''
};
