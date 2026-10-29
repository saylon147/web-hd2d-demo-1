const esc = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;');
const text = (x,y,value,size=15,anchor='start',color='#34403c') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${esc(value)}</text>`;
const line = (x1,y1,x2,y2,color='#647369',width=1,dash='') => `<path d="M${x1},${y1} L${x2},${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} fill="none"/>`;
const rectangle = (x,y,w,h,fill,stroke='none') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/>`;
const wrap = (width,height,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Segoe UI,Microsoft YaHei,sans-serif}</style><rect width="100%" height="100%" fill="#f2f2e9"/>${body}</svg>`;

export function floorPlans(report) {
  const h=report.house, s=report.stair;
  let result=text(40,38,'M2.1 V1 · 净尺寸、门洞、楼梯与通行检查',26);
  for (const [index,level,title] of [[0,'ground','一层 · 6×6 m'],[1,'basement','地下室 · 与一层垂直对齐']]) {
    const offset=index*750, scale=78, X=(x)=>offset+100+(x+3)*scale, Z=(z)=>135+(z+3)*scale;
    const floorY=level==='ground' ? h.floorY : h.basementFloorY;
    const rect=(bounds,fill,stroke='none')=>rectangle(X(bounds[0]),Z(bounds[1]),(bounds[2]-bounds[0])*scale,(bounds[3]-bounds[1])*scale,fill,stroke);
    result+=text(offset+100,84,title,22)+text(offset+100,111,`地板 Y=${floorY.toFixed(2)} m · 净高 ${level==='ground'?'2.70':'2.40'} m`,14);
    result+=rect([-3,-3,3,3],'#ddd1b9','#706c5d');
    const rooms=level==='ground'?h.groundRooms:h.basementRooms;
    for (const [j,room] of rooms.entries()) {
      if (level==='ground' && j===0) continue;
      result+=rect(room.rect,['#cbd5bf','#d8c2a8','#bfcfce'][j], '#919a89');
    }
    if(level==='ground')result+=text(X(-0.85),Z(2.35),'客厅 / 厨房 + 共用通道',14,'middle');
    for(const item of report.planFurniture.filter((item)=>item.floor===level)) {
      result+=rect(item.boundsXZ,'#aaa58c','#79796a');
    }
    // Exact wall intervals and openings from the same Boolean wall parameters as the GLB.
    for(const wall of report.planWalls.filter((wall)=>Math.abs(wall.floorY-floorY)<0.01)) {
      const bounds=wall.axis==='x'?[wall.low,wall.fixed-wall.thickness/2,wall.high,wall.fixed+wall.thickness/2]:[wall.fixed-wall.thickness/2,wall.low,wall.fixed+wall.thickness/2,wall.high];
      result+=rect(bounds,'#6e715f');
      for(const [u,width,sill] of wall.openings) {
        const opening=wall.axis==='x'?[u-width/2,wall.fixed-wall.thickness/2-0.01,u+width/2,wall.fixed+wall.thickness/2+0.01]:[wall.fixed-wall.thickness/2-0.01,u-width/2,wall.fixed+wall.thickness/2+0.01,u+width/2];
        result+=rect(opening,sill===0?'#f2f2e9':'#a2c5cc');
        if(sill!==0) continue;
        const x=X(wall.axis==='x'?u-width/2:wall.fixed), z=Z(wall.axis==='x'?wall.fixed:u-width/2), r=width*scale;
        // Bathroom swings outward; bedroom swings into its clear bedside aisle.
        const sign=wall.name.startsWith('GF_Bathroom')?-1:1;
        if(wall.axis==='z') {
          result+=line(x,z,x+sign*r,z,'#8b694a',2);
          result+=`<path d="M${x},${z+r} A${r},${r} 0 0 ${sign===1?0:1} ${x+sign*r},${z}" stroke="#8b694a" fill="none" stroke-dasharray="4 3"/>`;
        } else {
          result+=line(x,z,x,z-r,'#8b694a',2);
          result+=`<path d="M${x+r},${z} A${r},${r} 0 0 0 ${x},${z-r}" stroke="#8b694a" fill="none" stroke-dasharray="4 3"/>`;
        }
        result+=text(X(wall.axis==='x'?u:wall.fixed)+6,Z(wall.axis==='x'?wall.fixed:u)-5,`${width.toFixed(2)} m`,11);
      }
    }
    result+=rect(s.footprint,'#c1b79b','#706652');
    const [left,back,right,front]=s.footprint;
    if(level==='ground')result+=rect([right,back,right+0.06,front],'#676e5d');
    for(let n=0;n<=8;n++)for(const lane of [0,1]) {
      const x=left+lane*(s.flightWidth+0.15), z=back+s.landing+n*s.tread;
      result+=line(X(x),Z(z),X(x+s.flightWidth),Z(z),'#716c5f');
    }
    result+=text(X((left+right)/2),Z(back+0.48),'U 形梯 / 平台',12,'middle');
    result+=text(X((left+right)/2),Z(front)+16,'1.95×3.15 m 梯洞',12,'middle');
    for(const [x,direction,label] of [[left+s.flightWidth/2,-1,'↑ 上'],[right-s.flightWidth/2,1,'↓ 上']]) {
      const zz=back+s.landing+1.25;
      result+=line(X(x),Z(zz+direction*0.6),X(x),Z(zz-direction*0.6),'#4d5e61',3);
      result+=text(X(x),Z(zz)-7,label,12,'middle');
    }
    // Plan arrows denote the upward U route: lower lane rearward, upper lane forward.
    for(const points of Object.values(report.circulation.routes)) {
      if(points[0][0]!==level)continue;
      result+=`<polyline points="${points.map(([,point])=>`${X(point[0])},${Z(point[1])}`).join(' ')}" stroke="#46837b" stroke-width="3" fill="none" stroke-dasharray="5 4"/>`;
    }
    for(const [j,room] of rooms.entries()) {
      if(level==='ground' && j===0)continue;
      const [a,b,c,d]=room.rect;
      const names=level==='ground'?['客厅 / 厨房','卧室','浴室']:['储藏','工作区','休憩 / 阅读'];
      const x=(a+c)/2, z=level==='ground'?(j===1?-0.3:1.68):(j===0?1.85:j===1?-1.25:0.95);
      result+=rectangle(X(x)-62,Z(z)-24,124,44,'#f2f2e9');
      result+=text(X(x),Z(z)-7,names[j],15,'middle')+text(X(x),Z(z)+13,`${(c-a).toFixed(2)}×${(d-b).toFixed(2)} m`,11,'middle');
    }
    result+=line(X(-3),Z(3)+30,X(3),Z(3)+30)+text(X(0),Z(3)+51,'6.00 m 外墙 / 5.40 m 内净',13,'middle');
    result+=text(offset+100,700,level==='ground'?`净卧室 6.13㎡ · 净浴室 2.66㎡ · 客厨/共用通道 ${h.groundRooms[0].areaM2.toFixed(2)}㎡`:'储藏净墙界 · 工作与阅读为开放分区，未当作独立净房间',14);
    result+=text(offset+100,726,level==='ground'?'走廊 0.94 m · 床侧 0.80 m / 床尾 0.75 m · 浴室门向外开':'16×0.175 m 踏高 · 0.275 m 踏面 · 梯宽 0.90 m · 平台 0.95 m',13);
  }
  result+=text(40,778,'绿虚线：0.60 m 带宽路线检查通过 · 棕线：门扇开启示意（房门不作为运行时实体） · 蓝色：窗洞',14);
  result+=text(40,807,'后侧 −Z ↑ / 入口 +Z ↓ · 门宽为净洞口宽度 · 家具为占地体块 · 紧凑单人小屋候选，非建筑规范认证',14);
  return wrap(1500,835,result);
}

export function landPlan(report) {
  const scale=22, X=(x)=>420+x*scale, Z=(z)=>335+z*scale;
  let body=text(35,40,'可用陆地 / 小屋占地 · 实际网格采样并去重',25);
  for(const [left,z,right] of report.land.surveyRunsXZ)body+=rectangle(X(left),Z(z),(right-left)*scale,report.land.gridStepM*scale,'#9cac8a');
  const h=report.house, cx=h.center[0], cz=h.center[1];
  body+=rectangle(X(cx-h.width/2),Z(cz-h.depth/2),h.width*scale,h.depth*scale,'#b8785e','#6b5146');
  body+=text(X(cx),Z(cz),`小屋 ${h.width*h.depth}㎡`,15,'middle');
  const c=report.coastalStair;
  body+=line(X(c.x),Z(c.upperStartZ),X(c.x),Z(c.lowerEndZ),'#7b6c55',c.width*scale);
  body+=text(800,115,`可用投影面积 ${report.land.areaM2.toFixed(2)}㎡`,20);
  body+=text(800,151,`陆地 / 小屋 = ${report.land.ratio.toFixed(4)}×`,20);
  body+=text(800,193,`可行走外部：${report.land.exteriorNavigableM2.toFixed(2)}㎡`,16);
  body+=text(800,225,'另计占用的小屋平台：36㎡',16);
  body+=text(800,268,`排除种植床 / 树干 ${report.land.plantedExcludedM2.toFixed(2)}㎡`,16);
  body+=text(800,300,`排除不连通缓坡 ${report.land.disconnectedExcludedM2.toFixed(2)}㎡`,16);
  body+=text(800,342,'岩面、海水、码头不计入 9× 目标',16);
  body+=text(800,391,'0.10 m 网格 · 首个表面命中 · 坡度 ≤30°',15);
  body+=text(800,423,'从门廊四邻域连通 · 相邻高度差 ≤0.24 m',15);
  body+=text(800,455,`0.20 m 粗网格差 ${report.land.coarseFineDifferenceM2.toFixed(2)}㎡`,15);
  body+=text(800,502,'绿色为实际连通表面；空白含陡崖/未达区。',15);
  body+=text(800,539,'楼梯覆盖绿色采样显示位置；面积已去重。',15);
  body+=text(40,689,'固定正俯视：一单位 = 一米 · 比值目标 8.5–9.5× · 未按目标面积缩放轮廓',16);
  return wrap(1320,730,body);
}

export function sectionOverlay(report,imageUrl) {
  const h=report.house;
  const Y=(y)=>450-(y-report.section.targetY)*900/report.section.orthoScale;
  let body=`<image href="${imageUrl}" x="0" y="0" width="1440" height="900"/>`;
  body+=rectangle(18,18,645,80,'#f2f2e9')+text(36,50,'真实网格切片 · 上跑梯中心 X=0.80 m',24)+text(36,79,'剖面沿 Z · 屋顶为此切面的实形 · 下跑在左侧平行梯道',15);
  for(const [y,label,color] of [[0,'海面 0.00 m','#527785'],[h.basementFloorY,`地下室地板 ${h.basementFloorY.toFixed(2)} m`,'#f6edce'],[h.basementCeilingY,`地下室顶 ${h.basementCeilingY.toFixed(2)} m（梯洞区除外）`,'#f6edce'],[h.floorY,`一层地板 ${h.floorY.toFixed(2)} m`,'#f6edce'],[h.groundCeilingY,`墙顶 ${h.groundCeilingY.toFixed(2)} m / 单层净高 ${h.clearHeight.toFixed(2)} m`,'#f6edce']]) {
    body+=line(540,Y(y),1030,Y(y),color,1.4,'6 4');
    body+=rectangle(1040,Y(y)-21,385,32,'#f2f2e9')+text(1050,Y(y),label,15);
  }
  body+=rectangle(18,811,1390,69,'#f2f2e9')+text(35,840,`岩层内真实空腔 · 底板下表面 ${h.seaClearance.toFixed(2)} m 高于海面 · 楼板梯洞净空 ≥${report.stair.minimumHeadroom.toFixed(2)} m`,19)+text(35,867,`上跑：8级 × 0.175 m · 中平台 Y=${((h.floorY+h.basementFloorY)/2).toFixed(2)} m · 下跑位于并列梯道，详见两层平面；此图不复制第二套楼梯。`,15);
  return wrap(1440,900,body);
}
