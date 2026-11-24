import { analyzeMonitoring, monitoringFrameDocument } from "../../packages/core/src/monitoring.js";

const colors = { strain: "#8a620e", displacement: "#a34e26", acceleration: "#08766f", tilt: "#285e96" };
const stateLabels = { normal: "正常", "above-limit": "超限待确认", alarm: "持续超限", unavailable: "无读数" };
const valueText = (value, kind) => value === null ? "—" : new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: kind === "acceleration" ? 5 : kind === "strain" ? 1 : 3,
}).format(value);
const axisText = vector => vector.map(value => Math.abs(value) < 0.001 ? "0" : Number(value.toFixed(3))).join(" / ");

function drawChart(canvas, series, frameIndex) {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;
  const dpi = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpi);
  canvas.height = Math.round(height * dpi);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpi, dpi);
  const { samples, limit, kind } = series;
  const extent = Math.max(limit, ...samples.map(sample => Math.abs(sample.value ?? 0))) * 1.15;
  const left = 53, right = width - 12, top = 16, bottom = height - 24;
  const x = index => left + index / (samples.length - 1) * (right - left);
  const y = value => top + (1 - value / extent) * (bottom - top) / 2;
  ctx.font = "10px system-ui";
  for (const value of [limit, 0, -limit]) {
    ctx.strokeStyle = value ? "#c18374" : "#aab9c3";
    ctx.setLineDash(value ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillStyle = value ? "#8a4638" : "#556876";
    ctx.textAlign = "right";
    ctx.fillText(valueText(value, kind), left - 6, y(value) + 3);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = colors[kind];
  ctx.lineWidth = 2;
  ctx.beginPath();
  let continuous = false;
  samples.forEach(({ value }, index) => {
    if (value === null) { continuous = false; return; }
    if (continuous) ctx.lineTo(x(index), y(value));
    else ctx.moveTo(x(index), y(value));
    continuous = true;
  });
  ctx.stroke();
  samples.forEach(({ value, state }, index) => {
    if (state !== "alarm") return;
    ctx.fillStyle = "#b43d38";
    ctx.beginPath();
    ctx.arc(x(index), y(value), 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = "#627685";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x(frameIndex), top);
  ctx.lineTo(x(frameIndex), bottom);
  ctx.stroke();
  const value = samples[frameIndex].value;
  if (value !== null) {
    ctx.fillStyle = "#263945";
    ctx.beginPath();
    ctx.arc(x(frameIndex), y(value), 3.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#556876";
  ctx.textAlign = "left";
  ctx.fillText("0 s", left, height - 7);
  ctx.textAlign = "right";
  ctx.fillText(`${samples.at(-1).timeSeconds.toFixed(2)} s`, right, height - 7);
}

export function createMonitoringPanel({ panel, tab, markers, registry, onOpen, onPreview }) {
  let source, baseline, analysis, pointId, problem;
  let frameIndex = 0, timer = null, active = false, controls;
  const pins = new Map();

  function pause() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (controls) controls.play.textContent = "播放";
  }

  function load(document, build) {
    pause();
    const item = document.parameters?.monitoring;
    const same = document.id === source?.id && item?.id === source?.parameters.monitoring?.id;
    source = item ? document : null;
    baseline = build;
    analysis = undefined;
    problem = undefined;
    frameIndex = 0;
    pointId = same && item?.points.some(point => point.id === pointId) ? pointId : item?.points[0]?.id;
    tab.hidden = !item;
    panel.replaceChildren();
    markers.replaceChildren();
    controls = undefined;
    pins.clear();
    if (!item) return;
    for (const point of item.points) {
      const pin = documentElement("button", "monitor-marker", point.id);
      pin.type = "button";
      pin.dataset.pointId = point.id;
      pin.style.setProperty("--point-color", colors[point.kind]);
      pin.setAttribute("aria-label", `查看测点 ${point.id} ${point.label}`);
      pin.addEventListener("click", () => {
        pointId = point.id;
        onOpen();
        render();
      });
      markers.append(pin);
      pins.set(point.id, pin);
    }
    if (active) render();
    return !same;
  }

  function documentElement(tag, className = "", text = "") {
    const element = panel.ownerDocument.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function setFrame(index) {
    frameIndex = index;
    try {
      const loadRatio = analysis.frames[index].loadRatio;
      const preview = loadRatio ? registry.build(monitoringFrameDocument(source, loadRatio, { display: true })) : null;
      onPreview(preview ? { ...preview, bounds: baseline.bounds } : null);
      controls.error.textContent = "";
    } catch (error) {
      pause();
      onPreview(null);
      controls.error.textContent = `当前帧无法显示 · ${error.message}`;
    }
    render();
  }

  function togglePlay() {
    if (timer !== null) { pause(); return; }
    if (frameIndex === analysis.frames.length - 1) setFrame(0);
    timer = setInterval(() => {
      setFrame(frameIndex + 1);
      if (frameIndex === analysis.frames.length - 1) pause();
    }, Math.min(2_147_483_647, analysis.stepSeconds * 1000));
    controls.play.textContent = "暂停";
  }

  function initControls() {
    panel.innerHTML = `<div class="monitor-layout">
      <section class="section monitor-case">
        <h3 class="monitor-case-title" data-monitor="title"></h3>
        <p class="monitor-note" data-monitor="description"></p>
        <div class="monitor-timeline">
          <button type="button" data-monitor="play" class="button secondary">播放</button>
          <input type="range" min="0" step="1" aria-label="采样时间" data-monitor="timeline">
        </div>
        <output data-monitor="clock" class="monitor-clock"></output>
        <p role="alert" class="monitor-error" data-monitor="error"></p>
      </section>
      <section class="section">
        <div class="section-title">测点</div>
        <div data-monitor="choices" class="monitor-choices" role="group" aria-label="选择测点"></div>
        <div class="monitor-current"><strong data-monitor="reading"></strong><span data-monitor="state"></span></div>
        <canvas class="monitor-chart" data-monitor="chart" role="img"></canvas>
        <dl class="monitor-details" data-monitor="details"></dl>
      </section>
      <section class="section"><div class="section-title">报警记录</div><div data-monitor="alarms"></div></section>
    </div>`;
    controls = Object.fromEntries(Array.from(panel.querySelectorAll("[data-monitor]"), element => [element.dataset.monitor, element]));
    controls.title.textContent = analysis.label;
    controls.description.textContent = `教学工况 · 每 ${analysis.stepSeconds} s 采样 · 画面变形 ×${analysis.displayScale}`;
    controls.timeline.max = analysis.frames.length - 1;
    controls.timeline.addEventListener("input", () => {
      pause();
      setFrame(controls.timeline.valueAsNumber);
    });
    controls.play.addEventListener("click", togglePlay);
    for (const series of analysis.series) {
      const button = documentElement("button", "monitor-choice", series.pointId);
      button.type = "button";
      button.title = series.label;
      button.dataset.pointId = series.pointId;
      button.style.setProperty("--point-color", colors[series.kind]);
      button.addEventListener("click", () => {
        pointId = series.pointId;
        render();
        onPreview(undefined);
      });
      controls.choices.append(button);
    }
  }

  function render() {
    if (!source || !active) return;
    if (!analysis && !problem) {
      try { analysis = analyzeMonitoring(source, registry, { baseline }); }
      catch (error) { problem = error.message; }
    }
    if (problem) {
      panel.replaceChildren(documentElement("p", "monitor-error", problem));
      return;
    }
    if (!controls) initControls();
    const series = analysis.series.find(item => item.pointId === pointId);
    const frame = analysis.frames[frameIndex], sample = series.samples[frameIndex];
    controls.timeline.value = frameIndex;
    controls.timeline.setAttribute("aria-valuetext", `${frame.timeSeconds.toFixed(2)} 秒`);
    controls.clock.textContent = `${frame.timeSeconds.toFixed(2)} s · 荷载 ${Math.round(frame.loadRatio * 100)}%`;
    controls.choices.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.pointId === pointId)));
    controls.reading.textContent = `${valueText(sample.value, series.kind)} ${series.unit}`;
    controls.state.textContent = stateLabels[sample.state];
    controls.state.dataset.state = sample.state;
    controls.chart.setAttribute("aria-label", `${series.pointId} ${series.label}，当前读数 ${controls.reading.textContent}`);
    if (controls.pointId !== pointId) {
      controls.pointId = pointId;
      const details = [
        ["安装位置", series.label], ["构件", series.targetNode], ["测轴 X / Y / Z", axisText(series.axis)],
        ...(series.reference ? [["固定参考", series.reference]] : []),
        ["报警条件", `绝对值 > ${valueText(series.limit, series.kind)} ${series.unit}，持续 ${series.holdSeconds} s`],
      ];
      controls.details.replaceChildren(...details.flatMap(([key, value]) => [documentElement("dt", "", key), documentElement("dd", "", value)]));
      const alarms = analysis.alarms.filter(alarm => alarm.pointId === pointId);
      controls.alarms.replaceChildren(...alarms.map(alarm => {
        const jump = documentElement("button", "monitor-event",
          `${alarm.timeSeconds.toFixed(2)} s · ${valueText(alarm.value, series.kind)} ${series.unit} 超限`);
        jump.type = "button";
        jump.addEventListener("click", () => { pause(); setFrame(alarm.sampleIndex); });
        return jump;
      }));
      if (!alarms.length) controls.alarms.textContent = "本工况无持续超限";
    }
    drawChart(controls.chart, series, frameIndex);
  }
  new ResizeObserver(() => {
    if (active && controls) drawChart(controls.chart, analysis.series.find(item => item.pointId === pointId), frameIndex);
  }).observe(panel);

  function setActive(next) {
    if (active === next) return;
    active = next;
    if (active) render();
    else {
      pause();
      frameIndex = 0;
      onPreview(null);
    }
  }

  function draw(build, project, ctx) {
    if (!source || !build) return;
    const anchors = build.anchors.definitions;
    const placed = [];
    for (const point of source.parameters.monitoring.points) {
      const sensor = anchors[point.sensor];
      const pin = pins.get(point.id);
      if (!sensor) { pin.hidden = true; continue; }
      const [x, y] = project(sensor.position);
      const selected = active && point.id === pointId;
      pin.hidden = x < 14 || x > markers.clientWidth - 14 || y < 14 || y > markers.clientHeight - 14;
      if (pin.hidden) continue;
      const width = pin.offsetWidth, height = pin.offsetHeight;
      const clamp = (value, size, bounds) => Math.max(size / 2, Math.min(bounds - size / 2, value));
      const pinX = clamp(x, width, markers.clientWidth);
      const candidates = [0, -1, 1, -2, 2, -3, 3].map(offset => clamp(y + offset * (height + 4), height, markers.clientHeight));
      const pinY = candidates.find(candidate => placed.every(other =>
        Math.abs(other.x - pinX) >= (other.width + width) / 2 + 3 ||
        Math.abs(other.y - candidate) >= (other.height + height) / 2 + 3)) ?? candidates[0];
      placed.push({ x: pinX, y: pinY, width, height });
      pin.style.left = `${pinX}px`;
      pin.style.top = `${pinY}px`;
      pin.setAttribute("aria-pressed", String(selected));
      const series = analysis?.series.find(item => item.pointId === point.id);
      const state = series?.samples[frameIndex].state ?? "normal";
      pin.dataset.state = state;
      pin.title = `${point.label} · ${stateLabels[state]}`;
      if (pinY !== y || pinX !== x) {
        ctx.save();
        ctx.strokeStyle = colors[point.kind];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(pinX, pinY);
        ctx.stroke();
        ctx.restore();
      }
      if (!selected) continue;
      ctx.save();
      ctx.strokeStyle = colors[point.kind];
      ctx.fillStyle = colors[point.kind];
      ctx.lineWidth = 2;
      const end = project(sensor.position.map((value, index) => value + sensor.direction[index] * 0.55));
      const angle = Math.atan2(end[1] - y, end[0] - x);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(end[0], end[1]);
      for (const offset of [-0.42, 0.42]) {
        ctx.moveTo(end[0], end[1]);
        ctx.lineTo(end[0] - Math.cos(angle + offset) * 9, end[1] - Math.sin(angle + offset) * 9);
      }
      ctx.stroke();
      if (point.reference && anchors[point.reference]) {
        const [rx, ry] = project(anchors[point.reference].position);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.fillRect(rx - 3, ry - 3, 6, 6);
      }
      ctx.restore();
    }
  }

  return { draw, load, setActive };
}
