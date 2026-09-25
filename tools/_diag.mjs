import puppeteer from "puppeteer";
const b = await puppeteer.launch({headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const p = await b.newPage();
await p.emulate({viewport:{width:412,height:915,isMobile:true,hasTouch:true,deviceScaleFactor:1},userAgent:"Mozilla/5.0 (Linux; Android 13; Pixel 6) Chrome/120 Mobile"});
p.on("pageerror",e=>console.log("PAGEERROR:",e.message));
p.on("console",m=>{ if(m.type()==="error") console.log("CONSOLE.ERR:",m.text()); });
await p.goto("file:///home/user/SurvivalCraft2/web/dist/index.html",{waitUntil:"load"});
await p.waitForFunction("document.getElementById('loading').classList.contains('done')",{timeout:60000});
await new Promise(r=>setTimeout(r,2000));

const state = async (tag) => {
  const s = await p.evaluate(()=>{const g=window.SC2;return {tag:"", cam:{x:+g.camera.x.toFixed(1),y:+g.camera.y.toFixed(1),zoom:+g.camera.zoom.toFixed(1),vw:g.camera.viewW,vh:g.camera.viewH},
    player:{x:+g.player.x.toFixed(1),y:+g.player.y.toFixed(1)}, tiles:g.renderer.stats.tilesDrawn, props:g.renderer.stats.propsDrawn,
    chunkLoaded:g.chunks.stats.loaded, queue:g.chunks.stats.queued, generated:g.chunks.stats.generated,
    frameMs:+g.renderer.stats.frameMs.toFixed(1), fps:+g.fps.toFixed(0), paused:g.paused, hour:+g.time.hour.toFixed(2), light:+g.time.light.toFixed(2),
    canvas:{w:document.getElementById("game").width,h:document.getElementById("game").height,cw:document.getElementById("game").clientWidth},
    dpr:g.renderer.dpr, biome:g.currentBiome, dead:g.player.stats.dead};});
  s.tag=tag; console.log(JSON.stringify(s));
  return s;
};

await state("A: start");
await p.keyboard.down("d"); await new Promise(r=>setTimeout(r,1200)); await p.keyboard.up("d");
await state("B: after keyboard walk");
await p.keyboard.down("Shift"); await p.keyboard.down("d"); await new Promise(r=>setTimeout(r,1200)); await p.keyboard.up("d"); await p.keyboard.up("Shift");
await state("C: after sprint");
const t = p.touchscreen;
await t.touchStart(90,640);
for (let i=1;i<=8;i++){await t.touchMove(90,640+i*9);await new Promise(r=>setTimeout(r,60));}
for (let i=0;i<10;i++){await t.touchMove(90,712);await new Promise(r=>setTimeout(r,60));}
await t.touchEnd(); await new Promise(r=>setTimeout(r,200));
await state("D: after touch joystick");
// roam loop เหมือนในเทสต์
await p.evaluate(async ()=>{const g=window.SC2;for(let i=0;i<30;i++){g.input.axis.x=Math.cos(i);g.input.axis.y=Math.sin(i*1.7);await new Promise(r=>setTimeout(r,100));}g.input.axis.x=0;g.input.axis.y=0;});
await state("E: after roam loop (ตั้ง axis ตรง ๆ)");
// กลางคืน + พายุ
await p.evaluate(()=>{const g=window.SC2;g.time.hour=22.5;g.weather.current={id:"storm",name:"พายุ",visual:"storm",lightMul:0.5,visibility:0.5,tempDelta:-3.4,wetness:0.4,movePenalty:0.86};g.player.stats.stamina=80;});
await new Promise(r=>setTimeout(r,2200));
await state("F: night + storm");
await p.screenshot({path:"/tmp/d2-night.png"});
await p.evaluate(()=>{window.SC2.time.hour=9.5;window.SC2.weather.current={id:"clear",name:"ท้องฟ้าแจ่มใส",visual:"none",lightMul:1,visibility:1,tempDelta:0};});
await new Promise(r=>setTimeout(r,900));
await state("G: back to day");
// save/load/new world
const sv = await p.evaluate(()=>{const g=window.SC2;g.player.x+=7.5;g.player.stats.hp=63;g.time.day=3;const ok=g.save("manual");g.newWorld(999);const after={seed:g.seed};g.load("manual");return {ok,after,now:{seed:g.seed,tiles:g.renderer.stats.tilesDrawn}};});
console.log("save/load:",JSON.stringify(sv));
await new Promise(r=>setTimeout(r,600));
await state("H: after save/load/newWorld");
// teleport ไปทะเลทราย (เหมือนทัวร์ biome)
const found = await p.evaluate(()=>{const g=window.SC2;for(let r=4;r<900;r+=4){for(let a=0;a<12;a++){const th=a/12*Math.PI*2;const x=Math.round(g.spawnPoint.x+Math.cos(th)*r),y=Math.round(g.spawnPoint.y+Math.sin(th)*r);if(g.gen.biomeAt(x,y)==="desert")return{x:x+0.5,y:y+0.5};}}return null;});
await p.evaluate(f=>{const g=window.SC2;g.player.x=f.x;g.player.y=f.y;g.camera.x=f.x;g.camera.y=f.y;g.player.stats.hp=100;g.player.stats.hunger=100;g.player.stats.thirst=100;g.time.hour=10.5;},found);
await new Promise(r=>setTimeout(r,1600));
await state("I: teleport desert");
await p.screenshot({path:"/tmp/d2-desert.png"});
await new Promise(r=>setTimeout(r,1500));
await state("J: desert +1.5s");
await p.screenshot({path:"/tmp/d2-desert2.png"});
await b.close();
