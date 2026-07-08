const _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
let flota = [];

async function cargarDatos() {
    const { data, error } = await _supabase
        .from(CONFIG.TABLA)
        .select('*')
        .order('creado_el', { ascending: false });

    if (error) {
        document.getElementById('fleetCounter').innerText = "ERROR DE CONEXIÓN";
        return;
    }

    flota = data;
    render(flota);
}

function render(lista) {
    const grid = document.getElementById('carsGrid');
    document.getElementById('fleetCounter').innerText = `${lista.length} ACTIVOS EN INVENTARIO`;
    
    grid.innerHTML = lista.map(car => `
        <div class="v2-card">
            <div class="card-accent"></div>
            <div class="card-content">
                <h3>${car.marca.toUpperCase()} ${car.modelo.toUpperCase()}</h3>
                <span class="vin">VIN: ${car.vin}</span>
                <div class="price">$${Number(car.precio_venta).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

// BUSCADOR EN TIEMPO REAL
document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtrados = flota.filter(u => 
        u.marca.toLowerCase().includes(term) || u.vin.toLowerCase().includes(term)
    );
    render(filtrados);
});

document.addEventListener('DOMContentLoaded', cargarDatos);