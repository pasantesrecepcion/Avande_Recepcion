// ═════════════════════════════════════════════════════════════════════════
// 1. INICIALIZACIÓN DE AMBAS BASES DE DATOS (FIREBASE DOBLE)
// ═════════════════════════════════════════════════════════════════════════

const configAvance = {
    apiKey: 'AIzaSyDLBnGH_k_7ss6sk4aVAX_EBPOcvWiVZMM',
    authDomain: 'wms-dashboard-12982.firebaseapp.com',
    databaseURL: 'https://wms-dashboard-12982-default-rtdb.firebaseio.com',
    projectId: 'wms-dashboard-12982',
    storageBucket: 'wms-dashboard-12982.firebasestorage.app',
    messagingSenderId: '105741824412',
    appId: '1:105741824412:web:c8cf48aa31dbf015915859',
    measurementId: 'G-69LNDW0HPJ'
};
const appAvance = firebase.initializeApp(configAvance, "appAvance");
const dbAvance = appAvance.database();

const configProductividad = {
    databaseURL: 'https://logistica-b100-default-rtdb.firebaseio.com/'
};
const appProductividad = firebase.initializeApp(configProductividad, "appProductividad");
const dbProductividad = appProductividad.database();


// ═════════════════════════════════════════════════════════════════════════
// 2. ESTADO GLOBAL Y UTILERÍAS
// ═════════════════════════════════════════════════════════════════════════
let allRecords = [];
let pndRecords = [];

let currentOriginFilter = 'ALL';
let currentProvFilter = 'ALL';
let currentStatusFilter = 'ALL';
let gaugeTarget = 0, gaugeCur = 0;

const toN = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; };
const fmt = n => Number(n).toLocaleString('es-AR');
const todayStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

const statusOf = s => {
    const l = String(s || '').toLowerCase();
    if (l.includes('verif') || l.includes('verified')) return 'VERIFICADO';
    if (l.includes('transit') || l.includes('trán')) return 'EN TRÁNSITO';
    if (l.includes('complet')) return 'RECEPCIÓN COMPLETA';
    if (l.includes('inici') || l.includes('start') || l.includes('receiv')) return 'RECEPCIÓN INICIADA';
    return 'PENDIENTE';
};

// ═════════════════════════════════════════════════════════════════════════
// 3. LOGICA DE FILTROS Y RENDERS (MÓDULO AVANCE - FB1)
// ═════════════════════════════════════════════════════════════════════════
function populateDates(records) {
    const sel = document.getElementById('dateFilter');
    const prev = sel.value;
    const dates = [...new Set(records.map(r => r['Fecha Personal 1']).filter(Boolean))].sort();
    sel.innerHTML = '<option value="AUTO">HOY</option>';
    dates.forEach(d => { const o = document.createElement('option'); o.value = o.textContent = d; sel.appendChild(o); });
    if (prev !== 'AUTO' && dates.includes(prev)) { sel.value = prev; return; }
    const t = todayStr();
    sel.value = dates.includes(t) ? t : (dates.length ? dates[dates.length - 1] : 'AUTO');
}

function populateProviders(records) {
    const sel = document.getElementById('provFilter');
    const prev = sel.value;
    const dateVal = document.getElementById('dateFilter').value;

    let activeRecords = records;
    if (dateVal === 'AUTO') {
        const t = todayStr();
        const f = records.filter(r => r['Fecha Personal 1'] === t);
        activeRecords = f.length ? f : records;
    } else {
        activeRecords = records.filter(r => r['Fecha Personal 1'] === dateVal);
    }

    if (currentOriginFilter !== 'ALL') {
        activeRecords = activeRecords.filter(r => {
            const o = String(r['Informacion de Origen'] || '').toUpperCase();
            return o.includes(currentOriginFilter);
        });
    }

    if (currentStatusFilter !== 'ALL') {
        activeRecords = activeRecords.filter(r => statusOf(r['ESTADO'] || r['Estado LPN']) === currentStatusFilter);
    }

    const provs = [...new Set(activeRecords.map(r => r['NOMBRE DE PROVEEDOR']).filter(Boolean))].sort();
    sel.innerHTML = '<option value="ALL">TODOS LOS PROVEEDORES</option>';
    provs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; sel.appendChild(o); });

    if (prev !== 'ALL' && provs.includes(prev)) { sel.value = prev; currentProvFilter = prev; }
    else { sel.value = 'ALL'; currentProvFilter = 'ALL'; }
}

function getFiltered() {
    const v = document.getElementById('dateFilter').value;
    let records = allRecords;
    if (v === 'AUTO') {
        const t = todayStr();
        const f = allRecords.filter(r => r['Fecha Personal 1'] === t);
        records = f.length ? f : allRecords;
    } else {
        records = allRecords.filter(r => r['Fecha Personal 1'] === v);
    }
    if (currentOriginFilter !== 'ALL') {
        records = records.filter(r => {
            const o = String(r['Informacion de Origen'] || '').toUpperCase();
            return o.includes(currentOriginFilter);
        });
    }
    if (currentProvFilter !== 'ALL') {
        records = records.filter(r => r['NOMBRE DE PROVEEDOR'] === currentProvFilter);
    }
    if (currentStatusFilter !== 'ALL') {
        records = records.filter(r => statusOf(r['ESTADO'] || r['Estado LPN']) === currentStatusFilter);
    }
    return records;
}

function calcKPIs(records) {
    const env = records.reduce((a, r) => a + toN(r['Suma de Recuento de LPN enviadas']), 0);
    const rec = records.reduce((a, r) => a + toN(r['Suma de Recuento de LPN recibidas']), 0);
    const sku = records.reduce((a, r) => a + toN(r['SKU TOTALES']), 0);
    const prov = new Set(records.map(r => r['NOMBRE DE PROVEEDOR']).filter(Boolean)).size;
    const pct = env > 0 ? (rec / env) * 100 : 0;
    return { env, rec, sku, prov, pct };
}

function renderKPIs({ env, rec, sku, prov }) {
    document.getElementById('kEnv').textContent = fmt(env);
    document.getElementById('kRec').textContent = fmt(rec);
    document.getElementById('kSku').textContent = fmt(sku);
    document.getElementById('kProv').textContent = prov;
}

const SEGS = 72, GAP = 0.035;
function getGaugeColor(pctVal) {
    if (pctVal <= 12.5) return ['#FF0000', 'rgba(255,0,0,.7)'];
    if (pctVal <= 25) return ['#FF4500', 'rgba(255,69,0,.7)'];
    if (pctVal <= 37.5) return ['#FF8C00', 'rgba(255,140,0,.7)'];
    if (pctVal <= 50) return ['#FFD700', 'rgba(255,215,0,.7)'];
    if (pctVal <= 62.5) return ['#ADFF2F', 'rgba(173,255,47,.7)'];
    if (pctVal <= 75) return ['#7FFF00', 'rgba(127,255,0,.7)'];
    if (pctVal <= 87.5) return ['#00FF00', 'rgba(0,255,0,.7)'];
    return ['#00FFFF', 'rgba(0,255,255,.8)'];
}

function drawGauge(canvas, pct, time = 0) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const Ro = (Math.min(W, H) / 2);
    const Ri = Ro * 0.55;

    ctx.clearRect(0, 0, W, H);
    const step = (Math.PI * 2) / SEGS;
    const segArc = step - GAP;
    const filledCnt = Math.max(0, Math.round((pct / 100) * SEGS));
    const START = Math.PI / 2;

    for (let i = 0; i < SEGS; i++) {
        const a0 = START + step * i;
        const a1 = a0 + segArc;
        ctx.beginPath();
        ctx.arc(cx, cy, Ro, a0, a1);
        ctx.arc(cx, cy, Ri, a1, a0, true);
        ctx.closePath();

        if (i < filledCnt) {
            const segPct = (i / SEGS) * 100;
            const [fill, glow] = getGaugeColor(segPct);
            const baseGlow = 10;
            const extraGlow = (Math.sin(time / 400) + 1) * 8;
            ctx.fillStyle = fill;
            ctx.shadowColor = glow; ctx.shadowBlur = baseGlow + extraGlow;
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.shadowBlur = 0;
        }
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.beginPath(); ctx.arc(cx, cy, Ri * 0.93, 0, Math.PI * 2);
    ctx.strokeStyle = pct > 0 ? getGaugeColor(pct)[0] : '#00ff66';
    ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke();
    ctx.globalAlpha = 1;

    if (pct > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Ri * 0.93, 0, Math.PI * 2);
        ctx.clip();
        const [fillCol] = getGaugeColor(pct);
        ctx.fillStyle = fillCol;
        ctx.globalAlpha = 0.3;
        const liquidY = cy + (Ri * 0.4) - ((Ri * 0.8) * (pct / 100));
        const waveFreq = 0.04;
        const waveAmp = Ri * 0.08;
        ctx.beginPath();
        ctx.moveTo(cx - Ri, cy + Ri);
        for (let x = cx - Ri; x <= cx + Ri; x += 5) {
            ctx.lineTo(x, liquidY + Math.sin(x * waveFreq + time * 0.002) * waveAmp);
        }
        ctx.lineTo(cx + Ri, cy + Ri);
        ctx.fill();
        ctx.restore();
    }

    const [textCol] = pct > 0 ? getGaugeColor(pct) : ['#00ff66'];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = textCol;
    ctx.shadowColor = textCol; ctx.shadowBlur = 15;
    const fontSize = Math.floor(Ro * 0.28);
    ctx.font = `900 ${fontSize}px 'Inter', sans-serif`;
    ctx.fillText(pct.toFixed(1) + '%', cx, cy - Ro * 0.08);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fdfbfbff';
    ctx.font = `700 ${Math.floor(Ro * 0.10)}px 'Orbitron', sans-serif`;
    ctx.letterSpacing = '3px';
    ctx.fillText('% AVANCE', cx, cy + Ro * 0.25);
}

let gaugeLoopStarted = false;
function animateGaugeTo(target) {
    gaugeTarget = target;
    if (!gaugeLoopStarted) {
        gaugeLoopStarted = true;
        const canvas = document.getElementById('gaugeCanvas');
        const step = () => {
            gaugeCur += (gaugeTarget - gaugeCur) * 0.08;
            if (Math.abs(gaugeTarget - gaugeCur) < 0.05) gaugeCur = gaugeTarget;
            drawGauge(canvas, gaugeCur, performance.now());
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}

function sizeGauge() {
    const canvas = document.getElementById('gaugeCanvas');
    const wrap = document.getElementById('colGauge');
    if (!wrap || !canvas) return;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) * 1.20;
    if (size > 0) { canvas.width = size; canvas.height = size; }
    drawGauge(canvas, gaugeCur, performance.now());
}

function updateBatteries(records) {
    const dp = { env: 0, rec: 0 }, cds = { env: 0, rec: 0 };
    let baseRecords = allRecords;
    const dateVal = document.getElementById('dateFilter').value;
    if (dateVal === 'AUTO') {
        const t = todayStr();
        const f = allRecords.filter(r => r['Fecha Personal 1'] === t);
        baseRecords = f.length ? f : allRecords;
    } else {
        baseRecords = allRecords.filter(r => r['Fecha Personal 1'] === dateVal);
    }

    baseRecords.forEach(r => {
        const o = String(r['Informacion de Origen'] || '').toUpperCase();
        const e = toN(r['Suma de Recuento de LPN enviadas']);
        const c = toN(r['Suma de Recuento de LPN recibidas']);
        if (o.includes('DP')) { dp.env += e; dp.rec += c; }
        else { cds.env += e; cds.rec += c; }
    });

    const set = (fillId, numId, pctId, d, colorClass) => {
        const p = d.env > 0 ? (d.rec / d.env) * 100 : 0;
        const fillEl = document.getElementById(fillId);
        if (fillEl) {
            fillEl.style.width = Math.min(p, 100) + '%';
            fillEl.className = 'vbat-fill ' + colorClass;
        }
        document.getElementById(numId).textContent = `${fmt(d.rec)} / ${fmt(d.env)}`;
        document.getElementById(pctId).textContent = p.toFixed(1) + '%';
    };

    set('dpFill', 'dpNum', 'dpPct', dp, 'bg-cyan');
    set('cdsFill', 'cdsNum', 'cdsPct', cds, 'bg-neon');
}

function initBubbles() {
    ['dpBubs', 'cdsBubs'].forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const b = document.createElement('div');
            b.className = 'bub';
            const sz = 3 + Math.random() * 5;
            b.style.cssText = `width:${sz}px;height:${sz}px;bottom:${5 + Math.random() * 90}%;--dy:${(Math.random() - .5) * 20}px;animation-duration:${2 + Math.random() * 2}s;animation-delay:${-Math.random() * 3}s;`;
            container.appendChild(b);
        }
    });
}

function aggregate(records) {
    const map = {};
    records.forEach(r => {
        const name = r['NOMBRE DE PROVEEDOR'] || r['Proveedor'] || 'N/D';
        const transStatus = statusOf(r['ESTADO'] || r['Estado LPN']);
        const rawOrig = String(r['Informacion de Origen'] || r['INFORMACION DE ORIGEN'] || 'N/D').toUpperCase();
        const orig = rawOrig.includes('DP') ? 'DP' : (rawOrig.includes('CDS') ? 'CDS' : rawOrig);

        const k = `${name}|||${transStatus}|||${orig}`;

        if (!map[k]) {
            map[k] = { name, env: 0, rec: 0, sku: 0, estado: transStatus, origen: orig };
        }
        map[k].env += toN(r['Suma de Recuento de LPN enviadas']);
        map[k].rec += toN(r['Suma de Recuento de LPN recibidas'] || r['Cant recib']);
        map[k].sku += toN(r['SKU TOTALES']);
    });

    const filteredItems = Object.values(map);

    return filteredItems.sort((a, b) => b.env - a.env);
}

function buildRows(items) {
    return items.map(item => {
        const pct = item.env > 0 ? (item.rec / item.env) * 100 : 0;
        const w = Math.min(pct, 100).toFixed(1);
        const stLbl = item.estado;

        let pillClass = 'pill-pen';
        if (stLbl === 'VERIFICADO') pillClass = 'pill-ver';
        else if (stLbl === 'EN TRÁNSITO') pillClass = 'pill-tra';
        else if (stLbl === 'RECEPCIÓN COMPLETA') pillClass = 'pill-com';
        else if (stLbl === 'RECEPCIÓN INICIADA') pillClass = 'pill-ini';

        let origColor = item.origen.includes('DP') ? '#00e5ff' : '#ffff00';

        return `<div class="trow" onclick="openOperatorsModal('${item.name.replace(/'/g, "\\'")}', '${stLbl}', '${item.origen}')">
            <span class="c-prov" style="flex: 2;" title="${item.name}">${item.name}</span>
            <span class="c-est" style="flex: 1.5;"><span class="pill ${pillClass}">${stLbl}</span></span>
            <span class="c-orig" style="flex: 0.8; color: ${origColor}; font-weight: 700;">${item.origen}</span>
            <span class="c-sku" style="flex: 0.6;">${fmt(item.sku)}</span>
            <span class="c-rec" style="flex: 0.8;">${fmt(item.rec)}</span>
            <span class="c-env" style="flex: 0.8;">${fmt(item.env)}</span>
            <div class="t-bar-wrap" style="flex: 1.5;">
                <span class="t-bar-pct" style="color: #39FF14;">${w}%</span>
                <div class="t-bar-bg">
                    <div class="t-bar-fill neon-moving-bar" style="width:${w}%"></div>
                </div>
            </div>
        </div>`;
    }).join('');
}

let tableScrollRaf = null;
let tableScrollPos = 0;

// ════════════ CORRECCIÓN CRÍTICA: SCROLL INFINITO PERMANENTE CON FILTROS ════════════
function updateTable(records) {
    const track = document.getElementById('table-body');
    const wrapper = document.querySelector('.table-scroll-wrapper');
    if (!track || !wrapper) return;

    const ents = aggregate(records);

    // Si no hay datos, limpiamos pista y matamos animación
    if (ents.length === 0) {
        track.innerHTML = '';
        track.classList.remove('infinite-scroll-running');
        if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);
        return;
    }

    const html = buildRows(ents);
    track.innerHTML = html;

    // Condición de repetición infinita: si hay pocos elementos, igual clonamos para llenar la pantalla
    requestAnimationFrame(() => {
        let originalHeight = track.offsetHeight;
        if (originalHeight > 0) {
            // Forzamos al menos 2 copias idénticas para garantizar armonía de repetición infinita limpia
            let requiredCopies = Math.ceil((wrapper.offsetHeight * 2) / originalHeight);
            if (requiredCopies < 2) requiredCopies = 2;
            let extraHtml = '';
            for (let i = 1; i < requiredCopies; i++) { extraHtml += html; }
            track.innerHTML += extraHtml;
            track.dataset.origHeight = originalHeight;
        }

        if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);

        // Agregamos la clase de animación fluida nativa
        track.classList.add('infinite-scroll-running');

        function animateScroll() {
            tableScrollPos += 1.2; // Velocidad fluida y balanceada
            wrapper.scrollTop = Math.round(tableScrollPos);
            const limit = parseFloat(track.dataset.origHeight || 0);
            if (limit > 0 && tableScrollPos >= limit) {
                tableScrollPos -= limit;
                wrapper.scrollTop = Math.round(tableScrollPos);
            }
            tableScrollRaf = requestAnimationFrame(animateScroll);
        }

        tableScrollRaf = requestAnimationFrame(animateScroll);
        wrapper.onmouseenter = () => { if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf); };
        wrapper.onmouseleave = () => { tableScrollRaf = requestAnimationFrame(animateScroll); };
    });
}


// ═════════════════════════════════════════════════════════════════════════
// 4. CRUCE AVANZADO ENTRE AMBAS BASES DE DATOS (CORREGIDO: ALINEACIÓN HORIZONTAL IMPECABLE)
// ═════════════════════════════════════════════════════════════════════════
function openOperatorsModal(provName, status, origin) {
    const modalWrap = document.getElementById('gala-overlay');
    const titleEl = document.getElementById('gala-target-prov');
    const contentEl = document.getElementById('gala-content');

    if (!modalWrap || !contentEl) return;

    const targetProvUpper = provName.trim().toUpperCase();
    titleEl.textContent = `${provName} • [${origin}] • ${status}`;

    const selectedDateDropdown = document.getElementById('dateFilter').value;
    let targetDate = selectedDateDropdown;
    if (selectedDateDropdown === 'AUTO') {
        targetDate = todayStr();
    }

    const operariosAsignados = pndRecords.filter(r => {
        const provFB2 = String(r['NOMBRE DE PROVEEDOR'] || r['Proveedor'] || '').trim().toUpperCase();
        const dateFB2 = String(r['Fecha Personal 1'] || r['FECHA'] || '').trim();
        const rawOrigFB2 = String(r['Informacion de Origen'] || r['INFORMACION DE ORIGEN'] || '').toUpperCase();
        const origFB2 = rawOrigFB2.includes('DP') ? 'DP' : (rawOrigFB2.includes('CDS') ? 'CDS' : '');

        const matchProv = (provFB2 === targetProvUpper);
        const matchDate = (dateFB2 === targetDate || !dateFB2 || selectedDateDropdown === 'ALL');
        const matchOrig = (origFB2 === origin.toUpperCase());

        return matchProv && matchDate && matchOrig;
    });

    const totalLpnProv = operariosAsignados.reduce((acc, r) => acc + toN(r['Suma de Recuento de LPN recibidas'] || r['Cant recib']), 0);

    const opMap = {};

    operariosAsignados.forEach(r => {
        let rawUser = r['usuario_id'] || r['USUARIO RECEPCION'] || r['Usuario'] || 'ANONIMO';
        let opKey = String(rawUser).trim();
        let normalizedPhotoKey = opKey.toLowerCase().replace(/\./g, '-');
        let cleanDisplayName = opKey.toUpperCase();

        const lpn = toN(r['Suma de Recuento de LPN recibidas'] || r['Cant recib']);
        const sku = toN(r['SKU TOTALES'] || 1);
        const timeStr = String(r['HORA RECEPCION'] || r['Fe y Hr MOD'] || '').trim();

        let timeOnly = '';
        if (timeStr) {
            let matchTime = timeStr.match(/(\d{2}:\d{2}:\d{2})/);
            if (matchTime) {
                timeOnly = matchTime[1];
            } else {
                let matchShortTime = timeStr.match(/(\d{2}:\d{2})/);
                timeOnly = matchShortTime ? matchShortTime[1] : timeStr;
            }
        }

        if (!opMap[opKey]) {
            opMap[opKey] = {
                name: cleanDisplayName,
                photoKey: normalizedPhotoKey,
                lpn: 0,
                sku: 0,
                firstTime: timeOnly,
                lastTime: timeOnly,
                directPhoto: r['usuario_foto'] || r['Usuario_Foto'] || ''
            };
        }

        opMap[opKey].lpn += lpn;
        opMap[opKey].sku += sku;

        if (timeOnly) {
            if (!opMap[opKey].firstTime || timeOnly < opMap[opKey].firstTime) opMap[opKey].firstTime = timeOnly;
            if (!opMap[opKey].lastTime || timeOnly > opMap[opKey].lastTime) opMap[opKey].lastTime = timeOnly;
        }
    });

    const opList = Object.values(opMap);

    if (opList.length === 0) {
        contentEl.innerHTML = `<div style="color:var(--muted); text-align:center; width:100%; font-size:1.4rem; padding: 40px;">
            No se detectaron transacciones de operarios para esta orden específica en FB2.</div>`;
    } else {
        contentEl.innerHTML = opList.map(op => {
            const partPct = totalLpnProv > 0 ? ((op.lpn / totalLpnProv) * 100).toFixed(1) : '0.0';
            const finalPhotoUrl = op.directPhoto ? op.directPhoto : `https://i.postimg.cc/${op.photoKey}.jpg`;

            // REVERSIÓN ESTRUCTURAL COMPLETA: Foto redonda clásica aislada a la izquierda con flexbox nativo
            return `
                <div class="op-card-premium" style="display: flex !important; flex-direction: row !important; align-items: center !important; padding: 24px !important; position: relative; gap: 25px;">
                    <div class="op-avatar-premium-zone" style="position: relative; flex-shrink: 0; width: 100px; height: 100px;">
                        <img src="${finalPhotoUrl}" 
                             style="width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 50% !important; border: 3px solid #00e5ff !important; box-shadow: 0 0 15px rgba(0,229,255,0.4);" 
                             alt="${op.name}" 
                             onerror="this.onerror=null; this.parentNode.innerHTML='<div style=\\'width:100px; height:100px; display:flex; align-items:center; justify-content:center; border:3px solid #00e5ff; border-radius:50%; background:#020b14;\\'><i class=\\'fas fa-user-shield\\' style=\\'font-size: 40px; color: #4a6878;\\'></i></div>';">
                        <div class="op-badge-part-premium" style="position: absolute !important; bottom: -12px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 99 !important;">${partPct}% PART.</div>
                    </div>
                    
                    <div class="op-info-premium" style="flex-grow: 1; display: flex; flex-direction: column; gap: 10px;">
                        <div class="op-name-premium">${op.name}</div>
                        
                        <div class="op-stats-premium-row">
                            <div class="op-stat-premium-box bg-glow-lpn">
                                <span class="op-stat-premium-label">LPN RECIBIDOS</span>
                                <span class="op-stat-premium-value text-neon-green">${fmt(op.lpn)}</span>
                            </div>
                            <div class="op-stat-premium-box bg-glow-sku">
                                <span class="op-stat-premium-label">SKUS ÚNICOS</span>
                                <span class="op-stat-premium-value text-neon-yellow">${fmt(op.sku)}</span>
                            </div>
                        </div>
                        
                        <div class="op-time-premium-bar">
                            <span class="op-time-label"><i class="far fa-clock"></i> RANGO OPERATIVO:</span>
                            <span class="op-time-value">${op.firstTime || 'N/D'} a ${op.lastTime || 'N/D'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    modalWrap.classList.remove('gala-hidden');
}

function closeOperatorsModal() {
    document.getElementById('gala-overlay').classList.add('gala-hidden');
}

document.getElementById('gala-close').addEventListener('click', closeOperatorsModal);
document.getElementById('gala-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'gala-overlay' || e.target.id === 'gala-background') {
        closeOperatorsModal();
    }
});


// ═════════════════════════════════════════════════════════════════════════
// 5. ESCUCHAS EN TIEMPO REAL PARALELOS (AMBOS FIREBASE ESCUCHANDO JUNTOS)
// ═════════════════════════════════════════════════════════════════════════

dbAvance.ref('datos_dashboard').on('value', snap => {
    const raw = snap.val();
    allRecords = raw ? (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean) : [];
    populateDates(allRecords);
    populateProviders(allRecords);
    render();

    const ov = document.getElementById('loading');
    if (ov && !ov.classList.contains('gone')) setTimeout(() => ov.classList.add('gone'), 500);
}, err => { console.error("Error en FB1 (Avance):", err); });

dbProductividad.ref().on('value', snap => {
    const raw = snap.val();
    if (raw) {
        if (Array.isArray(raw)) {
            pndRecords = raw.filter(Boolean);
        } else {
            let processed = [];
            Object.values(raw).forEach(node => {
                if (node && typeof node === 'object') {
                    if (Array.isArray(node)) { processed.push(...node); }
                    else if (node['NOMBRE DE PROVEEDOR'] || node['Proveedor']) { processed.push(node); }
                    else { processed.push(...Object.values(node)); }
                }
            });
            pndRecords = processed.filter(Boolean);
        }
    } else {
        pndRecords = [];
    }
}, err => { console.error("Error en FB2 (Productividad):", err); });


// ═════════════════════════════════════════════════════════════════════════
// 6. ANIMACIONES DE FONDO Y FILTROS RESTANTES
// ═════════════════════════════════════════════════════════════════════════
function initBackground() {
    const canvas = document.getElementById('bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const draw = () => {
        t += 0.0096;
        ctx.clearRect(0, 0, W, H);
        const waves = [
            { col: '#00e5ff', amp: H * .05, freq: .004, ph: t * 0.8, y: H * .08 },
            { col: '#00ff88', amp: H * .06, freq: .005, ph: t * 1.2, y: H * .14 },
            { col: '#e040fb', amp: H * .07, freq: .003, ph: t * 1.5, y: H * .20 },
            { col: '#00e5ff', amp: H * .09, freq: .003, ph: t, y: H * .28 },
            { col: '#e040fb', amp: H * .12, freq: .005, ph: t * 1.5, y: H * .36 },
            { col: '#00ff88', amp: H * .07, freq: .008, ph: t * 2.2, y: H * .44 }
        ];
        waves.forEach(w => {
            ctx.beginPath(); ctx.moveTo(0, w.y);
            for (let x = 0; x <= W; x += 4) {
                const noise = Math.sin(x * w.freq + w.ph) * w.amp;
                ctx.lineTo(x, w.y + noise);
            }
            ctx.strokeStyle = w.col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
            ctx.shadowColor = w.col; ctx.shadowBlur = 20;
            ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        });
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
}

function render() {
    const records = getFiltered();
    const kpis = calcKPIs(records);
    renderKPIs(kpis);
    animateGaugeTo(kpis.pct);
    updateBatteries(records);
    updateTable(records);
}

document.getElementById('dateFilter').addEventListener('change', () => { populateProviders(allRecords); render(); });
document.getElementById('provFilter').addEventListener('change', (e) => { currentProvFilter = e.target.value; render(); });

document.getElementById('statusFilter').addEventListener('change', (e) => {
    currentStatusFilter = e.target.value;
    populateProviders(allRecords);
    render();
});

function toggleFilter(type) {
    const btnDP = document.getElementById('btnFilterDP');
    const btnCDS = document.getElementById('btnFilterCDS');
    if (currentOriginFilter === type) {
        currentOriginFilter = 'ALL';
        btnDP.style.opacity = '1'; btnCDS.style.opacity = '1';
    } else {
        currentOriginFilter = type;
        if (type === 'DP') { btnDP.style.opacity = '1'; btnCDS.style.opacity = '0.4'; }
        else { btnCDS.style.opacity = '1'; btnDP.style.opacity = '0.4'; }
    }
    populateProviders(allRecords);
    render();
}

document.getElementById('btnFilterDP').addEventListener('click', () => toggleFilter('DP'));
document.getElementById('btnFilterCDS').addEventListener('click', () => toggleFilter('CDS'));

const btnHome = document.getElementById('btnHome');
if (btnHome) btnHome.onclick = () => { window.location.href = 'https://portal-maestro.vercel.app/'; };

window.addEventListener('resize', sizeGauge);
initBackground();
initBubbles();
requestAnimationFrame(() => requestAnimationFrame(sizeGauge));
