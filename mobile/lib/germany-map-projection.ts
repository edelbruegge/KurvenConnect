// A light coordinate projection for the personal Stadionkarte — no map library, no API key, no
// bitmap map asset. A stadium's latitude/longitude is linearly mapped into a percentage position
// within a bounded rectangular map area; components/stadion/germany-map.tsx renders that same
// 0-100 coordinate space as an SVG viewBox (react-native-svg — a light, Expo Go/web-compatible
// vector library, added specifically so the map can show a recognizable country outline instead of
// a plain rectangle) and both the outline path (buildGermanyOutlinePath below) and the stadium
// markers are projected through the exact same function, so they can never drift apart.
//
// The bounding box is a small, explicit, swappable value (not hardcoded inside the map component
// itself) so a later step could add other countries/regions by passing a different bounds object,
// without touching the projection math.

export type MapBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

// Germany's real, public geographic extent (a bounding box, not a precise border shape).
export const GERMANY_MAP_BOUNDS: MapBounds = {
  minLatitude: 47.27,
  maxLatitude: 55.06,
  minLongitude: 5.87,
  maxLongitude: 15.04,
};

export type ProjectedPoint = {
  xPercent: number;
  yPercent: number;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Projects a stadium's real-world coordinates onto a normalized 0-100% position within `bounds`.
 * Returns null only when latitude/longitude are entirely missing (no coordinates on record yet) —
 * a coordinate that merely falls outside `bounds` is clamped to the nearest edge instead of being
 * dropped, so a marker never silently disappears.
 */
export function projectStadiumToGermanyMap(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  bounds: MapBounds = GERMANY_MAP_BOUNDS,
): ProjectedPoint | null {
  if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  const xPercent = ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * 100;
  // Latitude increases northward, but screen y increases downward — invert.
  const yPercent = ((bounds.maxLatitude - latitude) / (bounds.maxLatitude - bounds.minLatitude)) * 100;

  return { xPercent: clampPercent(xPercent), yPercent: clampPercent(yPercent) };
}

// A hand-authored, deliberately simplified (~100-point) trace of Germany's real border — built
// from public, well-known geography (border towns, capes, bays, river mouths), not traced from a
// vector source file (none exists in this repo) and not survey-precision data. Denser than a
// coarse bounding outline specifically so recognizable features read at this map's scale: the
// Flensburg Fjord/Fehmarn/Darß/Rügen Baltic coast, the Oder river's Polish border, the Erzgebirge/
// Bavarian Forest Czech border, the Berchtesgaden salient and the Alpine arc down to Lake
// Constance, the Rhine-valley French border, the Saarland/Luxembourg/Belgian zigzag, the Kleve
// bulge on the Dutch border, and the East Frisian/Weser/Elbe/Eiderstedt North Sea coast. Goes
// clockwise starting near the Danish border. Rügen is drawn as a proper northward lobe (out along
// its north coast, back along its south coast) rather than a zero-width spike.
export const GERMANY_BORDER_POINTS: { latitude: number; longitude: number }[] = [
  // Schleswig-Holstein / Baltic coast: Flensburg Fjord -> Kiel -> Fehmarn -> Lübeck Bay
  { latitude: 54.83, longitude: 9.43 }, // Flensburg Fjord, Danish border
  { latitude: 54.8, longitude: 9.75 }, // Flensburg Fjord, gentle curve along the coast
  { latitude: 54.7, longitude: 9.92 }, // Gelting Bay
  { latitude: 54.65, longitude: 9.98 }, // Kappeln / Schlei mouth
  { latitude: 54.47, longitude: 9.87 }, // Eckernförde Bay
  { latitude: 54.5, longitude: 10.15 }, // Kiel Fjord, west side
  { latitude: 54.38, longitude: 10.27 }, // Kiel Fjord, east side / Laboe
  { latitude: 54.33, longitude: 10.62 }, // Hohwacht Bay
  { latitude: 54.42, longitude: 10.97 }, // Fehmarn Belt coast (mainland)
  { latitude: 54.53, longitude: 11.13 }, // Fehmarn, north tip
  { latitude: 54.45, longitude: 11.35 }, // Fehmarn, east side
  { latitude: 54.42, longitude: 11.22 }, // Fehmarn, south / Burg
  { latitude: 54.37, longitude: 11.05 }, // Grossenbrode
  { latitude: 54.1, longitude: 10.82 }, // Neustadt Bay
  { latitude: 53.97, longitude: 10.85 }, // Lübeck Bay / Travemünde
  // Mecklenburg coast: Wismar -> Rostock -> Darß -> Rügen -> Usedom -> Polish border
  { latitude: 53.89, longitude: 11.46 }, // Wismar Bay
  { latitude: 53.99, longitude: 11.44 }, // Poel island, coastal bulge
  { latitude: 54.18, longitude: 12.1 }, // Rostock / Warnemünde
  { latitude: 54.47, longitude: 12.52 }, // Darß peninsula, pointed tip
  { latitude: 54.36, longitude: 12.75 }, // Darß, east side
  { latitude: 54.31, longitude: 13.05 }, // Stralsund, mainland before Rügen
  { latitude: 54.35, longitude: 13.1 }, // Rügen causeway
  { latitude: 54.5, longitude: 13.15 }, // Rügen, west coast (outbound, north side of lobe)
  { latitude: 54.68, longitude: 13.43 }, // Rügen, Kap Arkona (north tip)
  { latitude: 54.62, longitude: 13.65 }, // Rügen, north-east
  { latitude: 54.45, longitude: 13.75 }, // Rügen, east side
  { latitude: 54.25, longitude: 13.6 }, // Rügen, south-east (inbound, back toward mainland)
  { latitude: 54.08, longitude: 13.5 }, // Greifswalder Bodden
  { latitude: 53.98, longitude: 13.85 }, // Usedom, west
  { latitude: 53.92, longitude: 14.23 }, // Usedom / Świnoujście, Polish border begins
  // Polish border, south along the Oder/Neisse to the Czech tripoint
  { latitude: 53.75, longitude: 14.28 }, // Oder mouth / Szczecin Lagoon
  { latitude: 53.35, longitude: 14.55 }, // Oder river bend
  { latitude: 53.06, longitude: 14.28 }, // Schwedt
  { latitude: 52.75, longitude: 14.55 }, // Oder river, continued
  { latitude: 52.35, longitude: 14.55 }, // Frankfurt (Oder)
  { latitude: 51.95, longitude: 14.72 }, // Guben
  { latitude: 51.73, longitude: 14.63 }, // Forst
  { latitude: 51.55, longitude: 14.72 }, // Bad Muskau area
  { latitude: 51.15, longitude: 14.98 }, // Görlitz, Neisse / Polish-Czech tripoint
  // Czech border, west through the Erzgebirge and Bavarian Forest to Passau
  { latitude: 50.9, longitude: 14.8 }, // Zittau corner, Czech/Polish tripoint
  { latitude: 50.73, longitude: 13.35 }, // Erzgebirge ridge, east
  { latitude: 50.6, longitude: 12.65 }, // Erzgebirge, west
  { latitude: 50.33, longitude: 12.35 }, // Vogtland
  { latitude: 49.95, longitude: 12.65 }, // Bavarian Forest, north
  { latitude: 49.35, longitude: 12.95 }, // Bavarian Forest, Cham area
  { latitude: 48.95, longitude: 13.45 }, // Bavarian Forest, south
  { latitude: 48.57, longitude: 13.47 }, // Passau, Danube / Austrian border begins
  // Austrian border, along the Alps to the Berchtesgaden salient and west to Lake Constance
  { latitude: 48.35, longitude: 13.2 }, // Danube valley, east
  { latitude: 48.27, longitude: 13.03 }, // Inn river / Simbach
  { latitude: 47.95, longitude: 12.95 }, // Salzburg border, approach
  { latitude: 47.58, longitude: 12.95 }, // Berchtesgaden salient, tip (deep pocket south)
  { latitude: 47.63, longitude: 13.15 }, // Berchtesgaden, east edge
  { latitude: 47.75, longitude: 12.85 }, // back north-west from the salient
  { latitude: 47.65, longitude: 12.45 }, // Chiemgau Alps
  { latitude: 47.58, longitude: 12.15 }, // Inn valley, south
  { latitude: 47.55, longitude: 11.85 }, // Alps, south of Rosenheim
  { latitude: 47.42, longitude: 11.1 }, // Alps, south of Garmisch / Zugspitze
  { latitude: 47.45, longitude: 10.55 }, // Alps, west
  { latitude: 47.55, longitude: 10.2 }, // Allgäu Alps
  { latitude: 47.55, longitude: 9.75 }, // Lindau, Lake Constance, east shore
  // Swiss border, along Lake Constance and west to Basel
  { latitude: 47.65, longitude: 9.48 }, // Lake Constance, south shore
  { latitude: 47.67, longitude: 9.2 }, // Lake Constance, west end
  { latitude: 47.73, longitude: 8.85 }, // Swiss border, Schaffhausen area
  { latitude: 47.62, longitude: 8.55 }, // Swiss border, continued
  { latitude: 47.59, longitude: 7.59 }, // Basel, France/Switzerland tripoint
  // French border, north along the Rhine valley, then inland through Saarland
  { latitude: 48.02, longitude: 7.55 }, // Rhine valley, south (Colmar area)
  { latitude: 48.6, longitude: 7.78 }, // Rhine valley (Strasbourg area)
  { latitude: 48.97, longitude: 8.18 }, // Lauterbourg bend
  { latitude: 49.1, longitude: 7.6 }, // Palatinate, French border
  { latitude: 49.12, longitude: 7.1 }, // Saarland, French border zigzag
  { latitude: 49.2, longitude: 6.95 }, // Saarbrücken area
  { latitude: 49.25, longitude: 6.75 }, // Saarland, west edge
  // Luxembourg and Belgian border, north to Aachen
  { latitude: 49.47, longitude: 6.37 }, // Luxembourg, south
  { latitude: 49.75, longitude: 6.15 }, // Luxembourg, west
  { latitude: 50.05, longitude: 6.03 }, // Luxembourg, north
  { latitude: 50.32, longitude: 6.02 }, // Belgian border, south
  { latitude: 50.62, longitude: 6.1 }, // Eifel / Belgian border
  { latitude: 50.77, longitude: 6.02 }, // Aachen area
  // Dutch border, north to the North Sea (with the Kleve bulge)
  { latitude: 50.87, longitude: 6.02 }, // Dutch border begins, south
  { latitude: 51.05, longitude: 5.95 }, // Dutch border, south
  { latitude: 51.35, longitude: 6.15 }, // Venlo area
  { latitude: 51.6, longitude: 6.1 }, // Dutch border, mid
  { latitude: 51.87, longitude: 5.93 }, // Kleve / Elten, bulge west into the Netherlands
  { latitude: 51.97, longitude: 6.35 }, // back east of the Kleve bulge
  { latitude: 52.15, longitude: 6.75 }, // Bourtange / Emsland, bulge east
  { latitude: 52.45, longitude: 7.05 }, // Emsland
  { latitude: 53.1, longitude: 7.05 }, // Ems river, Dutch border, north
  // North Sea coast, east to the Elbe mouth, then the Eiderstedt peninsula back to Flensburg
  { latitude: 53.35, longitude: 7.2 }, // Dollart Bay / Emden
  { latitude: 53.75, longitude: 7.3 }, // East Frisian coast, north bulge (barrier islands)
  { latitude: 53.7, longitude: 7.85 }, // North Sea coast, continued east
  { latitude: 53.52, longitude: 8.1 }, // Wilhelmshaven / Jade Bay, west
  { latitude: 53.48, longitude: 8.15 }, // Jade Bay, east
  { latitude: 53.58, longitude: 8.13 }, // Wilhelmshaven, north
  { latitude: 53.85, longitude: 8.58 }, // Weser mouth / Bremerhaven
  { latitude: 53.87, longitude: 8.72 }, // Cuxhaven
  { latitude: 53.95, longitude: 8.85 }, // Elbe mouth
  { latitude: 53.98, longitude: 9.0 }, // Elbe, north bank
  { latitude: 53.9, longitude: 9.13 }, // Brunsbüttel
  { latitude: 54.15, longitude: 8.85 }, // Dithmarschen coast
  { latitude: 54.28, longitude: 8.68 }, // Eiderstedt peninsula, gentle west bulge
  { latitude: 54.42, longitude: 8.85 }, // Husum Bay area
  { latitude: 54.62, longitude: 8.8 }, // North Frisian coast
  { latitude: 54.75, longitude: 8.85 }, // Niebüll area
  { latitude: 54.8, longitude: 9.2 }, // back toward Flensburg, closing the loop
];

/**
 * Converts a closed polygon into a smooth closed cubic-Bezier spline through the same points
 * (Catmull-Rom -> Bezier, the standard conversion: for a segment from P1 to P2, the two control
 * points are P1 + (P2-P0)/6 and P2 - (P3-P1)/6, with P0/P3 the neighbouring points, wrapping
 * around for a closed loop). Pure math, no new dependency -- turns the hand-authored point trace
 * into a soft, map-like line instead of a visibly straight-edged polygon, without changing the
 * underlying point data (same coordinates, same shape).
 */
function pointsToSmoothClosedPath(points: ProjectedPoint[]): string {
  if (points.length < 3) {
    return '';
  }

  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];

  let d = `M ${at(0).xPercent} ${at(0).yPercent}`;

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const c1x = p1.xPercent + (p2.xPercent - p0.xPercent) / 6;
    const c1y = p1.yPercent + (p2.yPercent - p0.yPercent) / 6;
    const c2x = p2.xPercent - (p3.xPercent - p1.xPercent) / 6;
    const c2y = p2.yPercent - (p3.yPercent - p1.yPercent) / 6;

    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.xPercent} ${p2.yPercent}`;
  }

  return `${d} Z`;
}

/**
 * Builds an SVG path `d` attribute string tracing GERMANY_BORDER_POINTS through the same
 * projection used for every marker, in the same 0-100 coordinate space (matches the `viewBox="0 0
 * 100 100"` used in components/stadion/germany-map.tsx). A missing/invalid bounds value can never
 * happen here (GERMANY_MAP_BOUNDS is a fixed constant), so this never needs to handle a null
 * projection the way projectStadiumToGermanyMap's caller does for real stadium data.
 */
export function buildGermanyOutlinePath(bounds: MapBounds = GERMANY_MAP_BOUNDS): string {
  const points = GERMANY_BORDER_POINTS.map((point) => projectStadiumToGermanyMap(point.latitude, point.longitude, bounds)).filter(
    (point): point is ProjectedPoint => point !== null,
  );

  return pointsToSmoothClosedPath(points);
}
