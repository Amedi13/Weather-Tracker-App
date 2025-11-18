import logging
from datetime import datetime, timedelta
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import React
from .serializer import ReactSerializer
from django.conf import settings
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.utils import timezone
import math
from django.http import JsonResponse
# Configure logger
log = logging.getLogger(__name__)
NOAA_TIMEOUT_SECS = 20
NOAA_MAX_RETRIES = 3
NOAA_BACKOFF = 0.6

_session = None


#helper function to make requests to NOAA API
def _noaa_session():
    global _session
    if _session is None:
        s = requests.Session()
        retry = Retry(
            total=NOAA_MAX_RETRIES,
            read=NOAA_MAX_RETRIES,
            connect=NOAA_MAX_RETRIES,
            backoff_factor=NOAA_BACKOFF,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            raise_on_status=False,
        )
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.mount("http://", HTTPAdapter(max_retries=retry))
        _session = s
    return _session

def _noaa_request(endpoint, params=None):
    base = (getattr(settings, "NOAA_API_BASE_URL", "https://www.ncdc.noaa.gov/cdo-web/api/v2/") or "").rstrip("/")
    """Helper to call NOAA CDO API."""
    url = f"{base}/{endpoint.lstrip('/')}"
    headers = {"token": settings.NOAA_API_TOKEN}
    try: 
        resp = _noaa_session().get(
            url,
            headers=headers,
            params=params or {},
            timeout=NOAA_TIMEOUT_SECS,
        )
        return resp
    except requests.Timeout:
        class FakeResp:
            status_code = 504
            text = "NOAA request timed out"
            def json(self): return {"error": self.text}
        return FakeResp()
    except requests.RequestException as e:
        class FakeResp:
            status_code = 502
            text = f"NOAA request failed: {e}"
            def json(self): return {"error": self.text}
        return FakeResp()
        
#helper function to make requests to NWS API
def _nws_points(lat, lon):
    url = f"https://api.weather.gov/points/{lat},{lon}"
    HDRS = {"User-Agent": "WeatherTracker/1.0 (student project) blank@example.com"}
    return requests.get(url, headers=HDRS,timeout=10).json()

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
        #fallback if one of the temps is missing
        tmax = v["tMax"] if v["tMax"] is not None else (v["tMin"] if v["tMin"] is not None else 0)
        tmin = v["tMin"] if v["tMin"] is not None else (v["tMax"] if v["tMax"] is not None else 0)
        out.append({
            "date": d,
            "tMax": tmax,
            "tMin": tmin,
            "pop": (v["pop"] or 0) / 100.0
        })
    return out
    
def _ewma(arr, alpha=0.35):
    s = arr[0]
    out = []
    for i, x in enumerate(arr):
        s = x if i == 0 else alpha * x + (1 - alpha) * s
        out.append(s)
    return out

def _avg(a): return sum(a)/len(a)
def _std(a):
    m = _avg(a)
    return math.sqrt(sum((x - m)**2 for x in a)/len(a)) if a else 0.0
def _clamp(x, lo, hi): return max(lo, min(hi, x))
    

#GET, POST PUT, DELETE operations will be defined here

@api_view(['GET'])
def getData(request): 
    limit = request.query_params.get('limit', 7) #limit to 7 days a week
    params = {'limit': limit}
    resp = _noaa_request("datasets", params=params)
    if resp.status_code != 200:

        #log the error code
        log.error("NOAA /datasets failed: %s %s", resp.status_code, resp.text[:500])
        payload = {"error": "NOAA request failed"}
        print("Token present?", bool(settings.NOAA_API_TOKEN))
        print("Token preview:", repr(settings.NOAA_API_TOKEN))
        print("Base URL:", settings.NOAA_API_BASE_URL)
        if settings.DEBUG:
            payload.update({"status_code": resp.status_code, "response": resp.text})
        return Response({"error": "Failed to fetch data from NOAA"}, status=resp.status_code)
    return Response(resp.json(), status=200)

@api_view(["GET"])
def weather_data(request):
    qp = request.query_params
    datasetid = (qp.get("datasetid") or "GHCND").strip()
    stationid = (qp.get("stationid") or "").strip()
    locationid = (qp.get("locationid") or "").strip()
    startdate = (qp.get("startdate") or "2024-09-01").strip()
    enddate   = (qp.get("enddate") or "2024-09-07").strip()
    units     = (qp.get("units") or "standard").strip()
    limit     = int(qp.get("limit") or 1000)
    offset    = int(qp.get("offset") or 1)
    datatypeids = qp.getlist("datatypeid")  # supports multiple

    if not (stationid or locationid):
      return Response({"error":"Provide stationid or locationid"}, status=400)

    base_params = {
      "datasetid": datasetid,
      "startdate": startdate,
      "enddate": enddate,
      "units": units,
      "limit": min(limit, 1000),
      "offset": max(offset, 1),
    }
    if stationid:   base_params["stationid"] = stationid
    if locationid:  base_params["locationid"] = locationid

    # Build list to repeat datatypeid param
    param_items = list(base_params.items())
    for dt in (datatypeids or []):
        param_items.append(("datatypeid", dt))

    try:
        resp = _noaa_request("data", params=param_items)
    except requests.RequestException as e:
        return Response({"error":"NOAA request failed","detail":str(e)}, status=502)

    if not resp.ok:
        # surface upstream error instead of 500
        try:
            content = resp.json()
        except Exception:
            content = {"text": resp.text[:600]}
        return Response({"error":"NOAA upstream error","status":resp.status_code,"content":content}, status=resp.status_code)

    return Response(resp.json())

#Main trends endpoint
@api_view(["GET"])
def trends(request):
    """
    Returns:
    {
      location: { lat, lon },
      days: 7,
      officialForecast: [...],
      predicted: [...],
      confidence: { tMax, tMin, pop, overall },
      summary: "..."
    }
    """
    try:
        lat = float(request.GET.get("lat"))
        lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return Response({"error": "lat & lon are required"}, status=400)

    days = int(request.GET.get("days", 7))

    #historical from NOAA CDO 
    end = timezone.now().date()
    start = end - timedelta(days=90)
    hist_params = {
        "datasetid": request.GET.get("datasetid", "GHCND"),
        "stationid": request.GET.get("stationid", "GHCND:USW00013881"),
        "datatypeid": "TMAX,TMIN,PRCP",
        "units": "metric",
        "startdate": str(start),
        "enddate": str(end),
        "limit": 1000,
    }
    hresp = _noaa_request("data", hist_params)
    if hresp.status_code != 200:
        return Response({"error": "NOAA history failed", "detail": hresp.text}, status=hresp.status_code)

    raw = hresp.json().get("results", [])
    
    tmp = {}
    for r in raw:
        d = r["date"][:10]
        tmp.setdefault(d, {"tMax": None, "tMin": None, "pop": None})
        if r["datatype"] == "TMAX": tmp[d]["tMax"] = r["value"]  # °C
        if r["datatype"] == "TMIN": tmp[d]["tMin"] = r["value"]
        if r["datatype"] == "PRCP": tmp[d]["pop"] = 1.0 if r["value"] and r["value"] > 0 else 0.0  # simple proxy

    hist = [{"date": d, **v} for d, v in sorted(tmp.items()) if all(x is not None for x in v.values())]
    if len(hist) < 30:
        return Response({"error": "Insufficient history"}, status=422)

    #predicted via EWMA
    tmax = [h["tMax"] for h in hist]
    tmin = [h["tMin"] for h in hist]
    pop  = [h["pop"]  for h in hist]

    tmax_tr = _ewma(tmax)
    tmin_tr = _ewma(tmin)
    pop_tr  = _ewma(pop)

    wk = 7
    mm = (_avg(tmax[-wk:]) - _avg(tmax[-2*wk:-wk])) * 0.4
    mn = (_avg(tmin[-wk:]) - _avg(tmin[-2*wk:-wk])) * 0.4
    mp = (_avg(pop[-wk:])  - _avg(pop[-2*wk:-wk]))  * 0.4

    last_date = datetime.fromisoformat(hist[-1]["date"])
    predicted = []
    for i in range(1, days+1):
        d = (last_date + timedelta(days=i)).date().isoformat()
        predicted.append({
            "date": d,
            "tMax": round(tmax_tr[-1] + mm * i, 1),
            "tMin": round(tmin_tr[-1] + mn * i, 1),
            "pop":  _clamp(pop_tr[-1] + mp * i / 7, 0, 1)
        })

    #official forecast (NWS)
    official = _nws_forecast(lat, lon, days=days)

    #confidence
    last7 = hist[-7:]
    last30 = hist[-30:]
    def conf(metric):
        signal = abs(_avg([p[metric] for p in predicted]) - _avg([h[metric] for h in last7]))
        noise  = _std([h[metric] for h in last30])
        return _clamp(1 - noise / (noise + signal + 1e-6), 0.1, 0.95)

    c = {"tMax": conf("tMax"), "tMin": conf("tMin"), "pop": conf("pop")}
    c["overall"] = round(sum(c.values())/3, 2)


    def trend_word(delta, up="increasing", down="decreasing", flat="steady"):
        return up if delta > 1 else down if delta < -1 else flat
    t_delta = predicted[-1]["tMax"] - predicted[0]["tMax"]
    r_delta = predicted[-1]["pop"]  - predicted[0]["pop"]
    summary = f"Next week: {trend_word(t_delta, 'warming','cooling','steady')} temps and " \
              f"{trend_word(r_delta, 'higher','lower','steady')} rain chance."

    return Response({
        "location": {"lat": lat, "lon": lon},
        "days": days,
        "officialForecast": official,
        "predicted": predicted,
        "confidence": c,
        "summary": summary
    }, status=200)

@api_view(['GET'])
def get_locations(request):
    """
    Simple city lookup that proxies NOAA 'locations' (GHCND + CITY) and
    optionally filters by a ?q= or ?query= substring.
    Frontend expects an array with objects that at least have 'id' and 'name'.
    """
    q = (request.GET.get("q") or request.GET.get("query") or "").strip().lower()

    base = getattr(settings, "NOAA_API_BASE_URL", "https://www.ncdc.noaa.gov/cdo-web/api/v2/")
    token = getattr(settings, "NOAA_API_TOKEN", None)
    headers = {"token": token} if token else {}
    params = {
        "datasetid": "GHCND",
        "locationcategoryid": "CITY",
        "limit": 1000,
        "sortfield": "name",
        "sortorder": "asc",
    }

    try:
        r = requests.get(f"{base}locations", headers=headers, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        results = data.get("results", [])

        if q:
            results = [
                item for item in results
                if q in (item.get("name", "") + " " + item.get("id", "")).lower()
            ]

        # Keep it light for the UI
        trimmed = [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "state": item.get("state"),
                "country": item.get("country"),
            }
            for item in results
        ][:25]

        return JsonResponse({"results": trimmed}, status=200, safe=False)
    except requests.HTTPError as e:
        return JsonResponse({"error": "noaa_http_error", "detail": str(e)}, status=502)
    except Exception as e:
        return JsonResponse({"error": "server_error", "detail": str(e)}, status=500)

# views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
import logging

log = logging.getLogger(__name__)

# existing:
# def _noaa_request(endpoint, params=None): ...

@api_view(["GET"])
def list_datasets(request):
    """
    Proxy to NOAA /datasets with a simple limit param.
    """
    limit = request.query_params.get("limit", 5)

    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 5

    params = {"limit": limit}

    resp = _noaa_request("datasets", params=params)

    if resp.status_code != 200:
        log.error(
            "NOAA /datasets failed: %s %s",
            resp.status_code,
            resp.text[:500],
        )
        return Response(
            {"error": "NOAA /datasets failed"},
            status=resp.status_code,
        )

    return Response(resp.json())
