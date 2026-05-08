const SCHOOL_COLORS = {
  walsh: "#94a3b8",
  galeano: "#22d3ee",
  pizarnik: "#c084fc",
};

const HEAT_COLORS = {
  walsh: ["rgba(71,85,105,0)", "#64748b", "#e2e8f0"],
  galeano: ["rgba(6,182,212,0)", "#06b6d4", "#67e8f9"],
  pizarnik: ["rgba(168,85,247,0)", "#a855f7", "#f0abfc"],
};

const state = {
  selectedSchool: "all",
  maxRadius: 1500,
  heatIntensity: 1.05,
  visible: { walsh: true, galeano: true, pizarnik: true, rings: true, renabap: true },
  data: {},
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      dark: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
    },
    layers: [{ id: "dark", type: "raster", source: "dark" }],
  },
  center: [-58.565, -34.568],
  zoom: 12.2,
});

map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: "metric" }), "bottom-left");

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    return await fetchJson(path);
  } catch (error) {
    console.warn(`Capa opcional no disponible: ${path}`, error);
    return featureCollection([]);
  }
}

function fmt(value) {
  return new Intl.NumberFormat("es-AR").format(Math.round(value || 0));
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function addSources() {
  map.addSource("matricula", { type: "geojson", data: state.data.matricula });
  map.addSource("reached-students", { type: "geojson", data: featureCollection([]) });
  map.addSource("schools", { type: "geojson", data: state.data.schools });
  map.addSource("limit", { type: "geojson", data: state.data.limit });
  map.addSource("renabap", { type: "geojson", data: state.data.renabap });
  map.addSource("rings", { type: "geojson", data: featureCollection([]) });
}

function heatColorExpression(id) {
  const colors = HEAT_COLORS[id];
  return [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    colors[0],
    0.38,
    colors[1],
    1,
    colors[2],
  ];
}

function addLayers() {
  map.addLayer({
    id: "limit",
    type: "line",
    source: "limit",
    paint: {
      "line-color": "rgba(226,232,240,0.72)",
      "line-width": 1.6,
      "line-dasharray": [3, 2],
    },
  });

  map.addLayer({
    id: "renabap-fill",
    type: "fill",
    source: "renabap",
    paint: {
      "fill-color": "#0f766e",
      "fill-opacity": 0.22,
    },
  });
  map.addLayer({
    id: "renabap-line",
    type: "line",
    source: "renabap",
    paint: {
      "line-color": "#5eead4",
      "line-width": 1,
      "line-opacity": 0.8,
      "line-dasharray": [1.4, 1],
    },
  });

  ["walsh", "galeano", "pizarnik"].forEach((id) => {
    map.addLayer({
      id: `heat-${id}`,
      type: "heatmap",
      source: "matricula",
      filter: ["==", ["get", "school_id"], id],
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, state.heatIntensity * 0.65, 15, state.heatIntensity * 1.35],
        "heatmap-color": heatColorExpression(id),
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 16, 15, 34],
        "heatmap-opacity": 0.76,
      },
    });
  });

  map.addLayer({
    id: "rings-fill",
    type: "fill",
    source: "rings",
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["interpolate", ["linear"], ["get", "pct"], 0, 0.015, 20, 0.13],
    },
  });
  map.addLayer({
    id: "rings-line",
    type: "line",
    source: "rings",
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1,
      "line-opacity": 0.6,
      "line-dasharray": [2, 2],
    },
  });

  map.addLayer({
    id: "student-points",
    type: "circle",
    source: "matricula",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 15, 2.8],
      "circle-color": ["match", ["get", "school_id"], "walsh", SCHOOL_COLORS.walsh, "galeano", SCHOOL_COLORS.galeano, "pizarnik", SCHOOL_COLORS.pizarnik, "#fff"],
      "circle-stroke-color": "#020617",
      "circle-stroke-width": 0.5,
      "circle-opacity": 0.46,
    },
  });

  map.addLayer({
    id: "reached-students-glow",
    type: "circle",
    source: "reached-students",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 15, 8.5],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.34,
      "circle-blur": 0.7,
    },
  });
  map.addLayer({
    id: "reached-students",
    type: "circle",
    source: "reached-students",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.2, 15, 4.2],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.9,
      "circle-opacity": 0.95,
    },
  });

  map.addLayer({
    id: "school-points",
    type: "circle",
    source: "schools",
    paint: {
      "circle-radius": 9,
      "circle-color": ["match", ["get", "school_id"], "walsh", "#475569", "galeano", "#06b6d4", "pizarnik", "#a855f7", "#fff"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.4,
    },
  });
}

function schoolFeatures() {
  if (state.selectedSchool === "all") return state.data.schools.features;
  return state.data.schools.features.filter((feature) => feature.properties.school_id === state.selectedSchool);
}

function studentFeaturesFor(id) {
  return state.data.matricula.features.filter((feature) => feature.properties.school_id === id);
}

function binsForSchool(school) {
  const id = school.properties.school_id;
  const origin = turf.point(school.geometry.coordinates);
  const students = studentFeaturesFor(id);
  const binCount = Math.ceil(state.maxRadius / 50);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: index * 50,
    to: (index + 1) * 50,
    count: 0,
    pct: 0,
  }));
  students.forEach((student) => {
    const meters = turf.distance(origin, student, { units: "kilometers" }) * 1000;
    if (meters <= state.maxRadius) {
      const index = Math.min(binCount - 1, Math.floor(meters / 50));
      bins[index].count += 1;
    }
  });
  bins.forEach((bin) => {
    bin.pct = (bin.count / Math.max(1, students.length)) * 100;
  });
  return { bins, total: students.length, color: SCHOOL_COLORS[id] };
}

function buildRingFeatures() {
  if (!state.visible.rings) return featureCollection([]);
  const features = [];
  schoolFeatures().forEach((school) => {
    const id = school.properties.school_id;
    const { bins } = binsForSchool(school);
    bins.forEach((bin) => {
      if (bin.to % 100 !== 0 && bin.count === 0) return;
      const outer = turf.circle(school.geometry.coordinates, bin.to / 1000, { steps: 96, units: "kilometers" });
      outer.properties = {
        school_id: id,
        school_name: school.properties.school_name,
        meters: bin.to,
        count: bin.count,
        pct: bin.pct,
        color: SCHOOL_COLORS[id],
      };
      features.push(outer);
    });
  });
  return featureCollection(features);
}

function reachedStudentFeatures() {
  const reached = [];
  schoolFeatures().forEach((school) => {
    const id = school.properties.school_id;
    if (!state.visible[id]) return;
    const origin = turf.point(school.geometry.coordinates);
    studentFeaturesFor(id).forEach((student) => {
      const meters = turf.distance(origin, student, { units: "kilometers" }) * 1000;
      if (meters <= state.maxRadius) {
        reached.push({
          ...student,
          properties: {
            ...student.properties,
            distance_m: Math.round(meters),
            color: SCHOOL_COLORS[id],
          },
        });
      }
    });
  });
  return featureCollection(reached);
}

function updateLayers() {
  ["walsh", "galeano", "pizarnik"].forEach((id) => {
    const visible = state.visible[id] && (state.selectedSchool === "all" || state.selectedSchool === id);
    map.setLayoutProperty(`heat-${id}`, "visibility", visible ? "visible" : "none");
    map.setPaintProperty(`heat-${id}`, "heatmap-intensity", ["interpolate", ["linear"], ["zoom"], 10, state.heatIntensity * 0.65, 15, state.heatIntensity * 1.35]);
  });
  const schoolFilter = state.selectedSchool === "all" ? null : ["==", ["get", "school_id"], state.selectedSchool];
  ["renabap-fill", "renabap-line"].forEach((id) => {
    map.setLayoutProperty(id, "visibility", state.visible.renabap ? "visible" : "none");
  });
  map.setFilter("student-points", schoolFilter);
  map.setFilter("school-points", schoolFilter);
  map.getSource("rings").setData(buildRingFeatures());
  map.getSource("reached-students").setData(reachedStudentFeatures());
  updateRadar();
}

function drawRadarForSchool(school) {
  const { bins, total, color } = binsForSchool(school);
  const maxPct = Math.max(1, ...bins.map((bin) => bin.pct));
  const cx = 130;
  const cy = 130;
  const maxR = 108;
  const circles = bins
    .map((bin, index) => {
      const r = ((index + 1) / bins.length) * maxR;
      const opacity = 0.08 + (bin.pct / maxPct) * 0.72;
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${Math.max(0.6, (bin.pct / maxPct) * 4).toFixed(2)}" opacity="${opacity.toFixed(2)}" />`;
    })
    .join("");
  const axes = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((angle) => {
      const a = (angle * Math.PI) / 180;
      return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * maxR}" y2="${cy + Math.sin(a) * maxR}" stroke="rgba(148,163,184,.18)" />`;
    })
    .join("");
  document.getElementById("radarSvg").innerHTML = `
    <rect width="260" height="260" rx="130" fill="rgba(15,23,42,.62)" />
    ${axes}
    ${circles}
    <circle cx="${cx}" cy="${cy}" r="5" fill="${color}" stroke="#fff" stroke-width="2" />
    <text x="${cx}" y="22" text-anchor="middle" fill="#cbd5e1" font-size="10">${fmt(total)} estudiantes</text>
  `;
  const maxBar = Math.max(1, ...bins.map((bin) => bin.pct));
  document.getElementById("radialBars").innerHTML = bins
    .filter((bin) => bin.count > 0)
    .map(
      (bin) => `<div class="bar-row">
        <span>${bin.from}-${bin.to} m</span>
        <i class="bar-track"><b class="bar-fill" style="width:${(bin.pct / maxBar) * 100}%; background:${color}"></b></i>
        <strong>${pct(bin.pct)}</strong>
      </div>`,
    )
    .join("");
}

function updateRadar() {
  const schools = schoolFeatures();
  const school = schools[0];
  if (!school) return;
  document.getElementById("radarSubtitle").textContent = state.selectedSchool === "all" ? "Walsh, Galeano y Pizarnik" : school.properties.school_name;
  if (state.selectedSchool === "all") {
    document.getElementById("radarSvg").innerHTML = "";
    document.getElementById("radialBars").innerHTML = schools
      .map((item) => {
        const { bins, total, color } = binsForSchool(item);
        const inside = bins.reduce((sum, bin) => sum + bin.count, 0);
        return `<div class="bar-row">
          <span>${item.properties.school_name.replace("Escuela ", "")}</span>
          <i class="bar-track"><b class="bar-fill" style="width:${(inside / Math.max(1, total)) * 100}%; background:${color}"></b></i>
          <strong>${pct((inside / Math.max(1, total)) * 100)}</strong>
        </div>`;
      })
      .join("");
    return;
  }
  drawRadarForSchool(school);
}

function updateRadiusReadout() {
  const label = `${fmt(state.maxRadius)} m`;
  document.getElementById("radiusBig").textContent = label;
}

function setupControls() {
  const select = document.getElementById("schoolSelect");
  state.data.schools.features.forEach((school) => {
    const option = document.createElement("option");
    option.value = school.properties.school_id;
    option.textContent = school.properties.school_name;
    select.appendChild(option);
  });
  select.addEventListener("change", (event) => {
    state.selectedSchool = event.target.value;
    updateLayers();
    const features = schoolFeatures();
    if (features.length === 1) map.flyTo({ center: features[0].geometry.coordinates, zoom: 13.4, duration: 800 });
  });
  document.getElementById("radiusSlider").addEventListener("input", (event) => {
    state.maxRadius = Number(event.target.value);
    updateRadiusReadout();
    updateLayers();
  });
  document.getElementById("heatSlider").addEventListener("input", (event) => {
    state.heatIntensity = Number(event.target.value);
    updateLayers();
  });
  [
    ["toggleWalsh", "walsh"],
    ["toggleGaleano", "galeano"],
    ["togglePizarnik", "pizarnik"],
    ["toggleRings", "rings"],
    ["toggleRenabap", "renabap"],
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("change", (event) => {
      state.visible[key] = event.target.checked;
      updateLayers();
    });
  });
}

function fitToData() {
  const bbox = turf.bbox(state.data.matricula);
  map.fitBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding: { top: 60, right: 430, bottom: 70, left: 380 }, duration: 0 },
  );
}

async function init() {
  const [matricula, schools, limit, renabap] = await Promise.all([
    fetchJson("../isocronas_escolares/data/matricula.geojson"),
    fetchJson("../isocronas_escolares/data/escuelas.geojson"),
    fetchJson("../isocronas_escolares/data/limite_partido.geojson"),
    fetchOptionalJson("../isocronas_escolares/data/renabap.geojson"),
  ]);
  state.data = { matricula, schools, limit, renabap };
  addSources();
  addLayers();
  setupControls();
  updateRadiusReadout();
  updateLayers();
  fitToData();
}

map.on("load", () => {
  init().catch((error) => {
    console.error(error);
    document.querySelector(".radar-panel").insertAdjacentHTML("beforeend", `<p class="note">No se pudo cargar el mapa: ${error.message}</p>`);
  });
});
