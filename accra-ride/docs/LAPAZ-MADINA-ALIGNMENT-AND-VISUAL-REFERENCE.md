# Lapaz–Madina corridor: alignment and visual verification

## Route authority

- User-supplied Google Maps route: https://maps.app.goo.gl/b6SrB58oqnqNQLzX8?g_st=ac
- Google Maps primary route shown: **18.7 km**, via **N1 and J.J. Rawlings Avenue / Legon East Road / N4**.
- Start: Lapaz, 5.6095075, -0.2507539.
- Destination: Madina, 5.6731273, -0.1663851.
- This is an open point-to-point driving corridor. It must not be closed into a circuit or connected to unrelated regional roads.

## OSM-derived road sections

The route builder selects legal directed OSM edges between the two supplied endpoints. The generated `lapaz-madina-sections.json` is the authoritative section inventory: it groups contiguous route edges by source road name and highway class and records OSM way IDs, node coordinates, lane-layout variants, bridge/tunnel tags, junction nodes and matched infrastructure features.

The known road-name sequence in the route manifest is:

1. Mampon Okai Avenue — local Lapaz access.
2. George Walker Bush Highway (N1) — main west/east highway corridor.
3. Kwame Nkrumah Motorway — short mapped connection in the Tetteh Quarshie approach.
4. Tetteh Quarshie Interchange — ramp and connector geometry.
5. J.J. Rawlings Avenue (N4) — Tetteh Quarshie–Madina arterial.
6. Chief Alhaji Seidu Street — Madina approach.
7. New Road — final local approach to the Madina endpoint.

Unnamed connector edges remain in the section inventory; they must not be silently deleted or replaced by straight-line joins. The exact sequence and lengths must be read from the latest generated section JSON, not from this summary alone.

## Road arrangement and infrastructure evidence

### Lapaz / N1 entry

- A recent, geolocated Lapaz intersection photograph (24 June 2026; 5.606583, -0.248981) shows the local urban junction context, signal heads, zebra crossing, mixed traffic, pedestrians and commercial frontage.
- The Accra Metropolitan Assembly's *Accra Road Safety Report 2024* documents remarking on George Walker Bush Highway (N1), and crash-barrier installations on the Lapaz section; its photo caption also identifies a pedestrian footbridge.
- Render the N1 as a divided, multi-lane highway where the OSM carriageway pairing and lane model support it. Do not convert the entire Lapaz approach into a motorway cross-section.

### Tetteh Quarshie Interchange

- The interchange connects George Walker Bush Highway, J.J. Rawlings Avenue, Liberation Road and the Accra–Tema Motorway.
- A geolocated Wikimedia Commons photograph at 5.620682, -0.176495 shows the interchange and its approach geometry. It is dated 4 August 2016, so it is a structural reference, not proof of today's roadside condition.
- Preserve distinct ramps and grade-separated connections. Do not create at-grade junction patches between roads that merely cross at different levels.
- OSM bridge/layer tags are structural evidence, but they do not provide metric deck elevations. The current renderer keeps imported y values rather than inventing bridge heights.

### J.J. Rawlings Avenue / N4 to Madina

- The Ghana Audit Service performance audit identifies the Tetteh Quarshie–Madina section as 4.6 km of asphalt-surfaced, three-lane dual carriageway, with sidewalks, bicycle lanes, drainage, and interchanges at University of Ghana, Legon and Atomic Junction.
- The report includes photographs of the Shiashie section, the Legon underpass and the Atomic Junction flyover.
- Wikimedia Commons has geolocated photographs of the Shiashie section and overhead pedestrian bridge. The 2016 images are useful for structure placement, not for current advertising, landscaping or traffic.
- Keep the road's divided-carriageway form and the actual mapped junction/service-road connections. Do not simplify the N4 into one undivided two-way strip.

## Renderer rules

- Road centreline geometry comes from the OSM network; lane widths and legal directions come from RD-02 lane records.
- Central medians are generated only when the OSM importer has conservatively paired two opposing one-way carriageways and their measured separation leaves a physical median gap after both carriageway widths are accounted for.
- Junction surfaces are created only at shared OSM nodes. Grade-separated crossings must not be welded into one at-grade junction.
- Bridge decks and parapets are rendered only for OSM bridge-tagged edges. Until metric elevation data is supplied, bridge heights remain unverified and must not be presented as surveyed.
- Signs, traffic signals, crossings, bus stops, street lamps and barriers are limited to OSM features matched to the selected corridor or to explicitly referenced visual evidence.
- AI traffic must use legal outbound and return directions; it must not wrap or teleport at either open endpoint.

## Real-world visual references

1. Lapaz intersection, N1 Road (IMG 7049), Efo Komla, 24 June 2026, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Lapaz_intersection,_N1_Road_(IMG_7049).jpg
2. Tetteh Quarshie Interchange 2, Masssly, 4 August 2016, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Tetteh_Quarshie_Interchange_2.jpg
3. Overhead bridge at Shiashie, Masssly, 31 July 2016, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Overhead_bridge_at_Shiashie.jpg
4. Accra Metropolitan Assembly, *Accra Road Safety Report 2024* (August 2025): https://www.ama.gov.gh/documents/Accra_Road_Safety_Report%2C_2024_Final.pdf
5. Ghana Audit Service, *Performance Audit Report on Tetteh Quarshie to Madina Road* (28 November 2019): https://audit.gov.gh/files/audit_reports/Performance_Audit_Report_of_the_Auditor_On_%281%29_Tetteh_Quarshie_To_Madina_Road%3B_%282%29_Ayamfuri_to_New_Obuase_Road%3B_and_%283%29_The_Bolgatanga%2C_Bawku_to_Polimakom_Road.pdf
6. Google, Ghana Street View imagery update announcement (17 June 2026): https://blog.google/intl/en-africa/products/explore-get-answers/experience-the-vibrant-beauty-of-ghana-like-never-before-with-updated-street-view/

## Acceptance gates

- Route geometry follows the Google Maps N1 → Tetteh Quarshie → N4 corridor and remains close to the 18.7 km primary route length.
- Every section has connected source OSM edges, real start/end coordinates, lane-layout provenance and feature counts.
- Both traffic directions are legal and continuous.
- No unverified road, median, sign, bridge elevation or junction is fabricated.
- Browser gameplay smoke must drive the entire route and return route without a route-end teleport.
- Capture screenshots at Lapaz/N1, Tetteh Quarshie, Shiashie/Legon and Madina. Compare those views against the geolocated references above before declaring visual fidelity complete.
