/* ══ FIREBASE ══ */
const firebaseConfig = {
    apiKey: 'AIzaSyDLBnGH_k_7ss6sk4aVAX_EBPOcvWiVZMM',
    authDomain: 'wms-dashboard-12982.firebaseapp.com',
    databaseURL: 'https://wms-dashboard-12982-default-rtdb.firebaseio.com',
    projectId: 'wms-dashboard-12982',
    storageBucket: 'wms-dashboard-12982.firebasestorage.app',
    messagingSenderId: '105741824412',
    appId: '1:105741824412:web:c8cf48aa31dbf015915859',
    measurementId: 'G-69LNDW0HPJ'
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ══ HELPERS ══ */
const toN = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; };
const fmt = n => Number(n).toLocaleString('es-AR');
const todayStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const statusOf = s => {
    const l = String(s || '').toLowerCase();
    if (l.includes('verif')) return 'VERIFICADO';
    if (l.includes('transit') || l.includes('trán')) return 'EN TRÁNSITO';
    if (l.includes('complet')) return 'RECEPCIÓN COMPLETA';
    if (l.includes('inici') || l.includes('start')) return 'RECEPCIÓN INICIADA';
    return 'PENDIENTE';
};

/* ══ STATE ══ */
let allRecords = [], gaugeTarget = 0, gaugeCur = 0, gaugeRaf = null;

/* ══ DATE FILTER ══ */
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
function getFiltered() {
    const v = document.getElementById('dateFilter').value;
    if (v === 'AUTO') { const t = todayStr(); const f = allRecords.filter(r => r['Fecha Personal 1'] === t); return f.length ? f : allRecords; }
    return allRecords.filter(r => r['Fecha Personal 1'] === v);
}

/* ══ KPIs ══ */
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

/* ══ 360° GAUGE (Multi-Color by 12.5% Steps) ══ */
const SEGS = 72, GAP = 0.035;

function getGaugeColor(pctVal) {
    // 0% a 12.5%: Rojo Crítico
    if (pctVal <= 12.5) return ['#FF0000', 'rgba(255,0,0,.7)'];

    // 12.6% a 25%: Naranja Rojizo
    if (pctVal <= 25) return ['#FF4500', 'rgba(255,69,0,.7)'];

    // 25.1% a 37.5%: Naranja Intenso
    if (pctVal <= 37.5) return ['#FF8C00', 'rgba(255,140,0,.7)'];

    // 37.6% a 50%: Dorado / Ámbar
    if (pctVal <= 50) return ['#FFD700', 'rgba(255,215,0,.7)'];

    // 50.1% a 62.5%: Verde Lima (Tu color base actual)
    if (pctVal <= 62.5) return ['#ADFF2F', 'rgba(173,255,47,.7)'];

    // 62.6% a 75%: Chartreuse (Verde más intenso)
    if (pctVal <= 75) return ['#7FFF00', 'rgba(127,255,0,.7)'];

    // 75.1% a 87.5%: Verde Eléctrico
    if (pctVal <= 87.5) return ['#00FF00', 'rgba(0,255,0,.7)'];

    // 87.6% a 100%: Cian Neón (Meta alcanzada)
    return ['#00FFFF', 'rgba(0,255,255,.8)'];
}

function drawGauge(canvas, pct, time = 0) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    // 1. PADDING CASI CERO: Para que toque físicamente el borde del cuadro negro
    const padding = 0;
    const Ro = (Math.min(W, H) / 2) - padding;

    // 2. GROSOR DEL ANILLO: 
    // Si quieres que el círculo sea más "gordo" y llene más espacio hacia adentro:
    // Usa 0.50 o 0.55 en lugar de 0.60.
    const Ri = Ro * 0.55;

    ctx.clearRect(0, 0, W, H);

    const step = (Math.PI * 2) / SEGS;
    const segArc = step - GAP;
    const filledCnt = Math.max(0, Math.round((pct / 100) * SEGS));
    const START = Math.PI / 2; // arranca desde abajo

    for (let i = 0; i < SEGS; i++) {
        const a0 = START + step * i;
        const a1 = a0 + segArc;

        ctx.beginPath();
        ctx.arc(cx, cy, Ro, a0, a1);
        ctx.arc(cx, cy, Ri, a1, a0, true);
        ctx.closePath();

        if (i < filledCnt) {
            // El color depende del porcentaje que representa este segmento (0-100%)
            const segPct = (i / SEGS) * 100;
            const [fill, glow] = getGaugeColor(segPct);

            // Glow oscillation based on time
            const baseGlow = 10;
            const extraGlow = (Math.sin(time / 400) + 1) * 8; // Da una sensación de latido

            ctx.fillStyle = fill;
            ctx.shadowColor = glow; ctx.shadowBlur = baseGlow + extraGlow;
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.shadowBlur = 0;
        }
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    /* Inner Ring */
    ctx.beginPath(); ctx.arc(cx, cy, Ri * 0.93, 0, Math.PI * 2);
    ctx.strokeStyle = pct > 0 ? getGaugeColor(pct)[0] : '#00ff66';
    ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke();
    ctx.globalAlpha = 1;

    /* Liquid Wave in Center */
    if (pct > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Ri * 0.93, 0, Math.PI * 2);
        ctx.clip(); // Liquid inside the circle only

        const [fillCol] = getGaugeColor(pct);
        ctx.fillStyle = fillCol;
        ctx.globalAlpha = 0.3;

        const liquidY = cy + (Ri * 0.4); // Fixed at the base
        const waveFreq = 0.04;
        const waveAmp = Ri * 0.08; // Ola oscilatoria

        ctx.beginPath();
        ctx.moveTo(cx - Ri, cy + Ri);
        for (let x = cx - Ri; x <= cx + Ri; x += 5) {
            ctx.lineTo(x, liquidY + Math.sin(x * waveFreq + time * 0.002) * waveAmp);
        }
        ctx.lineTo(cx + Ri, cy + Ri);
        ctx.fill();
        ctx.restore();
    }

    /* Huge Percentage Text */
    const [textCol] = pct > 0 ? getGaugeColor(pct) : ['#00ff66'];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = textCol;
    ctx.shadowColor = textCol; ctx.shadowBlur = 15; // Brillo exterior sutil

    const fontSize = Math.floor(Ro * 0.28); // Más pequeño para que respire
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

// Busca la función que redimensiona el canvas
function sizeGauge() {
    const canvas = document.getElementById('gaugeCanvas');
    const wrap = document.getElementById('colGauge'); // El ID del contenedor negro

    // USAR Math.min ASEGURA QUE SIEMPRE SEA UN CÍRCULO PERFECTO
    // Multiplicamos por 0.90 para que sea grande pero tenga "aire" a los lados y arriba
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) * 1.20;

    // Si el círculo no crece, es porque 'wrap.clientHeight' es muy pequeño (visto en Paso 2)
    if (size > 0) {
        canvas.width = size;
        canvas.height = size;
    }

    // Redibujamos con el nuevo tamaño controlado
    drawGauge(canvas, gaugeCur, performance.now());
}
/* ══ BATTERIES ══ */
function updateBatteries(records) {
    const dp = { env: 0, rec: 0 }, cds = { env: 0, rec: 0 };
    records.forEach(r => {
        const o = String(r['Informacion de Origen'] || '').toUpperCase();
        const e = toN(r['Suma de Recuento de LPN enviadas']);
        const c = toN(r['Suma de Recuento de LPN recibidas']);
        if (o.includes('DP')) { dp.env += e; dp.rec += c; }
        else { cds.env += e; cds.rec += c; }
    });

    const set = (fillId, numId, pctId, d, colorClass) => {
        const p = d.env > 0 ? (d.rec / d.env) * 100 : 0;
        const fillEl = document.getElementById(fillId);
        fillEl.style.width = Math.min(p, 100) + '%';
        // Forzamos el color según origen
        fillEl.className = 'vbat-fill ' + colorClass;

        document.getElementById(numId).textContent = `${fmt(d.rec)} / ${fmt(d.env)}`;
        document.getElementById(pctId).textContent = p.toFixed(1) + '%';
    };

    // Aquí asignamos: DP = bg-cyan | CDS = bg-neon
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


/* ══ TABLE ══ */
function aggregate(records) {
    const map = {};
    records.forEach(r => {
        const k = r['NOMBRE DE PROVEEDOR'] || 'N/D';
        if (!map[k]) map[k] = { env: 0, rec: 0, sku: 0, estado: '', origen: '' };
        map[k].env += toN(r['Suma de Recuento de LPN enviadas']);
        map[k].rec += toN(r['Suma de Recuento de LPN recibidas']);
        map[k].sku += toN(r['SKU TOTALES']);
        if (!map[k].estado && r['ESTADO']) map[k].estado = r['ESTADO'];
        if (!map[k].origen && r['Informacion de Origen']) map[k].origen = r['Informacion de Origen'];
    });

    // Filtrar filas de proveedores que están a 100% (solo incompletos/pendientes)
    const filteredEntries = Object.entries(map).filter(([k, v]) => {
        const pct = v.env > 0 ? (v.rec / v.env) * 100 : 0;
        return pct < 100;
    });

    return filteredEntries.sort((a, b) => b[1].env - a[1].env);
}

function buildRows(entries) {
    return entries.map(([name, v]) => {
        const pct = v.env > 0 ? (v.rec / v.env) * 100 : 0;
        const w = Math.min(pct, 100).toFixed(1);
        const stLbl = statusOf(v.estado);

        let pillClass = 'pill-pen';
        if (stLbl === 'VERIFICADO') pillClass = 'pill-ver';
        else if (stLbl === 'EN TRÁNSITO') pillClass = 'pill-tra';
        else if (stLbl === 'RECEPCIÓN COMPLETA') pillClass = 'pill-com';
        else if (stLbl === 'RECEPCIÓN INICIADA') pillClass = 'pill-ini';

        let origColor = (v.origen || '').toUpperCase().includes('DP') ? '#00e5ff' : '#ffff00';

        // Columnas Exactas: PROVEEDOR | ESTADO | ORIGEN | SKU | LPN INGRESADO (rec) | LPN TOTAL (env) | % AVANCE
        return `<div class="trow">
    <span class="c-prov" style="flex: 2;" title="${name}">${name}</span>
    <span class="c-est" style="flex: 1.5;"><span class="pill ${pillClass}">${stLbl}</span></span>
    <span class="c-orig" style="flex: 0.8; color: ${origColor}; font-weight: 700;">${v.origen || 'N/D'}</span>
    <span class="c-sku" style="flex: 0.6;">${fmt(v.sku)}</span>
    <span class="c-rec" style="flex: 0.8;">${fmt(v.rec)}</span>
    <span class="c-env" style="flex: 0.8;">${fmt(v.env)}</span>
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

function updateTable(records) {
    const track = document.getElementById('table-body');
    const wrapper = document.querySelector('.table-scroll-wrapper');

    if (!track || !wrapper) return;

    const ents = aggregate(records);
    if (ents.length === 0) { track.innerHTML = ''; return; }

    const html = buildRows(ents);
    track.innerHTML = html;

    requestAnimationFrame(() => {
        let originalHeight = track.offsetHeight;
        if (originalHeight > 0) {
            let requiredCopies = Math.ceil((wrapper.offsetHeight * 2) / originalHeight);
            if (requiredCopies < 2) requiredCopies = 2;

            let extraHtml = '';
            for (let i = 1; i < requiredCopies; i++) {
                extraHtml += html;
            }
            track.innerHTML += extraHtml;
            track.dataset.origHeight = originalHeight;
        }

        if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);

        function animateScroll() {
            tableScrollPos += 1.5;
            wrapper.scrollTop = Math.round(tableScrollPos);

            const limit = parseFloat(track.dataset.origHeight || 0);
            if (limit > 0 && tableScrollPos >= limit) {
                tableScrollPos -= limit;
                wrapper.scrollTop = Math.round(tableScrollPos);
            }
            tableScrollRaf = requestAnimationFrame(animateScroll);
        }

        // 1. ARRANCAMOS EL SCROLL
        tableScrollRaf = requestAnimationFrame(animateScroll);

        // 2. CONFIGURAMOS LA PAUSA (Ponerlo aquí al final)
        wrapper.onmouseenter = () => {
            if (tableScrollRaf) cancelAnimationFrame(tableScrollRaf);
        };

        wrapper.onmouseleave = () => {
            // IMPORTANTE: Volvemos a llamar a la función que acabamos de definir arriba
            tableScrollRaf = requestAnimationFrame(animateScroll);
        };
    });
}

/* ══ WALL STREET WAVES (5 LEVELS, BACKGROUND) ══ */
function initBackground() {
    const canvas = document.getElementById('bg');
    const ctx = canvas.getContext('2d');
    let W, H;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const draw = () => {
        t += 0.0096; // Velocidad de olas incrementada en 30%
        ctx.clearRect(0, 0, W, H);

        const waves = [
            // Parte Superior (KPIs)
            { col: '#00e5ff', amp: H * .05, freq: .004, ph: t * 0.8, y: H * .08 },
            { col: '#00ff88', amp: H * .06, freq: .005, ph: t * 1.2, y: H * .14 },
            { col: '#e040fb', amp: H * .07, freq: .003, ph: t * 1.5, y: H * .20 },

            // Parte Media (Detrás de las barras/reloj)
            { col: '#00e5ff', amp: H * .09, freq: .003, ph: t, y: H * .28 },
            { col: '#e040fb', amp: H * .12, freq: .005, ph: t * 1.5, y: H * .36 },
            { col: '#00ff88', amp: H * .07, freq: .008, ph: t * 2.2, y: H * .44 },
            { col: '#00e5ff', amp: H * .08, freq: .004, ph: t * 1.1, y: H * .52 },
            { col: '#ffff00', amp: H * .10, freq: .006, ph: t * 0.9, y: H * .60 },

            // NUEVAS: Parte Inferior (Detrás de la tabla de proveedores)
            { col: '#00ff88', amp: H * .08, freq: .005, ph: t * 1.3, y: H * .70 },
            { col: '#00e5ff', amp: H * .11, freq: .003, ph: t * 0.7, y: H * .80 },
            { col: '#e040fb', amp: H * .09, freq: .006, ph: t * 1.8, y: H * .90 },
            { col: '#00ff88', amp: H * .06, freq: .004, ph: t * 1.1, y: H * .96 }
        ];

        waves.forEach(w => {
            ctx.beginPath(); ctx.moveTo(0, w.y);
            for (let x = 0; x <= W; x += 4) {
                const noise = Math.sin(x * w.freq + w.ph) * w.amp
                    + Math.sin(x * w.freq * 2.5 + w.ph * 1.5) * w.amp * 0.4
                    + Math.sin(x * w.freq * 4.5 + w.ph * 0.8) * w.amp * 0.2;
                ctx.lineTo(x, w.y + noise);
            }
            ctx.strokeStyle = w.col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
            ctx.shadowColor = w.col; ctx.shadowBlur = 20;
            ctx.stroke();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        });

        // Partículas suaves
        for (let i = 0; i < 30; i++) {
            const px = (Math.sin(i * 7.1 + t * 0.4) * 0.5 + 0.5) * W;
            const py = (Math.cos(i * 3.3 + t * 0.6) * 0.5 + 0.5) * H;
            ctx.fillStyle = i % 2 === 0 ? '#e040fb' : '#00e5ff';
            ctx.globalAlpha = 0.2;
            ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.globalAlpha = 1;
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
}

/* ══ MASTER RENDER ══ */
function render() {
    const records = getFiltered();
    const kpis = calcKPIs(records);
    renderKPIs(kpis);
    animateGaugeTo(kpis.pct);
    updateBatteries(records);
    updateTable(records);
}

/* ══ FIREBASE ══ */
db.ref('datos_dashboard').on('value', snap => {
    const raw = snap.val();
    allRecords = raw ? (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean) : [];
    populateDates(allRecords);
    render();
    const ov = document.getElementById('loading');
    if (!ov.classList.contains('gone')) setTimeout(() => ov.classList.add('gone'), 500);
}, err => {
    console.error(err);
});

document.getElementById('dateFilter').addEventListener('change', render);

// REDIRECCIÓN HOME (PORTAL MAESTRO)
const btnHome = document.getElementById('btnHome');
if (btnHome) {
    btnHome.onclick = () => {
        window.location.href = 'http://10.170.20.169:3004';
    };
}

window.addEventListener('resize', sizeGauge);

/* ══ ON LOAD ══ */
initBackground();
initBubbles();
requestAnimationFrame(() => requestAnimationFrame(sizeGauge));
