"""Prepare measured Cambridge returns, tiled detail and derived ground-relative heights.

Dependencies and provenance: docs/ghost-cambridge-study.md. No invented returns.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import laspy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--bounds', nargs=4, type=float, required=True)
parser.add_argument('--limit', type=int, default=1000000)
parser.add_argument('--output', type=Path, default=Path('public/ghost-cambridge'))
parser.add_argument('--cache', type=Path)
args = parser.parse_args()
west, south, east, north = args.bounds
if args.cache and args.cache.exists():
    cached = np.load(args.cache)
    points, source_count = cached['points'], int(cached['source_count'])
    if not np.array_equal(cached['bounds'], args.bounds):
        raise ValueError('Cached crop has different bounds')
else:
    parts, source_count = [], 0
    with laspy.open(args.source) as reader:
        for chunk in reader.chunk_iterator(2000000):
            source_count += len(chunk)
            x, y, z = np.asarray(chunk.x), np.asarray(chunk.y), np.asarray(chunk.z)
            mask = (x >= west) & (x < east) & (y >= south) & (y < north)
            mask &= np.isfinite(z) & (z > -5) & (z < 100)
            mask &= ~np.isin(np.asarray(chunk.classification), [7, 18])
            if np.any(mask):
                names = ['intensity', 'classification', 'gps_time', 'return_number', 'number_of_returns', 'point_source_id']
                parts.append(np.column_stack([x[mask], y[mask], z[mask]] + [np.asarray(chunk[n])[mask] for n in names]))
    if not parts:
        raise ValueError('No survey returns intersect the crop')
    points = np.concatenate(parts)
    if args.cache:
        np.savez(args.cache, points=points, source_count=source_count, bounds=args.bounds)
crop_count = len(points)
selection = np.sort(np.random.default_rng(2023).choice(crop_count, min(args.limit, crop_count), replace=False))
origin = np.array([(west + east) / 2, (south + north) / 2, np.floor(points[:, 2].min())])
minimum = np.array([west, south, origin[2]])
scale = np.array([0.02, 0.02, 0.01])
quantised = np.rint((points[:, :3] - minimum) / scale)
if np.any(quantised < 0) or np.any(quantised > 65535):
    raise ValueError('Crop exceeds quantised coordinate range')
low, high = np.percentile(points[selection, 3], [2, 98])
# Estimate ground from the lowest classified ground return per 5 m cell.
# Empty cells are filled from neighbouring cells. This is a derived visual aid,
# not the EA's manually edited DTM and never modifies measured coordinates.
cell = 5
nx, ny = int(np.ceil((east-west)/cell)), int(np.ceil((north-south)/cell))
ix = np.clip(((points[:, 0]-west)/cell).astype(int), 0, nx-1)
iy = np.clip(((points[:, 1]-south)/cell).astype(int), 0, ny-1)
ground = np.full(nx*ny, np.inf)
is_ground = points[:, 4] == 2
np.minimum.at(ground, iy[is_ground]*nx+ix[is_ground], points[is_ground, 2])
ground = ground.reshape(ny, nx)
for _ in range(nx+ny):
    missing = ~np.isfinite(ground)
    if not np.any(missing):
        break
    padded = np.pad(ground, 1, constant_values=np.inf)
    neighbours = np.stack([padded[1:-1,:-2], padded[1:-1,2:], padded[:-2,1:-1], padded[2:,1:-1]])
    valid = np.isfinite(neighbours)
    total = np.where(valid, neighbours, 0).sum(axis=0)
    count = valid.sum(axis=0)
    fill = missing & (count > 0)
    ground[fill] = total[fill]/count[fill]
if not np.all(np.isfinite(ground)):
    raise ValueError('No ground estimate available')
agl = np.maximum(0, points[:, 2] - ground[iy, ix])
gps_min, gps_max = points[:, 5].min(), points[:, 5].max()
flights, flight_ids = np.unique(points[:, 8].astype(int), return_inverse=True)
if len(flights) > 256 or (gps_max-gps_min)*1000 > 4294967295:
    raise ValueError('Survey timing exceeds the browser format')
records = np.zeros(crop_count, dtype=[('xyz','<u2',3), ('intensity','u1'), ('class','u1'), ('time','<u4'), ('agl','<u2'), ('returns','u1'), ('flight','u1')])
records['xyz'] = quantised.astype(np.uint16)
records['intensity'] = np.rint(np.clip((points[:,3]-low)/max(1,high-low),0,1)*255).astype(np.uint8)
records['class'] = points[:,4].astype(np.uint8)
records['time'] = np.rint((points[:,5]-gps_min)*1000).astype(np.uint32)
records['agl'] = np.rint(np.clip(agl,0,655.35)*100).astype(np.uint16)
records['returns'] = points[:,6].astype(np.uint8) | (points[:,7].astype(np.uint8) << 4)
records['flight'] = flight_ids.astype(np.uint8)
args.output.mkdir(parents=True, exist_ok=True)
(args.output/'detail').mkdir(exist_ok=True)
def write_cloud(path, recs):
    payload = b'GCB2' + struct.pack('<I',len(recs)) + recs.tobytes()
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()
checksum = write_cloud(args.output/'points.bin', records[selection])
tile_size = 230
cols, rows = int(np.ceil((east-west)/tile_size)), int(np.ceil((north-south)/tile_size))
tile_ids = np.minimum(rows-1, (quantised[:,1]*scale[1]//tile_size).astype(int))*cols + np.minimum(cols-1, (quantised[:,0]*scale[0]//tile_size).astype(int))
tiles = []
for row in range(rows):
    for col in range(cols):
        tile_id = row*cols+col
        bounds = [west+col*tile_size,south+row*tile_size,min(east,west+(col+1)*tile_size),min(north,south+(row+1)*tile_size)]
        recs = records[tile_ids == tile_id]
        checksum_tile = write_cloud(args.output/f'detail/{tile_id}.bin',recs)
        tiles.append({'id':tile_id,'file':f'detail/{tile_id}.bin','count':len(recs),'bounds':bounds,'sha256':checksum_tile})
intervals = sorted([[float(points[flight_ids == i,5].min()-gps_min), float(points[flight_ids == i,5].max()-gps_min)] for i in range(len(flights))])
segments = []
for start, end in intervals:
    if segments and start <= segments[-1][1]:
        segments[-1][1] = max(segments[-1][1], end)
    else:
        segments.append([start, end])
# Use the full crop, so the annotation cannot change with overview sampling or LOD.
highest_index = int(np.argmax(records['xyz'][:, 2]))
highest_return = int(records['returns'][highest_index])
highest_point = {
 'position':(records['xyz'][highest_index]*scale+minimum).tolist(),
 'heightAboveGround':float(records['agl'][highest_index])/100,
 'classification':int(records['class'][highest_index]),
 'returnKind':int((highest_return & 15) == 1) + 2*int((highest_return & 15) == (highest_return >> 4)),
}
manifest = {
 'version':2,'file':'points.bin','count':len(selection),'cropCount':crop_count,'sourceCount':source_count,
 'sourceFile':args.source.name,'sourceUrl':'https://environment.data.gov.uk/survey',
 'licence':'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
 'attribution':'© Environment Agency copyright and/or database right 2023. All rights reserved.',
 'crs':'EPSG:27700','bounds':args.bounds,'minimum':minimum.tolist(),'origin':origin.tolist(),'scale':scale.tolist(),
 'heightRange':[float(points[:,2].min()),float(points[:,2].max())],
 'highestPoint':highest_point,
 'intensityPercentiles':[float(low),float(high)],'sha256':checksum,
 'gpsRange':[float(gps_min),float(gps_max)],'flightLines':flights.tolist(),
 'acquisitionSegments':segments,
 'tileSize':tile_size,'tileColumns':cols,'tiles':tiles,
 'groundModel':'Lowest classified ground return per 5 m cell; empty cells filled from neighbours. Derived estimate, not the official EA DTM.',
}
(args.output/'survey.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Reproducible density audit around the mapped chapel footprint's bounding box.
kings = (points[:,0]>544665)&(points[:,0]<544794)&(points[:,1]>258377)&(points[:,1]<258418)
kings_roof = kings & (points[:,2]>20)
audit = {'chapelInspectionBounds':[544665,258377,544794,258418], 'sourceReturns':int(kings.sum()),'sampleReturns':int(kings[selection].sum()),'sourceAbove20m':int(kings_roof.sum()),'sampleAbove20m':int(kings_roof[selection].sum()),'cropReturns':crop_count,'sampleReturnsTotal':len(selection),'gpsDurationSeconds':float(gps_max-gps_min),'flightLines':flights.tolist()}
(args.output/'density-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit,indent=2))
