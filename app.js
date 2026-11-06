/* ALMA - La interfaz y la lógica principal están implementadas en JavaScript. */
const $ = (id) => document.getElementById(id);
const palette = { teal: '#269E9B', aqua: '#66B9D8', orange: '#E99832', green: '#7EAB61', red: '#D65B4B' };
const climateZones = {
  nino34: { title: 'Niño 3.4 · Pacífico central', description: 'Región de referencia principal para el seguimiento del ENSO.', lat: 0, lng: -120, sstLat: 0, sstLng: -120, color: palette.aqua },
  nino12: { title: 'Niño 1+2 · Costa de Sudamérica', description: 'Sector oriental del Pacífico ecuatorial, cercano a Ecuador y Perú.', lat: -5, lng: -85, sstLat: -5, sstLng: -85, color: palette.teal },
  sudamerica: { title: 'Sudamérica · referencia', description: 'Punto de referencia para relacionar el océano con el tiempo regional.', lat: -25, lng: -58, sstLat: -25, sstLng: -58, color: palette.orange }
};
let globeInstance = null;
let globeRotating = true;
let currentClimateZone = 'nino34';
let currentClimateSelection = { lat: 0, lng: -120, label: 'Niño 3.4 · Pacífico central' };
let currentSstAnomaly = null;
let ensoHeatPoints = [];
let ensoGridDate = null;
let climateRequestToken = 0;
const ensoPolygons = [
  { id: 'nino34', name: 'Región Niño 3.4', color: '#66B9D8', geometry: { type: 'Polygon', coordinates: [[[-170,-5],[-120,-5],[-120,5],[-170,5],[-170,-5]]] } },
  { id: 'nino12', name: 'Región Niño 1+2', color: '#269E9B', geometry: { type: 'Polygon', coordinates: [[[-90,-10],[-80,-10],[-80,0],[-90,0],[-90,-10]]] } }
];
const riverMaps = {};
const riverData = {
  lujan: {
    mapId: 'mapLujan', infoId: 'lujanInfo', center: [-34.55, -59.15], zoom: 9,
    line: [[-34.77,-59.69],[-34.70,-59.55],[-34.65,-59.42],[-34.61,-59.27],[-34.58,-59.13],[-34.53,-58.99],[-34.48,-58.84],[-34.43,-58.69],[-34.40,-58.57]],
    zones: [
      {id:'alta',name:'Cuenca alta · Suipacha',lat:-34.77,lng:-59.69,quality:'Buena',qualityClass:'status-green',level:'1,2 m',risk:'Bajo',turbidity:'18 NTU',waste:'5 U/L',oxygen:'8,2 mg/L',notes:'Sector de referencia aguas arriba. Conviene mantener el control de descargas y márgenes.'},
      {id:'media',name:'Cuenca media · Luján',lat:-34.57,lng:-59.10,quality:'Moderada',qualityClass:'status-orange',level:'2,8 m',risk:'Medio',turbidity:'35 NTU',waste:'12 U/L',oxygen:'7,1 mg/L',notes:'Observar cambios de nivel luego de lluvias y evitar arrojar residuos al cauce.'},
      {id:'baja',name:'Cuenca baja · Tigre',lat:-34.42,lng:-58.58,quality:'Atención',qualityClass:'status-red',level:'3,1 m',risk:'Elevado',turbidity:'49 NTU',waste:'19 U/L',oxygen:'5,6 mg/L',notes:'Sector cercano a la desembocadura. Prestar atención a crecidas y acumulación de residuos.'}
    ]
  },
  matanza: {
    mapId: 'mapMatanza', infoId: 'matanzaInfo', center: [-34.75, -58.55], zoom: 10,
    line: [[-35.05,-58.76],[-34.98,-58.72],[-34.91,-58.69],[-34.84,-58.65],[-34.78,-58.63],[-34.73,-58.60],[-34.69,-58.55],[-34.66,-58.46],[-34.65,-58.36]],
    zones: [
      {id:'alta',name:'Cuenca alta · Cañuelas',lat:-35.05,lng:-58.76,quality:'Moderada',qualityClass:'status-orange',level:'0,9 m',risk:'Medio',turbidity:'31 NTU',waste:'10 U/L',oxygen:'6,8 mg/L',notes:'En la cuenca alta es importante vigilar los aportes rurales y conservar las zonas de ribera.'},
      {id:'media',name:'Cuenca media · La Matanza',lat:-34.78,lng:-58.63,quality:'Crítica',qualityClass:'status-red',level:'1,4 m',risk:'Elevado',turbidity:'72 NTU',waste:'28 U/L',oxygen:'3,9 mg/L',notes:'Área urbana e industrial. Evitá el contacto con el agua y reportá vuelcos o residuos.'},
      {id:'baja',name:'Cuenca baja · Avellaneda',lat:-34.65,lng:-58.36,quality:'Crítica',qualityClass:'status-red',level:'1,7 m',risk:'Elevado',turbidity:'80 NTU',waste:'34 U/L',oxygen:'3,2 mg/L',notes:'Tramo próximo al Río de la Plata. Requiere monitoreo sostenido y atención a las alertas oficiales.'}
    ]
  }
};

function goToView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  document.querySelector('.main-nav').classList.remove('open');
  if (view === 'lujan' || view === 'matanza') setTimeout(() => riverMaps[view]?.map?.invalidateSize(), 120);
  if (view === 'inicio' && globeInstance) setTimeout(() => globeInstance.width($('globeViz').clientWidth).height($('globeViz').clientHeight), 80);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => goToView(btn.dataset.nav)));
$('menuToggle').addEventListener('click', () => document.querySelector('.main-nav').classList.toggle('open'));
$('refreshAll').addEventListener('click', () => { refreshClimate(); refreshActiveRiver(); loadEnsoHeatmap(); });
$('footerClock').textContent = new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date());

async function loadEarthTexture(urls) {
  for (const url of urls) {
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(url);
        img.onerror = reject;
        img.src = url;
      });
      return url;
    } catch (_) { /* probar el siguiente servidor de imágenes */ }
  }
  throw new Error('No se pudo descargar la textura cartográfica de la Tierra.');
}

async function initGlobe() {
  const target = $('globeViz');
  if (!target) return;
  if (!window.Globe) { renderGlobeUnavailable('No se pudo cargar Globe.gl. Comprobá tu conexión e intentá recargar.'); return; }
  try {
    const earthTexture = await loadEarthTexture([
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-blue-marble.jpg'
    ]);
    const regionPoints = Object.entries(climateZones).map(([id,z]) => ({ id, lat:z.lat, lng:z.lng, color:z.color, label:z.title, kind:'region' }));
    globeInstance = Globe()(target)
      .globeImageUrl(earthTexture)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#66B9D8').atmosphereAltitude(0.16)
      .showGraticules(true)
      .polygonsData(ensoPolygons)
      .polygonCapColor(p => p.id === 'nino34' ? 'rgba(102,185,216,0.34)' : 'rgba(38,158,155,0.38)')
      .polygonSideColor(() => 'rgba(20,80,90,0.12)')
      .polygonStrokeColor(p => p.color)
      .polygonAltitude(0.012)
      .polygonLabel(p => `<b>${p.name}</b><br>Seleccioná para consultar NOAA OISST`)
      .onPolygonClick(p => selectClimateZone(p.id))
      .pointsData(regionPoints)
      .pointLat('lat').pointLng('lng').pointColor('color')
      .pointAltitude(p => p.kind === 'selected' ? 0.035 : (p.kind === 'heat' ? 0.008 : 0.018))
      .pointRadius(p => p.kind === 'heat' ? 0.95 : 0.42).pointResolution(18)
      .pointLabel(p => p.label || p.title || 'Punto seleccionado')
      .onPointClick(p => p.kind === 'region' ? selectClimateZone(p.id) : selectClimateLocation(p.lat, p.lng))
      .onGlobeClick(({lat,lng}) => selectClimateLocation(lat,lng));

    const controls = globeInstance.controls();
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.22;
    globeRotating = true;
    globeInstance.pointOfView({lat:-2,lng:-125,altitude:1.9},900);
    $('globeFallback').style.display = 'none';
    const resize = () => { if (globeInstance) globeInstance.width(target.clientWidth).height(target.clientHeight); };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(target); else window.addEventListener('resize',resize);
    updateGlobeSelectionMarker(0,-120);
    loadEnsoHeatmap();
    $('globeRotate').textContent = 'Ⅱ';
  } catch (error) {
    console.error('No se pudo iniciar el globo geográfico:', error);
    globeInstance = null;
    renderGlobeUnavailable('No se pudo descargar la textura real del planeta. Revisá que el navegador tenga acceso a unpkg.com o GitHub y recargá.');
  }
}

function renderGlobeUnavailable(message) {
  const host = $('globeViz');
  if (!host) return;
  $('globeFallback').style.display = 'none';
  host.innerHTML = `<div class="globe-unavailable"><div class="globe-unavailable-icon">🌐</div><strong>Globo geográfico no disponible</strong><p>${escapeHTML(message)}</p><button type="button" id="retryGlobe" class="retry-globe">Reintentar carga</button><small>No se muestra un mapa ilustrado como reemplazo.</small></div>`;
  $('retryGlobe')?.addEventListener('click', () => { host.innerHTML = ''; $('globeFallback').style.display = 'grid'; $('globeFallback').textContent = 'Cargando globo 3D…'; initGlobe(); });
}

function updateGlobeSelectionMarker(lat,lng) {
  if (!globeInstance) return;
  const regionPoints = Object.entries(climateZones).map(([id,z]) => ({ id, lat:z.lat, lng:z.lng, color:z.color, label:z.title, kind:'region' }));
  const selectedPoint = { id:'selected', lat, lng, color:palette.orange, label:'Punto que seleccionaste', kind:'selected' };
  globeInstance.pointsData([...ensoHeatPoints, ...regionPoints, selectedPoint]);
}

function anomalyColor(value) {
  if (value <= -1.0) return '#2E5F82';
  if (value <= -0.5) return '#66B9D8';
  if (value < 0.5) return '#7EAB61';
  if (value < 1.0) return '#E99832';
  return '#D65B4B';
}

async function loadEnsoHeatmap() {
  try {
    const res = await fetch('/api/enso-grid');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Malla NOAA no disponible');
    ensoGridDate = data.date;
    ensoHeatPoints = (data.points || []).map((p,i) => ({
      id: `oisst-${i}`, lat:p.lat, lng:p.lng, kind:'heat', color:anomalyColor(p.anomaly_c),
      label:`NOAA OISST · anomalía ${p.anomaly_c > 0 ? '+' : ''}${p.anomaly_c.toFixed(2)} °C · ${data.date}`,
      anomaly:p.anomaly_c
    }));
    if (globeInstance) updateGlobeSelectionMarker(currentClimateSelection.lat,currentClimateSelection.lng);
    const count = ensoHeatPoints.length;
    $('ensoLayerStatus').textContent = `Capa NOAA OISST v2.1 · ${count} puntos coloreados según anomalía diaria · malla visual 2,5° · fecha ${data.date}. Producto preliminar, aprox. 1 día de demora.`;
  } catch (error) {
    console.warn('No se pudo obtener la malla NOAA OISST:', error);
    $('ensoLayerStatus').textContent = 'No se pudo descargar la capa diaria NOAA. El globo geográfico sigue disponible; revisá la conexión e intentá actualizar.';
  }
}

function zoomGlobe(factor) {
  if (!globeInstance) return;
  const pov = globeInstance.pointOfView();
  const next = Math.max(0.72, Math.min(4.5, pov.altitude * factor));
  globeInstance.pointOfView({lat:pov.lat,lng:pov.lng,altitude:next},350);
}

$('globeRotate').addEventListener('click', () => {
  if (!globeInstance) return;
  globeRotating = !globeRotating;
  globeInstance.controls().autoRotate = globeRotating;
  $('globeRotate').textContent = globeRotating ? 'Ⅱ' : '⟳';
});
$('globeZoomIn').addEventListener('click', () => zoomGlobe(0.78));
$('globeZoomOut').addEventListener('click', () => zoomGlobe(1.28));
$('globeReset').addEventListener('click', () => globeInstance?.pointOfView({lat:-2,lng:-125,altitude:1.9},850));
document.querySelectorAll('[data-climate]').forEach(btn => btn.addEventListener('click', () => selectClimateZone(btn.dataset.climate)));

function longitudeText(lng) { return `${Math.abs(lng).toFixed(2)}° ${lng < 0 ? 'O' : 'E'}`; }
function inferOceanRegion(lat,lng) {
  if (lat >= -5 && lat <= 5 && lng >= -170 && lng <= -120) return 'Pacífico ecuatorial central · Región Niño 3.4';
  if (lat >= -10 && lat <= 0 && lng >= -90 && lng <= -80) return 'Pacífico oriental ecuatorial · Región Niño 1+2';
  if (lng < -100 && lat >= -25 && lat <= 25) return 'Océano Pacífico';
  if (lng > -80 && lng < 20 && lat >= -40 && lat <= 35) return 'Atlántico';
  if (lng >= 20 && lng < 145 && lat >= -50 && lat <= 50) return 'Índico / Pacífico occidental';
  return 'Punto geográfico seleccionado';
}

function selectClimateZone(id) {
  const z = climateZones[id];
  if (!z) return;
  currentClimateZone = id;
  const label = z.title;
  selectClimateLocation(z.lat, z.lng, label);
}

async function selectClimateLocation(lat,lng,label=null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  lat = Math.max(-90, Math.min(90, lat));
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  const token = ++climateRequestToken;
  const place = label || inferOceanRegion(lat,lng);
  currentClimateSelection = {lat,lng,label:place};
  const matchingZone = Object.entries(climateZones).find(([,zone]) => zone.title === place);
  currentClimateZone = matchingZone ? matchingZone[0] : null;
  document.querySelectorAll('[data-climate]').forEach(b => b.classList.toggle('selected', !!currentClimateZone && b.dataset.climate === currentClimateZone));
  $('climateZoneTitle').textContent = place;
  $('climateZoneDescription').textContent = label ? 'Región de referencia seleccionada en el globo.' : 'Punto elegido directamente sobre la superficie terrestre. Hacé clic en otro lugar para cambiar la consulta.';
  $('selectionCoordinates').textContent = `Latitud: ${lat.toFixed(2)}° · Longitud: ${longitudeText(lng)}`;
  $('sstValue').textContent = '…'; $('sstLabel').textContent = 'Consultando modelo marino…';
  $('sstAnomalyValue').textContent = '…'; $('sstAnomalyDate').textContent = 'Consultando NOAA OISST…';
  $('weatherPlace').textContent = `Referencia: ${place}`;
  if (globeInstance) {
    globeInstance.controls().autoRotate = false;
    globeRotating = false;
    $('globeRotate').textContent = '⟳';
    globeInstance.pointOfView({lat,lng,altitude:1.35},700);
    updateGlobeSelectionMarker(lat,lng);
  }
  const results = await Promise.allSettled([loadMarineSst(lat,lng,token),loadNoaaAnomaly(lat,lng,token),loadWeather(lat,lng,place)]);
  if (token !== climateRequestToken) return;
  buildClimateAdvice();
  $('homeUpdated').textContent = `Última consulta: ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
}

async function loadMarineSst(lat,lng,token) {
  try {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=sea_surface_temperature&timezone=auto`;
    const res = await fetch(url); if (!res.ok) throw new Error('API marina no disponible');
    const data = await res.json(); const sst = data.current?.sea_surface_temperature;
    if (token !== climateRequestToken) return;
    $('sstValue').textContent = Number.isFinite(sst) ? `${sst.toFixed(1)} °C` : 'N/D';
    $('sstLabel').textContent = data.current?.time ? `Modelo marino · ${data.current.time.replace('T',' ')}` : 'Sin dato marino para esta coordenada';
  } catch (_) {
    if (token !== climateRequestToken) return;
    $('sstValue').textContent = 'N/D'; $('sstLabel').textContent = 'Sin dato marino en este punto';
  }
}

async function loadNoaaAnomaly(lat,lng,token) {
  try {
    const res = await fetch(`/api/oisst?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`);
    const info = await res.json();
    if (!res.ok) throw new Error(info.detail || info.error || 'NOAA no disponible');
    if (token !== climateRequestToken) return;
    currentSstAnomaly = Number(info.anomaly_c);
    $('sstAnomalyValue').textContent = `${currentSstAnomaly > 0 ? '+' : ''}${currentSstAnomaly.toFixed(2)} °C`;
    $('sstAnomalyDate').textContent = `NOAA OISST · ${String(info.date || '').replace('T',' ').replace('Z',' UTC')}`;
    $('sstAnomalySource').textContent = 'Anomalía diaria NOAA OISST v2.1 preliminar · grilla 0,25° · aprox. 1 día de demora. Anomalía = diferencia respecto de la climatología de referencia.';
  } catch (error) {
    if (token !== climateRequestToken) return;
    currentSstAnomaly = null;
    $('sstAnomalyValue').textContent = 'N/D';
    $('sstAnomalyDate').textContent = 'Sin dato oceánico para este punto';
    $('sstAnomalySource').textContent = `NOAA no devolvió un valor para esta coordenada. Puede ser tierra, una celda sin dato o una falla de conexión. ${String(error.message || '').slice(0,100)}`;
  }
}

async function loadONI() {
  try {
    const res = await fetch('/api/oni'); if (!res.ok) throw new Error('No se pudo consultar NOAA');
    const info = await res.json();
    $('oniValue').textContent = `${info.anomaly > 0 ? '+' : ''}${Number(info.anomaly).toFixed(2)} °C`;
    $('oniPeriod').textContent = `${info.season} ${info.year} · anomalía Niño 3.4`;
    $('oniSource').textContent = 'Fuente: NOAA/CPC. ONI = promedio móvil de 3 meses; se actualiza mensualmente, no en tiempo real.';
  } catch (e) { $('oniValue').textContent = 'N/D'; $('oniPeriod').textContent = 'No se pudo leer NOAA'; $('oniSource').textContent = 'Abrí el proyecto con app.py y comprobá tu conexión para consultar el índice oficial.'; }
}
async function loadWeather(lat,lng,place) {
  $('weatherPlace').textContent = `Referencia: ${place}`;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=America%2FArgentina%2FBuenos_Aires`;
    const res = await fetch(url); if (!res.ok) throw new Error('Pronóstico no disponible');
    const d = await res.json(), c = d.current || {};
    $('weatherTemp').textContent = Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°` : '—°';
    $('weatherRain').textContent = Number.isFinite(c.precipitation) ? `${c.precipitation.toFixed(1)} mm` : '— mm';
    $('weatherWind').textContent = Number.isFinite(c.wind_speed_10m) ? `${Math.round(c.wind_speed_10m)} km/h` : '— km/h';
    $('weatherHumidity').textContent = Number.isFinite(c.relative_humidity_2m) ? `${Math.round(c.relative_humidity_2m)}%` : '—%';
    $('weatherSummary').textContent = weatherText(c.weather_code);
    $('weatherIcon').textContent = weatherIcon(c.weather_code);
    return d;
  } catch (e) { $('weatherTemp').textContent='—°'; $('weatherSummary').textContent='No se pudo conectar con Open-Meteo'; $('weatherRain').textContent='— mm'; $('weatherWind').textContent='— km/h'; $('weatherHumidity').textContent='—%'; $('weatherIcon').textContent='☁'; }
}
function weatherText(code) { if (code === 0) return 'Cielo despejado'; if ([1,2,3].includes(code)) return 'Parcialmente nublado'; if ([45,48].includes(code)) return 'Niebla'; if ([51,53,55,56,57].includes(code)) return 'Llovizna'; if ([61,63,65,66,67,80,81,82].includes(code)) return 'Lluvia o chaparrones'; if ([71,73,75,77,85,86].includes(code)) return 'Nieve / aguanieve'; if ([95,96,99].includes(code)) return 'Tormenta'; return 'Condición meteorológica actual'; }
function weatherIcon(code) { if (code===0) return '☀'; if ([1,2,3,45,48].includes(code)) return '☁'; if ([95,96,99].includes(code)) return '⛈'; if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧'; return '🌤'; }
function buildClimateAdvice() {
  const temp = parseFloat($('weatherTemp').textContent), rain = parseFloat($('weatherRain').textContent), wind = parseFloat($('weatherWind').textContent);
  const items = [];
  if (Number.isFinite(rain) && rain >= 10) items.push('Se registra precipitación: seguí los avisos oficiales y prestá atención a posibles anegamientos.');
  else items.push('Revisá los pronósticos locales antes de planificar actividades al aire libre.');
  if (Number.isFinite(wind) && wind >= 40) items.push('Viento intenso: asegurá objetos sueltos y evitá zonas arboladas durante ráfagas.');
  if (Number.isFinite(temp) && temp >= 30) items.push('Temperatura elevada: hidratate y evitá la exposición prolongada al sol.');
  if (items.length===1) items.push('No reemplaza las alertas del Servicio Meteorológico Nacional ni la información de Defensa Civil.');
  $('climateAdvice').innerHTML = `<ul>${items.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul><div class="advice-alert">El índice ENSO describe un patrón climático de gran escala; no predice por sí solo el tiempo de una localidad.</div>`;
}
function refreshClimate() { loadONI(); const p = currentClimateSelection || {lat:0,lng:-120,label:'Niño 3.4 · Pacífico central'}; selectClimateLocation(p.lat,p.lng,p.label); }

function escapeHTML(text) { return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function markerIcon(color) { return L.divIcon({className:'custom-station',html:`<span class="station-icon" style="background:${color}"></span>`,iconSize:[18,18],iconAnchor:[9,9]}); }
function renderFallbackRiverMap(key) {
  const cfg = riverData[key], host = $(cfg.mapId);
  if (!host) return;
  const title = key === 'lujan' ? 'RÍO LUJÁN · RECORRIDO ESQUEMÁTICO' : 'CUENCA MATANZA–RIACHUELO · RECORRIDO ESQUEMÁTICO';
  const places = key === 'lujan'
    ? [{label:'Suipacha',x:13,y:20},{label:'Mercedes',x:31,y:31},{label:'Luján',x:51,y:48},{label:'Pilar',x:70,y:58},{label:'Tigre',x:87,y:76}]
    : [{label:'Cañuelas',x:15,y:22},{label:'Virrey del Pino',x:35,y:38},{label:'La Matanza',x:55,y:52},{label:'Avellaneda',x:79,y:69},{label:'Río de la Plata',x:91,y:83}];
  host.innerHTML = `<div class="river-fallback-map"><div class="fallback-map-grid"></div><div class="fallback-map-title">${title}</div>
    <svg viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 130 Q130 50 220 160 T420 230 T620 330 T820 420 T1000 540" fill="none" stroke="#A7C994" stroke-width="110" opacity=".36"/>
      <path d="M0 490 Q170 420 280 450 T510 370 T740 290 T1000 150" fill="none" stroke="#B8D6A2" stroke-width="95" opacity=".28"/>
      <path d="M-20 560 C130 480 160 300 300 325 S470 455 570 350 S755 230 1020 100" fill="none" stroke="#E8F2D8" stroke-width="42" opacity=".65"/>
      <path d="M-20 560 C130 480 160 300 300 325 S470 455 570 350 S755 230 1020 100" fill="none" stroke="#269E9B" stroke-width="13" stroke-linecap="round"/>
      <path d="M0 220L1000 390 M140 0L440 650 M720 0L550 650 M0 590L1000 40" stroke="#DCE6D6" stroke-width="5" opacity=".7"/>
    </svg>
    <div class="fallback-water-label">${key==='lujan'?'Río Luján':'Matanza–Riachuelo'}</div>
    ${cfg.zones.map((z,i)=>`<button class="fallback-station station-${z.id}" style="left:${[17,51,84][i]}%;top:${[25,49,75][i]}%" data-zone="${z.id}" aria-label="Seleccionar ${escapeHTML(z.name)}"><i></i><span>${escapeHTML(z.name)}</span></button>`).join('')}
    <div class="fallback-map-legend"><strong>Mapa de referencia</strong><span>Los marcadores son seleccionables.</span><small>Para ver cartografía y calles detalladas, se necesita Leaflet y conexión a OpenStreetMap.</small></div>
  </div>`;
  host.querySelectorAll('[data-zone]').forEach(btn=>btn.addEventListener('click',()=>selectRiverZone(key,btn.dataset.zone)));
  riverMaps[key] = { fallback:true, markers:[] };
}

function createRiverMap(key) {
  const cfg = riverData[key]; if (riverMaps[key]) return;
  if (!window.L) { renderFallbackRiverMap(key); selectRiverZone(key, 'media'); return; }
  const map = L.map(cfg.mapId,{scrollWheelZoom:true}).setView(cfg.center,cfg.zoom);
  let tileErrors = 0;
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'});
  tiles.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= 6 && !riverMaps[key]?.fallback) {
      map.remove();
      delete riverMaps[key];
      renderFallbackRiverMap(key);
      selectRiverZone(key, cfg.selected || 'media');
    }
  });
  tiles.addTo(map);
  const overlays = L.layerGroup().addTo(map);
  const line = L.polyline(cfg.line,{color:'#269E9B',weight:5,opacity:.9}).addTo(overlays);
  line.bindTooltip(key==='lujan'?'Recorrido esquemático del Río Luján':'Recorrido esquemático Matanza–Riachuelo');
  const markers = [];
  cfg.zones.forEach((zone,index)=>{
    const color = index===0 ? palette.green : index===1 ? palette.orange : palette.red;
    const marker = L.marker([zone.lat,zone.lng],{icon:markerIcon(color)}).addTo(overlays);
    marker.bindTooltip(zone.name,{direction:'top'});
    marker.on('click',()=>selectRiverZone(key,zone.id)); markers.push(marker);
  });
  riverMaps[key]={map,markers,overlays};
  selectRiverZone(key,'media');
}
function selectRiverZone(key,id) {
  const cfg=riverData[key], zone=cfg.zones.find(z=>z.id===id); if(!zone)return;
  cfg.selected=id;
  riverMaps[key]?.markers.forEach((m,i)=>m.setZIndexOffset(cfg.zones[i].id===id?1000:0));
  renderRiverInfo(key,zone);
  loadRiverWeather(key,zone);
}
function renderRiverInfo(key,z) {
  const host=$(riverData[key].infoId);
  host.innerHTML = `
  <article class="panel zone-card"><div class="zone-card-head"><div><span class="eyebrow">ZONA SELECCIONADA</span><h2>${escapeHTML(z.name)}</h2></div><span class="sample-tag">Dato de referencia</span></div><p class="subtext">Los indicadores de calidad son demostrativos, no mediciones en vivo.</p>
    <div class="river-metrics"><div class="river-metric"><small>Calidad del agua</small><span class="status-pill ${z.qualityClass}">${z.quality}</span></div><div class="river-metric"><small>Nivel de referencia</small><strong>${z.level}</strong><em>Valor ilustrativo</em></div><div class="river-metric"><small>Riesgo orientativo</small><strong>${z.risk}</strong><em>No es alerta oficial</em></div></div>
  </article>
  <article class="panel chart-card"><div class="chart-title">Probabilidad de precipitación · próximas 12 h</div><canvas class="chart-canvas" id="chart-${key}" aria-label="Gráfico ilustrativo de referencia meteorológica"></canvas></article>
  <article class="panel zone-card"><div class="chart-title">Indicadores ambientales de referencia</div>
    <div class="indicator-row"><span>Turbidez estimada</span><strong>${z.turbidity}</strong></div><div class="indicator-row"><span>Residuos flotantes (índice interno)</span><strong>${z.waste}</strong></div><div class="indicator-row"><span>Oxígeno disuelto</span><strong>${z.oxygen}</strong></div>
  </article>
  <article class="recommend-card"><h3>✓ Recomendaciones</h3><p>${escapeHTML(z.notes)}</p><p id="riverWeatherAdvice">Consultando tiempo local…</p></article>
  <article class="warning-card"><h3>⚠ Advertencia</h3><p>${z.risk==='Elevado'?'Zona marcada con riesgo orientativo elevado. No ingreses al agua y verificá los avisos oficiales.':'Consultá las alertas locales luego de lluvias intensas y evitá arrojar residuos al cauce.'}</p></article>`;
  drawRiverChart(key, []);
}
async function loadRiverWeather(key,z) {
  const el=()=> $('riverWeatherAdvice'); if(el()) el().textContent='Consultando tiempo local…';
  try {
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${z.lat}&longitude=${z.lng}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=America%2FArgentina%2FBuenos_Aires`;
    const res=await fetch(url); if(!res.ok) throw new Error('sin datos'); const d=await res.json(),c=d.current||{};
    const advice=`Tiempo actual: ${Number.isFinite(c.temperature_2m)?`${c.temperature_2m.toFixed(1)} °C`: 'N/D'}, ${weatherText(c.weather_code).toLowerCase()}, viento ${Number.isFinite(c.wind_speed_10m)?`${Math.round(c.wind_speed_10m)} km/h`:'N/D'}, precipitación ${Number.isFinite(c.precipitation)?`${c.precipitation.toFixed(1)} mm`:'N/D'}.`;
    if(el()) el().textContent=advice;
    const values=(d.hourly?.precipitation_probability||[]).slice(0,12); if(values.length) drawRiverChart(key,values);
  } catch(e) { if(el()) el().textContent='No se pudo actualizar el tiempo local. Revisá tu conexión.'; }
}
function drawRiverChart(key,values) {
  const canvas=$(`chart-${key}`); if(!canvas)return; const ctx=canvas.getContext('2d'); const ratio=window.devicePixelRatio||1; const w=canvas.clientWidth||300,h=canvas.clientHeight||130; canvas.width=w*ratio;canvas.height=h*ratio;ctx.scale(ratio,ratio);
  if(!values || !values.length){ctx.fillStyle='#80939B';ctx.font='12px system-ui';ctx.fillText('Esperando datos meteorológicos…',18,66);return;}
  const pad={l:25,r:9,t:12,b:20},max=Math.max(100,...values),min=0; const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(1,values.length-1); const y=v=>h-pad.b-(v-min)/(max-min)*(h-pad.t-pad.b);
  ctx.strokeStyle='#E5EEEE';ctx.lineWidth=1;for(let i=0;i<4;i++){const yy=pad.t+i*(h-pad.t-pad.b)/3;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
  ctx.beginPath();values.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.strokeStyle='#269E9B';ctx.lineWidth=2.5;ctx.stroke();
  ctx.lineTo(x(values.length-1),h-pad.b);ctx.lineTo(x(0),h-pad.b);ctx.closePath();const grad=ctx.createLinearGradient(0,pad.t,0,h);grad.addColorStop(0,'rgba(38,158,155,.24)');grad.addColorStop(1,'rgba(38,158,155,.02)');ctx.fillStyle=grad;ctx.fill();
  ctx.fillStyle='#66818C';ctx.font='9px system-ui';ctx.fillText('00 h',pad.l,h-4);ctx.fillText('12 h',w/2,h-4);ctx.fillText('24 h',w-pad.r-23,h-4);
}
function refreshActiveRiver() { const active=document.querySelector('.view.active')?.id; if(active==='view-lujan'&&riverData.lujan.selected) selectRiverZone('lujan',riverData.lujan.selected); if(active==='view-matanza'&&riverData.matanza.selected) selectRiverZone('matanza',riverData.matanza.selected); }
$('layersLujan').addEventListener('click',()=>toggleRisk('mapLujan')); $('layersMatanza').addEventListener('click',()=>toggleRisk('mapMatanza'));
function toggleRisk(id){const key=id==='mapLujan'?'lujan':'matanza';const state=riverMaps[key];if(!state)return;const button=$(key==='lujan'?'layersLujan':'layersMatanza');if(state.fallback){button.textContent='Mapa esquemático';return;}if(state.map.hasLayer(state.overlays)){state.map.removeLayer(state.overlays);button.textContent='Mostrar capas +';}else{state.overlays.addTo(state.map);button.textContent='Capas activas ✓';}}

// Inicio de mapas y consultas
initGlobe();
createRiverMap('lujan');
createRiverMap('matanza');
refreshClimate();
// Actualiza el reloj y repite consultas cada 15 minutos; no simula mediciones fluviales.
setInterval(()=>{ $('footerClock').textContent=new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date()); },60000);
setInterval(()=>{refreshClimate();refreshActiveRiver();},15*60*1000);
