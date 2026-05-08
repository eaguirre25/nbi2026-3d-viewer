import json
import math
import os
import sys
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCHOOLS = DATA / "escuelas.geojson"
OUTPUT = DATA / "isochrones.geojson"
MINUTES = [5, 10, 15, 20]


def seed_for(text):
    value = 2166136261
    for char in text:
        value ^= ord(char)
        value = (value * 16777619) & 0xFFFFFFFF
    return abs(value)


def radius_factor(angle, seed, minutes):
    f1 = math.sin(angle * 3 + seed * 0.013) * 0.12
    f2 = math.cos(angle * 5 + seed * 0.021) * 0.09
    f3 = math.sin(angle * 9 + minutes * 0.37 + seed * 0.005) * 0.045
    corridor = max(0, math.cos(angle - (seed % 628) / 100)) * 0.14
    return max(0.62, min(1.22, 1 + f1 + f2 + f3 + corridor))


def approximate_polygon(lon, lat, radius_m, seed, minutes, steps=120):
    radius_earth = 6_371_008.8
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    d = radius_m / radius_earth
    coords = []
    for i in range(steps + 1):
        bearing = 2 * math.pi * i / steps
        local_radius = radius_m * radius_factor(bearing, seed, minutes)
        d = local_radius / radius_earth
        lat2 = math.asin(
            math.sin(lat1) * math.cos(d)
            + math.cos(lat1) * math.sin(d) * math.cos(bearing)
        )
        lon2 = lon1 + math.atan2(
            math.sin(bearing) * math.sin(d) * math.cos(lat1),
            math.cos(d) - math.sin(lat1) * math.sin(lat2),
        )
        coords.append([math.degrees(lon2), math.degrees(lat2)])
    return coords


def load_schools():
    with SCHOOLS.open("r", encoding="utf-8") as f:
        geojson = json.load(f)
    return geojson.get("features", [])


def fallback_isochrones(schools):
    features = []
    for school in schools:
        lon, lat = school["geometry"]["coordinates"]
        props = school.get("properties", {})
        for minutes in MINUTES:
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "school_id": props.get("school_id"),
                        "school_name": props.get("school_name"),
                        "minutes": minutes,
                        "profile": "foot-walking",
                        "source": "aproximacion_morfologica_exploratoria",
                        "note": "Polígono exploratorio irregular por distancia caminable estimada; reemplazar por isócrona de red vial.",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            approximate_polygon(
                                lon,
                                lat,
                                minutes * 80,
                                seed_for(str(props.get("school_id"))),
                                minutes,
                            )
                        ],
                    },
                }
            )
    return {"type": "FeatureCollection", "features": features}


def request_ors_isochrones(api_key, school):
    lon, lat = school["geometry"]["coordinates"]
    props = school.get("properties", {})
    url = "https://api.openrouteservice.org/v2/isochrones/foot-walking"
    payload = {
        "locations": [[lon, lat]],
        "range": [m * 60 for m in MINUTES],
        "range_type": "time",
        "attributes": ["area"],
    }
    response = requests.post(
        url,
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenRouteService error {response.status_code}: {response.text[:500]}")
    geojson = response.json()
    features = []
    for feature in geojson.get("features", []):
        seconds = feature.get("properties", {}).get("value")
        minutes = round(seconds / 60) if seconds else None
        feature["properties"] = {
            **feature.get("properties", {}),
            "school_id": props.get("school_id"),
            "school_name": props.get("school_name"),
            "minutes": minutes,
            "profile": "foot-walking",
            "source": "OpenRouteService",
        }
        features.append(feature)
    return features


def main():
    schools = load_schools()
    api_key = os.getenv("ORS_API_KEY")
    if not api_key:
        print("ORS_API_KEY no está definida. Se generan isócronas aproximadas exploratorias.", file=sys.stderr)
        result = fallback_isochrones(schools)
    else:
        features = []
        for school in schools:
            try:
                features.extend(request_ors_isochrones(api_key, school))
            except Exception as exc:
                raise RuntimeError(f"Falló la consulta ORS para {school.get('properties', {}).get('school_name')}: {exc}") from exc
        result = {"type": "FeatureCollection", "features": features}

    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"Guardado: {OUTPUT} ({len(result['features'])} polígonos)")


if __name__ == "__main__":
    main()
