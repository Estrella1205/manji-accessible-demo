// Record-level reversible operations: never restore the whole application state.
state.history = state.history || [];
state.hasRecorded = state.hasRecorded || state.records.some(r => !r.demo);
let showingExamples = false;
let lastActivation = -Infinity;
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function setUndo(beforeJSON, label) {
  const before = JSON.parse(beforeJSON);
  const changes = [];
  for (const collection of ['records', 'drafts']) {
    const oldItems = new Map(before[collection].map(item => [item.id, item]));
    const newItems = new Map(state[collection].map(item => [item.id, item]));
    for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) {
      const oldItem = oldItems.get(id) || null;
      const newItem = newItems.get(id) || null;
      if (!equal(oldItem, newItem)) changes.push({collection, id, before: clone(oldItem), after: clone(newItem)});
    }
  }
  if (!changes.length) return;
  state.hasRecorded ||= state.records.some(r => !r.demo);
  if (changes.some(change => change.collection === 'records' && !change.before && change.after)) showingExamples = false;
  state.history.unshift({id: crypto.randomUUID(), label, changes, at: new Date().toISOString(), undone: false,
    recoveredText: before.draft && !state.draft && !before.editingDraft ? before.draft : ''});
  persist();
  render();
  toast(label, true);
}

function undoOperation(id) {
  const operation = state.history.find(item => item.id === id && !item.undone);
  if (!operation) return;
  // Refuse to overwrite a record that was edited by a later operation.
  if (operation.changes.some(change => !equal(state[change.collection].find(item => item.id === change.id) || null, change.after))) {
    toast('这条内容后来有过修改，请先撤销它的后续操作。');
    return;
  }
  for (const change of operation.changes) {
    state[change.collection] = state[change.collection].filter(item => item.id !== change.id);
    if (change.before) state[change.collection].push(clone(change.before));
  }
  if (operation.recoveredText) {
    // Do not overwrite a new draft or an in-progress confirmation.
    state.drafts.push({id: crypto.randomUUID(), text: operation.recoveredText, date: today(), recovered: true});
  }
  operation.undone = true;
  persist();
  render();
  toast(operation.recoveredText ? '已撤销，原话已放入待整理。当前草稿不受影响。' : '已撤销这次操作，其他记录与设置保持不变。');
}

function historyPage() {
  return `<div class="pagebody">${head('每一步，都可以回头。', '操作历史保存在本机。撤销只影响对应内容，不会覆盖新的记录、草稿或设置。')}
    ${state.history.length ? state.history.map(op => `<article class="card historyitem"><div><h2>${esc(op.label)}</h2><p class="helper">${esc(new Date(op.at).toLocaleString('zh-CN'))} · ${op.changes.length} 项内容</p></div><button class="secondary" data-undo-id="${op.id}" ${op.undone ? 'disabled' : ''}>${op.undone ? '已撤销' : '撤销这次操作'}</button></article>`).join('') : '<div class="card"><h2>还没有操作记录</h2><p class="helper">保存、修改、删除后，都可以在这里找回。</p></div>'}</div>`;
}

const quickOptions = [
  {text: '有点累', type: 'body', value: '疲劳', title: '现在有点累', detail: '身体状态'},
  {text: '心情不错', type: 'mood', value: '愉快', title: '此刻心情不错', detail: '情绪'},
  {text: '感觉平静', type: 'mood', value: '平静', title: '给自己一点平静', detail: '情绪'}
];
function quickPanel() {
  return `<section class="quickpanel" aria-label="一键快速记录"><div class="row between"><strong>只想简单记一下？</strong><span class="helper">点一下即保存 · 可撤销</span></div><div class="quickbuttons">${quickOptions.map((option, i) => `<button class="secondary" data-quick-note="${i}">${ico(option.type)}${option.text}</button>`).join('')}</div></section>`;
}
function saveQuick(index) {
  const option = quickOptions[index];
  if (!option) return;
  const before = snapshot();
  const {text, ...record} = option;
  state.records.push({...record, id: crypto.randomUUID(), date: today(), time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}), original: text});
  setUndo(before, `已记录：${text}`);
}

function recordEditor() {
  const record = state.records.find(item => item.id === state.recordEdit?.id && !item.demo);
  if (!record) return `<div class="pagebody">${head('这条记录已不存在。', '可以到最近操作中查看是否能够恢复。')}<button class="secondary" data-page="history">最近操作</button></div>`;
  const edit = state.recordEdit;
  const numeric = ['expense', 'exercise'].includes(record.type);
  return `<div class="pagebody">${head('改一改，记得更准确。', '修改内容自动暂存，点击保存后才会更新原记录。')}
    <div class="card editorform"><label for="edit-title">记录名称</label><input id="edit-title" data-record-field="title" maxlength="100" value="${esc(edit.title)}">
    <label for="edit-value">${record.type === 'expense' ? '金额（元）' : record.type === 'exercise' ? '时长（分钟）' : '记录内容'}</label><input id="edit-value" data-record-field="value" value="${esc(edit.value)}" ${numeric ? 'type="number" min="0" max="9999999" step="0.01"' : 'maxlength="500"'}>
    <label for="edit-date">记录日期</label><input id="edit-date" type="date" data-record-field="date" value="${esc(edit.date)}">
    <label for="edit-time">记录时间</label><input id="edit-time" type="time" data-record-field="time" value="${esc(edit.time)}">
    <p class="helper" id="edithint">修改草稿保存在本机，可稍后继续。</p><button class="primary full" data-save-record>保存修改</button>
    <button class="secondary full" data-page="home">稍后继续，返回首页</button>
    <button class="danger full" data-remove-record="${record.id}">删除这条记录</button></div></div>`;
}
function saveRecordEdit() {
  const edit = state.recordEdit;
  const record = state.records.find(item => item.id === edit?.id && !item.demo);
  if (!record) return;
  if (!edit.title.trim() || !String(edit.value).trim() || !/^\d{4}-\d{2}-\d{2}$/.test(edit.date) || !/^\d{2}:\d{2}$/.test(edit.time) || (['expense', 'exercise'].includes(record.type) && (!Number.isFinite(Number(edit.value)) || Number(edit.value) < 0 || Number(edit.value) > 9999999))) {
    toast('请填写名称、有效内容、日期和时间；金额与时长不能为负数。');
    return;
  }
  const before = snapshot();
  Object.assign(record, {title: edit.title.trim(), value: edit.value, date: edit.date, time: edit.time});
  state.recordEdit = null;
  page = 'home';
  setUndo(before, '已保存记录修改');
  persist();
  render();
}
function removeRecord(id) {
  const record = state.records.find(item => item.id === id && !item.demo);
  if (!record || !window.confirm(`删除“${record.title}”？你可以在“最近操作”中撤销。`)) return;
  const before = snapshot();
  state.records = state.records.filter(item => item.id !== id);
  state.recordEdit = null;
  page = 'home';
  setUndo(before, '已删除记录');
}

// Capture repeated activations before any old or new button handler runs.
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const now = performance.now();
  const gap = state.status === '震颤明显' ? 900 : 350;
  if (now - lastActivation < gap) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  lastActivation = now;
}, true);

const originalRender = render;
render = function() {
  originalRender();
  const breadcrumb = document.querySelector('.desktopcrumb');
  if (breadcrumb && ['history', 'editRecord'].includes(page)) breadcrumb.textContent = `我的生活 / ${page === 'history' ? '最近操作' : '编辑记录'}`;
  document.body.classList.toggle('tremor', state.status === '震颤明显');
  document.querySelectorAll('[data-quick-note]').forEach(button => button.onclick = () => saveQuick(Number(button.dataset.quickNote)));
  document.querySelectorAll('[data-open-record]').forEach(button => button.onclick = () => {
    const record = state.records.find(item => item.id === button.dataset.openRecord && !item.demo);
    if (!record) return;
    if (state.recordEdit && state.recordEdit.id !== record.id && !window.confirm('已有另一条记录的修改草稿。放弃那份修改，编辑这一条？')) return;
    if (state.recordEdit?.id !== record.id) state.recordEdit = clone(record);
    persist();
    go('editRecord');
  });
  document.querySelectorAll('[data-record-field]').forEach(input => input.oninput = () => {
    state.recordEdit[input.dataset.recordField] = input.value;
    persist();
    document.querySelector('#edithint').textContent = storageOK ? '修改草稿已保存，原记录尚未改变。' : '暂时无法保存，请保留当前页面。';
  });
  document.querySelector('[data-save-record]')?.addEventListener('click', saveRecordEdit);
  document.querySelectorAll('[data-remove-record]').forEach(button => button.onclick = () => removeRecord(button.dataset.removeRecord));
  document.querySelectorAll('[data-undo-id]').forEach(button => button.onclick = () => undoOperation(button.dataset.undoId));
  document.querySelector('[data-toggle-examples]')?.addEventListener('click', () => {showingExamples = !showingExamples;render()});
};

const originalAction = action;
action = function(name) {
  if (name === 'undo') {
    const last = state.history.find(item => !item.undone);
    if (last) undoOperation(last.id);
    return;
  }
  originalAction(name);
};

persist();
render();
