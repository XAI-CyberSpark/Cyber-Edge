import catalog from '@/data/teslaAssets.json';
const assets = catalog as Record<string,{file:string;width:number;height:number}>;
export const teslaAssetUrl = (slot:string) => `/hmi/tesla/${assets[slot].file}`;
/** Scale the authored canvas; leave SVG root dimensions intact. */
export function TeslaAsset({slot,size=28}: {slot:string;size?:number}) {
  const asset = assets[slot];
  const scale = size / Math.max(asset.width,asset.height);
  return <span className="tesla-asset" data-asset-slot={slot} style={{width:asset.width*scale,height:asset.height*scale}}><img src={teslaAssetUrl(slot)} alt="" draggable={false} style={{transform:`scale(${scale})`}} /></span>;
}
