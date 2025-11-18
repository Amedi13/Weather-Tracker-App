export default function DatasetsPage() {
  const [datasets, setDatasets] = useState([]);
  const [selectedData, setSelectedData] = useState(null);

  useEffect(() => {
    getDatasets(5)
      .then((data) => setDatasets(data.results || []))
      .catch((err) => console.error(err));
  }, []);

  const loadDatasetData = async (datasetid) => {
    try {
      const res = await getObservations({
        datasetid,
        stationid: "GHCND:USW00013881",
        startdate: "2024-01-01",
        enddate: "2024-01-07",
      });

      setSelectedData(res.results || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container">
      <h1>Datasets</h1>

      <div className="cards">
        {datasets.map((d) => (
          <div className="card" key={d.id}>
            <h3>{d.name}</h3>
            <p>ID: {d.id}</p>
            <button className="btn primary" onClick={() => loadDatasetData(d.id)}>
              Load Data
            </button>
          </div>
        ))}
      </div>

      {selectedData && (
        <div className="panel">
          <h2>Dataset Observations</h2>
          <pre>{JSON.stringify(selectedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
