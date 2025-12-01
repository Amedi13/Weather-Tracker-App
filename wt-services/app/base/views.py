import logging
from datetime import datetime, timedelta
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import HttpResponse
from django.conf import settings
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.utils import timezone
import math
from django.http import JsonResponse

# views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
import logging
from datetime import datetime
import math
import requests
import geocoder
from rest_framework.decorators import api_view
from rest_framework.response import Response

#Map Purposes
import folium
from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_exempt
import geocoder
from folium.plugins import HeatMap
import numpy as np

# Configure logger
log = logging.getLogger(__name__)
NOAA_TIMEOUT_SECS = 20
NOAA_MAX_RETRIES = 3
NOAA_BACKOFF = 0.6

_session = None


# Gets the coordinates of the current user using there IP address
def get_coordinates():
    current_location = geocoder.ip("me")

    if current_location and current_location.latlng:
        latitude, longitude = current_location.latlng
    
    return latitude, longitude

OWM_TIMEOUT_SECS = 20
OWM_MAX_RETRIES  = 3
OWM_BACKOFF      = 0.6
_OWM_SESSION     = None

# Session cache
_OWM_SESSION = None

def get_owm_session():
    global _OWM_SESSION
    if _OWM_SESSION is None:
        s = requests.Session()
        retry = Retry(
            total=OWM_MAX_RETRIES,
            read=OWM_MAX_RETRIES,
            connect=OWM_MAX_RETRIES,
            backoff_factor=OWM_BACKOFF,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            raise_on_status=False,
        )
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.mount("http://",  HTTPAdapter(max_retries=retry))
        _OWM_SESSION = s
    return _OWM_SESSION

def _owm_request(path, params=None):
    """
    Generic OWM request helper. Adds ?appid= automatically.
    path: e.g., '/data/2.5/weather' or '/data/2.5/forecast'
    """
    base = getattr(settings, "OWM_BASE_URL", "https://api.openweathermap.org").rstrip("/")
    key  = getattr(settings, "OWM_API_KEY", None)
    if not key:
        class FakeResp:
            status_code = 401
            text = "Missing OWM_API_KEY"
            def json(self): return {"cod":401, "message":"Missing OWM_API_KEY"}
            @property
            def ok(self): return False
        return FakeResp()

    url = f"{base}/{path.lstrip('/')}"
    q   = dict(params or {})
    q["appid"] = key

    try:
        r = get_owm_session().get(url, params=q, timeout=OWM_TIMEOUT_SECS)
        # DEBUG: uncomment to verify the final URL during troubleshooting
        # print("OWM URL:", r.url, "status:", r.status_code)
        return r
    except requests.Timeout:
        class FakeResp:
            status_code = 504
            text = "OWM request timed out"
            def json(self): return {"cod":504, "message": self.text}
            @property
            def ok(self): return False
        return FakeResp()
    except requests.RequestException as e:
        class FakeResp:
            status_code = 502
            text = f"OWM request failed: {e}"
            def json(self): return {"cod":502, "message": self.text}
            @property
            def ok(self): return False
        return FakeResp()

# -----------------------------
# Small math helpers
# -----------------------------
def _ewma(arr, alpha=0.35):
    s = arr[0]
    out = []
    for i, x in enumerate(arr):
        s = x if i == 0 else alpha * x + (1 - alpha) * s
        out.append(s)
    return out

def _avg(a): return sum(a)/len(a) if a else 0.0
def _std(a):
    if not a: return 0.0
    m = _avg(a)
    return math.sqrt(sum((x - m)**2 for x in a)/len(a))
def _clamp(x, lo, hi): return max(lo, min(hi, x))

# -----------------------------
# Simple current-weather endpoint
# -----------------------------
@api_view(["GET"])
def weather_data(request):
    try:
        # Dynamic location based on IP
        curr_loc = geocoder.ip("me")
        if not curr_loc or not curr_loc.latlng:
            raise ValueError("Could not geolocate client IP.")
        lat, lon = map(float, curr_loc.latlng)
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required or could not be determined"}, status=400)

    units = (request.GET.get("units") or "metric").strip()
    resp = _owm_request("/data/2.5/weather", params={"lat": lat, "lon": lon, "units": units})
    if not getattr(resp, "ok", False):
        try:
            return Response(resp.json(), status=resp.status_code)
        except Exception:
            return Response({"error":"owm_error","text": str(getattr(resp, "text", ""))[:500]}, status=getattr(resp, "status_code", 502))
    return Response(resp.json(), status=200)

# Backward-compatible alias
@api_view(['GET'])
def getData(request):
    try:
        curr_loc = geocoder.ip("me")
        if not curr_loc or not curr_loc.latlng:
            raise ValueError("Could not geolocate client IP.")
        lat, lon = map(float, curr_loc.latlng)
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required or could not be determined"}, status=400)

    units = request.GET.get("units", "metric")
    resp = _owm_request("/data/2.5/weather", params={"lat": lat, "lon": lon, "units": units})
    if not getattr(resp, "ok", False):
        try:
            return Response(resp.json(), status=resp.status_code)
        except Exception:
            return Response({"error":"owm_error","text": str(getattr(resp, "text", ""))[:500]}, status=getattr(resp, "status_code", 502))
    return Response(resp.json(), status=200)


def _nws_points(lat, lon):
    url = f"https://api.weather.gov/points/{lat},{lon}"
    HDRS = {"User-Agent": "WeatherTracker/1.0 (student project) blank@example.com"}
    return requests.get(url, headers=HDRS, timeout=10).json()

def _nws_forecast(lat, lon, days=7):
    HDRS = {"User-Agent": "WeatherTracker/1.0 (student project) blank@example.com"}
    meta = _nws_points(lat, lon)
    grid_url = meta["properties"]["forecast"]
    r = requests.get(grid_url, headers=HDRS, timeout=10).json()

    daily = {}
    for day in r.get("properties", {}).get("periods", []):
        d = (day.get("startTime") or "")[:10]
        if not d:
            continue
        rec = daily.setdefault(d, {"tMax": None, "tMin": None, "pop": 0})

        temp = day.get("temperature")
        if temp is not None:
            rec["tMax"] = temp if rec["tMax"] is None else max(rec["tMax"], temp)
            rec["tMin"] = temp if rec["tMin"] is None else min(rec["tMin"], temp)

        pop_obj = day.get("probabilityOfPrecipitation") or {}
        pop_val = pop_obj.get("value")
        if pop_val is not None:
            rec["pop"] = max(rec["pop"], pop_val)

    out = []
    for d in sorted(daily.keys())[:days]:
        v = daily[d]
        # fallback if one of the temps is missing
        tmax = v["tMax"] if v["tMax"] is not None else (v["tMin"] if v["tMin"] is not None else 0)
        tmin = v["tMin"] if v["tMin"] is not None else (v["tMax"] if v["tMax"] is not None else 0)
        out.append({
            "date": d,
            "tMax": tmax,
            "tMin": tmin,
            "pop": (v["pop"] or 0) / 100.0
        })
    return out

def heat_index_f(t_f, rh):
    # Rothfusz regression 
    if t_f is None or rh is None: return None
    T, R = t_f, rh
    return (-42.379 + 2.04901523*T + 10.14333127*R
            - 0.22475541*T*R - 0.00683783*T*T - 0.05481717*R*R
            + 0.00122874*T*T*R + 0.00085282*T*R*R - 0.00000199*T*T*R*R)

def wind_chill_f(t_f, wind_mph):
    if t_f is None or wind_mph is None: return None
    if t_f > 50 or wind_mph < 3: return None
    v = wind_mph
    return 35.74 + 0.6215*t_f - 35.75*(v**0.16) + 0.4275*t_f*(v**0.16)

    

@api_view(["GET"])
def trends(request):
    try:
        lat = float(request.GET.get("lat"))
        lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required"}, status=400)

    days  = int(request.GET.get("days", 7))
    units = (request.GET.get("units") or "metric").strip()
    is_metric = (units == "metric")

    # Use free-tier 3-hour forecast (about 5 days horizon)
    resp = _owm_request("/data/2.5/forecast", params={
        "lat": lat, "lon": lon, "units": units
    })
    if not getattr(resp, "ok", False):
        try:
            return Response(resp.json(), status=resp.status_code)
        except Exception:
            return Response(
                {"error": "owm_error", "text": str(getattr(resp, "text", ""))[:500]},
                status=getattr(resp, "status_code", 502),
            )

    data = resp.json()
    slices = data.get("list") or []
    if not slices:
        return Response({"error": "No forecast data"}, status=502)

    # Group by UTC date (YYYY-MM-DD) using dt_txt (e.g., "2025-12-01 03:00:00")
    # Also collect humidity (%) and wind_speed (m/s) to compute daily risk.
    # We'll use max temp + RH for heat index, and min temp + wind for wind chill.
    agg = {}
    for item in slices:
        dt_txt = item.get("dt_txt") or ""
        if len(dt_txt) >= 10:
            d = dt_txt[:10]
        else:
            ts = item.get("dt")
            if ts is None:
                continue
            d = datetime.utcfromtimestamp(ts).date().isoformat()

        bucket = agg.setdefault(d, {
            "tMax": None, "tMin": None, "pop": 0.0,
            "temps": [], "rhs": [], "winds_ms": []
        })

        main = item.get("main") or {}
        wind = item.get("wind") or {}

        t = main.get("temp")
        rh = main.get("humidity")      # %
        w = wind.get("speed")          # m/s in OWM for metric/imperial units

        if t is not None:
            bucket["tMax"] = t if bucket["tMax"] is None else max(bucket["tMax"], t)
            bucket["tMin"] = t if bucket["tMin"] is None else min(bucket["tMin"], t)
            bucket["temps"].append(t)

        if isinstance(rh, (int, float)):
            bucket["rhs"].append(float(rh))

        if isinstance(w, (int, float)):
            bucket["winds_ms"].append(float(w))

        pop = item.get("pop")
        if pop is not None:
            bucket["pop"] = max(bucket["pop"], float(pop))  # 0..1

    ordered_days = sorted(agg.keys())[:days]
    if not ordered_days:
        return Response({"error": "No daily aggregation available"}, status=502)

    official = []
    for d in ordered_days:
        v = agg[d]
        tmax = v["tMax"] if v["tMax"] is not None else (v["tMin"] if v["tMin"] is not None else 0.0)
        tmin = v["tMin"] if v["tMin"] is not None else (v["tMax"] if v["tMax"] is not None else 0.0)
        pop  = _clamp(v.get("pop", 0.0), 0.0, 1.0)
        official.append({"date": d, "tMax": tmax, "tMin": tmin, "pop": pop})

    # EWMA smoothing of official
    tmax_series = [x["tMax"] for x in official if x["tMax"] is not None]
    tmin_series = [x["tMin"] for x in official if x["tMin"] is not None]
    pop_series  = [x["pop"]  for x in official]

    if not (tmax_series and tmin_series and pop_series):
        return Response({"error": "Insufficient forecast for trends"}, status=422)

    tmax_tr = _ewma(tmax_series)
    tmin_tr = _ewma(tmin_series)
    pop_tr  = _ewma(pop_series)

    predicted = []
    for i, base in enumerate(official):
        predicted.append({
            "date": base["date"],
            "tMax": round(tmax_tr[i], 1),
            "tMin": round(tmin_tr[i], 1),
            "pop":  _clamp(pop_tr[i], 0.0, 1.0),
        })

    # Confidence proxy (variation over last N)
    lastN = min(7, len(official))
    def conf(metric):
        series = [d[metric] for d in official if d[metric] is not None]
        if len(series) < lastN:
            return 0.5
        noise  = _std(series[-lastN:])
        signal = abs(series[-1] - series[0])
        return _clamp(1 - noise / (noise + signal + 1e-6), 0.1, 0.95)

    c = {"tMax": conf("tMax"), "tMin": conf("tMin"), "pop": conf("pop")}
    c["overall"] = round((c["tMax"] + c["tMin"] + c["pop"]) / 3, 2)

    def trend_word(delta, up="increasing", down="decreasing", flat="steady"):
        return up if delta > 1 else down if delta < -1 else flat

    t_delta = predicted[-1]["tMax"] - predicted[0]["tMax"]
    r_delta = predicted[-1]["pop"]  - predicted[0]["pop"]
    summary = (
        f"Next days: {trend_word(t_delta, 'warming','cooling','steady')} temps and "
        f"{trend_word(r_delta, 'higher','lower','steady')} rain chance."
    )

    daily_enriched = []
    for d in ordered_days:
        v = agg[d]
        tmax = v["tMax"]
        tmin = v["tMin"]

        # Choose representative RH and wind
        rh_for_hi = max(v["rhs"]) if v["rhs"] else (sum(v["rhs"])/len(v["rhs"]) if v["rhs"] else None)
        wind_ms_max = max(v["winds_ms"]) if v["winds_ms"] else None

        # Convert for formulas 
        t_f_for_hi = (tmax * 9/5 + 32) if (tmax is not None and is_metric) else tmax
        t_f_for_wc = (tmin * 9/5 + 32) if (tmin is not None and is_metric) else tmin
        wind_mph   = (wind_ms_max * 2.23694) if wind_ms_max is not None else None

        hi_f = heat_index_f(t_f_for_hi, rh_for_hi) if (t_f_for_hi is not None and rh_for_hi is not None) else None
        wc_f = wind_chill_f(t_f_for_wc, wind_mph)   if (t_f_for_wc is not None and wind_mph is not None)   else None

        # Return risk values in the same unit system the client requested
        def back_to_units(x):
            if x is None: return None
            return (x - 32) * 5/9 if is_metric else x

        daily_enriched.append({
            "date": d,
            "tMax": tmax,
            "tMin": tmin,
            "pop": _clamp(v.get("pop", 0.0), 0.0, 1.0),
            "risk": {
                "heatIndex": round(back_to_units(hi_f), 1) if hi_f is not None else None,
                "windChill": round(back_to_units(wc_f), 1) if wc_f is not None else None,
            }
        })

    return Response({
        "location": {"lat": lat, "lon": lon},
        "units": units,
        "days": days,
        "officialForecast": official,
        "predicted": predicted,
        "confidence": c,
        "summary": summary,
        "daily": daily_enriched,   # <-- use this in your UI for risk chips
    }, status=200)

@api_view(['GET'])
def get_locations(request):
    """
    City search using OpenWeather Geocoding API.
    Query: q (or query), limit (default 10)
    Returns a lightweight list with id-ish slug, name, state, country, lat, lon.
    """
    q = (request.GET.get("q") or request.GET.get("query") or "").strip()
    if not q:
        return JsonResponse({"results": []}, status=200, safe=False)

    limit = int(request.GET.get("limit") or 10)
    resp = _owm_request("/geo/1.0/direct", params={"q": q, "limit": min(limit, 25)})
    if not resp.ok:
        try:
            return JsonResponse({"error":"owm_error","detail": resp.json()}, status=resp.status_code, safe=False)
        except Exception:
            return JsonResponse({"error":"owm_error","text": resp.text[:500]}, status=resp.status_code, safe=False)

    items = resp.json() or []
    trimmed = []
    for it in items:
        name    = it.get("name")
        state   = it.get("state")
        country = it.get("country")
        lat     = it.get("lat")
        lon     = it.get("lon")
        _id     = f"{name},{state or ''},{country or ''}".strip(", ")
        trimmed.append({
            "id": _id,
            "name": name,
            "state": state,
            "country": country,
            "lat": lat,
            "lon": lon
        })
    return JsonResponse({"results": trimmed[:25]}, status=200, safe=False)

def _get_lat_lon_from_request(request):
    """lat/lon from query or IP; returns (lat, lon) floats or raises ValueError."""
    qlat = request.GET.get("lat")
    qlon = request.GET.get("lon")
    if qlat and qlon:
        return float(qlat), float(qlon)
    # fallback: IP geolocation
    curr_loc = geocoder.ip("me")
    if not curr_loc or not curr_loc.latlng:
        raise ValueError("Could not determine location")
    return map(float, curr_loc.latlng)


@api_view(["GET"])
def daily_forecast(request):
    try:
        lat, lon = _get_lat_lon_from_request(request)
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required or could not be determined"}, status=400)

    days  = int(request.GET.get("days", 5))
    units = (request.GET.get("units") or "metric").strip()

    # Pull 5-day/3-hour slices
    resp = _owm_request("/data/2.5/forecast", params={"lat": lat, "lon": lon, "units": units})
    if not getattr(resp, "ok", False):
        try:
            return Response(resp.json(), status=resp.status_code)
        except Exception:
            return Response({"error": "owm_error", "text": str(getattr(resp, "text", ""))[:500]}, status=getattr(resp, "status_code", 502))

    data = resp.json()
    slices = data.get("list") or []
    if not slices:
        return Response({"error": "No forecast data"}, status=502)

    # Aggregate to daily tMax / tMin / PoP
    daily = {}
    for item in slices:
        # date key
        dt_txt = item.get("dt_txt") or ""
        if len(dt_txt) >= 10:
            dkey = dt_txt[:10]  # YYYY-MM-DD (UTC)
        else:
            ts = item.get("dt")
            if ts is None:
                continue
            dkey = datetime.utcfromtimestamp(ts).date().isoformat()

        rec = daily.setdefault(dkey, {"tMax": None, "tMin": None, "pop": 0.0})

        m = item.get("main") or {}
        t = m.get("temp")
        if t is not None:
            rec["tMax"] = t if rec["tMax"] is None else max(rec["tMax"], t)
            rec["tMin"] = t if rec["tMin"] is None else min(rec["tMin"], t)

        pop = item.get("pop")
        if pop is not None:
            rec["pop"] = max(rec["pop"], float(pop))  # keep max 0..1

    # Normalize and trim to requested days
    out = []
    for d in sorted(daily.keys())[:days]:
        v = daily[d]
        tmax = v["tMax"] if v["tMax"] is not None else (v["tMin"] if v["tMin"] is not None else 0.0)
        tmin = v["tMin"] if v["tMin"] is not None else (v["tMax"] if v["tMax"] is not None else 0.0)
        out.append({"date": d, "tMax": round(tmax, 1), "tMin": round(tmin, 1), "pop": _clamp(v.get("pop", 0.0), 0.0, 1.0)})

    return Response({
        "location": {"lat": float(lat), "lon": float(lon)},
        "units": units,
        "days": len(out),
        "daily": out
    }, status=200)


@api_view(["GET"])
def nws(request):
    try:
        lat, lon = _get_lat_lon_from_request(request)
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required or could not be determined"}, status=400)

    days = int(request.GET.get("days", 7))
    try:
        out = _nws_forecast(lat, lon, days=days)  # returns list[{date,tMax,tMin,pop}]
    except Exception as e:
        return Response({"error": "nws_error", "message": str(e)[:200]}, status=502)

    return Response({
        "location": {"lat": float(lat), "lon": float(lon)},
        "days": len(out),
        "daily": out
    }, status=200)

@api_view(["GET"]) 
@xframe_options_exempt
def get_map_html(request):#no need for request for now
    latitude, longitude = get_coordinates()
    
    #heat map data points
    heat_data = np.random.normal(size=(100, 2), loc=[latitude, longitude], scale=0.1).tolist()
    
    m = folium.Map(location=[latitude, longitude], zoom_start=10)
    folium.Marker(
        location=[latitude, longitude],
        tooltip="Your Area",
        popup="Mt. Hood Meadows",
        icon=folium.Icon(icon="cloud"),
    ).add_to(m)
    
    HeatMap(heat_data).add_to(m)
    try:
        r = requests.get(
            f"{request.build_absolute_uri('/')}api/alerts?lat={lat}&lon={lon}",
            timeout=8
        )
        if r.ok:
            data = r.json()
            for a in data.get("alerts", []):
                geom = a.get("polygon")
                if not geom: 
                    continue
                folium.GeoJson(
                    data=geom,
                    name=f"{a.get('event')} ({a.get('severity') or 'N/A'})",
                    tooltip=(a.get("headline") or a.get("event") or "Alert")
                ).add_to(m)
    except Exception:
        pass

    folium.LayerControl().add_to(m)
    return HttpResponse(m._repr_html_())

@api_view(["GET"])
def alerts(request):
    import requests
    try:
        lat = float(request.GET.get("lat")); lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return Response({"error": "lat & lon required"}, status=400)

    url = f"https://api.weather.gov/alerts/active?point={lat},{lon}"
    hdrs = {"User-Agent": "WeatherTracker/1.0 (student project) blank@example.com"}
    try:
        r = requests.get(url, headers=hdrs, timeout=10)
        r.raise_for_status()
        feats = (r.json().get("features") or [])
        alerts = [{
            "id": f.get("id"),
            "event": f["properties"].get("event"),
            "severity": f["properties"].get("severity"),
            "headline": f["properties"].get("headline"),
            "effective": f["properties"].get("effective"),
            "ends": f["properties"].get("ends"),
            "area": f["properties"].get("areaDesc"),
            "polygon": f.get("geometry"),  # GeoJSON
        } for f in feats]
        return Response({"count": len(alerts), "alerts": alerts}, status=200)
    except requests.RequestException as e:
        return Response({"error": "nws_error", "message": str(e)}, status=502)

