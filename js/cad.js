/* Local CAD geometry. DXF coordinates are retained until scale and roles are reviewed. */
(function (LX) {
  'use strict';
  const identity = [1, 0, 0, 1, 0, 0];
  const apply = (m, p) => [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
  const mul = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const xy = p => [p.x || 0,p.y || 0];
  const area = p => Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  function bounds(paths) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const path of paths)for(const [x,y] of path.points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
  }
  function bulge(a,b,v) {
    const start=xy(a),end=xy(b);if(!v)return [start];
    const dx=end[0]-start[0],dy=end[1]-start[1],d=Math.hypot(dx,dy);if(!d)return [start];
    const angle=4*Math.atan(v),r=d*(1+v*v)/(4*Math.abs(v));
    const cx=(start[0]+end[0])/2-dy*(1-v*v)/(4*v),cy=(start[1]+end[1])/2+dx*(1-v*v)/(4*v);
    const t0=Math.atan2(start[1]-cy,start[0]-cx),n=Math.max(2,Math.ceil(Math.abs(angle)/(Math.PI/90)));
    return Array.from({length:n},(_,i)=>[cx+r*Math.cos(t0+angle*i/n),cy+r*Math.sin(t0+angle*i/n)]);
  }
  function parse(text) {
    if(text.startsWith('AutoCAD Binary DXF'))throw Error('請將二進位 DXF 另存為 ASCII DXF 後匯入。');
    const doc=new DxfParser().parseSync(text);if(!doc?.entities?.length)throw Error('圖檔沒有可讀取的模型空間物件。');
    const paths=[],ignored={},warnings=new Set();let visits=0,pointCount=0;
    const rawFixtures=[],rawWalls=[];
    function walk(entities,m,inherit,group,blockName,depth,stack) {
      if(depth>16)throw Error('圖塊巢狀層級過深。');
      for(const e of entities) {
        if(++visits>120000)throw Error('圖檔物件過多，請先另存需要的辦公區域。');
        if(e.inPaperSpace||e.visible===false)continue;
        const layer=e.layer==='0'&&inherit?inherit:(e.layer||'0');
        if(e.type==='INSERT') {
          const ptIns=apply(m,[e.position?.x||0,e.position?.y||0]);
          rawFixtures.push({type:'INSERT',layer,block:e.name,x:ptIns[0],y:ptIns[1],rot:e.rotation||0});
          const block=doc.blocks?.[e.name];
          if(!block?.entities||stack.includes(e.name)){warnings.add('部分外部參考或循環圖塊未展開');continue;}
          const r=(e.rotation||0)*Math.PI/180,sx=e.xScale??1,sy=e.yScale??1,p=e.position||{},base=block.position||{};
          if(e.extrusionDirection?.z<0){warnings.add('負向 OCS 圖塊需另行核對');continue;}
          const rows=e.rowCount||1,cols=e.columnCount||1;
          if(rows*cols>10000)throw Error('陣列圖塊過多。');
          for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
            const transform=[Math.cos(r)*sx,Math.sin(r)*sx,-Math.sin(r)*sy,Math.cos(r)*sy,p.x||0,p.y||0];
            const offset=[1,0,0,1,col*(e.columnSpacing||0)/sx-(base.x||0),row*(e.rowSpacing||0)/sy-(base.y||0)];
            walk(block.entities,mul(m,mul(transform,offset)),layer,group||('block-'+visits+'-'+row+'-'+col),blockName||e.name,depth+1,[...stack,e.name]);
          }
          continue;
        }
        let points=[],closed=false;
        if(e.type==='LINE')points=(e.vertices||[]).map(xy);
        else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE') {
          const v=e.vertices||[];closed=!!e.shape;
          for(let i=0;i<v.length;i++) {
            if(i===v.length-1&&!closed)points.push(xy(v[i]));
            else points.push(...bulge(v[i],v[(i+1)%v.length],v[i].bulge));
          }
        } else if(e.type==='CIRCLE'||e.type==='ARC') {
          closed=e.type==='CIRCLE';const a=closed?0:e.startAngle;let span=closed?Math.PI*2:e.endAngle-a;
          if(span<=0)span+=Math.PI*2;const n=Math.max(8,Math.ceil(span/(Math.PI/90)));
          points=Array.from({length:closed?n:n+1},(_,i)=>[e.center.x+e.radius*Math.cos(a+span*i/n),e.center.y+e.radius*Math.sin(a+span*i/n)]);
        } else if(e.type==='ELLIPSE') {
          const a=e.startAngle||0,span=(e.endAngle??Math.PI*2)-a,major=e.majorAxisEndPoint;
          if(major){closed=Math.abs(span-Math.PI*2)<1e-5;points=Array.from({length:closed?180:181},(_,i)=>{const t=a+span*i/180;return [e.center.x+major.x*Math.cos(t)-major.y*e.axisRatio*Math.sin(t),e.center.y+major.y*Math.cos(t)+major.x*e.axisRatio*Math.sin(t)];});}
        } else {ignored[e.type]=(ignored[e.type]||0)+1;continue;}
        if(points.length<2)continue;
        if(e.extrusionDirection?.z<0){points=points.map(([x,y])=>[-x,y]);}
        points=points.map(p=>apply(m,p));
        if(points.some(p=>p.some(n=>!Number.isFinite(n))))throw Error('圖檔含有無效座標。');
        if(points.length>2&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-7){points.pop();closed=true;}
        paths.push({id:'p'+paths.length,layer,block:blockName||'',group:group||'',points,closed});
        pointCount+=points.length;if(pointCount>400000)throw Error('圖檔線段過多，請先簡化或另存區域。');
        if(points.length>=2&&/牆|wall|隔間|柱|partition/i.test(layer)){
          for(let i=0;i<points.length-1;i++){
            rawWalls.push({layer,block:blockName||'',p1:points[i],p2:points[i+1]});
          }
          if(closed&&points.length>2){
            rawWalls.push({layer,block:blockName||'',p1:points[points.length-1],p2:points[0]});
          }
        }
        if(e.type==='CIRCLE') {
          const ptC=apply(m,[e.center.x,e.center.y]),cr=e.radius*Math.hypot(m[0],m[1]);
          rawFixtures.push({type:'CIRCLE',layer,block:blockName||'',x:ptC[0],y:ptC[1],r:cr,dia:cr*2});
        } else if(closed&&points.length>=4&&points.length<=6) {
          const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
          const rw=Math.max(...xs)-Math.min(...xs),rh=Math.max(...ys)-Math.min(...ys);
          rawFixtures.push({type:'RECT',layer,block:blockName||'',x:(Math.max(...xs)+Math.min(...xs))/2,y:(Math.max(...ys)+Math.min(...ys))/2,w:rw,h:rh});
        }
      }
    }
    walk(doc.entities,identity,'','','',0,[]);
    if(!paths.length)throw Error('沒有支援的平面線段、圓弧或多段線。');
    const unit=doc.header?.$INSUNITS||0;
    const units={1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,7:1000,10:0.9144,14:0.1};
    return {paths,unit,unitScale:units[unit]||null,warnings:[...warnings],ignored,bounds:bounds(paths),rawFixtures,rawWalls};
  }
  // Stitch a network only where each vertex has exactly two edges. Branches remain unclassified.
  function contours(paths) {
    const result=paths.filter(p=>p.closed&&p.points.length>=3).map(p=>({...p,area:area(p.points)}));
    const sets=new Map();
    for(const p of paths.filter(p=>!p.closed)){const key=p.layer+'|'+p.group;if(!sets.has(key))sets.set(key,[]);sets.get(key).push(p);}
    for(const lines of sets.values()) {
      const b=bounds(lines),tol=Math.max(b.w,b.h,1)*1e-7;
      const key=p=>p.map(v=>Math.round(v/tol)).join(',');const nodes=new Map(),edges=[];
      for(const line of lines)for(let i=0;i<line.points.length-1;i++) {
        const a=line.points[i],b=line.points[i+1],ka=key(a),kb=key(b);if(ka===kb)continue;
        const edge={a,b,ka,kb,used:false};edges.push(edge);
        for(const k of [ka,kb]){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(edge);}
      }
      for(const first of edges) {
        if(first.used||nodes.get(first.ka).length!==2||nodes.get(first.kb).length!==2)continue;
        const pts=[first.a];let current=first,at=first.kb;first.used=true;let closed=false;
        for(let count=0;count<edges.length;count++) {
          if(at===first.ka){closed=true;break;}
          const nexts=nodes.get(at);if(nexts.length!==2)break;
          const next=nexts.find(e=>!e.used);if(!next)break;
          pts.push(next.ka===at?next.a:next.b);next.used=true;at=next.ka===at?next.kb:next.ka;current=next;
        }
        if(closed&&pts.length>=3)result.push({...lines[0],id:'loop-'+result.length,points:pts,closed:true,area:area(pts)});
      }
    }
    return result.filter(p=>p.area>1e-10).sort((a,b)=>b.area-a.area);
  }
  function validPolygon(poly) {
    if(poly.length<3||poly.length>4000||poly.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v)))||area(poly)<1e-8)return false;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(let i=0;i<poly.length;i++)for(let j=i+1;j<poly.length;j++) {
      if(j===i+1||(i===0&&j===poly.length-1))continue;
      const a=poly[i],b=poly[(i+1)%poly.length],c=poly[j],d=poly[(j+1)%poly.length];
      const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
      const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-9&&r[0]>=Math.min(p[0],q[0])-1e-9&&r[0]<=Math.max(p[0],q[0])+1e-9&&r[1]>=Math.min(p[1],q[1])-1e-9&&r[1]<=Math.max(p[1],q[1])+1e-9;
      if((ac*ad<0&&ca*cb<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;
    }
    return true;
  }
  const inside=(p,poly)=>LX.calc.pointInPoly(p[0],p[1],poly)||LX.calc.distToPoly(p[0],p[1],poly)<1e-6;
  function build(model,options) {
    const all=contours(model.paths),boundary=all.find(p=>p.id===options.boundary);
    const scale=Number(options.scale);if(!boundary)throw Error('請選擇封閉空間邊界；開放線條請先在 CAD 連接成封閉多段線。');
    if(!Number.isFinite(scale)||scale<=0)throw Error('請設定正確圖面單位或校正尺寸。');
    const b=bounds([boundary]);const transform=p=>[(p[0]-b.minX)*scale,(b.maxY-p[1])*scale];
    const polygon=boundary.points.map(transform);if(!validPolygon(polygon))throw Error('空間邊界自交或面積無效，請重新選擇。');
    if(b.w*scale<0.5||b.h*scale<0.5||b.w*scale>500||b.h*scale>500)throw Error('空間尺寸應介於 0.5 至 500 m，請核對單位或選定區域。');
    const layers=new Set(options.deskLayers||[]),blocks=new Set(options.deskBlocks||[]),manual=new Set(options.manual||[]),excluded=new Set(options.excluded||[]);
    let candidates=all.filter(p=>p.id!==boundary.id&&!excluded.has(p.id)&&(manual.has(p.id)||layers.has(p.layer)||blocks.has(p.block)));
    // Keep outer contours, avoiding nested pedestal/keyboard outlines. No bounding-box guessing.
    candidates=candidates.filter(p=>!candidates.some(q=>q!==p&&q.area>p.area*1.00001&&p.points.every(pt=>inside(pt,q.points))));
    const desks=[],seenPolygons=new Set();let rejected=0;
    for(const c of candidates) {
      const points=c.points.map(transform),a=area(points);
      const key=points.map(p=>p.map(v=>Math.round(v*10000)).join(',')).sort().join('|');
      if(seenPolygons.has(key))continue;seenPolygons.add(key);
      if(a<0.03||!validPolygon(points)||!points.every(p=>inside(p,polygon))){rejected++;continue;}
      // Also reject edges leaving a concave room even when endpoints lie inside.
      let contained=true;
      for(let i=0;i<points.length;i++)for(let j=1;j<10;j++) {
        const p=points[i],q=points[(i+1)%points.length];if(!inside([p[0]+(q[0]-p[0])*j/10,p[1]+(q[1]-p[1])*j/10],polygon))contained=false;
      }
      if(!contained){rejected++;continue;}
      desks.push({id:'desk-'+desks.length,name:'桌面 '+(desks.length+1),polygon:points,height:0.75,layer:c.layer,block:c.block,sourceId:c.id});
    }
    if(desks.length>1000)throw Error('辨識超過 1,000 個桌面，請縮小圖層或區域。');
    // Automatic luminaire identification
    const fixLayers=new Set(options.fixtureLayers||[]),fixBlocks=new Set(options.fixtureBlocks||[]);
    const autoFixtures=options.autoFixtures!==false;
    const fixtures=[],seenFix=[];
    if(autoFixtures&&Array.isArray(model.rawFixtures)){
      for(const rf of model.rawFixtures){
        const isFixLayer=fixLayers.has(rf.layer)||/燈|light|lamp|luminaire|fixture|led/i.test(rf.layer);
        const isFixBlock=fixBlocks.has(rf.block)||/燈|light|lamp|luminaire|downlight|panel|spot/i.test(rf.block);
        if(!isFixLayer&&!isFixBlock)continue;
        const pRoom=transform([rf.x,rf.y]);
        if(!inside(pRoom,polygon))continue;
        if(seenFix.some(s=>Math.hypot(s.x-pRoom[0],s.y-pRoom[1])<0.18))continue;
        seenFix.push({x:pRoom[0],y:pRoom[1]});

        let typeId='dl-panel-6060-ugr19',name='舞光 60×60 低眩光平板燈 30W (UGR<19)',lm=3300,w=30,beam=85,susp=0;
        const rw=(rf.w||0)*scale,rh=(rf.h||0)*scale,rDia=(rf.dia||(rf.r?rf.r*2:0))*scale;
        const tag=(rf.layer+' '+(rf.block||'')).toLowerCase();
        if(tag.includes('投射')||tag.includes('軌道')||tag.includes('spot')||tag.includes('track')){
          typeId='dl-tr-cupid-15w';name='舞光 邱比特軌道投射燈 15W 36°';lm=1200;w=15;beam=36;susp=0.15;
        }else if(rw>=0.8||rh>=0.8){
          typeId='dl-panel-30120-40w';name='舞光 120×30 長型柔光平板燈 40W';lm=4000;w=40;beam=112;
        }else if(rw>=0.45&&rw<=0.75&&rh>=0.45&&rh<=0.75){
          typeId='dl-panel-6060-ugr19';name='舞光 60×60 低眩光平板燈 30W (UGR<19)';lm=3300;w=30;beam=85;
        }else if(rDia>0.135||tag.includes('15')||tag.includes('150')){
          typeId='dl-150-thor-15w';name='舞光 15cm 索爾崁燈 15W (廣角)';lm=1500;w=15;beam=115;
        }else if(rDia>0.112||tag.includes('12')||tag.includes('120')){
          typeId='dl-120-thor-12w';name='舞光 12cm 索爾崁燈 12W';lm=1150;w=12;beam=110;
        }else{
          typeId='dl-95-bd-12w';name='舞光 9.5cm 黑鑽石防眩崁燈 12W';lm=1050;w=12;beam=36;
        }
        fixtures.push({
          id:'cad-fix-'+fixtures.length,
          typeId,name,
          x:+pRoom[0].toFixed(3),
          y:+pRoom[1].toFixed(3),
          z:2.7,
          lumens:lm,
          watts:w,
          beam,
          dim:100,
          tilt:0,
          rot:+(rf.rot||0).toFixed(1),
          sourceLayer:rf.layer,
          sourceBlock:rf.block
        });
      }
    }
    // Partition wall extraction
    const wallLayers=new Set(options.wallLayers||[]);
    const walls=[];
    if(Array.isArray(model.rawWalls)){
      for(const rw of model.rawWalls){
        const isWallLayer=wallLayers.has(rw.layer)||/牆|wall|隔間|柱|partition/i.test(rw.layer);
        if(!isWallLayer)continue;
        const p1=transform(rw.p1),p2=transform(rw.p2);
        if(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])<0.04)continue;
        if(Math.max(p1[0],p2[0])<-0.2||Math.min(p1[0],p2[0])>b.w*scale+0.2||Math.max(p1[1],p2[1])<-0.2||Math.min(p1[1],p2[1])>b.h*scale+0.2)continue;
        walls.push({
          p1,p2,
          x1:+p1[0].toFixed(3),y1:+p1[1].toFixed(3),
          x2:+p2[0].toFixed(3),y2:+p2[1].toFixed(3),
          minX:+Math.min(p1[0],p2[0]).toFixed(3),
          maxX:+Math.max(p1[0],p2[0]).toFixed(3),
          minY:+Math.min(p1[1],p2[1]).toFixed(3),
          maxY:+Math.max(p1[1],p2[1]).toFixed(3),
          height:Number(options.wallHeight||2.8),
          layer:rw.layer
        });
      }
    }
    const background=model.paths.filter(p=>{const bb=bounds([p]);return bb.maxX>=b.minX&&bb.minX<=b.maxX&&bb.maxY>=b.minY&&bb.minY<=b.maxY;}).map(p=>({...p,points:p.points.map(transform)}));
    return {polygon,desks,fixtures,walls,background,scale,width:b.w*scale,length:b.h*scale,area:area(polygon),rejected,origin:[b.minX,b.maxY],unit:model.unit};
  }
  function allDesks(project) {
    return [...(project?.cad?.desks || []), ...(project?.desks || [])];
  }
  function allWalls(project) {
    return [...(project?.cad?.walls || []), ...(project?.walls || [])];
  }
  function hasZoneMode(project) {
    return Boolean(project?.cad || (project?.desks && project.desks.length > 0));
  }
  function surfaceAt(project,x,y) {
    if(!hasZoneMode(project))return {height:project.room.wp,kind:'uniform',desk:null};
    const desk=allDesks(project).find(d=>LX.calc.pointInPoly(x,y,d.polygon));
    return {height:desk?(desk.height??0.75):0,kind:desk?'desk':'floor',desk:desk||null};
  }
  LX.cad={parse,contours,bounds,build,area,validPolygon,surfaceAt,allDesks,allWalls,hasZoneMode};
})(window.LX=window.LX||{});
