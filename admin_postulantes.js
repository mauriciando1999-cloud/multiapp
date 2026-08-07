const _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

let chartInstance = null;
let todosLosPostulantes = [];
let pActivo = null;

let currentDate = new Date();
let selectedDateObj = null;
let seleccionados = new Set();
let modoCita = 'individual'; 
let postulantesFiltrados = []; 

async function initApp() {
    if (localStorage.getItem('operador_rol') !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    await cargarPostulantes();
    initCustomUI();
}

async function cargarPostulantes() {
    // Solo cargamos los que están activos en el pipeline
    const { data, error } = await _supabase
        .from('postulantes')
        .select('*')
        .in('contratacion', ['evaluado', 'citado']) 
        .order('created_at', { ascending: false });
    
    if (error) return console.error(error);
    
    todosLosPostulantes = data;
    postulantesFiltrados = data;
    seleccionados.clear();
    actualizarBotoneraMasiva();
    document.getElementById('total-postulantes').innerText = data.length;
    renderizarListasKanban(data);
}

// ==========================================
// LÓGICA DE TABLERO KANBAN
// ==========================================
function renderizarListasKanban(lista) {
    postulantesFiltrados = lista; 
    
    // Separamos la data según la columna de la DB "contratacion"
    const nuevos = lista.filter(p => p.contratacion === 'evaluado');
    const citados = lista.filter(p => p.contratacion === 'citado');

    const containerNuevos = document.getElementById('lista-nuevos');
    const containerCitados = document.getElementById('lista-citados');

    containerNuevos.innerHTML = nuevos.length === 0 
        ? `<div class="p-6 text-center text-xs font-bold text-gray-300 uppercase">Sin prospectos nuevos</div>` 
        : buildCardsHTML(nuevos);

    containerCitados.innerHTML = citados.length === 0 
        ? `<div class="p-6 text-center text-xs font-bold text-gray-300 uppercase">Ninguna cita agendada</div>` 
        : buildCardsHTML(citados);
}

function buildCardsHTML(arr) {
    return arr.map(p => {
        const isChecked = seleccionados.has(p.id) ? 'checked' : '';
        const colorPunto = p.contratacion === 'citado' ? 'bg-orange-500' : 'bg-blue-500';
        
        return `
        <div class="bg-white border border-gray-100 p-4 rounded-[20px] hover:border-orange-200 hover:shadow-xl transition-all flex items-center gap-3">
            <div class="checkbox-custom ${isChecked}" onclick="toggleSeleccion(event, '${p.id}')"></div>
            <div class="flex-1 overflow-hidden cursor-pointer flex items-center gap-3" onclick="abrirModalExpediente('${p.id}')">
                <div class="w-10 h-10 rounded-xl bg-gray-50 text-gray-700 flex items-center justify-center font-title italic uppercase border border-gray-200">
                    ${escapeHtml(p.nombre[0])}${p.apellido ? escapeHtml(p.apellido[0]) : ''}
                </div>
                <div class="flex-1 overflow-hidden">
                    <h3 class="font-black text-[10px] uppercase tracking-tighter truncate">${escapeHtml(p.nombre)} ${escapeHtml(p.apellido || '')}</h3>
                    <p class="text-[8px] text-gray-400 font-bold uppercase truncate">${escapeHtml(p.experiencia_declarada || 'Sin Exp.')}</p>
                </div>
                <div class="w-2 h-2 rounded-full flex-shrink-0 ${colorPunto}"></div>
            </div>
        </div>`;
    }).join('');
}

function toggleSeleccion(e, id) {
    e.stopPropagation(); 
    seleccionados.has(id) ? seleccionados.delete(id) : seleccionados.add(id);
    renderizarListasKanban(postulantesFiltrados);
    actualizarBotoneraMasiva();
}

function seleccionarVisibles() {
    if (seleccionados.size === postulantesFiltrados.length && postulantesFiltrados.length > 0) {
        seleccionados.clear(); 
    } else {
        postulantesFiltrados.forEach(p => seleccionados.add(p.id));
    }
    renderizarListasKanban(postulantesFiltrados);
    actualizarBotoneraMasiva();
}

function actualizarBotoneraMasiva() {
    const btn = document.getElementById('btn-cita-masiva');
    const count = seleccionados.size;
    btn.innerText = `Agendar Seleccionados (${count})`;
    if (count > 0) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.classList.add('shadow-lg', 'shadow-orange-200');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.classList.remove('shadow-lg', 'shadow-orange-200');
    }
}

function filtrarLista() {
    const texto = document.getElementById('buscador').value.toLowerCase();
    renderizarListasKanban(todosLosPostulantes.filter(p => `${p.nombre} ${p.apellido}`.toLowerCase().includes(texto)));
}

// ==========================================
// EXPEDIENTE INDIVIDUAL
// ==========================================
async function abrirModalExpediente(id) {
    pActivo = todosLosPostulantes.find(x => x.id === id);
    if (!pActivo) return;

    document.getElementById('modal-expediente').classList.remove('hidden');
    document.getElementById('det-nombre').innerText = `${pActivo.nombre} ${pActivo.apellido || ''}`;
    document.getElementById('det-telefono').innerText = pActivo.telefono;
    document.getElementById('det-correo').innerText = pActivo.correo || 'CORREO NO REGISTRADO';
    document.getElementById('det-desc').innerText = pActivo.descripcion_perfil || 'Sin detalles.';
    document.getElementById('det-exp').innerText = pActivo.experiencia_declarada;
    document.getElementById('det-resumen-ia').innerText = pActivo.resumen_ia || 'Análisis en proceso...';
    
    // El Badge ahora lee 'contratacion'
    const badge = document.getElementById('det-estatus');
    badge.innerText = (pActivo.contratacion || 'evaluado').toUpperCase();
    badge.className = pActivo.contratacion === 'citado' 
        ? "bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest" 
        : "bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest";

    const fotoEl = document.getElementById('det-foto');
    if (fotoEl && pActivo.foto_url) {
        fotoEl.src = _supabase.storage.from('vendedores_fotos').getPublicUrl(pActivo.foto_url).data.publicUrl;
    }

    const cvEl = document.getElementById('btn-cv');
    if (cvEl && pActivo.cv_url) {
        cvEl.href = _supabase.storage.from('curriculums').getPublicUrl(pActivo.cv_url).data.publicUrl;
    }

    renderRadar(pActivo.habilidades_ia || []);
}

// ==========================================
// DECISIONES DE NEGOCIO (CONTRATAR / RECHAZAR)
// ==========================================
function abrirModalContrato() {
    cerrarModal('modal-expediente');
    
    document.getElementById('contrato-nombre').value = pActivo.nombre;
    document.getElementById('contrato-apellido').value = pActivo.apellido || '';
    document.getElementById('contrato-whatsapp').value = pActivo.telefono || '';
    
    const baseSlug = `${pActivo.nombre}-${pActivo.apellido || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    document.getElementById('contrato-slug').value = baseSlug;
    document.getElementById('contrato-cedula').value = ''; 
    
    document.getElementById('modal-contrato').classList.remove('hidden');
}

async function guardarNuevoVendedor() {
    const nombre = document.getElementById('contrato-nombre').value;
    const apellido = document.getElementById('contrato-apellido').value;
    const cedula = document.getElementById('contrato-cedula').value;
    const whatsapp = document.getElementById('contrato-whatsapp').value;
    const slug = document.getElementById('contrato-slug').value;

    if (!cedula) return alert("⚠️ La cédula es obligatoria.");

    const btn = document.getElementById('btn-guardar-vendedor');
    btn.innerText = "MIGRANDO..."; btn.disabled = true;

    try {
        const { error: errVendedor } = await _supabase.from('vendedores').insert([{
            nombre: nombre, apellido: apellido, cedula: cedula, whatsapp: whatsapp, slug: slug, activo: true
        }]);

        if (errVendedor) throw errVendedor;

        const { error: errPostulante } = await _supabase.from('postulantes').update({ contratacion: 'contratado' }).eq('id', pActivo.id);
        if (errPostulante) throw errPostulante;

        alert("✅ Candidato contratado y añadido a Vendedores.");
        cerrarModal('modal-contrato');
        cargarPostulantes(); 

    } catch (e) {
        alert("Error de DB: " + e.message);
    } finally {
        btn.innerText = "Guardar Vendedor"; btn.disabled = false;
    }
}

async function cambiarEstatus(nuevoEstatus) {
    if (!confirm(`¿Confirmas marcar a ${pActivo.nombre} como ${nuevoEstatus}?`)) return;
    try {
        const { error } = await _supabase.from('postulantes').update({ contratacion: nuevoEstatus.toLowerCase() }).eq('id', pActivo.id);
        if (error) throw error;
        alert(`✅ Candidato descartado.`);
        cerrarModal('modal-expediente');
        cargarPostulantes(); 
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ==========================================
// UI CUSTOM (CALENDARIO Y RELOJ)
// ==========================================
function initCustomUI() { renderCalendar(); renderDial(); }

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = firstDay === 0 ? 6 : firstDay - 1; 
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;
    const daysContainer = document.getElementById('cal-days');
    daysContainer.innerHTML = '';

    for (let i = 0; i < startDay; i++) daysContainer.innerHTML += `<div class="day-btn empty"></div>`;
    const hoy = new Date(); hoy.setHours(0,0,0,0);

    for (let i = 1; i <= daysInMonth; i++) {
        const currentIterDate = new Date(year, month, i);
        const isSelected = selectedDateObj && selectedDateObj.getTime() === currentIterDate.getTime();
        const isPast = currentIterDate < hoy;
        daysContainer.innerHTML += `<div class="day-btn ${isSelected ? 'selected' : ''} ${isPast ? 'opacity-30 cursor-not-allowed' : ''}" onclick="${isPast ? '' : `seleccionarDia(${year}, ${month}, ${i})`}">${i}</div>`;
    }
}

function cambiarMes(offset) { currentDate.setMonth(currentDate.getMonth() + offset); renderCalendar(); }

function seleccionarDia(year, month, day) {
    selectedDateObj = new Date(year, month, day);
    const fMes = String(month + 1).padStart(2, '0');
    const fDia = String(day).padStart(2, '0');
    document.getElementById('hidden-fecha').value = `${year}-${fMes}-${fDia}`;
    renderCalendar();
}

function renderDial() {
    const container = document.getElementById('dial-container');
    const horas = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const radius = 85; 

    horas.forEach((hora, index) => {
        const angle = (index * 30) - 90; 
        const rad = angle * (Math.PI / 180);
        const x = radius * Math.cos(rad) + 110; 
        const y = radius * Math.sin(rad) + 110;
        const horaText = `${String(hora).padStart(2, '0')}:00`;
        
        const el = document.createElement('div');
        el.className = 'dial-number';
        el.innerText = hora;
        el.style.left = `${x}px`; el.style.top = `${y}px`;
        
        el.onclick = () => {
            document.getElementById('dial-needle').style.transform = `rotate(${index * 30}deg)`;
            document.querySelectorAll('.dial-number').forEach(n => n.classList.remove('selected'));
            el.classList.add('selected');
            document.getElementById('hora-display').innerText = horaText;
            document.getElementById('hidden-hora').value = horaText;
        };
        container.appendChild(el);
    });
}

function resetearUICita() {
    selectedDateObj = null;
    document.getElementById('hidden-fecha').value = '';
    document.getElementById('hidden-hora').value = '';
    document.getElementById('hora-display').innerText = '--:--';
    document.getElementById('dial-needle').style.transform = 'rotate(0deg)';
    document.querySelectorAll('.dial-number').forEach(n => n.classList.remove('selected'));
    renderCalendar();
}

// ==========================================
// LÓGICA DE CITAS Y CORREOS
// ==========================================
function abrirModalCitaIndividual() {
    if (!pActivo.correo) return alert("El prospecto no tiene correo registrado.");
    modoCita = 'individual';
    document.getElementById('cita-titulo').innerText = 'Cita Individual';
    document.getElementById('cita-prospecto-nombre').innerText = `Prospecto: ${pActivo.nombre} ${pActivo.apellido || ''}`;
    resetearUICita();
    cerrarModal('modal-expediente');
    document.getElementById('modal-cita').classList.remove('hidden');
}

function abrirModalCitaMasiva() {
    if (seleccionados.size === 0) return;
    modoCita = 'masiva';
    document.getElementById('cita-titulo').innerText = 'Agendamiento en Lote';
    document.getElementById('cita-prospecto-nombre').innerText = `Se enviará invitación a ${seleccionados.size} candidatos`;
    resetearUICita();
    document.getElementById('modal-cita').classList.remove('hidden');
}

function cerrarModal(id) { document.getElementById(id).classList.add('hidden'); }

async function confirmarYEnviarCita() {
    const fecha = document.getElementById('hidden-fecha').value;
    const hora = document.getElementById('hidden-hora').value;
    const lugarFijo = "Sede Principal Multiamerica, Caracas";

    if (!fecha || !hora) return alert("⚠️ Selecciona el día y la hora.");

    const btn = event.target;
    btn.innerText = "Enviando y Moviendo..."; 
    btn.disabled = true;

    try {
        let idsProcesados = [];

        // 1. ENVIAR CORREOS
        if (modoCita === 'individual') {
            const { error: invokeErr } = await _supabase.functions.invoke('enviar-cita', { 
                body: { email: pActivo.correo, nombre: pActivo.nombre, tipo: 'Entrevista Presencial', detalles: { fecha, hora, lugar: lugarFijo } } 
            });
            if (invokeErr) throw new Error("Error al enviar correo: " + invokeErr.message);
            idsProcesados.push(pActivo.id);
        } else {
            const arraySeleccionados = Array.from(seleccionados);
            const promesas = arraySeleccionados.map(async (id) => {
                const cand = todosLosPostulantes.find(p => p.id === id);
                if (!cand || !cand.correo) return Promise.resolve(); 
                
                const { error: invokeErr } = await _supabase.functions.invoke('enviar-cita', { 
                    body: { email: cand.correo, nombre: cand.nombre, tipo: 'Entrevista Presencial', detalles: { fecha, hora, lugar: lugarFijo } } 
                });
                if (invokeErr) throw new Error(invokeErr.message);
                return id;
            });
            await Promise.all(promesas);
            idsProcesados = arraySeleccionados;
        }

        // 2. MOVER LA TARJETA EN LA BASE DE DATOS
        if (idsProcesados.length > 0) {
            // Actualizamos uno por uno para garantizar que PostgreSQL no falle
            for (let idCandidato of idsProcesados) {
                const { error: dbErr } = await _supabase
                    .from('postulantes')
                    .update({ contratacion: 'citado' })
                    .eq('id', idCandidato);
                
                if (dbErr) throw new Error("Se envió el correo, pero la BD bloqueó el movimiento: " + dbErr.message);
            }
        }
        
        alert("✅ Citas enviadas. Moviendo a la columna 'Entrevista Programada'.");
        cerrarModal('modal-cita');
        
        // Refrescar el Tablero Kanban para ver el cambio inmediato
        cargarPostulantes(); 

    } catch (err) { 
        console.error(err);
        alert("Error: " + err.message); 
    } finally { 
        btn.innerText = "Confirmar e Invitar"; 
        btn.disabled = false; 
    }
}

// ==========================================
// RADAR Y PDF
// ==========================================
function renderRadar(habilidadesRaw) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;
    let labels = ["Ventas", "Cierre", "CRM", "Negociación", "Energía"];
    let dataValues = [0, 0, 0, 0, 0];
    
    try {
        let habilidades = typeof habilidadesRaw === 'string' ? JSON.parse(habilidadesRaw) : habilidadesRaw;
        if (Array.isArray(habilidades) && habilidades.length > 0) {
            labels = habilidades.map(h => h.skill || h.habilidad || "Competencia");
            dataValues = habilidades.map(h => h.score || h.puntaje || 0);
        }
    } catch (e) { console.error("Error procesando radar:", e); }

    if (chartInstance) chartInstance.destroy();

    setTimeout(() => {
        chartInstance = new Chart(ctx, {
            type: 'radar',
            data: { labels: labels, datasets: [{ data: dataValues, borderColor: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.1)', borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#ea580c' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { r: { suggestedMin: 0, suggestedMax: 10, ticks: { display: false }, angleLines: { color: 'rgba(0,0,0,0.05)' }, grid: { color: 'rgba(0,0,0,0.05)' }, pointLabels: { font: { size: 10, weight: '900' }, color: '#000' } } }, plugins: { legend: { display: false } } }
        });
    }, 50);
}

async function generarFichaPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const primaryColor = [234, 88, 12];
    doc.setFillColor(...primaryColor); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont("helvetica", "bold"); doc.text("TALENTO IA", 20, 20); doc.setFontSize(10); doc.text("INFORME ESTRATÉGICO DE EVALUACIÓN | MULTIAMERICA", 20, 28);
    doc.setTextColor(0, 0, 0); doc.setFontSize(16); doc.text(`${pActivo.nombre} ${pActivo.apellido || ''}`, 20, 55);
    doc.line(20, 58, 190, 58); doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.text("DATOS DE CONTACTO", 20, 68);
    doc.setTextColor(0, 0, 0); doc.text(`Teléfono: ${pActivo.telefono}`, 20, 75); doc.text(`Correo: ${pActivo.correo || 'N/R'}`, 20, 81);
    doc.setFillColor(254, 249, 239); doc.roundedRect(20, 95, 170, 50, 5, 5, 'F');
    doc.setTextColor(...primaryColor); doc.text("ANÁLISIS ESTRATÉGICO GEMINI IA", 25, 102);
    doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "italic"); doc.text(doc.splitTextToSize(pActivo.resumen_ia || "Pendiente", 160), 25, 109);
    doc.addImage(document.getElementById('radarChart').toDataURL("image/png"), 'PNG', 45, 165, 120, 100);
    doc.save(`Ficha_${pActivo.nombre}.pdf`);
}

document.addEventListener('DOMContentLoaded', initApp);