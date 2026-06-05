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
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(-58.548, -34.592, 7800),
  orientation: {
    heading: Cesium.Math.toRadians(326),
    pitch: Cesium.Math.toRadians(-43),
    roll: 0,
  },
});

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
  const cols = 72;
  const rows = 72;
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

  // Group into 3 blocks: low (Q1+Q2), mid (Q3), high (Q4+Q5)
  const pctLow  = ((counts.get(1) || 0) + (counts.get(2) || 0)) / total * 100;
  const pctMid  = ((counts.get(3) || 0)) / total * 100;
  const pctHigh = ((counts.get(4) || 0) + (counts.get(5) || 0)) / total * 100;

  const blocks = [
    { suffix: "low",  pct: pctLow,  label: "NBI bajo (Q1+Q2)" },
    { suffix: "mid",  pct: pctMid,  label: "NBI medio (Q3)" },
    { suffix: "high", pct: pctHigh, label: "NBI alto (Q4+Q5)" },
  ];

  blocks.forEach(({ suffix, pct, label }) => {
    const seg = document.getElementById("seg-" + prefix + "-" + suffix);
    if (!seg) return;
    seg.style.width = pct.toFixed(1) + "%";
    const tip = label + ": " + pct.toFixed(1) + "%";
    seg.title = tip;
    seg.setAttribute("data-tip", tip);
    seg.textContent = pct >= 10 ? pct.toFixed(0) + "%" : "";
  });
}

function updateEnrollmentDistributions() {
  updateSchoolDistribution("Walsh", "walsh");
  updateSchoolDistribution("Galeano", "galeano");
  updateSchoolDistribution("Pizarnik", "pizarnik");
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
      image: "data:image/jpeg;base64,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",
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
      image: "data:image/jpeg;base64,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",
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
      image: "data:image/png;base64,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",
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

  const elFeatures = document.getElementById("totalFeatures");
  const elMaxNbi = document.getElementById("maxNbi");
  const elNbiHomes = document.getElementById("totalNbiHomes");
  const elPopulation = document.getElementById("totalPopulation");
  if (elFeatures) elFeatures.textContent = formatNumber(features.length);
  if (elMaxNbi) elMaxNbi.textContent = `${maxNbi.toFixed(1)}%`;
  if (elNbiHomes) elNbiHomes.textContent = formatNumber(totalNbiHomes);
  if (elPopulation) elPopulation.textContent = formatNumber(totalPopulation);
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
  await loadEnrollment();
  setLoadingProgress(66);
  await loadGaleanoEnrollment();
  setLoadingProgress(74);
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
}


document.getElementById("isochronesLink").addEventListener("click", () => {
  window.location.href = "isocronas_escolares/";
});

document.getElementById("heatmapLink").addEventListener("click", () => {
  window.location.href = "heatmap_matricula/";
});

setupKeyboardNavigation();

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
