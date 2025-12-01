import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000", // Django dev server
  timeout: 10000,
});

// Serialize arrays as repeated keys (datatypeid=TMAX&datatypeid=TMIN)
const paramsSerializer = (params) => {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
    else if (v != null) usp.append(k, v);
  });
  return usp.toString();
};

/**
 * Fetch datasets (proxy to /api/datasets/).
 */
export const getDatasets = async (limit = 5) => {
  const { data } = await api.get(`/api/datasets/`, { params: { limit } });
  return data;
};

/**
 * Fetch observations (proxy to /api/data/).
 * Accepts arrays for datatypeid: ['TMAX','TMIN'].
 */
export const getObservations = async (params) => {
  const { data } = await api.get(`/api/data/`, {
    params,
    paramsSerializer,
  });
  return data;
};

/**
 * Search locations via backend. Accepts string or object.
 */
export const search_locations = async (params = {}) => {
  let normalized = params;

  try {
    if (typeof params === "string") normalized = { q: params.trim() };

    if (!normalized || typeof normalized !== "object") normalized = {};

    if (normalized.q) {
      normalized.q = normalized.q
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (normalized.limit == null) normalized.limit = 1000;
    if (normalized.locationcategoryid == null)
      normalized.locationcategoryid = "CITY";
    if (!normalized.sortfield) normalized.sortfield = "name";

    const { data } = await api.get("/api/locations/", { params: normalized });

    // loose match for short city names
    if (typeof params === "string") {
      const raw = params.trim();
      if (raw && !raw.includes(",")) {
        const qLower = raw.toLowerCase();
        const rawResults = data?.results ?? data ?? [];
        const arr = Array.isArray(rawResults) ? rawResults : [rawResults];
        const filtered = arr.filter((loc) => {
          const name = (
            loc.name ||
            loc.city ||
            loc.place ||
            loc.display_name ||
            ""
          ).toLowerCase();
          return name.includes(qLower);
        });
        return { ...data, results: filtered };
      }
    }

    return data;
  } catch (err) {
    console.error("search_locations error:", err?.response || err);
    const message =
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      err.message ||
      "Location search failed";
    throw new Error(message);
  }
};

/**
 * Render map HTML from backend
 */
export const getMaphtml = async () => {
  const { data } = await api.get(`/api/map-html/`);
  return data;
};

/**
 * Fetch daily forecast (aggregated OWM free-tier forecast)
 * GET /api/forecast/daily?lat&lon&days&units
 */
export const fetchDailyForecast = async ({
  lat,
  lon,
  days = 5,
  units = "metric",
}) => {
  const { data } = await api.get(`/api/forecast/daily`, {
    params: { lat, lon, days, units },
  });
  return data;
};

/**
 * Fetch NOAA NWS 7-day daily forecast (no key needed)
 * GET /api/nws?lat&lon&days
 */
export const fetchNws = async ({ lat, lon, days = 7 }) => {
  const { data } = await api.get(`/api/nws`, { params: { lat, lon, days } });
  return data;
};

/**
 * Fetch aggregated trend analysis (EWMA-smoothed)
 * GET /api/trends?lat&lon&days&units
 */
export const fetchTrends = async ({
  lat,
  lon,
  days = 7,
  units = "metric",
}) => {
  const { data } = await api.get(`/api/trends`, {
    params: { lat, lon, days, units },
  });
  return data;
};
