import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { nodeColor, toElements } from '../../models/graph.js';
import { layoutInput, toPositions } from '../../models/layoutPlan.js';
import { requestLayout } from '../../services/layoutClient.js';

cytoscape.use(fcose);

const BIG_GRAPH_EDGES = 600;
const HUGE_GRAPH_NODES = 600;

function buildStyle(edgeCount) {
  // Straight "haystack" lines are much cheaper to draw than curved arrows on big graphs.
  const cheapEdges = edgeCount > BIG_GRAPH_EDGES;
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: '#cdc6b4',
        'font-family': 'monospace',
        'font-size': 9,
        'text-valign': 'bottom',
        'text-margin-y': 3,
        'min-zoomed-font-size': 8, // labels disappear when zoomed out
        'border-width': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': '#8f8a7d',
        opacity: 0.35,
        'curve-style': cheapEdges ? 'haystack' : 'bezier',
        ...(cheapEdges
          ? {}
          : {
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#8f8a7d',
              'arrow-scale': 0.6,
            }),
      },
    },
    // Call links: dashed bronze lines, hidden until switched on.
    {
      selector: 'edge.call',
      style: {
        display: 'none',
        'line-color': '#b07a42',
        'line-style': 'dashed',
        'curve-style': 'straight',
        'target-arrow-shape': 'none',
        opacity: 0.55,
      },
    },
    { selector: 'edge.call.show', style: { display: 'element' } },
    { selector: '.dimmed, .hover-faded', style: { opacity: 0.08 } },
    {
      selector: 'edge.active, edge.hover-active',
      style: { 'line-color': '#c9a24b', 'target-arrow-color': '#c9a24b', width: 2, opacity: 1 },
    },
    { selector: 'node.selected', style: { 'border-width': 3, 'border-color': '#f1ebdb' } },
    // Circular imports: a ring on every file in a cycle, a red path for the chosen cycle.
    { selector: 'node.cyc-mark', style: { 'border-width': 2, 'border-color': '#b0304a' } },
    {
      selector: 'node.cyc-active',
      style: { 'border-width': 3, 'border-color': '#b0304a', opacity: 1 },
    },
    {
      selector: 'edge.cyc-active',
      style: { 'line-color': '#b0304a', 'target-arrow-color': '#b0304a', width: 2.5, opacity: 1 },
    },
    // Blast radius: files that could break, in bronze.
    { selector: 'node.blast', style: { 'border-width': 3, 'border-color': '#b07a42', opacity: 1 } },
    {
      selector: 'edge.blast-active',
      style: { 'line-color': '#b07a42', 'target-arrow-color': '#b07a42', width: 2, opacity: 1 },
    },
  ];
}

// The files an edge-highlight should include: the file, plus whatever it is linked to. Call links
// only count while they are switched on, so a hidden dashed line never lights up a neighbour.
function neighbourhood(node, showCalls) {
  const edges = node.connectedEdges().filter((e) => showCalls || !e.hasClass('call'));
  return edges.connectedNodes().union(edges).union(node);
}

export default function GraphView({
  graph,
  colors,
  hideIsolated,
  selectedId,
  onSelect,
  fitSignal,
  colorMode,
  heat,
  showCalls,
  showCycles,
  cycleHighlight,
  blastIds,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const showCallsRef = useRef(showCalls);
  const paintRef = useRef({ colorMode, heat });
  const [laidOut, setLaidOut] = useState(false);

  // Keep the latest values for code that runs outside React renders (Cytoscape events, and the
  // rebuild below, which must not re-run just because a colour changed).
  useEffect(() => {
    onSelectRef.current = onSelect;
    showCallsRef.current = showCalls;
    paintRef.current = { colorMode, heat };
  }, [onSelect, showCalls, colorMode, heat]);

  // Create the Cytoscape instance once.
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      minZoom: 0.05,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      textureOnViewport: true, // draw a cached image while panning/zooming
      hideEdgesOnViewport: true,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => onSelectRef.current(event.target.id()));
    cy.on('tap', (event) => {
      if (event.target === cy) onSelectRef.current(null);
    });
    cy.on('mouseover', 'node', (event) => {
      const hood = neighbourhood(event.target, showCallsRef.current);
      cy.elements().not(hood).addClass('hover-faded');
      hood.edges().addClass('hover-active');
    });
    cy.on('mouseout', 'node', () => cy.elements().removeClass('hover-faded hover-active'));

    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Rebuild the graph when the data or the filter changes. The layout runs once and the
  // positions are then fixed, so panning never triggers physics again.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return undefined;
    setLaidOut(false);

    const elements = toElements(graph, { hideIsolated, colors, ...paintRef.current });
    cy.batch(() => {
      cy.elements().remove();
      cy.style(buildStyle(graph.edges.length));
      cy.add(elements);
    });

    const nodeCount = elements.filter((e) => e.group === 'nodes').length;
    // One layout, same quality as before, so the map looks exactly as it always did.
    const stages = [nodeCount > HUGE_GRAPH_NODES ? 'draft' : 'default'];
    let timer = null;

    // Fallback when a background thread is not available: lay out here, after a tick so the
    // "laying out" message can paint first. This blocks the page while it runs.
    const layoutOnMainThread = () => {
      timer = setTimeout(() => {
        cy.layout({
          name: 'fcose',
          animate: false,
          randomize: true,
          quality: nodeCount > HUGE_GRAPH_NODES ? 'draft' : 'default',
          nodeSeparation: 75,
          idealEdgeLength: 70,
          packComponents: true,
          padding: 30,
        }).run();
        cy.fit(undefined, 30);
        setLaidOut(true);
      }, 30);
    };

    // Preferred: lay out on a worker thread, so the page does not freeze while it runs.
    const request = requestLayout(layoutInput(elements), stages, (msg) => {
      if (msg.error) {
        layoutOnMainThread();
        return;
      }
      const positions = toPositions(msg.ids, msg.xs, msg.ys);
      cy.layout({ name: 'preset', positions: (n) => positions[n.id()], fit: false }).run();
      cy.fit(undefined, 30);
      setLaidOut(true);
      request.done();
    });

    if (!request) layoutOnMainThread();

    return () => {
      clearTimeout(timer);
      request?.cancel();
    };
  }, [graph, colors, hideIsolated]);

  // Folder colours <-> heat colours. Only the colour changes; the layout is untouched.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !laidOut) return;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const node = byId.get(n.id());
        if (node) n.data('color', nodeColor(node, { colors, colorMode, heat }));
      });
    });
  }, [graph, colors, colorMode, heat, laidOut]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !laidOut) return;
    cy.edges('.call').toggleClass('show', showCalls);
  }, [showCalls, laidOut]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !laidOut) return;
    cy.nodes('.in-cycle').toggleClass('cyc-mark', showCycles);
  }, [showCycles, laidOut]);

  // One highlight at a time: a chosen cycle wins over blast radius, which wins over the plain
  // "file and its neighbours" highlight.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !laidOut) return;
    cy.elements().removeClass('dimmed active selected cyc-active blast blast-active');

    if (cycleHighlight) {
      const members = cy.nodes().filter((n) => cycleHighlight.has(n.id()));
      if (members.empty()) return;
      const inside = members.edgesWith(members).filter((e) => !e.hasClass('call'));
      cy.elements().not(members.union(inside)).addClass('dimmed');
      members.addClass('cyc-active');
      inside.addClass('cyc-active');
      cy.animate({ fit: { eles: members, padding: 80 }, duration: 250 });
      return;
    }

    if (!selectedId) return;
    const node = cy.getElementById(selectedId);
    if (node.empty()) return; // not in the graph, e.g. a README or a hidden unlinked file

    if (blastIds) {
      const affected = cy.nodes().filter((n) => blastIds.has(n.id()));
      const group = affected.union(node);
      const edges = group.edgesWith(group).filter((e) => !e.hasClass('call'));
      cy.elements().not(group.union(edges)).addClass('dimmed');
      affected.addClass('blast');
      edges.addClass('blast-active');
    } else {
      // Highlight the file and the files it touches, dim the rest of the map.
      const hood = neighbourhood(node, showCalls);
      cy.elements().not(hood).addClass('dimmed');
      hood.edges().addClass('active');
    }
    node.addClass('selected');
    cy.animate({ center: { eles: node }, duration: 200 });
  }, [selectedId, laidOut, cycleHighlight, blastIds, showCalls]);

  useEffect(() => {
    if (fitSignal > 0) cyRef.current?.fit(undefined, 30);
  }, [fitSignal]);

  return (
    <div className="graph-view">
      <div ref={containerRef} className="graph-view__canvas" aria-label="Dependency graph" />
      {!laidOut && (
        <div className="graph-view__overlay" role="status">
          Laying out {graph.nodes.length.toLocaleString('en-US')} files…
        </div>
      )}
    </div>
  );
}
