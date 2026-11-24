import { randomBytes } from "node:crypto";

export function panelHtml(cspSource: string) {
  const nonce = randomBytes(18).toString("base64");
  return `<!doctype html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px;max-width:1600px;margin:auto}
header{border-bottom:1px solid var(--vscode-panel-border);padding-bottom:18px;display:flex;gap:16px;align-items:center}h1{font-size:24px;margin:4px 0}
.mark{color:#19d3e6;font:700 12px var(--vscode-editor-font-family);letter-spacing:.14em}p{color:var(--vscode-descriptionForeground)}
button,select,input,textarea{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));padding:9px}
button{cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button:hover{background:var(--vscode-button-hoverBackground)}
button:disabled{opacity:.45;cursor:wait}.bar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;align-items:center}
textarea{width:100%;box-sizing:border-box;min-height:130px;font:13px/1.6 var(--vscode-editor-font-family);resize:vertical}
#status{white-space:pre-wrap;border-left:3px solid #19d3e6;padding:12px;background:var(--vscode-textBlockQuote-background);margin:16px 0}
.scroll{overflow:auto;max-height:65vh;border:1px solid var(--vscode-panel-border)}table{border-collapse:collapse;width:100%;font:12px var(--vscode-editor-font-family)}
td,th{text-align:left;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);max-width:400px;white-space:pre-wrap;overflow-wrap:anywhere}
th{position:sticky;top:0;background:var(--vscode-editor-background);color:#19d3e6}tr:hover td{background:var(--vscode-list-hoverBackground)}
pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:var(--vscode-descriptionForeground)}#approval{border:1px solid #ffb547;padding:16px;margin:16px 0}input{max-width:200px}
</style></head><body>
<header><div><div class="mark">FREEBASE / LIVE WORKSPACE</div><h1 id="title">Connecting…</h1><small id="subtitle">Same private data. Every client.</small></div></header>
<div class="bar"><button data-action="refresh">Refresh</button><button data-action="createObject">New table / collection</button><button data-action="insert">Add record</button><button data-action="share">Sharing</button><button data-action="configure">Configure project</button><button data-action="website">Open on website</button></div>
<div class="bar"><select id="table"><option value="">Choose a table / collection</option></select><input id="search" placeholder="Search stored values"><button data-action="browse">Browse</button><button data-action="previous">Previous</button><button data-action="next">Next</button></div>
<div class="bar"><select id="mode"><option value="ask">Ask your data</option><option value="native">Native query</option></select><small>AI changes need approval. Native commands require review before execution.</small></div>
<textarea id="query" placeholder="Find people older than 25"></textarea><div class="bar"><button id="run" data-action="run">Run against real data</button></div>
<div id="status" role="status">Loading your database…</div>
<section id="approval" hidden><strong>Review proposed change</strong><pre id="preview"></pre><button data-action="confirm">Confirm change</button> <button data-action="cancel">Cancel</button></section>
<div class="scroll"><table><thead id="head"></thead><tbody id="body"></tbody></table></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(); const byId=id=>document.getElementById(id); let busy=false;
const text=value=>value===null?'null':typeof value==='object'?JSON.stringify(value):String(value??'');
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{if(!busy)vscode.postMessage({action:button.dataset.action,table:byId('table').value,search:byId('search').value,mode:byId('mode').value,query:byId('query').value});}));
window.addEventListener('message',event=>{
 const data=event.data;
 if(data.type==='busy'){busy=data.value;document.querySelectorAll('button').forEach(b=>b.disabled=busy);return;}
 if(data.type==='status'){byId('status').textContent=data.message;return;}
 if(data.type==='initial'){byId('title').textContent=data.name;byId('subtitle').textContent=data.subtitle;byId('query').value=data.query||'';if(data.mode)byId('mode').value=data.mode;return;}
 if(data.type==='catalog'){const select=byId('table');const previous=select.value;select.replaceChildren();data.objects.forEach(o=>{const option=document.createElement('option');option.value=o.name;option.textContent=o.name;select.appendChild(option);});select.value=data.table||previous||data.objects[0]?.name||'';return;}
 if(data.type==='approval'){byId('approval').hidden=!data.preview;byId('preview').textContent=data.preview||'';return;}
 if(data.type==='rows'){
  byId('head').replaceChildren();byId('body').replaceChildren();const row=document.createElement('tr');
  data.columns.forEach(column=>{const th=document.createElement('th');th.textContent=column;row.appendChild(th);});
  if(data.editable){const th=document.createElement('th');th.textContent='Record actions';row.appendChild(th);}byId('head').appendChild(row);
  data.rows.forEach((record,index)=>{const tr=document.createElement('tr');data.columns.forEach(column=>{const td=document.createElement('td');td.textContent=text(record[column]);tr.appendChild(td);});
   if(data.editable){const td=document.createElement('td');['edit','delete'].forEach(action=>{const button=document.createElement('button');button.textContent=action==='edit'?'Edit':'Delete';button.addEventListener('click',()=>{if(!busy)vscode.postMessage({action,index});});td.appendChild(button);});tr.appendChild(td);}byId('body').appendChild(tr);});
 }
});
vscode.postMessage({action:'ready'});
</script></body></html>`;
}
