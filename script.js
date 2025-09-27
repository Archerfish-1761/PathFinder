// 👇 Detect environment: use localhost during development, otherwise use deployed backend
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://your-backend-url.vercel.app";  // <-- replace with actual deployed backend later

// --- Map setup ---
const map = new maplibregl.Map({
  container: 'map',
  style: `${API_BASE}/api/maptiler/streets`,   // fixed: use API_BASE
  center: [15.4266, 53.5721], // lng, lat
  zoom: 4.5
});

// Add controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }));

// --- Basemap styles (via backend MapTiler proxy) ---
const styles = {
  street: `${API_BASE}/api/maptiler/streets`,
  satellite: `${API_BASE}/api/maptiler/hybrid`,
  dark: `${API_BASE}/api/maptiler/darkmatter`,
  terrain: `${API_BASE}/api/maptiler/topo`
};

// --- Thunderforest Style Helper (via backend proxy) ---
function thunderforestStyle(type) {
  const retina = window.devicePixelRatio > 1 ? true : false;
  const tileSize = window.devicePixelRatio > 1 ? 512 : 256;

  return {
    version: 8,
    sources: {
      tf: {
        type: 'raster',
        tiles: [
          `${API_BASE}/api/thunderforest/${type}/{z}/{x}/{y}.png?retina=${retina}`
        ],
        tileSize,
        attribution: '© OSM, © Thunderforest'
      }
    },
    layers: [
      {
        id: 'tf-layer',
        type: 'raster',
        source: 'tf',
        paint: { 'raster-fade-duration': 300 }
      }
    ]
  };
}

// --- MapTiler style buttons ---
document.getElementById('btn-street').addEventListener('click', () => map.setStyle(styles.street));
document.getElementById('btn-sat').addEventListener('click', () => map.setStyle(styles.satellite));
document.getElementById('btn-dark').addEventListener('click', () => map.setStyle(styles.dark));
document.getElementById('btn-terrain').addEventListener('click', () => map.setStyle(styles.terrain));

// --- Thunderforest dropdown ---
document.getElementById('tf-select').addEventListener('change', e => {
  map.setStyle(thunderforestStyle(e.target.value));
});

// --- Search (Nominatim, no key needed) ---
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
let marker;

function searchLocation() {
  const query = searchInput.value.trim();
  if (!query) return;

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (data.length) {
        const p = data[0];
        const lng = parseFloat(p.lon), lat = parseFloat(p.lat);
        map.flyTo({ center: [lng, lat], zoom: 13 });

        if (marker) marker.remove();
        marker = new maplibregl.Marker().setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup().setText(p.display_name))
          .addTo(map).togglePopup();
      } else {
        alert('Location not found.');
      }
    })
    .catch(err => console.error(err));
}

searchBtn.addEventListener('click', searchLocation);
searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') searchLocation(); });

// --- OpenRouteService (via backend proxy) ---
function getRoute(start, end) {
  const url = `${API_BASE}/api/route?start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (map.getSource("route")) {
        map.removeLayer("route");
        map.removeSource("route");
      }

      map.addSource("route", {
        type: "geojson",
        data: data.features[0].geometry
      });

      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#4285F4",
          "line-width": 4
        }
      });

      const coords = data.features[0].geometry.coordinates;
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 50 });
    })
    .catch(err => console.error("ORS error:", err));
}

// ------------------------------------------------------------------
// Directions Panel Logic
// ------------------------------------------------------------------
const directionsBtn = document.getElementById('directions-btn');
const directionsPanel = document.getElementById('directions-panel');
const closeBtn = document.querySelector('.close-btn');
const routeBtn = document.getElementById('route-btn');
const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');

directionsBtn.addEventListener('click', () => {
  directionsPanel.style.display = 'block';
});

closeBtn.addEventListener('click', () => {
  directionsPanel.style.display = 'none';
});

// Handle route request
routeBtn.addEventListener('click', () => {
  const startQuery = startInput.value.trim();
  const endQuery = endInput.value.trim();

  if (!startQuery || !endQuery) {
    alert("Please enter both start and destination.");
    return;
  }

  // Geocode start & end with Nominatim
  Promise.all([
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(startQuery)}`).then(r => r.json()),
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endQuery)}`).then(r => r.json())
  ])
  .then(([startData, endData]) => {
    if (startData.length && endData.length) {
      const startCoords = [parseFloat(startData[0].lon), parseFloat(startData[0].lat)];
      const endCoords = [parseFloat(endData[0].lon), parseFloat(endData[0].lat)];

      getRoute(startCoords, endCoords);
    } else {
      alert("Could not find one of the locations.");
    }
  })
  .catch(err => console.error("Geocoding error:", err));
});
