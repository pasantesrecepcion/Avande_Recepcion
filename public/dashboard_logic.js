// ═════════════════════════════════════════════════════════════════════════
// 1. INICIALIZACIÓN DE BASES DE DATOS (FIREBASE & SUPABASE)
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

const SUPABASE_URL = "https://kdclsbscslklcypclohj.supabase.co".trim();
const SUPABASE_ANON_KEY = "sb_publishable_-jYliISAOxmckNHeoXMkpQ_7DIP0vp0".trim();
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ═════════════════════════════════════════════════════════════════════════
// 2. ESTADO GLOBAL Y UTILIDADES
// ═════════════════════════════════════════════════════════════════════════
let allRecords = [];
let pndRecords = [];
let baseDatosIncidencias = [];
let baseDatosAgenda = [];
let ultimaActualizacionExitosa = null;

let currentOriginFilter = 'ALL';
let currentProvFilters = [];
let currentStatusFilters = ['RECEPCIÓN INICIADA', 'RECEPCIÓN COMPLETA', 'EN TRÁNSITO', 'VERIFICADO'];
let gaugeTarget = 0, gaugeCur = 0;

const CAPACIDAD_FIJA_DIARIA = 77.0;

const toN = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; };
const fmt = n => Number(n).toLocaleString('es-AR');

const todayStr = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const todayISOStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const statusOf = s => {
    const l = String(s || '').toLowerCase();
    if (l.includes('verif') || l.includes('verified')) return 'VERIFICADO';
    if (l.includes('transit') || l.includes('trán')) return 'EN TRÁNSITO';
    if (l.includes('complet')) return 'RECEPCIÓN COMPLETA';
    if (l.includes('inici') || l.includes('start') || l.includes('receiv')) return 'RECEPCIÓN INICIADA';
    return 'PENDIENTE';
};


// ═════════════════════════════════════════════════════════════════════════
// 3. LÓGICA DE FILTROS Y RENDERS
// ═════════════════════════════════════════════════════════════════════════
function filterByOrigin(type) {
    if (currentOriginFilter === type) {
        currentOriginFilter = 'ALL';
    } else {
        currentOriginFilter = type;
    }

    const cardFarmacia = document.getElementById('btnFilterCDS');
    const cardSala = document.getElementById('btnFilterDP');

    if (cardFarmacia) cardFarmacia.style.outline = currentOriginFilter === 'CDS' ? '2px solid #00f3ff' : 'none';
    if (cardSala) cardSala.style.outline = currentOriginFilter === 'DP' ? '2px solid #00f3ff' : 'none';

    populateProviders(allRecords);
    render();
}

function populateDates(records) {
    const sel = document.getElementById('dateFilter');
    if (!sel) return;
    const prev = sel.value;
    const dates = [...new Set(records.map(r => r['Fecha Personal 1']).filter(Boolean))].sort();
    sel.innerHTML = '<option value="AUTO">HOY</option>';
    dates.forEach(d => { const o = document.createElement('option'); o.value = o.textContent = d; sel.appendChild(o); });
    if (prev !== 'AUTO' && dates.includes(prev)) { sel.value = prev; return; }
    const t = todayStr();
    sel.value = dates.includes(t) ? t : (dates.length ? dates[dates.length - 1] : 'AUTO');
}

function populateProviders(records) {
    const menu = document.getElementById('provDropdownMenu');
    if (!menu) return;

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

    activeRecords = activeRecords.filter(r => currentStatusFilters.includes(statusOf(r['ESTADO'] || r['Estado LPN'])));
    const provs = [...new Set(activeRecords.map(r => r['NOMBRE DE PROVEEDOR']).filter(Boolean))].sort();

    menu.innerHTML = `
        <label style="color: #0284c7; font-weight: 800; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            <input type="checkbox" id="selectAllProvs" ${currentProvFilters.length === 0 || currentProvFilters.includes('ALL') ? 'checked' : ''}> TODOS LOS PROVEEDORES
        </label>
    `;

    provs.forEach(p => {
        const isChecked = currentProvFilters.includes(p) || currentProvFilters.includes('ALL') || currentProvFilters.length === 0;
        menu.innerHTML += `
            <label>
                <input type="checkbox" class="prov-check" value="${p}" ${isChecked ? 'checked' : ''}> ${p}
            </label>
        `;
    });

    updateProvFiltersArray();
}

function updateStatusFiltersArray() {
    const checkboxes = document.querySelectorAll('#statusDropdownMenu input[type="checkbox"]');
    currentStatusFilters = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    const btnText = document.querySelector('#statusDropdownBtn .btn-text');
    if (currentStatusFilters.length === checkboxes.length) btnText.textContent = "TODOS LOS ESTADOS";
    else if (currentStatusFilters.length === 0) btnText.textContent = "NINGÚN ESTADO";
    else btnText.textContent = `${currentStatusFilters.length} ESTADOS SEL.`;
}

function updateProvFiltersArray() {
    const selectAll = document.getElementById('selectAllProvs');
    const checkboxes = document.querySelectorAll('.prov-check');
    const btnText = document.querySelector('#provDropdownBtn .btn-text');
    if (!btnText) return;

    if (selectAll && selectAll.checked) {
        currentProvFilters = ['ALL'];
        checkboxes.forEach(cb => cb.checked = true);
        btnText.textContent = "TODOS LOS PROVEEDORES";
    } else {
        const checked = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        currentProvFilters = checked;

        if (checked.length === checkboxes.length && checkboxes.length > 0) {
            if (selectAll) selectAll.checked = true;
            currentProvFilters = ['ALL'];
            btnText.textContent = "TODOS LOS PROVEEDORES";
        } else if (checked.length === 0) {
            btnText.textContent = "NINGÚN PROVEEDOR";
        } else {
            btnText.textContent = `${checked.length} PROV. SEL.`;
        }
    }
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

    if (currentProvFilters.length > 0 && !currentProvFilters.includes('ALL')) {
        records = records.filter(r => currentProvFilters.includes(r['NOMBRE DE PROVEEDOR']));
    }

    records = records.filter(r => currentStatusFilters.includes(statusOf(r['ESTADO'] || r['Estado LPN'])));
    return records;
}

function calcKPIs(records) {
    const env = records.reduce((a, r) => a + toN(r['Suma de Recuento de LPN enviadas']), 0);
    const rec = records.reduce((a, r) => a + toN(r['Suma de Recuento de LPN recibidas']), 0);
    const sku = records.reduce((a, r) => a + toN(r['SKU TOTALES'] || r['SKU']), 0);

    const skuRec = records.reduce((a, r) => {
        const st = statusOf(r['ESTADO'] || r['Estado LPN']);
        if (st === 'RECEPCIÓN INICIADA' || st === 'RECEPCIÓN COMPLETA' || st === 'VERIFICADO') {
            return a + toN(r['SKU TOTALES'] || r['SKU']);
        }
        return a;
    }, 0);

    const prov = new Set(records.map(r => r['NOMBRE DE PROVEEDOR']).filter(Boolean)).size;
    const pct = env > 0 ? (rec / env) * 100 : 0;
    return { env, rec, sku, skuRec, prov, pct };
}

function renderKPIs({ env, rec, sku, skuRec, prov }) {
    document.getElementById('kLpnRatio').textContent = `${fmt(rec)} / ${fmt(env)}`;
    document.getElementById('kSkuRatio').textContent = `${fmt(skuRec)} / ${fmt(sku)}`;
    document.getElementById('kProv').textContent = prov;

    actualizarKPIIncidencias();
    actualizarKPIAgenda();
}


// ═════════════════════════════════════════════════════════════════════════
// 4. INTEGRACIÓN SUPABASE (INCIDENCIAS Y AGENDA)
// ═════════════════════════════════════════════════════════════════════════
async function cargarIncidenciasDesdeSupabase() {
    try {
        let incidenciasCargadas = [];
        let desde = 0;
        const limite = 1000;
        let leyendo = true;

        while (leyendo) {
            const { data, error } = await _supabase
                .from('incidencias_proveedores')
                .select('*')
                .range(desde, desde + limite - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                incidenciasCargadas = incidenciasCargadas.concat(data);
                desde += limite;
                if (data.length < limite) leyendo = false;
            } else {
                leyendo = false;
            }
        }

        baseDatosIncidencias = incidenciasCargadas;
        actualizarKPIIncidencias();
    } catch (err) {
        console.error("Error al cargar incidencias desde Supabase:", err);
    }
}

async function cargarAgendaDesdeSupabase() {
    try {
        let agendaCargada = [];
        let desde = 0;
        const limite = 1000;
        let leyendo = true;

        while (leyendo) {
            const { data, error } = await _supabase
                .from('agenda_b100')
                .select('*')
                .range(desde, desde + limite - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                agendaCargada = agendaCargada.concat(data);
                desde += limite;
                if (data.length < limite) leyendo = false;
            } else {
                leyendo = false;
            }
        }

        baseDatosAgenda = agendaCargada;
        actualizarKPIAgenda();
    } catch (err) {
        console.error("Error al cargar agenda desde Supabase:", err);
    }
}

function getSelectedDateISO() {
    const dateVal = document.getElementById('dateFilter')?.value;
    if (!dateVal || dateVal === 'AUTO') {
        return todayISOStr();
    } else if (dateVal.includes('/')) {
        const p = dateVal.split('/');
        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    return dateVal;
}

function actualizarKPIIncidencias() {
    const elemKPI = document.getElementById('kIncidencias');
    if (!elemKPI) return;

    if (!baseDatosIncidencias || baseDatosIncidencias.length === 0) {
        elemKPI.textContent = "0";
        return;
    }

    const fechaTargetISO = getSelectedDateISO();

    const totalIncidencias = baseDatosIncidencias.filter(item => {
        if (!item.fecha) return false;
        const fClean = String(item.fecha).split('T')[0].trim();
        return fClean === fechaTargetISO;
    }).length;

    elemKPI.textContent = totalIncidencias.toLocaleString('es-AR');
}

function actualizarKPIAgenda() {
    const elemHrs = document.getElementById('kHrsRatio');
    if (!elemHrs) return;

    if (!baseDatosAgenda || baseDatosAgenda.length === 0) {
        elemHrs.textContent = `0.0h / ${CAPACIDAD_FIJA_DIARIA.toFixed(1)}h`;
        return;
    }

    const fechaTargetISO = getSelectedDateISO();

    const registrosFiltrados = baseDatosAgenda.filter(item => {
        if (!item.fecha) return false;
        const coincideFecha = String(item.fecha).split('T')[0].trim() === fechaTargetISO;
        if (!coincideFecha) return false;

        if (currentOriginFilter !== 'ALL') {
            const destinoStr = String(item.tipo_destino || '').toUpperCase();
            return destinoStr.includes(currentOriginFilter);
        }

        return true;
    });

    let totalMinutos = 0;

    registrosFiltrados.forEach(item => {
        if (item.hora_inicio && item.hora_fin) {
            const [hIni, mIni] = String(item.hora_inicio).split(':').map(Number);
            const [hFin, mFin] = String(item.hora_fin).split(':').map(Number);

            if (!isNaN(hIni) && !isNaN(hFin)) {
                const minInicio = (hIni * 60) + (mIni || 0);
                const minFin = (hFin * 60) + (mFin || 0);

                let difMinutos = minFin - minInicio;
                if (difMinutos < 0) difMinutos += 1440;

                totalMinutos += difMinutos;
            }
        }
    });

    const totalHoras = totalMinutos / 60;
    elemHrs.textContent = `${totalHoras.toFixed(1)}h / ${CAPACIDAD_FIJA_DIARIA.toFixed(1)}h`;
}


// ═════════════════════════════════════════════════════════════════════════
// 5. GAUGE NEÓN, BATERÍAS Y TOP OPERADORES
// ═════════════════════════════════════════════════════════════════════════
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
            ctx.fillStyle = fill;
            ctx.shadowColor = glow; ctx.shadowBlur = 12;
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.shadowBlur = 0;
        }
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    const [textCol] = pct > 0 ? getGaugeColor(pct) : ['#00ff66'];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = textCol;
    ctx.shadowColor = textCol; ctx.shadowBlur = 15;
    const fontSize = Math.floor(Ro * 0.28);
    ctx.font = `900 ${fontSize}px 'Inter', sans-serif`;
    ctx.fillText(pct.toFixed(1) + '%', cx, cy - Ro * 0.08);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.floor(Ro * 0.10)}px 'Orbitron', sans-serif`;
    ctx.fillText('% AVANCE GENERAL', cx, cy + Ro * 0.25);
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
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) * 0.95;
    if (size > 0) { canvas.width = size; canvas.height = size; }
    drawGauge(canvas, gaugeCur, performance.now());
}

function updateBatteries() {
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

    const set = (numId, pctId, d) => {
        const p = d.env > 0 ? (d.rec / d.env) * 100 : 0;
        const numElem = document.getElementById(numId);
        const pctElem = document.getElementById(pctId);
        if (numElem) numElem.textContent = `${fmt(d.rec)} / ${fmt(d.env)}`;
        if (pctElem) pctElem.textContent = p.toFixed(1) + '%';
    };

    set('dpNum', 'dpPct', dp);
    set('cdsNum', 'cdsPct', cds);
}

async function updateTopOperators() {
    const container = document.getElementById('topOperatorsList');
    if (!container) return;

    try {
        const response = await fetch('https://productividad2-dashboard.onrender.com/api/data');
        const data = await response.json();

        if (!data || !data.registros) return;

        const marcaTiempoActual = data.metadatos ? data.metadatos.actualizacion : null;
        if (marcaTiempoActual && marcaTiempoActual === ultimaActualizacionExitosa) {
            return;
        }

        ultimaActualizacionExitosa = marcaTiempoActual;
        const agg = {};
        const misRegistros = data.registros || {};
        let totalGlobalLpns = Object.keys(misRegistros).length;

        for (let key in misRegistros) {
            let current = misRegistros[key] || {};
            let uid = "ANONIMO";
            if (current.usuario_id && typeof current.usuario_id === "string" && current.usuario_id.trim() !== "") {
                uid = current.usuario_id.trim().toUpperCase();
            }

            if (!agg[uid]) {
                let fotoPlaceholder = "https://ui-avatars.com/api/?name=" + encodeURIComponent(uid) + "&background=1e293b&color=00f3ff&rounded=true";
                let realFoto = (current.usuario_foto && typeof current.usuario_foto === "string" && current.usuario_foto.includes("http"))
                    ? current.usuario_foto
                    : fotoPlaceholder;

                agg[uid] = { count: 0, foto: realFoto };
            }
            agg[uid].count += 1;
        }

        const sortedUsers = Object.entries(agg)
            .map(entry => ({ username: entry[0], lpns: entry[1].count, foto: entry[1].foto }))
            .sort((a, b) => b.lpns - a.lpns);

        if (sortedUsers.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#888; text-align:center;">Sin datos de operadores</div>';
            return;
        }

        let html = "";
        sortedUsers.forEach((user, index) => {
            const rank = index + 1;
            const prodPct = totalGlobalLpns > 0 ? ((user.lpns / totalGlobalLpns) * 100).toFixed(1) : "0.0";

            let badgeClass = "";
            if (rank === 1) badgeClass = "gold";
            else if (rank === 2) badgeClass = "silver";
            else if (rank === 3) badgeClass = "bronze";

            html += `
                <div class="op-rank-item">
                    <span class="rank-badge ${badgeClass}">${rank}</span>
                    <div class="op-avatar-wrap" style="position: relative; flex-shrink: 0;">
                        <img src="${user.foto}" alt="${user.username}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff; display: block;" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=1e293b&color=00f3ff&rounded=true';"/>
                    </div>
                    <div class="rank-info">
                        <span class="rank-name">${user.username}</span>
                        <span class="rank-sub">${fmt(user.lpns)} LPNs</span>
                    </div>
                    <div class="rank-pct-box" style="text-align: right; flex-shrink: 0; margin-left: auto;">
                        <span style="font-family: 'Orbitron', sans-serif; font-weight: 800; font-size: 0.85rem; color: #0284c7;">${prodPct}%</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error("Error al cargar productividad global:", error);
    }
}


// ═════════════════════════════════════════════════════════════════════════
// 6. TABLA INFINITA CON SCROLL ANIMADO
// ═════════════════════════════════════════════════════════════════════════
function aggregate(records) {
    const map = {};
    records.forEach(r => {
        const name = r['NOMBRE DE PROVEEDOR'] || r['Proveedor'] || 'N/D';
        const transStatus = statusOf(r['ESTADO'] || r['Estado LPN']);
        const rawOrig = String(r['Informacion de Origen'] || r['INFORMACION DE ORIGEN'] || 'N/D').toUpperCase();
        const orig = rawOrig.includes('DP') ? 'SALA (DP)' : (rawOrig.includes('CDS') ? 'FARMACIA (CDS)' : rawOrig);

        const k = `${name}|||${transStatus}|||${orig}`;
        if (!map[k]) map[k] = { name, env: 0, rec: 0, sku: 0, estado: transStatus, origen: orig };
        map[k].env += toN(r['Suma de Recuento de LPN enviadas']);
        map[k].rec += toN(r['Suma de Recuento de LPN recibidas'] || r['Cant recib']);
        map[k].sku += toN(r['SKU TOTALES'] || r['SKU']);
    });

    return Object.values(map).sort((a, b) => b.env - a.env);
}

function buildRows(items) {
    return items.map(item => {
        const pct = item.env > 0 ? (item.rec / item.env) * 100 : 0;
        const w = Math.min(pct, 100).toFixed(1);
        const stLbl = item.estado;

        let pillClass = 'pill-ini';
        if (stLbl === 'VERIFICADO') pillClass = 'pill-ver';
        else if (stLbl === 'EN TRÁNSITO') pillClass = 'pill-tra';
        else if (stLbl === 'RECEPCIÓN COMPLETA') pillClass = 'pill-com';

        let origColor = item.origen.includes('SALA') ? '#0284c7' : '#ca8a04';
        const safeName = item.name.replace(/'/g, "\\'");

        return `<div class="trow" onclick="openOperatorsModal('${safeName}', '${stLbl}', '${item.origen}')">
            <span class="c-prov" title="${item.name}">${item.name}</span>
            <span class="c-est"><span class="pill ${pillClass}">${stLbl}</span></span>
            <span class="c-orig" style="color: ${origColor};">${item.origen}</span>
            <span class="c-sku">${fmt(item.sku)}</span>
            <span class="c-rec">${fmt(item.rec)}</span>
            <span class="c-env">${fmt(item.env)}</span>
            <div class="t-bar-wrap">
                <span class="t-bar-pct">${w}%</span>
                <div class="t-bar-bg">
                    <div class="t-bar-fill" style="width:${w}%"></div>
                </div>
            </div>
        </div>`;
    }).join('');
}

let tableScrollRaf = null;
let tableScrollPos = 0;

function updateTable(records) {
    const track = document.getElementById('table-body');
    const wrapper = document.querySelector('.table-scroll-wrapper');
    if (!track || !wrapper) return;

    const ents = aggregate(records);

    if (ents.length === 0) {
        track.innerHTML = '';
        track.classList.remove('infinite-scroll-running');
        if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);
        return;
    }

    const html = buildRows(ents);
    track.innerHTML = html;

    requestAnimationFrame(() => {
        let originalHeight = track.offsetHeight;
        if (originalHeight > 0) {
            let requiredCopies = Math.ceil((wrapper.offsetHeight * 2) / originalHeight);
            if (requiredCopies < 2) requiredCopies = 2;
            let extraHtml = '';
            for (let i = 1; i < requiredCopies; i++) { extraHtml += html; }
            track.innerHTML += extraHtml;
            track.dataset.origHeight = originalHeight;
        }

        if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);
        track.classList.add('infinite-scroll-running');

        function animateScroll() {
            tableScrollPos += 1;
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
// 7. MODALES FLOTANTES (OPERADORES, PROVEEDORES E INCIDENCIAS)
// ═════════════════════════════════════════════════════════════════════════

// A. Modal Operadores (Invocado al hacer clic en filas de la Tabla TRH)
function openOperatorsModal(provName, status, origin) {
    const modalWrap = document.getElementById('gala-overlay');
    const titleEl = document.getElementById('gala-target-prov');
    const contentEl = document.getElementById('gala-content');

    if (!modalWrap || !contentEl) return;

    const targetProvUpper = provName.trim().toUpperCase();
    titleEl.textContent = `${provName} • [${origin}] • ${status}`;

    const selectedDateDropdown = document.getElementById('dateFilter').value;
    let targetDate = selectedDateDropdown === 'AUTO' ? todayStr() : selectedDateDropdown;

    // Búsqueda cruzada en base de datos de productividad
    const operariosAsignados = pndRecords.filter(r => {
        const provFB2 = String(r['NOMBRE DE PROVEEDOR'] || r['Proveedor'] || r['proveedor'] || '').trim().toUpperCase();
        const dateFB2 = String(r['Fecha Personal 1'] || r['FECHA'] || r['fecha'] || '').trim();
        return (provFB2 === targetProvUpper) && (selectedDateDropdown === 'ALL' || dateFB2 === targetDate || targetDate === 'AUTO');
    });

    const uniqueLpnCounterSet = new Set();
    operariosAsignados.forEach(r => uniqueLpnCounterSet.add(r['LPN'] || r['lpn'] || Math.random()));
    const totalLpnProv = uniqueLpnCounterSet.size || 1;

    const opMap = {};
    operariosAsignados.forEach(r => {
        let opKey = String(r['usuario_id'] || r['USUARIO RECEPCION'] || r['usuario'] || 'ANONIMO').trim();
        if (!opMap[opKey]) {
            opMap[opKey] = {
                name: opKey.toUpperCase(),
                photoKey: opKey.toLowerCase().replace(/\./g, '-'),
                lpnSet: new Set(),
                skuSet: new Set(),
                directPhoto: r['usuario_foto'] || ''
            };
        }
        opMap[opKey].lpnSet.add(r['LPN'] || r['lpn'] || Math.random());
        opMap[opKey].skuSet.add(r['SKU'] || r['sku'] || Math.random());
    });

    const opList = Object.values(opMap);

    if (opList.length === 0) {
        contentEl.innerHTML = `<div style="color:#94a3b8; text-align:center; padding: 30px;">
            No se detectaron transacciones de operarios asignados a esta orden.</div>`;
    } else {
        contentEl.innerHTML = opList.map(op => {
            const realLpnCount = op.lpnSet.size;
            const realSkuCount = op.skuSet.size;
            const partPct = (((realLpnCount / totalLpnProv) * 100)).toFixed(1);
            const finalPhotoUrl = op.directPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(op.name)}&background=1e293b&color=00f3ff&rounded=true`;

            return `
                <div class="op-card-premium">
                    <div class="op-avatar-premium-zone">
                        <img src="${finalPhotoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:2px solid #00e5ff;" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(op.name)}&background=1e293b&color=00f3ff&rounded=true';">
                        <div class="op-badge-part-premium">${partPct}% PART.</div>
                    </div>
                    <div class="op-info-premium">
                        <div class="op-name-premium" style="color: #ffffff; font-weight: 800;">${op.name}</div>
                        <div class="op-stats-premium-row">
                            <div class="op-stat-premium-box bg-glow-lpn">
                                <span class="op-stat-premium-label">LPN RECIBIDOS</span>
                                <span class="op-stat-premium-value text-neon-green">${fmt(realLpnCount)}</span>
                            </div>
                            <div class="op-stat-premium-box bg-glow-sku">
                                <span class="op-stat-premium-label">SKUS ÚNICOS</span>
                                <span class="op-stat-premium-value text-neon-yellow">${fmt(realSkuCount)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    modalWrap.style.backdropFilter = 'blur(12px)';
    modalWrap.classList.remove('gala-hidden');
}

// B. Modal Proveedores (Diseño Ultra-Compacto de Cuadrícula 2 Columnas)
function openProveedoresModal() {
    const modalWrap = document.getElementById('gala-overlay');
    const titleEl = document.getElementById('gala-target-prov');
    const contentEl = document.getElementById('gala-content');

    if (!modalWrap || !contentEl) return;

    titleEl.textContent = `LISTADO GLOBAL DE PROVEEDORES Y AVANCE`;

    const records = getFiltered();
    const map = {};

    records.forEach(r => {
        const name = r['NOMBRE DE PROVEEDOR'] || r['Proveedor'] || 'N/D';
        if (!map[name]) map[name] = { env: 0, rec: 0 };
        map[name].env += toN(r['Suma de Recuento de LPN enviadas']);
        map[name].rec += toN(r['Suma de Recuento de LPN recibidas']);
    });

    const items = Object.entries(map).map(([name, d]) => ({
        name,
        env: d.env,
        rec: d.rec,
        pct: d.env > 0 ? (d.rec / d.env) * 100 : 0
    })).sort((a, b) => b.pct - a.pct); // Ordenados de 100% a 0%

    if (items.length === 0) {
        contentEl.innerHTML = `<div style="color:#94a3b8; text-align:center; padding: 30px;">No hay proveedores en la vista actual.</div>`;
    } else {
        let gridHtml = `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%;">`;

        items.forEach(p => {
            const w = Math.min(p.pct, 100).toFixed(1);
            const isComplete = p.pct >= 100;
            const barColor = isComplete ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #0284c7, #00f3ff)';
            const statusBadge = isComplete ? '<span style="color:#34d399; font-size:0.65rem; font-weight:800;">✓ COMPLETO</span>' : `<span style="color:#00f3ff; font-size:0.65rem; font-weight:800;">${w}%</span>`;

            gridHtml += `
                <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #ffffff; font-weight: 700; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;" title="${p.name}">${p.name}</span>
                        ${statusBadge}
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: #94a3b8;">
                        <span>LPN: ${fmt(p.rec)} / ${fmt(p.env)}</span>
                    </div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div style="width: ${w}%; height: 100%; background: ${barColor};"></div>
                    </div>
                </div>
            `;
        });

        gridHtml += `</div>`;
        contentEl.innerHTML = gridHtml;
    }

    modalWrap.style.backdropFilter = 'blur(12px)';
    modalWrap.classList.remove('gala-hidden');
}

// C. Modal Incidencias Supabase Corregido
function openIncidenciasModal() {
    const modalWrap = document.getElementById('gala-overlay');
    const titleEl = document.getElementById('gala-target-prov');
    const contentEl = document.getElementById('gala-content');

    if (!modalWrap || !contentEl) return;

    titleEl.textContent = `DETALLE DE INCIDENCIAS DE PROVEEDORES`;

    const fechaTargetISO = getSelectedDateISO();

    const incidenciasHoy = baseDatosIncidencias.filter(item => {
        if (!item.fecha) return false;
        const fClean = String(item.fecha).split('T')[0].trim();
        return fClean === fechaTargetISO;
    });

    if (incidenciasHoy.length === 0) {
        contentEl.innerHTML = `<div style="color:#94a3b8; text-align:center; padding: 30px;">No se registraron incidencias para la fecha seleccionada (${fechaTargetISO}).</div>`;
    } else {
        contentEl.innerHTML = incidenciasHoy.map((inc, i) => {
            const nomProv = inc.proveedor || 'PROVEEDOR N/D';
            const nomTipo = inc.incidencias || inc.tipo || 'INCIDENCIA GENERAL';
            const desMotivo = inc.motivos || 'Sin motivo detallado';
            const hrAtraso = inc.hr_atraso && inc.hr_atraso !== '00:00:00' ? `Atraso: ${inc.hr_atraso}` : '';
            const hrPerdida = inc.hr_perdida && inc.hr_perdida !== '00:00:00' ? `Pérdida: ${inc.hr_perdida}` : '';
            const tiemposArr = [hrAtraso, hrPerdida].filter(Boolean).join(' | ');

            return `
                <div style="background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #fca5a5; font-weight: 800; font-size: 0.85rem;">#${i + 1} • ${nomProv}</span>
                        <span style="color: #ef4444; font-size: 0.72rem; font-weight: 800; background: rgba(239, 68, 68, 0.2); padding: 2px 6px; border-radius: 4px;">${nomTipo}</span>
                    </div>
                    <div style="color: #ffffff; font-size: 0.82rem; margin-top: 4px;">
                        <strong>Motivo:</strong> ${desMotivo}
                    </div>
                    ${tiemposArr ? `<div style="color: #fb7185; font-size: 0.72rem; margin-top: 4px; font-weight: 700;"><i class="fas fa-clock"></i> ${tiemposArr}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    modalWrap.style.backdropFilter = 'blur(12px)';
    modalWrap.classList.remove('gala-hidden');
}

function closeOperatorsModal() {
    document.getElementById('gala-overlay').classList.add('gala-hidden');
}

document.getElementById('gala-close')?.addEventListener('click', closeOperatorsModal);
document.getElementById('gala-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'gala-overlay' || e.target.id === 'gala-background') closeOperatorsModal();
});


// ═════════════════════════════════════════════════════════════════════════
// 8. CARGAS ASÍNCRONAS Y LISTENERS DE EVENTOS
// ═════════════════════════════════════════════════════════════════════════

cargarIncidenciasDesdeSupabase();
cargarAgendaDesdeSupabase();

// Firebase Realtime Avance
dbAvance.ref('datos_dashboard').on('value', snap => {
    const raw = snap.val();
    allRecords = raw ? (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean) : [];
    populateDates(allRecords);
    populateProviders(allRecords);
    render();

    const ov = document.getElementById('loading');
    if (ov && !ov.classList.contains('gone')) setTimeout(() => ov.classList.add('gone'), 500);
});

// Firebase Realtime Productividad
dbProductividad.ref().on('value', snap => {
    const raw = snap.val();
    pndRecords = raw ? (Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw).flat().filter(Boolean)) : [];
});

updateTopOperators();
setInterval(updateTopOperators, 1800000);

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
        t += 0.008;
        ctx.clearRect(0, 0, W, H);
        const waves = [
            { col: '#0284c7', amp: H * .04, freq: .003, ph: t * 0.8, y: H * .10 },
            { col: '#16a34a', amp: H * .05, freq: .001, ph: t * 1.1, y: H * .25 },
            { col: '#9333ea', amp: H * .03, freq: .002, ph: t * 1.4, y: H * .25 }
        ];
        waves.forEach(w => {
            ctx.beginPath(); ctx.moveTo(0, w.y);
            for (let x = 0; x <= W; x += 4) {
                const noise = Math.sin(x * w.freq + w.ph) * w.amp;
                ctx.lineTo(x, w.y + noise);
            }
            ctx.strokeStyle = w.col; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.25;
            ctx.stroke(); ctx.globalAlpha = 1;
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
    updateBatteries();
    updateTable(records);
}

// Listeners de Eventos Directos
document.addEventListener("DOMContentLoaded", () => {
    initBackground();
    window.addEventListener('resize', sizeGauge);
    setTimeout(sizeGauge, 200);

    // Asignación de clics a tarjetas KPI
    document.getElementById('btnFilterCDS')?.addEventListener('click', () => filterByOrigin('CDS'));
    document.getElementById('btnFilterDP')?.addEventListener('click', () => filterByOrigin('DP'));
    document.getElementById('btnProveedoresModal')?.addEventListener('click', openProveedoresModal);
    document.getElementById('btnIncidenciasModal')?.addEventListener('click', openIncidenciasModal);

    const dateSel = document.getElementById('dateFilter');
    if (dateSel) {
        dateSel.addEventListener('change', () => {
            populateProviders(allRecords);
            render();
        });
    }

    const statusBtn = document.getElementById('statusDropdownBtn');
    const statusMenu = document.getElementById('statusDropdownMenu');
    if (statusBtn && statusMenu) {
        statusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            statusMenu.style.display = statusMenu.style.display === 'block' ? 'none' : 'block';
        });

        statusMenu.addEventListener('change', () => {
            updateStatusFiltersArray();
            populateProviders(allRecords);
            render();
        });
    }

    const provBtn = document.getElementById('provDropdownBtn');
    const provMenu = document.getElementById('provDropdownMenu');
    if (provBtn && provMenu) {
        provBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            provMenu.style.display = provMenu.style.display === 'block' ? 'none' : 'block';
        });

        provMenu.addEventListener('change', (e) => {
            if (e.target.id === 'selectAllProvs') {
                const checks = provMenu.querySelectorAll('.prov-check');
                checks.forEach(c => c.checked = e.target.checked);
            }
            updateProvFiltersArray();
            render();
        });
    }

    document.addEventListener('click', (e) => {
        if (statusMenu && !statusBtn.contains(e.target)) statusMenu.style.display = 'none';
        if (provMenu && !provBtn.contains(e.target)) provMenu.style.display = 'none';
    });
});
