const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function session(){
 const context={window:{requestAnimationFrame:callback=>setImmediate(callback)}};vm.runInNewContext(fs.readFileSync('writingEngine.js','utf8'),context);
 const engine=Object.create(context.window.WritingEngine.prototype),hints=[];
 let quizOptions,skips=0;
 Object.assign(engine,{isReady:true,_playToken:0,currentStroke:0,meta:{totalStrokes:3},options:{},_waitBetweenStrokes(){return Promise.resolve();},_drawDemoStroke(){return new Promise(resolve=>hints.push(()=>resolve(true)));},writer:{
  resumeAnimation(){},pauseAnimation(){},cancelQuiz(){},hideCharacter(){},showOutline(){},
  quiz(options){quizOptions=options;},
  highlightStroke(){throw Error("Red hint animation must not be used for demonstration");},
  skipQuizStroke(){skips++;}
 }});
 return {engine,hints,get quiz(){return quizOptions;},get skips(){return skips;}};
}
test('undo resumes the shared quiz at exactly the previous stroke, including from completion',()=>{
 const s=session();s.engine.currentStroke=3;s.engine.stepPrevStroke();
 assert.equal(s.engine.currentStroke,2);assert.equal(s.quiz.quizStartStrokeNum,2);
 s.engine.stepPrevStroke();assert.equal(s.quiz.quizStartStrokeNum,1);
 s.engine.reset();assert.equal(s.quiz.quizStartStrokeNum,0);
});
test('handwriting invalidates a pending demonstration, which must not skip a stroke later',async()=>{
 const s=session();s.engine.startQuiz();const play=s.engine.playAnimation();
 s.quiz.onCorrectStroke({strokeNum:0});s.hints.shift()();await play;
 assert.equal(s.engine.currentStroke,1);assert.equal(s.skips,0);
});
test('rapid next-next and previous during demo cannot produce stale cursor increments',async()=>{
 const s=session();s.engine.stepNextStroke();s.engine.stepNextStroke();
 s.hints.shift()();s.hints.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.skips,0);assert.equal(s.engine.currentStroke,1);
 const play=s.engine.playAnimation();s.engine.stepPrevStroke();
 s.hints.shift()();await play;
 assert.equal(s.engine.currentStroke,0);assert.equal(s.skips,0);assert.equal(s.quiz.quizStartStrokeNum,0);
});
test('pause and reset invalidate animation completions',async()=>{
 const s=session();let play=s.engine.playAnimation();s.engine.pauseAnimation();
 s.hints.shift()();await play;assert.equal(s.engine.currentStroke,0);
 play=s.engine.playAnimation();s.engine.reset();s.hints.shift()();await play;
 assert.equal(s.engine.currentStroke,0);assert.equal(s.skips,0);
});

test('a single playback state resets on pause and handwriting interruption',async()=>{
 const s=session(),states=[];s.engine.options.onPlaybackChange=p=>states.push(p);
 const play=s.engine.playAnimation();assert.equal(s.engine.isPlaying,true);
 s.engine.pauseAnimation();assert.equal(s.engine.isPlaying,false);
 s.hints.shift()();await play;assert.equal(states.at(-1),false);
 s.engine.startQuiz();const next=s.engine.stepNextStroke();assert.equal(s.engine.isPlaying,true);
 s.quiz.onCorrectStroke({strokeNum:0});assert.equal(s.engine.isPlaying,false);
 s.hints.shift()();await next;
});

test('continuous playback waits between strokes and stop during the gap prevents the next stroke',async()=>{
 const s=session();let releaseGap;
 s.engine._waitBetweenStrokes=()=>new Promise(resolve=>{releaseGap=resolve;});
 const play=s.engine.playAnimation();s.hints.shift()();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.engine.currentStroke,1);assert.equal(s.hints.length,0);
 assert.equal(typeof releaseGap,'function');
 s.engine.pauseAnimation();releaseGap();await play;
 assert.equal(s.hints.length,0);assert.equal(s.engine.currentStroke,1);
});
test('native playback gap matches main 150ms delay',async()=>{
 let delay;
 const context={window:{setTimeout(callback,ms){delay=ms;callback();}}};
 vm.runInNewContext(fs.readFileSync('writingEngine.js','utf8'),context);
 await context.window.WritingEngine.prototype._waitBetweenStrokes();
 assert.equal(delay,150);
});
