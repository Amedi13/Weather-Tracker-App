import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import {
  getObservations,
  search_locations,
} from './api/noaa';
import TrendPanel from "./components/TrendPanel";

function App() {
  const iso = (d) => d.toISOString().slice(0, 10);
  const toC = (v) => (typeof v === 'number' ? v / 10 : null);
  const LSK = 'wt_pins';
  const todayRef = useRef(null);

  // Units
  const [units, setUnits] = useState("imperial");
  const toggleUnits = () => setUnits((u) => (u === "metric" ? "imperial" : "metric"));

  // Active location (default Charlotte)
  const [activeLoc, setActiveLoc] = useState({
    id: 'Charlotte,NC,US',
    name: 'Charlotte',
    state: 'NC',
    country: 'US',
    lat: 35.2271,
    lon: -80.8431,
  });

  // Pinned locs (persisted)
  const [pinned, setPinned] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LSK);
      if (raw) setPinned(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LSK, JSON.stringify(pinned));
    } catch {}
  }, [pinned]);

  const isPinned = (id) => pinned.some(p => p.id === id);
  const pinLocation = (loc) => {
    if (!loc || !loc.id || loc.lat == null || loc.lon == null) return;
    if (isPinned(loc.id)) return;
    setPinned(prev => [{ ...loc }, ...prev]);
    setShowSearchResults(false);
  };
  const unpinLocation = (id) => {
    setPinned(prev => prev.filter(p => p.id !== id));
    if (activeLoc.id === id) {
      setActiveLoc({
        id: 'Charlotte,NC,US',
        name: 'Charlotte',
        state: 'NC',
        country: 'US',
        lat: 35.2271,
        lon: -80.8431,
      });
    }
  };

  // Alerts
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);

  const refreshAlerts = async (lat, lon) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/alerts?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error(`alerts ${res.status}`);
      const data = await res.json();
      setAlertCount(data?.count || 0);
      setAlerts(data?.alerts || []);
    } catch {
      setAlertCount(0);
      setAlerts([]);
    }
  };

  useEffect(() => {
    refreshAlerts(activeLoc.lat, activeLoc.lon);
  }, [activeLoc.lat, activeLoc.lon]);

  // Queue visibility
  const [showQueue, setShowQueue] = useState(false);
  const toggleQueue = () => setShowQueue((v) => !v);

  // -------- Search + validation --------
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // New: user-facing guidance + echo of bad input
  const [lastBadQuery, setLastBadQuery] = useState('');
  const [searchHint, setSearchHint] = useState('Try City Name');

  const normalize = (s) => s.replace(/\s+/g, ' ').trim();
  const hasForbidden = (s) => /[^\p{L}\p{N}\s,\-'.]/u.test(s); // allow letters/numbers/space/comma/dash/’/.
  const tooShort = (s) => s.length < 2;

  function validateQuery(raw) {
    const q = normalize(raw);

    if (!q) {
      return { ok: false, message: 'Please enter a location.', suggestion: 'Example: “Charlotte, NC”.' };
    }
    if (tooShort(q)) {
      return { ok: false, message: 'Search term is too short.', suggestion: 'Type at least 2 characters.' };
    }
    if (hasForbidden(q)) {
      return { ok: false, message: 'Your query has unsupported characters.', suggestion: 'Use letters, numbers, commas. Example: “Raleigh”.' };
    }
    if (/^[a-z]{2}$/i.test(q)) {
      return { ok: false, message: 'That looks like a country/state code alone.', suggestion: 'Use a city too, e.g., “Miami” or “Paris”.' };
    }
    return { ok: true, message: '', suggestion: '' };
  }

  const handleSearchLocations = async () => {
    const raw = locationQuery;
    const check = validateQuery(raw);

    // reset error UI
    setSearchError('');
    setLastBadQuery('');

    if (!check.ok) {
      setSearchError(check.message);
      setSearchHint(check.suggestion);
      setLastBadQuery(raw);
      setLocationResults([]);
      setLocationDataResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await search_locations(raw);
      const results = res?.results || res || [];
      const arr = Array.isArray(results) ? results : [results];

      if (arr.length === 0) {
        setSearchError('No matches found.');
        setSearchHint('Check spelling or try “City"');
        setLastBadQuery(raw);
        setLocationResults([]);
        setLocationDataResults([]);
        setShowSearchResults(false);
        return;
      }

      setLocationResults(arr);
      setShowSearchResults(true);

      const loc = arr[0];
      const locationid = loc.id;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);

      const data = await getObservations({
        datasetid: 'GHCND',
        locationid,
        datatypeid: ['TMAX', 'TMIN'],
        startdate: iso(start),
        enddate: iso(end),
        limit: 1000,
      });

      const grouped = groupObsByDate(data?.results || []);
      setLocationDataResults(grouped);
    } catch (err) {
      console.error('search locations error:', err?.response?.status, err?.response?.data || err?.message);
      setSearchError('Search failed. Please adjust your query.');
      setSearchHint('Use “City”');
      setLastBadQuery(raw);
      setLocationResults([]);
      setLocationDataResults([]);
      setShowSearchResults(false);
    } finally {
      setSearchLoading(false);
    }
  };

  // Data preview for search
  const [locationDataResults, setLocationDataResults] = useState([]);

  // Small inline “chip” style for Active badge
  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.2rem 0.55rem',
    borderRadius: '999px',
    fontWeight: 700,
    fontSize: '0.8rem',
    background: 'rgba(34,197,94,0.18)',
    border: '1px solid rgba(34,197,94,0.5)',
    color: '#e5e7eb',
  };

  // Group obs by date (unchanged)
  const groupObsByDate = (rows = []) => {
    const map = {};
    rows.forEach((r) => {
      const date = r.date?.slice(0, 10);
      if (!date) return;
      if (!map[date]) map[date] = { date, tmax_c: null, tmin_c: null };
      if (r.datatype === 'TMAX') map[date].tmax_c = toC(r.value);
      if (r.datatype === 'TMIN') map[date].tmin_c = toC(r.value);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  };

  return (
    <div className="App landing">
      <header className="hero">
        <div className="hero-inner">
          <h1>Weather Tracker</h1>
          <p className="tagline">Real-time weather data, alerts and trends.</p>

          {/* Active location indicator in the header */}
          <div style={{ marginBottom: 10 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(148,163,184,0.35)',
              borderRadius: 999,
              padding: '6px 12px'
            }}>
              <span role="img" aria-label="pin">📍</span>
              Active:&nbsp;
              {activeLoc.name}{activeLoc.state ? `, ${activeLoc.state}` : ''}{activeLoc.country ? `, ${activeLoc.country}` : ''}
            </span>
          </div>

          <div className="cta-row">
            <button className="btn primary" onClick={toggleQueue}>
              {showQueue ? 'Hide Pinned Locations' : 'Show Pinned Locations'}
            </button>
            <button
              className="btn warning"
              onClick={() => {
                setShowAlerts(v => !v);
                if (!showAlerts) refreshAlerts(activeLoc.lat, activeLoc.lon);
              }}
            >
              ⚠ Alerts ({alertCount})
            </button>
            <button className="btn ghost" onClick={toggleUnits}>
              Units: {units === 'metric' ? '°C' : '°F'}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {showAlerts && (
          <section className="alerts">
            <h3>Active Alerts — {activeLoc.name}</h3>
            {alerts.length === 0 ? (
              <p className="muted">No active alerts.</p>
            ) : (
              <div className="cards">
                {alerts.map((a, i) => (
                  <div className="card" key={a.id || i}>
                    <strong>{a.event}</strong>
                    {a.severity && <span className="chip" style={{ marginLeft: 8 }}>{a.severity}</span>}
                    <div className="muted" style={{ marginTop: 6 }}>{a.headline}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {showQueue && (
          <section>
            <h2>Pinned Locations</h2>
            {pinned.length === 0 ? (
              <p className="muted">No locations pinned.</p>
            ) : (
              <div className="cards">
                {pinned.map((p) => {
                  const active = p.id === activeLoc.id;
                  return (
                    <div
                      className="card"
                      key={p.id}
                      style={{
                        borderColor: active ? 'rgba(34,197,94,0.8)' : undefined,
                        boxShadow: active ? '0 0 0 2px rgba(34,197,94,0.25), 0 10px 30px rgba(15,23,42,0.9)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {p.name}{p.state ? `, ${p.state}` : ''}{p.country ? `, ${p.country}` : ''}
                            {active && <span style={chipStyle}>Active</span>}
                          </h4>
                          <div className="muted">lat: {p.lat}, lon: {p.lon}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn subtle"
                            onClick={() => setActiveLoc(p)}
                            disabled={active}
                            title={active ? 'Already active' : 'Set Active'}
                            style={active ? { opacity: 0.6, cursor: 'default' } : undefined}
                          >
                            {active ? 'Active' : 'Set Active'}
                          </button>
                          <button className="btn ghost" onClick={() => unpinLocation(p.id)}>Unpin</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="search-locations">
          <h3>Search</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Search by City, City, State or City, Country"
              value={locationQuery}
              onChange={(e) => {
                setLocationQuery(e.target.value);
                if (searchError) setSearchError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchLocations(); }}
              style={{ padding: '8px', flex: 1 }}
            />
            <button className="btn primary" onClick={handleSearchLocations} disabled={searchLoading}>
              {searchLoading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {(searchError || searchHint) && (
            <div className="search-banner" style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.08)'
            }}>
              {searchError && (
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {searchError}{lastBadQuery ? ` — You typed: “${lastBadQuery}”.` : ''}
                </div>
              )}
              {searchHint && <div className="muted">{searchHint}</div>}
            </div>
          )}

          {showSearchResults && locationResults.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Results</h4>
              <div className="cards">
                {locationResults.map((loc, i) => {
                  const pinnedAlready = isPinned(loc.id);
                  return (
                    <div className="card" key={loc.id || i}>
                      <strong>{loc.name}{loc.state ? `, ${loc.state}` : ''}{loc.country ? `, ${loc.country}` : ''}</strong>
                      <div className="muted">lat: {loc.lat}, lon: {loc.lon}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          className="btn subtle"
                          onClick={() => { setActiveLoc(loc); setShowSearchResults(false); }}
                        >
                          Set Active
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => { pinLocation(loc); setShowSearchResults(false); }}
                          disabled={pinnedAlready}
                          title={pinnedAlready ? 'Already pinned' : 'Pin location'}
                        >
                          {pinnedAlready ? 'Pinned' : 'Pin'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <div className="container">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeLoc.name}{activeLoc.state ? `, ${activeLoc.state}` : ''}{activeLoc.country ? `, ${activeLoc.country}` : ''}
            <span style={chipStyle}>Active</span>
          </h2>
          <TrendPanel lat={activeLoc.lat} lon={activeLoc.lon} days={7} units={units} />
        </div>

        <section className="map-section">
          <h2>Map</h2>
          <iframe
            src="http://127.0.0.1:8000/api/map-html/"
            title="Weather Map"
            width="100%"
            height="500px"
            style={{ border: 'none' }}
          />
        </section>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Weather Tracker · Team 4</p>
      </footer>
    </div>
  );
}

export default App;
