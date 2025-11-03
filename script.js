let originalText = null;
let lastUrl = null;
let zoom = 1;

const els = {
  file: document.getElementById('inputSvg'),
  outerColorPicker: document.getElementById('outerColorPicker'),
  innerColorPicker: document.getElementById('innerColorPicker'),
  outerColor: document.getElementById('outerColor'),
  innerColor: document.getElementById('innerColor'),
  outerFactor: document.getElementById('outerFactor'),
  innerFactor: document.getElementById('innerFactor'),
  outerFactorVal: document.getElementById('outerFactorVal'),
  innerFactorVal: document.getElementById('innerFactorVal'),
  groupId: document.getElementById('groupId'),
  noWatermark: document.getElementById('noWatermark'),
  autoPreview: document.getElementById('autoPreview'),
  refreshBtn: document.getElementById('refreshBtn'),
  download: document.getElementById('downloadLink'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoomReset: document.getElementById('zoomReset'),
};

function setStatus(msg){ els.status.textContent = msg || ''; }

function serialize(xmlDoc){
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

function process(text, opts){
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'image/svg+xml');

  const groups = xml.querySelectorAll(`g[id^='${opts.groupId}']`);
  if (!groups.length) throw new Error(`Group with id '${opts.groupId}' not found.`);

  groups.forEach(g => {
    const paths = g.querySelectorAll('polyline, path');
    paths.forEach(node => {
      const parent = node.parentNode;
      const w = parseFloat(node.getAttribute('stroke-width')) || 3.0;

      const outer = node.cloneNode(true);
      outer.setAttribute('stroke', opts.outerColor);
      outer.setAttribute('stroke-width', (w * opts.outerFactor).toFixed(3));
      outer.setAttribute('fill', 'none');
      outer.setAttribute('stroke-linecap', 'round');
      outer.setAttribute('stroke-linejoin', 'round');

      const inner = node.cloneNode(true);
      inner.setAttribute('stroke', opts.innerColor);
      inner.setAttribute('stroke-width', (w * opts.innerFactor).toFixed(3));
      inner.setAttribute('fill', 'none');
      inner.setAttribute('stroke-linecap', 'round');
      inner.setAttribute('stroke-linejoin', 'round');

      parent.insertBefore(outer, node);
      parent.insertBefore(inner, node);
      parent.removeChild(node);
    });
  });

  if (opts.noWatermark){
    xml.querySelectorAll('text').forEach(t => {
      if (/created by/i.test(t.textContent)) t.remove();
    });
  }

  return serialize(xml);
}

function updatePreview(){
  if (!originalText){ return; }
  try{
    const outText = process(originalText, {
      outerColor: els.outerColor.value.trim(),
      innerColor: els.innerColor.value.trim(),
      outerFactor: parseFloat(els.outerFactor.value) || 3,
      innerFactor: parseFloat(els.innerFactor.value) || 0.7,
      groupId: els.groupId.value.trim() || 'trk1',
      noWatermark: els.noWatermark.checked
    });

    // preview
    els.preview.innerHTML = outText;
    els.preview.style.transform = `scale(${zoom})`;

    // download
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    const blob = new Blob([outText], {type:'image/svg+xml'});
    lastUrl = URL.createObjectURL(blob);
    els.download.href = lastUrl;
    els.download.classList.remove('disabled');
    els.download.setAttribute('aria-disabled','false');

    setStatus('Preview updated.');
  }catch(err){
    setStatus(err.message);
  }
}

function debounce(fn, t=250){
  let id; 
  return (...args)=>{ clearTimeout(id); id = setTimeout(()=>fn(...args), t); };
}
const debouncedUpdate = debounce(updatePreview, 250);

// File load
els.file.addEventListener('change', async (e)=>{
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const text = await file.text();
  originalText = text;
  updatePreview();
});

// Sync color picker <-> text
function syncColor(picker, textInput){
  picker.addEventListener('input', ()=>{
    textInput.value = picker.value;
    if (els.autoPreview.checked) debouncedUpdate(); 
  });
  textInput.addEventListener('input', ()=>{
    // accept plain names or hex; if valid hex, mirror to picker
    const v = textInput.value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) picker.value = v;
    if (els.autoPreview.checked) debouncedUpdate();
  });
}
syncColor(els.outerColorPicker, els.outerColor);
syncColor(els.innerColorPicker, els.innerColor);

// Sliders label + change
function bindSlider(slider, label){
  const updateLabel = ()=> label.textContent = parseFloat(slider.value).toFixed(2);
  slider.addEventListener('input', ()=>{
    updateLabel();
    if (els.autoPreview.checked) debouncedUpdate();
  });
  slider.addEventListener('change', ()=>{
    updateLabel();
    if (els.autoPreview.checked) debouncedUpdate();
  });
  updateLabel();
}
bindSlider(els.outerFactor, els.outerFactorVal);
bindSlider(els.innerFactor, els.innerFactorVal);

// Other fields
['input','change'].forEach(evt => {
  els.groupId.addEventListener(evt, ()=>{ if (els.autoPreview.checked) debouncedUpdate(); });
  els.noWatermark.addEventListener(evt, ()=>{ if (els.autoPreview.checked) debouncedUpdate(); });
});

// Manual refresh
els.refreshBtn.addEventListener('click', updatePreview);

// Auto preview toggle
els.autoPreview.addEventListener('change', ()=>{
  setStatus(els.autoPreview.checked ? 'Auto preview ON' : 'Auto preview OFF');
});

// Zoom controls
els.zoomIn.addEventListener('click', ()=>{ zoom = Math.min(4, zoom + 0.1); updatePreview(); });
els.zoomOut.addEventListener('click', ()=>{ zoom = Math.max(0.2, zoom - 0.1); updatePreview(); });
els.zoomReset.addEventListener('click', ()=>{ zoom = 1; updatePreview(); });

// Help modal logic
document.addEventListener('DOMContentLoaded', () => {
  const helpBtn = document.getElementById('helpBtn');
  const helpOverlay = document.getElementById('helpOverlay');
  const helpClose = document.getElementById('helpClose');

  if (!helpBtn || !helpOverlay || !helpClose) return;

  function openHelp() { helpOverlay.classList.remove('hidden'); helpClose.focus(); }
  function closeHelp() { helpOverlay.classList.add('hidden'); }

  helpBtn.addEventListener('click', openHelp);
  helpClose.addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) closeHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !helpOverlay.classList.contains('hidden')) closeHelp(); });
});
