# tests/test_views.py
import json
import types
import datetime as dt
import pytest

# Django app name that contains views.py
from base import views

from django.test import RequestFactory
from django.http import QueryDict

class FakeResp:
    def __init__(self, ok=True, status_code=200, payload=None, text=""):
        self.ok = ok
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


def test_math_helpers():
    # _avg
    assert views._avg([1, 2, 3]) == 2
    assert views._avg([]) == 0.0

    # _std (population std)
    v = [2, 2, 2, 2]
    assert views._std(v) == 0.0
    v2 = [0, 2, 4, 6]
    # population std: sqrt( ( (4+0+4+16)/4 ) ) = sqrt(6).
    assert views._std(v2) == pytest.approx(2.2360679, rel=1e-3)

    # _clamp
    assert views._clamp(5, 0, 10) == 5
    assert views._clamp(-1, 0, 10) == 0
    assert views._clamp(11, 0, 10) == 10

def test_ewma():
    arr = [10, 20, 30]
    out = views._ewma(arr, alpha=0.5)
    # s0 = 10
    # s1 = 0.5*20 + 0.5*10 = 15
    # s2 = 0.5*30 + 0.5*15 = 22.5
    assert out == [10, 15, 22.5]

def test_heat_index_and_wind_chill():
    # Heat index (F + RH). Just ensure it returns a number for plausible inputs.
    hi = views.heat_index_f(95, 60)
    assert isinstance(hi, float)

    # Wind chill (applies if T<=50F and wind>=3 mph)
    assert views.wind_chill_f(60, 10) is None  # too warm
    assert views.wind_chill_f(40, 1) is None   # too calm
    wc = views.wind_chill_f(30, 10)
    assert isinstance(wc, float)
    # Wind chill should be less than the ambient temp in this range.
    assert wc < 30


# ============================
# View tests (with monkeypatch)
# ============================

@pytest.fixture
def rf():
    return RequestFactory()

def test__owm_request_missing_key(monkeypatch, settings):
    # Ensure missing key path returns a "fake" 401
    monkeypatch.setattr(views.settings, "OWM_API_KEY", None, raising=False)
    resp = views._owm_request("/data/2.5/weather", params={"lat": 0, "lon": 0, "units": "metric"})
    assert hasattr(resp, "ok")
    assert resp.ok is False
    assert resp.status_code == 401
    assert "Missing OWM_API_KEY" in resp.json().get("message", "")

def test_get_locations_success(monkeypatch, rf, settings):
    monkeypatch.setattr(views.settings, "OWM_API_KEY", "dummy", raising=False)

    def fake_owm_request(path, params=None):
        assert path == "/geo/1.0/direct"
        q = params.get("q")
        assert q in ("Charlotte",)
        payload = [
            {"name": "Charlotte", "state": "NC", "country": "US", "lat": 35.23, "lon": -80.84},
            {"name": "Charlotte", "state": "MI", "country": "US", "lat": 42.56, "lon": -84.83},
        ]
        return FakeResp(ok=True, status_code=200, payload=payload)

    monkeypatch.setattr(views, "_owm_request", fake_owm_request)

    req = rf.get("/api/locations?q=Charlotte")
    resp = views.get_locations(req)
    assert resp.status_code == 200
    data = json.loads(resp.content)
    assert "results" in data
    assert len(data["results"]) == 2
    assert data["results"][0]["name"] == "Charlotte"
    assert data["results"][0]["state"] == "NC"

def test_alerts_success(monkeypatch, rf):
    # Mock requests.get to return a standard NWS features payload
    def fake_requests_get(url, headers=None, timeout=10):
        payload = {
            "features": [
                {
                    "id": "abc",
                    "properties": {
                        "event": "Flood Watch",
                        "severity": "Moderate",
                        "headline": "Flooding possible in low-lying areas",
                        "effective": "2025-12-01T12:00:00Z",
                        "ends": "2025-12-02T00:00:00Z",
                        "areaDesc": "Mecklenburg County",
                    },
                    "geometry": {"type": "Polygon", "coordinates": [[[0,0],[1,1],[1,0],[0,0]]]},
                }
            ]
        }
        return FakeResp(ok=True, status_code=200, payload=payload)

    monkeypatch.setattr(views.requests, "get", fake_requests_get)

    req = rf.get("/api/alerts?lat=35.23&lon=-80.84")
    resp = views.alerts(req)
    assert resp.status_code == 200
    data = resp.data
    assert data["count"] == 1
    assert data["alerts"][0]["event"] == "Flood Watch"
    assert data["alerts"][0]["severity"] == "Moderate"

def test_daily_forecast_success(monkeypatch, rf, settings):
    monkeypatch.setattr(views.settings, "OWM_API_KEY", "dummy", raising=False)

    # Build a minimal 3h-forecast list for two days (UTC keys via dt_txt)
    list_payload = [
        {"dt_txt": "2025-12-01 00:00:00", "main": {"temp": 10}, "pop": 0.1},
        {"dt_txt": "2025-12-01 03:00:00", "main": {"temp": 12}, "pop": 0.3},
        {"dt_txt": "2025-12-02 00:00:00", "main": {"temp": 8},  "pop": 0.6},
        {"dt_txt": "2025-12-02 03:00:00", "main": {"temp": 6},  "pop": 0.2},
    ]

    def fake_owm_request(path, params=None):
        assert path == "/data/2.5/forecast"
        return FakeResp(ok=True, status_code=200, payload={"list": list_payload})

    monkeypatch.setattr(views, "_owm_request", fake_owm_request)

    req = rf.get("/api/forecast/daily?lat=35.23&lon=-80.84&units=metric&days=2")
    resp = views.daily_forecast(req)
    assert resp.status_code == 200
    data = resp.data
    assert data["units"] == "metric"
    assert data["days"] == 2
    assert len(data["daily"]) == 2
    # First day should have tMax 12, tMin 10, pop max 0.3
    assert data["daily"][0]["tMax"] == 12.0
    assert data["daily"][0]["tMin"] == 10.0
    assert data["daily"][0]["pop"] == 0.3

def test_trends_success(monkeypatch, rf, settings):
    monkeypatch.setattr(views.settings, "OWM_API_KEY", "dummy", raising=False)

    list_payload = [
        # Day 1
        {"dt_txt": "2025-12-01 00:00:00", "main": {"temp": 10, "humidity": 50}, "wind": {"speed": 3.0}, "pop": 0.1},
        {"dt_txt": "2025-12-01 03:00:00", "main": {"temp": 12, "humidity": 60}, "wind": {"speed": 4.5}, "pop": 0.2},
        # Day 2
        {"dt_txt": "2025-12-02 00:00:00", "main": {"temp": 8, "humidity": 55},  "wind": {"speed": 5.0}, "pop": 0.6},
        {"dt_txt": "2025-12-02 03:00:00", "main": {"temp": 6, "humidity": 65},  "wind": {"speed": 2.8}, "pop": 0.4},
        # Day 3 (to ensure >= 2–3 points)
        {"dt_txt": "2025-12-03 00:00:00", "main": {"temp": 7, "humidity": 70},  "wind": {"speed": 6.5}, "pop": 0.5},
    ]

    def fake_owm_request(path, params=None):
        assert path == "/data/2.5/forecast"
        return FakeResp(ok=True, status_code=200, payload={"list": list_payload})

    monkeypatch.setattr(views, "_owm_request", fake_owm_request)

    req = rf.get("/api/trends?lat=35.23&lon=-80.84&units=metric&days=3")
    resp = views.trends(req)
    assert resp.status_code == 200
    data = resp.data
    assert data["units"] == "metric"
    assert data["days"] == 3
    assert len(data["officialForecast"]) == 3
    assert len(data["predicted"]) == 3
    assert "confidence" in data and "overall" in data["confidence"]
    # risk fields present
    assert "daily" in data and "risk" in data["daily"][0]

def test_weather_data_success(monkeypatch, rf, settings):
    monkeypatch.setattr(views.settings, "OWM_API_KEY", "dummy", raising=False)

    # mock geocoder.ip
    class FakeGeo:
        latlng = (35.23, -80.84)
    monkeypatch.setattr(views.geocoder, "ip", lambda _: FakeGeo())

    # mock _owm_request -> current weather payload
    payload = {"name": "Charlotte", "main": {"temp": 280.0}}
    monkeypatch.setattr(views, "_owm_request", lambda path, params=None: FakeResp(True, 200, payload))

    req = rf.get("/api/weather?units=metric")
    resp = views.weather_data(req)
    assert resp.status_code == 200
    assert resp.data["name"] == "Charlotte"

def test_getData_alias(monkeypatch, rf, settings):
    monkeypatch.setattr(views.settings, "OWM_API_KEY", "dummy", raising=False)

    class FakeGeo:
        latlng = (35.23, -80.84)
    monkeypatch.setattr(views.geocoder, "ip", lambda _: FakeGeo())
    payload = {"sys": {"country": "US"}}
    monkeypatch.setattr(views, "_owm_request", lambda path, params=None: FakeResp(True, 200, payload))

    req = rf.get("/api/getData?units=imperial")
    resp = views.getData(req)
    assert resp.status_code == 200
    assert resp.data["sys"]["country"] == "US"

def test_get_map_html_basic(monkeypatch, rf):
    # Mock geolocate & suppress downstream network calls inside the try-block
    class FakeGeo:
        latlng = (35.23, -80.84)
    monkeypatch.setattr(views.geocoder, "ip", lambda _: FakeGeo())

    def fake_requests_get(url, headers=None, timeout=10):
        # return a non-ok so the alert overlay branch is skipped
        return FakeResp(ok=False, status_code=502, payload={"error": "skip"})
    monkeypatch.setattr(views.requests, "get", fake_requests_get)

    req = rf.get("/api/map-html/")
    resp = views.get_map_html(req)
    # returns HTML for folium map
    assert resp.status_code == 200
    assert b"<div " in resp.content  # folium map html container present
