"""Convert public data.go.kr dataset 15012896 downloads into a compact map snapshot.
Input: paths to JSON pages downloaded with the portal's public download script.
"""
import sys,json,gzip,collections
from pathlib import Path
rows=[r for path in sys.argv[1:] for r in json.load(open(path))]
points={};skipped=0
for r in rows:
 try:
  lat,lon=float(r['LATITUDE']),float(r['LONGITUDE'])
  if not (33<=lat<=39 and 124<=lon<=132):raise ValueError()
 except (ValueError,TypeError,KeyError):skipped+=1;continue
 key=f"{r['PRKPLCE_NO']}@{lat:.6f},{lon:.6f}"; get=lambda k: str(r.get(k) or '').strip()
 points[key]=[key,get('PRKPLCE_NM'),round(lat,6),round(lon,6),get('PRKPLCE_SE'),get('RDNMADR') or get('LNMADR'),get('BASIC_TIME'),get('BASIC_CHARGE'),get('PARKINGCHRGE_INFO'),get('WEEKDAY_OPER_OPEN_HHMM'),get('WEEKDAY_OPER_COLSE_HHMM'),get('REFERENCE_DATE'),get('PRKCMPRT'),get('PHONE_NUMBER')]
data={'source':'공공데이터포털 전국주차장정보표준데이터','sourceUrl':'https://www.data.go.kr/data/15012896/standard.do','retrievedOn':'2026-10-29','rawCount':len(rows),'missingCoordinates':skipped,'duplicatesRemoved':len(rows)-skipped-len(points),'count':len(points),'fields':['id','name','lat','lon','category','address','basicMinutes','basicFee','feeType','weekdayOpen','weekdayClose','referenceDate','capacity','phone'],'parking':list(points.values())}
raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();Path('assets/national-parking.json.gz').write_bytes(gzip.compress(raw,mtime=0))
print(json.dumps({k:v for k,v in data.items() if k!='parking'},ensure_ascii=False));print('compressed bytes',Path('assets/national-parking.json.gz').stat().st_size);print(collections.Counter(p[4] for p in points.values()))
