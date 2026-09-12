"""Convert an Overpass JSON extract into a small attributed local map.

Input query and reproduction instructions are in docs/ghost-cambridge-study.md.
"""
import json
from pathlib import Path
import argparse
from pyproj import Transformer
parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
args=parser.parse_args()
raw=json.loads(args.source.read_text())
project=Transformer.from_crs(4326,27700,always_xy=True)
def xy(p):
    return [round(v,2) for v in project.transform(p['lon'],p['lat'])]
features=[]
landmarks=[]
chosen={164848633:('kings','King’s College Chapel','Chapel roof & buttresses',3.3),148215569:('queens','Queens’ College','College courts beside the Cam',4),570076432:('bridge','Mathematical Bridge','River crossing at Queens’',2.8),139308034:('clare','Clare College','Old Court & river frontage',3.6),1999158:('backs','The Backs','Riverside grounds & tree canopy',6.5)}
for e in raw['elements']:
    tags=e.get('tags',{})
    kind='river' if tags.get('waterway')=='river' else 'road' if 'highway' in tags else 'landmark'
    if 'geometry' in e:
        pts=[xy(p) for p in e['geometry'] if p]
        if len(pts)>1 and kind!='landmark':
            features.append({'id':e['id'],'kind':kind,'name':tags.get('name',''),'points':pts})
    if e['id'] in chosen:
        ident,name,description,distance=chosen[e['id']]
        b=e['bounds']; center=xy({'lon':(b['minlon']+b['maxlon'])/2,'lat':(b['minlat']+b['maxlat'])/2})
        landmarks.append({'id':ident,'name':name,'description':description,'position':center,'distance':distance,'osm':f"https://www.openstreetmap.org/{e['type']}/{e['id']}"})
landmarks.sort(key=lambda l:list(chosen.keys()).index(int(l['osm'].split('/')[-1])))
candidates=[(f,point) for f in features if f['kind']=='river' for point in f['points']]
feature,point=min(candidates,key=lambda item:(item[1][0]-544550)**2+(item[1][1]-258320)**2)
landmarks.append({'id':'cam','name':'River Cam','description':'The river through the college backs','position':point,'distance':5,'osm':f"https://www.openstreetmap.org/way/{feature['id']}"})
output={'source':'© OpenStreetMap contributors','licence':'https://www.openstreetmap.org/copyright','timestamp':raw['osm3s']['timestamp_osm_base'],'bounds':[543300,257000,546300,259500],'features':features,'landmarks':landmarks}
Path('public/ghost-cambridge/context.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
print('Map features:',len(features),'Landmarks:',len(landmarks))
