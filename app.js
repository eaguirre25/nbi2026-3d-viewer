const CLASSES = [
  { id: 1, label: "Q1", min: 0, max: 0, color: "#003d2f", height: 140 },
  { id: 2, label: "Q2", min: 0, max: 0, color: "#6fc34a", height: 320 },
  { id: 3, label: "Q3", min: 0, max: 0, color: "#f0d84f", height: 560 },
  { id: 4, label: "Q4", min: 0, max: 0, color: "#f28a2e", height: 860 },
  { id: 5, label: "Q5", min: 0, max: 0, color: "#d7191c", height: 1240 },
];

let colorStops = [
  { value: 0, color: "#003d2f" },
  { value: 4, color: "#003d2f" },
  { value: 8.8, color: "#6fc34a" },
  { value: 15.9, color: "#f0d84f" },
  { value: 28.6, color: "#f28a2e" },
  { value: 54.5, color: "#d7191c" },
];

const gradientMaterialCache = new Map();

const state = {
  entities: [],
  surfaceEntities: [],
  surfaceTopEntities: [],
  politicalEntities: [],
  renabapEntities: [],
  enrollmentEntities: [],
  schoolEntities: [],
  activeClasses: new Set(CLASSES.map((item) => item.id)),
  heightScale: 1.5,
  elevationProgress: 1,
  opacity: 1,
  selectedEntity: null,
  hoverEntity: null,
  mode: "surface",
  enrollmentVisible: true,
  renabapVisible: true,
  labelsVisible: true,
  nbiFeatures: [],
  nbiSamples: [],
  renabapFeatures: [],
  renabapBounds: [],
  introRunning: false,
  waveRunning: false,
  keys: new Set(),
  mouseOrbiting: false,
  mouseOrbitStart: null,
  orbitHeading: Cesium.Math.toRadians(322),
  orbitPitch: Cesium.Math.toRadians(-32),
  orbitRange: 5200,
};
window.state = state;

Cesium.Ion.defaultAccessToken = "";

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  imageryProvider: false,
});
window.viewer = viewer;

const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  credit: "Esri World Imagery",
  maximumLevel: 19,
});
const satelliteLayer = viewer.imageryLayers.addImageryProvider(satelliteProvider);
satelliteLayer.brightness = 0.78;
satelliteLayer.contrast = 1.12;
satelliteLayer.saturation = 0.88;
satelliteLayer.gamma = 0.98;

viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 500;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 70000;
viewer.scene.screenSpaceCameraController.enableRotate = true;
viewer.scene.screenSpaceCameraController.enableTilt = true;
viewer.scene.screenSpaceCameraController.enableLook = false;
viewer.scene.screenSpaceCameraController.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
viewer.scene.screenSpaceCameraController.tiltEventTypes = [Cesium.CameraEventType.PINCH];
viewer.scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#171a1c");
viewer.scene.fog.enabled = true;
viewer.scene.fog.density = 0.00018;
viewer.scene.highDynamicRange = true;
setIntroStartView();

function getClass(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return CLASSES[0];
  for (let i = 0; i < CLASSES.length; i += 1) {
    const item = CLASSES[i];
    if (i === 0 && numeric >= item.min && numeric <= item.max) return item;
    if (i > 0 && numeric > item.min && numeric <= item.max) return item;
  }
  return numeric > CLASSES.at(-1).max ? CLASSES.at(-1) : CLASSES[0];
}

function formatPct(value) {
  return Number(value).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function quantile(sortedValues, q) {
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function configureQuantileClasses(features) {
  const values = features
    .map((feature) => Number(feature.properties?.pct_nbi))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const breaks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((q) => quantile(values, q));
  colorStops = [
    { value: breaks[0], color: "#003d2f" },
    { value: breaks[1], color: "#6fc34a" },
    { value: breaks[2], color: "#f0d84f" },
    { value: breaks[3], color: "#f28a2e" },
    { value: breaks[4], color: "#d7191c" },
    { value: breaks[5], color: "#7f0000" },
  ];
  CLASSES.forEach((klass, index) => {
    klass.min = breaks[index];
    klass.max = breaks[index + 1];
    klass.label =
      index === 0
        ? `P0-P20: ${formatPct(klass.min)} - ${formatPct(klass.max)}`
        : `P${index * 20}-P${(index + 1) * 20}: >${formatPct(klass.min)} - ${formatPct(klass.max)}`;
    const row = document.querySelector(`.legend-row[data-class="${klass.id}"] span:nth-child(2)`);
    if (row) row.textContent = klass.label.replace(":", "");
  });
}

function cesiumColor(entity, alpha = state.opacity) {
  const klass = getClass(entity.properties.pct_nbi?.getValue());
  return Cesium.Color.fromCssColorString(klass.color).withAlpha(alpha);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function colorForValue(value, alpha = state.opacity) {
  const numeric = Math.max(colorStops[0].value, Math.min(colorStops.at(-1).value, Number(value) || 0));
  let lower = colorStops[0];
  let upper = colorStops.at(-1);
  for (let i = 0; i < colorStops.length - 1; i += 1) {
    if (numeric >= colorStops[i].value && numeric <= colorStops[i + 1].value) {
      lower = colorStops[i];
      upper = colorStops[i + 1];
      break;
    }
  }
  const t = (numeric - lower.value) / (upper.value - lower.value || 1);
  const a = hexToRgb(lower.color);
  const b = hexToRgb(upper.color);
  return new Cesium.Color(
    (a.r + (b.r - a.r) * t) / 255,
    (a.g + (b.g - a.g) * t) / 255,
    (a.b + (b.b - a.b) * t) / 255,
    alpha,
  );
}

function gradientImage(baseHex, topHex) {
  const key = `${baseHex}-${topHex}`;
  if (gradientMaterialCache.has(key)) return gradientMaterialCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, canvas.height, 0, 0);
  gradient.addColorStop(0, baseHex);
  gradient.addColorStop(0.42, "#2f8f47");
  gradient.addColorStop(0.72, topHex);
  gradient.addColorStop(1, topHex);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/png");
  gradientMaterialCache.set(key, url);
  return url;
}

function blockGradientMaterial(value) {
  const klass = getClass(value);
  return new Cesium.ImageMaterialProperty({
    image: gradientImage("#003d2f", klass.color),
    transparent: false,
    repeat: new Cesium.Cartesian2(1, 1),
    color: Cesium.Color.WHITE.withAlpha(state.opacity),
  });
}

function toCartesianRing(ring) {
  return ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
}

function makeHierarchy(poly) {
  return new Cesium.PolygonHierarchy(
    toCartesianRing(poly[0]),
    poly.slice(1).map((hole) => new Cesium.PolygonHierarchy(toCartesianRing(hole))),
  );
}

function normalizeGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, poly) {
  if (!poly[0] || !pointInRing(point, poly[0])) return false;
  return !poly.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInFeature(point, feature) {
  return normalizeGeometry(feature.geometry).some((poly) => pointInPolygon(point, poly));
}

function featureCentroid(feature) {
  const ring = normalizeGeometry(feature.geometry)[0]?.[0] || [];
  const sum = ring.reduce(
    (acc, point) => {
      acc.lon += point[0];
      acc.lat += point[1];
      return acc;
    },
    { lon: 0, lat: 0 },
  );
  return {
    lon: sum.lon / Math.max(ring.length, 1),
    lat: sum.lat / Math.max(ring.length, 1),
    value: Number(feature.properties?.pct_nbi || 0),
  };
}

function dataBounds(features) {
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  features.forEach((feature) => {
    normalizeGeometry(feature.geometry).forEach((poly) => {
      poly[0].forEach(([lon, lat]) => {
        bounds.west = Math.min(bounds.west, lon);
        bounds.south = Math.min(bounds.south, lat);
        bounds.east = Math.max(bounds.east, lon);
        bounds.north = Math.max(bounds.north, lat);
      });
    });
  });
  return bounds;
}

function featureBounds(feature) {
  return dataBounds([feature]);
}

function boundsOverlap(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function isPointInRenabap(point) {
  return state.renabapFeatures.some((feature, index) => {
    const bounds = state.renabapBounds[index];
    if (
      bounds &&
      (point[0] < bounds.west || point[0] > bounds.east || point[1] < bounds.south || point[1] > bounds.north)
    ) {
      return false;
    }
    return pointInFeature(point, feature);
  });
}

function featureTouchesStudyArea(feature, studyFeatures) {
  const center = featureCentroid(feature);
  if (studyFeatures.some((studyFeature) => pointInFeature([center.lon, center.lat], studyFeature))) return true;
  return normalizeGeometry(feature.geometry).some((poly) =>
    poly[0].some((point) => studyFeatures.some((studyFeature) => pointInFeature(point, studyFeature))),
  );
}

function idwValue(lon, lat, samples) {
  const nearest = samples
    .map((sample) => {
      const dx = (lon - sample.lon) * Math.cos(Cesium.Math.toRadians(lat));
      const dy = lat - sample.lat;
      return { ...sample, d2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, 35);
  if (nearest[0]?.d2 < 1e-12) return nearest[0].value;
  let weighted = 0;
  let weights = 0;
  nearest.forEach((sample) => {
    const weight = 1 / Math.pow(sample.d2, 0.95);
    weighted += sample.value * weight;
    weights += weight;
  });
  return weighted / weights;
}

function nearestSampleValue(lon, lat, samples) {
  let best = samples[0];
  let bestD2 = Infinity;
  samples.forEach((sample) => {
    const dx = (lon - sample.lon) * Math.cos(Cesium.Math.toRadians(lat));
    const dy = lat - sample.lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = sample;
      bestD2 = d2;
    }
  });
  return best?.value || 0;
}

function valueAtPoint(lon, lat, features, samples) {
  const point = [lon, lat];
  const feature = features.find((item) => pointInFeature(point, item));
  if (feature) return Number(feature.properties?.pct_nbi || 0);
  return nearestSampleValue(lon, lat, samples);
}

function smoothGrid(grid, cols, rows, passes = 5) {
  let current = grid;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((row) => row.slice());
    for (let y = 1; y < rows; y += 1) {
      for (let x = 1; x < cols; x += 1) {
        const center = current[y][x];
        const north = current[y - 1][x];
        const south = current[y + 1][x];
        const west = current[y][x - 1];
        const east = current[y][x + 1];
        const diagonals =
          current[y - 1][x - 1] + current[y - 1][x + 1] + current[y + 1][x - 1] + current[y + 1][x + 1];
        next[y][x] = center * 0.34 + (north + south + west + east) * 0.12 + diagonals * 0.045;
      }
    }
    current = next;
  }
  return current;
}

function heightForValueAtProgress(value, progress = state.elevationProgress) {
  const normalized = Math.max(0, Math.min(1, Number(value || 0) / 54.5));
  const shaped = Math.pow(normalized, 0.82);
  return (20 + shaped * 1700 * state.heightScale) * progress;
}

function heightForValue(value) {
  return heightForValueAtProgress(value);
}

function addFeature(feature, index) {
  const props = feature.properties || {};
  const klass = getClass(props.pct_nbi);
  const polygons = normalizeGeometry(feature.geometry);

  polygons.forEach((poly, partIndex) => {
    if (!poly[0] || poly[0].length < 4) return;
    const entity = viewer.entities.add({
      name: `FRAC ${props.FRAC || ""} - RADIO ${props.RADIO || ""}`,
      polygon: {
        hierarchy: makeHierarchy(poly),
        height: 0,
        extrudedHeight: klass.height * state.heightScale,
        material: Cesium.Color.fromCssColorString(klass.color).withAlpha(state.opacity),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(klass.id <= 2 ? "#063b36" : "#fff1c0").withAlpha(0.62),
        outlineWidth: 1,
        shadows: Cesium.ShadowMode.ENABLED,
      },
      properties: {
        ...props,
        classId: klass.id,
        classLabel: klass.label,
        baseHeight: klass.height,
        featureIndex: index,
        partIndex,
      },
    });
    entity.show = false;
    state.entities.push(entity);
  });
}

function addSurfaceCell(west, south, east, north, cornerValues, centerValue, index) {
  const positions = [
    Cesium.Cartesian3.fromDegrees(west, south),
    Cesium.Cartesian3.fromDegrees(east, south),
    Cesium.Cartesian3.fromDegrees(east, north),
    Cesium.Cartesian3.fromDegrees(west, north),
  ];
  const klass = getClass(centerValue);
  const entity = viewer.entities.add({
    name: `Superficie NBI ${centerValue.toFixed(2)}%`,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      height: 0,
      extrudedHeight: heightForValue(centerValue),
      material: Cesium.Color.fromCssColorString("#003d2f").withAlpha(state.opacity),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#061513").withAlpha(0.12),
      outlineWidth: 0.25,
      shadows: Cesium.ShadowMode.ENABLED,
    },
    properties: {
      pct_nbi: centerValue,
      classId: klass.id,
      classLabel: klass.label,
      baseHeight: heightForValue(centerValue) / state.heightScale,
      surfaceIndex: index,
    },
  });
  entity.nbiCell = { west, south, east, north, cornerValues, value: centerValue };
  state.surfaceEntities.push(entity);
  const topHeight = heightForValue(centerValue) + 2;
  const topEntity = viewer.entities.add({
    name: `Cumbre NBI ${centerValue.toFixed(2)}%`,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy([
        Cesium.Cartesian3.fromDegrees(west, south, topHeight),
        Cesium.Cartesian3.fromDegrees(east, south, topHeight),
        Cesium.Cartesian3.fromDegrees(east, north, topHeight),
        Cesium.Cartesian3.fromDegrees(west, north, topHeight),
      ]),
      perPositionHeight: true,
      material: colorForValue(centerValue, state.opacity),
      outline: false,
    },
    properties: {
      pct_nbi: centerValue,
      classId: klass.id,
      classLabel: klass.label,
      surfaceIndex: index,
    },
  });
  topEntity.nbiCell = { west, south, east, north, value: centerValue };
  state.surfaceTopEntities.push(topEntity);
}

function buildSurface(features) {
  const bounds = dataBounds(features);
  const samples = features.map(featureCentroid);
  const cols = 108;
  const rows = 108;
  const dx = (bounds.east - bounds.west) / cols;
  const dy = (bounds.north - bounds.south) / rows;
  const rawGrid = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: cols + 1 }, (_item, col) => {
      const lon = bounds.west + col * dx;
      const lat = bounds.south + row * dy;
      const localValue = valueAtPoint(lon, lat, features, samples);
      const softValue = idwValue(lon, lat, samples);
      return localValue * 0.78 + softValue * 0.22;
    }),
  );
  const smoothedGrid = smoothGrid(rawGrid, cols, rows, 2);
  const grid = smoothedGrid.map((line, row) =>
    line.map((value, col) => value * 0.38 + rawGrid[row][col] * 0.62),
  );
  let index = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const west = bounds.west + col * dx;
      const east = west + dx;
      const south = bounds.south + row * dy;
      const north = south + dy;
      const center = [(west + east) / 2, (south + north) / 2];
      const insideStudyArea = [center, [west, south], [east, south], [east, north], [west, north]].every((point) =>
        features.some((feature) => pointInFeature(point, feature)),
      );
      if (!insideStudyArea) continue;
      const cornerValues = [
        grid[row][col],
        grid[row][col + 1],
        grid[row + 1][col + 1],
        grid[row + 1][col],
      ];
      const centerValue = cornerValues.reduce((sum, value) => sum + value, 0) / 4;
      addSurfaceCell(west, south, east, north, cornerValues, centerValue, index);
      index += 1;
    }
  }
}

function labelText(name) {
  return name === "Ciudad Autónoma de Buenos Aires" ? "CABA" : name;
}

function addPoliticalRing(ring, name, isCaba) {
  const positions = ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 120));
  const entity = viewer.entities.add({
    name,
    polyline: {
      positions,
      width: isCaba ? 4.2 : 3.2,
      material: new Cesium.PolylineOutlineMaterialProperty({
        color: Cesium.Color.fromCssColorString(isCaba ? "#f8f6a8" : "#ffffff").withAlpha(0.78),
        outlineColor: Cesium.Color.fromCssColorString("#071014").withAlpha(0.82),
        outlineWidth: 2,
      }),
      clampToGround: false,
    },
  });
  state.politicalEntities.push(entity);
}

function addPoliticalFeature(feature) {
  const props = feature.properties || {};
  const name = props.NOMBRE || props.nam || "Municipio";
  const isCaba = name === "Ciudad Autónoma de Buenos Aires";
  const geometry = feature.geometry;
  const polygons = normalizeGeometry(geometry);
  polygons.forEach((poly) => {
    if (poly[0]?.length) addPoliticalRing(poly[0], name, isCaba);
  });

  const lon = Number(props.LONGITUD_C ?? props.LONGITUD_CE ?? props.longitud ?? props.lon);
  const lat = Number(props.LATITUD_CE ?? props.LATITUD_C ?? props.latitud ?? props.lat);
  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    const label = viewer.entities.add({
      name: `${name} label`,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 350),
      label: {
        text: labelText(name),
        font: isCaba ? "700 15px Inter, sans-serif" : "700 14px Inter, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 70000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    state.politicalEntities.push(label);
  }
}

async function loadPoliticalBoundaries() {
  const response = await fetch("political_boundaries.geojson");
  const geojson = await response.json();
  geojson.features.forEach(addPoliticalFeature);
}

function renabapHeight(lon, lat) {
  const localValue = valueAtPoint(lon, lat, state.nbiFeatures, state.nbiSamples);
  return heightForValueAtProgress(localValue, 1) + 3;
}

function toRoofRing(ring) {
  return ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, renabapHeight(lon, lat)));
}

function makeRoofHierarchy(poly) {
  return new Cesium.PolygonHierarchy(
    toRoofRing(poly[0]),
    poly.slice(1).map((hole) => new Cesium.PolygonHierarchy(toRoofRing(hole))),
  );
}

function addRenabapFeature(feature, index) {
  const props = feature.properties || {};
  const name = props.nombre_bar || "Barrio RENABAP";
  normalizeGeometry(feature.geometry).forEach((poly, partIndex) => {
    if (!poly[0] || poly[0].length < 4) return;
    const fill = viewer.entities.add({
      name: `${name} RENABAP`,
      polygon: {
        hierarchy: makeRoofHierarchy(poly),
        perPositionHeight: true,
        material: new Cesium.GridMaterialProperty({
          color: Cesium.Color.fromCssColorString("#00e0bd").withAlpha(0.44),
          cellAlpha: 0.16,
          lineCount: new Cesium.Cartesian2(10, 10),
          lineThickness: new Cesium.Cartesian2(1.25, 1.25),
        }),
        outline: false,
      },
      properties: {
        renabap: true,
        nombre_bar: name,
        clasificac: props.clasificac || "RENABAP",
        cantidad_f: Number(props.cantidad_f || 0),
        cantidad_v: Number(props.cantidad_v || 0),
        superficie: Number(props.superficie || 0),
        featureIndex: index,
        partIndex,
      },
    });
    state.renabapEntities.push(fill);

    const outline = viewer.entities.add({
      name: `${name} borde RENABAP`,
      polyline: {
        positions: toRoofRing(poly[0]),
        width: 2,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: Cesium.Color.fromCssColorString("#f8ffcf").withAlpha(0.86),
          outlineColor: Cesium.Color.fromCssColorString("#003d2f").withAlpha(0.95),
          outlineWidth: 2,
        }),
        clampToGround: false,
      },
      properties: {
        renabap: true,
        nombre_bar: name,
        clasificac: props.clasificac || "RENABAP",
        cantidad_f: Number(props.cantidad_f || 0),
        cantidad_v: Number(props.cantidad_v || 0),
        superficie: Number(props.superficie || 0),
        featureIndex: index,
        partIndex,
      },
    });
    state.renabapEntities.push(outline);
  });
}

async function loadRenabap() {
  const response = await fetch("RENABAP20222.geojson");
  const geojson = await response.json();
  const studyBounds = dataBounds(state.nbiFeatures);
  const candidates = geojson.features.filter(
    (feature) => boundsOverlap(featureBounds(feature), studyBounds) && featureTouchesStudyArea(feature, state.nbiFeatures),
  );
  state.renabapFeatures = candidates;
  state.renabapBounds = candidates.map(featureBounds);
  candidates.forEach(addRenabapFeature);
}

function parseLayer(layer = "") {
  const text = String(layer).replaceAll("_", " ");
  const year = text.match(/20\d{2}/)?.[0] || "";
  const school = text.match(/ES\s?6|ES6/i)?.[0]?.replace(" ", "").toUpperCase() || "ES6";
  const turn = /TARDE|TT/i.test(text) ? "Tarde" : /MAÑANA|TM/i.test(text) ? "Mañana" : "";
  const course = text.match(/\b[1-6](?:RO|DO|TO|ER|°)?\s*[1-6]?(?:RA|DA|TA)?/i)?.[0] || "";
  return { year, school, turn, course: course.trim() };
}

function enrollmentColor(school) {
  if (school === "Galeano") return "#59d8ff";
  if (school === "Pizarnik") return "#c8a7ff";
  return "#ffffff";
}

function addEnrollmentPoint(feature, index, school = "Walsh") {
  const coords = feature.geometry?.coordinates;
  if (!coords || feature.geometry?.type !== "Point") return;
  const props = feature.properties || {};
  const parsed = parseLayer(props.layer);
  const localValue = valueAtPoint(coords[0], coords[1], state.nbiFeatures, state.nbiSamples);
  const roofHeight = heightForValue(localValue);
  const inRenabap = isPointInRenabap([coords[0], coords[1]]);
  const entity = viewer.entities.add({
    name: `Matrícula ${school} ${index + 1}`,
    position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1], roofHeight + 34),
    point: {
      pixelSize: 4,
      color: Cesium.Color.fromCssColorString(enrollmentColor(school)).withAlpha(0.96),
      outlineColor: Cesium.Color.fromCssColorString(school === "Pizarnik" ? "#ffffff" : "#061513").withAlpha(0.95),
      outlineWidth: school === "Pizarnik" ? 1 : 2,
      disableDepthTestDistance: 0,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
    },
    properties: {
      enrollment: true,
      enrollmentSchool: school,
      layer: props.layer || "",
      direccion: props.DIRECCION || props.ADRES || props.address || props.address_2 || "",
      school: parsed.school,
      turn: parsed.turn,
      course: parsed.course,
      year: parsed.year,
      pct_nbi_roof: localValue,
      roofClassId: getClass(localValue).id,
      inRenabap,
    },
  });
  state.enrollmentEntities.push(entity);
}

async function loadEnrollment() {
  const response = await fetch("WALSH_MATRICULA_TOTAL.geojson");
  const geojson = await response.json();
  geojson.features.forEach((feature, index) => addEnrollmentPoint(feature, index, "Walsh"));
}

async function loadGaleanoEnrollment() {
  const response = await fetch("ESCUELAGALEANO_MATRICULA.geojson");
  const geojson = await response.json();
  geojson.features.forEach((feature, index) => addEnrollmentPoint(feature, index, "Galeano"));
}

async function loadPizarnikEnrollment() {
  const response = await fetch("MATRICULA_ESCUELA_PIZARNIK_WGS84.geojson");
  const geojson = await response.json();
  geojson.features.forEach((feature, index) => addEnrollmentPoint(feature, index, "Pizarnik"));
}

function updateSchoolDistribution(school, prefix) {
  const counts = new Map(CLASSES.map((item) => [item.id, 0]));
  const entities = state.enrollmentEntities.filter((entity) => entity.properties.enrollmentSchool.getValue() === school);
  entities.forEach((entity) => {
    const id = entity.properties.roofClassId.getValue();
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  const total = Math.max(1, entities.length);
  counts.forEach((count, id) => {
    const element = document.getElementById(`${prefix}-${id}`);
    if (element) element.textContent = `${((count / total) * 100).toFixed(1)}%`;
  });
}

function updateEnrollmentDistributions() {
  updateSchoolDistribution("Walsh", "walsh");
  updateSchoolDistribution("Galeano", "galeano");
  updateSchoolDistribution("Pizarnik", "pizarnik");
  updateRenabapEnrollmentSummary();
}

function updateRenabapEnrollmentSummary() {
  [
    ["Walsh", "walsh-renabap"],
    ["Galeano", "galeano-renabap"],
    ["Pizarnik", "pizarnik-renabap"],
  ].forEach(([school, id]) => {
    const entities = state.enrollmentEntities.filter((entity) => entity.properties.enrollmentSchool.getValue() === school);
    const total = Math.max(1, entities.length);
    const inside = entities.filter((entity) => entity.properties.inRenabap?.getValue() === true).length;
    const element = document.getElementById(id);
    if (element) element.textContent = `${school} ${((inside / total) * 100).toFixed(1)}%`;
  });
}

function addSchoolMarker(feature) {
  const coords = feature.geometry?.coordinates;
  if (!coords || feature.geometry?.type !== "Point") return;
  const localValue = valueAtPoint(coords[0], coords[1], state.nbiFeatures, state.nbiSamples);
  const roofHeight = heightForValue(localValue);
  const markerHeight = roofHeight + 2350;
  const position = Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight);
  const pole = viewer.entities.add({
    name: "Escuela Walsh altura",
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], roofHeight + 40),
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight - 18),
      ],
      width: 3,
      material: Cesium.Color.fromCssColorString("#00e0bd").withAlpha(0.9),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Walsh",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(pole);
  const entity = viewer.entities.add({
    name: "Escuela Walsh",
    position,
    billboard: {
      image: "walsh-marker.svg",
      width: 116,
      height: 128,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -2000),
    },
    label: {
      text: "Escuela Walsh",
      font: "800 14px Inter, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -132),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -2000),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Walsh",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(entity);
}

function addGaleanoSchoolMarker(feature) {
  const coords = feature.geometry?.coordinates;
  if (!coords || feature.geometry?.type !== "Point") return;
  const localValue = valueAtPoint(coords[0], coords[1], state.nbiFeatures, state.nbiSamples);
  const roofHeight = heightForValue(localValue);
  const markerHeight = roofHeight + 2050;
  const position = Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight);
  const pole = viewer.entities.add({
    name: "Escuela Galeano altura",
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], roofHeight + 40),
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight - 18),
      ],
      width: 3,
      material: Cesium.Color.fromCssColorString("#59d8ff").withAlpha(0.9),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Galeano",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(pole);
  const entity = viewer.entities.add({
    name: "Escuela Galeano",
    position,
    billboard: {
      image: "galeano-marker.svg",
      width: 108,
      height: 120,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -1900),
    },
    label: {
      text: "Escuela Galeano",
      font: "800 14px Inter, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -124),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -1900),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Galeano",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(entity);
}

function addPizarnikSchoolMarker(feature) {
  const coords = feature.geometry?.coordinates;
  if (!coords || feature.geometry?.type !== "Point") return;
  const localValue = valueAtPoint(coords[0], coords[1], state.nbiFeatures, state.nbiSamples);
  const roofHeight = heightForValue(localValue);
  const markerHeight = roofHeight + 2200;
  const position = Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight);
  const pole = viewer.entities.add({
    name: "Escuela Pizarnik altura",
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], roofHeight + 40),
        Cesium.Cartesian3.fromDegrees(coords[0], coords[1], markerHeight - 18),
      ],
      width: 3,
      material: Cesium.Color.fromCssColorString(enrollmentColor("Pizarnik")).withAlpha(0.92),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Pizarnik",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(pole);
  const entity = viewer.entities.add({
    name: "Escuela Pizarnik",
    position,
    billboard: {
      image: "pizarnik-marker.svg",
      width: 112,
      height: 124,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -1950),
    },
    label: {
      text: "Escuela Pizarnik",
      font: "800 14px Inter, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -128),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -1950),
    },
    properties: {
      schoolMarker: true,
      schoolName: "Escuela Pizarnik",
      pct_nbi_roof: localValue,
    },
  });
  state.schoolEntities.push(entity);
}

async function loadSchool() {
  const response = await fetch("ESCUELA_WALSH.geojson");
  const geojson = await response.json();
  geojson.features.forEach(addSchoolMarker);
}

async function loadGaleanoSchool() {
  const response = await fetch("ESCUELA_GALEANO.geojson");
  const geojson = await response.json();
  geojson.features.forEach(addGaleanoSchoolMarker);
}

async function loadPizarnikSchool() {
  const response = await fetch("ESCUELA_PIZARNIK.geojson");
  const geojson = await response.json();
  geojson.features.forEach(addPizarnikSchoolMarker);
}

function flyOverview() {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-58.558, -34.585, 6200),
    orientation: {
      heading: Cesium.Math.toRadians(334),
      pitch: Cesium.Math.toRadians(-36),
      roll: 0,
    },
    duration: 0.8,
  });
}

function flyTilt() {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-58.567, -34.592, 3600),
    orientation: {
      heading: Cesium.Math.toRadians(338),
      pitch: Cesium.Math.toRadians(-28),
      roll: 0,
    },
    duration: 0.8,
  });
}

function flyToAsync(options) {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      ...options,
      complete: resolve,
      cancel: resolve,
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForNextFrames(count = 2) {
  return new Promise((resolve) => {
    let remaining = count;
    function step() {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

async function waitForScenePreload() {
  setIntroStartView();
  viewer.scene.requestRender();
  await waitForNextFrames(4);
  await wait(160);
  viewer.scene.requestRender();
  await waitForNextFrames(3);
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setIntroStartView() {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-55.5, -37.5, 13500000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
}

function setIntroReadyView() {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-58.555, -34.57, 9000),
    orientation: {
      heading: Cesium.Math.toRadians(318),
      pitch: Cesium.Math.toRadians(-46),
      roll: 0,
    },
  });
}

async function startIntroSequence() {
  if (state.introRunning) return;
  state.introRunning = true;
  setIntroStartView();
  await wait(650);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-59.4, -51.7, 4200000),
    orientation: {
      heading: Cesium.Math.toRadians(8),
      pitch: Cesium.Math.toRadians(-78),
      roll: 0,
    },
  });
  await wait(850);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-58.555, -34.57, 9000),
    orientation: {
      heading: Cesium.Math.toRadians(318),
      pitch: Cesium.Math.toRadians(-46),
      roll: 0,
    },
  });
  await wait(350);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-58.56, -34.58, 5600),
    orientation: {
      heading: Cesium.Math.toRadians(322),
      pitch: Cesium.Math.toRadians(-32),
      roll: 0,
    },
  });
  await waitForNextFrames(2);
  await revealBlocksWave();
  await orbitIntro();
  state.introRunning = false;
}

function applySurfaceCellProgress(entity, progress) {
  const value = entity.properties.pct_nbi.getValue();
  entity.polygon.extrudedHeight = heightForValueAtProgress(value, progress);
}

function applySurfaceTopProgress(entity, progress) {
  const value = entity.properties.pct_nbi.getValue();
  const height = heightForValueAtProgress(value, progress) + (progress > 0 ? 2 : 0);
  if (entity.nbiCell) {
    const { west, south, east, north } = entity.nbiCell;
    entity.polygon.hierarchy = new Cesium.PolygonHierarchy([
      Cesium.Cartesian3.fromDegrees(west, south, height),
      Cesium.Cartesian3.fromDegrees(east, south, height),
      Cesium.Cartesian3.fromDegrees(east, north, height),
      Cesium.Cartesian3.fromDegrees(west, north, height),
    ]);
  }
}

async function revealBlocksWave() {
  state.waveRunning = true;
  state.renabapEntities.forEach((entity) => {
    entity.show = false;
  });
  state.enrollmentEntities.forEach((entity) => {
    entity.show = false;
  });
  state.schoolEntities.forEach((entity) => {
    entity.show = false;
  });

  const bounds = dataBounds(state.nbiFeatures);
  const wave = viewer.entities.add({
    name: "Onda provincia capital",
    polyline: {
      positions: [],
      width: 10,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString("#f8ffcf").withAlpha(0.92),
        glowPower: 0.22,
        taperPower: 0.75,
      }),
      clampToGround: false,
    },
  });

  const steps = 20;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const lon = bounds.west + (bounds.east - bounds.west) * t;
    const diagonal = (bounds.east - bounds.west) * 0.18;
    wave.polyline.positions = [
      Cesium.Cartesian3.fromDegrees(lon - diagonal, bounds.north, 2500),
      Cesium.Cartesian3.fromDegrees(lon + diagonal, bounds.south, 2500),
    ];
    viewer.scene.requestRender();
    await wait(48);
  }
  viewer.entities.remove(wave);

  state.elevationProgress = 1;
  state.waveRunning = false;
  refreshAllStyles();
  await wait(120);
}

function refreshIntroElevation() {
  state.surfaceEntities.forEach((entity) => {
    const classId = entity.properties.classId.getValue();
    entity.show = state.mode === "surface" && state.activeClasses.has(classId);
    const value = entity.properties.pct_nbi.getValue();
    entity.polygon.extrudedHeight = heightForValue(value);
  });
  state.surfaceTopEntities.forEach((entity) => {
    const classId = entity.properties.classId.getValue();
    entity.show = state.mode === "surface" && state.activeClasses.has(classId);
    const value = entity.properties.pct_nbi.getValue();
    const height = heightForValue(value) + 2;
    if (entity.nbiCell) {
      const { west, south, east, north } = entity.nbiCell;
      entity.polygon.hierarchy = new Cesium.PolygonHierarchy([
        Cesium.Cartesian3.fromDegrees(west, south, height),
        Cesium.Cartesian3.fromDegrees(east, south, height),
        Cesium.Cartesian3.fromDegrees(east, north, height),
        Cesium.Cartesian3.fromDegrees(west, north, height),
      ]);
    }
  });
  viewer.scene.requestRender();
}

function orbitIntro() {
  const target = Cesium.Cartesian3.fromDegrees(-58.558, -34.575, 350);
  const start = performance.now();
  const duration = 2600;
  const pitch = Cesium.Math.toRadians(-30);
  const range = 5000;

  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeInOut(t);
      const heading = Cesium.Math.toRadians(318 + 82 * eased);
      viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-AR").format(Math.round(value || 0));
}

function updateStats(features) {
  const counts = new Map(CLASSES.map((item) => [item.id, 0]));
  let maxNbi = 0;
  let totalNbiHomes = 0;
  let totalPopulation = 0;

  features.forEach((feature) => {
    const props = feature.properties || {};
    const klass = getClass(props.pct_nbi);
    counts.set(klass.id, counts.get(klass.id) + 1);
    maxNbi = Math.max(maxNbi, Number(props.pct_nbi || 0));
    totalNbiHomes += Number(props.hog_nbi || 0);
    totalPopulation += Number(props.pob_tot || 0);
  });

  counts.forEach((count, id) => {
    document.getElementById(`count-${id}`).textContent = count;
  });
  document.getElementById("totalFeatures").textContent = formatNumber(features.length);
  document.getElementById("maxNbi").textContent = `${maxNbi.toFixed(1)}%`;
  document.getElementById("totalNbiHomes").textContent = formatNumber(totalNbiHomes);
  document.getElementById("totalPopulation").textContent = formatNumber(totalPopulation);
}

function updateDetail(entity) {
  const detail = document.getElementById("detailList");
  if (!detail) return;
  if (!entity) {
    detail.innerHTML = "<div><dt>Estado</dt><dd>Selecciona un poligono</dd></div>";
    return;
  }

  const props = entity.properties;
  const isEnrollment = props.enrollment?.getValue?.() === true;
  if (isEnrollment) {
    const schoolName = props.enrollmentSchool?.getValue() || "Walsh";
    const rows = [
      ["Tipo", "Matrícula"],
      ["Escuela", schoolName],
      ["Turno", props.turn?.getValue()],
      ["Curso", props.course?.getValue()],
      ["Año", props.year?.getValue()],
      ["NBI techo", `${Number(props.pct_nbi_roof?.getValue() || 0).toFixed(1)}%`],
      ["RENABAP", props.inRenabap?.getValue() ? "Dentro de villa/asentamiento" : "Fuera"],
      ["Capa", props.layer?.getValue()],
    ];
    detail.innerHTML =
      `<div class="detail-hero"><strong>1</strong><span>registro ${schoolName}</span></div>` +
      rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value || "-"}</dd></div>`).join("");
    return;
  }

  const isRenabap = props.renabap?.getValue?.() === true;
  if (isRenabap) {
    const name = props.nombre_bar?.getValue() || "Barrio RENABAP";
    const type = props.clasificac?.getValue() || "RENABAP";
    detail.innerHTML =
      `<div class="detail-hero"><strong>${type}</strong><span>RENABAP</span></div>` +
      [
        ["Nombre", name],
        ["Familias", formatNumber(props.cantidad_f?.getValue())],
        ["Viviendas", formatNumber(props.cantidad_v?.getValue())],
        ["Superficie", `${formatNumber(props.superficie?.getValue())} m2`],
      ]
        .map(([key, value]) => `<div><dt>${key}</dt><dd>${value || "-"}</dd></div>`)
        .join("");
    return;
  }

  const isSchoolMarker = props.schoolMarker?.getValue?.() === true;
  if (isSchoolMarker) {
    const schoolName = props.schoolName?.getValue() || "Escuela";
    detail.innerHTML =
      `<div class="detail-hero"><strong>${schoolName.replace("Escuela ", "")}</strong><span>escuela</span></div>` +
      [
        ["Tipo", "Escuela"],
        ["Nombre", schoolName],
        ["NBI techo", `${Number(props.pct_nbi_roof?.getValue() || 0).toFixed(1)}%`],
      ]
        .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
        .join("");
    return;
  }

  const isSurface = props.surfaceIndex !== undefined;
  const nbi = Number(props.pct_nbi?.getValue() || 0);
  const title = isSurface ? "CELDA INTERPOLADA" : `RADIO ${props.LINK?.getValue() || ""}`;
  const rows = [
    ["Unidad", title],
    ["Fraccion", props.FRAC?.getValue()],
    ["Radio", props.RADIO?.getValue()],
    ["NBI", `${nbi.toFixed(1)}%`],
    ["Rango", props.classLabel?.getValue()],
    ["Hogares", formatNumber(props.hog_tot?.getValue())],
    ["Hog. NBI", formatNumber(props.hog_nbi?.getValue())],
    ["Poblacion", formatNumber(props.pob_tot?.getValue())],
  ];

  detail.innerHTML = `<div class="detail-hero"><strong>${nbi.toFixed(1)}%</strong><span>% hogares con NBI</span></div>` + rows
    .map(([key, value]) => `<div><dt>${key}</dt><dd>${value ?? "-"}</dd></div>`)
    .join("");
}

function refreshEntityStyle(entity) {
  const classId = entity.properties.classId.getValue();
  const visible = state.activeClasses.has(classId);
  entity.show = state.mode === "radios" && visible;
  entity.polygon.extrudedHeight = entity.properties.baseHeight.getValue() * state.heightScale * state.elevationProgress;
  entity.polygon.material =
    entity === state.selectedEntity
      ? Cesium.Color.fromCssColorString("#ffd84a").withAlpha(0.98)
      : cesiumColor(entity);
}

function refreshAllStyles() {
  state.entities.forEach(refreshEntityStyle);
  state.surfaceEntities.forEach((entity) => {
    const classId = entity.properties.classId.getValue();
    entity.show = state.mode === "surface" && state.activeClasses.has(classId);
    const value = entity.properties.pct_nbi.getValue();
    entity.polygon.extrudedHeight = heightForValue(value);
    entity.polygon.material = Cesium.Color.fromCssColorString("#003d2f").withAlpha(state.opacity);
  });
  state.surfaceTopEntities.forEach((entity) => {
    const classId = entity.properties.classId.getValue();
    entity.show = state.mode === "surface" && state.activeClasses.has(classId);
    const value = entity.properties.pct_nbi.getValue();
    const height = heightForValue(value) + 2;
    if (entity.nbiCell) {
      const { west, south, east, north } = entity.nbiCell;
      entity.polygon.hierarchy = new Cesium.PolygonHierarchy([
        Cesium.Cartesian3.fromDegrees(west, south, height),
        Cesium.Cartesian3.fromDegrees(east, south, height),
        Cesium.Cartesian3.fromDegrees(east, north, height),
        Cesium.Cartesian3.fromDegrees(west, north, height),
      ]);
    }
    entity.polygon.material =
      entity === state.selectedEntity
        ? Cesium.Color.fromCssColorString("#f8f6a8").withAlpha(0.98)
        : colorForValue(value, state.opacity);
  });
  state.enrollmentEntities.forEach((entity) => {
    entity.show = state.enrollmentVisible;
  });
  state.schoolEntities.forEach((entity) => {
    entity.show = state.enrollmentVisible;
  });
  state.renabapEntities.forEach((entity) => {
    entity.show = state.renabapVisible && state.mode === "surface";
  });
  state.politicalEntities.forEach((entity) => {
    if (entity.label) entity.show = state.labelsVisible;
  });
}

function selectEntity(entity) {
  state.selectedEntity = entity || null;
  refreshAllStyles();
  updateDetail(entity);
}

function setHover(entity, movement) {
  const tip = document.getElementById("hoverTip");
  if (!entity || entity === state.selectedEntity) {
    state.hoverEntity = null;
    tip.hidden = true;
    return;
  }
  state.hoverEntity = entity;
  if (entity.properties.enrollment?.getValue?.() === true) {
    tip.innerHTML = `<strong>Matrícula</strong><br>${entity.properties.turn?.getValue() || ""} ${entity.properties.course?.getValue() || ""}`;
    tip.style.left = `${movement.endPosition.x + 14}px`;
    tip.style.top = `${movement.endPosition.y + 14}px`;
    tip.hidden = false;
    return;
  }
  if (entity.properties.schoolMarker?.getValue?.() === true) {
    const schoolName = entity.properties.schoolName?.getValue() || "Escuela";
    tip.innerHTML = `<strong>${schoolName}</strong><br>${Number(entity.properties.pct_nbi_roof?.getValue() || 0).toFixed(1)}% NBI`;
    tip.style.left = `${movement.endPosition.x + 14}px`;
    tip.style.top = `${movement.endPosition.y + 14}px`;
    tip.hidden = false;
    return;
  }
  if (entity.properties.renabap?.getValue?.() === true) {
    tip.innerHTML = `<strong>${entity.properties.nombre_bar?.getValue() || "RENABAP"}</strong><br>${entity.properties.clasificac?.getValue() || "Villa/asentamiento"}`;
    tip.style.left = `${movement.endPosition.x + 14}px`;
    tip.style.top = `${movement.endPosition.y + 14}px`;
    tip.hidden = false;
    return;
  }
  const nbi = Number(entity.properties.pct_nbi?.getValue() || 0).toFixed(2);
  const label = entity.properties.classLabel?.getValue();
  tip.innerHTML = `<strong>${nbi}% NBI</strong><br>${label}`;
  tip.style.left = `${movement.endPosition.x + 14}px`;
  tip.style.top = `${movement.endPosition.y + 14}px`;
  tip.hidden = false;
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

function setupKeyboardNavigation() {
  const controlledKeys = new Set(["w", "a", "s", "d", "q", "e", "z", "c"]);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!controlledKeys.has(key) || isTypingTarget(event.target)) return;
    state.keys.add(key);
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    state.keys.delete(event.key.toLowerCase());
  });
  window.addEventListener("blur", () => {
    state.keys.clear();
  });

  let lastTick = performance.now();
  viewer.clock.onTick.addEventListener(() => {
    if (!state.keys.size || state.introRunning) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTick) / 1000 || 1 / 60);
    lastTick = now;
    const height = Math.max(1200, viewer.camera.positionCartographic.height);
    const move = Math.max(35, height * 0.018) * (dt * 60);
    const zoom = Math.max(60, height * 0.028) * (dt * 60);
    const turn = Cesium.Math.toRadians(1.25) * (dt * 60);

    if (state.keys.has("w")) viewer.camera.moveForward(move);
    if (state.keys.has("s")) viewer.camera.moveBackward(move);
    if (state.keys.has("a")) viewer.camera.moveLeft(move);
    if (state.keys.has("d")) viewer.camera.moveRight(move);
    if (state.keys.has("z")) viewer.camera.moveForward(zoom);
    if (state.keys.has("c")) viewer.camera.moveBackward(zoom);
    if (state.keys.has("q")) viewer.camera.lookLeft(turn);
    if (state.keys.has("e")) viewer.camera.lookRight(turn);
  });
}

function mapOrbitTarget() {
  return Cesium.Cartesian3.fromDegrees(-58.558, -34.575, 350);
}

function setupMouseOrbit() {
  viewer.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  handler.setInputAction((movement) => {
    state.mouseOrbiting = true;
    state.mouseOrbitStart = Cesium.Cartesian2.clone(movement.position);
    state.orbitHeading = viewer.camera.heading;
    state.orbitPitch = viewer.camera.pitch;
    state.orbitRange = Math.max(1800, Cesium.Cartesian3.distance(viewer.camera.positionWC, mapOrbitTarget()));
  }, Cesium.ScreenSpaceEventType.RIGHT_DOWN);

  handler.setInputAction(() => {
    state.mouseOrbiting = false;
    state.mouseOrbitStart = null;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }, Cesium.ScreenSpaceEventType.RIGHT_UP);
}

function handleMouseOrbitMove(movement) {
  if (!state.mouseOrbiting || !state.mouseOrbitStart || state.introRunning) return false;
  const dx = movement.endPosition.x - state.mouseOrbitStart.x;
  const dy = movement.endPosition.y - state.mouseOrbitStart.y;
  state.mouseOrbitStart = Cesium.Cartesian2.clone(movement.endPosition);
  state.orbitHeading -= dx * 0.006;
  state.orbitPitch = Cesium.Math.clamp(state.orbitPitch + dy * 0.0035, Cesium.Math.toRadians(-82), Cesium.Math.toRadians(-12));
  viewer.camera.lookAt(mapOrbitTarget(), new Cesium.HeadingPitchRange(state.orbitHeading, state.orbitPitch, state.orbitRange));
  return true;
}

function setLoadingProgress(percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const percentElement = document.getElementById("loadingPercent");
  const barElement = document.getElementById("loadingBar");
  if (percentElement) percentElement.textContent = `${clamped}%`;
  if (barElement) barElement.style.width = `${clamped}%`;
}

async function loadData() {
  setLoadingProgress(4);
  const response = await fetch("NBI2026.geojson");
  setLoadingProgress(12);
  const geojson = await response.json();
  setLoadingProgress(20);
  configureQuantileClasses(geojson.features);
  state.nbiFeatures = geojson.features;
  state.nbiSamples = geojson.features.map(featureCentroid);
  geojson.features.forEach(addFeature);
  setLoadingProgress(30);
  buildSurface(geojson.features);
  setLoadingProgress(50);
  await loadPoliticalBoundaries();
  setLoadingProgress(56);
  await loadRenabap();
  setLoadingProgress(64);
  await loadEnrollment();
  setLoadingProgress(70);
  await loadGaleanoEnrollment();
  setLoadingProgress(76);
  await loadPizarnikEnrollment();
  setLoadingProgress(82);
  updateEnrollmentDistributions();
  await loadSchool();
  await loadGaleanoSchool();
  await loadPizarnikSchool();
  setLoadingProgress(88);
  updateStats(geojson.features);
  refreshAllStyles();
  setLoadingProgress(94);
  await waitForScenePreload();
  setLoadingProgress(100);
  await wait(180);
  document.getElementById("loading").hidden = true;
  startIntroSequence();
}

document.getElementById("resetView").addEventListener("click", flyOverview);
document.getElementById("tiltView").addEventListener("click", flyTilt);

document.getElementById("heightScale").addEventListener("input", (event) => {
  state.heightScale = Number(event.target.value);
  refreshAllStyles();
});

document.getElementById("opacityScale").addEventListener("input", (event) => {
  state.opacity = Number(event.target.value);
  refreshAllStyles();
});

function setMode(mode) {
  state.mode = mode;
  document.getElementById("surfaceMode").setAttribute("aria-pressed", String(mode === "surface"));
  document.getElementById("radioMode").setAttribute("aria-pressed", String(mode === "radios"));
  refreshAllStyles();
}

document.getElementById("surfaceMode").addEventListener("click", () => setMode("surface"));
document.getElementById("radioMode").addEventListener("click", () => setMode("radios"));

document.getElementById("enrollmentMode").addEventListener("click", (event) => {
  state.enrollmentVisible = !state.enrollmentVisible;
  event.currentTarget.setAttribute("aria-pressed", String(state.enrollmentVisible));
  refreshAllStyles();
});

document.getElementById("labelsMode").addEventListener("click", (event) => {
  state.labelsVisible = !state.labelsVisible;
  event.currentTarget.setAttribute("aria-pressed", String(state.labelsVisible));
  refreshAllStyles();
});

document.getElementById("renabapMode").addEventListener("click", (event) => {
  state.renabapVisible = !state.renabapVisible;
  event.currentTarget.setAttribute("aria-pressed", String(state.renabapVisible));
  refreshAllStyles();
});

document.getElementById("isochronesLink").addEventListener("click", () => {
  window.location.href = "isocronas_escolares/";
});

setupKeyboardNavigation();

document.querySelectorAll(".legend-row").forEach((button) => {
  button.addEventListener("click", () => {
    const classId = Number(button.dataset.class);
    if (state.activeClasses.has(classId)) {
      state.activeClasses.delete(classId);
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    } else {
      state.activeClasses.add(classId);
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
    }
    refreshAllStyles();
  });
});

const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
setupMouseOrbit();

handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);
  const entity =
    Cesium.defined(picked) &&
    (picked.id?.properties?.pct_nbi ||
      picked.id?.properties?.enrollment ||
      picked.id?.properties?.schoolMarker ||
      picked.id?.properties?.renabap)
      ? picked.id
      : null;
  selectEntity(entity);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

handler.setInputAction((movement) => {
  if (handleMouseOrbitMove(movement)) return;
  const picked = viewer.scene.pick(movement.endPosition);
  const entity =
    Cesium.defined(picked) &&
    (picked.id?.properties?.pct_nbi ||
      picked.id?.properties?.enrollment ||
      picked.id?.properties?.schoolMarker ||
      picked.id?.properties?.renabap)
      ? picked.id
      : null;
  setHover(entity, movement);
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

loadData().catch((error) => {
  console.error(error);
  document.getElementById("loading").textContent = "No se pudo cargar la capa 3D";
});
