# mysabak — Real Map Plan (draft)

_Status: draft · Last updated: 12 Oct 2026_

> **Demo decision (12 Oct 2026, updated):** Geoapify (OpenStreetMap data) missed many Cebu places, and Google Maps Platform needs a non-prepaid credit card. The demo now runs on **TomTom** with one free key and no card: TomTom map style (drawn with MapLibre), Places Search API (search), Reverse Geocoding API (pickup address) and Routing API (routes). Free each month: 10,000 place suggestions, 20,000 address lookups, 20,000 routes, 200,000 map tiles. A backend and server-side fares come after the proposal is approved.

Goal: replace the illustrated SVG map in the ride screen with a real, working map, while keeping costs near zero. mysabak's promise is **no booking fees and no hidden charges**, so map costs need to stay low.

---

## 1. What a "real map" needs

| Piece | What it does in the app | Where it shows up |
|---|---|---|
| **Map display (tiles)** | Real streets, zoom, drag, pins | The background of the whole screen |
| **Place search (geocoding)** | "Where to?" suggestions as you type; turning GPS into "[Street, barangay]" | Search box, pickup label |
| **Routing** | Real distance and travel time → fare | Route line, `[Distance]`, `[Travel time]`, `[FARE]` |
| **Device location** | "Current location" | Built into every browser (free) |

---

## 2. Is OpenStreetMap free?

**The data is free. OSM's own servers are not for apps like ours.**

- **OSM data:** free for anyone, including commercial use. Two conditions apply:
  - Show the "© OpenStreetMap contributors" credit.
  - If we ever redistribute an improved copy of the map *data*, share it under the same licence (ODbL).
- **OSM's own servers:** run on donations, with no guarantees.
  - **Map tiles (tile.openstreetmap.org):** capacity is limited, offline/"save area" features are banned, and access can be blocked without notice. Commercial services are specifically warned that access may be withdrawn.
  - **Search (Nominatim):** at most 1 request per second, and search-as-you-type is strictly forbidden.
  - **Routing (OSRM demo):** at most 1 request per second, non-commercial use only.

**So:** we use OSM *data* through a service built for apps (OpenFreeMap, Geoapify, Mapbox), or we host it ourselves. We never point the live app at OSM's own servers.

---

## 3. Options compared

| | **A. Open-source**<br>MapLibre + OpenFreeMap (+ Geoapify) | **B. Mapbox** | **C. Google Maps** |
|---|---|---|---|
| Map display | Free, unlimited, no API key | 50,000 loads/mo free, then $5 / 1,000 | 10,000 loads/mo free, then $7 / 1,000 |
| Search | Geoapify: 3,000 requests/day free (shared) | 25,000/mo free | 10,000/mo free, then $2.83 / 1,000 |
| Routing | Geoapify (shared quota) or self-hosted | 100,000/mo free, then $2 / 1,000 | 10,000/mo free, then $5 / 1,000 |
| Cebu address quality | Weakest (OSM data) | Medium | Best |
| Guarantee | None (donation-funded) | Paid plans | Paid plans |
| Works with plain JS, no build step | Yes (CDN) | Yes (CDN) | Yes (script tag) |

Example: at 30,000 sessions a month, map loads alone cost about **$140/month on Google** and **$0** on Mapbox or OpenFreeMap.

Google's $200 monthly credit ended in March 2025. Google now gives a set number of free calls per service each month instead.

---

## 4. Recommendation

1. **Map display:** MapLibre GL JS + OpenFreeMap tiles. Free, needs no key, and loads from a CDN, so there's no build step.
2. **Search and routing go through our own small backend**, never straight from the browser:
   - API keys stay private.
   - We can switch provider (Geoapify → Google → self-hosted) without touching the app.
   - We can cache repeated searches to save quota.
3. **Fares are calculated on the server.** The browser only displays them. Otherwise a user could edit the JavaScript and change the price.
4. **Test search quality first.** If barangay-level search in Cebu is poor on Geoapify, use **Google for search only** and keep the free map. Check Google's terms on showing its place results over a non-Google map before doing this.

**Fallback if OpenFreeMap ever goes down:** switch the map style URL to MapTiler or Mapbox. It's a one-line change.

---

## 5. Phases

### Phase 0 · Decide (about 1 day)
- [ ] Test 20+ real Cebu addresses (malls, barangays, subdivisions) on Geoapify and on Google; note the misses.
- [ ] Set fares for Motor / Sedan / SUV: base ₱[AMOUNT] + ₱[AMOUNT] per km.
- [ ] Choose the backend (see open questions).

### Phase 1 · Real map (no backend needed)
- [ ] `html/index.html`: add MapLibre CSS and JS from a CDN; replace the drawn map with a real map container.
- [ ] `scripts/index.js`: replace my drawing code (view, zoom, drag and marker positioning) with MapLibre's built-in versions.
  - Pickup dot, current-location ring, destination pin and labels become `maplibregl.Marker`s (reuse the existing markup).
  - The route becomes a line layer drawn in the brand purple with a white outline.
- [ ] Locate button → phone GPS (`navigator.geolocation`) + fly the map to that point. Handle "permission denied" with a friendly message.
- [ ] "Pick on map" → a real map tap. Drop the pin and continue to vehicle selection.
- [ ] Restyle the map: soft lavender ground, green parks, white roads, to match Design A.
- [ ] `html/sw.js`: don't save map tiles in the offline cache, which would grow without limit.
- [ ] `css/index.css`: remove the old drawn-map styles; style MapLibre's attribution and controls to match.

### Phase 2 · Search
- [ ] Suggestion dropdown under "Where to?": waits until the user pauses typing (about 300 ms), needs 3+ characters, favours results near the user or the Cebu area.
- [ ] Keyboard and screen-reader support (arrow keys, Enter, Esc).
- [ ] Quick places: save Home and Work as real coordinates; Recent fills from the user's last trips.
- [ ] Pickup label: look up the street and barangay for the user's GPS point.

### Phase 3 · Routing + fares
- [ ] Backend endpoint: send pickup and drop-off → get back distance, travel time, the route line, and a fare per vehicle.
- [ ] `estimateTrip()` in `index.js` calls the backend (it becomes async, with a loading state on the vehicle cards).
- [ ] The map zooms to fit the whole route; the `[FARE]`, `[Distance]` and `[Travel time]` placeholders fill in automatically.
- [ ] Show the fare breakdown (base + distance) on mobile too, since it's the "no hidden charges" proof.

### Phase 4 · Driver ETA (separate track)
- `[ETA]` needs live driver locations (driver app + backend + real-time updates). This isn't a map-provider job; plan it with booking and dispatch.

### Before launch
- [ ] Lock any API keys to the mysabak.com domain.
- [ ] Cache search and routing results on the backend.
- [ ] Attribution visible (MapLibre adds it automatically), plus a "report a map issue" link.
- [ ] Set quota alerts on every provider account.
- [ ] Test on low-end Android phones and slow mobile data.

---

## 6. Open questions

1. Is there a backend yet, or a preferred one (Node, Firebase, Supabase, PHP)?
2. Is launch Cebu-only, or nationwide?
3. Monthly budget ceiling for maps?
4. Are fares the same everywhere, or different per city?

---

## Sources
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
- OSRM demo server: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- OpenFreeMap: https://openfreemap.org/
- Geoapify pricing: https://www.geoapify.com/pricing/
- Mapbox pricing: https://www.mapbox.com/pricing
- Google Maps Platform pricing: https://mapsplatform.google.com/pricing/ and https://developers.google.com/maps/billing-and-pricing/pricing
