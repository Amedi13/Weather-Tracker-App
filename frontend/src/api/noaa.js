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
    // Allow simple string usage: search_locations("Charlotte")
    if (typeof params === "string") {
      normalized = { q: params.trim() };
    }

    if (!normalized || typeof normalized !== "object") {
      normalized = {};
    }

    // Normalize q formatting a bit: collapse whitespace, tidy commas
    if (normalized.q) {
      normalized.q = normalized.q
        .replace(/\s*,\s*/g, ", ") // "Charlotte,NC" -> "Charlotte, NC"
        .replace(/\s+/g, " ")      // collapse spaces
        .trim();
    }

    // Sensible defaults
    if (normalized.limit == null) normalized.limit = 1000;
    if (normalized.locationcategoryid == null) normalized.locationcategoryid = "CITY";
    if (!normalized.sortfield) normalized.sortfield = "name";

    const { data } = await api.get("/api/locations/", { params: normalized });

    // ---- City-only search: allow loose matching for suggestions ----
    //
    // If the user typed just a city name like "Charlotte" (no comma, no country),
    // filter the returned locations to anything whose name contains that text.
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
    // Centralized logging
    console.error("search_locations error:", err?.response || err);

    // Normalize the error so callers can display something consistent
    const message =
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      err.message ||
      "Location search failed";

    // Re-throw a clean Error for the caller's try/catch (your App already has one)
    throw new Error(message);
  }
};

