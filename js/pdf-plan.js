/* PDF drawing recognition uses geometry/text hints, followed by explicit user review. */
(function(LX){
 'use strict';
 const kinds={unknown:'待分類',panel:'平板／線型燈',downlight:'崁燈',track:'軌道燈',desk:'辦公桌',wall:'牆面',ignore:'忽略'};
 function bounds(points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return{x0,y0,x1,y1,w:x1-x0,h:y1-y0};}
 const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
 const isInside=(p,poly)=>LX.calc.pointInPoly(p[0],p[1],poly)||LX.calc.distToPoly(p[0],p[1],poly)<1e-7;
 function nearText(path,texts){
  const b=bounds(path.points),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,radius=Math.max(6,Math.min(22,Math.max(b.w,b.h)*.7));
  const nearby=new Set();for(let x=Math.floor((cx-radius)/48);x<=Math.floor((cx+radius)/48);x++)for(let y=Math.floor((cy-radius)/48);y<=Math.floor((cy+radius)/48);y++)for(const t of texts.get(x+','+y)||[])nearby.add(t);
  return [...nearby].filter(t=>Math.hypot(Math.max(t.x0-cx,0,cx-t.x1),Math.max(t.y0-cy,0,cy-t.y1))<=radius).sort((a,b)=>Math.hypot((a.x0+a.x1)/2-cx,(a.y0+a.y1)/2-cy)-Math.hypot((b.x0+b.x1)/2-cx,(b.y0+b.y1)/2-cy)).slice(0,6).map(t=>t.text).join(' ');
 }
 function recognize(model,scale,previous){
  const old=new Map((previous||[]).map(o=>[o.id,o]));
  const textGrid=new Map();for(const t of model.texts||[]){for(let x=Math.floor(t.x0/48);x<=Math.min(Math.floor(t.x1/48),Math.floor(t.x0/48)+24);x++)for(let y=Math.floor(t.y0/48);y<=Math.min(Math.floor(t.y1/48),Math.floor(t.y0/48)+4);y++){const key=x+','+y;if(!textGrid.has(key))textGrid.set(key,[]);textGrid.get(key).push(t);}}
  return model.paths.map(path=>{
   if(old.has(path.id)&&old.get(path.id).reviewed)return{...path,...old.get(path.id),points:path.points};
   const b=bounds(path.points),w=b.w*scale,h=b.h*scale,long=Math.max(w,h),short=Math.min(w,h),text=nearText(path,textGrid);
   let kind='unknown',reason='尚無足夠圖形或文字線索';
   if(scale>0){
    if(/(?:chair|椅子|座椅)/i.test(text)&&path.closed&&long<1){kind='ignore';reason='鄰近文字提示為椅子：'+text;}
    else if(/(?:desk|workstation|辦公桌|工作桌|桌面)/i.test(text)&&path.closed&&long>.5&&long<4&&short>.3){kind='desk';reason='鄰近文字提示：'+text;}
    else if(/(?:track|spot|軌道|投射燈)/i.test(text)&&long<1.5&&short<.8){kind='track';reason='鄰近燈具文字提示：'+text;}
    else if(/(?:downlight|崁燈|筒燈|嵌燈|\bDL\d*\b)/i.test(text)&&long<.8){kind='downlight';reason='鄰近燈具文字提示：'+text;}
    else if(/(?:panel|平板燈|線型燈|\bPL\d*\b)/i.test(text)&&path.closed&&long<3){kind='panel';reason='鄰近燈具文字提示：'+text;}
    else if(path.closed&&path.shape==='circle'&&short>=.065&&long<=.45){kind='downlight';reason='小型圓形符號；需核對是否為燈具';}
    else if(path.closed&&short>=.43&&long<=.75&&long/short<1.3){kind='panel';reason='約 60 × 60 cm 方形候選；需排除椅子與圖例';}
    else if(path.closed&&long>=.85&&long<=2.6&&short>=.12&&short<=.4){kind='panel';reason='長型燈具幾何候選';}
    else if(path.closed&&long>=.85&&long<=3.2&&short>=.45&&short<=1.15&&long/short>=1.35){kind='desk';reason='辦公桌尺寸與比例候選';}
    else if((!path.closed&&long>=1.5&&(path.strokeWidth||0)*scale>=.02)||(path.closed&&long>=1&&short>=.045&&short<=.35)){kind='wall';reason='長線或狹長牆體候選；需排除尺寸線與配線';}
   }
   return{...path,kind,reason,text,reviewed:false};
  });
 }
 function sameSymbol(a,b){
  if(a.closed!==b.closed||a.shape!==b.shape)return false;
  const x=bounds(a.points),y=bounds(b.points),p=[Math.max(x.w,x.h),Math.min(x.w,x.h)],q=[Math.max(y.w,y.h),Math.min(y.w,y.h)];
  return p.every((v,i)=>Math.abs(v-q[i])<=Math.max(.4,v*.08));
 }
 function clipSegment(a,b,poly){
  const dx=b[0]-a[0],dy=b[1]-a[1],ts=[0,1];
  for(let i=0;i<poly.length;i++){
   const c=poly[i],d=poly[(i+1)%poly.length],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;
   const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
   if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);
  }
  ts.sort((x,y)=>x-y);const parts=[];
  for(let i=0;i<ts.length-1;i++){const t=ts[i],u=ts[i+1],mid=(t+u)/2;if(u-t<1e-8||!isInside([a[0]+dx*mid,a[1]+dy*mid],poly))continue;parts.push([[a[0]+dx*t,a[1]+dy*t],[a[0]+dx*u,a[1]+dy*u]]);}
  return parts;
 }
 function build(model,objects,options,project){
  const scale=Number(options.scale),rawBoundary=options.boundary;
  if(!Number.isFinite(scale)||scale<=0)throw Error('請設定圖紙比例或使用兩點距離校正。');
  if(!rawBoundary||!LX.cad.validPolygon(rawBoundary))throw Error('請選定或圈選有效的計算範圍。');
  const bb=bounds(rawBoundary),transform=p=>[(p[0]-bb.x0)*scale,(p[1]-bb.y0)*scale],polygon=rawBoundary.map(transform);
  if(Math.min(bb.w,bb.h)*scale<.5||Math.max(bb.w,bb.h)*scale>500)throw Error('換算後空間應介於 0.5 至 500 m，請核對比例與範圍。');
  const ceiling=Number(options.ceiling),mount=Number(options.mount),wallHeight=Number(options.wallHeight);
  if(!Number.isFinite(ceiling)||ceiling<1||ceiling>30||!Number.isFinite(mount)||mount<=.85||mount>ceiling||!Number.isFinite(wallHeight)||wallHeight<=0||wallHeight>ceiling)throw Error('請確認天花、燈具及牆面高度；燈高須高於 0.85 m 且不超過天花。');
  const draft={...project,room:{...project.room,height:ceiling,wp:0}},fixtures=[],desks=[],walls=[],skipped=[];
  const background=[];
  const lampKinds=['panel','downlight','track'];
  const deskCandidates=objects.filter(o=>o.kind==='desk'&&o.closed).filter(o=>!objects.some(q=>q!==o&&q.kind==='desk'&&q.closed&&area(q.points)>area(o.points)*1.001&&o.points.every(p=>isInside(p,q.points))));
  const deskIds=new Set(deskCandidates.map(o=>o.id)),seenDesks=new Set(),seenWalls=new Set();
  for(const object of objects){
   const points=object.points.map(transform),b=bounds(points),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
   if(object.kind!=='ignore'&&object.kind!=='unknown')background.push({id:object.id,layer:'PDF-'+kinds[object.kind],block:'',group:'',points,closed:object.closed});
   if(lampKinds.includes(object.kind)){
    if(!isInside([cx,cy],polygon)){skipped.push(object.id);continue;}
    const typeId=object.typeId||options.types[object.kind],type=project.library.find(t=>t.id===typeId);
    if(!type)throw Error('請選擇對應的燈具型號。');
    if(fixtures.some(f=>Math.hypot(f.x-cx,f.y-cy)<.025))continue;
    const f=LX.calc.makeFixture(draft,type,cx,cy,{z:mount,rot:object.rotation||0});
    f.sourcePdfId=object.id;f.recognitionKind=object.kind;f.recognitionReviewed=!!object.reviewed;fixtures.push(f);
   }else if(deskIds.has(object.id)){
    if(!LX.cad.validPolygon(points)||area(points)<.03||points.some(p=>!isInside(p,polygon))){skipped.push(object.id);continue;}
    let contained=true;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];if(clipSegment(p,q,polygon).reduce((n,[a,b])=>n+Math.hypot(a[0]-b[0],a[1]-b[1]),0)<Math.hypot(p[0]-q[0],p[1]-q[1])-1e-5)contained=false;}
    if(!contained){skipped.push(object.id);continue;}
    const key=points.map(p=>p.map(v=>Math.round(v*1000)).join(',')).sort().join('|');if(seenDesks.has(key))continue;seenDesks.add(key);
    desks.push({id:'pdf-desk-'+desks.length,name:'桌面 '+(desks.length+1),polygon:points,height:.75,sourcePdfId:object.id,manual:false});
   }else if(object.kind==='wall'){
    const segments=[];
    // Thin rectangles represent a wall body: use its centre line rather than blocking twice.
    if(object.closed&&object.shape==='rect'&&Math.min(b.w,b.h)<=.4){segments.push(b.w>b.h?[[b.x0,cy],[b.x1,cy]]:[[cx,b.y0],[cx,b.y1]]);}
    else for(let i=0;i<points.length-(object.closed?0:1);i++)segments.push([points[i],points[(i+1)%points.length]]);
    for(const [a,b]of segments)for(const [p1,p2]of clipSegment(a,b,polygon)){
     if(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])<.06)continue;
     const key=[p1,p2].map(p=>p.map(v=>Math.round(v*1000)).join(',')).sort().join('|');if(seenWalls.has(key))continue;seenWalls.add(key);
     walls.push({p1,p2,x1:p1[0],y1:p1[1],x2:p2[0],y2:p2[1],minX:Math.min(p1[0],p2[0]),maxX:Math.max(p1[0],p2[0]),minY:Math.min(p1[1],p2[1]),maxY:Math.max(p1[1],p2[1]),height:wallHeight,sourcePdfId:object.id,layer:'PDF-wall'});
    }
   }
  }
  if(fixtures.length>2000||desks.length>1000||walls.length>4000)throw Error('辨識物件過多，請縮小計算範圍或排除圖例與重複線條。');
  return{polygon,fixtures,desks,walls,background,scale,origin:[bb.x0,bb.y0],width:bb.w*scale,length:bb.h*scale,area:area(polygon),skipped};
 }
 LX.pdfPlan={kinds,bounds,area,recognize,sameSymbol,build,clipSegment};
})(window.LX=window.LX||{});
