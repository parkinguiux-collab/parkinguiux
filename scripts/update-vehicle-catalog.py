"""Refresh the personal-data-free KEA public vehicle search snapshot."""
import datetime
import hashlib
import http.cookiejar
import json
import pathlib
import re
import urllib.parse
import urllib.request

base = 'https://min24.energy.or.kr'
page = base + '/trans_hp/AHP/HP_03/HP_03_01_010.do'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
html = opener.open(page, timeout=30).read().decode()
csrf = re.search('name="_csrf" content="([^"]+)"', html).group(1)
body = urllib.parse.urlencode({'P_PKG_AREA': 'AHP', 'P_PKG_NM': 'AHP_03_01_010_L', 'P_S_OPEN_DT': '', 'P_E_OPEN_DT': '', 'P_MODL_NM': '', '_csrf': csrf}).encode()
request = urllib.request.Request(base + '/trans_hp/cmn/AHP_L.do', data=body, headers={'X-CSRF-TOKEN': csrf, 'Referer': page, 'X-Requested-With': 'XMLHttpRequest'})
data = json.loads(opener.open(request, timeout=60).read())
rows = data['list']
if len(rows) != data['totalRows'] or len(rows) < 1000:
    raise RuntimeError('Incomplete source response; existing catalog is preserved.')
vehicles = {}
for row in rows:
    brand, model = row['COMP_NM'].strip(), row['MODL_NM'].strip()
    key = brand + '|' + model
    vehicles[key] = {'id': hashlib.sha256(key.encode()).hexdigest()[:16], 'brand': brand, 'model': model, 'type': row.get('TYPE_GB_NM') or row.get('CAR_GB_NM') or '', 'year': row.get('OPEN_YY') or ''}
snapshot = {'source': '한국에너지공단 수송통합운영시스템 자동차 표시연비 검색', 'sourceUrl': page, 'retrievedAt': str(datetime.date.today()), 'sourceRows': len(rows), 'coverage': '공개 표시연비 검색에 등록된 국내·수입 차량. 단종·특수·누락 차종은 포함되지 않을 수 있음.', 'vehicles': list(vehicles.values())}
path = pathlib.Path(__file__).resolve().parents[1] / 'assets/vehicle-catalog.json'
path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(rows)} source rows; {len(vehicles)} unique models')
