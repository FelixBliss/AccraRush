/**
 * RD-03 road-foundation geometry.
 *
 * Builds metric alignment, carriageway boundaries and lane-centre paths from
 * the RD-02 road model. It preserves the imported centreline; it does not
 * smooth across junctions, infer terrain grades, or create road meshes.
 */
const EPSILON = 1e-6;

const finite = value => typeof value === "number" && Number.isFinite(value);
const distance2D = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const clonePoint = p => ({ x: p.x, y: p.y, z: p.z });

function cleanAlignment(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("A road alignment requires at least two centreline points");
  }
  const clean = [];
  for (const point of points) {
    if (![point?.x, point?.y, point?.z].every(finite)) {
      throw new Error("Road alignment coordinates must be finite metric values");
    }
    const next = clonePoint(point);
    if (!clean.length || distance2D(clean[clean.length - 1], next) > EPSILON) clean.push(next);
  }
  if (clean.length < 2) throw new Error("Road alignment has no measurable horizontal length");
  return clean;
}

function tangentAt(points, index) {
  let before = index - 1, after = index + 1;
  while (before >= 0 && distance2D(points[before], points[index]) <= EPSILON) before--;
  while (after < points.length && distance2D(points[index], points[after]) <= EPSILON) after++;
  if (before < 0) before = index;
  if (after >= points.length) after = index;
  let dx = points[after].x - points[before].x;
  let dz = points[after].z - points[before].z;
  let length = Math.hypot(dx, dz);
  if (length <= EPSILON) {
    const a = points[Math.max(0, index - 1)], b = points[Math.min(points.length - 1, index + 1)];
    dx = b.x - a.x; dz = b.z - a.z; length = Math.hypot(dx, dz);
  }
  if (length <= EPSILON) throw new Error("Road alignment contains an unresolved zero-length tangent");
  return { x: dx / length, z: dz / length };
}

function frameAt(points, index) {
  const tangent = tangentAt(points, index);
  return { ...tangent, leftX: -tangent.z, leftZ: tangent.x };
}

function offsetPoint(point, frame, lateralM) {
  return {
    x: point.x + frame.leftX * lateralM,
    y: point.y,
    z: point.z + frame.leftZ * lateralM
  };
}

function offsetAlignment(points, lateralM, miterLimit = 2.5) {
  return points.map((point, index) => {
    const current = frameAt(points, index);
    if (index === 0 || index === points.length - 1) return offsetPoint(point, current, lateralM);
    const previous = frameAt(points, index - 1), next = current;
    let nx = previous.leftX + next.leftX, nz = previous.leftZ + next.leftZ;
    const normalLength = Math.hypot(nx, nz);
    if (normalLength <= EPSILON) return offsetPoint(point, next, lateralM);
    nx /= normalLength; nz /= normalLength;
    const denominator = Math.abs(nx * next.leftX + nz * next.leftZ);
    const scale = Math.min(Math.abs(lateralM) / Math.max(0.35, denominator), Math.abs(lateralM) * miterLimit);
    const signed = Math.sign(lateralM);
    return { x: point.x + nx * scale * signed, y: point.y, z: point.z + nz * scale * signed };
  });
}

function measureAlignment(points) {
  const cumulative = [0];
  let horizontalLengthM = 0, ascentM = 0, descentM = 0, maxAbsGrade = 0;
  for (let i = 1; i < points.length; i++) {
    const horizontal = distance2D(points[i - 1], points[i]);
    const dy = points[i].y - points[i - 1].y;
    horizontalLengthM += horizontal;
    ascentM += Math.max(0, dy);
    descentM += Math.max(0, -dy);
    if (horizontal > EPSILON) maxAbsGrade = Math.max(maxAbsGrade, Math.abs(dy / horizontal));
    cumulative.push(horizontalLengthM);
  }
  return { cumulativeDistanceM: cumulative, horizontalLengthM, ascentM, descentM, maxAbsGrade };
}

function resolveCrossSection(edge, options) {
  const lanes = Array.isArray(edge.lanes) ? edge.lanes : [];
  if (!lanes.length) throw new Error("RD-03 requires RD-02 lane records; no lane width may be fabricated");
  for (const lane of lanes) {
    if (!finite(lane.widthM) || lane.widthM <= 0 ||
        !["forward", "reverse", "both"].includes(lane.direction)) {
      throw new Error("Every RD-02 lane must have a legal direction and positive metric width");
    }
  }
  const shoulderLeftM = options.shoulderLeftM ?? 0;
  const shoulderRightM = options.shoulderRightM ?? 0;
  const medianWidthM = options.medianWidthM ?? 0;
  if (![shoulderLeftM, shoulderRightM, medianWidthM].every(value => finite(value) && value >= 0)) {
    throw new Error("Cross-section reservations must be finite non-negative metre values");
  }

  const forward = lanes.filter(lane => lane.direction === "forward");
  const reverse = lanes.filter(lane => lane.direction === "reverse");
  const shared = lanes.filter(lane => lane.direction === "both");
  if (shared.length && (forward.length || reverse.length)) {
    throw new Error("Shared bidirectional lanes cannot be mixed with directional lanes in one cross-section");
  }

  const laneOffsets = new Map();
  if (forward.length && reverse.length) {
    let offset = 0;
    for (const lane of forward) {
      laneOffsets.set(lane.id, -(offset + lane.widthM / 2 + medianWidthM / 2));
      offset += lane.widthM;
    }
    offset = 0;
    for (const lane of reverse) {
      laneOffsets.set(lane.id, offset + lane.widthM / 2 + medianWidthM / 2);
      offset += lane.widthM;
    }
  } else if (shared.length) {
    let offset = -shared.reduce((sum, lane) => sum + lane.widthM, 0) / 2;
    for (const lane of shared) {
      laneOffsets.set(lane.id, offset + lane.widthM / 2);
      offset += lane.widthM;
    }
  } else {
    const total = lanes.reduce((sum, lane) => sum + lane.widthM, 0);
    let offset = -total / 2;
    for (const lane of lanes) {
      laneOffsets.set(lane.id, offset + lane.widthM / 2);
      offset += lane.widthM;
    }
  }

  const laneWidthM = lanes.reduce((sum, lane) => sum + lane.widthM, 0);
  const physicalWidthM = laneWidthM + shoulderLeftM + shoulderRightM + medianWidthM;
  return {
    lanes: lanes.map(lane => ({
      laneId: lane.id, direction: lane.direction, widthM: lane.widthM,
      centreOffsetM: laneOffsets.get(lane.id)
    })),
    laneWidthM, shoulderLeftM, shoulderRightM, medianWidthM, physicalWidthM,
    widthProvenance: edge.roadModel?.widthSource ?? "unknown",
    laneLayoutProvenance: edge.roadModel?.laneLayoutSource ?? "unknown"
  };
}

/**
 * @param {object} edge RD-02 edge with ordered centreline and lane records.
 * @param {object} options Explicit shoulder/median reservations and tolerances.
 */
export function buildRoadFoundation(edge, options = {}) {
  if (!edge?.id || !edge?.fromNodeId || !edge?.toNodeId) {
    throw new Error("A road foundation requires stable edge and endpoint node IDs");
  }
  const alignment = cleanAlignment(edge.centerline);
  const crossSection = resolveCrossSection(edge, options);
  const measurements = measureAlignment(alignment);
  if (!(measurements.horizontalLengthM > EPSILON)) throw new Error("Road foundation length must be positive");

  const leftExtentM = crossSection.laneWidthM / 2 + crossSection.shoulderLeftM + crossSection.medianWidthM / 2;
  const rightExtentM = crossSection.laneWidthM / 2 + crossSection.shoulderRightM + crossSection.medianWidthM / 2;
  const leftBoundary = offsetAlignment(alignment, leftExtentM);
  const rightBoundary = offsetAlignment(alignment, -rightExtentM);
  const laneCentrelines = crossSection.lanes.map(lane => ({
    laneId: lane.laneId,
    direction: lane.direction,
    widthM: lane.widthM,
    centreOffsetM: lane.centreOffsetM,
    points: offsetAlignment(alignment, lane.centreOffsetM)
  }));

  const hasVerticalVariation = alignment.some((point, index) =>
    index > 0 && Math.abs(point.y - alignment[index - 1].y) > EPSILON
  );
  const elevationProvenance = options.elevationProvenance ??
    (hasVerticalVariation ? "provided:world-centreline-unverified-source" : "flat:unverified-elevation");
  return {
    schemaVersion: 1,
    edgeId: edge.id,
    physicalRoadId: edge.roadModel?.physicalRoadId ?? null,
    carriagewayId: edge.roadModel?.carriagewayId ?? null,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    coordinateContract: { units: "metres", axes: { lateral: "x", vertical: "y", longitudinal: "z" } },
    alignment,
    measurements,
    elevation: {
      provenance: elevationProvenance,
      verified: Boolean(options.elevationVerified),
      hasVerticalVariation
    },
    crossSection,
    boundaries: { left: leftBoundary, right: rightBoundary },
    laneCentrelines
  };
}

/** Validate a graph-connected pair without silently moving either endpoint. */
export function validateFoundationConnection(a, b, toleranceM = 0.75) {
  if (!finite(toleranceM) || toleranceM < 0) throw new Error("Connection tolerance must be non-negative metres");
  const sharedNode = a?.toNodeId === b?.fromNodeId;
  const aEnd = a?.alignment?.[a.alignment.length - 1];
  const bStart = b?.alignment?.[0];
  if (!sharedNode || !aEnd || !bStart) return { connected: false, reason: "graph-endpoints-do-not-match" };
  const gapM = Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y, aEnd.z - bStart.z);
  return {
    connected: gapM <= toleranceM,
    reason: gapM <= toleranceM ? "within-tolerance" : "endpoint-gap-exceeds-tolerance",
    gapM,
    toleranceM,
    snapped: false
  };
}
