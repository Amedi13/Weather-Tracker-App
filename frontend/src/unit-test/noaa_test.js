// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
// src/api/noaa.test.js
import MockAdapter from "axios-mock-adapter";
import { api, getDatasets, getObservations, search_locations } from "./noaa";

describe("noaa api helpers", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(api); });
  afterEach(() => { mock.restore(); });

  test("getDatasets hits /api/datasets/ with limit", async () => {
    mock.onGet("/api/datasets/", { params: { limit: 3 } })
        .reply(200, { results: [{ id: "GHCND" }] });

    const res = await getDatasets(3);
    expect(res.results).toHaveLength(1);
  });

  test("getObservations passes params object through", async () => {
    const params = { datasetid: "GHCND", limit: 2 };
    mock.onGet("/api/data/", { params }).reply(200, { results: [1, 2] });

    const res = await getObservations(params);
    expect(res.results).toEqual([1, 2]);
  });

  test("search_locations normalizes string into { q }", async () => {
    mock.onGet("/api/locations/", { params: { q: "Charlotte" } })
        .reply(200, { results: [{ id: "CITY:US370016", name: "Charlotte, NC, US" }] });

    const res = await search_locations("Charlotte");
    expect(res.results[0].name).toMatch(/Charlotte/);
  });

  test("search_locations defaults to {}", async () => {
    mock.onGet("/api/locations/", { params: {} })
        .reply(200, { results: [] });

    const res = await search_locations();
    expect(res.results).toEqual([]);
  });
});
