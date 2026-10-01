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
  async dispatch(name) {
    if(name==='click' && this.gesture) this.gesture.active=true;
    const results=[...this.listeners.get(name)||[]].map(fn=>fn({target:this}));
    if(name==='click' && this.gesture) this.gesture.active=false;
    await Promise.all(results);
  }
}
class Audio extends Element {
  constructor() { super(); this.paused=true; this.ended=false; this.readyState=4; this.duration=10000; this.time=0; this.plays=[]; this.delayMetadata=false; }
  set src(value) { this.setAttribute('src',value); }
  get src() { return this.getAttribute('src'); }
  set currentTime(value) { this.time=value; if(this.delaySeek) this.seeking=true; }
  get currentTime() { return this.time; }
  pause() { const playing=!this.paused; this.paused=true; if(playing) this.dispatch('pause'); }
  load() { this.time=0; this.ended=false; this.seeking=false; this.readyState=this.delayMetadata?0:4; this.duration=this.durationFor?.(this.src)||10000; }
  async play() {
    this.playAttempts=(this.playAttempts||0)+1;
    if(this.requireGesture && !this.unlocked && !this.gesture?.active) {
      const error=new Error('Playback requires a user gesture'); error.name='NotAllowedError'; throw error;
    }
    if(this.gesture?.active) this.unlocked=true;
    if(this.playGate) await this.playGate;
    this.paused=false; this.ended=false; this.plays.push({src:this.src,time:this.time}); await this.dispatch('play');
  }
  async finish() { this.time=this.duration; this.paused=true; this.ended=true; await this.dispatch('ended'); }
}
function audioContext() {
  const parameter=()=>({
    value:0,events:[],initialValue:0,
    setValueAtTime(value,time){if(!this.events.length)this.initialValue=this.value;this.value=value;this.events.push({value,time,type:'set'});},
    setTargetAtTime(value,time){this.setValueAtTime(value,time);},
    linearRampToValueAtTime(value,time){this.value=value;this.events.push({value,time,type:'ramp'});},
    cancelScheduledValues(time){this.events=this.events.filter(event=>event.time<time);},
    valueAt(time){
      let previous={value:this.initialValue,time:0};
      for(const event of this.events) {
        if(event.time>time) {
          return event.type==='ramp' && event.time>previous.time
            ? previous.value+(event.value-previous.value)*(time-previous.time)/(event.time-previous.time)
            : previous.value;
        }
        previous=event;
      }
      return previous.value;
    }
  });
  const node=()=>({connect(target){return target;},gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),reduction:0});
  const gains=[];
  return {state:'running',currentTime:0,destination:{},gains,addEventListener(){},createMediaElementSource:node,createGain(){const gain=node();gains.push(gain);return gain;},createBiquadFilter:node,createDynamicsCompressor:node,createAnalyser:()=>({...node(),frequencyBinCount:1024}),resume:async()=>{}};
}
const flush=async()=>{for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve));};
async function player({catalogDelay=false,metadataDelay=false}={}) {
  let now=Date.parse('2026-09-30T03:00:00Z');
  class Clock extends Date { static now(){return now;} }
  const audio=new Audio();
  audio.delayMetadata=metadataDelay;
  const elements=new Map(['play-pause','previous-track','next-track','player-track-title','player-artist','radio-status'].map(id=>[id,new Element()]));
  elements.set('radio-audio',audio);
  const gesture={active:false};
  audio.gesture=gesture;
  for(const element of elements.values()) element.gesture=gesture;
  const intervals=new Map(),timeouts=new Map(); let timer=0; let onReady;
  const data={drops:{ok:true,drops:[]},music:{ok:true,music:[
    {id:2,genre:'hip-hop',original_filename:'Do_Me_by_Dj_Silvah.mp3',r2_key:'music/2',duration_seconds:220.578,enabled:1},
    {id:3,genre:'hip-hop',original_filename:'Snapz-explicit.mp3',r2_key:'music/3',duration_seconds:160.992,enabled:1}
  ]},'image-ads':{ok:true,ads:[]},videos:{ok:true,videos:[]}};
  const contexts=[];
  const window={AudioContext:function(){const ctx=audioContext();contexts.push(ctx);return ctx;},requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener(){},setInterval(fn,ms){intervals.set(++timer,{fn,ms});return timer;},clearInterval(id){intervals.delete(id);},setTimeout(fn,ms){timeouts.set(++timer,{fn,ms});return timer;},clearTimeout(id){timeouts.delete(id);}};
  const document={documentElement:{dataset:{}},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],addEventListener(name,fn){if(name==='DOMContentLoaded') onReady=fn;},createElement:()=>new Element()};
  const logs=[];
  let releaseCatalog;
  const catalogGate=catalogDelay?new Promise(resolve=>{releaseCatalog=resolve;}):Promise.resolve();
  const context=vm.createContext({window,document,Date:Clock,Image:class{},Uint8Array,requestAnimationFrame:()=>1,cancelAnimationFrame(){},console:{warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args),log(){}},fetch:async url=>{await catalogGate;return {ok:true,json:async()=>JSON.parse(JSON.stringify(data[url.split('/').at(-1)]))};}});
  let source=readFileSync(new URL('./radio.js',import.meta.url),'utf8');
  source=source.replace(/\n\}\);\s*$/,`\nwindow.__test={ready:liveStationReady,syncToLiveStation,playAdjacentStationItem,switchMusicChannel,buildLiveStationProgram,getLiveStationPosition,loadStationIdsFromApi,loadMusicFromApi,refreshStationCatalog,getRequiredDuration,channelConfig,liveStationPrograms,currentLiveProgramIndexes,liveStationDurations,get channel(){return activeChannel;},get pending(){return livePlaybackPending;}};\n});`);
  vm.runInContext(source,context);
  onReady();
  const api=window.__test;
  audio.durationFor=src=>src ? api.getRequiredDuration({src}) : 10000;
  if(!catalogDelay) await api.ready;
  await flush();
  return {api,audio,data,elements,logs,contexts,intervals,timeouts,async finishCatalog(){releaseCatalog?.();await api.ready;await flush();},setNow:value=>{now=value;},advance:seconds=>{now+=seconds*1000;},async click(id){await elements.get(id).dispatch('click');await flush();},async tick(ms){for(const item of intervals.values()) if(item.ms===ms) await item.fn();await flush();}};
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

test('first Listen starts media inside the click even when station metadata is delayed',async()=>{
  const p=await player();
  p.audio.requireGesture=true;
  p.audio.delayMetadata=true;
  p.api.switchMusicChannel('hip-hop'); await flush();
  const before=p.api.getLiveStationPosition('hip-hop');
  const listen=p.elements.get('play-pause').dispatch('click');
  await flush();
  assert.equal(p.audio.playAttempts,1,'Play must happen before metadata arrives and the click expires');
  p.audio.readyState=1; await p.audio.dispatch('loadedmetadata');
  await listen; await flush();
  assert.equal(p.audio.paused,false);
  assert.equal(p.audio.src,before.item.track.src);
  assert.ok(Math.abs(p.audio.currentTime-before.offset)<0.05);
});

test('an end event while paused or seeking cannot skip the displayed song',async()=>{
  const p=await player();
  const source=p.audio.src, index=p.api.currentLiveProgramIndexes.lobby;
  await p.audio.dispatch('ended'); await flush();
  assert.equal(p.audio.src,source,'Paused preview must not advance or start playback');
  assert.equal(p.api.currentLiveProgramIndexes.lobby,index);
  assert.equal(p.audio.paused,true);
  await p.click('play-pause');
  p.audio.seeking=true;
  await p.audio.dispatch('ended'); await flush();
  assert.equal(p.audio.src,source,'A seek end event must not act like a natural recording end');
  assert.equal(p.api.currentLiveProgramIndexes.lobby,index);
});

test('Listen unlocks media from the click while the catalogue loads, then joins the saved station',async()=>{
  const p=await player({catalogDelay:true});
  p.audio.requireGesture=true;
  assert.equal(p.audio.src,null);
  assert.equal(p.elements.get('player-track-title').textContent,'Loading station');
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  assert.equal(p.audio.unlocked,true);
  assert.equal(p.audio.playAttempts,1);
  assert.equal(p.contexts[0].gains[0].gain.value,0,'The unlock must stay silent while the station is loading');
  assert.equal(p.elements.get('player-track-title').textContent,'Loading station');
  await p.finishCatalog();
  await listen; await flush();
  const position=p.api.getLiveStationPosition('lobby');
  assert.equal(p.audio.src,position.item.track.src);
  assert.equal(p.elements.get('player-track-title').textContent,position.item.track.title);
  assert.equal(p.audio.paused,false);
  assert.equal(p.contexts[0].gains[0].gain.value,1);
  assert.equal(p.logs.length,0,JSON.stringify(p.logs.map(args=>args.map(value=>value?.stack||value))));
});

test('the initial preview waits for the saved catalogue and Listen starts that displayed recording',async()=>{
  const p=await player({catalogDelay:true,metadataDelay:true});
  assert.equal(p.audio.src,null);
  assert.equal(p.elements.get('player-track-title').textContent,'Loading station');
  const catalog=p.finishCatalog(); await flush();
  const position=p.api.getLiveStationPosition('lobby');
  assert.equal(p.audio.src,position.item.track.src,'The displayed title and source must follow the loaded station clock');
  p.audio.readyState=1; await p.audio.dispatch('loadedmetadata');
  await catalog;
  const source=p.audio.src;
  await p.click('play-pause');
  assert.equal(p.audio.src,source,'Listen must start the updated displayed recording');
  assert.equal(p.audio.paused,false);
});

test('first Listen before both catalogue and metadata arrive starts one saved station recording',async()=>{
  const p=await player({catalogDelay:true,metadataDelay:true});
  p.audio.requireGesture=true;
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  await p.finishCatalog();
  const position=p.api.getLiveStationPosition('lobby');
  assert.equal(p.audio.src,position.item.track.src);
  assert.equal(p.elements.get('player-track-title').textContent,position.item.track.title);
  p.audio.delayMetadata=false; p.audio.readyState=1;
  await p.audio.dispatch('loadedmetadata'); await listen; await flush();
  assert.equal(p.audio.src,position.item.track.src);
  assert.equal(p.audio.paused,false);
  assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
  assert.equal(p.contexts[0].gains[0].gain.value,1);
});

test('a later catalogue update replaces a paused preview that is still waiting for metadata',async()=>{
  const p=await player();
  p.audio.delayMetadata=true;
  p.api.switchMusicChannel('hip-hop'); await flush();
  const oldSource=p.audio.src;
  p.data.music.music=[{id:10,genre:'hip-hop',r2_key:'music/10',duration_seconds:300,enabled:1}];
  const refresh=p.api.refreshStationCatalog(); await flush();
  const position=p.api.getLiveStationPosition('hip-hop');
  assert.notEqual(position.item.track.src,oldSource);
  assert.equal(p.audio.src,position.item.track.src);
  p.audio.readyState=1; await p.audio.dispatch('loadedmetadata'); await refresh;
  assert.ok(Math.abs(p.audio.currentTime-position.offset)<0.05);
  assert.equal(p.audio.paused,true);
});

test('a later catalogue revision during a Listen seek preserves the selected recording',async()=>{
  const p=await player();
  p.audio.requireGesture=true; p.audio.delayMetadata=true;
  p.api.switchMusicChannel('hip-hop'); await flush();
  const source=p.audio.src;
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  p.data.music.music=[{id:10,genre:'hip-hop',r2_key:'music/10',duration_seconds:300,enabled:1}];
  await p.api.refreshStationCatalog();
  assert.notEqual(p.api.getLiveStationPosition('hip-hop').item.track.src,source);
  assert.equal(p.audio.src,source);
  p.audio.delayMetadata=false; p.audio.readyState=1;
  await p.audio.dispatch('loadedmetadata'); await listen;
  assert.equal(p.audio.src,source);
  assert.equal(p.audio.paused,false);
  assert.equal(p.contexts[0].gains[0].gain.value,1);
});

test('cancelling Listen before catalogue arrival keeps the station paused after loading',async()=>{
  const p=await player({catalogDelay:true});
  p.audio.requireGesture=true;
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  await p.click('play-pause');
  assert.equal(p.audio.paused,true);
  await p.finishCatalog(); await listen; await flush();
  assert.equal(p.audio.paused,true);
  assert.equal(p.audio.plays.length,1);
  assert.equal(p.elements.get('play-pause').getAttribute('aria-label'),'Listen live');
});

test('changing genre during initial loading carries the Listen request to the selected station',async()=>{
  const p=await player({catalogDelay:true});
  p.audio.requireGesture=true;
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  p.api.switchMusicChannel('hip-hop'); await flush();
  await p.finishCatalog(); await listen; await flush();
  assert.equal(p.api.channel,'hip-hop');
  assert.equal(p.audio.src,p.api.getLiveStationPosition('hip-hop').item.track.src);
  assert.equal(p.audio.paused,false);
  assert.equal(p.contexts[0].gains[0].gain.value,1);
});

test('Listen during initial loading of an empty station ends in a silent off-air state',async()=>{
  const p=await player({catalogDelay:true});
  p.audio.requireGesture=true;
  p.api.switchMusicChannel('house');
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  await p.finishCatalog(); await listen; await flush();
  assert.equal(p.api.getLiveStationPosition('house'),null);
  assert.equal(p.audio.paused,true);
  assert.equal(p.audio.src,null);
  assert.equal(p.api.pending,false);
});

test('Pause immediately displays the current station clock so a rapid Listen click matches the title',async()=>{
  const p=await player();
  await p.click('play-pause');
  const original=p.audio.src;
  p.data.music.music.push({id:10,genre:'jazz',r2_key:'music/10',duration_seconds:300,enabled:1});
  await p.api.refreshStationCatalog();
  const position=p.api.getLiveStationPosition('lobby');
  assert.notEqual(position.item.track.src,original,'Fixture must change the schedule while preserving active music');
  await p.click('play-pause');
  assert.equal(p.audio.paused,true);
  assert.equal(p.audio.src,position.item.track.src,'Pause must refresh the displayed station without waiting for the timer');
  const displayed=p.audio.src;
  await p.click('play-pause');
  assert.equal(p.audio.paused,false);
  assert.equal(p.audio.src,displayed);
});

test('Listen keeps a delayed seek pending and ignores an old end event until the seek settles',async()=>{
  const p=await player();
  p.audio.requireGesture=true; p.audio.delayMetadata=true; p.audio.delaySeek=true;
  p.api.switchMusicChannel('hip-hop'); await flush();
  const source=p.audio.src;
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  p.audio.readyState=1; await p.audio.dispatch('loadedmetadata'); await flush();
  assert.equal(p.api.pending,true);
  p.audio.ended=true; await p.audio.dispatch('ended'); await flush();
  assert.equal(p.audio.src,source);
  p.audio.ended=false; p.audio.seeking=false;
  await p.audio.dispatch('seeked'); await listen; await flush();
  assert.equal(p.api.pending,false);
  assert.equal(p.audio.paused,false);
  assert.equal(p.audio.src,source);
});

test('a second Listen click cancels delayed startup and later metadata cannot restart the song',async()=>{
  const p=await player();
  p.audio.requireGesture=true; p.audio.delayMetadata=true;
  p.api.switchMusicChannel('hip-hop'); await flush();
  const listen=p.elements.get('play-pause').dispatch('click'); await flush();
  assert.equal(p.api.pending,true);
  await p.click('play-pause'); await listen;
  assert.equal(p.audio.paused,true);
  p.audio.readyState=1; await p.audio.dispatch('loadedmetadata'); await flush();
  assert.equal(p.audio.paused,true);
  assert.equal(p.audio.plays.length,1);
});

test('listener arrows stay disabled and cannot change, restart, or start the station',async()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for(const id of ['previous-track','next-track']) {
    const button=html.match(new RegExp(`<button\\s[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(button && /\sdisabled(?:\s|>)/.test(button),'Arrow must be disabled before the player loads');
  }
  const p=await player();
  p.audio.requireGesture=true;
  for(const id of ['previous-track','next-track']) {
    assert.equal(p.elements.get(id).disabled,true);
    assert.equal(p.elements.get(id).getAttribute('aria-disabled'),'true');
  }
  for(const channel of ['lobby','hip-hop','rnb','house','reggae','gospel']) {
    p.api.switchMusicChannel(channel); await flush();
    for(const playing of [false,true]) {
      if(playing && p.api.getLiveStationPosition(channel)) await p.click('play-pause');
      for(const elapsed of [0.05,5,100,200]) {
        p.audio.currentTime=elapsed;
        const before={index:p.api.currentLiveProgramIndexes[channel],src:p.audio.src,paused:p.audio.paused,plays:p.audio.plays.length};
        for(const id of ['next-track','previous-track']) {
          // Dispatch directly as well: even a synthetic event must not skip.
          await p.click(id);
          assert.equal(p.api.currentLiveProgramIndexes[channel],before.index);
          assert.equal(p.audio.src,before.src);
          assert.equal(p.audio.currentTime,elapsed);
          assert.equal(p.audio.paused,before.paused);
          assert.equal(p.audio.plays.length,before.plays);
        }
      }
    }
    if(!p.audio.paused) await p.click('play-pause');
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

const genreChannels=['hip-hop','rnb','house','reggae','gospel'];
async function genrePlayer(channel) {
  const p=await player();
  p.data.music.music.push({id:70,genre:'house',r2_key:'music/house',duration_seconds:100,enabled:1});
  p.data.music.music.push({id:71,genre:'reggae',r2_key:'music/reggae',duration_seconds:100,enabled:1});
  p.data.drops.drops=[drop('spoken-ad',genreChannels,{duration_seconds:14.759183673469387})];
  await p.api.refreshStationCatalog();p.api.switchMusicChannel(channel);await flush();
  p.audio.requireGesture=true;
  await p.click('play-pause');
  assert.equal(p.audio.paused,false,`${channel} fixture must be playing`);
  return p;
}

test('all genre stations keep music and spoken ads audible through their final samples',async()=>{
  for(const channel of genreChannels) {
    const p=await genrePlayer(channel);
    for(const type of ['music','id']) {
      const program=p.api.liveStationPrograms[channel];
      for(let i=0;program[p.api.currentLiveProgramIndexes[channel]].type!==type && i<program.length;i++) {
        await p.audio.finish();await flush();
      }
      assert.equal(program[p.api.currentLiveProgramIndexes[channel]].type,type);
      const src=p.audio.src,index=p.api.currentLiveProgramIndexes[channel];
      for(const remaining of [.74,.34,.05]) {
        p.audio.currentTime=p.audio.duration-remaining;
        await p.audio.dispatch('timeupdate');await flush();
        const gain=p.contexts[0].gains[0].gain;
        assert.equal(gain.valueAt(p.contexts[0].currentTime+remaining),1,`${channel} ${type} must stay audible until its real ending`);
        assert.equal(p.audio.src,src);assert.equal(p.api.currentLiveProgramIndexes[channel],index);
      }
      await p.audio.finish();await flush();
      assert.equal(p.api.currentLiveProgramIndexes[channel],(index+1)%program.length);
      assert.equal(p.audio.currentTime,0);
    }
  }
});

test('genre transitions wait for metadata, seeking and playable data before consuming the next intro',async()=>{
  for(const channel of genreChannels) {
    const p=await genrePlayer(channel);
    const plays=p.audio.plays.length;
    p.audio.delayMetadata=true;p.audio.delaySeek=true;
    await p.audio.finish();await flush();
    assert.equal(p.api.pending,true);
    assert.equal(p.audio.paused,true,'The next recording must not run silently while it loads');
    assert.equal(p.audio.plays.length,plays);
    p.audio.readyState=1;await p.audio.dispatch('loadedmetadata');await flush();
    assert.equal(p.audio.paused,true);
    p.audio.seeking=false;await p.audio.dispatch('seeked');await flush();
    assert.equal(p.audio.paused,true,'Metadata alone does not guarantee playable audio');
    p.advance(2);await p.tick(1000);
    assert.equal(p.audio.currentTime,0,'The station preview clock must not overwrite a pending intro');
    const source=p.audio.src;
    p.audio.ended=true;await p.audio.dispatch('ended');await flush();p.audio.ended=false;
    assert.equal(p.audio.src,source,'An obsolete end event must not skip an intro that is buffering');
    p.audio.readyState=3;await p.audio.dispatch('canplay');await flush();
    assert.equal(p.audio.paused,false);assert.equal(p.api.pending,false);
    assert.equal(p.audio.plays.length,plays+1);
    assert.equal(p.audio.plays.at(-1).time,0);
    assert.equal(p.audio.currentTime,0);
    await p.audio.dispatch('canplay');await flush();
    assert.equal(p.audio.plays.length,plays+1,'A later readiness event must not start the recording twice');
  }
});

test('Hip Hop music gets a reusable soft entrance while drops stay full gain',async()=>{
  const p=await genrePlayer('hip-hop');
  const program=p.api.liveStationPrograms['hip-hop'];

  let checkedMusic=false, checkedDrop=false;
  for(let i=0;i<program.length*2 && (!checkedMusic || !checkedDrop);i++) {
    const before=p.api.currentLiveProgramIndexes['hip-hop'];
    const nextIndex=(before+1)%program.length;
    const next=program[nextIndex];

    await p.audio.finish();await flush();

    const ctx=p.contexts[0],gain=ctx.gains[0].gain;
    assert.equal(p.audio.currentTime,0,'Every automatic transition must still start at the true beginning');

    if(next.type==='music' && !checkedMusic) {
      checkedMusic=true;
      assert.equal(gain.valueAt(ctx.currentTime),0.08,'Hip Hop music should start gently');
      assert.ok(gain.valueAt(ctx.currentTime+.15)>0.08 && gain.valueAt(ctx.currentTime+.15)<1);
      assert.equal(gain.valueAt(ctx.currentTime+.31),1,'Hip Hop music fade should complete quickly');
    }

    if(next.type==='id' && !checkedDrop) {
      checkedDrop=true;
      assert.equal(gain.valueAt(ctx.currentTime),1,'Hip Hop drops/commercials should not inherit the music fade');
    }
  }

  assert.equal(checkedMusic,true,'Fixture must exercise a Hip Hop music transition');
  assert.equal(checkedDrop,true,'Fixture must exercise a Hip Hop drop transition');
});

test('Hip Hop keeps a loading music track silent, then starts its reusable fade when playback begins',async()=>{
  const p=await genrePlayer('hip-hop');
  const program=p.api.liveStationPrograms['hip-hop'];

  for(let i=0;i<program.length;i++) {
    const index=p.api.currentLiveProgramIndexes['hip-hop'];
    const next=program[(index+1)%program.length];
    if(next?.type==='music') break;
    await p.audio.finish();await flush();
  }

  const currentIndex=p.api.currentLiveProgramIndexes['hip-hop'];
  assert.equal(program[(currentIndex+1)%program.length]?.type,'music','Fixture must find a music transition');

  let releasePlay;p.audio.playGate=new Promise(resolve=>{releasePlay=resolve;});
  await p.audio.finish();await flush();

  const ctx=p.contexts[0],gain=ctx.gains[0].gain;
  ctx.currentTime+=.5;
  assert.equal(p.api.pending,true);assert.equal(p.audio.paused,true);
  assert.equal(gain.valueAt(ctx.currentTime),0,'Loading remains silent');

  releasePlay();await flush();

  assert.equal(p.audio.paused,false);assert.equal(p.audio.currentTime,0);
  assert.equal(gain.valueAt(ctx.currentTime),0.08,'The fade begins only when playback really starts');
  assert.equal(gain.valueAt(ctx.currentTime+.31),1);
});

test('new Hip Hop music items automatically receive the same fade without title-specific code',async()=>{
  const p=await genrePlayer('hip-hop');
  p.data.music.music.push({
    id:99,genre:'hip-hop',original_filename:'future_upload.mp3',
    r2_key:'music/future-upload',duration_seconds:123,enabled:1
  });
  await p.api.refreshStationCatalog();

  const program=p.api.liveStationPrograms['hip-hop'];
  let found=false;
  for(let i=0;i<program.length*2;i++) {
    const index=p.api.currentLiveProgramIndexes['hip-hop'];
    const next=program[(index+1)%program.length];
    if(next?.track?.src?.includes('/api/music/99/audio')) {
      await p.audio.finish();await flush();
      const ctx=p.contexts[0],gain=ctx.gains[0].gain;
      assert.equal(p.audio.currentTime,0);
      assert.equal(gain.valueAt(ctx.currentTime),0.08);
      assert.equal(gain.valueAt(ctx.currentTime+.31),1);
      found=true;
      break;
    }
    await p.audio.finish();await flush();
  }
  assert.equal(found,true,'A newly uploaded Hip Hop song must receive the default music fade');
});

test('pausing a genre transition cancels a loading recording and late canplay cannot restart it',async()=>{
  const p=await genrePlayer('hip-hop');
  p.audio.delayMetadata=true;
  await p.audio.finish();await flush();
  const plays=p.audio.plays.length;
  await p.click('play-pause');
  p.audio.delayMetadata=false;p.audio.readyState=4;p.audio.seeking=false;
  await p.audio.dispatch('loadedmetadata');await p.audio.dispatch('seeked');await p.audio.dispatch('canplay');await flush();
  assert.equal(p.audio.paused,true);assert.equal(p.audio.plays.length,plays);
});

test('the Jazz station keeps its existing ending fade and immediate full-volume start',async()=>{
  const p=await player();await p.click('play-pause');
  p.audio.currentTime=p.audio.duration-.3;
  await p.audio.dispatch('timeupdate');
  assert.equal(p.contexts[0].gains[0].gain.value,0);
  await p.audio.finish();await flush();
  assert.equal(p.contexts[0].gains[0].gain.value,1);
  assert.equal(p.contexts[0].gains[0].gain.valueAt(p.contexts[0].currentTime),1);
  assert.equal(p.audio.currentTime,0);assert.equal(p.audio.paused,false);
});
