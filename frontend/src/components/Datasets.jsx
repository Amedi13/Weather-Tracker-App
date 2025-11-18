import { useEffect, useState } from "react";
import { getDatasets } from "../api/noaa";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getDatasets(20);
        setDatasets(data.results || []);
      } catch (err) {
        setError("Failed to load datasets.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="container panel">
      <h1>Datasets</h1>

      {loading && <p className="muted">Loading datasets…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loading && !error && (
        <div className="cards">
          {datasets.map((d) => (
            <div className="card" key={d.id}>
              <h3>{d.name || d.id}</h3>
              <p>{d.description || "No description available."}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
