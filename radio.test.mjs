import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Execute the actual player and its UI/event handlers with a controlled clock
// and media element. No debug interface is added to the deployed player.
class Element {
  constructor() { this.listeners = new Map(); this.attributes = new Map(); this.style = {}; this.dataset = {}; this.classList = {add(){},remove(){},toggle(){}}; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(name, fn) { const handlers=this.listeners.get(name)||new Set(); handlers.add(fn); this.listeners.set(name,handlers); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  async dispatch(name) { await Promise.all([...this.listeners.get(name)||[]].map(fn=>fn({target:this}))); }
}
class Audio extends Element {
  constructor() { super(); this.paused=true; this.ended=false; this.readyState=1; this.duration=10000; this.time=0; this.plays=[]; this.delayMetadata=false; }
  set src(value) { this.setAttribute('src',value); }
  get src() { return this.getAttribute('src'); }
  set currentTime(value) { this.time=value; }
  get currentTime() { return this.time; }
  pause() { const playing=!this.paused; this.paused=true; if(playing) this.dispatch('pause'); }
  load() { this.time=0; this.ended=false; this.readyState=this.delayMetadata?0:1; this.duration=this.durationFor?.(this.src)||10000; }
  async play() { this.paused=false; this.ended=false; this.plays.push({src:this.src,time:this.time}); await this.dispatch('play'); }
  async finish() { this.time=this.duration; this.paused=true; this.ended=true; await this.dispatch('ended'); }
}
function audioContext() {
  const parameter=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
  const node=()=>({connect(){},gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),reduction:0});
  return {state:'running',currentTime:0,destination:{},createMediaElementSource:node,createGain:node,createBiquadFilter:node,createDynamicsCompressor:node,createAnalyser:()=>({...node(),frequencyBinCount:1024}),resume:async()=>{}};
}
const flush=async()=>{for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};
async function player() {
  let now=Date.parse('2026-09-30T03:00:00Z');
  class Clock extends Date { static now(){return now;} }
  const audio=new Audio();
  const elements=new Map(['play-pause','previous-track','next-track','player-track-title','player-artist','radio-status'].map(id=>[id,new Element()]));
  elements.set('radio-audio',audio);
  const intervals=new Map(),timeouts=new Map(); let timer=0; let onReady;
  const data={drops:{ok:true,drops:[]},music:{ok:true,music:[
    {id:2,genre:'hip-hop',original_filename:'Do_Me_by_Dj_Silvah.mp3',r2_key:'music/2',duration_seconds:220.578,enabled:1},
    {id:3,genre:'hip-hop',original_filename:'Snapz-explicit.mp3',r2_key:'music/3',duration_seconds:160.992,enabled:1}
  ]},'image-ads':{ok:true,ads:[]},videos:{ok:true,videos:[]}};
  const window={AudioContext:audioContext,addEventListener(){},setInterval(fn,ms){intervals.set(++timer,{fn,ms});return timer;},clearInterval(id){intervals.delete(id);},setTimeout(fn,ms){timeouts.set(++timer,{fn,ms});return timer;},clearTimeout(id){timeouts.delete(id);}};
  const document={documentElement:{dataset:{}},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],addEventListener(name,fn){if(name==='DOMContentLoaded') onReady=fn;},createElement:()=>new Element()};
  const logs=[];
  const context=vm.createContext({window,document,Date:Clock,Image:class{},Uint8Array,requestAnimationFrame:()=>1,cancelAnimationFrame(){},console:{warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args),log(){}},fetch:async url=>({ok:true,json:async()=>JSON.parse(JSON.stringify(data[url.split('/').at(-1)]))})});
  let source=readFileSync(new URL('./radio.js',import.meta.url),'utf8');
  source=source.replace(/\n\}\);\s*$/,`\nwindow.__test={ready:liveStationReady,syncToLiveStation,playAdjacentStationItem,switchMusicChannel,buildLiveStationProgram,getLiveStationPosition,loadStationIdsFromApi,loadMusicFromApi,refreshStationCatalog,getRequiredDuration,channelConfig,liveStationPrograms,currentLiveProgramIndexes,liveStationDurations,get channel(){return activeChannel;},get pending(){return livePlaybackPending;}};\n});`);
  vm.runInContext(source,context);
  onReady();
  const api=window.__test;
  audio.durationFor=src=>src ? api.getRequiredDuration({src}) : 10000;
  await api.ready; await flush();
  return {api,audio,data,elements,logs,intervals,timeouts,setNow:value=>{now=value;},advance:seconds=>{now+=seconds*1000;},async click(id){await elements.get(id).dispatch('click');await flush();},async tick(ms){for(const item of intervals.values()) if(item.ms===ms) await item.fn();await flush();}};
}

test('Listen joins the current station offset; paused station clock advances and resume rejoins now',async()=>{
  const p=await player();
  let position=p.api.getLiveStationPosition('lobby');
  assert.equal(p.audio.src,position.item.track.src);
  assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
  await p.click('play-pause'); assert.equal(p.audio.paused,false);
  await p.click('play-pause'); assert.equal(p.audio.paused,true);
  p.advance(500); await p.tick(1000);
  position=p.api.getLiveStationPosition('lobby');
  assert.equal(p.audio.src,position.item.track.src);
  assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
  await p.click('play-pause'); assert.equal(p.audio.paused,false);
  assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
});

test('Next and previous select adjacent programme items from their beginning at every playback position',async()=>{
  const p=await player();
  for(const elapsed of [0.05,5,100,200]) {
    p.audio.currentTime=elapsed;
    const before=p.api.currentLiveProgramIndexes.lobby;
    const program=p.api.liveStationPrograms.lobby;
    await p.click('next-track');
    assert.equal(p.api.currentLiveProgramIndexes.lobby,(before+1)%program.length);
    assert.equal(p.audio.src,program[(before+1)%program.length].track.src);
    assert.equal(p.audio.currentTime,0);
    await p.click('previous-track');
    assert.equal(p.api.currentLiveProgramIndexes.lobby,before);
    assert.equal(p.audio.src,program[before].track.src);
    assert.equal(p.audio.currentTime,0);
  }
});

test('natural ended events automatically advance music and station IDs without clipping starts, including loop wrap',async()=>{
  const p=await player();
  await p.click('play-pause');
  const program=p.api.liveStationPrograms.lobby;
  for(let count=0;count<program.length+1;count++) {
    const before=p.api.currentLiveProgramIndexes.lobby;
    await p.audio.finish(); await flush();
    assert.equal(p.api.currentLiveProgramIndexes.lobby,(before+1)%program.length);
    assert.equal(p.audio.src,program[(before+1)%program.length].track.src);
    assert.equal(p.audio.currentTime,0);
    assert.equal(p.audio.paused,false);
  }
});

test('all populated genre clocks use real durations; empty stations stay silent',async()=>{
  const p=await player();
  for(const channel of ['lobby','hip-hop','rnb','reggae','gospel','house']) {
    p.api.switchMusicChannel(channel); await flush();
    const position=p.api.getLiveStationPosition(channel);
    if(!position) { assert.equal(p.audio.paused,true);continue; }
    await p.click('play-pause');
    assert.equal(p.audio.src,position.item.track.src);
    assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
    await p.audio.finish();await flush();assert.equal(p.audio.paused,false);
    await p.click('play-pause');
  }
  assert.equal(p.logs.filter(args=>String(args[0]).includes('missing duration')).length,0);
});

test('a delayed old seek cannot overwrite a new station after rapid genre changes',async()=>{
  const p=await player();
  p.audio.delayMetadata=true;
  p.api.switchMusicChannel('hip-hop');
  const obsolete=p.api.syncToLiveStation(true);
  await flush();
  p.api.switchMusicChannel('gospel'); await flush();
  p.audio.readyState=1;
  await p.audio.dispatch('loadedmetadata');
  await obsolete;await flush();
  assert.equal(p.audio.src,p.api.getLiveStationPosition('gospel').item.track.src);
  assert.ok(Math.abs(p.audio.currentTime-p.api.getLiveStationPosition('gospel').offset)<0.05);
  assert.equal(p.audio.paused,false);
});

const drop=(slot,stations,overrides={})=>({slot_key:slot,title:slot,artist:'AV Junki Radio',r2_key:`drops/${slot}`,stations:JSON.stringify(stations),duration_seconds:12,enabled:1,version:1,...overrides});

test('small catalogues insert assigned drops and commercials after every four songs, including across loop wrap',async()=>{
  for(const size of [1,2,3,4,5]) {
    const p=await player();
    p.data.music.music=Array.from({length:size},(_,index)=>({id:index+10,genre:'hip-hop',r2_key:`music/${index}`,duration_seconds:100,enabled:1}));
    p.data.drops.drops=[drop('hip-id',['hip-hop']),drop('commercial',['hip-hop'])];
    await p.api.refreshStationCatalog();p.api.switchMusicChannel('hip-hop');await flush();
    const program=p.api.liveStationPrograms['hip-hop'];
    assert.ok(program.some(item=>item.track.title==='commercial'));
    let songs=0;
    for(const item of [...program,...program]) {
      if(item.type==='music') songs++;
      else { assert.equal(songs,4);songs=0; }
    }
    assert.equal(songs,0);
    await p.click('play-pause');
    for(let i=0;i<10;i++) {await p.audio.finish();await flush();assert.equal(p.audio.paused,false);}
    assert.ok(p.audio.plays.some(item=>item.src.includes('/api/audio/commercial')));
  }
});

test('saved drop settings refresh into rotations without restarting current music; disabling removes every drop',async()=>{
  const p=await player();
  p.api.switchMusicChannel('hip-hop');await flush();await p.click('play-pause');
  p.audio.currentTime=90;
  const playing=p.audio.src, playCount=p.audio.plays.length;
  p.data.drops.drops=[drop('new-upload',['hip-hop','rnb'])];
  await p.tick(60000);
  assert.equal(p.audio.src,playing);assert.equal(p.audio.currentTime,90);assert.equal(p.audio.plays.length,playCount);
  assert.ok(p.api.liveStationPrograms['hip-hop'].some(item=>item.track.title==='new-upload'));
  assert.ok(p.api.liveStationPrograms.rnb.some(item=>item.track.title==='new-upload'));
  for(let i=0;i<5;i++) {await p.audio.finish();await flush();}
  assert.ok(p.audio.plays.some(item=>item.src.includes('/api/audio/new-upload')));
  p.data.drops.drops[0].stations=JSON.stringify(['gospel']);
  await p.tick(60000);
  assert.ok(!p.api.liveStationPrograms['hip-hop'].some(item=>item.type==='id'));
  assert.ok(p.api.liveStationPrograms.gospel.some(item=>item.type==='id'));
  p.data.drops.drops[0].enabled=0;await p.tick(60000);
  for(const program of Object.values(p.api.liveStationPrograms)) assert.ok(!program.some(item=>item.type==='id'));
});

test('legacy commercial pools and explicit station assignments stay isolated by genre',async()=>{
  const p=await player();
  p.data.drops.drops=[
    drop('jazz-commercial',[],{stations:'',pool:'jazz'}),
    drop('nightlife-commercial',[],{stations:'',pool:'nightlife'}),
    drop('reggae-id',['reggae']),drop('gospel-id',['gospel']),
    drop('disabled-commercial',['jazz','hip-hop'],{enabled:0})
  ];
  p.data.music.music.push({id:6,genre:'reggae',r2_key:'music/6',duration_seconds:100,enabled:1},{id:7,genre:'house',r2_key:'music/7',duration_seconds:100,enabled:1});
  await p.api.refreshStationCatalog();
  const ids=channel=>new Set(p.api.liveStationPrograms[channel].filter(item=>item.type==='id').map(item=>item.track.title));
  assert.deepEqual(ids('lobby'),new Set(['jazz-commercial']));
  for(const channel of ['hip-hop','rnb','house']) assert.deepEqual(ids(channel),new Set(['nightlife-commercial']));
  assert.deepEqual(ids('reggae'),new Set(['reggae-id']));assert.deepEqual(ids('gospel'),new Set(['gospel-id']));
});

test('music and drop changes in the same refresh retain the playing index and advance to the next item',async()=>{
  const p=await player();
  await p.click('play-pause');const source=p.audio.src;
  p.audio.currentTime=25;
  p.data.music.music.push({id:8,genre:'jazz',r2_key:'music/8',duration_seconds:200,enabled:1});
  p.data.drops.drops=[drop('jazz-new',['jazz'])];
  await p.api.refreshStationCatalog();
  const program=p.api.liveStationPrograms.lobby;
  const index=p.api.currentLiveProgramIndexes.lobby;
  assert.equal(program[index].track.src,source);assert.equal(p.audio.currentTime,25);
  await p.audio.finish();await flush();
  assert.equal(p.api.currentLiveProgramIndexes.lobby,(index+1)%program.length);
  assert.equal(p.audio.src,program[(index+1)%program.length].track.src);assert.equal(p.audio.currentTime,0);
});
