import type { PngDownload } from './exportPng'
import { resolveExportGeometry } from './exportPng'

export async function downloadCloudPng(item: PngDownload, onProgress: (text: string) => void, cancelled: () => boolean): Promise<void> {
 const geometry=resolveExportGeometry(item.sheet,item.dpi,item.options), {part}=item
 const sources=new Map<HTMLCanvasElement,string>(), form=new FormData()
 const placements=geometry.placements.filter(p=>p.x<part.x+part.widthPx&&p.y<part.y+part.heightPx&&p.x+p.width>part.x&&p.y+p.height>part.y).map(p=>{
  if(!sources.has(p.source))sources.set(p.source,'asset'+sources.size)
  return {asset:sources.get(p.source),x:Math.round(p.x-part.x),y:Math.round(p.y-part.y),width:Math.round(p.width),height:Math.round(p.height),rotated:p.rotated}
 })
 form.append('manifest',JSON.stringify({width:part.widthPx,height:part.heightPx,dpi:item.dpi,placements}))
 for(const [source,name]of sources){
  if(cancelled())throw Error('Exportação cancelada.')
  onProgress(`Preparando fonte ${form.getAll('manifest').length + [...sources.keys()].indexOf(source)}/${sources.size}…`)
  const blob=await new Promise<Blob>((resolve,reject)=>source.toBlob(b=>b?resolve(b):reject(Error('Falha ao preparar arte.')),'image/png'))
  form.append(name,blob,name+'.png')
 }
 onProgress('Enviando artes ao servidor…')
 const controller=new AbortController(),watch=setInterval(()=>{if(cancelled())controller.abort()},200)
 let response: Response
 try{response=await fetch('/api/exports',{method:'POST',body:form,signal:controller.signal})}finally{clearInterval(watch)}
 const data=await response.json()
 if(!response.ok)throw Error(data.error||'Não foi possível enviar a folha.')
 const endpoint='/api/exports/'+data.id
 try {
  for(;;){
   if(cancelled())throw Error('Exportação cancelada.')
   const r=await fetch(endpoint),job=await r.json();if(!r.ok)throw Error(job.error||'Falha na consulta.')
   if(job.status==='failed'||job.status==='cancelled')throw Error(job.error||'Exportação cancelada.')
   if(job.status==='done'){
    const a=document.createElement('a');a.href=endpoint+'/file?name='+encodeURIComponent(item.filename);a.download=item.filename;a.textContent=item.filename;document.body.append(a);a.click();a.remove()
    onProgress(`Pronto em ${job.metrics.seconds.toFixed(1)} s · ${(job.metrics.bytes/1048576).toFixed(1)} MB · pico ${Math.round(job.metrics.maxRssMB)} MB de memória no processo de exportação.`)
    return
   }
   onProgress(job.status==='queued'?'Aguardando na fila do servidor…':`Gerando no servidor: ${job.progress}%`)
   await new Promise(resolve=>setTimeout(resolve,1000))
  }
 }catch(e){await fetch(endpoint,{method:'DELETE'}).catch(()=>{});throw e}
}
