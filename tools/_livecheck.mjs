import puppeteer from "puppeteer";
const URL = "https://apservice-application.github.io/SurvivalCraft2/";
const b = await puppeteer.launch({headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const p = await b.newPage();
await p.emulate({viewport:{width:412,height:915,isMobile:true,hasTouch:true,deviceScaleFactor:1},userAgent:"Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"});
const errs=[];
p.on("pageerror",e=>errs.push(e.message));
p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
console.log("เปิด:", URL);
await p.goto(URL,{waitUntil:"load",timeout:60000});
await p.waitForFunction("document.getElementById('loading').classList.contains('done')",{timeout:60000}).catch(()=>console.log("(loading overlay ยังไม่หาย)"));
await new Promise(r=>setTimeout(r,3000));
const st = await p.evaluate(()=>{const g=window.SC2;return g?{seed:g.seed,tiles:g.renderer.stats.tilesDrawn,props:g.renderer.stats.propsDrawn,chunks:g.chunks.stats.loaded,fps:+g.fps.toFixed(0),biome:g.currentBiome,hud:document.getElementById("txt-time").textContent,sw:!!navigator.serviceWorker.controller||"registering"}:null;});
console.log("สถานะบนเว็บจริง:", JSON.stringify(st));
// ลองเดินด้วยนิ้วสัมผัส + ถ่ายภาพ
const before = await p.evaluate(()=>({x:window.SC2.player.x,y:window.SC2.player.y}));
const t=p.touchscreen; await t.touchStart(90,600);
for(let i=1;i<=8;i++){await t.touchMove(90,600+i*10);await new Promise(r=>setTimeout(r,70));}
for(let i=0;i<8;i++){await t.touchMove(90,680);await new Promise(r=>setTimeout(r,70));}
await t.touchEnd();
const after = await p.evaluate(()=>({x:window.SC2.player.x,y:window.SC2.player.y}));
console.log("เดินด้วยการสัมผัสได้:", Math.hypot(after.x-before.x,after.y-before.y).toFixed(2), "tile");
await p.screenshot({path:"docs/screenshots/live-github-pages.png"});
console.log("error:", errs.length? errs.slice(0,3): "ไม่มี");
await b.close();
