/**
 * Deterministically thin dense OSM graphs into a compact, connected driving map.
 * Keep a continuous main-road spine first, then add connected branch roads.
 */
const MAIN = new Set(["motorway","trunk","primary","secondary","tertiary","motorway_link","trunk_link","primary_link","secondary_link","tertiary_link"]);
const BRANCH_PRIORITY = { residential: 0, unclassified: 1, living_street: 2, service: 3 };

export function reduceRoadNetwork(network, options = {}) {
  if (!network?.nodes?.length || !network?.edges?.length) throw new Error("A non-empty road network is required");
  const retainRatio = Math.max(0.2, Math.min(0.8, Number(options.retainRatio ?? 0.4)));
  const nodes = new Map(network.nodes.map(node => [node.id, node]));
  const incident = new Map(network.nodes.map(node => [node.id, []]));
  for (const edge of network.edges) {
    if (!incident.has(edge.fromNodeId) || !incident.has(edge.toNodeId)) continue;
    incident.get(edge.fromNodeId).push(edge);
    incident.get(edge.toNodeId).push(edge);
  }

  // Work only inside the largest source component so the selected map is coherent.
  const seen = new Set(), components = [];
  for (const node of network.nodes) {
    if (seen.has(node.id)) continue;
    const stack = [node.id], componentNodes = new Set(), componentEdges = new Set();
    seen.add(node.id);
    while (stack.length) {
      const id = stack.pop();
      componentNodes.add(id);
      for (const edge of incident.get(id) ?? []) {
        componentEdges.add(edge.id);
        const next = edge.fromNodeId === id ? edge.toNodeId : edge.fromNodeId;
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    components.push({ nodes: componentNodes, edges: componentEdges });
  }
  components.sort((a, b) => b.edges.size - a.edges.size);
  const largest = components[0];
  const sourceEdges = network.edges.filter(edge => largest.edges.has(edge.id));
  const targetCount = Math.max(1, Math.ceil(network.edges.length * retainRatio));
  const byId = new Map(sourceEdges.map(edge => [edge.id, edge]));
  const degree = id => (incident.get(id) ?? []).length;
  const score = edge => {
    const highway = edge.osm?.highway ?? "service";
    const main = MAIN.has(highway) ? 0 : 1;
    const branch = BRANCH_PRIORITY[highway] ?? 4;
    // Longer roads and roads joining busier junctions are preferred.
    const junction = degree(edge.fromNodeId) + degree(edge.toNodeId);
    return [main, branch, -junction, -(edge.lengthM ?? 0), edge.id];
  };
  const compare = (a, b) => {
    const x = score(a), y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return typeof x[i] === "number" ? x[i] - y[i] : String(x[i]).localeCompare(String(y[i]));
    return 0;
  };

  // Preserve the largest connected main-road system in full, including its junctions
  // and alternate paths. This is the route backbone; branches are added afterwards.
  const mainEdges = sourceEdges.filter(edge => MAIN.has(edge.osm?.highway));
  const mainIncident = new Map([...largest.nodes].map(id => [id, []]));
  for (const edge of mainEdges) {
    mainIncident.get(edge.fromNodeId)?.push(edge);
    mainIncident.get(edge.toNodeId)?.push(edge);
  }
  const mainSeen = new Set(), mainComponents = [];
  for (const id of largest.nodes) {
    if (mainSeen.has(id) || !(mainIncident.get(id)?.length)) continue;
    const stack = [id], component = new Map();
    mainSeen.add(id);
    while (stack.length) {
      const current = stack.pop();
      for (const edge of mainIncident.get(current) ?? []) {
        component.set(edge.id, edge);
        const next = edge.fromNodeId === current ? edge.toNodeId : edge.fromNodeId;
        if (!mainSeen.has(next)) { mainSeen.add(next); stack.push(next); }
      }
    }
    mainComponents.push(component);
  }
  mainComponents.sort((a, b) => b.size - a.size);
  const selected = new Map(mainComponents[0] ?? []);
  if (!selected.size) {
    const fallback = sourceEdges.slice().sort(compare)[0];
    selected.set(fallback.id, fallback);
  }
  const frontier = new Map();
  const addFrontier = edge => {
    if (!selected.has(edge.id)) frontier.set(edge.id, edge);
  };
  for (const edge of selected.values()) {
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      for (const candidate of incident.get(nodeId) ?? []) addFrontier(candidate);
    }
  }
  // Add only roads attached to the selected backbone/branches. The selected graph
  // stays connected, while branch roads never replace the continuous main-road spine.
  while (selected.size < Math.min(targetCount, sourceEdges.length) && frontier.size) {
    const next = [...frontier.values()].sort(compare)[0];
    frontier.delete(next.id);
    if (selected.has(next.id)) continue;
    selected.set(next.id, next);
    for (const nodeId of [next.fromNodeId, next.toNodeId]) {
      for (const candidate of incident.get(nodeId) ?? []) addFrontier(candidate);
    }
  }

  const selectedEdges = [...selected.values()];
  const usedNodeIds = new Set(selectedEdges.flatMap(edge => [edge.fromNodeId, edge.toNodeId]));
  const selectedDegree = new Map([...usedNodeIds].map(id => [id, 0]));
  for (const edge of selectedEdges) {
    selectedDegree.set(edge.fromNodeId, selectedDegree.get(edge.fromNodeId) + 1);
    selectedDegree.set(edge.toNodeId, selectedDegree.get(edge.toNodeId) + 1);
  }
  const sourceDegreeValues = [...incident.values()].map(items => items.length);
  const selectedDegreeValues = [...selectedDegree.values()];
  const reduced = {
    ...network,
    nodes: network.nodes.filter(node => usedNodeIds.has(node.id)),
    edges: selectedEdges,
    diagnostics: {
      ...network.diagnostics,
      sourceEdgeCount: network.edges.length,
      retainedEdgeCount: selectedEdges.length,
      retainedEdgeRatio: Number((selectedEdges.length / network.edges.length).toFixed(4)),
      reductionRatio: Number((1 - selectedEdges.length / network.edges.length).toFixed(4)),
      sourceConnectedComponents: components.length,
      sourceDeadEndNodeCount: sourceDegreeValues.filter(value => value === 1).length,
      sourceJunctionNodeCount: sourceDegreeValues.filter(value => value >= 3).length,
      connectedComponents: 1,
      selectedConnectedComponents: 1,
      isolatedNodeCount: 0,
      deadEndNodeCount: selectedDegreeValues.filter(value => value === 1).length,
      junctionNodeCount: selectedDegreeValues.filter(value => value >= 3).length,
      selectionPolicy: "connected-main-spine-with-attached-branches"
    }
  };
  return reduced;
}
