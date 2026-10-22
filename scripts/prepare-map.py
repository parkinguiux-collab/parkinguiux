# -*- coding: utf-8 -*-
"""Reduce the official OSM extract to a small, attributed local map."""
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

root = ET.parse('data/seoul-cityhall-osm.osm').getroot()
nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in root.findall('node')}
center = [37.5665, 126.9780]
def tags(el):
    return {t.attrib['k']: t.attrib['v'] for t in el.findall('tag')}
def distance(coords):
    lat, lon = coords[1], coords[0]
    p1, p2 = math.radians(center[0]), math.radians(lat)
    dp, dl = p2-p1, math.radians(lon-center[1])
    return round(6371000 * 2 * math.atan2(math.sqrt(math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2), math.sqrt(1-(math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))))
features, lots = [], []
for el in list(root.findall('node')) + list(root.findall('way')):
    t = tags(el)
    if el.tag == 'node':
        coords = nodes[el.attrib['id']]
        geometry = None
    else:
        points = [nodes[n.attrib['ref']] for n in el.findall('nd') if n.attrib['ref'] in nodes]
        if len(points) < 2:
            continue
        if len(points) > 2 and points[0] == points[-1]:
            source = points[:-1]
        else:
            source = points
        coords = [sum(p[i] for p in source)/len(source) for i in (0,1)]
        geometry = [[round(p[0],6), round(p[1],6)] for p in points]
    if t.get('amenity') == 'parking' and t.get('access') not in ('private', 'no'):
        lots.append({'id': el.tag + '/' + el.attrib['id'], 'name': t.get('name:ko') or t.get('name') or '이름 미등록 주차장', 'lat': round(coords[1],6), 'lon': round(coords[0],6), 'distance': distance(coords), 'access': t.get('access', 'unknown'), 'osmUrl': 'https://www.openstreetmap.org/' + el.tag + '/' + el.attrib['id']})
    road = t.get('highway')
    if geometry and road in ('primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','service','unclassified','living_street'):
        features.append({'type':'Feature','properties':{'kind':'road','class':road},'geometry':{'type':'LineString','coordinates':geometry}})
    elif geometry and t.get('leisure') == 'park' and len(geometry)>3 and geometry[0]==geometry[-1]:
        features.append({'type':'Feature','properties':{'kind':'park'},'geometry':{'type':'Polygon','coordinates':[geometry]}})
nearby = []
for lot in sorted(lots, key=lambda l:l['distance']):
    if lot['distance'] < 1000 and all(math.hypot((lot['lat']-p['lat'])*111000,(lot['lon']-p['lon'])*88000)>150 for p in nearby):
        nearby.append(lot)
    if len(nearby)==3:
        break
nearby.sort(key=lambda l:l['distance'])
if not nearby:
    raise RuntimeError('The OSM extract contains no nearby parking locations.')
result = {'source':'OpenStreetMap','license':'ODbL-1.0','sourceUrl':'https://www.openstreetmap.org/copyright','retrievedOn':'2026-10-22','center':center,'bounds':[[37.560,126.970],[37.573,126.986]],'parking':nearby,'geometry':{'type':'FeatureCollection','features':features}}
Path('assets/nearby-map.js').write_text('window.PARKING_MAP_DATA = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps({'roadsAndParks':len(features),'parking':nearby},ensure_ascii=False,indent=2))
