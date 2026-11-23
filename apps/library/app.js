import { publicRegistryDomains, searchPublicRegistry } from "../../registry/catalog.js";
import { createDefaultRegistry } from "../../packages/core/src/index.js";
import { catalog, loadCatalogEntry } from "../shared/browser-catalog.js";
import { modelDocumentFor, modelPreviewBuild, observeModelPreviews } from "../shared/model-preview.js";
import { publicRegistryCounts } from "../shared/registry-visibility.js";
import { createLibraryPreview, libraryPreviewView } from "./preview.js";

const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const labels={component:"参数化构件",method:"空间方法",composition:"完整模型"};
let kind="all",activeEntry=null,preview={...libraryPreviewView},drag=null;
let activePreview,stopCardPreviews,detailRequest=0;
let matches=[],page=1;
const pageSize=24;
const modelCore=createDefaultRegistry();
const publicCounts=publicRegistryCounts(catalog.entries);
const summaryById=new Map(catalog.entries.map(item=>[item.id,item]));
const previewRenderer=createLibraryPreview();
const entriesGrid=$("#entries");
const resultsMeta=$("#resultsMeta");
const pagination=[...document.querySelectorAll(".pagination")];

function documentFor(entry){return modelDocumentFor(entry)}

function observeCards() {
  stopCardPreviews?.();
  stopCardPreviews = observeModelPreviews(entriesGrid.querySelectorAll("canvas[data-preview]"), async canvas => {
    const summary = summaryById.get(canvas.dataset.preview);
    try {
      const entry = summary.hasPreview ? await loadCatalogEntry(summary) : null;
      if (!canvas.isConnected) return;
      const build = entry ? modelPreviewBuild(entry, modelCore, { studioLighting: true }) : { nodes: [] };
      if (build?.bounds) await previewRenderer.prepare();
      if (canvas.isConnected) drawPreview(canvas, build, libraryPreviewView, { thumbnail: true });
    } catch (error) {
      console.warn("Model preview load failed", summary.id, error);
    }
  });
}

function renderPage() {
  const total = matches.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  resultsMeta.textContent = total ? `显示第 ${start + 1}–${end} 项，共 ${total} 项` : "共 0 项";
  entriesGrid.innerHTML = matches.slice(start, end).map(item => `
    <article data-entry="${escape(item.id)}" tabindex="0">
      <div class="card-preview">
        <canvas data-preview="${escape(item.id)}" aria-label="${escape(item.title)}预览"></canvas>
      </div>
      <div class="card-content">
        <div class="card-top">
          <span class="kind ${item.kind}">${labels[item.kind] ?? item.kind}</span>
          <code>${escape(item.id)}@${escape(item.version)}</code>
        </div>
        <h2>${escape(item.title)}</h2>
        <p>${escape(item.summary)}</p>
        ${item.semanticType ? `<div class="semantic">${escape(item.semanticType)}</div>` : ""}
        <div class="capabilities">${(item.capabilities ?? []).map(capability => `<span>${escape(capability)}</span>`).join("")}</div>
        <div class="card-bottom">
          <small>${escape(item.license ?? item.source ?? "registry")}</small>
          <button type="button">查看模型与代码 →</button>
        </div>
      </div>
    </article>`).join("") || '<div class="empty">没有匹配条目</div>';
  const pages = Math.ceil(total / pageSize);
  for (const controls of pagination) {
    controls.hidden = pages <= 1;
    controls.querySelector('[data-page-step="-1"]').disabled = page === 1;
    controls.querySelector('[data-page-step="1"]').disabled = page >= pages;
    const select = controls.querySelector("select");
    if (select.options.length !== pages) {
      select.replaceChildren(...Array.from({ length: pages }, (_, index) => new Option(String(index + 1))));
    }
    select.value = String(page);
    controls.querySelector("[data-page-total]").textContent = `共 ${pages} 页`;
  }
  observeCards();
}

function updateResults() {
  matches = searchPublicRegistry(catalog, $("#search").value, kind, $("#domain").value);
  page = 1;
  renderPage();
}

function goToPage(next, controls, trigger) {
  if (next === page || next < 1 || next > Math.ceil(matches.length / pageSize)) return;
  page = next;
  renderPage();
  if (controls.hasAttribute("data-pagination-bottom")) {
    resultsMeta.focus({ preventScroll: true });
    resultsMeta.scrollIntoView({ block: "start" });
  } else if (trigger.disabled) {
    controls.querySelector("select").focus();
  }
}

async function openDetail(id){
  const summary=summaryById.get(id);
  if(!summary)return;
  const request=++detailRequest,dialog=$("#detailDialog");
  activeEntry=null;
  activePreview=null;
  drag=null;
  $("#detailKind").textContent=labels[summary.kind];$("#detailTitle").textContent=summary.title;$("#detailId").textContent=`${summary.id}@${summary.version}`;$("#detailSummary").textContent=summary.summary;
  $("#detailCapabilities").innerHTML=summary.capabilities.map(value=>`<span>${escape(value)}</span>`).join("");
  $("#detailGuide").hidden=true;
  $("#parameterList").replaceChildren();
  $("#modelCode").textContent="加载模型数据…";
  $("#copyCode").textContent="复制代码";
  $("#copyCode").disabled=true;
  $("#useInEditor").hidden=true;
  preview={...libraryPreviewView};
  if(!dialog.open)dialog.showModal();
  requestAnimationFrame(drawDetail);
  try{
    const entry=await loadCatalogEntry(summary);
    if(!dialog.open||request!==detailRequest)return;
    activeEntry=entry;
  }catch(error){
    if(dialog.open&&request===detailRequest)$("#modelCode").textContent="模型加载失败，请刷新页面后重试。";
    console.warn("Model detail load failed",id,error);
    return;
  }
  activePreview=modelPreviewBuild(activeEntry,modelCore,{studioLighting:true});
  const guide=$("#detailGuide");guide.hidden=!activeEntry.guide;guide.innerHTML=activeEntry.guide?`<div><span>解决什么问题</span><p>${escape(activeEntry.guide.problem)}</p></div><ol>${activeEntry.guide.steps.map(step=>`<li>${escape(step)}</li>`).join("")}</ol><div class="method-result"><span>得到的结果</span><p>${escape(activeEntry.guide.result)}</p></div>`:"";
  $("#parameterList").innerHTML=Object.entries(activeEntry.parameters??{}).map(([key,value])=>`<div><span>${escape(key)}</span><code>${escape(value.type??"value")}${value.unit?` · ${escape(value.unit)}`:""}${value.default!==undefined?` · 默认 ${escape(JSON.stringify(value.default))}`:""}</code></div>`).join("")||`<div><span>定义类型</span><code>${labels[activeEntry.kind]}</code></div>`;
  $("#modelCode").textContent=JSON.stringify(documentFor(activeEntry),null,2);$("#useInEditor").hidden=!summary.hasPreview;
  $("#copyCode").disabled=false;
  requestAnimationFrame(drawDetail);
  if (activePreview.bounds) {
    await previewRenderer.prepare();
    if (dialog.open && request === detailRequest) requestAnimationFrame(drawDetail);
  }
}

function drawPreview(canvas,build,view,options){
  try{previewRenderer.draw(canvas,build,view,options)}
  catch(error){
    if(!canvas)return;
    const context=canvas.getContext("2d"),width=canvas.clientWidth||320,height=canvas.clientHeight||180,ratio=window.devicePixelRatio||1;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
    context.fillStyle="#71808a";context.font="12px sans-serif";context.textAlign="center";context.fillText("暂无可视预览",width/2,height/2);
    console.warn("Model preview failed",error);
  }
}
function drawDetail(){if ($("#detailDialog").open) drawPreview($("#modelPreview"),activePreview,preview)}

$("#counts").innerHTML=[[publicCounts.component,"构件"],[publicCounts.method,"空间方法"],[publicCounts.composition,"完整模型"]].map(([value,label])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join("");
for (const [id, label] of publicRegistryDomains(catalog)) $("#domain").add(new Option(label, id));
entriesGrid.addEventListener("click", event => {
  const card = event.target.closest("article[data-entry]");
  if (card) openDetail(card.dataset.entry);
});
entriesGrid.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.matches("article[data-entry]")) openDetail(event.target.dataset.entry);
});
$("#domain").addEventListener("change",updateResults);
$("#search").addEventListener("input",updateResults);
$("#filters").addEventListener("click", event => {
  const button = event.target.closest("[data-kind]");
  if (!button || button.dataset.kind === kind) return;
  kind = button.dataset.kind;
  const active = $("#filters .active");
  active?.classList.remove("active");
  active?.setAttribute("aria-pressed", "false");
  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");
  updateResults();
});
for (const controls of pagination) {
  controls.append($("#paginationTemplate").content.cloneNode(true));
  controls.addEventListener("click", event => {
    const button = event.target.closest("[data-page-step]");
    if (button) goToPage(page + Number(button.dataset.pageStep), controls, button);
  });
  controls.querySelector("select").addEventListener("change", event => {
    goToPage(Number(event.target.value), controls, event.target);
  });
}
$("#closeDetail").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("close",()=>{if(!$("#detailDialog").open)detailRequest++});
$("#copyCode").addEventListener("click",async()=>{await navigator.clipboard.writeText($("#modelCode").textContent);$("#copyCode").textContent="已复制";setTimeout(()=>$("#copyCode").textContent="复制代码",1200)});
$("#useInEditor").addEventListener("click",()=>{if(!(activeEntry?.editor?.node||activeEntry?.editor?.document))return;localStorage.setItem("agentscene.library-import",JSON.stringify({source:activeEntry.id,document:documentFor(activeEntry)}));location.href="../editor/?libraryImport=1"});
$("#modelPreview").addEventListener("pointerdown",event=>{drag={x:event.clientX,y:event.clientY,yaw:preview.yaw,pitch:preview.pitch};event.currentTarget.setPointerCapture(event.pointerId)});$("#modelPreview").addEventListener("pointermove",event=>{if(!drag)return;preview.yaw=drag.yaw+(event.clientX-drag.x)*.01;preview.pitch=Math.max(-1.4,Math.min(1.4,drag.pitch+(event.clientY-drag.y)*.01));drawDetail()});$("#modelPreview").addEventListener("lostpointercapture",()=>drag=null);$("#modelPreview").addEventListener("wheel",event=>{event.preventDefault();preview.zoom=Math.max(35,Math.min(240,preview.zoom*Math.exp(-event.deltaY*.001)));drawDetail()},{passive:false});
window.addEventListener("resize", () => {
  observeCards();
  drawDetail();
});
updateResults();
