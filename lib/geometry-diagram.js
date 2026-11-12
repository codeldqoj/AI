import '../geometry_diagram.js';

export const cleanGeometryDiagram = globalThis.MathAppGeometry.clean;
export const inspectGeometryDiagram = globalThis.MathAppGeometry.inspect;
const str = { type: 'string' }, num = { type: 'number' }, bool = { type: 'boolean' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items });
export const geometrySchema = object({
  isGeometry: bool, caption: str,
  points: list(object({ id: str, x: num, y: num, auxiliary: bool })),
  constructions: list(object({ id: str, type: { type: 'string', enum: ['midpoint', 'projection', 'reflection', 'intersection', 'circumcenter', 'orthocenter', 'onCircle', 'lineCircle', 'circleCircle', 'ratio'] }, points: list(str), parameter: num, auxiliary: bool })),
  segments: list(object({ from: str, to: str, auxiliary: bool })),
  circles: list(object({ center: str, through: str, auxiliary: bool })),
  constraints: list(object({ type: { type: 'string', enum: ['collinear', 'perpendicular', 'parallel', 'equalLength', 'midpoint', 'onCircle'] }, points: list(str) }))
});
export const geometryInstruction = `For a planar geometry problem, provide geometry with isGeometry=true and an accurate coordinate diagram consistent with the STATEMENT and the solution, Prioritize the complete configuration in the statement; add useful auxiliary constructions from the proof only when they can be drawn faithfully. A valid problem diagram need not contain every auxiliary point in a lengthy proof. Use at most 40 labeled points, 80 segments, 12 circles and 100 constraints. Coordinates are finite numbers of magnitude <=10000, in a nondegenerate representative configuration. Labels are ASCII identifiers (A, B, O, H, A1, A'). Circles use center and through point IDs; Every point, construction, segment and circle MUST specify auxiliary=true ONLY when introduced by the SOLUTION and absent from the STATEMENT; auxiliary=false for every object defined or required by the statement, including given midpoints, feet, intersections, circumcenters and orthocenters. A computed/constructed point is not necessarily auxiliary. Do not infer auxiliary status from construction type or from an incident auxiliary line. The renderer colors auxiliary points, their labels, segments and circles red. Include ALL relevant geometric hypotheses and constructions as numerical constraints, never a token unrelated constraint: collinear[A,B,C]; perpendicular[A,B,C,D] for AB perpendicular CD; parallel[A,B,C,D]; equalLength[A,B,C,D]; midpoint[M,A,B]; onCircle[P,O,R] for OP=OR. Prefer constructions over manually rounded derived coordinates. Put ONLY free/base points in points; put each derived point once in constructions, whose entries have id,type,points,parameter,auxiliary. The server computes derived coordinates. Operation signatures: midpoint[A,B]; projection[P,A,B] = foot of P on line AB; reflection[P,A,B]; intersection[A,B,C,D] = AB intersect CD; circumcenter[A,B,C]; orthocenter[A,B,C]; onCircle[O,R] with parameter=angle in DEGREES measured from positive x axis; lineCircle[A,B,O,R] = line AB intersect circle center O through R, parameter=+1 or -1 chooses the direction from the foot along A to B; circleCircle[O,R,P,S] = circles (O,OR) and (P,PS), parameter=+1 chooses the left side of directed OP and -1 the right; ratio[A,B] = A+parameter*(B-A). Use parameter=0 for operations without a parameter. Do not supply placeholder coordinates for constructed points. Use an empty constructions array for legacy coordinates or nongeometry. All labels referred to in segments, circles and constraints must exist in points or constructions. Coordinates must satisfy these constraints within normalized tolerance 0.0001. Do not assume extra symmetries, right angles or equal lengths. Caption in the output language explains the configuration. Do not output SVG, HTML, URLs, code or images. For nongeometry problems or a configuration you cannot faithfully represent (including spatial geometry), use isGeometry=false, empty caption and empty arrays. A diagram is illustrative, never a substitute for proof.`;
// Diagram acceptance is separate from mathematical proof approval.
export function selectGuideGeometry(candidate, audit, repaired, topic = '') {
  const geometry = repaired ? audit.correctedGeometry : candidate.geometry;
  const approved = repaired ? audit.correctedGeometryApproved : audit.geometryApproved;
  return {
    geometryRequested: candidate.geometry?.isGeometry === true || geometry?.isGeometry === true || /hình học|geometry/i.test(topic),
    geometry: approved === true ? cleanGeometryDiagram(geometry) : null
  };
}
