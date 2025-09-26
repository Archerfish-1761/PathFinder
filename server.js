require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Allow frontend (GitHub Pages) to call this API
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// --- MapTiler Proxy ---
app.get('/api/maptiler/:style', (req, res) => {
  const style = req.params.style; // e.g. streets, hybrid, darkmatter, topo
  const url = `https://api.maptiler.com/maps/${style}/style.json?key=${process.env.MAPTILER_KEY}`;
  res.redirect(url);
});

// --- Thunderforest Proxy ---
app.get('/api/thunderforest/:type/:z/:x/:y.png', (req, res) => {
  const { type, z, x, y } = req.params;
  const retina = (req.query.retina === "true") ? "@2x" : "";
  const tileUrl = `https://tile.thunderforest.com/${type}/${z}/${x}/${y}${retina}.png?apikey=${process.env.THUNDERFOREST_KEY}`;
  res.redirect(tileUrl);
});

// --- OpenRouteService Proxy ---
app.get('/api/route', async (req, res) => {
  const { start, end } = req.query;
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_KEY}&start=${start}&end=${end}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("ORS proxy error:", err);
    res.status(500).json({ error: "Failed to fetch route" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
