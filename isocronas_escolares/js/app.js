const TIME_COLORS = {
  5: "#6ff2ff",
  10: "#1677ff",
  15: "#8a2be2",
  20: "#35108c",
};

const SCHOOL_COLORS = {
  walsh: "#334155",
  galeano: "#0ea5e9",
  pizarnik: "#a78bfa",
};

const state = {
  selectedSchool: "all",
  mode: "walk",
  maxTime: 20,
  isoOpacity: 0.42,
  nbiOpacity: 0.22,
  visible: {
    matricula: true,
    nbi: true,
    renabap: true,
    limit: true,
    busRoutes: true,
    transactions: true,
  },
  data: {},
};

const busAnimation = {
  requestId: null,
  startedAt: 0,
};

const walkAnimation = {
  requestId: null,
  startedAt: 0,
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      positron: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
    },
    layers: [{ id: "positron", type: "raster", source: "positron" }],
  },
  center: [-58.558, -34.575],
  zoom: 12,
  pitch: 0,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 180, unit: "metric" }), "bottom-left");

async function fetchJson(path, optional = false) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (!optional) throw error;
    console.warn(`No se pudo cargar ${path}`, error);
    return { type: "FeatureCollection", features: [] };
  }
}

function pct(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function fmt(value) {
  return new Intl.NumberFormat("es-AR").format(Math.round(value || 0));
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function setupSchoolSelect() {
  const select = document.getElementById("schoolSelect");
  state.data.schools.features.forEach((feature) => {
    const option = document.createElement("option");
    option.value = feature.properties.school_id;
    option.textContent = feature.properties.school_name;
    select.appendChild(option);
  });
}

function addSources() {
  map.addSource("limit", { type: "geojson", data: state.data.limit });
  map.addSource("radios", { type: "geojson", data: state.data.radios });
  map.addSource("renabap", { type: "geojson", data: state.data.renabap });
  map.addSource("matricula", { type: "geojson", data: state.data.matricula });
  map.addSource("walk-routes", { type: "geojson", data: state.data.walkRoutes });
  map.addSource("walk-particles", { type: "geojson", data: featureCollection([]) });
  map.addSource("schools", { type: "geojson", data: state.data.schools });
  map.addSource("isochrones", { type: "geojson", data: state.data.isochrones });
  map.addSource("isochrones-bus", { type: "geojson", data: state.data.busIso });
  map.addSource("colectivos", { type: "geojson", data: state.data.colectivos });
  map.addSource("colectivos-flow", { type: "geojson", data: state.data.colectivosFlow });
  map.addSource("bus-access-lines", { type: "geojson", data: state.data.busAccessRoutes });
  map.addSource("bus-boarding-stops", { type: "geojson", data: state.data.busBoardingStops });
  map.addSource("bus-student-flows", { type: "geojson", data: state.data.busStudentFlows, lineMetrics: true });
  map.addSource("bus-access-particles", { type: "geojson", data: featureCollection([]) });
  map.addSource("bus-flow-particles", { type: "geojson", data: featureCollection([]) });
  map.addSource("transactions", { type: "geojson", data: state.data.transactions });
}

function addLayers() {
  map.addLayer({
    id: "nbi-fill",
    type: "fill",
    source: "radios",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "pct_nbi"]], 0],
        0,
        "#d9f0a3",
        5,
        "#f0d84f",
        9,
        "#fdae61",
        15,
        "#f46d43",
        30,
        "#d7191c",
      ],
      "fill-opacity": state.nbiOpacity,
    },
  });

  map.addLayer({
    id: "renabap-fill",
    type: "fill",
    source: "renabap",
    paint: {
      "fill-color": "#14b8a6",
      "fill-opacity": 0.18,
    },
  });
  map.addLayer({
    id: "renabap-line",
    type: "line",
    source: "renabap",
    paint: {
      "line-color": "#0f766e",
      "line-width": 1.1,
      "line-dasharray": [1.5, 1],
    },
  });

  map.addLayer({
    id: "bus-routes",
    type: "line",
    source: "colectivos",
    paint: {
      "line-color": "#0e7490",
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 15, 1.8],
      "line-opacity": 0.36,
    },
  });
  map.addLayer({
    id: "bus-flow-casing",
    type: "line",
    source: "colectivos-flow",
    paint: {
      "line-color": "#ffffff",
      "line-width": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "flow"]], 0],
        0,
        2,
        6000,
        4.5,
        15000,
        7,
        34000,
        10,
      ],
      "line-opacity": 0.72,
    },
  });
  map.addLayer({
    id: "bus-flow",
    type: "line",
    source: "colectivos-flow",
    paint: {
      "line-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "flow"]], 0],
        0,
        "#94a3b8",
        6000,
        "#22d3ee",
        15000,
        "#2563eb",
        34000,
        "#f97316",
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "flow"]], 0],
        0,
        0.8,
        6000,
        2.4,
        15000,
        4.5,
        34000,
        7,
      ],
      "line-opacity": [
        "case",
        [">", ["coalesce", ["to-number", ["get", "flow"]], 0], 0],
        0.86,
        0.22,
      ],
    },
  });

  map.addLayer({
    id: "transactions-heat",
    type: "heatmap",
    source: "transactions",
    maxzoom: 15,
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["to-number", ["get", "transacciones"]], 0, 0, 120, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.18, 14, 0.62],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(255,255,255,0)",
        0.25,
        "rgba(253,186,116,0.22)",
        0.6,
        "rgba(249,115,22,0.36)",
        1,
        "rgba(194,65,12,0.52)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 14, 18],
      "heatmap-opacity": 0.5,
    },
  });

  map.addLayer({
    id: "bus-access-lines",
    type: "line",
    source: "bus-access-lines",
    paint: {
      "line-color": ["match", ["get", "school_id"], "walsh", "#64748b", "galeano", "#7dd3fc", "pizarnik", "#ddd6fe", "#94a3b8"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 1.8],
      "line-opacity": 0.68,
      "line-dasharray": [0.45, 1.35],
    },
  });
  map.addLayer({
    id: "bus-access-particles",
    type: "circle",
    source: "bus-access-particles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.9, 15, 3.4],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.8,
      "circle-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "bus-student-flow-glow",
    type: "line",
    source: "bus-student-flows",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "students"]], 1],
        1,
        7,
        8,
        15,
        18,
        27,
      ],
      "line-opacity": 0.24,
      "line-blur": 5,
    },
  });
  map.addLayer({
    id: "bus-student-flow",
    type: "line",
    source: "bus-student-flows",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "students"]], 1],
        1,
        1.3,
        8,
        3.8,
        18,
        7,
      ],
      "line-opacity": 0.76,
    },
  });
  map.addLayer({
    id: "bus-flow-particles",
    type: "circle",
    source: "bus-flow-particles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.4, 15, 4.6],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
      "circle-opacity": 0.92,
    },
  });
  map.addLayer({
    id: "bus-boarding-stops",
    type: "circle",
    source: "bus-boarding-stops",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "students"]], 1],
        1,
        5,
        6,
        10,
        16,
        18,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.86,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "bus-boarding-stop-labels",
    type: "symbol",
    source: "bus-boarding-stops",
    layout: {
      "text-field": ["to-string", ["get", "students"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": 10,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
    },
  });

  map.addLayer({
    id: "iso-fill",
    type: "fill",
    source: "isochrones",
    paint: {
      "fill-color": ["match", ["get", "minutes"], 5, TIME_COLORS[5], 10, TIME_COLORS[10], 15, TIME_COLORS[15], TIME_COLORS[20]],
      "fill-opacity": state.isoOpacity,
    },
  });
  map.addLayer({
    id: "bus-iso-fill",
    type: "fill",
    source: "isochrones-bus",
    paint: {
      "fill-color": ["interpolate", ["linear"], ["get", "minutes"], 15, "#6ff2ff", 30, "#1677ff", 45, "#8a2be2", 60, "#35108c"],
      "fill-opacity": state.isoOpacity,
    },
  });
  map.addLayer({
    id: "bus-iso-line",
    type: "line",
    source: "isochrones-bus",
    paint: {
      "line-color": ["interpolate", ["linear"], ["get", "minutes"], 15, "#00cfe8", 30, "#004ee8", 45, "#6d16c9", 60, "#25006f"],
      "line-width": 1.5,
      "line-opacity": 0.84,
    },
  });
  map.addLayer({
    id: "iso-line",
    type: "line",
    source: "isochrones",
    paint: {
      "line-color": ["match", ["get", "minutes"], 5, "#00cfe8", 10, "#004ee8", 15, "#6d16c9", "#25006f"],
      "line-width": 1.4,
      "line-opacity": 0.82,
    },
  });

  map.addLayer({
    id: "walk-routes",
    type: "line",
    source: "walk-routes",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.65, 15, 1.35],
      "line-opacity": 0.22,
    },
  });
  map.addLayer({
    id: "walk-particles",
    type: "circle",
    source: "walk-particles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.4, 15, 4.4],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
      "circle-opacity": 0.94,
    },
  });

  map.addLayer({
    id: "matricula",
    type: "circle",
    source: "matricula",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.2, 15, 4.2],
      "circle-color": ["match", ["get", "school_id"], "walsh", "#475569", "galeano", "#38bdf8", "pizarnik", "#c8a7ff", "#64748b"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.7,
      "circle-opacity": 0.78,
    },
  });
  map.moveLayer("walk-particles");

  map.addLayer({
    id: "limit-line",
    type: "line",
    source: "limit",
    paint: {
      "line-color": "#111827",
      "line-width": 2.1,
      "line-dasharray": [3, 2],
    },
  });

  map.addLayer({
    id: "school-points",
    type: "circle",
    source: "schools",
    paint: {
      "circle-radius": ["case", ["==", ["get", "school_id"], state.selectedSchool], 12, 9],
      "circle-color": ["match", ["get", "school_id"], "walsh", SCHOOL_COLORS.walsh, "galeano", SCHOOL_COLORS.galeano, "pizarnik", SCHOOL_COLORS.pizarnik, "#1d4ed8"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  addSchoolHtmlLabels();
}

function addSchoolHtmlLabels() {
  state.data.schools.features.forEach((feature) => {
    const element = document.createElement("div");
    element.className = "school-label-marker";
    element.textContent = feature.properties.school_name;
    new maplibregl.Marker({ element, anchor: "top", offset: [0, 16] }).setLngLat(feature.geometry.coordinates).addTo(map);
  });
}

function layerVisible(id, visible) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

function updateFilters() {
  const schoolFilter = state.selectedSchool === "all" ? true : ["==", ["get", "school_id"], state.selectedSchool];
  const timeFilter = ["<=", ["get", "minutes"], state.maxTime];
  map.setFilter("iso-fill", ["all", schoolFilter, timeFilter]);
  map.setFilter("iso-line", ["all", schoolFilter, timeFilter]);
  map.setFilter("bus-iso-fill", ["all", schoolFilter, timeFilter]);
  map.setFilter("bus-iso-line", ["all", schoolFilter, timeFilter]);
  map.setFilter("matricula", state.selectedSchool === "all" ? null : ["==", ["get", "school_id"], state.selectedSchool]);
  map.setPaintProperty("iso-fill", "fill-opacity", state.isoOpacity);
  map.setPaintProperty("bus-iso-fill", "fill-opacity", state.isoOpacity);
  map.setPaintProperty("nbi-fill", "fill-opacity", state.nbiOpacity);
  map.setPaintProperty("school-points", "circle-radius", ["case", ["==", ["get", "school_id"], state.selectedSchool], 12, 9]);
  layerVisible("matricula", state.visible.matricula && state.mode === "walk");
  layerVisible("nbi-fill", state.visible.nbi);
  layerVisible("renabap-fill", state.visible.renabap);
  layerVisible("renabap-line", state.visible.renabap);
  layerVisible("limit-line", state.visible.limit);
  layerVisible("bus-routes", false);
  layerVisible("bus-flow-casing", false);
  layerVisible("bus-flow", false);
  layerVisible("bus-access-lines", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-access-particles", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-student-flow-glow", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-student-flow", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-flow-particles", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-boarding-stops", state.visible.busRoutes && state.mode === "bus");
  layerVisible("bus-boarding-stop-labels", state.visible.busRoutes && state.mode === "bus");
  layerVisible("transactions-heat", state.visible.transactions && state.mode === "bus");
  layerVisible("iso-fill", state.mode === "walk");
  layerVisible("iso-line", state.mode === "walk");
  layerVisible("walk-routes", state.mode === "walk" && state.visible.matricula);
  layerVisible("walk-particles", state.mode === "walk" && state.visible.matricula);
  layerVisible("bus-iso-fill", false);
  layerVisible("bus-iso-line", false);
  updateBusFilters();
  updateBusAnimation();
  updateWalkFilters();
  updateWalkAnimation();
  updateAnalysis();
}

function updateBusFilters() {
  const schoolFilter = state.selectedSchool === "all" ? null : ["==", ["get", "school_id"], state.selectedSchool];
  ["bus-access-lines", "bus-student-flow-glow", "bus-student-flow", "bus-boarding-stops", "bus-boarding-stop-labels"].forEach((layer) => {
    if (map.getLayer(layer)) map.setFilter(layer, schoolFilter);
  });
}

function updateWalkFilters() {
  const schoolFilter = state.selectedSchool === "all" ? null : ["==", ["get", "school_id"], state.selectedSchool];
  if (map.getLayer("walk-routes")) map.setFilter("walk-routes", schoolFilter);
}

function schoolTotals() {
  const totals = {};
  state.data.matricula.features.forEach((feature) => {
    const id = feature.properties.school_id;
    totals[id] = (totals[id] || 0) + 1;
  });
  return totals;
}

function routeTotals() {
  const totals = {};
  state.data.walkRoutes.features.forEach((feature) => {
    const id = feature.properties.school_id;
    totals[id] = (totals[id] || 0) + 1;
  });
  return totals;
}

function analysisForSchool(school) {
  const totals = schoolTotals();
  const source = state.mode === "bus" ? state.data.busIso : state.data.isochrones;
  const times = state.mode === "bus" ? [15, 30, 45, 60] : [5, 10, 15, 20];
  return times
    .filter((minutes) => minutes <= state.maxTime)
    .map((minutes) => {
      const iso = source.features.find((feature) => feature.properties.school_id === school.properties.school_id && feature.properties.minutes === minutes);
      if (!iso) return null;
      const radios = state.data.radios.features.filter((radio) => turf.booleanIntersects(radio, iso));
      const nbiValues = radios.map((radio) => Number(radio.properties.pct_nbi)).filter(Number.isFinite);
      const nbiAverage = nbiValues.reduce((sum, value) => sum + value, 0) / Math.max(1, nbiValues.length);
      const schoolPoints = state.data.matricula.features.filter((feature) => feature.properties.school_id === school.properties.school_id);
      const covered = schoolPoints.filter((point) => turf.booleanPointInPolygon(point, iso)).length;
      return {
        school: school.properties.school_name,
        minutes,
        radios: radios.length,
        nbiAverage,
        covered,
        coveredPct: (covered / Math.max(1, totals[school.properties.school_id] || 0)) * 100,
      };
    })
    .filter(Boolean);
}

function updateBusCoverage() {
  const schools =
    state.selectedSchool === "all"
      ? state.data.schools.features
      : state.data.schools.features.filter((feature) => feature.properties.school_id === state.selectedSchool);
  const totals = schoolTotals();
  const container = document.getElementById("busCoverageRows");
  if (!container) return;
  container.innerHTML = schools
    .map((school) => {
      const id = school.properties.school_id;
      const iso = (state.data.busIso?.features || []).find(
        (feature) => feature.properties.school_id === id && feature.properties.minutes === state.maxTime,
      );
      if (!iso) return `<div style="padding:8px 10px; margin-bottom:8px; color:#888;">${school.properties.school_name.replace("Escuela ", "")} — sin datos de isócrona</div>`;
      const schoolPoints = state.data.matricula.features.filter((feature) => feature.properties.school_id === id);
      let covered = 0;
      schoolPoints.forEach((point) => {
        try { if (turf.booleanPointInPolygon(point, iso)) covered++; } catch {}
      });
      const total = totals[id] || 1;
      const covPct = (covered / total) * 100;
      const color = SCHOOL_COLORS[id];
      return `<div style="border-left:3px solid ${color}; padding:8px 12px; margin-bottom:10px; background:rgba(255,255,255,0.04); border-radius:4px;">
        <span style="font-weight:600; color:${color}; font-size:13px;">${school.properties.school_name.replace("Escuela ", "")}</span>
        <strong style="display:block; font-size:24px; margin:4px 0; color:#f1f5f9;">${covPct.toFixed(1)}%</strong>
        <span style="font-size:11px; color:#94a3b8;">${fmt(covered)} de ${fmt(total)} estudiantes dentro de ${state.maxTime} min en colectivo</span>
      </div>`;
    })
    .join("");
}

function updateAnalysis() {
  if (state.mode === "bus") {
    updateBusCoverage();
    return;
  }
  const schools =
    state.selectedSchool === "all"
      ? state.data.schools.features
      : state.data.schools.features.filter((feature) => feature.properties.school_id === state.selectedSchool);
  const rows = schools.flatMap(analysisForSchool);
  document.getElementById("analysisRows").innerHTML = (function() {
    const grouped = {};
    rows.forEach((row) => {
      const key = row.school;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    return Object.values(grouped)
      .map((schoolRows) =>
        schoolRows.map((row, i) => `<tr>
          ${i === 0 ? `<td rowspan="${schoolRows.length}">${row.school.replace("Escuela ", "")}</td>` : ""}
          <td>${row.minutes} min</td>
          <td>${fmt(row.radios)}</td>
          <td>${pct(row.nbiAverage)}</td>
          <td>${fmt(row.covered)}</td>
          <td>${pct(row.coveredPct)}</td>
        </tr>`).join("")
      )
      .join("");
  })();
  document.getElementById("summaryText").textContent =
    state.selectedSchool === "all"
      ? state.mode === "bus"
        ? "Comparación exploratoria: estudiantes lejanos se agrupan en paradas aproximadas; el tamaño de cada globo y de cada flujo depende de la matrícula reunida."
        : "Comparación exploratoria entre escuelas en modo caminata: radios alcanzados, NBI promedio y matrícula georreferenciada cubierta por cada banda."
      : state.mode === "bus"
        ? "Lectura focalizada: los globos indican paradas agrupadoras y los flujos muestran la matrícula que seguiría el recorrido hacia la escuela."
        : "Lectura focalizada de la escuela seleccionada y su entorno accesible en modo caminata.";
}

function popupHtml(title, rows) {
  return `<strong>${title}</strong>${rows.map(([key, value]) => `<br><span>${key}: ${value ?? "-"}</span>`).join("")}`;
}

function setupPopups() {
  map.on("click", "school-points", (event) => {
    const feature = event.features[0];
    const coords = feature.geometry.coordinates;
    const times = state.data.isochrones.features
      .filter((iso) => iso.properties.school_id === feature.properties.school_id)
      .map((iso) => `${iso.properties.minutes} min`)
      .join(", ");
    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(
        popupHtml(feature.properties.school_name, [
          ["Coordenadas", `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`],
          ["Matrícula asociada", fmt(feature.properties.matricula_count)],
          ["Isócronas", times],
        ]),
      )
      .addTo(map);
  });

  ["iso-fill", "bus-iso-fill"].forEach((layerId) => {
    map.on("click", layerId, (event) => {
    const p = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(
        popupHtml(layerId === "bus-iso-fill" ? "Isócrona en colectivo" : "Isócrona escolar", [
          ["Escuela", p.school_name],
          ["Tiempo", `${p.minutes} minutos`],
          ["Perfil", p.profile],
          ["Fuente", p.source],
        ]),
      )
      .addTo(map);
    });
  });

  map.on("click", "bus-student-flow", (event) => {
    const p = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(
        popupHtml("Flujo matrícula-colectivo", [
          ["Escuela", p.school_name],
          ["Línea", p.linea_label],
          ["Recorrido", p.recorrido],
          ["Sentido", p.sentido],
          ["Empresa", p.empresa],
          ["Estudiantes", fmt(p.students)],
          ["Tramo medio", `${fmt(p.ride_avg_m)} m`],
        ]),
      )
      .addTo(map);
  });

  map.on("click", "bus-boarding-stops", (event) => {
    const p = event.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(event.features[0].geometry.coordinates)
      .setHTML(
        popupHtml(p.stop_role === "school_near" ? "Parada cercana a escuela" : "Parada agrupadora", [
          ["Escuela", p.school_name],
          ["Línea", p.linea_label],
          ["Estudiantes reunidos", fmt(p.students)],
          [p.stop_role === "school_near" ? "Distancia a escuela" : "Caminata media", `${fmt(p.walk_avg_m)} m`],
          ["Criterio", p.source],
        ]),
      )
      .addTo(map);
  });

  map.on("click", "nbi-fill", (event) => {
    const p = event.features[0].properties;
    const point = turf.point([event.lngLat.lng, event.lngLat.lat]);
    const activeIso = state.mode === "bus" ? state.data.busIso.features : state.data.isochrones.features;
    const visibleIso = activeIso.filter(
      (iso) => iso.properties.minutes <= state.maxTime && (state.selectedSchool === "all" || iso.properties.school_id === state.selectedSchool),
    );
    const intersects = visibleIso.some((iso) => turf.booleanPointInPolygon(point, iso));
    const enrollmentInside = state.data.matricula.features.filter((student) => turf.booleanPointInPolygon(student, event.features[0])).length;
    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setHTML(
        popupHtml(`Radio ${p.LINK || p.RADIO || ""}`, [
          ["NBI", pct(p.pct_nbi)],
          ["Matrícula dentro", fmt(enrollmentInside)],
          ["Dentro de isócrona visible", intersects ? "Sí" : "No"],
        ]),
      )
      .addTo(map);
  });
}

function setupControls() {
  function setMode(mode) {
    state.mode = mode;
    document.getElementById("modeWalk").setAttribute("aria-pressed", String(mode === "walk"));
    document.getElementById("modeBus").setAttribute("aria-pressed", String(mode === "bus"));
    document.getElementById("busParams").hidden = mode !== "bus";
    document.getElementById("busLegend").hidden = mode !== "bus";
    document.getElementById("walkLegendSection").hidden = mode === "bus";
    document.getElementById("analysisPanel").hidden = mode === "bus";
    document.getElementById("busCoveragePanel").hidden = mode !== "bus";
    const timeSelect = document.getElementById("timeSelect");
    const times = state.mode === "bus" ? [15, 30, 45, 60] : [5, 10, 15, 20];
    timeSelect.innerHTML = times.map((time) => `<option value="${time}">${time} minutos</option>`).join("");
    updateTimeLegend(times, state.mode);
    state.maxTime = times.at(-1);
    timeSelect.value = String(state.maxTime);
    updateFilters();
  }
  document.getElementById("modeWalk").addEventListener("click", () => setMode("walk"));
  document.getElementById("modeBus").addEventListener("click", () => setMode("bus"));
  document.getElementById("schoolSelect").addEventListener("change", (event) => {
    state.selectedSchool = event.target.value;
    updateFilters();
    if (state.selectedSchool !== "all") {
      const school = state.data.schools.features.find((feature) => feature.properties.school_id === state.selectedSchool);
      if (school) map.flyTo({ center: school.geometry.coordinates, zoom: 13.4, duration: 900 });
    }
  });
  document.getElementById("timeSelect").addEventListener("change", (event) => {
    state.maxTime = Number(event.target.value);
    updateFilters();
  });
  [
    ["toggleMatricula", "matricula"],
    ["toggleNbi", "nbi"],
    ["toggleRenabap", "renabap"],
    ["toggleLimit", "limit"],
    ["toggleBusRoutes", "busRoutes"],
    ["toggleTransactions", "transactions"],
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("change", (event) => {
      state.visible[key] = event.target.checked;
      updateFilters();
    });
  });
  document.getElementById("isoOpacity").addEventListener("input", (event) => {
    state.isoOpacity = Number(event.target.value);
    updateFilters();
  });
  document.getElementById("nbiOpacity").addEventListener("input", (event) => {
    state.nbiOpacity = Number(event.target.value);
    updateFilters();
  });
}

function updateTimeLegend(times, mode) {
  document.getElementById("legendTimeTitle").textContent = "Peatonal";
  if (mode !== "walk") return;
  times.forEach((time, index) => {
    const element = document.getElementById(`legendT${index + 1}`);
    if (element) element.textContent = `${time} minutos`;
  });
}

function lineLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += turf.distance(turf.point(coords[i - 1]), turf.point(coords[i]), { units: "kilometers" });
  return total;
}

function pointAtFraction(coords, fraction) {
  const target = lineLength(coords) * fraction;
  let traveled = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const segment = turf.distance(turf.point(coords[i - 1]), turf.point(coords[i]), { units: "kilometers" });
    if (traveled + segment >= target) {
      const local = segment === 0 ? 0 : (target - traveled) / segment;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * local,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * local,
      ];
    }
    traveled += segment;
  }
  return coords.at(-1);
}

function updateBusAnimation() {
  const shouldRun = state.mode === "bus" && state.visible.busRoutes;
  if (!shouldRun) {
    if (busAnimation.requestId) cancelAnimationFrame(busAnimation.requestId);
    busAnimation.requestId = null;
    const source = map.getSource("bus-flow-particles");
    if (source) source.setData(featureCollection([]));
    const accessSource = map.getSource("bus-access-particles");
    if (accessSource) accessSource.setData(featureCollection([]));
    return;
  }
  if (busAnimation.requestId) return;
  busAnimation.startedAt = performance.now();
  const tick = (now) => {
    const elapsed = ((now - busAnimation.startedAt) / 5200) % 1;
    const features = [];
    const accessParticles = [];
    const accessElapsed = ((now - busAnimation.startedAt) / 3100) % 1;
    state.data.busAccessRoutes.features.forEach((access) => {
      if (state.selectedSchool !== "all" && access.properties.school_id !== state.selectedSchool) return;
      const color = SCHOOL_COLORS[access.properties.school_id] || "#2563eb";
      accessParticles.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pointAtFraction(access.geometry.coordinates, accessElapsed) },
        properties: { color, school_id: access.properties.school_id },
      });
    });
    state.data.busStudentFlows.features.forEach((flow) => {
      if (state.selectedSchool !== "all" && flow.properties.school_id !== state.selectedSchool) return;
      const count = Number(flow.properties.students || 1);
      const particles = Math.max(1, Math.min(8, Math.ceil(count / 3)));
      for (let i = 0; i < particles; i += 1) {
        const fraction = (elapsed + i / particles) % 1;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pointAtFraction(flow.geometry.coordinates, fraction) },
          properties: {
            color: flow.properties.color,
            school_id: flow.properties.school_id,
          },
        });
      }
    });
    const source = map.getSource("bus-flow-particles");
    if (source) source.setData(featureCollection(features));
    const accessSource = map.getSource("bus-access-particles");
    if (accessSource) accessSource.setData(featureCollection(accessParticles));
    busAnimation.requestId = requestAnimationFrame(tick);
  };
  busAnimation.requestId = requestAnimationFrame(tick);
}

function updateWalkAnimation() {
  const shouldRun = state.mode === "walk" && state.visible.matricula;
  if (!shouldRun) {
    if (walkAnimation.requestId) cancelAnimationFrame(walkAnimation.requestId);
    walkAnimation.requestId = null;
    const source = map.getSource("walk-particles");
    if (source) source.setData(featureCollection([]));
    return;
  }
  if (walkAnimation.requestId) return;
  walkAnimation.startedAt = performance.now();
  const enrollmentTotals = schoolTotals();
  const walkRouteTotals = routeTotals();
  const tick = (now) => {
    const elapsed = (now - walkAnimation.startedAt) / 46000;
    const features = [];
    state.data.walkRoutes.features.forEach((route, index) => {
      if (state.selectedSchool !== "all" && route.properties.school_id !== state.selectedSchool) return;
      const schoolId = route.properties.school_id;
      const schoolEnrollment = enrollmentTotals[schoolId] || 0;
      const schoolRoutes = Math.max(1, walkRouteTotals[schoolId] || 1);
      const particles = Math.max(10, Math.min(22, Math.ceil(schoolEnrollment / schoolRoutes * 1.35)));
      const offset = (index % 17) / 17;
      for (let particle = 0; particle < particles; particle += 1) {
        const cycle = (elapsed + offset + (particle / particles) * 0.96) % 1;
        const fraction = Math.min(1, cycle / 0.82);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pointAtFraction(route.geometry.coordinates, fraction) },
          properties: {
            color: route.properties.color,
            school_id: route.properties.school_id,
            progress: fraction,
          },
        });
      }
    });
    const source = map.getSource("walk-particles");
    if (source) source.setData(featureCollection(features));
    walkAnimation.requestId = requestAnimationFrame(tick);
  };
  walkAnimation.requestId = requestAnimationFrame(tick);
}

async function init() {
  const [schools, matricula, walkRoutes, limit, radios, renabap, isochrones, busIso, colectivos, colectivosFlow, busAccessLines, busAccessRoutes, busBoardingStops, busStudentFlows, transactions] = await Promise.all([
    fetchJson("data/escuelas.geojson"),
    fetchJson("data/matricula.geojson"),
    fetchJson("data/walk_student_routes.geojson", true),
    fetchJson("data/limite_partido.geojson"),
    fetchJson("data/radios_nbi.geojson", true),
    fetchJson("data/renabap.geojson", true),
    fetchJson("data/isochrones.geojson"),
    fetchJson("data/isochrones_bus.geojson", true),
    fetchJson("data/colectivos.geojson", true),
    fetchJson("data/colectivos_flow.geojson", true),
    fetchJson("data/bus_access_lines.geojson", true),
    fetchJson("data/bus_access_routes.geojson", true),
    fetchJson("data/bus_boarding_stops.geojson", true),
    fetchJson("data/bus_student_flows.geojson", true),
    fetchJson("data/transacciones_colectivo_san_martin.geojson", true),
  ]);
  state.data = { schools, matricula, walkRoutes, limit, radios, renabap, isochrones, busIso, colectivos, colectivosFlow, busAccessLines, busAccessRoutes, busBoardingStops, busStudentFlows, transactions };
  if (!state.data.busAccessRoutes.features.length) state.data.busAccessRoutes = state.data.busAccessLines;
  setupSchoolSelect();
  addSources();
  addLayers();
  setupControls();
  updateTimeLegend([5, 10, 15, 20], "walk");
  setupPopups();
  updateFilters();
  if (limit.features.length) {
    const bbox = turf.bbox(limit);
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: { top: 42, right: 610, bottom: 72, left: 630 }, duration: 0 },
    );
  }
}

map.on("load", () => {
  init().catch((error) => {
    console.error(error);
    document.getElementById("summaryText").textContent = "No se pudo cargar el visor. Revisar rutas y consola.";
  });
});
