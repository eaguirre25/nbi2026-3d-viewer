# Isócronas escolares · San Martín

Visor cartográfico web para analizar accesibilidad peatonal, matrícula escolar y desigualdad en el Partido de General San Martín, Buenos Aires.

El mapa cruza:

- ubicación de escuelas secundarias seleccionadas,
- matrícula georreferenciada por escuela,
- límite del Partido de General San Martín,
- radios censales con porcentaje de NBI,
- barrios RENABAP,
- isócronas peatonales de 5, 10, 15 y 20 minutos.
- recorridos de colectivos AMBA, paradas aproximadas, flujos de matrícula hacia escuela y cobertura exploratoria de colectivo de 15, 30, 45 y 60 minutos.

## Cómo abrir localmente

Desde esta carpeta:

```bash
cd "D:\New project\nbi2026-3d-viewer\isocronas_escolares"
python -m http.server 8000
```

Luego abrir:

```text
http://localhost:8000/
```

También se puede abrir desde el botón del visor 3D principal si se sirve `nbi2026-3d-viewer` en `http://127.0.0.1:8765/`.

## Capas

Las capas usadas están en `data/`:

- `escuelas.geojson`: puntos de Walsh, Galeano y Pizarnik.
- `matricula.geojson`: matrícula combinada, conservando `school_id` y `school_name`.
- `limite_partido.geojson`: límite de General San Martín.
- `radios_nbi.geojson`: radios censales con `pct_nbi`.
- `renabap.geojson`: polígonos RENABAP filtrados al área de estudio.
- `isochrones.geojson`: isócronas aproximadas o reales.
- `walk_student_routes.geojson`: muestra precalculada de rutas peatonales por calle desde estudiantes hacia su escuela, usada para animación suave en modo peatonal.
- `colectivos.geojson`: recorridos de colectivos filtrados al entorno de General San Martín.
- `colectivos_flow.geojson`: recorridos con atributos de línea, empresa, sentido y caudal estimado por transacciones.
- `bus_access_lines.geojson`: líneas exploratorias desde estudiantes a la parada aproximada asignada.
- `bus_access_routes.geojson`: recorridos peatonales precalculados por calle desde estudiantes a la parada aproximada asignada.
- `bus_boarding_stops.geojson`: paradas agrupadoras aproximadas, con tamaño proporcional a la matrícula reunida.
- `bus_student_flows.geojson`: flujos desde parada agrupadora hacia escuela siguiendo trazas de colectivo, con grosor proporcional a estudiantes asignados.
- `transacciones_colectivo_san_martin.geojson`: puntos de transacciones por línea/franja horaria filtrados al entorno de San Martín.
- `isochrones_bus.geojson`: accesibilidad exploratoria en colectivo.

## Colectivos

La capa `colectivos_flow.geojson` deriva de recorridos públicos de colectivos AMBA y cruza cada línea con las transacciones SUBE disponibles. A partir de esa red se generaron paradas aproximadas y flujos escolares: cada estudiante ubicado a más de 1.200 m de su escuela se asigna a una parada aproximada cercana, siempre que esa línea también pase cerca de la escuela.

En el visor, el modo `Transp. colectivo` se representa como desplazamiento escolar: los puntos parten hacia la parada por recorridos peatonales punteados, los globos de parada crecen según la cantidad de estudiantes reunidos y los flujos crecen según la matrícula que se movería por ese tramo.

La capa de transacciones permite ver intensidad de uso por línea y franja horaria, pero no equivale a paradas ni a horarios.

La cobertura en colectivo incluida es exploratoria. Asume:

- acceso caminando a parada o punto de red de hasta 500 m,
- parada o punto de red próximo a escuela de hasta 500 m,
- distancia mínima de viaje de 1.200 m para considerar que el viaje en colectivo tiene sentido,
- velocidad promedio simplificada sobre red de colectivos.

En la visualización de flujos se amplió el umbral de acceso exploratorio a 750 m para evitar perder demasiados casos por ausencia de paradas oficiales. Los tramos estudiante-parada fueron precalculados con OSRM `foot` sobre red vial. No incorpora espera, frecuencia, combinación entre líneas, sentido real del servicio ni horarios.

Para una isócrona rigurosa de transporte público se recomienda trabajar con GTFS completo y un motor de ruteo multimodal, por ejemplo OpenTripPlanner o r5py. En ese caso se debería reemplazar `data/isochrones_bus.geojson` por polígonos derivados de tiempos reales de viaje.

Nota sobre `lineas_terrestres_070402.zip`: fue convertido a `data/lineas_terrestres_070402.geojson`, pero no se usa como recorridos de colectivo. Sus atributos indican líneas geográficas terrestres, por ejemplo `objeto = Trópico`, y su extensión es mundial. No corresponde metodológicamente a transporte público local.

## Isócronas reales con OpenRouteService

El archivo `scripts/generate_isochrones.py` puede generar isócronas reales por red vial con OpenRouteService.

Instalar dependencias:

```bash
pip install -r requirements.txt
```

Definir la API key sin guardarla en el código:

PowerShell:

```powershell
$env:ORS_API_KEY="TU_API_KEY"
python scripts/generate_isochrones.py
```

CMD:

```cmd
set ORS_API_KEY=TU_API_KEY
python scripts\generate_isochrones.py
```

El script escribe `data/isochrones.geojson` con las propiedades:

- `school_id`
- `school_name`
- `minutes`
- `profile`
- `source`

## Si no hay API key

Si `ORS_API_KEY` no está definida, el script genera polígonos exploratorios irregulares usando una velocidad peatonal simplificada de 80 m/min y pequeñas variaciones morfológicas para evitar una lectura de “círculo perfecto”.

Estas isócronas aproximadas sirven para lectura preliminar, pero no reemplazan una isócrona por red vial. Aunque la forma es irregular, sigue siendo una aproximación geométrica: no considera barreras urbanas, vías férreas, autopistas, discontinuidades de trama, cruces inseguros ni recorridos reales.

## Movilidad peatonal

El modo peatonal incluye una animación suave sobre una muestra de rutas estudiante-escuela. Esas rutas fueron precalculadas con OSRM `foot` sobre red vial y se guardan en `data/walk_student_routes.geojson`. La animación no pretende representar a toda la matrícula en simultáneo, sino sugerir desplazamiento peatonal sin saturar el mapa.

## Panel de lectura

El panel calcula con Turf.js:

- radios censales intersectados por cada banda de tiempo,
- promedio simple de NBI de esos radios,
- matrícula georreferenciada dentro de cada isócrona,
- porcentaje de matrícula cubierta por banda.

La lectura es exploratoria. Si la matrícula estuviera agregada por radio y no como punto, habría que aplicar otro criterio de cobertura, idealmente ponderado por área o por población.

## Actualizar capas

Reemplazar los GeoJSON dentro de `data/` manteniendo nombres y campos principales. Si se agregan nuevas escuelas, actualizar `data/escuelas.geojson`, `data/matricula.geojson` e `data/isochrones.geojson`.

## Limitaciones

- Las isócronas incluidas por defecto son aproximadas, salvo que se regeneren con ORS.
- El promedio de NBI es simple por radio intersectado, no ponderado por población ni superficie.
- La matrícula cubierta se calcula por puntos georreferenciados; depende de la calidad de geocodificación.
- RENABAP funciona como contexto de lectura y no como unidad estadística de cobertura.
