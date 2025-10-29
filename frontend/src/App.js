import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { getDatasets, getObservations } from './api/noaa';

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

  const forecastRef = useRef(null);
  const todayRef = useRef(null);

  useEffect(() => {
    getDatasets(3)
      .then((d) => setDetails(d.results || []))
      .catch((err) => {
        console.error("datasets error:", err.response?.status, err.response?.data || err.message);
        setDetails([]);
      });
  }, []);

  // Data call 
  const loadSevenDayTmax = async () => {
    if (forecastVisible) { setForecastVisible(false); return; }

    setForecastError('');
    setLoadingForecast(true);
    try {
      const data = await getObservations({
        datasetid: "GHCND",
        stationid: "GHCND:USW00013881", // Charlotte Douglas Airport
        datatypeid: "TMAX",
        startdate: "2024-09-01",
        enddate: "2024-09-07",
        limit: 7,
      });
      const rows = (data.results || []).map(r => ({
        date: r.date?.slice(0,10),
        min: null,
        max: typeof r.value === "number" ? r.value / 10 : null, // tenths °C -> °C
      }));
      setForecast(rows);
      setForecastVisible(true);
      setTimeout(() => {
        forecastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      console.error("observations error:", err.response?.status, err.response?.data || err.message);
      setForecastError('Could not fetch observations from /api/data/.');
    } finally {
      setLoadingForecast(false);
    }
  };

  // Single day forecast
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
                      <p className="muted">{f.desc}</p>
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

        <section className="today" ref={todayRef}>
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
        <p>© {new Date().getFullYear()} Weather Tracker · Built with dev team</p>
      </footer>
    </div>
  );
}

export default App;
