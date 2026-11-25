/**
 * Creates connected, drivable one-way bus-stop lay-bys from matched OSM stops.
 * Each access road is an alternate directed edge between the source road
 * segment's existing endpoint nodes, with entry/exit tapers and a parallel bay.
 */
const laneWidth = edge => Math.max(3, (edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 3.5), 0));
const shoulderWidth = edge => ({
  motorway: 1.0, motorway_link: 0.55, trunk: 0.9, trunk_link: 0.55,
  primary: 0.65, primary_link: 0.45, secondary: 0.45, secondary_link: 0.35,
  tertiary: 0.3, tertiary_link: 0.25, residential: 0.2, unclassified: 0.2, service: 0.15
}[edge.osm?.highway] ?? 0);

function polylineMetrics(points) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  return { cumulative, length: cumulative.at(-1) };
}

function sampleAt(points, cumulative, distance) {
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < distance) i++;
  const a = points[i - 1], b = points[i], span = cumulative[i] - cumulative[i - 1];
  const t = span > 0 ? (distance - cumulative[i - 1]) / span : 0;
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
  return {
    x: a.x + dx * t, y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
    z: a.z + dz * t, leftX: -dz / length, leftZ: dx / length
  };
}

export function buildBusStopAccessEdges(network, matchedFeatures) {
  const edges = [], seen = new Set(), skipped = { shortEdge: 0, stopTooNearJunction: 0, missingAnchor: 0, duplicateEdge: 0 };
  for (const feature of matchedFeatures || []) {
    if (feature.kind !== "bus_stop" || !feature.roadAnchor || !feature.edgeId) continue;
    const source = network.edges.find(edge => edge.id === feature.edgeId);
    if (!source || source.centerline?.length < 2) { skipped.missingAnchor++; continue; }
    if (seen.has(source.id)) { skipped.duplicateEdge++; continue; }
    const { cumulative, length } = polylineMetrics(source.centerline);
    if (length < 62) { skipped.shortEdge++; continue; }
    const bayLength = 28, taperLength = 12, halfEnvelope = bayLength / 2 + taperLength;
    const anchorM = feature.roadAnchor.alongM;
    if (!Number.isFinite(anchorM) || anchorM < halfEnvelope + 2 || anchorM > length - halfEnvelope - 2) {
      skipped.stopTooNearJunction++; continue;
    }
    const sourceDirections = new Set((source.lanes || []).map(lane => lane.direction));
    const direction = sourceDirections.has("forward") && sourceDirections.has("reverse")
      ? (feature.side < 0 ? "forward" : "reverse")
      : sourceDirections.has("forward") ? "forward" : "reverse";
    const sideSign = feature.side >= 0 ? 1 : -1;
    const roadOffset = laneWidth(source) / 2 + shoulderWidth(source) + 0.75 + 1.75;
    const start = anchorM - halfEnvelope, fullStart = start + taperLength;
    const fullEnd = fullStart + bayLength, end = fullEnd + taperLength;
    const distances = [...new Set([0, ...cumulative, start, fullStart, fullEnd, end, length]
      .filter(value => value >= 0 && value <= length))].sort((a, b) => a - b);
    const centerline = distances.map(distance => {
      const point = sampleAt(source.centerline, cumulative, distance);
      const offset = distance < start ? 0
        : distance < fullStart ? roadOffset * (distance - start) / taperLength
        : distance < fullEnd ? roadOffset
        : distance < end ? roadOffset * (end - distance) / taperLength : 0;
      return {
        x: point.x + point.leftX * sideSign * offset,
        y: point.y,
        z: point.z + point.leftZ * sideSign * offset
      };
    });
    const id = "accrarush-bus-bay-" + String(feature.id).replace(/[^a-zA-Z0-9_-]/g, "-");
    const bayLengthM = polylineMetrics(centerline).length;
    edges.push({
      id,
      lengthM: bayLengthM,
      fromNodeId: source.fromNodeId,
      toNodeId: source.toNodeId,
      centerline,
      lanes: [{ id: id + "-lane", direction, widthM: 3.5 }],
      osm: { highway: "service", name: "Bus Stop Bay", oneway: "yes", lanes: "1" },
      selection: { role: "bus-stop-bay", sourceWayId: source.selection?.sourceWayId ?? source.id, sourceEdgeId: source.id },
      roadModel: { groupingSource: "accrarush:bus-stop-access", facilityType: "bus-stop-layby", shoulderLeftM: 0, shoulderRightM: 0 },
      facility: { type: "bus-stop-layby", featureId: feature.id, entryTaperM: taperLength, bayLengthM: bayLength, exitTaperM: taperLength, direction, side: feature.side, anchorAlongM: anchorM }
    });
    seen.add(source.id);
    feature.accessBay = true;
  }
  return {
    edges,
    report: {
      matchedBusStops: (matchedFeatures || []).filter(feature => feature.kind === "bus_stop").length,
      generatedBays: edges.length,
      drivableEntryExitConnections: edges.length * 2,
      skipped
    }
  };
}

export function buildPickupAccessEdges(network, matchedFeatures) {
  const edges = [], seen = new Set();
  const occupied = new Map();
  for (const edge of network.edges.filter(item => item.selection?.role === "bus-stop-bay")) {
    const list = occupied.get(edge.selection.sourceEdgeId) || [];
    list.push({ side: edge.facility?.side, anchorAlongM: edge.facility?.anchorAlongM });
    occupied.set(edge.selection.sourceEdgeId, list);
  }
  const skipped = { shortEdge: 0, stopTooNearJunction: 0, missingAnchor: 0, duplicateEdge: 0, busBayAlreadyPresent: 0, wrongSideOfOneWay: 0 };
  for (const feature of matchedFeatures || []) {
    if (feature.kind !== "pickup_zone" || !feature.roadAnchor || !feature.edgeId) continue;
    const source = network.edges.find(edge => edge.id === feature.edgeId);
    if (!source || source.centerline?.length < 2) { skipped.missingAnchor++; continue; }
    const existingBays = occupied.get(source.id) || [];
    const sameSideTooClose = existingBays.some(bay => bay.side === feature.side &&
      Number.isFinite(bay.anchorAlongM) && Math.abs(bay.anchorAlongM - feature.roadAnchor.alongM) < 60);
    if (sameSideTooClose) { skipped.busBayAlreadyPresent++; continue; }
    const sourceDirections = new Set((source.lanes || []).map(lane => lane.direction));
    if (existingBays.some(bay => bay.side !== feature.side) && sourceDirections.size === 1) {
      skipped.wrongSideOfOneWay++; continue;
    }
    if (seen.has(source.id)) { skipped.duplicateEdge++; continue; }
    const { cumulative, length } = polylineMetrics(source.centerline);
    if (length < 50) { skipped.shortEdge++; continue; }
    const bayLength = 18, taperLength = 10, envelope = bayLength / 2 + taperLength;
    const anchorM = feature.roadAnchor.alongM;
    if (!Number.isFinite(anchorM) || anchorM < envelope + 2 || anchorM > length - envelope - 2) {
      skipped.stopTooNearJunction++; continue;
    }
    const directions = sourceDirections;
    const direction = directions.has("forward") && directions.has("reverse")
      ? (feature.side < 0 ? "forward" : "reverse")
      : directions.has("forward") ? "forward" : "reverse";
    const sideSign = feature.side >= 0 ? 1 : -1;
    const roadOffset = laneWidth(source) / 2 + shoulderWidth(source) + 0.65 + 1.6;
    const start = anchorM - envelope, fullStart = start + taperLength;
    const fullEnd = fullStart + bayLength, end = fullEnd + taperLength;
    const distances = [...new Set([0, ...cumulative, start, fullStart, fullEnd, end, length]
      .filter(value => value >= 0 && value <= length))].sort((a, b) => a - b);
    const centerline = distances.map(distance => {
      const point = sampleAt(source.centerline, cumulative, distance);
      const offset = distance < start ? 0
        : distance < fullStart ? roadOffset * (distance - start) / taperLength
        : distance < fullEnd ? roadOffset
        : distance < end ? roadOffset * (end - distance) / taperLength : 0;
      return { x: point.x + point.leftX * sideSign * offset, y: point.y,
        z: point.z + point.leftZ * sideSign * offset };
    });
    const id = "accrarush-pickup-bay-" + String(feature.id).replace(/[^a-zA-Z0-9_-]/g, "-");
    edges.push({
      id, lengthM: polylineMetrics(centerline).length,
      fromNodeId: source.fromNodeId, toNodeId: source.toNodeId, centerline,
      lanes: [{ id: id + "-lane", direction, widthM: 3.2 }],
      osm: { highway: "service", name: "Pickup / Drop-off Bay", oneway: "yes", lanes: "1" },
      selection: { role: "pickup-bay", sourceWayId: source.selection?.sourceWayId ?? source.id, sourceEdgeId: source.id },
      roadModel: { groupingSource: "accrarush:pickup-access", facilityType: "pickup-dropoff-bay", shoulderLeftM: 0, shoulderRightM: 0 },
      facility: { type: "pickup-dropoff-bay", featureId: feature.id, entryTaperM: taperLength,
        bayLengthM: bayLength, exitTaperM: taperLength, direction, side: feature.side }
    });
    seen.add(source.id);
    feature.accessBay = true;
    feature.accessBayType = "pickup";
  }
  return {
    edges,
    report: {
      matchedPickupZones: (matchedFeatures || []).filter(feature => feature.kind === "pickup_zone").length,
      mappedPickupZones: (matchedFeatures || []).filter(feature => feature.kind === "pickup_zone" && !feature.authored).length,
      authoredPickupZones: (matchedFeatures || []).filter(feature => feature.kind === "pickup_zone" && feature.authored).length,
      generatedBays: edges.length,
      drivableEntryExitConnections: edges.length * 2,
      skipped
    }
  };
}
