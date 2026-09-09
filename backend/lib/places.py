"""Curated Kolkata place index + distance helpers.

NOTE: there is no geocoding/routing provider wired up. Place search runs against this
in-repo list, and road distance is a straight-line haversine inflated by ROAD_FACTOR.
Swapping in Nominatim/OSRM (or Google/Mapbox) means replacing only this module.
"""

from math import asin, cos, radians, sin, sqrt

ROAD_FACTOR = 1.35  # Kolkata road distance vs straight line, empirically ~1.3-1.4

AVG_SPEED_KMPH = {
    "bike": 22.0, "auto": 17.0, "cab": 18.0, "sedan": 19.0,
    "xl": 17.0, "rentals": 19.0, "outstation": 40.0, "parcel": 21.0,
}

# name, area, lat, lng
PLACES: list[tuple[str, str, float, float]] = [
    ("Park Street", "Central Kolkata", 22.5535, 88.3520),
    ("Esplanade", "Central Kolkata", 22.5645, 88.3510),
    ("Howrah Station", "Howrah", 22.5839, 88.3425),
    ("Sealdah Station", "Central Kolkata", 22.5675, 88.3703),
    ("Netaji Subhas Chandra Bose Airport", "Dum Dum", 22.6547, 88.4467),
    ("Salt Lake Sector V", "Bidhannagar", 22.5697, 88.4336),
    ("Salt Lake Sector III", "Bidhannagar", 22.5810, 88.4130),
    ("New Town Action Area I", "New Town", 22.5800, 88.4650),
    ("Eco Park", "New Town", 22.6003, 88.4620),
    ("Ballygunge", "South Kolkata", 22.5290, 88.3654),
    ("Jadavpur", "South Kolkata", 22.4990, 88.3712),
    ("Gariahat", "South Kolkata", 22.5186, 88.3665),
    ("Tollygunge", "South Kolkata", 22.4986, 88.3464),
    ("Behala Chowrasta", "South Kolkata", 22.4989, 88.3120),
    ("Garia", "South Kolkata", 22.4620, 88.3900),
    ("Kalighat Temple", "South Kolkata", 22.5183, 88.3426),
    ("Victoria Memorial", "Central Kolkata", 22.5448, 88.3426),
    ("Indian Museum", "Central Kolkata", 22.5580, 88.3510),
    ("Science City", "East Kolkata", 22.5400, 88.3960),
    ("Ruby General Hospital", "East Kolkata", 22.5140, 88.4010),
    ("Quest Mall", "Central Kolkata", 22.5390, 88.3660),
    ("South City Mall", "South Kolkata", 22.5010, 88.3620),
    ("Acropolis Mall", "East Kolkata", 22.5150, 88.3990),
    ("City Centre Salt Lake", "Bidhannagar", 22.5820, 88.4090),
    ("Dum Dum Metro", "North Kolkata", 22.6200, 88.4210),
    ("Shyambazar", "North Kolkata", 22.5980, 88.3740),
    ("Bagbazar", "North Kolkata", 22.6010, 88.3630),
    ("Belur Math", "Howrah", 22.6320, 88.3550),
    ("Dakshineswar Temple", "North Kolkata", 22.6550, 88.3570),
    ("Barasat", "North 24 Parganas", 22.7250, 88.4800),
    ("Barrackpore", "North 24 Parganas", 22.7640, 88.3670),
    ("Rajarhat", "New Town", 22.6180, 88.4530),
    ("Kasba", "South Kolkata", 22.5150, 88.3860),
    ("Maniktala", "North Kolkata", 22.5860, 88.3800),
    ("Ultadanga", "North Kolkata", 22.5950, 88.3980),
    ("Chandni Chowk", "Central Kolkata", 22.5680, 88.3560),
    ("Bowbazar", "Central Kolkata", 22.5690, 88.3620),
    ("Alipore Zoo", "South Kolkata", 22.5370, 88.3320),
    ("Princep Ghat", "Central Kolkata", 22.5570, 88.3320),
    ("Nicco Park", "Bidhannagar", 22.5730, 88.4060),
    ("Techno India Salt Lake", "Bidhannagar", 22.5760, 88.4280),
    ("Webel More", "Salt Lake", 22.5720, 88.4300),
    ("Garden Reach", "South West Kolkata", 22.5230, 88.2880),
    ("Shibpur", "Howrah", 22.5620, 88.3160),
    ("Santragachi", "Howrah", 22.5900, 88.2830),
]


def search_places(query: str, limit: int = 8) -> list[dict]:
    q = (query or "").strip().lower()
    rows = PLACES if not q else [
        p for p in PLACES if q in p[0].lower() or q in p[1].lower()
    ]
    # Prefix matches first, then substring — cheap relevance ordering.
    if q:
        rows = sorted(rows, key=lambda p: (not p[0].lower().startswith(q), p[0]))
    return [
        {"name": n, "area": a, "lat": lat, "lng": lng, "label": f"{n}, {a}"}
        for n, a, lat, lng in rows[:limit]
    ]


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * r * asin(sqrt(a))


def road_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return round(haversine_km(lat1, lng1, lat2, lng2) * ROAD_FACTOR, 2)


def duration_min(distance_km: float, category: str) -> int:
    speed = AVG_SPEED_KMPH.get(category, 18.0)
    return max(2, round(distance_km / speed * 60))
