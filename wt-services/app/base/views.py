from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import React
from .serializer import ReactSerializer
from django.conf import settings
import requests
import logging

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
    # potential query parameters
    params = {
        "datasetid": request.GET.get("datasetid", "GHCND"),  # Daily summaries
        "stationid": request.GET.get("stationid", "GHCND:USW00013881"),  # Charlotte Douglas Airport
        "datatypeid": request.GET.get("datatypeid", "TMAX"),  # Max temp
        "startdate": request.GET.get("startdate", "2024-09-01"),
        "enddate": request.GET.get("enddate", "2024-09-07"),
        "limit": request.GET.get("limit", 5),
    }
    resp = _noaa_request("data", params)
    if resp.status_code != 200:
        return Response(
            {"error": "NOAA data request failed", "status": resp.status_code, "detail": resp.text},
            status=resp.status_code,
        )
    return Response(resp.json())

