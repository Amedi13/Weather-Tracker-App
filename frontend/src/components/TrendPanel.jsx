import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const toF = (c) => (c == null ? null : (c * 9) / 5 + 32);
const toC = (f) => (f == null ? null : (f - 32) * 5 / 9);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

function Bar({ label, value }) {
  return (
    <div className="conf__item">
      <div className="conf__label">
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div className="conf__rail" aria-hidden="true">
        <div
          className="conf__fill"
          style={{ width: `${Math.max(6, (value || 0) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function TrendPanel({ lat, lon, days = 7 }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState("F"); 

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    axios
      .get("/api/trends/", { params: { lat, lon, days } })
      .then(({ data }) => alive && setData(data))
      .catch((e) =>
        alive && setErr(e?.response?.data?.error || "Failed to load trends")
      )
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [lat, lon, days]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.predicted.map((p, i) => {
      const off = data.officialForecast[i];

      const predMax = units === "F" ? r1(toF(p.tMax)) : r1(p.tMax);
      const predMin = units === "F" ? r1(toF(p.tMin)) : r1(p.tMin);

      const offMax =
        off?.tMax != null
          ? units === "F"
            ? r1(off.tMax)
            : r1(toC(off.tMax))
          : null;
      const offMin =
        off?.tMin != null
          ? units === "F"
            ? r1(off.tMin)
            : r1(toC(off.tMin))
          : null;

      return {
        date: p.date,
        predMax,
        predMin,
        predPop: Math.round((p.pop || 0) * 100),
        offMax,
        offMin,
        offPop: off?.pop != null ? Math.round(off.pop * 100) : null,
      };
    });
  }, [data, units]);

  const u = units === "F" ? "°F" : "°C";


  return (
    <section className="panel" aria-busy={loading}>
      <div className="panel__bar">
        <div>
          <h2 className="panel__title">Upcoming {days}-Day Trends</h2>
          {data?.summary && (
            <p className="panel__summary">{data.summary}</p>
          )}
        </div>
        <div className="seg" role="group" aria-label="Units">
          <button
            className={`seg__btn ${units === "F" ? "seg__btn--active" : ""}`}
            onClick={() => setUnits("F")}
            aria-pressed={units === "F"}
          >
            °F
          </button>
          <button
            className={`seg__btn ${units === "C" ? "seg__btn--active" : ""}`}
            onClick={() => setUnits("C")}
            aria-pressed={units === "C"}
          >
            °C
          </button>
        </div>
      </div>

      {loading && (
        <ul className="grid" aria-hidden="true">
          {Array.from({ length: days }).map((_, i) => (
            <li className="card skeleton" key={i} />
          ))}
        </ul>
      )}

      {err && <div className="alert alert--error">Error: {err}</div>}

      {data && (
        <>
          <div className="conf">
            <Bar label="Confidence — Max" value={data.confidence.tMax} />
            <Bar label="Min" value={data.confidence.tMin} />
            <Bar label="Rain" value={data.confidence.pop} />
          </div>

          <ul className="grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((d) => (
              <li className="card" key={d.date} aria-label={`Forecast for ${d.date}`}>
                <header className="card__hd">{d.date}</header>

                <div className="row">
                  <span className="badge">
                    Pred Max: {d.predMax}
                    {u}
                  </span>
                  <span className="badge">
                    Pred Min: {d.predMin}
                    {u}
                  </span>
                  <span className="badge">Pred Rain: {d.predPop}%</span>
                </div>

                <div className="card__sub">Official forecast</div>
                <div className="row">
                  <span className="chip">
                    Max: {d.offMax ?? "—"}
                    {d.offMax != null ? u : ""}
                  </span>
                  <span className="chip">
                    Min: {d.offMin ?? "—"}
                    {d.offMin != null ? u : ""}
                  </span>
                  <span className="chip">
                    Rain: {d.offPop != null ? `${d.offPop}%` : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
