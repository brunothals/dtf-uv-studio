import type { ArtItem, SheetConfig } from '../types'
import { getArtPrintSize, packArts } from './pack'
/** Preserve the mix of models; report only sets that the actual packer fits on one sheet. */
export function compareSheets(arts: ArtItem[], config: SheetConfig): string[] {
 const active=arts.filter(a=>a.quantity>0);if(!active.length)return []
 const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a
 const divisor=active.reduce((n,a)=>gcd(n,a.quantity),0),mix=active.map(a=>({...a,quantity:a.quantity/divisor}))
 const area=mix.reduce((n,a)=>{const s=getArtPrintSize(a,config);return n+s.widthCm*s.heightCm*a.quantity},0)
 return [21,42,50,100].map(height=>{
  const c={...config,widthCm:29,heightCm:height,sheetGrowMode:'fixed' as const,dpi:100,useNativeDpi:false}
  let lo=0,hi=Math.min(Math.floor(29*height/Math.max(area,.0001)),Math.floor(10000/mix.reduce((n,a)=>n+a.quantity,0)))
  while(lo<hi){const mid=Math.ceil((lo+hi)/2),result=packArts(mix.map(a=>({...a,quantity:a.quantity*mid})),c,{skipPreview:true});if(result.sheets.length===1&&!result.errors.length)lo=mid;else hi=mid-1}
  return `29 × ${height} cm: ${lo*mix.reduce((n,a)=>n+a.quantity,0)} unidades${mix.length>1?' (mesma proporção de modelos)':''}`
 })
}
