const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const zlib=require('node:zlib');
const {coordinates}=require('../lib/illustrated-map.cjs');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync('assets/national-parking.json.gz')));
test('nationwide public and private snapshot has valid unique coordinates and provincial coverage',()=>{
 assert.equal(data.rawCount,18939);assert.equal(data.count,data.parking.length);assert.equal(new Set(data.parking.map(r=>r[0])).size,data.count);
 for(const row of data.parking)assert.ok(coordinates(row[2],row[3]));
 for(const region of ['서울','부산','제주','강원','경상','전라','충청','인천','대전','대구','광주','울산','경기','세종'])assert.ok(data.parking.some(r=>r[5].includes(region)),region);
 assert.ok(data.parking.some(r=>r[4]==='민영'));assert.ok(data.parking.some(r=>r[4]==='공영'));
});
test('map request rejects invalid/outside coordinates',()=>{
 assert.equal(coordinates(NaN,127),false);assert.equal(coordinates(0,0),false);
 assert.equal(coordinates(35.1796,129.0756),true);assert.equal(coordinates(33.4996,126.5312),true);
});
