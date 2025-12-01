import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { getDatasets, getObservations, search_locations } from './api/noaa';
import TrendPanel from "./components/TrendPanel";


function App() {
  // ---------- helpers ----------
  const iso = (d) => d.toISOString().slice(0, 10);                 // YYYY-MM-DD
  const toC = (v) => (typeof v === 'number' ? v / 10 : null);       // GHCND tenths °C
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

  // ---------- datasets preview ----------
  const [details, setDetails] = useState([]);

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

/*For pinned locations above. it toggles the visibility of the button to show
 and hide the button.

 When visible, it needs to show implemented pinned locations
*/

{/* for additional sub buttons four each of the main four pin location buttons */}
const [moreSubButtons1, setShowSubButtons1] = useState(false);
const [moreSubButtons2, setShowSubButtons2] = useState(false);
const [moreSubButtons3, setShowSubButtons3] = useState(false);
const [moreSubButtons4, setShowSubButtons4] = useState(false);


{/* for toggling the visibility of these additional sub buttons */}
const toggleMoreSubButtons1 = () => setShowSubButtons1(!moreSubButtons1);
const toggleMoreSubButtons2 = () => setShowSubButtons2(!moreSubButtons2);
const toggleMoreSubButtons3 = () => setShowSubButtons3(!moreSubButtons3);
const toggleMoreSubButtons4 = () => setShowSubButtons4(!moreSubButtons4);




  // ---------- search UI state ----------
  const [locationQuery, setLocationQuery] = useState('');





  const [locationResults, setLocationResults] = useState([]);






{/* sub button below useState...added below if needed... */}

const ButtonWithSubButtons = () => {
const [showSubButtons, setShowSubButtons] = useState(false);

{/* for main button clicking added below if needed...*/}

const handleMainButtonClick = () => {
setShowSubButtons(showSubButtons => !showSubButtons);
};


}


















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

  // Data call – 7-day TMAX for Charlotte station
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
      // scroll into view
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

  // Single day sample
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

  // Search locations -> auto-fetch last 7 days TMAX/TMIN for first match
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
        setLocationDataResults(grouped); // [{date, tmax_c, tmin_c}, ...]
        console.log('Location Data Results:', grouped);
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










{/* 1*/}
{/*modified buttons below for better visibility. jason */}

  {showQueue && (
  <section style={{ marginBottom: '40px' }}>
    <h2 style={{ textAlign: 'center' }}>Pin Locations Below</h2>
    <div className="cta-row">

    {/* first main button below... also can't get first one formatted correctly on buttons*/}
<div>
      <button className="big-queue-button" onClick={toggleMoreSubButtons1}>Charlotte, NC US</button>
    {moreSubButtons1 && (
<div>
    <button className='big-queue-button'>2025-11-27

    Max: 15.3°C

    Min: 11.2°C</button>
    <button className='big-queue-button'>2025-11-28

    Max: 19.3°C

    Min: 13.2°C</button>
    <button className='big-queue-button'> 2025-11-29

     Max: 16.4°C

     Min: 8.2°C</button>
    <button className='big-queue-button'> 2025-11-30

     Max: 11.7°C

     Min: 9.2°C</button>
    <button className='big-queue-button'>2025-12-1

    Max: 12.3°C

    Min: 5.9°C</button>
</div>
)}
    </div>



{/* second main button below...  */}
<div>
      <button className="big-queue-button" onClick={toggleMoreSubButtons2}>Wilmington, NC US</button>
      {moreSubButtons2 && (
      <div>


    <button className='big-queue-button'> 2025-11-27

     Max:11.3°C

     Min: 4.1°C</button>
    <button className='big-queue-button'> 2025-11-28

     Max:13.6°C

     Min:5.5°C</button>
    <button className='big-queue-button'> 2025-11-29

     Max:17.1°C

     Min:6.3°C</button>
    <button className='big-queue-button'> 2025-11-30

     Max:14.5°C

     Min:8.1°C</button>
    <button className='big-queue-button'> 2025-12-1

     Max:12.9°C

     Min:5.2°C</button>
</div>
      )}
      </div>






{/* third main button below...*/}
<div>
      <button className="big-queue-button" onClick={toggleMoreSubButtons3}>Raleigh, NC US</button>
      {moreSubButtons3 && (
      <div>

    <button className='big-queue-button'> 2025-11-27

     Max:11.3°C

     Min:2.9°C</button>
    <button className='big-queue-button'> 2025-11-28

     Max:12.3°C

     Min:5.4°C</button>
    <button className='big-queue-button'> 2025-11-29

     Max:13.7°C

     Min:8.2°C</button>
    <button className='big-queue-button'> 2025-11-30

     Max:11.4°C

     Min:5.2°C</button>
    <button className='big-queue-button'> 2025-12-1

     Max:11.8°C

     Min:7.3°C</button>
</div>


      )}
      </div>







{/* fourth main button below...*/}
<div>
      <button className="big-queue-button" onClick={toggleMoreSubButtons4}>Durham, NC US</button>
      {moreSubButtons4 && (
      <div>

    <button className='big-queue-button'> 2025-11-27

     Max:11.9°C

     Min:6.1°C</button>
    <button className='big-queue-button'> 2025-11-28

     Max:14.4°C

     Min:9.7°C</button>
    <button className='big-queue-button'> 2025-11-29

     Max:11.9°C

     Min:3.8°C</button>
    <button className='big-queue-button'> 2025-11-30

     Max:17.8°C

     Min:8.7°C</button>
    <button className='big-queue-button'> 2025-12-1

     Max:19.2°C

     Min:9.2°C</button>
</div>
)}
</div>



    </div>
  </section>
)}








        <div className="container"><TrendPanel lat={35.2271} lon={-80.8431} days={7} /></div>

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
              details.map((d) => (
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
