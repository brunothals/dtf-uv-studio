const {test}=require('node:test');const a=require('node:assert/strict');const QR=require('../qr-code');const jsQR=require('jsqr');

// Renderiza os módulos como RGBA (zona de silêncio de 4) para o decodificador independente.
function rasterize(code,scale=4,quiet=4){
  const side=(code.size+quiet*2)*scale,data=new Uint8ClampedArray(side*side*4);
  data.fill(255);
  for(let y=0;y<code.size;y++)for(let x=0;x<code.size;x++)if(code.modules[y][x]){
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+quiet)*scale+dy)*side+(x+quiet)*scale+dx)*4;data[i]=data[i+1]=data[i+2]=0;}
  }
  return {data,side};
}
function decode(code){const r=rasterize(code);const out=jsQR(r.data,r.side,r.side);return out?out.data:null;}
function sample(n){let s='';const abc='DTF|F:29x42|E:0.3|10x8 colorido=4,çãé ';while(Buffer.byteLength(s)<n)s+=abc[s.length%abc.length];while(Buffer.byteLength(s)>n)s=s.slice(0,-1);return s;}

test('capacidades por versão (nível L) seguem a tabela padrão',()=>{
  a.deepEqual([1,2,3,4,5,6,7,8,9,10].map(QR.capacity),[17,32,53,78,106,134,154,192,230,271]);
  a.equal(QR.MAX_BYTES,271);
});

test('todas as versões de 1 a 10 geram códigos decodificados por um leitor independente',()=>{
  for(const n of [1,17,18,32,33,53,54,78,79,106,107,134,135,154,155,192,193,230,231,271]){
    const text=sample(n),code=QR.encode(text);
    a.equal(code.version,[1,2,3,4,5,6,7,8,9,10].find(v=>QR.capacity(v)>=n));
    a.equal(code.size,code.version*4+17);
    a.equal(decode(code),text,'texto de '+n+' bytes na versão '+code.version);
  }
});

test('cada cópia da informação de formato é válida por si só',()=>{
  const text='DTF|F:29x100|E:0|10x8 colorido=12,5x4 preto=10,3x3 branco=7,7x7 dourado=2,2x2 azul=30|T:61|U:81%';
  for(const corrupt of ['first','second']){
    const code=QR.encode(text),m=code.modules,N=code.size;
    if(corrupt==='first'){for(let i=0;i<=8;i++){if(i!==6){m[8][i]=!m[8][i];m[i][8]=!m[i][8];}}}
    else{for(let i=0;i<8;i++)m[8][N-1-i]=!m[8][N-1-i];for(let i=N-7;i<N;i++)m[i][8]=!m[i][8];}
    a.equal(decode(code),text,'cópia de formato restante: '+corrupt);
  }
});

test('resumo real da calculadora com muitas artes cabe e texto vazio ou excessivo é recusado',()=>{
  const arts=Array.from({length:12},(_,i)=>(i+2)+'x'+(i+1)+' cor'+i+'='+(i*3+1)).join(',');
  const text='DTF|F:29x100|E:0.3|'+arts+'|T:198|U:77%|S2:5x4';
  a.ok(Buffer.byteLength(text)>78);
  a.equal(decode(QR.encode(text)),text);
  a.throws(()=>QR.encode(''),/vazio/);
  a.throws(()=>QR.encode(sample(272)),/271/);
});
