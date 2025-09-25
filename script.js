// --- Map setup ---
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://api.maptiler.com/maps/streets/style.json?key=a0Po9J96id1vA4bZSXZL',
  center: [15.4266, 53.5721], // lng, lat
  zoom: 4.5
});

// Add controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }));

// --- Basemap styles (MapTiler) ---
const styles = {
  street: `https://api.maptiler.com/maps/streets/style.json?key=a0Po9J96id1vA4bZSXZL`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=a0Po9J96id1vA4bZSXZL`,
  dark: `https://api.maptiler.com/maps/darkmatter/style.json?key=a0Po9J96id1vA4bZSXZL`,
  terrain: `https://api.maptiler.com/maps/topo/style.json?key=a0Po9J96id1vA4bZSXZL`
};

// --- Thunderforest API key ---
const tfApi = 'fb657e144f5246efa57cbabbae7db1d5';

// --- Thunderforest Style Helper ---
function thunderforestStyle(type) {
  const retina = window.devicePixelRatio > 1 ? '@2x' : '';
  const tileSize = window.devicePixelRatio > 1 ? 512 : 256;

  return {
    version: 8,
    sources: {
      tf: {
        type: 'raster',
        tiles: [
          `https://tile.thunderforest.com/${type}/{z}/{x}/{y}${retina}.png?apikey=${tfApi}`
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

// --- Search (Nominatim) ---
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

// --- OpenRouteService Setup ---
const orsKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImM1YjgwNWExMmRjOTQxOGQ5MzIwMDBkMGZlNGQyN2NmIiwiaCI6Im11cm11cjY0In0=";

function getRoute(start, end) {
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`;

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
// Directions Panel Logic (merged)
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
