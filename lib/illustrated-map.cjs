const KOREA = { south: 33, north: 39, west: 124, east: 132 };
function coordinates(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= KOREA.south && lat <= KOREA.north && lon >= KOREA.west && lon <= KOREA.east; }
module.exports = { KOREA, coordinates };
