export function renderFile(details) {
  return { data: details };
}

export function renderSearch(query, results) {
  return { data: { query, results } };
}

export function renderHealth(report) {
  return { data: report };
}
