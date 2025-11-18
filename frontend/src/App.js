import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { getDatasets, getObservations, search_locations } from './api/noaa';
import TrendPanel from "./components/TrendPanel";

function App() {
  // ---------- helpers ----------
  const iso = (d) => d.toISOString().slice(0, 10);                 // YYYY-MM-DD
  const toC = (v) => (typeof v === 'number' ? v / 10 : null);      // GHCND tenths °C

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

  // ---------- refs ----------
  const todayRef = useRef(null);
  const forecastRef = useRef(null);
  const datasetRef = useRef(null);

  // ---------- datasets preview ----------
  const [details, setDetails] = useState([]);

  // sample data for a selected dataset
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetSample, setDatasetSample] = useState([]);
  const [loadingDatasetSample, setLoadingDatasetSample] = useState(false);
  const [datasetSampleError, setDatasetSampleError] = useState('');

  // ---------- seven-day forecast (TMAX) ----------
  const [forecastVisible, setForecastVisible] = useState(false);
  const [forecast, setForecast] = useState([]);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [forecastError, setForecastError] = useState('');

  // ---------- single-day sample ----------
  const [todayVisible, setTodayVisible] = useState(false);
  const [today, setToday] = useState(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [todayError, setTodayError] = useState('');

  // ---------- pinned locations toggle ----------
  const [showQueue, setShowQueue] = useState(false);
  const toggleQueue = () => setShowQueue((v) => !v);

  // ---------- search UI state ----------
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locationDataResults, setLocationDataResults] = useState([]);

  useEffect(() => {
    getDatasets(3)
      .then((d) => setDetails(d?.results || []))
      .catch((err) => {
        console.error('datasets error:', err.response?.status, err.response?.data || err.message);
        setDetails([]);
      });
  }, []);

  // ---------- load 7-day TMAX for Charlotte ----------
  const loadSevenDayTmax = async () => {
    if (forecastVisible) {
      setForecastVisible(false);
      return;
    }
    setForecastError('');
    setLoadingForecast(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6); // last 7 days inclusive

      const data = await getObservations({
        datasetid: 'GHCND',
        stationid: 'GHCND:USW00013881', // Charlotte Douglas AP
        datatypeid: ['TMAX'],
        startdate: iso(start),
        enddate: iso(end),
        limit: 1000,
      });

      const rows = (data?.results || []).map((r) => ({
        date: r.date.slice(0, 10),
        max: toC(r.value),
      }));

      setForecast(rows);
      setForecastVisible(true);
      setTimeout(() => {
        forecastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('observations error:', err.response?.status, err.response?.data || err.message);
      setForecastError('Could not fetch observations from /api/data/.');
    } finally {
      setLoadingForecast(false);
    }
  };

  // ---------- single day sample ----------
  const loadTodaySample = async () => {
    if (todayVisible) {
      setTodayVisible(false);
      return;
    }
    setTodayError('');
    setLoadingToday(true);
    try {
      const start = '2024-09-03';
      const end = '2024-09-03';
      const [maxResp, minResp] = await Promise.all([
        getObservations({
          datasetid: 'GHCND',
          stationid: 'GHCND:USW00013881',
          datatypeid: 'TMAX',
          startdate: start,
          enddate: end,
          limit: 1,
        }),
        getObservations({
          datasetid: 'GHCND',
          stationid: 'GHCND:USW00013881',
          datatypeid: 'TMIN',
          startdate: start,
          enddate: end,
          limit: 1,
        }),
      ]);
      const tmax = maxResp?.results?.[0]?.value;
      const tmin = minResp?.results?.[0]?.value;
      setToday({
        date: start,
        tmax_c: typeof tmax === 'number' ? (tmax / 10).toFixed(1) : null,
        tmin_c: typeof tmin === 'number' ? (tmin / 10).toFixed(1) : null,
        description: 'Charlotte daily temperatures',
      });
      setTodayVisible(true);
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      console.error("today error:", err.response?.status, err.response?.data || err.message);
      setTodayError("Could not fetch today's sample observations.");
    } finally {
      setLoadingToday(false);
    }
  };

  // ---------- dataset sample loader (dynamic dataset id) ----------
  const loadDatasetSample = async (dataset) => {
    if (!dataset || !dataset.id) return;

    setSelectedDataset(dataset);
    setDatasetSample([]);
    setDatasetSampleError('');
    setLoadingDatasetSample(true);

    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6); // last 7 days

      const data = await getObservations({
        datasetid: dataset.id,                 // 🔥 dynamic from dataset card
        stationid: 'GHCND:USW00013881',        // Charlotte station
        datatypeid: ['TMAX', 'TMIN'],          // so we can reuse groupObsByDate
        startdate: iso(start),
        enddate: iso(end),
        limit: 1000,
      });

      const grouped = groupObsByDate(data?.results || []);
      setDatasetSample(grouped);

      setTimeout(() => {
        datasetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err) {
      console.error('dataset sample error:', err.response?.status, err.response?.data || err.message);
      setDatasetSampleError('Could not load sample data for this dataset.');
    } finally {
      setLoadingDatasetSample(false);
    }
  };

  // ---------- search locations ----------
  const handleSearchLocations = async () => {
    if (!locationQuery.trim()) {
      setSearchError('Please enter a location to search.');
      return;
    }
    setSearchError('');
    setSearchLoading(true);
    try {
      const location = await search_locations(locationQuery);
      const results = location?.results || location || [];
      const arr = Array.isArray(results) ? results : [results];
      setLocationResults(arr);

      if (arr.length > 0) {
        const loc = arr[0];
        const locationid = loc.id; // e.g., "CITY:US370005"
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
            <button className="btn primary" onClick={toggleQueue}>
              {showQueue ? 'Hide Pinned Locations' : 'Show Pinned Locations'}
            </button>

            <a className="btn primary" href="/datasets">View Data</a>

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
        {showQueue && (
          <section
            className="queue-interface"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '40px' }}
          >
            <h2 style={{ textAlign: 'center' }}>Pin Locations Below</h2>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn primary" style={{ flex: '1', padding: '20px 100px', fontSize: '1.2rem', backgroundColor: '#f7f9fc', color: 'black', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Pin location here</button>
              <button className="btn ghost"   style={{ flex: '1', padding: '20px 100px', fontSize: '1.2rem', backgroundColor: '#f7f9fc', color: 'black', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Pin location here</button>
              <button className="btn primary" style={{ flex: '1', padding: '20px 100px', fontSize: '1.2rem', backgroundColor: '#f7f9fc', color: 'black', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Pin location here</button>
              <button className="btn ghost"   style={{ flex: '1', padding: '20px 100px', fontSize: '1.2rem', backgroundColor: '#f7f9fc', color: 'black', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Pin location here</button>
            </div>
          </section>
        )}

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

        <div className="container">
          <TrendPanel lat={35.2271} lon={-80.8431} days={7} />
        </div>

        <section className="preview">
          <h2>Latest datasets</h2>
          <div className="cards">
            {details.length === 0 ? (
              <p className="muted">No datasets available</p>
            ) : (
              details.map((d) => (
                <div className="card" key={d.id || d.name}>
                  <h4>{d.name || d.title || 'Dataset'}</h4>
                  <p>{(d.detail || d.description || '').slice(0, 140) || 'No description'}</p>
                  <button
                    className="btn ghost"
                    onClick={() => loadDatasetSample(d)}
                    style={{ marginTop: '8px' }}
                  >
                    View sample for this dataset
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* dataset sample section */}
        {selectedDataset && (
          <section className="forecast" ref={datasetRef}>
            <h2>
              Sample for {selectedDataset.name || selectedDataset.id} ({selectedDataset.id})
            </h2>
            <p className="muted">
              Last 7 days near Charlotte (station GHCND:USW00013881) using this dataset.
            </p>

            {loadingDatasetSample && <p className="muted">Loading dataset sample…</p>}
            {datasetSampleError && (
              <p className="muted" style={{ color: 'crimson' }}>
                {datasetSampleError}
              </p>
            )}

            {!loadingDatasetSample && !datasetSampleError && (
              <div className="cards">
                {datasetSample.length === 0 ? (
                  <p className="muted">No data available for this dataset.</p>
                ) : (
                  datasetSample.map((d) => (
                    <div className="card" key={d.date}>
                      <h4>{d.date}</h4>
                      <p>
                        Max:{' '}
                        {d.tmax_c != null ? `${d.tmax_c.toFixed(1)}°C` : 'N/A'}
                      </p>
                      <p>
                        Min:{' '}
                        {d.tmin_c != null ? `${d.tmin_c.toFixed(1)}°C` : 'N/A'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        )}

        <section className="forecast" ref={forecastRef}>
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
                        {f.max != null ? (
                          <strong>{f.max.toFixed(1)}°C</strong>
                        ) : (
                          <span className="muted">Temperature unavailable</span>
                        )}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="today" ref={todayRef}>
          {loadingToday && <p className="muted">Loading today’s sample…</p>}
          {todayError && <p className="muted" style={{ color: 'crimson' }}>{todayError}</p>}
          {todayVisible && !loadingToday && today && (
            <div className="card" style={{ maxWidth: 420 }}>
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
