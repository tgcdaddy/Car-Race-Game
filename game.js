(() => {
"use strict";

/* ============================================================
   RETRO ROAD CHALLENGE
   Self-contained HTML5 Canvas + Web Audio game.
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", {alpha:false});
ctx.imageSmoothingEnabled = false;

const W = 320, H = 240;
const menu = document.getElementById("menu");
const how = document.getElementById("how");
const pause = document.getElementById("pause");
const stageScreen = document.getElementById("stage");
const gameover = document.getElementById("gameover");
const touchControls = document.getElementById("touchControls");

const $ = id => document.getElementById(id);

let DPR = 1, scaleX = 1, scaleY = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * DPR);
  canvas.height = Math.floor(window.innerHeight * DPR);
  scaleX = canvas.width / W;
  scaleY = canvas.height / H;
}
window.addEventListener("resize", resize);
resize();

function drawGameCanvas() {
  ctx.setTransform(scaleX,0,0,scaleY,0,0);
}

const COLORS = {
  skyDay:"#1720a8", skyNight:"#03083e", grass:"#003b08",
  road:"#202020", road2:"#2a2a2a", edge:"#d6d6d6",
  white:"#f5f5f5", yellow:"#b3a51c", red:"#b91515"
};

const envs = [
  {name:"DAY", sky:"#1720a8", grass:"#003b08", road:"#242424", fog:0, snow:0, stars:0},
  {name:"SUNSET", sky:"#7b1b48", grass:"#17310a", road:"#292727", fog:.02, snow:0, stars:0},
  {name:"NIGHT", sky:"#03083e", grass:"#001d05", road:"#171717", fog:.06, snow:0, stars:1},
  {name:"FOG", sky:"#59657b", grass:"#293729", road:"#414141", fog:.38, snow:0, stars:0},
  {name:"SUNRISE", sky:"#8b4d49", grass:"#16340d", road:"#292929", fog:.08, snow:0, stars:0},
  {name:"SNOW", sky:"#49658c", grass:"#c7d1d8", road:"#454545", fog:.17, snow:.8, stars:0},
  {name:"DAY", sky:"#1720a8", grass:"#003b08", road:"#242424", fog:0, snow:0, stars:0}
];

const stages = Array.from({length:10},(_,i)=>({
  day:i+1,
  target:180+i*35,
  traffic:.55+i*.06,
  maxSpeed:1.05+i*.055,
  env:i===0?0:(i%6)
}));

let state = "MENU";
let last = performance.now();
let time = 0;
let countdown = 0;
let stage = 0;
let score = 0;
let overtaken = 0;
let speed = 0;
let distance = 0;
let bestScore = +(localStorage.getItem("rrcBest")||0);
let bestDay = +(localStorage.getItem("rrcDay")||1);
let soundOn = localStorage.getItem("rrcSound") !== "off";
let control = {left:false,right:false,accel:false,brake:false};

let player = {x:0, steer:0, width:0.105, z:0.93, tilt:0};
let cars = [];
let particles = [];
let roadside = [];
let roadPhase = 0;
let curve = 0;
let curveTarget = 0;
let shake = 0;
let flash = 0;

class AudioManager {
  constructor(){ this.ctx=null; this.master=null; this.engine=null; this.engineGain=null; }
  init(){
    if(this.ctx) { if(this.ctx.state==="suspended") this.ctx.resume(); return; }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=soundOn?.16:0; this.master.connect(this.ctx.destination);
  }
  set(on){soundOn=on; localStorage.setItem("rrcSound",on?"on":"off"); if(this.master)this.master.gain.setTargetAtTime(on?.16:0,this.ctx.currentTime,.02);}
  tone(freq,dur,type="square",vol=.08){
    if(!this.ctx||!soundOn)return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);
    g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+dur);
    o.connect(g);g.connect(this.master);o.start();o.stop(this.ctx.currentTime+dur+.02);
  }
  noise(dur=.12,vol=.05){
    if(!this.ctx||!soundOn)return;
    const b=this.ctx.createBuffer(1,this.ctx.sampleRate*dur,this.ctx.sampleRate);
    const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.5);
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain();s.buffer=b;g.gain.value=vol;s.connect(g);g.connect(this.master);s.start();
  }
  startEngine(){
    if(!this.ctx||this.engine)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
    o.type="sawtooth";o.frequency.value=55;f.type="lowpass";f.frequency.value=900;g.gain.value=.0001;
    o.connect(f);f.connect(g);g.connect(this.master);o.start();
    this.engine=o;this.engineGain=g;
  }
  updateEngine(v){
    if(!this.engine||!this.ctx)return;
    this.engine.frequency.setTargetAtTime(48+v*105,this.ctx.currentTime,.04);
    this.engineGain.gain.setTargetAtTime(.012+v*.032,this.ctx.currentTime,.06);
  }
  stopEngine(){if(this.engine){this.engine.stop();this.engine=null;this.engineGain=null;}}
}
const audio = new AudioManager();

function showOnly(el){
  [menu,how,pause,stageScreen,gameover].forEach(x=>x.classList.add("hidden"));
  if(el)el.classList.remove("hidden");
}
function pad(n,len=6){return String(Math.max(0,Math.floor(n))).padStart(len,"0")}
function stageEnv(){return envs[stages[stage].env%envs.length]}

function menuUpdate(){
  $("menuBest").textContent=pad(bestScore);
  $("menuDay").textContent=String(bestDay).padStart(2,"0");
  $("soundBtn").textContent=`SOUND: ${soundOn?"ON":"OFF"}`;
  $("pauseSoundBtn").textContent=`SOUND: ${soundOn?"ON":"OFF"}`;
}

function resetWorld(){
  score=0;overtaken=0;speed=0;distance=0;roadPhase=0;curve=0;curveTarget=0;shake=0;flash=0;
  player.x=0;player.steer=0;cars=[];particles=[];roadside=[];
  for(let i=0;i<34;i++) roadside.push({side:i%2?1:-1,z:(i+1)/34+Math.random()*.03,kind:Math.random()<.45?"tree":Math.random()<.5?"bush":"sign"});
  spawnInitialTraffic();
}

function spawnInitialTraffic(){
  const n=12;
  for(let i=0;i<n;i++) spawnCar(.18+i*.075+Math.random()*.07);
}
function spawnCar(z=.02){
  const lane=(Math.floor(Math.random()*5)-2)/2.0;
  cars.push({
    x:lane*.62+(Math.random()-.5)*.07,
    z,
    speed:.38+Math.random()*.48,
    color:["#f2e7b0","#d52a2a","#2c7ad7","#e7e7e7","#e39d20","#53b35c"][Math.floor(Math.random()*6)],
    width:.065+Math.random()*.015,
    passed:false,
    laneDrift:Math.random()<.25,
    drift:0
  });
}

function startGame(){
  audio.init(); audio.startEngine();
  stage=Math.max(0,Math.min(9,stage));
  resetWorld();
  state="COUNTDOWN"; countdown=3.2;
  showOnly(null); touchControls.classList.remove("hidden");
}

function nextStage(){
  stage=Math.min(9,stage+1);
  resetWorld(); state="COUNTDOWN"; countdown=3.2; showOnly(null);
}

function pauseGame(){
  if(state!=="PLAYING")return;
  state="PAUSED"; audio.stopEngine(); showOnly(pause);
}
function resumeGame(){
  if(state!=="PAUSED")return;
  audio.init();audio.startEngine();state="PLAYING";showOnly(null);
}
function gameOver(){
  state="GAMEOVER"; audio.stopEngine(); touchControls.classList.add("hidden");
  if(score>bestScore){bestScore=score;localStorage.setItem("rrcBest",bestScore)}
  if(stage+1>bestDay){bestDay=stage+1;localStorage.setItem("rrcDay",bestDay)}
  $("overStats").innerHTML=`<p>DAY ${String(stage+1).padStart(2,"0")}</p><p>OVERTAKEN ${pad(overtaken,3)}</p><p>SCORE ${pad(score)}</p><p>BEST ${pad(bestScore)}</p>`;
  showOnly(gameover);menuUpdate();
}
function stageComplete(){
  state="STAGE";audio.stopEngine();touchControls.classList.add("hidden");
  $("stageStats").innerHTML=`<p>DAY ${String(stage+1).padStart(2,"0")}</p><p>OVERTAKEN ${pad(overtaken,3)}</p><p>SCORE ${pad(score)}</p>`;
  showOnly(stageScreen); menuUpdate();
}

function project(z){
  // z=0 horizon, z=1 player
  const p=Math.max(0,Math.min(1,z));
  const y=56 + Math.pow(p,1.72)*166;
  const roadHalf=8 + Math.pow(p,1.18)*151;
  const bend=Math.sin(roadPhase*.55 + p*2.1)*curve*42;
  const cx=160+bend;
  return {y,cx,half:roadHalf};
}

function roadCurveAt(p){
  return Math.sin(roadPhase*.55+p*2.05)*curve;
}

function update(dt){
  time+=dt;
  const cfg=stages[stage], env=stageEnv();

  if(state==="COUNTDOWN"){
    countdown-=dt;
    if(countdown<=0){state="PLAYING";audio.startEngine();}
    return;
  }
  if(state!=="PLAYING")return;

  // Speed
  const accel=control.accel?1:0, brake=control.brake?1:0;
  const target=accel?cfg.maxSpeed:(.54+cfg.maxSpeed*.22);
  speed += (target-speed)*dt*(accel?2.2:0.9);
  if(brake)speed-=dt*.9;
  speed=Math.max(.16,Math.min(cfg.maxSpeed,speed));
  audio.updateEngine(speed/cfg.maxSpeed);

  // Steering
  let steer=(control.left?-1:0)+(control.right?1:0);
  player.steer += (steer-player.steer)*Math.min(1,dt*8);
  player.x += player.steer*dt*(.82+speed*.35);
  player.x=Math.max(-.92,Math.min(.92,player.x));

  roadPhase += dt*(.75+speed*1.65);
  curveTarget=Math.sin(time*.18+stage)*.82;
  curve += (curveTarget-curve)*dt*.35;

  // Roadside
  for(const o of roadside){
    o.z += dt*(.23+speed*.62);
    if(o.z>1.08){o.z=Math.random()*.04; o.side=Math.random()<.5?-1:1; o.kind=Math.random()<.45?"tree":Math.random()<.5?"bush":"sign";}
  }

  // Traffic
  const spawnChance=dt*(.8+cfg.traffic*1.4);
  if(Math.random()<spawnChance && cars.length<18) spawnCar(.02+Math.random()*.07);

  for(const c of cars){
    c.z += dt*(.20+speed*.60-c.speed*.23);
    if(c.laneDrift){c.drift += dt*(.4+Math.random()*.2);c.x += Math.sin(c.drift)*dt*.018;}
    if(c.z>.93 && c.z<1.06 && !c.passed){
      const dx=Math.abs(c.x-player.x);
      if(dx<.12){
        // collision
        speed*=.58; shake=.16; flash=.12; audio.noise(.16,.11);
        c.z=.88; c.x+=player.x>c.x?-.13:.13;
        if(speed<.25){gameOver();return;}
      }
    }
    if(c.z>.98 && !c.passed){
      c.passed=true;overtaken++;score+=10+Math.floor(speed*12);audio.tone(850,.055,"square",.045);
      if(overtaken>=cfg.target){stageComplete();return;}
    }
  }
  cars=cars.filter(c=>c.z<1.18);
  distance += speed*dt;

  // Snow/fog particles
  if(env.snow && Math.random()<dt*45){
    particles.push({x:Math.random()*320,y:-3,z:Math.random(),vx:(Math.random()-.5)*.4,vy:.5+Math.random()*.7});
  }
  for(const p of particles){p.x+=p.vx*dt*35;p.y+=p.vy*dt*35*(1+speed);p.z+=dt*.2}
  particles=particles.filter(p=>p.y<245);

  if(shake>0)shake-=dt;if(flash>0)flash-=dt;
}

function drawBackground(env){
  ctx.fillStyle=env.sky;ctx.fillRect(0,0,W,H);
  if(env.stars){
    for(let i=0;i<45;i++){const x=(i*73)%320,y=(i*37)%52;ctx.fillStyle=i%5?"#b8c8ff":"#fff";ctx.fillRect(x,y,1,1);}
  }
  if(env.name==="SUNSET"||env.name==="SUNRISE"){
    ctx.fillStyle=env.name==="SUNSET"?"#ffb42e":"#ffd66a";ctx.fillRect(143,42,34,18);
  }
  // mountains
  ctx.fillStyle=env.name==="SNOW"?"#b6c5cf":"#6f7317";
  for(let i=0;i<3;i++){
    const bx=i*125-25;
    ctx.beginPath();ctx.moveTo(bx,65);ctx.lineTo(bx+55,50-(i%2)*6);ctx.lineTo(bx+120,65);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle=env.grass;ctx.fillRect(0,64,W,176);
}

function drawRoad(env){
  // Render road as horizontal perspective slices for curved pseudo-3D.
  for(let i=0;i<92;i++){
    const z0=i/92,z1=(i+1)/92;
    const a=project(z0),b=project(z1);
    const c0=a.cx+roadCurveAt(z0)*8,c1=b.cx+roadCurveAt(z1)*8;
    ctx.fillStyle=((i+Math.floor(roadPhase*4))%2)?"#252525":env.road;
    ctx.beginPath();
    ctx.moveTo(c0-a.half,a.y);ctx.lineTo(c0+a.half,a.y);
    ctx.lineTo(c1+b.half,b.y);ctx.lineTo(c1-b.half,b.y);ctx.closePath();ctx.fill();

    // edge strips
    ctx.fillStyle=(i%3===0)?"#e5e5e5":"#8c8c8c";
    const ew=Math.max(1,a.half*.035);
    ctx.beginPath();
    ctx.moveTo(c0-a.half,a.y);ctx.lineTo(c0-a.half+ew,a.y);
    ctx.lineTo(c1-b.half+ew,b.y);ctx.lineTo(c1-b.half,b.y);ctx.closePath();ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c0+a.half-ew,a.y);ctx.lineTo(c0+a.half,a.y);
    ctx.lineTo(c1+b.half,b.y);ctx.lineTo(c1+b.half-ew,b.y);ctx.closePath();ctx.fill();
  }

  // lane markers
  for(let lane=-2;lane<=2;lane++){
    if(lane===-2||lane===2)continue;
    for(let k=0;k<16;k++){
      let z=((k/16)+(roadPhase*.18))%1;
      let z2=Math.min(1,z+.018);
      const p=project(z),q=project(z2);
      const x=p.cx + (p.half*.48*lane);
      const x2=q.cx + (q.half*.48*lane);
      const w=Math.max(1,p.half*.012);
      ctx.fillStyle="#b7b7b7";
      ctx.beginPath();ctx.moveTo(x-w,p.y);ctx.lineTo(x+w,p.y);ctx.lineTo(x2+w,q.y);ctx.lineTo(x2-w,q.y);ctx.closePath();ctx.fill();
    }
  }
}

function drawRoadside(env){
  for(const o of roadside.slice().sort((a,b)=>a.z-b.z)){
    const p=project(o.z);
    const x=p.cx+o.side*(p.half+4+o.z*18);
    const s=.25+o.z*1.4;
    if(o.kind==="tree"){
      ctx.fillStyle=env.name==="SNOW"?"#65717b":"#392e0d";ctx.fillRect(x-2*s,p.y-12*s,4*s,13*s);
      ctx.fillStyle=env.name==="SNOW"?"#eef3f5":"#12630f";
      ctx.fillRect(x-8*s,p.y-20*s,16*s,10*s);ctx.fillRect(x-6*s,p.y-26*s,12*s,8*s);
    } else if(o.kind==="bush"){
      ctx.fillStyle=env.name==="SNOW"?"#eef3f5":"#237217";ctx.fillRect(x-7*s,p.y-5*s,14*s,7*s);
    } else {
      ctx.fillStyle="#777";ctx.fillRect(x-1*s,p.y-12*s,2*s,12*s);
      ctx.fillStyle=o.z>.65?"#d0b21b":"#a9a9a9";ctx.fillRect(x-6*s,p.y-18*s,12*s,7*s);
    }
  }
}

function drawCar(c,isPlayer=false){
  const p=isPlayer?project(.94):project(c.z);
  let x=isPlayer?160+player.x*55:p.cx+c.x*p.half*.9;
  let scale=isPlayer?1.15:(.18+c.z*1.18);
  const w=(isPlayer?18:13)*scale;
  const h=(isPlayer?10:8)*scale;
  if(c && !isPlayer) {
    // shadow
    ctx.fillStyle="rgba(0,0,0,.45)";ctx.fillRect(x-w*.7,p.y+1,w*1.4,Math.max(1,2*scale));
    ctx.fillStyle=c.color;ctx.fillRect(x-w/2,p.y-h,w,h);
    ctx.fillStyle="#151515";ctx.fillRect(x-w*.35,p.y-h*.65,w*.7,h*.25);
    ctx.fillStyle="#111";ctx.fillRect(x-w*.62,p.y-h*.55,w*.18,h*.42);ctx.fillRect(x+w*.44,p.y-h*.55,w*.18,h*.42);
    ctx.fillStyle="#ff3030";ctx.fillRect(x-w*.33,p.y-h*.18,w*.18,Math.max(1,1.4*scale));ctx.fillRect(x+w*.15,p.y-h*.18,w*.18,Math.max(1,1.4*scale));
  } else {
    ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(x-12,p.y+1,24,3);
    ctx.fillStyle="#e7e7e7";ctx.fillRect(x-10,p.y-11,20,10);
    ctx.fillStyle="#c9c9c9";ctx.fillRect(x-7,p.y-14,14,4);
    ctx.fillStyle="#141414";ctx.fillRect(x-6,p.y-10,12,4);
    ctx.fillStyle="#111";ctx.fillRect(x-13,p.y-9,4,8);ctx.fillRect(x+9,p.y-9,4,8);
    ctx.fillStyle="#333";ctx.fillRect(x-12,p.y-3,24,3);
    ctx.fillStyle="#eaeaea";ctx.fillRect(x-8,p.y-1,16,2);
    if(stageEnv().name==="NIGHT"){
      ctx.fillStyle="#fff5b0";ctx.fillRect(x-8,p.y-14,4,2);ctx.fillRect(x+4,p.y-14,4,2);
    }
  }
}

function drawParticles(){
  for(const p of particles){
    ctx.fillStyle="rgba(245,250,255,.8)";
    const s=1+Math.random()*1.5;ctx.fillRect(p.x,p.y,s,s);
  }
}

function drawFog(env){
  if(env.fog>0){
    const g=ctx.createLinearGradient(0,55,0,210);
    g.addColorStop(0,`rgba(210,220,225,${env.fog})`);
    g.addColorStop(.55,`rgba(210,220,225,${env.fog*.35})`);
    g.addColorStop(1,"rgba(210,220,225,0)");
    ctx.fillStyle=g;ctx.fillRect(0,50,320,170);
  }
}

function drawHUD(){
  const cfg=stages[stage], env=stageEnv();
  ctx.fillStyle="#050505";ctx.fillRect(7,7,126,30);ctx.fillRect(188,7,125,30);
  ctx.strokeStyle="#b71919";ctx.lineWidth=2;ctx.strokeRect(7,7,126,30);ctx.strokeRect(188,7,125,30);
  ctx.fillStyle="#fff";ctx.font="bold 9px monospace";
  ctx.fillText(`DAY ${String(stage+1).padStart(2,"0")}  ${env.name}`,12,17);
  ctx.fillText(`TARGET ${String(cfg.target).padStart(3,"0")}`,12,29);
  ctx.fillText(`SCORE ${pad(score)}`,193,17);
  ctx.fillText(`PASS ${pad(overtaken,3)}`,193,29);

  // speed bar
  ctx.fillStyle="#090909";ctx.fillRect(8,202,90,12);
  ctx.fillStyle="#eee";ctx.fillRect(10,204,86*(speed/cfg.maxSpeed),8);
  ctx.fillStyle="#fff";ctx.font="bold 7px monospace";ctx.fillText("SPEED",102,211);

  if(state==="COUNTDOWN"){
    const n=Math.ceil(countdown);
    ctx.fillStyle="#fff";ctx.font="bold 34px monospace";ctx.textAlign="center";
    ctx.fillText(n>0?n:"GO!",160,128);ctx.textAlign="left";
  }
}

function render(){
  drawGameCanvas();
  const env=stageEnv();
  let ox=0,oy=0;if(shake>0){ox=(Math.random()-.5)*shake*20;oy=(Math.random()-.5)*shake*12;}
  ctx.save();ctx.translate(ox,oy);
  drawBackground(env);
  drawRoad(env);
  drawRoadside(env);
  cars.sort((a,b)=>a.z-b.z);
  for(const c of cars)drawCar(c,false);
  drawCar(null,true);
  drawParticles();
  drawFog(env);
  drawHUD();
  if(flash>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(.45,flash*3)})`;ctx.fillRect(0,0,W,H);}
  ctx.restore();
}

function loop(now){
  const dt=Math.min(.033,(now-last)/1000);last=now;
  update(dt);render();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* Input */
function setKey(k,v){control[k]=v}
window.addEventListener("keydown",e=>{
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key))e.preventDefault();
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")setKey("left",true);
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")setKey("right",true);
  if(e.key==="ArrowUp"||e.key.toLowerCase()==="w")setKey("accel",true);
  if(e.key==="ArrowDown"||e.key.toLowerCase()==="s")setKey("brake",true);
  if(e.key===" "){if(state==="PLAYING")pauseGame();else if(state==="PAUSED")resumeGame();}
});
window.addEventListener("keyup",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")setKey("left",false);
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")setKey("right",false);
  if(e.key==="ArrowUp"||e.key.toLowerCase()==="w")setKey("accel",false);
  if(e.key==="ArrowDown"||e.key.toLowerCase()==="s")setKey("brake",false);
});
document.querySelectorAll(".touch").forEach(btn=>{
  const k=btn.dataset.key;
  if(!k)return;
  const down=e=>{e.preventDefault();audio.init();setKey(k,true);btn.setPointerCapture?.(e.pointerId)};
  const up=e=>{e.preventDefault();setKey(k,false)};
  btn.addEventListener("pointerdown",down);btn.addEventListener("pointerup",up);
  btn.addEventListener("pointercancel",up);btn.addEventListener("pointerleave",up);
});

/* Buttons */
$("playBtn").onclick=()=>{stage=0;startGame()};
$("howBtn").onclick=()=>{showOnly(how)};
$("backBtn").onclick=()=>{showOnly(menu);menuUpdate()};
$("soundBtn").onclick=()=>{audio.init();audio.set(!soundOn);menuUpdate()};
$("fullBtn").onclick=async()=>{audio.init();try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}};
$("resumeBtn").onclick=resumeGame;
$("restartBtn").onclick=()=>startGame();
$("pauseSoundBtn").onclick=()=>{audio.init();audio.set(!soundOn);menuUpdate()};
$("pauseMenuBtn").onclick=()=>{state="MENU";audio.stopEngine();touchControls.classList.add("hidden");showOnly(menu);menuUpdate()};
$("nextBtn").onclick=nextStage;
$("retryBtn").onclick=()=>startGame();
$("overMenuBtn").onclick=()=>{state="MENU";showOnly(menu);menuUpdate()};
$("touchPause").onclick=()=>{if(state==="PLAYING")pauseGame()};

menuUpdate();

/* Initial decorative state */
function initialRoadScene(){
  resetWorld(); state="MENU";
}
initialRoadScene();

})();
