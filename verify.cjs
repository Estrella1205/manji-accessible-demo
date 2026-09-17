const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const storage = new Map();
const element = {innerHTML:'',textContent:'',addEventListener(){},focus(){},classList:{toggle(){}}};
const sandbox = {console,crypto:require('crypto').webcrypto,performance,Date,setTimeout(){},clearTimeout(){},
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 document:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener(){},body:element},
 window:{confirm:()=>true,scrollTo(){}}};
vm.createContext(sandbox);
for(const file of ['app.js','enhancements.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
function run(code){return vm.runInContext(code,sandbox)}
run("render=()=>{}; toast=()=>{}; state.records=[]; state.drafts=[]; state.history=[]; state.draft='未完成的新草稿';");
run('saveQuick(0); saveQuick(1)');
assert.equal(run('state.records.length'),2);
run("state.status='震颤明显';undoOperation(state.history[1].id)");
assert.equal(run('state.records.length'),1);
assert.equal(run('state.records[0].type'),'mood');
assert.equal(run('state.draft'),'未完成的新草稿');
assert.equal(run('state.status'),'震颤明显');
run("state.recordEdit=clone(state.records[0]);state.recordEdit.title='改过的心情';saveRecordEdit()");
assert.equal(run('state.records[0].title'),'改过的心情');
run('undoOperation(state.history[1].id)');
assert.equal(run('state.records.length'),1,'Old add undo must not overwrite a later edit');
run('undoOperation(state.history[0].id)');
assert.equal(run('state.records[0].title'),'此刻心情不错');
run('removeRecord(state.records[0].id)');
assert.equal(run('state.records.length'),0);
run('undoOperation(state.history[0].id)');
assert.equal(run('state.records.length'),1);
run("state.draft='午饭花了32元，走了15分钟，今天有点累';parse();action('save')");
assert.equal(run('state.records.length'),4);
run("state.draft='另一份新草稿';undoOperation(state.history[0].id)");
assert.equal(run('state.records.length'),1);
assert.equal(run('state.draft'),'另一份新草稿');
assert.equal(run('state.drafts.at(-1).text'),'午饭花了32元，走了15分钟，今天有点累');
assert.equal(JSON.parse(storage.get('manji-v1')).history.length,5);
console.log('PASS: quick save, independent undo, conflict protection, edit, delete/restore, parsed save, draft preservation, durable history');
