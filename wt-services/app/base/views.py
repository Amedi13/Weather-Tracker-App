from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import React
from .serializer import ReactSerializer
from django.conf import settings
import requests
import logging
from django.http import JsonResponse
# Configure logger
log = logging.getLogger(__name__)


#helper function to make requests to NOAA API
def _noaa_request(endpoint, params=None):
    """Helper to call NOAA CDO API."""
    url = f"{settings.NOAA_API_BASE_URL}/{endpoint.lstrip('/')}"
    headers = {"token": settings.NOAA_API_TOKEN}
    resp = requests.get(url, headers=headers, params=params or {}, timeout=10)
    return resp

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
        print("Token preview:", repr(settings.NOAA_API_TOKEN))  # should NOT include quotes
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

#search for Locations 
def get_locations(request):
    q = request.GET.get("q", "")
    datasetid = request.GET.get("datasetid", "GSOM")
    locationcategoryid = request.GET.get("locationcategoryid", "CITY")

    headers = {"token": settings.NOAA_API_TOKEN}
    params = {
        "datasetid": datasetid,
        "locationcategoryid": locationcategoryid,
        "sortfield": "name",
        "sortorder": "asc",
        "limit": 1000,
    }

    response = requests.get(f"{settings.NOAA_API_BASE_URL}locations", headers=headers, params=params)
    data = response.json()

    if q:
        data["results"] = [
            loc for loc in data.get("results", [])
            if q.lower() in (loc.get("name", "").lower())
        ]

    return JsonResponse(data)

