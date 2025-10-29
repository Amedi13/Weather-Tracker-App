# test_noaa_views.py
# Adjust the import path below if needed (e.g., from weather.views import ...)
from base.views import getData, weather_data, get_locations, _noaa_request
from rest_framework.test import APIRequestFactory
from django.http import HttpRequest
import types
import json
import requests
import pytest

class _MockResp:
    def __init__(self, status_code=200, data=None, text=None, ok=None):
        self.status_code = status_code
        self._data = data if data is not None else {}
        self.text = text if text is not None else json.dumps(self._data)
        self.ok = (status_code >= 200 and status_code < 300) if ok is None else ok

    def json(self):
        return self._data


@pytest.fixture
def rf():
    return APIRequestFactory()


@pytest.fixture(autouse=True)
def settings_noaa(settings):
    # Provide defaults used by the views
    settings.NOAA_API_BASE_URL = "https://api.example.noaa.gov/"
    settings.NOAA_API_TOKEN = "TEST_TOKEN"
    settings.DEBUG = False
    return settings


def test__noaa_request_builds_url_and_headers(monkeypatch, settings_noaa):
    captured = {}

    def fake_get(url, headers=None, params=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers or {}
        captured["params"] = params
        captured["timeout"] = timeout
        return _MockResp()

    monkeypatch.setattr(requests, "get", fake_get)

    resp = _noaa_request("/datasets", params={"limit": 5})
    assert isinstance(resp, _MockResp)

    expected_url = settings_noaa.NOAA_API_BASE_URL.rstrip("/") + "/datasets"
    assert captured["url"] == expected_url

    assert captured["headers"].get("token") == "TEST_TOKEN"
    assert captured["params"] == {"limit": 5}
    assert captured["timeout"] == 10


def test_getData_success(monkeypatch, rf):
    def fake_get(url, headers=None, params=None, timeout=None):
        assert url.endswith("/datasets")
        assert params == {"limit": 7}
        return _MockResp(200, {"results": [{"id": 1}]})

    monkeypatch.setattr(requests, "get", fake_get)

    req = rf.get("/api/getData")
    resp = getData(req)
    assert resp.status_code == 200
    assert resp.data == {"results": [{"id": 1}]}


def test_getData_upstream_error_propagates_status(monkeypatch, rf):
    def fake_get(url, headers=None, params=None, timeout=None):
        return _MockResp(503, text="Service unavailable")

    monkeypatch.setattr(requests, "get", fake_get)

    req = rf.get("/api/getData")
    resp = getData(req)
    assert resp.status_code == 503
    assert resp.data["error"] == "Failed to fetch data from NOAA"


def test_weather_data_requires_station_or_location(rf):
    req = rf.get("/api/weather")
    resp = weather_data(req)
    assert resp.status_code == 400
    assert "Provide stationid or locationid" in resp.data["error"]


def test_weather_data_builds_params_with_multiple_datatypeids(monkeypatch, rf):
    captured = {}

    def fake_get(url, headers=None, params=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["params"] = params
        return _MockResp(200, {"results": []})

    monkeypatch.setattr(requests, "get", fake_get)

    # Note: duplicate query keys supported via list in DRF factory
    req = rf.get(
        "/api/weather",
        {
            "stationid": "GHCND:USW00013874",
            "datasetid": "GHCND",
            "startdate": "2024-09-01",
            "enddate": "2024-09-07",
            "units": "standard",
            "limit": 2000,      # will be capped to 1000
            "offset": 0,        # will be max(0,1) => 1
            "datatypeid": ["TMAX", "TMIN"],
        },
    )
    resp = weather_data(req)
    assert resp.status_code == 200
    # Verify correct endpoint
    assert captured["url"].endswith("/data")
    # Verify token header present
    assert captured["headers"]["token"]
    # Verify params shape (list of tuples because view builds it that way)
    params = captured["params"]
    assert isinstance(params, list)
    # Turn into dict(multimap) for easy checks
    multimap = {}
    for k, v in params:
        multimap.setdefault(k, []).append(v)

    # Base params
    assert multimap["datasetid"] == ["GHCND"]
    assert multimap["startdate"] == ["2024-09-01"]
    assert multimap["enddate"] == ["2024-09-07"]
    assert multimap["units"] == ["standard"]
    # limit capped to 1000
    assert multimap["limit"] == ["1000"] or multimap["limit"] == [1000]
    # offset coerced to at least 1
    assert multimap["offset"] == ["1"] or multimap["offset"] == [1]
    # stationid passed through
    assert multimap["stationid"] == ["GHCND:USW00013874"]
    # Both datatypeids repeated
    assert set(multimap["datatypeid"]) == {"TMAX", "TMIN"}


def test_weather_data_upstream_error_propagates_json(monkeypatch, rf):
    def fake_get(url, headers=None, params=None, timeout=None):
        return _MockResp(status_code=429, data={"message": "Too Many Requests"}, ok=False)

    monkeypatch.setattr(requests, "get", fake_get)

    req = rf.get("/api/weather", {"stationid": "ST:ID"})
    resp = weather_data(req)
    assert resp.status_code == 429
    assert resp.data["error"] == "NOAA upstream error"
    assert resp.data["status"] == 429
    assert resp.data["content"] == {"message": "Too Many Requests"}


def test_weather_data_request_exception_returns_502(monkeypatch, rf):
    def fake_get(url, headers=None, params=None, timeout=None):
        raise requests.RequestException("network down")

    monkeypatch.setattr(requests, "get", fake_get)

    req = rf.get("/api/weather", {"stationid": "ST:ID"})
    resp = weather_data(req)
    assert resp.status_code == 502
    assert resp.data["error"] == "NOAA request failed"
    assert "network down" in resp.data["detail"]


def test_get_locations_filters_by_q(monkeypatch, settings_noaa, rf):
    # Note: this view uses f"{BASE_URL}locations" (no slash), so allow both
    def fake_get(url, headers=None, params=None, timeout=None):
        assert "locations" in url
        assert headers.get("token") == "TEST_TOKEN"
        # Ensure dataset/category/sort/limit present
        assert params["datasetid"] == "GSOM"
        assert params["locationcategoryid"] == "CITY"
        assert params["sortfield"] == "name"
        assert params["sortorder"] == "asc"
        assert params["limit"] == 1000
        data = {
            "results": [
                {"id": "CITY:US370016", "name": "Charlotte, NC"},
                {"id": "CITY:US170006", "name": "Chicago, IL"},
            ]
        }
        return _MockResp(200, data)

    monkeypatch.setattr(requests, "get", fake_get)

    req = rf.get("/api/locations", {"q": "char"})  # case-insensitive match "Charlotte, NC"
    # get_locations is a plain Django view (not DRF), so pass a Django HttpRequest
    assert isinstance(req, HttpRequest)
    resp = get_locations(req)
    assert resp.status_code == 200
    payload = json.loads(resp.content.decode("utf-8"))
    names = [r["name"] for r in payload.get("results", [])]
    assert names == ["Charlotte, NC"]
