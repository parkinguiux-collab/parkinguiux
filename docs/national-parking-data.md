# Nationwide parking map

- Source: [공공데이터포털 전국주차장정보표준데이터](https://www.data.go.kr/data/15012896/standard.do).
- Retrieved 2026-10-29 through the portal's public JSON download (two pages, 18,939 rows).
- 766 rows lack valid Korean coordinates. 528 repeated management-number/coordinate combinations were deduplicated.
- Map snapshot: 17,645 locations (16,732 public, 913 private). This does **not** represent every parking facility in Korea. The official dataset excludes residential priority spaces and can omit private facilities; records have their own reference dates.
- The gzip snapshot is loaded on demand, decompressed locally and searched in-browser. No location goes to the public parking data source.
- Search matches registered parking names and addresses; it is not a full address/POI geocoder. Up to 12 matches are shown. Nearby lookup includes all snapshot locations within 2.5 km.
- GPS is requested only by the current-location button. Denial leaves regional search available. The grey centre is a search origin; the blue dot is a received GPS location.
- Roads and parks are OSM geometry styled with the existing pale illustration palette. `/api/map` proxies a bounded query to OpenFreeMap vector tiles, decoded with @mapbox/vector-tile and pbf, using a rounded centre, at most four tiles, limited response time, request coalescing and one-day CDN caching. OpenFreeMap / OpenMapTiles / OpenStreetMap attribution is retained. A map drag requires explicit “이 지역 다시 조회”; it never floods the provider with continuous queries.
- If road loading fails, show a retry and parking locations. Never place cached Seoul roads behind another region's markers.
- Marker data never starts a parking session. Current entry, settlement and exit remain prototype interactions; national public parking results are not claims of partnership or live vacancies.
- Run `npm test` and `npm run build`. To refresh: download the original JSON pages with the portal download flow, then `python3 scripts/import-national-parking.py <page1.json> <page2.json>` and review counts/reference dates. Update the retrieval date when refreshing.
