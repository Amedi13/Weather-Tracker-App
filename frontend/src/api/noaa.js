import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000", // Django dev server
  timeout: 10000,
});

export const getDatasets = async (limit = 5) => {
  const { data } = await axios.get(`/api/datasets/`, { params: { limit } });
  return data;
};

export const getObservations = async (params) => {
  const { data } = await axios.get(`/api/data/`, { params });
  return data;
};