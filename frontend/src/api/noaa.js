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

  if (typeof params === "string") normalized = { q: params.trim() };
  if (!normalized || typeof normalized !== "object") normalized = {};

  if (normalized.q) {
    normalized.q = normalized.q.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
  }
  if (normalized.limit == null) normalized.limit = 1000;
  if (normalized.locationcategoryid == null) normalized.locationcategoryid = "CITY";

  const { data } = await api.get("/api/locations/", { params: normalized });
  return data;
};
