import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';

cytoscape.use(fcose);

// Lays the graph out on a background thread, so the page stays responsive while the (slow,
// CPU-heavy) force-directed algorithm runs. Posts the positions after EACH stage, so the page can
// show a quick draft first and swap in the refined layout when it is ready.
self.onmessage = ({ data }) => {
  const { id, nodes, edges, stages } = data;

  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    style: [{ selector: 'node', style: { width: 'data(size)', height: 'data(size)' } }],
    elements: [
      ...nodes.map((n) => ({ group: 'nodes', data: n })),
      ...edges.map((e, i) => ({ group: 'edges', data: { id: `e${i}`, ...e } })),
    ],
  });

  stages.forEach((quality, index) => {
    const started = performance.now();
    cy.layout({
      name: 'fcose',
      animate: false,
      randomize: true,
      quality,
      nodeSeparation: 75,
      idealEdgeLength: 70,
      packComponents: true,
      padding: 30,
    }).run();

    const ids = nodes.map((n) => n.id);
    const xs = new Float64Array(ids.length);
    const ys = new Float64Array(ids.length);
    ids.forEach((nodeId, i) => {
      const p = cy.getElementById(nodeId).position();
      xs[i] = p.x;
      ys[i] = p.y;
    });
    self.postMessage(
      {
        id,
        stage: quality,
        last: index === stages.length - 1,
        ids,
        xs,
        ys,
        ms: performance.now() - started,
      },
      [xs.buffer, ys.buffer],
    );
  });
};
