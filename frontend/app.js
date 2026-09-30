const API=window.SKYGUARD_API||'http://localhost:8000';
let demo=null, filtered=[], page=0, pageSize=15;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
async function loadDemo(){
  if(!demo){const r=await fetch('data/demo-data.json'); demo=await r.json();}
  filtered=demo.rows; page=0; renderAll(); $('#message').textContent='Loaded the repository test stream: 1,000 readings and 100 diagnosed events.';
}
function renderAll(){
  const rows=demo.rows, anomalies=rows.filter(r=>r.predictedAnomaly===1).length, normal=rows.length-anomalies;
  $('#total').textContent=rows.length.toLocaleString(); $('#anomalyTotal').textContent=anomalies.toLocaleString(); $('#normal').textContent=normal.toLocaleString(); $('#anomalyPct').textContent=(anomalies/rows.length*100).toFixed(1)+'% of stream'; $('#events').textContent=demo.events.length; $('#navAnomalyCount').textContent=anomalies;
  $('#healthRing').textContent=(normal/rows.length*100).toFixed(1)+'%';
  $('#f1').textContent=demo.metrics.f1_score.toFixed(3); $('#algorithm').textContent=demo.model.algorithm; $('#threshold').textContent=demo.model.decision_threshold.toFixed(4);
  renderFaults(rows); renderLatest(rows.slice(-8).reverse()); renderEvents(); renderReadings(); drawChart(rows); if(!$('#engineerPanel').dataset.selected){ const first=rows.find(r=>r.predictedAnomaly===1); if(first) $('#engineerPanel').innerHTML=engineerCard(first); }
}
function renderFaults(rows){const counts={}; rows.forEach(r=>{let f=r.fault==='NO_FAULT'?'Normal':r.fault;counts[f]=(counts[f]||0)+1}); const list=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5), max=list[0]?.[1]||1; $('#faultBars').innerHTML=list.map(([name,n])=>`<div class="fault-line"><div class="fault-meta"><span>${name.replaceAll('_',' ')}</span><b>${n}</b></div><div class="fault-track"><div class="fault-fill" style="width:${n/max*100}%"></div></div></div>`).join('')}
function typeLabel(r){
  if(!r.predictedAnomaly) return 'Normal';
  const type=String(r.anomalyType||r.fault||'anomaly').toLowerCase();
  const feature=String(r.topFeature||r.affected_sensors||'').toLowerCase();
  if(type.includes('spike')) return feature.includes('temperature')?'Temperature spike':feature.includes('humidity')?'Humidity spike':feature.includes('pressure')?'Pressure spike':'Sensor spike';
  if(type.includes('frozen')) return feature.includes('humidity')?'Humidity frozen sensor':feature.includes('temperature')?'Temperature frozen sensor':feature.includes('pressure')?'Pressure frozen sensor':'Frozen sensor';
  if(type.includes('cross')||type.includes('multivariate')) return 'Multivariate / cross-variable anomaly';
  if(type.includes('drift')) return feature.includes('temperature')?'Temperature drift':feature.includes('humidity')?'Humidity drift':feature.includes('pressure')?'Pressure drift':'Sensor drift';
  if(type.includes('noise')) return 'Noise burst';
  if(type.includes('communication')) return 'Communication failure';
  if(type.includes('temporal')) return 'Temporal anomaly';
  return 'General anomaly';
}
function anomalyType(r){
  const label=typeLabel(r);
  return label==='Normal'?'<span class="type-tag normal-type">Normal</span>':`<span class="type-tag anomaly-type">${label}</span>`;
}

function engineerGuide(r){
  const type=String(r.anomalyType||r.fault||'').toLowerCase(), feature=String(r.topFeature||r.affected_sensors||'').toLowerCase();
  const sensor=feature.includes('temperature')?'Temperature':feature.includes('humidity')?'Humidity':feature.includes('pressure')?'Pressure':feature||'affected sensor';
  if(!r.predictedAnomaly) return {title:'No fault action required',check:'No abnormal behaviour detected in this reading.',action:'Accept reading; continue normal monitoring.',verify:'No immediate field inspection needed.'};
  if(type.includes('spike')||type.includes('noise')) return {title:`${sensor} spike / noise burst`,check:`Inspect the ${sensor.toLowerCase()} sensor head, cable, connector and grounding first.`,action:'Check loose connectors, damaged cable, moisture ingress and electrical interference; reseat the connector and verify grounding.',verify:'Compare the next few readings with a trusted reference. If the spike repeats, inspect or replace the sensor/cable.'};
  if(type.includes('frozen')) return {title:`${sensor} frozen sensor`,check:`Check whether the ${sensor.toLowerCase()} value is staying nearly unchanged while other weather variables change.`,action:'Inspect sensor power, wiring and communication channel; verify the sensor is responding to a controlled change or known reference.',verify:'Confirm the value changes normally over subsequent samples. If it remains fixed, replace the sensor or channel.'};
  if(type.includes('drift')) return {title:`${sensor} drift`,check:`Inspect calibration and compare the ${sensor.toLowerCase()} reading against a calibrated reference.`,action:'Check calibration offset, sensor ageing, contamination and mounting conditions.',verify:'Perform a calibration/reference check. Recalibrate or replace the sensor if the offset persists.'};
  if(type.includes('cross')||type.includes('multivariate')) return {title:'Multivariate / cross-variable anomaly',check:'Compare temperature, humidity and pressure together before replacing any sensor.',action:'Verify sensor relationships, wiring and station conditions; inspect the channel with the highest attribution first.',verify:'Cross-check against a nearby/reference station and confirm all three channels return to a physically consistent relationship.'};
  if(type.includes('temporal')) return {title:'Temporal anomaly',check:'Inspect the recent time sequence for an abrupt change, repeated pattern, or timing-related discontinuity.',action:'Check timestamps, sampling interval, logger clock, communications and the affected sensor channel.',verify:'Confirm the time series returns to the expected sampling interval and behaviour after correction.'};
  return {title:'General anomaly',check:`Inspect ${sensor.toLowerCase()} and the station data path.`,action:'Check sensor, connector, power and communication path before replacing hardware.',verify:'Confirm stable readings after inspection and compare with a trusted reference.'};
}
function engineerCard(r){
  const g=engineerGuide(r), label=typeLabel(r), severity=String(r.severity||'INFO').toLowerCase();
  const evidence=r.topFeature||r.affected_sensors||'—';
  const attribution=r.topFeaturePct?Number(r.topFeaturePct).toFixed(0)+'% attribution':'diagnosis evidence';
  const explanation=r.explanation||'The repository model flagged this reading/event as anomalous. Use the anomaly type, affected sensor and model evidence above to guide the first field checks.';
  return `<div class="engineer-card engineer-card-live"><div class="engineer-card-head"><div><p class="kicker accent">ENGINEER QUICK DIAGNOSIS</p><h3>${g.title}</h3><div class="engineer-type"><span>ANOMALY TYPE</span><strong>${label}</strong></div></div><span class="severity sev-${severity}">${r.severity||'INFO'}</span></div><div class="diagnosis-grid"><div><span>1 · What to check first</span><b>${g.check}</b></div><div><span>2 · Recommended action</span><b>${g.action}</b></div><div><span>3 · How to verify the repair</span><b>${g.verify}</b></div><div><span>4 · Model evidence / attribution</span><b>${evidence} · ${attribution}</b></div></div><details class="explanation-box" open><summary>Detailed explanation</summary><p>${explanation}</p></details></div>`;
}
function selectEngineerRow(i){const r=filtered[i]; if(r) $('#engineerPanel').innerHTML=engineerCard(r)}

function status(r){return r.predictedAnomaly?'<span class="status-tag anomaly">ANOMALY</span>':'<span class="status-tag normal">NORMAL</span>'}
function renderLatest(rows){$('#latestBody').innerHTML=rows.map((r,i)=>`<tr class="${r.predictedAnomaly?'clickable-row':''}" data-row-index="${demo.rows.indexOf(r)}"><td>${new Date(r.datetime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td><td>${r.temperature.toFixed(1)}°C</td><td>${r.pressure.toFixed(1)}</td><td>${r.humidity.toFixed(1)}%</td><td>${status(r)}</td><td>${anomalyType(r)}</td></tr>`).join(''); $$('#latestBody tr.clickable-row').forEach(tr=>tr.addEventListener('click',()=>{const r=demo.rows[Number(tr.dataset.rowIndex)]; openAnomalyModal(r)}))}
function eventRecord(e){
  return {
    predictedAnomaly:1,
    anomalyType:String(e.fault||'anomaly').toLowerCase(),
    fault:e.fault,
    severity:e.severity,
    topFeature:e.affected_sensors,
    topFeaturePct:e.root_cause_confidence?Number(e.root_cause_confidence)*100:0,
    confidence:e.anomaly_confidence!=null?Number(e.anomaly_confidence):null,
    qcAction:e.qc_action,
    urgency:e.urgency,
    notify:e.notify,
    explanation:e.narrative
  };
}
function sensorLabel(value){
  const raw=String(value||'').toLowerCase();
  const labels=[];
  if(raw.includes('temperature')) labels.push('Temperature');
  if(raw.includes('humidity')) labels.push('Relative Humidity');
  if(raw.includes('pressure')) labels.push('Barometric Pressure');
  return labels.length?labels.join(' + '):String(value||'Affected sensor').replaceAll('_',' ');
}
function confidenceValue(r){
  if(r.confidence!=null && Number.isFinite(Number(r.confidence))) return Math.max(0,Math.min(1,Number(r.confidence)));
  if(r.anomaly_confidence!=null && Number.isFinite(Number(r.anomaly_confidence))) return Math.max(0,Math.min(1,Number(r.anomaly_confidence)));
  return null;
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function anomalyDetails(r){
  const g=engineerGuide(r), label=typeLabel(r), sev=String(r.severity||'INFO').toLowerCase();
  const confidence=confidenceValue(r);
  const confText=confidence==null?'Not available':`${(confidence*100).toFixed(0)}%`;
  const sensor=sensorLabel(r.topFeature||r.affected_sensors);
  const evidence=r.topFeaturePct?`${escapeHtml(sensor)} · ${Number(r.topFeaturePct).toFixed(0)}% attribution`:`${escapeHtml(sensor)} · available diagnosis evidence`;
  const explanation=r.explanation||'The repository diagnosis flagged this event as anomalous. Use the affected sensor and evidence to guide the first field checks.';
  const action=r.urgency&&r.urgency!=='No action required.'?r.urgency:g.action;
  const qc=r.qcAction||r.qc_action||'—';
  return `<div class="anomaly-summary">
      <div class="anomaly-summary-title"><span class="type-tag anomaly-type">${escapeHtml(label)}</span><span class="severity sev-${escapeHtml(sev)}">${escapeHtml(r.severity||'INFO')}</span></div>
      <div class="anomaly-meta-grid">
        <div><span>Sensor</span><strong>${escapeHtml(sensor)}</strong></div>
        <div><span>Anomaly type</span><strong>${escapeHtml(label)}</strong></div>
        <div><span>Confidence</span><strong>${escapeHtml(confText)}</strong></div>
        <div><span>Model evidence</span><strong>${evidence}</strong></div>
      </div>
    </div>
    <div class="diagnosis-grid modal-diagnosis">
      <div><span>1 · What to check first</span><b>${escapeHtml(g.check)}</b></div>
      <div><span>2 · Recommended field action</span><b>${escapeHtml(g.action)}</b></div>
      <div><span>3 · How to verify repair</span><b>${escapeHtml(g.verify)}</b></div>
      <div><span>4 · QC disposition</span><b>${escapeHtml(qc)}</b></div>
    </div>
    <div class="modal-explanation"><p class="kicker accent">WHY WAS IT FLAGGED?</p><p>${escapeHtml(explanation)}</p></div>
    ${r.urgency?`<div class="modal-note"><b>Operational guidance:</b> ${escapeHtml(r.urgency)}</div>`:''}`;
}
function openAnomalyModal(r){
  const modal=$('#anomalyModal'), body=$('#anomalyModalBody');
  if(!modal||!body) return;
  body.innerHTML=anomalyDetails(r);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
}
function closeAnomalyModal(){
  const modal=$('#anomalyModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
function renderEvents(){
  const sev=$('#severityFilter').value;
  const events=demo.events.filter(e=>sev==='all'||e.severity===sev);
  $('#eventsBody').innerHTML=events.slice(0,100).map((e,i)=>{
    const r=eventRecord(e);
    return `<tr class="clickable-row" data-event-index="${i}" tabindex="0" aria-label="Open anomaly details">
      <td>${escapeHtml(new Date(e.start).toLocaleString())}</td>
      <td>${escapeHtml(String(e.fault).replaceAll('_',' '))}</td>
      <td>${escapeHtml(sensorLabel(e.affected_sensors))}</td>
      <td>${anomalyType(r)}</td>
      <td><span class="severity sev-${String(e.severity).toLowerCase()}">${escapeHtml(e.severity)}</span></td>
      <td>${r.confidence==null?'—':(r.confidence*100).toFixed(0)+'%'}</td>
      <td>${escapeHtml(e.qc_action||'—')}</td>
      <td><button class="diagnose-btn" type="button" data-diagnose="${i}">View details →</button></td>
    </tr>`;
  }).join('');
  $$('#eventsBody tr.clickable-row').forEach(tr=>{
    const open=()=>{const e=events[Number(tr.dataset.eventIndex)]; if(e) openAnomalyModal(eventRecord(e));};
    tr.addEventListener('click',open);
    tr.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open();}});
  });
  $$('#eventsBody [data-diagnose]').forEach(btn=>btn.addEventListener('click',ev=>{
    ev.stopPropagation();
    const e=events[Number(btn.dataset.diagnose)];
    if(e) openAnomalyModal(eventRecord(e));
  }));
}
function renderReadings(){const q=($('#search')?.value||'').toLowerCase(); filtered=demo.rows.filter(r=>`${r.datetime} ${r.fault} ${r.anomalyType} ${r.predictedAnomaly?'anomaly':'normal'}`.toLowerCase().includes(q));const start=page*pageSize, slice=filtered.slice(start,start+pageSize);$('#readingsBody').innerHTML=slice.map((r,i)=>`<tr class="${r.predictedAnomaly?'clickable-row':''}" data-row-index="${demo.rows.indexOf(r)}"><td>${start+i+1}</td><td>${r.datetime}</td><td>${r.temperature.toFixed(1)} °C</td><td>${r.pressure.toFixed(1)} hPa</td><td>${r.humidity.toFixed(1)} %</td><td>${r.score.toFixed(2)}</td><td>${status(r)}</td><td>${anomalyType(r)}</td></tr>`).join('');$('#tableInfo').textContent=`${filtered.length?start+1:0}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length.toLocaleString()}`;$('#prev').disabled=page===0;$('#next').disabled=start+pageSize>=filtered.length; $$('#readingsBody tr.clickable-row').forEach(tr=>tr.addEventListener('click',()=>{const r=demo.rows[Number(tr.dataset.rowIndex)]; openAnomalyModal(r)}))}
function drawChart(rows){const c=$('#telemetryChart'),ctx=c.getContext('2d'),rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=rect.width*dpr;c.height=rect.height*dpr;ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,p=24, sample=rows.filter((_,i)=>i%8===0), vals=sample.map(r=>r.temperature), min=Math.min(...vals)-1,max=Math.max(...vals)+1;ctx.strokeStyle='#252d40';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=p+i*(h-p*2)/4;ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(w-p,y);ctx.stroke()}function line(key,color,lo,hi){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();sample.forEach((r,i)=>{let v=r[key],y=h-p-(v-lo)/(hi-lo)*(h-p*2),x=p+i*(w-p*2)/(sample.length-1);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}line('temperature','#a487ff',min,max)}
async function analyzeFile(file){const msg=$('#message');msg.textContent='Sending CSV to the unchanged SkyGuard backend…';try{const f=new FormData();f.append('file',file);const res=await fetch(`${API}/api/analyze`,{method:'POST',body:f});const data=await res.json();if(!res.ok)throw Error(data.detail||'Analysis failed');demo={rows:data.results.map(x=>({datetime:`Row ${x.row}`,temperature:Number(x.values.temperature),pressure:Number(x.values.pressure),humidity:Number(x.values.humidity),predictedAnomaly:x.anomaly?1:0,actualAnomaly:x.anomaly?1:0,score:Number(x.score),fault:x.anomaly?'ANOMALY':'NO_FAULT',anomalyType:x.anomaly?'ANOMALY':'normal'})),events:[],metrics:{f1_score:0},model:{algorithm:data.detector,decision_threshold:0}};filtered=demo.rows;page=0;renderAll();msg.textContent=`Analysis complete using ${data.detector}. ${data.anomalies} anomalies flagged from ${data.total} valid readings.`}catch(e){msg.textContent=e.message}}
async function checkBackend(){const chip=$('#backendChip'),api=$('#apiStatus');try{const r=await fetch(`${API}/api/model-status`);const d=await r.json();chip.textContent=d.detector||'Available';api.textContent=d.detector||'Model endpoint online'}catch(e){chip.textContent='Offline';api.textContent='Start backend on :8000'}}
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.section)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.go)));
function showSection(id){$$('.page').forEach(p=>p.classList.remove('active-page'));$('#'+id).classList.add('active-page');$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.section===id));$('#pageTitle').textContent={dashboard:'Operations dashboard',anomalies:'Anomaly event log',stations:'Station data',model:'Model health'}[id]}
$('#loadDemo').addEventListener('click',loadDemo);$('#file').addEventListener('change',e=>e.target.files[0]&&analyzeFile(e.target.files[0]));$('#refresh').addEventListener('click',loadDemo);$('#severityFilter').addEventListener('change',renderEvents);$('#search').addEventListener('input',()=>{page=0;renderReadings()});$('#prev').addEventListener('click',()=>{page--;renderReadings()});$('#next').addEventListener('click',()=>{page++;renderReadings()});$('#checkBackend').addEventListener('click',checkBackend);window.addEventListener('resize',()=>demo&&drawChart(demo.rows));
$('#closeAnomaly')?.addEventListener('click',closeAnomalyModal);
$$('[data-close-anomaly]').forEach(el=>el.addEventListener('click',closeAnomalyModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAnomalyModal();});
loadDemo();checkBackend();
