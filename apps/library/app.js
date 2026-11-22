import registry from "../../registry/registry.json";
import { createDefaultRegistry } from "../../packages/core/src/index.js";
import { drawModelPreview, modelDocumentFor, modelPreviewNodes } from "../shared/model-preview.js";
import { publicRegistryCounts, publicRegistryEntries } from "../shared/registry-visibility.js";

const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const labels={component:"参数化构件",method:"空间方法",composition:"完整模型"};
let kind="all",activeEntry=null,preview={yaw:-.7,pitch:.48,zoom:105},drag=null;
const modelCore=createDefaultRegistry();
const publicEntries=publicRegistryEntries(registry);
const publicCounts=publicRegistryCounts(publicEntries);

function documentFor(entry){return modelDocumentFor(entry)}

function render(){
  const query=$("#search").value.trim().toLowerCase();
  const entries=publicEntries.filter(item=>(kind==="all"||item.kind===kind)&&(!query||[item.id,item.title,item.summary,item.semanticType??"",...(item.tags??[]),...(item.capabilities??[])].join(" ").toLowerCase().includes(query)));
  $("#resultsMeta").textContent=`显示 ${entries.length} 个条目 · Registry Protocol ${registry.schemaVersion}`;
  $("#entries").innerHTML=entries.map(item=>`<article data-entry="${escape(item.id)}" tabindex="0"><div class="card-preview"><canvas data-preview="${escape(item.id)}"></canvas><span>${item.editor?.node||item.editor?.document?"可编辑数字模型":"方法定义"}</span></div><div class="card-content"><div class="card-top"><span class="kind ${item.kind}">${labels[item.kind]??item.kind}</span><code>${escape(item.id)}@${escape(item.version)}</code></div><h2>${escape(item.title)}</h2><p>${escape(item.summary)}</p>${item.semanticType?`<div class="semantic">${escape(item.semanticType)}</div>`:""}<div class="capabilities">${(item.capabilities??[]).map(capability=>`<span>${escape(capability)}</span>`).join("")}</div><div class="card-bottom"><small>${escape(item.license??item.source??"registry")}</small><button data-open="${escape(item.id)}">查看模型与代码 →</button></div></div></article>`).join("")||`<div class="empty">没有匹配条目</div>`;
  $("#entries").querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();openDetail(button.dataset.open)}));
  $("#entries").querySelectorAll("article[data-entry]").forEach(card=>{card.addEventListener("click",()=>openDetail(card.dataset.entry));card.addEventListener("keydown",event=>{if(event.key==="Enter")openDetail(card.dataset.entry)})});
  requestAnimationFrame(()=>entries.forEach(item=>drawEntryPreview(document.querySelector(`canvas[data-preview="${CSS.escape(item.id)}"]`),previewNodes(item),.72)));
}

function openDetail(id){
  activeEntry=publicEntries.find(item=>item.id===id);if(!activeEntry)return;
  $("#detailKind").textContent=labels[activeEntry.kind];$("#detailTitle").textContent=activeEntry.title;$("#detailId").textContent=`${activeEntry.id}@${activeEntry.version}`;$("#detailSummary").textContent=activeEntry.summary;
  $("#detailCapabilities").innerHTML=activeEntry.capabilities.map(value=>`<span>${escape(value)}</span>`).join("");
  const guide=$("#detailGuide");guide.hidden=!activeEntry.guide;guide.innerHTML=activeEntry.guide?`<div><span>解决什么问题</span><p>${escape(activeEntry.guide.problem)}</p></div><ol>${activeEntry.guide.steps.map(step=>`<li>${escape(step)}</li>`).join("")}</ol><div class="method-result"><span>得到的结果</span><p>${escape(activeEntry.guide.result)}</p></div>`:"";
  $("#parameterList").innerHTML=Object.entries(activeEntry.parameters??{}).map(([key,value])=>`<div><span>${escape(key)}</span><code>${escape(value.type??"value")}${value.unit?` · ${escape(value.unit)}`:""}${value.default!==undefined?` · 默认 ${escape(JSON.stringify(value.default))}`:""}</code></div>`).join("")||`<div><span>定义类型</span><code>${labels[activeEntry.kind]}</code></div>`;
  $("#modelCode").textContent=JSON.stringify(documentFor(activeEntry),null,2);$("#useInEditor").hidden=!(activeEntry.editor?.node||activeEntry.editor?.document);
  preview={yaw:-.7,pitch:.48,zoom:105};$("#detailDialog").showModal();requestAnimationFrame(drawDetail);
}

function previewNodes(entry){return modelPreviewNodes(entry,modelCore)}
function drawPreviewSafely(canvas,nodes,options,label){
  try{drawModelPreview(canvas,nodes,options)}
  catch(error){
    if(!canvas)return;
    const context=canvas.getContext("2d"),width=canvas.clientWidth||320,height=canvas.clientHeight||180,ratio=window.devicePixelRatio||1;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
    context.fillStyle="#71808a";context.font="12px sans-serif";context.textAlign="center";context.fillText(label,width/2,height/2);
    console.warn("Model preview failed",error);
  }
}
function drawModel(canvas,nodes,scale=1){drawPreviewSafely(canvas,nodes,{...preview,scale},"暂无可视预览")}
function drawEntryPreview(canvas,nodes,scale){drawPreviewSafely(canvas,nodes,{yaw:-.7,pitch:.48,zoom:80,scale},"暂无可视预览")}
function drawDetail(){drawModel($("#modelPreview"),previewNodes(activeEntry),1)}

$("#counts").innerHTML=[[publicCounts.component,"构件"],[publicCounts.method,"空间方法"],[publicCounts.composition,"完整模型"]].map(([value,label])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join("");
$("#search").addEventListener("input",render);$("#filters").addEventListener("click",event=>{const button=event.target.closest("[data-kind]");if(!button)return;kind=button.dataset.kind;$("#filters .active")?.classList.remove("active");button.classList.add("active");render()});
$("#closeDetail").addEventListener("click",()=>$("#detailDialog").close());
$("#copyCode").addEventListener("click",async()=>{await navigator.clipboard.writeText($("#modelCode").textContent);$("#copyCode").textContent="已复制";setTimeout(()=>$("#copyCode").textContent="复制代码",1200)});
$("#useInEditor").addEventListener("click",()=>{if(!(activeEntry?.editor?.node||activeEntry?.editor?.document))return;localStorage.setItem("agentscene.library-import",JSON.stringify({source:activeEntry.id,document:documentFor(activeEntry)}));location.href="../editor/?libraryImport=1"});
$("#modelPreview").addEventListener("pointerdown",event=>{drag={x:event.clientX,y:event.clientY,yaw:preview.yaw,pitch:preview.pitch};event.currentTarget.setPointerCapture(event.pointerId)});$("#modelPreview").addEventListener("pointermove",event=>{if(!drag)return;preview.yaw=drag.yaw+(event.clientX-drag.x)*.01;preview.pitch=Math.max(-1.4,Math.min(1.4,drag.pitch+(event.clientY-drag.y)*.01));drawDetail()});$("#modelPreview").addEventListener("pointerup",()=>drag=null);$("#modelPreview").addEventListener("wheel",event=>{event.preventDefault();preview.zoom=Math.max(35,Math.min(240,preview.zoom*Math.exp(-event.deltaY*.001)));drawDetail()},{passive:false});window.addEventListener("resize",()=>{if($("#detailDialog").open)drawDetail()});
render();
