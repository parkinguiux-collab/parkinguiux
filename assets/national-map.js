(() => {
  let loading;
  const fields=['id','name','lat','lon','category','address','basicMinutes','basicFee','feeType','weekdayOpen','weekdayClose','referenceDate','capacity','phone'];
  const distance=(a,b)=>{const r=Math.PI/180;const x=(b[0]-a[0])*r,y=(b[1]-a[1])*r;const h=Math.sin(x/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(y/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));};
  async function load() {
    if(!loading) loading=(async()=>{
      const response=await fetch('assets/national-parking.json.gz'); if(!response.ok)throw Error('주차장 데이터 연결 실패');
      let bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('최신 브라우저에서 다시 열어주세요.');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
      const data=JSON.parse(new TextDecoder().decode(bytes));
      data.parking=data.parking.map(row=>{const lot=Object.fromEntries(fields.map((key,i)=>[key,row[i]]));lot.id='gov/'+lot.id;lot.status=lot.category||'구분 미확인';lot.price=2000;return lot;});
      return data;
    })().catch(error=>{loading=null;throw error;});
    return loading;
  }
  async function nearby(center) {const data=await load();return data.parking.map(lot=>({...lot,distance:distance(center,[lot.lat,lot.lon])})).filter(lot=>lot.distance<=2500).sort((a,b)=>a.distance-b.distance);}
  async function search(query) {const data=await load();const tokens=query.trim().toLowerCase().split(/\s+/);return data.parking.filter(lot=>tokens.every(t=>(lot.name+' '+lot.address+' '+lot.category).toLowerCase().includes(t))).slice(0,12);}
  window.NationalParking={load,nearby,search,distance};
})();
