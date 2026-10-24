// VLC Redesign skin generator — pure Node, no dependencies.
// Rebuilds all PNG assets + theme.xml and packages dist/VLC-Redesign.vlt
// Design concept: "VLC Redesign" by Juxtopposed (Figma Community, CC BY 4.0)
import fs from "node:fs";
import path from "node:path";

// ---------- colors ----------
const C = {
  BG0: [19,19,22,255], BG1: [23,23,27,255], BG2: [35,35,41,255],
  FG: [237,237,242,255], FGDIM: [201,201,209,255], FGMOSS: [154,154,163,255],
  ACC: [255,136,0,255], ACCB: [255,171,64,255], ACCD: [217,111,0,255],
  TRACK: [46,46,52,255], STRIP: [17,17,20,235],
};

// ---------- canvas ----------
function cvs(w, h) { return { w, h, c: new Float32Array(w*h*4) }; }
function paint(c, x, y, col, cov) {
  if (x<0||y<0||x>=c.w||y>=c.h||cov<=0) return;
  const i = (y*c.w+x)*4, a = col[3]/255*cov;
  if (a>=1) { c.c[i]=col[0]; c.c[i+1]=col[1]; c.c[i+2]=col[2]; c.c[i+3]=255; return; }
  const da = c.c[i+3]/255, na = a + da*(1-a);
  if (na<=0) return;
  c.c[i]   = (col[0]*a + c.c[i]*da*(1-a))/na;
  c.c[i+1] = (col[1]*a + c.c[i+1]*da*(1-a))/na;
  c.c[i+2] = (col[2]*a + c.c[i+2]*da*(1-a))/na;
  c.c[i+3] = na*255;
}
function draw(c, x0, y0, bw, bh, inside, col) {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(c.w-1, Math.ceil(x0+bw));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(c.h-1, Math.ceil(y0+bh));
  for (let y=ya; y<=yb; y++) for (let x=xa; x<=xb; x++) {
    let cov = 0;
    for (let sy=0; sy<3; sy++) for (let sx=0; sx<3; sx++)
      if (inside(x+(sx+0.5)/3, y+(sy+0.5)/3)) cov++;
    paint(c, x, y, col, cov/9);
  }
}
const rrect = (x,y,w,h,r) => (px,py) => {
  const cx = Math.max(x+r, Math.min(px, x+w-r)), cy = Math.max(y+r, Math.min(py, y+h-r));
  return px>=x && px<=x+w && py>=y && py<=y+h && ((px-cx)**2+(py-cy)**2 <= r*r);
};
const circle = (cx,cy,r) => (px,py) => (px-cx)**2+(py-cy)**2 <= r*r;
const tri = (a,b,d) => (px,py) => {
  const s = (a[0]-d[0])*(py-d[1]) - (a[1]-d[1])*(px-d[0]);
  const t = (b[0]-a[0])*(py-a[1]) - (b[1]-a[1])*(px-a[0]);
  const u = (d[0]-b[0])*(py-b[1]) - (d[1]-b[1])*(px-b[0]);
  return (s>=0&&t>=0&&u>=0)||(s<=0&&t<=0&&u<=0);
};
const seg = (ax,ay,bx,by,w) => (px,py) => {
  const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
  let t = L2? ((px-ax)*dx+(py-ay)*dy)/L2 : 0; t=Math.max(0,Math.min(1,t));
  const qx=ax+t*dx, qy=ay+t*dy; return (px-qx)**2+(py-qy)**2 <= (w/2)**2;
};

// ---------- PNG encoder (indexed color, stored deflate) ----------
const crcT = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i=0;i<b.length;i++) c = crcT[(c^b[i])&0xFF] ^ (c>>>8); return (c^0xFFFFFFFF)>>>0; }
function adler32(b) { let a=1,s=0; for (let i=0;i<b.length;i++){ s=(s+b[i])%65521; a=(a+1)%65521; } return ((a<<16)|s)>>>0; }
function pngChunk(type, data) {
  const out = new Uint8Array(12+data.length);
  out[0]=data.length&255; out[1]=(data.length>>>8)&255; out[2]=(data.length>>>16)&255; out[3]=(data.length>>>24)&255;
  for (let i=0;i<4;i++) out[4+i]=type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8+data.length));
  out[8+data.length]=crc&255; out[9+data.length]=(crc>>>8)&255; out[10+data.length]=(crc>>>16)&255; out[11+data.length]=(crc>>>24)&255;
  return out;
}
function pngIndexed(cv) {
  const { w, h } = cv;
  const palKey = new Map(); const pal = [];
  const idx = new Uint8Array(w*h);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const i=(y*w+x)*4;
    const r=Math.round(cv.c[i]), g=Math.round(cv.c[i+1]), b=Math.round(cv.c[i+2]), a=Math.round(cv.c[i+3]);
    const key = r+","+g+","+b+","+a;
    let pi = palKey.get(key);
    if (pi===undefined) { pi = pal.length; pal.push([r,g,b,a]); palKey.set(key, pi); }
    idx[y*w+x] = pi;
  }
  const raw = new Uint8Array((w+1)*h);
  for (let y=0;y<h;y++) { raw[y*(w+1)] = 0; for (let x=0;x<w;x++) raw[y*(w+1)+1+x] = idx[y*w+x]; }
  const blocks = [];
  let p = 0;
  while (p < raw.length) {
    const n = Math.min(65535, raw.length - p);
    const last = p+n >= raw.length;
    blocks.push(last?1:0, n&255, (n>>>8)&255, (n^0xFFFF)&255, ((n^0xFFFF)>>>8)&255);
    for (let i=0;i<n;i++) blocks.push(raw[p+i]);
    p += n;
  }
  const body = Uint8Array.from(blocks);
  const z = new Uint8Array(2+body.length+4);
  z[0]=0x78; z[1]=0x01; z.set(body,2);
  const ad = adler32(raw);
  z[2+body.length]=ad&255; z[3+body.length]=(ad>>>8)&255; z[4+body.length]=(ad>>>16)&255; z[5+body.length]=(ad>>>24)&255;
  const ihdr = new Uint8Array(13);
  ihdr[0]=w>>>24;ihdr[1]=(w>>>16)&255;ihdr[2]=(w>>>8)&255;ihdr[3]=w&255;
  ihdr[4]=h>>>24;ihdr[5]=(h>>>16)&255;ihdr[6]=(h>>>8)&255;ihdr[7]=h&255;
  ihdr[8]=8; ihdr[9]=3; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const plte = new Uint8Array(pal.length*3);
  pal.forEach((c,i)=>{ plte[i*3]=c[0]; plte[i*3+1]=c[1]; plte[i*3+2]=c[2]; });
  const trns = new Uint8Array(pal.length);
  pal.forEach((c,i)=>trns[i]=c[3]);
  const sig = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("PLTE", plte), pngChunk("tRNS", trns), pngChunk("IDAT", z), pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s,p2)=>s+p2.length,0);
  const out = new Uint8Array(total); let o=0;
  for (const p2 of parts) { out.set(p2,o); o+=p2.length; }
  return Buffer.from(out);
}

// ---------- zip ----------
function makeZip(files) {
  const locals = []; const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const sz = f.data.length;
    const lh = new Uint8Array(30+name.length);
    lh.set([0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],0);
    lh[14]=crc&255; lh[15]=(crc>>>8)&255; lh[16]=(crc>>>16)&255; lh[17]=(crc>>>24)&255;
    lh[18]=sz&255; lh[19]=(sz>>>8)&255; lh[22]=sz&255; lh[23]=(sz>>>8)&255;
    lh[26]=name.length&255; lh[27]=0;
    lh.set(name, 30);
    const full = new Uint8Array(lh.length+sz);
    full.set(lh,0); full.set(f.data, lh.length);
    locals.push(full);
    const ch = new Uint8Array(46+name.length);
    ch.set([0x50,0x4b,0x01,0x02],0);
    ch[4]=20; ch[6]=20;
    ch[16]=crc&255; ch[17]=(crc>>>8)&255; ch[18]=(crc>>>16)&255; ch[19]=(crc>>>24)&255;
    ch[20]=sz&255; ch[21]=(sz>>>8)&255; ch[24]=sz&255; ch[25]=(sz>>>8)&255;
    ch[28]=name.length&255;
    ch[42]=offset&255; ch[43]=(offset>>>8)&255; ch[44]=(offset>>>16)&255; ch[45]=(offset>>>24)&255;
    ch.set(name, 46);
    centrals.push(ch);
    offset += full.length;
  }
  const cdSize = centrals.reduce((s,c)=>s+c.length,0);
  const eocd = new Uint8Array(22);
  eocd.set([0x50,0x4b,0x05,0x06],0);
  eocd[8]=files.length&255; eocd[10]=files.length&255;
  eocd[12]=cdSize&255; eocd[13]=(cdSize>>>8)&255; eocd[14]=(cdSize>>>16)&255; eocd[15]=(cdSize>>>24)&255;
  eocd[16]=offset&255; eocd[17]=(offset>>>8)&255; eocd[18]=(offset>>>16)&255; eocd[19]=(offset>>>24)&255;
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total); let o = 0;
  for (const l of locals) { out.set(l,o); o+=l.length; }
  for (const c of centrals) { out.set(c,o); o+=c.length; }
  out.set(eocd,o);
  return Buffer.from(out);
}

// ---------- assets ----------
const files = [];
const add = (name, cv) => files.push({ name, data: pngIndexed(cv) });

function bgTile(r) { const c = cvs(64,64); draw(c,0,0,64,64,rrect(0,0,64,64,r),C.BG0); return c; }
add("bg_main.png", bgTile(2)); add("bg_pl.png", bgTile(2)); add("bg_eq.png", bgTile(2));
{ const c = cvs(16,76); draw(c,0,0,16,76,()=>true,C.STRIP); add("ctrl_strip.png", c); }
{ const c = cvs(16,16); draw(c,0,0,16,16,()=>true,C.BG1); add("pl_bg.png", c); }

const playS = [0,1,2].map(i => { const c=cvs(52,52); draw(c,0,0,52,52,circle(26,26,25),[C.ACC,C.ACCB,C.ACCD][i]); draw(c,0,0,52,52,tri([22,15],[22,37],[39,26]),C.BG0); return c; });
const pauseS = [0,1,2].map(i => { const c=cvs(52,52); draw(c,0,0,52,52,circle(26,26,25),[C.ACC,C.ACCB,C.ACCD][i]); draw(c,0,0,52,52,rrect(18,16,6,20,2),C.BG0); draw(c,0,0,52,52,rrect(29,16,6,20,2),C.BG0); return c; });
playS.forEach((c,i)=>add(`btn_play_${["up","over","down"][i]}.png`,c));
pauseS.forEach((c,i)=>add(`btn_pause_${["up","over","down"][i]}.png`,c));

const mkIcon = (w,h,fn) => {
  const arr = [];
  for (const col of [C.FGDIM, C.ACC, C.FG]) { const c=cvs(w,h); fn(c,col); arr.push(c); }
  return arr;
};
const prevIc = mkIcon(30,30,(c,col)=>{ draw(c,0,0,30,30,rrect(7,10,3,10,1),col); draw(c,0,0,30,30,tri([24,8],[24,22],[13,15]),col); });
const nextIc = mkIcon(30,30,(c,col)=>{ draw(c,0,0,30,30,rrect(20,10,3,10,1),col); draw(c,0,0,30,30,tri([6,8],[17,15],[6,22]),col); });
const menuIc = mkIcon(28,28,(c,col)=>{ for (const y of [8,13,18]) draw(c,0,0,28,28,rrect(6,y,16,2,1),col); });
const fsIc = mkIcon(28,28,(c,col)=>{ const t=2.4;
  draw(c,0,0,28,28,rrect(5,5,8,t,1),col); draw(c,0,0,28,28,rrect(5,5,t,8,1),col);
  draw(c,0,0,28,28,rrect(15,5,8,t,1),col); draw(c,0,0,28,28,rrect(21,5,t,8,1),col);
  draw(c,0,0,28,28,rrect(5,21,8,t,1),col); draw(c,0,0,28,28,rrect(5,15,t,8,1),col);
  draw(c,0,0,28,28,rrect(15,21,8,t,1),col); draw(c,0,0,28,28,rrect(21,15,t,8,1),col); });
const plIc = mkIcon(28,28,(c,col)=>{ for (const y of [7,13,19]) draw(c,0,0,28,28,rrect(5,y,12,2,1),col); draw(c,0,0,28,28,tri([20,8],[27,12.5],[20,17]),col); });
const eqIc = mkIcon(28,28,(c,col)=>{ for (const x of [6,12,18]) draw(c,0,0,28,28,rrect(x,6,2.4,16,1),col); draw(c,0,0,28,28,circle(7.2,12,2.4),col); draw(c,0,0,28,28,circle(13.2,18,2.4),col); draw(c,0,0,28,28,circle(19.2,9,2.4),col); });
const volIc = mkIcon(28,28,(c,col)=>{ draw(c,0,0,28,28,tri([5,11],[11,11],[11,17]),col); draw(c,0,0,28,28,rrect(3,11,8,6,1),col);
  draw(c,0,0,28,28,seg(14,14,16,9,2),col); draw(c,0,0,28,28,seg(16,9,18,10,2),col); draw(c,0,0,28,28,seg(18,10,14,14,2),col);
  draw(c,0,0,28,28,seg(17,17,21,11,2),col); draw(c,0,0,28,28,seg(21,11,23,12,2),col); draw(c,0,0,28,28,seg(23,12,17,17,2),col); });
const muteIc = mkIcon(28,28,(c,col)=>{ draw(c,0,0,28,28,tri([5,11],[11,11],[11,17]),col); draw(c,0,0,28,28,rrect(3,11,8,6,1),col);
  draw(c,0,0,28,28,seg(15,9,24,19,2.2),col); draw(c,0,0,28,28,seg(15,19,24,9,2.2),col); });
const closeIc = mkIcon(24,24,(c,col)=>{ draw(c,0,0,24,24,seg(7,7,17,17,2.2),col); draw(c,0,0,24,24,seg(7,17,17,7,2.2),col); });
const minIc = mkIcon(24,24,(c,col)=>{ draw(c,0,0,24,24,rrect(7,11,10,2,1),col); });
const iconSets = { prev: prevIc, next: nextIc, menu: menuIc, fs: fsIc, pl: plIc, eq: eqIc, vol: volIc, mute: muteIc, close: closeIc, min: minIc };
for (const [n, arr] of Object.entries(iconSets)) arr.forEach((c,i)=>add(`ic_${n}_${["up","over","down"][i]}.png`, c));

const seekT = [C.ACC, C.ACCB, C.ACCD].map(col=>{ const c=cvs(14,14); draw(c,0,0,14,14,circle(7,7,6.5),col); return c; });
seekT.forEach((c,i)=>add(`thumb_seek_${["up","over","down"][i]}.png`,c));
for (const [n,col] of [["vol_up",C.ACC],["vol_over",C.ACCB],["vol_down",C.ACCD]]) { const c=cvs(12,12); draw(c,0,0,12,12,circle(6,6,5.5),col); add(`thumb_${n}.png`,c); }
for (const [n,col] of [["eq",C.ACC],["eq_over",C.ACCB]]) { const c=cvs(18,8); draw(c,0,0,18,8,rrect(0,0,18,8,4),col); add(`thumb_${n}.png`,c); }
{ const c=cvs(14,14); draw(c,0,0,14,14,circle(7,7,5.5),C.ACC); add("led_on.png",c); }
{ const c=cvs(14,14); draw(c,0,0,14,14,circle(7,7,5.5),C.BG2); add("led_off.png",c); }
{ const c=cvs(12,12); draw(c,0,0,12,12,circle(6,6,2.6),C.ACC); add("item.png",c); }
{ const c=cvs(10,10); draw(c,0,0,10,10,tri([2,3],[8,3],[5,7]),C.FGMOSS); add("collapse.png",c); }
{ const c=cvs(10,10); draw(c,0,0,10,10,tri([3,2],[3,8],[7,5]),C.FGMOSS); add("expand.png",c); }

const NSEEK = 41;
{ const c = cvs(NSEEK*100, 16);
  for (let f=0; f<NSEEK; f++) {
    const ox = f*100;
    draw(c,ox,0,100,16,rrect(ox,6,100,4,2),C.TRACK);
    const w = Math.round(100*f/(NSEEK-1));
    if (w>0) draw(c,ox,0,w,16,rrect(ox,6,w,4,2),C.ACC);
  }
  add("seekanim.png", c); }
{ const c = cvs(101*24, 16);
  for (let f=0; f<101; f++) {
    const ox = f*24;
    draw(c,ox,0,24,16,rrect(ox,6,24,4,2),C.TRACK);
    const w = Math.round(24*f/100);
    if (w>0) draw(c,ox,0,w,16,rrect(ox,6,w,4,2),C.ACC);
  }
  add("volanim.png", c); }

// ---------- theme.xml ----------
const bmps = files.map(f => `  <Bitmap id="${f.name.replace(".png","")}" file="${f.name}"/>`).join("\n");
const bands = Array.from({length:10}, (_,n) =>
  `      <Slider id="eq.band${n}" x="${121+20*n}" y="36" points="(0,115),(0,5)" value="equalizer.band(${n})" tooltiptext="Band ${n}" up="thumb_eq" over="thumb_eq_over" down="thumb_eq_over"/>`).join("\n");
const theme = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Theme PUBLIC "-//VideoLAN//DTD VLC Skins V2.0//EN" "skin.dtd">
<Theme version="2.0" alpha="255" movealpha="255">
  <ThemeInfo name="VLC Redesign (Community)" author="Miguel Garcia - design concept by Juxtopposed (CC BY 4.0)" email="" webpage=""/>
${bmps}

  <Window id="main" position="Center">
    <Layout id="normal" width="960" height="560" minwidth="960" maxwidth="960" minheight="420" maxheight="99999">
      <Image id="main.bg" image="bg_main" resize="scale" lefttop="lefttop" rightbottom="rightbottom" action="move"/>
      <Video id="main.video" x="0" y="0" width="960" height="484" lefttop="lefttop" rightbottom="rightbottom"/>
      <Panel id="main.controls" y="0" width="0" height="76" lefttop="leftbottom" rightbottom="rightbottom">
        <Image id="main.controls.strip" image="ctrl_strip" resize="scale" lefttop="lefttop" rightbottom="rightbottom"/>
        <Button id="main.controls.menu" x="16" y="24" up="ic_menu_up" over="ic_menu_over" down="ic_menu_down" action="dialogs.popup()" tooltiptext="VLC Menu"/>
        <Button id="main.controls.prev" x="58" y="23" up="ic_prev_up" over="ic_prev_over" down="ic_prev_down" action="vlc.prev()" tooltiptext="Previous"/>
        <Checkbox id="main.controls.play" x="100" y="12" state="vlc.isPlaying" up1="btn_play_up" up2="btn_pause_up" down1="btn_play_down" down2="btn_pause_down" over1="btn_play_over" over2="btn_pause_over" action1="vlc.play()" action2="vlc.pause()" tooltiptext1="Play" tooltiptext2="Pause"/>
        <Button id="main.controls.next" x="164" y="23" up="ic_next_up" over="ic_next_over" down="ic_next_down" action="vlc.next()" tooltiptext="Next"/>
        <Text id="main.controls.time" text="$T / $D" font="defaultfont" color="#C9C9D1" x="212" y="31" width="150" alignment="left"/>
        <Slider id="main.controls.seek" x="368" y="30" points="(0,8),(340,8)" value="time" tooltiptext="Seek: $T / $D" up="thumb_seek_up" over="thumb_seek_over" down="thumb_seek_down">
          <SliderBackground id="main.controls.seek.bg" image="seekanim" nbhor="${NSEEK}"/>
        </Slider>
        <Checkbox id="main.controls.mute" x="716" y="24" state="vlc.isMuted" up1="ic_vol_up" up2="ic_mute_up" down1="ic_vol_down" down2="ic_mute_down" over1="ic_vol_over" over2="ic_mute_over" action1="vlc.mute()" action2="vlc.mute()" tooltiptext1="Mute" tooltiptext2="Unmute"/>
        <Slider id="main.controls.vol" x="752" y="30" points="(0,8),(44,8)" value="volume" tooltiptext="Volume: $V%" up="thumb_vol_up" over="thumb_vol_over" down="thumb_vol_down">
          <SliderBackground id="main.controls.vol.bg" image="volanim" nbhor="101"/>
        </Slider>
        <Button id="main.controls.pl" x="816" y="24" up="ic_pl_up" over="ic_pl_over" down="ic_pl_down" action="plwin.show()" tooltiptext="Playlist"/>
        <Button id="main.controls.eq" x="854" y="24" up="ic_eq_up" over="ic_eq_over" down="ic_eq_down" action="eqwin.show()" tooltiptext="Equalizer"/>
        <Button id="main.controls.fs" x="892" y="24" up="ic_fs_up" over="ic_fs_over" down="ic_fs_down" action="vlc.fullscreen()" tooltiptext="Fullscreen"/>
      </Panel>
    </Layout>
  </Window>

  <Window id="plwin" position="Center" xoffset="20%" yoffset="10%" visible="false">
    <Layout id="plwin-normal" width="500" height="350" minwidth="300" maxwidth="99999" minheight="200" maxheight="99999">
      <Image id="pl.bg" image="bg_pl" resize="scale" lefttop="lefttop" rightbottom="rightbottom" action="move"/>
      <Panel id="pl.titlebar" width="0" height="40" lefttop="lefttop" rightbottom="righttop">
        <Button id="pl.titlebar.menu" x="12" y="8" up="ic_menu_up" over="ic_menu_over" down="ic_menu_down" action="dialogs.popup()" tooltiptext="VLC Menu"/>
        <Text id="pl.titlebar.text" text="Playlist" font="defaultfont" color="#EDEDF2" x="48" y="12" width="120"/>
        <Button id="pl.titlebar.min" x="436" y="8" up="ic_min_up" over="ic_min_over" down="ic_min_down" action="vlc.minimize()" lefttop="righttop" rightbottom="righttop" tooltiptext="Minimize"/>
        <Button id="pl.titlebar.close" x="464" y="8" up="ic_close_up" over="ic_close_over" down="ic_close_down" action="plwin.hide()" lefttop="righttop" rightbottom="righttop" tooltiptext="Close Playlist"/>
      </Panel>
      <Playtree id="theplaytree" font="defaultfont" fgcolor="#C9C9D1" selcolor="#FF8800" playcolor="#FF8800" bgimage="pl_bg" itemimage="item" openimage="collapse" closedimage="expand" x="12" y="44" width="476" height="294" lefttop="lefttop" rightbottom="rightbottom"/>
    </Layout>
  </Window>

  <Window id="eqwin" position="Center" xoffset="40%" yoffset="40%" visible="false">
    <Layout id="eqwin-main" width="330" height="171" minwidth="330" maxwidth="330" minheight="171" maxheight="171">
      <Image id="eq.bg" image="bg_eq" resize="scale" lefttop="lefttop" rightbottom="rightbottom" action="move"/>
      <Button id="eq.menu" x="8" y="8" up="ic_menu_up" over="ic_menu_over" down="ic_menu_down" action="dialogs.popup()" tooltiptext="VLC Menu"/>
      <Text id="eq.title" text="Equalizer" font="defaultfont" color="#EDEDF2" x="44" y="12" width="120"/>
      <Checkbox id="eq.onoff" x="286" y="10" state="equalizer.isEnabled" up1="led_off" up2="led_on" down1="none" down2="none" over1="none" over2="none" action1="equalizer.enable()" action2="equalizer.disable()" tooltiptext1="Enable Equalizer" tooltiptext2="Disable Equalizer"/>
      <Button id="eq.close" x="302" y="8" up="ic_close_up" over="ic_close_over" down="ic_close_down" action="eqwin.hide()" lefttop="righttop" rightbottom="righttop" tooltiptext="Close Equalizer"/>
      <Slider id="eq.preamp" x="81" y="36" points="(0,115),(0,5)" value="equalizer.preamp" tooltiptext="Preamp (dB)" up="thumb_eq" over="thumb_eq_over" down="thumb_eq_over"/>
${bands}
    </Layout>
  </Window>
</Theme>
`;
files.unshift({ name: "theme.xml", data: Buffer.from(theme, "utf8") });

// ---------- output ----------
fs.mkdirSync("skin", { recursive: true });
fs.mkdirSync("dist", { recursive: true });
for (const f of files) {
  if (f.name === "theme.xml") fs.writeFileSync(path.join("skin", "theme.xml"), f.data);
  else fs.writeFileSync(path.join("skin", f.name), f.data);
}
fs.writeFileSync(path.join("dist", "VLC-Redesign.vlt"), makeZip(files));
console.log(`Built ${files.length} files -> skin/ and dist/VLC-Redesign.vlt`);
