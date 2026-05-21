// js/termos.js — Heat-shrink sleeve calculator (Fundas Termocontraíbles)

let _initialized = false;
let _scene, _camera, _renderer, _controls;
let _envases = [];
let _fundaMeshes = [];

// DOM element refs (set on first init)
let _container, _envaseAncho, _envaseAlto, _envaseProfundidad;
let _columnas, _filas, _tipoFunda, _orientacion;
let _fundaAnchoSpan, _fundaLargoSpan, _tipoLabel;

function _createGradientBackground(c1, c2, w = 2, h = 2) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return new THREE.CanvasTexture(cv);
}

export function initTermos() {
    if (_initialized) {
        requestAnimationFrame(() => {
            if (_renderer && _container && _container.clientWidth > 0) {
                _renderer.setSize(_container.clientWidth, _container.clientHeight);
                _camera.aspect = _container.clientWidth / _container.clientHeight;
                _camera.updateProjectionMatrix();
            }
        });
        return;
    }
    if (typeof THREE === 'undefined') {
        console.error('Three.js not loaded — cannot init termos panel');
        return;
    }

    _initialized = true;

    _container         = document.getElementById('termos-3d-container');
    _envaseAncho       = document.getElementById('termos-envaseAncho');
    _envaseAlto        = document.getElementById('termos-envaseAlto');
    _envaseProfundidad = document.getElementById('termos-envaseProfundidad');
    _columnas          = document.getElementById('termos-columnas');
    _filas             = document.getElementById('termos-filas');
    _tipoFunda         = document.getElementById('termos-tipoFunda');
    _orientacion       = document.getElementById('termos-orientacion');
    _fundaAnchoSpan    = document.getElementById('termos-fundaAncho');
    _fundaLargoSpan    = document.getElementById('termos-fundaLargo');
    _tipoLabel         = document.getElementById('termos-tipoLabel');

    _scene = new THREE.Scene();
    _scene.background = _createGradientBackground('#0d0d1a', '#3b0764');

    _camera = new THREE.PerspectiveCamera(75, _container.clientWidth / _container.clientHeight, 0.1, 1000);
    _camera.position.set(30, 30, 60);

    _renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    _renderer.setSize(_container.clientWidth, _container.clientHeight);
    _renderer.setPixelRatio(window.devicePixelRatio);
    _container.appendChild(_renderer.domElement);

    _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
    _controls.enableDamping = true;
    _controls.dampingFactor = 0.25;
    _controls.screenSpacePanning = false;

    _scene.add(new THREE.AmbientLight(0x404040, 2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(50, 50, 50);
    _scene.add(dir);
    _scene.add(new THREE.GridHelper(200, 20, 0x3d3d5c, 0x3d3d5c));

    const allInputs = [_envaseAncho, _envaseAlto, _envaseProfundidad, _columnas, _filas];
    allInputs.forEach(inp => {
        inp.addEventListener('input',  _actualizarTodo);
        inp.addEventListener('change', _actualizarTodo);
    });
    _tipoFunda.addEventListener('change',   _actualizarTodo);
    _orientacion.addEventListener('change', _actualizarTodo);
    document.getElementById('termos-exportPdfBtn').addEventListener('click', _exportarPdf);

    _actualizarTodo();
    _animate();

    window.addEventListener('resize', () => {
        if (_container && _renderer) {
            _camera.aspect = _container.clientWidth / _container.clientHeight;
            _camera.updateProjectionMatrix();
            _renderer.setSize(_container.clientWidth, _container.clientHeight);
            _renderer.setPixelRatio(window.devicePixelRatio);
        }
    });
}

function _animate() {
    requestAnimationFrame(_animate);
    _controls.update();
    _renderer.render(_scene, _camera);
}

function _actualizarTodo() {
    _actualizarVisualizacion();
    _calcularFunda();
    _actualizarFunda3D();
    _dibujar2DFunda();
    const tipo = _tipoFunda.value;
    _tipoLabel.textContent = tipo === 'Bolsa' ? '📦 Bolsa' : '🔄 Manga';
    _tipoLabel.className = tipo === 'Bolsa'
        ? 'badge rounded-pill px-3 py-2 text-nowrap'
        : 'badge rounded-pill px-3 py-2 text-nowrap';
    _tipoLabel.style.background = tipo === 'Bolsa' ? 'rgba(59,130,246,0.25)' : 'rgba(147,51,234,0.25)';
    _tipoLabel.style.color = tipo === 'Bolsa' ? '#93c5fd' : '#d8b4fe';
    _tipoLabel.style.border = tipo === 'Bolsa' ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(147,51,234,0.4)';
}

function _actualizarVisualizacion() {
    _envases.forEach(e => _scene.remove(e));
    _envases = [];

    const ancho = parseFloat(_envaseAncho.value)       || 10;
    const alto  = parseFloat(_envaseAlto.value)         || 10;
    const prof  = parseFloat(_envaseProfundidad.value)  || 10;
    const cols  = parseInt(_columnas.value)             || 1;
    const filas = parseInt(_filas.value)                || 1;

    const geom = new THREE.BoxGeometry(ancho, alto, prof);
    const mat  = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.9 });

    const sf    = 0.1;
    const totalW = cols  * ancho + (cols  - 1) * ancho * sf;
    const totalP = filas * prof  + (filas - 1) * prof  * sf;
    const ox = -totalW / 2 + ancho / 2;
    const oz = -totalP / 2 + prof  / 2;

    for (let i = 0; i < filas; i++) {
        for (let j = 0; j < cols; j++) {
            const m = new THREE.Mesh(geom, mat);
            m.position.set(j * ancho * (1 + sf) + ox, alto / 2, i * prof * (1 + sf) + oz);
            _scene.add(m);
            _envases.push(m);
        }
    }

    if (_envases.length > 0) {
        const bbox = new THREE.Box3();
        _envases.forEach(e => bbox.expandByObject(e));
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = _camera.fov * (Math.PI / 180);
        let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
        _camera.position.set(center.x + dist * 0.7, center.y + dist * 0.9, center.z + dist);
        _camera.lookAt(center);
        _controls.target.copy(center);
    } else {
        _camera.position.set(30, 30, 60);
        _controls.target.set(0, 0, 0);
    }
    _controls.update();
}

function _actualizarFunda3D() {
    _fundaMeshes.forEach(m => _scene.remove(m));
    _fundaMeshes = [];
    if (_envases.length === 0) return;

    const tipo = _tipoFunda.value;
    const ori  = _orientacion.value;

    const bbox = new THREE.Box3();
    _envases.forEach(e => bbox.expandByObject(e));
    const bsize  = new THREE.Vector3();
    bbox.getSize(bsize);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const mg = 1.2;
    const fw = bsize.x + mg;
    const fh = bsize.y + mg;
    const fp = bsize.z + mg;

    const bodyGeom = new THREE.BoxGeometry(fw, fh, fp);
    const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x9333ea, transparent: true, opacity: 0.12, side: THREE.FrontSide, depthWrite: false });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.copy(center);
    _scene.add(bodyMesh);
    _fundaMeshes.push(bodyMesh);

    const edgesGeom = new THREE.EdgesGeometry(bodyGeom);
    const edgesMat  = new THREE.LineBasicMaterial({ color: 0x7c3aed });
    const edgesMesh = new THREE.LineSegments(edgesGeom, edgesMat);
    edgesMesh.position.copy(center);
    _scene.add(edgesMesh);
    _fundaMeshes.push(edgesMesh);

    if (tipo === 'Bolsa') {
        const sealMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
        let panelGeom, panelMesh;

        if (ori === 'alto') {
            panelGeom = new THREE.PlaneGeometry(fw, fp);
            panelMesh = new THREE.Mesh(panelGeom, sealMat);
            panelMesh.position.set(center.x, center.y - fh / 2, center.z);
            panelMesh.rotation.x = Math.PI / 2;
        } else if (ori === 'ancho') {
            panelGeom = new THREE.PlaneGeometry(fp, fh);
            panelMesh = new THREE.Mesh(panelGeom, sealMat);
            panelMesh.position.set(center.x - fw / 2, center.y, center.z);
            panelMesh.rotation.y = Math.PI / 2;
        } else {
            panelGeom = new THREE.PlaneGeometry(fw, fh);
            panelMesh = new THREE.Mesh(panelGeom, sealMat);
            panelMesh.position.set(center.x, center.y, center.z - fp / 2);
        }
        _scene.add(panelMesh);
        _fundaMeshes.push(panelMesh);
    }

    let arrowDir, arrowOrigin;
    const arLen   = Math.max(fw, fh, fp) * 0.55;
    const arColor = 0x10b981;

    if (ori === 'alto') {
        arrowDir    = new THREE.Vector3(0, -1, 0);
        arrowOrigin = new THREE.Vector3(center.x, center.y + fh / 2 + arLen, center.z);
    } else if (ori === 'ancho') {
        arrowDir    = new THREE.Vector3(-1, 0, 0);
        arrowOrigin = new THREE.Vector3(center.x + fw / 2 + arLen, center.y + fh * 0.2, center.z);
    } else {
        arrowDir    = new THREE.Vector3(0, 0, -1);
        arrowOrigin = new THREE.Vector3(center.x, center.y + fh * 0.2, center.z + fp / 2 + arLen);
    }

    const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, arLen, arColor, arLen * 0.25, arLen * 0.15);
    _scene.add(arrowHelper);
    _fundaMeshes.push(arrowHelper);
}

function _calcularFunda() {
    const a    = parseFloat(_envaseAncho.value)       || 10;
    const h    = parseFloat(_envaseAlto.value)         || 10;
    const p    = parseFloat(_envaseProfundidad.value)  || 10;
    const cols = parseInt(_columnas.value)             || 1;
    const fils = parseInt(_filas.value)                || 1;
    const tipo = _tipoFunda.value;
    const ori  = _orientacion.value;

    let anchoFunda, largoFunda;

    if (ori === 'profundidad') {
        anchoFunda = Math.ceil(((a * cols) + h) * 0.95);
        largoFunda = Math.ceil(((p * fils) + h) * 0.90);
    } else if (ori === 'ancho') {
        anchoFunda = Math.ceil(((p * fils) + h) * 0.95);
        largoFunda = Math.ceil(((a * cols) + h) * 0.90);
    } else {
        anchoFunda = Math.ceil(((a * cols) + (p * fils)) * 0.95);
        largoFunda = Math.ceil((h + Math.max(a * cols, p * fils) * 0.45) * 0.90);
    }

    if (tipo === 'Manga') largoFunda += 5;

    _fundaAnchoSpan.textContent = `${anchoFunda} cm`;
    _fundaLargoSpan.textContent = `${largoFunda} cm`;
}

function _dibujar2DFunda() {
    const canvas = document.getElementById('termos-canvas2DFunda');
    const ctx    = canvas.getContext('2d');
    const CW     = canvas.width;
    const CH     = canvas.height;

    ctx.clearRect(0, 0, CW, CH);

    const anchoFunda = parseInt(_fundaAnchoSpan.textContent) || 20;
    const largoFunda = parseInt(_fundaLargoSpan.textContent) || 30;
    const tipo = _tipoFunda.value;
    const ori  = _orientacion.value;

    ctx.fillStyle = '#f8f7ff';
    ctx.fillRect(0, 0, CW, CH);

    const padL = 85, padR = 70, padT = 65, padB = 72;
    const areaW = CW - padL - padR;
    const areaH = CH - padT - padB;
    const scale = Math.min(areaW / anchoFunda, areaH / largoFunda, 14);

    const drawW = anchoFunda * scale;
    const drawH = largoFunda * scale;
    const sx = padL + (areaW - drawW) / 2;
    const sy = padT + (areaH - drawH) / 2;

    ctx.shadowColor = 'rgba(109,40,217,0.18)';
    ctx.shadowBlur  = 18;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    const bodyGrad = ctx.createLinearGradient(sx, sy, sx + drawW, sy + drawH);
    bodyGrad.addColorStop(0, 'rgba(196,181,253,0.30)');
    bodyGrad.addColorStop(1, 'rgba(109,40,217,0.14)');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(sx, sy, drawW, drawH);
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.moveTo(sx,         sy); ctx.lineTo(sx,         sy + drawH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + drawW, sy); ctx.lineTo(sx + drawW, sy + drawH); ctx.stroke();

    ctx.strokeStyle = 'rgba(124,58,237,0.20)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(sx + 12,         sy + 8); ctx.lineTo(sx + 12,         sy + drawH - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + drawW - 12, sy + 8); ctx.lineTo(sx + drawW - 12, sy + drawH - 8); ctx.stroke();
    ctx.setLineDash([]);

    _dibujarExtremoAbierto(ctx, sx, sy, drawW, true, ori);

    if (tipo === 'Bolsa') {
        _dibujarExtremoBollado(ctx, sx, sy + drawH, drawW);
    } else {
        _dibujarExtremoAbierto(ctx, sx, sy + drawH, drawW, false, ori);
    }

    _dibujarCota(ctx, sx, sy - 22, sx + drawW, sy - 22, `${anchoFunda} cm`, 'h');
    _dibujarCota(ctx, sx + drawW + 24, sy, sx + drawW + 24, sy + drawH, `${largoFunda} cm`, 'v');

    const oriTexts = {
        'alto':        '↕  La funda se desliza por el alto — entra desde arriba',
        'ancho':       '↔  La funda se desliza por el ancho — entra desde un costado',
        'profundidad': '↙  La funda se desliza por la profundidad — entra desde el frente',
    };
    ctx.fillStyle   = '#6b7280';
    ctx.font        = '11px Inter, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(oriTexts[ori], CW / 2, CH - 8);
}

function _dibujarExtremoAbierto(ctx, sx, sy, drawW, isTop, ori) {
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + drawW, sy); ctx.stroke();
    ctx.setLineDash([]);

    const midX = sx + drawW / 2;

    if (isTop) {
        _dibujarFlecha(ctx, midX, sy - 30, midX, sy + 2, '#10b981');
        ctx.fillStyle = '#059669';
        ctx.font      = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ABIERTO — ENTRADA', midX, sy - 35);
    } else {
        _dibujarFlecha(ctx, midX, sy + 30, midX, sy - 2, '#10b981');
        ctx.fillStyle = '#059669';
        ctx.font      = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ABIERTO — SALIDA', midX, sy + 44);
    }
}

function _dibujarExtremoBollado(ctx, sx, sy, drawW) {
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth   = 6;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(sx + 2, sy); ctx.lineTo(sx + drawW - 2, sy); ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(sx + 2, sy - 7); ctx.lineTo(sx + drawW - 2, sy - 7); ctx.stroke();

    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth   = 1.5;
    const n = Math.max(4, Math.floor(drawW / 14));
    for (let i = 1; i < n; i++) {
        const hx = sx + i * (drawW / n);
        ctx.beginPath(); ctx.moveTo(hx - 2, sy - 12); ctx.lineTo(hx + 3, sy + 6); ctx.stroke();
    }

    ctx.fillStyle = '#1d4ed8';
    ctx.font      = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SELLADO', sx + drawW / 2, sy + 20);
}

function _dibujarFlecha(ctx, fx, fy, tx, ty, color) {
    const hl    = 9;
    const angle = Math.atan2(ty - fy, tx - fx);
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - hl * Math.cos(angle - Math.PI / 6), ty - hl * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tx - hl * Math.cos(angle + Math.PI / 6), ty - hl * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function _dibujarCota(ctx, x1, y1, x2, y2, label, dir) {
    ctx.strokeStyle = '#374151';
    ctx.fillStyle   = '#374151';
    ctx.lineWidth   = 1;

    if (dir === 'h') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1 - 5); ctx.lineTo(x1, y1 + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2 - 5); ctx.lineTo(x2, y2 + 5); ctx.stroke();
        ctx.font = 'bold 12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, (x1 + x2) / 2, y1 - 7);
    } else {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 - 5, y1); ctx.lineTo(x1 + 5, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2 - 5, y2); ctx.lineTo(x2 + 5, y2); ctx.stroke();
        ctx.save();
        ctx.translate(x1 + 16, (y1 + y2) / 2);
        ctx.rotate(Math.PI / 2);
        ctx.font = 'bold 12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }
}

async function _exportarPdf() {
    const ancho = parseFloat(_envaseAncho.value)       || 10;
    const alto  = parseFloat(_envaseAlto.value)         || 20;
    const prof  = parseFloat(_envaseProfundidad.value)  || 5;
    const cols  = parseInt(_columnas.value)             || 1;
    const fils  = parseInt(_filas.value)                || 1;
    const tipo  = _tipoFunda.value;
    const ori   = _orientacion.value;
    const oriNombre = { alto: 'Por el alto', ancho: 'Por el ancho', profundidad: 'Por la profundidad' }[ori];

    _renderer.render(_scene, _camera);
    const img3d = _renderer.domElement.toDataURL('image/png');
    const img2d = document.getElementById('termos-canvas2DFunda').toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Reporte de Cálculo de Funda Termocontraíble", 10, 18);

    doc.setFontSize(11);
    doc.text(`Datos del Envase:`, 10, 32);
    doc.text(`  Ancho: ${ancho} cm    Alto: ${alto} cm    Profundidad: ${prof} cm`, 10, 40);
    doc.text(`  Columnas: ${cols}    Filas: ${fils}`, 10, 48);
    doc.text(`  Tipo de Funda: ${tipo}    Orientación: ${oriNombre}`, 10, 56);

    doc.text(`Dimensiones de la Funda (aproximadas):`, 10, 68);
    doc.text(`  Ancho: ${_fundaAnchoSpan.textContent}    Largo: ${_fundaLargoSpan.textContent}`, 10, 76);

    const w3d = 85, h3d = (_renderer.domElement.height / _renderer.domElement.width) * w3d;
    doc.addImage(img3d, 'PNG', 10,  84, w3d, h3d);

    const w2d = 85, h2d = (400 / 700) * w2d;
    doc.addImage(img2d, 'PNG', 105, 84, w2d, h2d);

    doc.save('Calculo_funda_termocontraible.pdf');
}
