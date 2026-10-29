const { coordinates } = require('../lib/illustrated-map.cjs');
const cache = new Map();
const pending = new Map();
let tileSource;
let lastRequest=0;
const tileX=(lon,z)=>Math.floor((lon+180)/360*2**z);
const tileY=(lat,z)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
async function mapGeometry(lat,lon) {
  const [{VectorTile},{PbfReader}]=await Promise.all([import('@mapbox/vector-tile'),import('pbf')]);
  if(!tileSource){const r=await fetch('https://tiles.openfreemap.org/planet',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('metadata');const data=await r.json();tileSource=data.tiles?.[0];if(!tileSource?.startsWith('https://tiles.openfreemap.org/'))throw Error('source');}
  const z=13, tiles=[];
  for(let x=tileX(lon-.017,z);x<=tileX(lon+.017,z);x++)for(let y=tileY(lat+.013,z);y<=tileY(lat-.013,z);y++)tiles.push({x,y});
  const features=[];
  // At most four small vector tiles, fetched concurrently, no continuous polling.
  await Promise.all(tiles.map(async({x,y})=>{
    const url=tileSource.replace('{z}',z).replace('{x}',x).replace('{y}',y);
    const r=await fetch(url,{signal:AbortSignal.timeout(14000)});if(!r.ok)throw Error('tile');
    const tile=new VectorTile(new PbfReader(new Uint8Array(await r.arrayBuffer())));
    for(const layerName of ['transportation','landuse','park']){
      const layer=tile.layers[layerName];if(!layer)continue;
      for(let i=0;i<layer.length;i++){
        const f=layer.feature(i),isRoad=layerName==='transportation';
        if(isRoad && (f.type!==2 || ['rail','transit','ferry','path','track'].includes(f.properties.class)))continue;
        if(!isRoad && (f.type!==3 || (layerName!=='park'&&!['park','grass','recreation_ground','village_green'].includes(f.properties.class))))continue;
        const feature=f.toGeoJSON(x,y,z);feature.properties={kind:isRoad?'road':'park',class:f.properties.class||'park'};features.push(feature);
      }
    }
  }));
  return {type:'FeatureCollection',features};
}
module.exports=async(req,res)=>{
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const lat=Number(req.query.lat),lon=Number(req.query.lon);
  if(!coordinates(lat,lon))return res.status(400).json({error:'한국 내 좌표를 선택해주세요.'});
  const key=`${lat.toFixed(2)},${lon.toFixed(2)}`;
  res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
  if(cache.has(key))return res.json(cache.get(key));
  if(!pending.has(key)){
    if(Date.now()-lastRequest<1200){res.setHeader('Retry-After','2');return res.status(429).json({error:'잠시 후 다시 조회해주세요.'});}
    lastRequest=Date.now();
    pending.set(key,mapGeometry(Number(lat.toFixed(2)),Number(lon.toFixed(2))).then(data=>{if(cache.size>64)cache.delete(cache.keys().next().value);cache.set(key,data);return data;}));
  }
  try{return res.json(await pending.get(key));}
  catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({error:'도로 지도를 불러오지 못했어요. 주차장 위치는 확인할 수 있어요.'});}
  finally{pending.delete(key);}
};
