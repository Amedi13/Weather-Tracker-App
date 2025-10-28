import React, { useEffect, useState } from 'react';
import './App.css';
import { getDatasets, getObservations, search_locations } from './api/noaa';

function App() {
  const [details, setDetails] = useState([]);
  const [forecastVisible, setForecastVisible] = useState(false);
  const [forecast, setForecast] = useState([]);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [forecastError, setForecastError] = useState('');

  const [todayVisible, setTodayVisible] = useState(false);
  const [today, setToday] = useState(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [todayError, setTodayError] = useState('');

  // Search locations UI state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locationDataResults, setLocationDataResults] = useState([]);

  // --- helpers ---
  const iso = (d) => d.toISOString().slice(0, 10);
  const toC = (v) => (v == null ? null : v / 10);
  const toF = (v) => (v == null ? null : (v / 10) * 9/5 + 32);

  // Group NOAA /data rows (TMAX/TMIN) by date into {date,tmax_c,tmin_c}
  const groupObsByDate = (rows) => {
    const byDate = {};
    for (const r of rows || []) {
      const d = r.date.slice(0, 10);
      (byDate[d] ??= {});
      byDate[d][r.datatype] = r.value;
    }
    return Object.entries(byDate)
      .map(([date, v]) => ({
        date,
        tmax_c: toC(v.TMAX),
        tmin_c: toC(v.TMIN),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  useEffect(() => {
    getDatasets(3)
      .then((d) => setDetails(d.results || []))
      .catch((err) => {
        console.error("datasets error:", err.response?.status, err.response?.data || err.message);
        setDetails([]);
      });
  }, []);

// 7-day TMAX for the last searched location
const loadSevenDayTmax = async () => {
  if (forecastVisible) { setForecastVisible(false); return; }

  // make sure we have at least one search result
  if (!locationResults.length || !locationResults[0].id) {
    setForecastError('Please search for a location first.');
    return;
  }

  const locationid = locationResults[0].id;  // e.g., "CITY:US370005"

  setForecastError('');
  setLoadingForecast(true);
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); // last 7 days inclusive

    const data = await getObservations({
      datasetid: "GHCND",
      locationid,                      // <-- now dynamic
      datatypeid: ["TMAX"],
      startdate: iso(start),
      enddate: iso(end),
      limit: 1000,
    });

    const rows = (data.results || []).map(r => ({
      date: r.date.slice(0, 10),
      max: toC(r.value),
    }));

    setForecast(rows);
    setForecastVisible(true);
  } catch (err) {
    console.error("observations error:", err.response?.status, err.response?.data || err.message);
    setForecastError('Could not fetch observations from /api/data/.');
  } finally {
    setLoadingForecast(false);
  }
};


  // Single day sample (still works as you had it)
  const loadTodaySample = async () => {
    if (todayVisible) { setTodayVisible(false); return; }

    setTodayError('');
    setLoadingToday(true);
    try {
      const start = "2024-09-03";
      const end   = "2024-09-03";
      const [maxResp, minResp] = await Promise.all([
        getObservations({ datasetid:"GHCND", stationid:"GHCND:USW00013881", datatypeid:"TMAX", startdate:start, enddate:end, limit:1 }),
        getObservations({ datasetid:"GHCND", stationid:"GHCND:USW00013881", datatypeid:"TMIN", startdate:start, enddate:end, limit:1 }),
      ]);
      const tmax = maxResp.results?.[0]?.value;
      const tmin = minResp.results?.[0]?.value;
      setToday({
        date: start,
        tmax_c: typeof tmax === "number" ? (tmax/10).toFixed(1) : null,
        tmin_c: typeof tmin === "number" ? (tmin/10).toFixed(1) : null,
        description: "Charlotte daily temperatures",
      });
      setTodayVisible(true);
    } catch (err) {
      console.error("today error:", err.response?.status, err.response?.data || err.message);
      setTodayError("Could not fetch today's sample observations.");
    } finally {
      setLoadingToday(false);
    }
  };

  // Search locations -> then auto-fetch last 7 days TMAX/TMIN for first match
  const handleSearchLocations = async () => {
    if (!locationQuery || !locationQuery.trim()) {
      setSearchError('Please enter a location to search.');
      return;
    }
    setSearchError('');
    setSearchLoading(true);
    try {
      // 1) find matching locations
      const location = await search_locations(locationQuery);
      const results = location?.results || location || [];
      const arr = Array.isArray(results) ? results : [results];
      setLocationResults(arr);

      // 2) auto-fetch temps for the first result (or let user click — your call)
      if (arr.length > 0) {
        const loc = arr[0];
        const locationid = loc.id; // e.g., "CITY:US370005"
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 6);

        const data = await getObservations({
          datasetid: "GHCND",
          locationid,
          datatypeid: ["TMAX", "TMIN"],
          startdate: iso(start),
          enddate: iso(end),
          limit: 1000,
        });

        const grouped = groupObsByDate(data.results);
        setLocationDataResults(grouped); // [{date, tmax_c, tmin_c}, ...]
        console.log("Location Data Results:", grouped);
      } else {
        setLocationDataResults([]);
      }
    } catch (err) {
      console.error('search locations error:', err?.response?.status, err?.response?.data || err?.message);
      setSearchError('Location search failed — see console for details.');
      setLocationDataResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="App landing">
      <header className="hero">
        <div className="hero-inner">
          <h1>Weather Tracker</h1>
          <p className="tagline">Real-time weather data, alerts and historical trends.</p>
          <div className="cta-row">
            <a className="btn primary" href="/datasets">View Data</a>
            <a className="btn ghost" href="/about">Learn More</a>

            <button className="btn primary" onClick={loadSevenDayTmax}>
              {forecastVisible ? 'Hide 7-day TMAX' : 'Show 7-day TMAX'}
            </button>

            <button className="btn ghost" onClick={loadTodaySample}>
              {todayVisible ? "Hide today's sample" : "Show today's sample"}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="features">
          <article><h3>Live Data</h3><p>Visualise up-to-date observations.</p></article>
          <article><h3>Alerts</h3><p>Subscribe to threshold conditions.</p></article>
          <article><h3>Historical</h3><p>Explore long-term trends.</p></article>
        </section>

        <section className="search-locations">
          <article>
            <h3>Search</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Enter a city or place"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1e3f8', flex: '1 1 240px' }}
              />
              <button className="btn primary" onClick={handleSearchLocations} disabled={searchLoading}>
                {searchLoading ? 'Searching…' : 'Search Locations'}
              </button>
            </div>

            {searchError && <p className="muted" style={{ color: 'crimson' }}>{searchError}</p>}

            {locationResults.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4>Results</h4>
                <div className="cards">
                  {locationResults.map((loc, i) => (
                    <div className="card" key={loc.id || loc.code || i}>
                      <strong>{loc.name || loc.place || loc.city || loc.display_name || JSON.stringify(loc)}</strong>
                      <div className="muted">{loc.state || loc.region || loc.country || ''}</div>
                    </div>
                  ))}
                </div>

                {locationDataResults.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4>Location Data (last 7 days)</h4>
                    <div className="cards">
                      {locationDataResults.map((d) => (
                        <div className="card" key={d.date}>
                          <h5>{d.date}</h5>
                          <p>Max: {d.tmax_c != null ? `${d.tmax_c.toFixed(1)}°C` : 'N/A'}</p>
                          <p>Min: {d.tmin_c != null ? `${d.tmin_c.toFixed(1)}°C` : 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="preview">
          <h2>Latest datasets</h2>
          <div className="cards">
            {details.length === 0 ? (
              <p className="muted">No datasets available</p>
            ) : (
              details.map(d => (
                <div className="card" key={d.id || d.name}>
                  <h4>{d.name || d.title || 'Dataset'}</h4>
                  <p>{(d.detail || d.description || '').slice(0, 140) || 'No description'}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="forecast">
          {loadingForecast && <p className="muted">Loading 7-day TMAX…</p>}
          {forecastError && <p className="muted" style={{ color: 'crimson' }}>{forecastError}</p>}
          {forecastVisible && !loadingForecast && (
            <>
              <h2>This week's TMAX (Charlotte)</h2>
              <div className="cards">
                {forecast.length === 0 ? (
                  <p className="muted">No data available.</p>
                ) : (
                  forecast.map((f, idx) => (
                    <div className="card" key={f.date || idx}>
                      <h4>{f.date}</h4>
                      <p>
                        {f.max != null
                          ? <strong>{f.max.toFixed(1)}°C</strong>
                          : <span className="muted">Temperature unavailable</span>}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="today">
          {loadingToday && <p className="muted">Loading today’s sample…</p>}
          {todayError && <p className="muted" style={{ color: 'crimson' }}>{todayError}</p>}
          {todayVisible && !loadingToday && today && (
            <div className="card" style={{maxWidth:420}}>
              <h3>{today.date} — Charlotte</h3>
              <p>Max: {today.tmax_c ?? '—'}°C</p>
              <p>Min: {today.tmin_c ?? '—'}°C</p>
              <p className="muted">{today.description}</p>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Weather Tracker · team 4</p>
      </footer>
    </div>
  );
}

export default App;
