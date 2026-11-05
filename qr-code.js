/* Gerador local de QR Code: modo byte (UTF-8), correção de erros nível L, versões 1 a 10 (até 271 bytes).
   Sem dependências nem rede. Escolhe automaticamente a menor versão em que o texto cabe. */
(function(root){
  // Por versão (nível L): [codewords de correção por bloco, [[quantidade de blocos, codewords de dados por bloco], ...]].
  const EC_L=[null,[7,[[1,19]]],[10,[[1,34]]],[15,[[1,55]]],[20,[[1,80]]],[26,[[1,108]]],[18,[[2,68]]],[20,[[2,78]]],[24,[[2,97]]],[30,[[2,116]]],[18,[[2,68],[2,69]]]];
  // Centros dos padrões de alinhamento por versão.
  const ALIGN=[null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  const MAX_VERSION=10;
  function dataCodewords(v){return EC_L[v][1].reduce(function(s,g){return s+g[0]*g[1];},0);}
  function capacity(v){return Math.floor((dataCodewords(v)*8-4-(v<10?8:16))/8);}
  const MAX_BYTES=capacity(MAX_VERSION);
  function gfMul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z&0xff;}
  function rsDivisor(degree){
    var result=new Array(degree).fill(0);result[degree-1]=1;var rootPow=1;
    for(var i=0;i<degree;i++){for(var j=0;j<degree;j++){result[j]=gfMul(result[j],rootPow);if(j+1<degree)result[j]^=result[j+1];}rootPow=gfMul(rootPow,2);}
    return result;
  }
  function rsRemainder(data,divisor){
    var result=new Array(divisor.length).fill(0);
    data.forEach(function(b){var factor=b^result.shift();result.push(0);divisor.forEach(function(coef,i){result[i]^=gfMul(coef,factor);});});
    return result;
  }
  function toBytes(text){return Array.prototype.slice.call(new TextEncoder().encode(String(text)));}
  function chooseVersion(length){for(var v=1;v<=MAX_VERSION;v++)if(capacity(v)>=length)return v;return 0;}
  // Codewords de dados + correção já intercalados, prontos para o posicionamento.
  function buildCodewords(bytes,v){
    var bits=[];function put(val,n){for(var k=n-1;k>=0;k--)bits.push((val>>>k)&1);}
    put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(function(b){put(b,8);});
    var total=dataCodewords(v),cap=total*8;
    for(var i=0;i<4&&bits.length<cap;i++)bits.push(0);
    while(bits.length%8)bits.push(0);
    var data=[];for(i=0;i<bits.length;i+=8){var b=0;for(var j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b);}
    for(var pad=0;data.length<total;pad++)data.push(pad%2?0x11:0xec);
    var ecLen=EC_L[v][0],divisor=rsDivisor(ecLen),blocks=[],offset=0;
    EC_L[v][1].forEach(function(g){for(var n=0;n<g[0];n++){var chunk=data.slice(offset,offset+g[1]);offset+=g[1];blocks.push({data:chunk,ec:rsRemainder(chunk,divisor)});}});
    var out=[],maxLen=Math.max.apply(null,blocks.map(function(bl){return bl.data.length;}));
    for(i=0;i<maxLen;i++)blocks.forEach(function(bl){if(i<bl.data.length)out.push(bl.data[i]);});
    for(i=0;i<ecLen;i++)blocks.forEach(function(bl){out.push(bl.ec[i]);});
    return out;
  }
  function formatBits(mask){
    var data=(1<<3)|mask,rem=data; // nível L = 01
    for(var i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
    return ((data<<10)|rem)^0x5412;
  }
  function versionBits(v){var rem=v;for(var i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);return (v<<12)|rem;}
  function maskBit(m,x,y){
    switch(m){
      case 0:return (x+y)%2===0;case 1:return y%2===0;case 2:return x%3===0;case 3:return (x+y)%3===0;
      case 4:return (Math.floor(y/2)+Math.floor(x/3))%2===0;case 5:return (x*y)%2+(x*y)%3===0;
      case 6:return ((x*y)%2+(x*y)%3)%2===0;default:return ((x+y)%2+(x*y)%3)%2===0;
    }
  }
  function penalty(m,N){
    var p=0,dark=0,y,x,run,k;
    function runPenalty(line){var pen=0,cur=null,len=0;for(var i=0;i<=line.length;i++){var v=i<line.length?line[i]:null;if(v===cur)len++;else{if(len>=5)pen+=3+(len-5);cur=v;len=1;}}return pen;}
    function finderPenalty(line){var pen=0,pat1=[1,0,1,1,1,0,1,0,0,0,0],pat2=[0,0,0,0,1,0,1,1,1,0,1];
      for(var i=0;i+11<=line.length;i++){var a=true,b=true;for(k=0;k<11;k++){var v=line[i+k]?1:0;if(v!==pat1[k])a=false;if(v!==pat2[k])b=false;}if(a||b)pen+=40;}return pen;}
    for(y=0;y<N;y++){p+=runPenalty(m[y])+finderPenalty(m[y]);}
    for(x=0;x<N;x++){run=[];for(y=0;y<N;y++)run.push(m[y][x]);p+=runPenalty(run)+finderPenalty(run);}
    for(y=0;y<N-1;y++)for(x=0;x<N-1;x++)if(m[y][x]===m[y][x+1]&&m[y][x]===m[y+1][x]&&m[y][x]===m[y+1][x+1])p+=3;
    for(y=0;y<N;y++)for(x=0;x<N;x++)if(m[y][x])dark++;
    k=Math.ceil(Math.abs(dark*20-N*N*10)/(N*N))-1;
    return p+k*10;
  }
  // Devolve {version,size,modules} com modules[y][x] = true para módulo escuro.
  function encode(text){
    var bytes=toBytes(text);
    if(!bytes.length)throw Error('Texto vazio para o QR Code.');
    var v=chooseVersion(bytes.length);
    if(!v)throw Error('Texto com '+bytes.length+' bytes excede o limite de '+MAX_BYTES+' bytes do QR Code local.');
    var N=v*4+17,mods=[],fn=[],y,x,i;
    for(y=0;y<N;y++){mods[y]=[];fn[y]=[];for(x=0;x<N;x++){mods[y][x]=false;fn[y][x]=false;}}
    function set(x,y,dark){mods[y][x]=!!dark;fn[y][x]=true;}
    function finder(cx,cy){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var xx=cx+dx,yy=cy+dy;if(xx<0||yy<0||xx>=N||yy>=N)continue;var d=Math.max(Math.abs(dx),Math.abs(dy));set(xx,yy,d!==2&&d!==4);}}
    finder(3,3);finder(N-4,3);finder(3,N-4);
    for(i=8;i<N-8;i++){if(!fn[6][i])set(i,6,i%2===0);if(!fn[i][6])set(6,i,i%2===0);}
    var al=ALIGN[v],last=al.length-1;
    for(var a=0;a<al.length;a++)for(var b=0;b<al.length;b++){
      if((a===0&&b===0)||(a===0&&b===last)||(a===last&&b===0))continue;
      for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)set(al[a]+dx,al[b]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    }
    // Reserva das áreas de formato (preenchidas após a escolha da máscara) e do módulo escuro fixo.
    for(i=0;i<=8;i++){fn[8][i]=true;fn[i][8]=true;}
    for(i=0;i<8;i++){fn[8][N-1-i]=true;fn[N-1-i][8]=true;}
    set(8,N-8,true);
    if(v>=7){var vb=versionBits(v);for(i=0;i<18;i++){var dark=(vb>>>i)&1,p1=N-11+i%3,p2=Math.floor(i/3);set(p1,p2,dark);set(p2,p1,dark);}}
    var cw=buildCodewords(bytes,v),bitPos=0,totalBits=cw.length*8;
    for(var right=N-1;right>=1;right-=2){
      if(right===6)right=5;
      for(var vert=0;vert<N;vert++)for(var j=0;j<2;j++){
        x=right-j;var upward=((right+1)&2)===0;y=upward?N-1-vert:vert;
        if(!fn[y][x]&&bitPos<totalBits){mods[y][x]=((cw[bitPos>>>3]>>>(7-(bitPos&7)))&1)===1;bitPos++;}
      }
    }
    function withMask(mask){
      var m=mods.map(function(r){return r.slice();});
      for(var yy=0;yy<N;yy++)for(var xx=0;xx<N;xx++)if(!fn[yy][xx]&&maskBit(mask,xx,yy))m[yy][xx]=!m[yy][xx];
      var fb=formatBits(mask);function bit(i){return ((fb>>>i)&1)===1;}
      for(var k=0;k<=5;k++)m[k][8]=bit(k);
      m[7][8]=bit(6);m[8][8]=bit(7);m[8][7]=bit(8);
      for(k=9;k<15;k++)m[8][14-k]=bit(k);
      for(k=0;k<8;k++)m[8][N-1-k]=bit(k);
      for(k=8;k<15;k++)m[N-15+k][8]=bit(k);
      m[N-8][8]=true;
      return m;
    }
    var best=null,bestP=Infinity,bestMask=0;
    for(i=0;i<8;i++){var cand=withMask(i),cp=penalty(cand,N);if(cp<bestP){bestP=cp;best=cand;bestMask=i;}}
    return {version:v,size:N,mask:bestMask,modules:best};
  }
  // Desenha o código no canvas com zona de silêncio de 4 módulos; devolve os dados do código.
  function draw(text,canvas,options){
    var code=encode(text),opts=options||{},quiet=opts.quiet==null?4:opts.quiet;
    var side=opts.size||canvas.width||256,cell=Math.max(1,Math.floor(side/(code.size+quiet*2)));
    var total=cell*(code.size+quiet*2);
    canvas.width=total;canvas.height=total;
    var ctx=canvas.getContext('2d');
    ctx.fillStyle=opts.light||'#fff';ctx.fillRect(0,0,total,total);ctx.fillStyle=opts.dark||'#000';
    for(var y=0;y<code.size;y++)for(var x=0;x<code.size;x++)if(code.modules[y][x])ctx.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);
    return code;
  }
  var api={encode:encode,draw:draw,capacity:capacity,MAX_VERSION:MAX_VERSION,MAX_BYTES:MAX_BYTES};
  if(typeof module!=='undefined')module.exports=api;
  if(typeof window!=='undefined')root.QRCode=api;
})(globalThis);
