let originalText = null;
let lastUrl = null;
let zoom = 1;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

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
  keepMapOnly: document.getElementById('keepMapOnly'),
  directionArrows: document.getElementById('directionArrows'),
  arrowSpacing: document.getElementById('arrowSpacing'),
  arrowSpacingVal: document.getElementById('arrowSpacingVal'),
  arrowSize: document.getElementById('arrowSize'),
  arrowSizeVal: document.getElementById('arrowSizeVal'),
  autoPreview: document.getElementById('autoPreview'),
  refreshBtn: document.getElementById('refreshBtn'),
  download: document.getElementById('downloadLink'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoomReset: document.getElementById('zoomReset'),
};

function setStatus(msg) {
  els.status.textContent = msg || '';
}

function serializeSvg(svg) {
  return new XMLSerializer().serializeToString(svg);
}

function createSvgEl(doc, tag) {
  return doc.createElementNS(SVG_NS, tag);
}

function parsePoints(pointsText) {
  if (!pointsText) return [];

  const nums = (pointsText.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  const pts = [];

  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push([x, y]);
    }
  }

  return pts;
}

function polylinePointsToPathD(pointsText) {
  const pts = parsePoints(pointsText);
  if (!pts.length) return '';

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0]} ${pts[i][1]}`;
  }
  return d;
}

function makeGeometryPathFromNode(node) {
  const tag = node.tagName.toLowerCase();

  if (tag === 'path') {
    const p = node.cloneNode(true);
    p.removeAttribute('marker-start');
    p.removeAttribute('marker-mid');
    p.removeAttribute('marker-end');
    return p;
  }

  if (tag === 'polyline') {
    const path = createSvgEl(node.ownerDocument, 'path');
    const d = polylinePointsToPathD(node.getAttribute('points'));
    if (!d) return null;

    path.setAttribute('d', d);

    for (const attr of node.attributes) {
      if (attr.name === 'points') continue;
      path.setAttribute(attr.name, attr.value);
    }

    path.removeAttribute('marker-start');
    path.removeAttribute('marker-mid');
    path.removeAttribute('marker-end');
    return path;
  }

  return null;
}

function cleanSvgHard(svg, groupId) {
  const allowedGroups = Array.from(svg.querySelectorAll(`g[id^='${groupId}']`));
  if (!allowedGroups.length) {
    throw new Error(`Group with id '${groupId}' not found.`);
  }

  Array.from(svg.childNodes).forEach(node => {
    if (node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();
    const isDefs = tag === 'defs';
    const isAllowedTrackGroup = allowedGroups.includes(node);

    if (!isDefs && !isAllowedTrackGroup) {
      node.remove();
    }
  });

  svg.querySelectorAll('text, title, desc, metadata, script').forEach(node => node.remove());
  svg.querySelectorAll('[display="none"], [visibility="hidden"]').forEach(node => node.remove());
}

function ensureArrowSymbol(svg, color) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = createSvgEl(svg.ownerDocument, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  let symbol = svg.querySelector('#dirArrowSymbol');
  if (!symbol) {
    symbol = createSvgEl(svg.ownerDocument, 'symbol');
    symbol.setAttribute('id', 'dirArrowSymbol');
    symbol.setAttribute('viewBox', '-8 -6 16 12');

    const chevron = createSvgEl(svg.ownerDocument, 'polyline');
    chevron.setAttribute('points', '-5,4 0,-1 5,4');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke-width', '2');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('stroke-linejoin', 'round');

    symbol.appendChild(chevron);
    defs.appendChild(symbol);
  }

  const chevron = symbol.querySelector('polyline');
  if (chevron) {
    chevron.setAttribute('stroke', color);
  }

  return symbol;
}

function addDirectionalArrows(svg, groupId, opts) {
  ensureArrowSymbol(svg, opts.arrowColor);

  const groups = svg.querySelectorAll(`g[id^='${groupId}']`);

  groups.forEach(g => {
    g.querySelectorAll('.direction-arrows').forEach(n => n.remove());

    const geometryNodes = g.querySelectorAll('.track-geometry-path');

    geometryNodes.forEach(node => {
      if (typeof node.getTotalLength !== 'function' || typeof node.getPointAtLength !== 'function') {
        return;
      }

      let total;
      try {
        total = node.getTotalLength();
      } catch {
        return;
      }

      if (!Number.isFinite(total) || total < opts.arrowSpacing * 2) {
        return;
      }

      const arrowsLayer = createSvgEl(svg.ownerDocument, 'g');
      arrowsLayer.setAttribute('class', 'direction-arrows');

      const margin = Math.max(opts.arrowSpacing, opts.arrowSize * 1.5);

      for (let d = margin; d < total - margin; d += opts.arrowSpacing) {
        let p0, p1, p2;
        try {
          p0 = node.getPointAtLength(Math.max(0, d - 1.5));
          p1 = node.getPointAtLength(d);
          p2 = node.getPointAtLength(Math.min(total, d + 1.5));
        } catch {
          continue;
        }

        const dx = p2.x - p0.x;
        const dy = p2.y - p0.y;
        const segLen = Math.hypot(dx, dy);

        if (segLen < 0.01) continue;

        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const use = createSvgEl(svg.ownerDocument, 'use');
        use.setAttribute('href', '#dirArrowSymbol');
        use.setAttributeNS(XLINK_NS, 'xlink:href', '#dirArrowSymbol');
        use.setAttribute(
          'transform',
          `translate(${p1.x.toFixed(2)} ${p1.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${(opts.arrowSize / 10).toFixed(3)})`
        );

        arrowsLayer.appendChild(use);
      }

      g.appendChild(arrowsLayer);
    });
  });
}

function process(text, opts) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'image/svg+xml');
  const svg = xml.documentElement;

  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG file.');
  }

  const parserError = xml.querySelector('parsererror');
  if (parserError) {
    throw new Error('SVG parsing error.');
  }

  const groups = svg.querySelectorAll(`g[id^='${opts.groupId}']`);
  if (!groups.length) {
    throw new Error(`Group with id '${opts.groupId}' not found.`);
  }

  groups.forEach(g => {
    const nodes = Array.from(g.querySelectorAll('polyline, path'));

    nodes.forEach(node => {
      if (node.closest('.direction-arrows')) return;

      const parent = node.parentNode;
      const w = parseFloat(node.getAttribute('stroke-width')) || 3.0;

      const visualBase = node.cloneNode(true);
      visualBase.setAttribute('fill', 'none');
      visualBase.setAttribute('stroke-linecap', 'round');
      visualBase.setAttribute('stroke-linejoin', 'round');
      visualBase.setAttribute('vector-effect', 'non-scaling-stroke');
      visualBase.removeAttribute('marker-start');
      visualBase.removeAttribute('marker-mid');
      visualBase.removeAttribute('marker-end');

      const outer = visualBase.cloneNode(true);
      outer.classList.add('styled-track-layer', 'styled-track-outer');
      outer.setAttribute('stroke', opts.outerColor);
      outer.setAttribute('stroke-width', (w * opts.outerFactor).toFixed(3));

      const inner = visualBase.cloneNode(true);
      inner.classList.add('styled-track-layer', 'styled-track-inner');
      inner.setAttribute('stroke', opts.innerColor);
      inner.setAttribute('stroke-width', (w * opts.innerFactor).toFixed(3));

      const geometry = makeGeometryPathFromNode(node);
      if (geometry) {
        geometry.classList.add('track-geometry-path');
        geometry.setAttribute('fill', 'none');
        geometry.setAttribute('stroke', 'none');
        geometry.setAttribute('stroke-width', '0');
        geometry.setAttribute('pointer-events', 'none');
        geometry.setAttribute('aria-hidden', 'true');
      }

      parent.insertBefore(outer, node);
      parent.insertBefore(inner, node);
      if (geometry) parent.insertBefore(geometry, node);
      parent.removeChild(node);
    });
  });

  if (opts.noWatermark) {
    svg.querySelectorAll('text').forEach(t => {
      if (/created by/i.test(t.textContent || '')) {
        t.remove();
      }
    });
  }

  if (opts.keepMapOnly) {
    cleanSvgHard(svg, opts.groupId);
  }

  if (opts.directionArrows) {
    const tempWrap = document.createElement('div');
    tempWrap.style.position = 'fixed';
    tempWrap.style.left = '-10000px';
    tempWrap.style.top = '-10000px';
    tempWrap.style.visibility = 'hidden';
    document.body.appendChild(tempWrap);

    try {
      tempWrap.appendChild(document.importNode(svg, true));
      const liveSvg = tempWrap.querySelector('svg');

      addDirectionalArrows(liveSvg, opts.groupId, {
        arrowColor: opts.arrowColor || opts.innerColor || '#ffffff',
        arrowSpacing: opts.arrowSpacing || 28,
        arrowSize: opts.arrowSize || 8
      });

      return serializeSvg(liveSvg);
    } finally {
      tempWrap.remove();
    }
  }

  return serializeSvg(svg);
}

function updatePreview() {
  if (!originalText) return;

  try {
    const outText = process(originalText, {
      outerColor: els.outerColor.value.trim(),
      innerColor: els.innerColor.value.trim(),
      outerFactor: parseFloat(els.outerFactor.value) || 3,
      innerFactor: parseFloat(els.innerFactor.value) || 0.7,
      groupId: els.groupId.value.trim() || 'trk1',
      noWatermark: els.noWatermark.checked,
      keepMapOnly: els.keepMapOnly.checked,
      directionArrows: els.directionArrows.checked,
      arrowColor: els.innerColor.value.trim() || '#ffffff',
      arrowSpacing: parseFloat(els.arrowSpacing.value) || 28,
      arrowSize: parseFloat(els.arrowSize.value) || 8
    });

    els.preview.innerHTML = outText;
    els.preview.style.transform = `scale(${zoom})`;

    if (lastUrl) URL.revokeObjectURL(lastUrl);
    const blob = new Blob([outText], { type: 'image/svg+xml' });
    lastUrl = URL.createObjectURL(blob);
    els.download.href = lastUrl;
    els.download.classList.remove('disabled');
    els.download.setAttribute('aria-disabled', 'false');

    setStatus('Preview updated.');
  } catch (err) {
    setStatus(err.message || 'Unexpected error.');
  }
}

function debounce(fn, t = 250) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), t);
  };
}

const debouncedUpdate = debounce(updatePreview, 250);

els.file.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const text = await file.text();
  originalText = text;
  updatePreview();
});

function syncColor(picker, textInput) {
  picker.addEventListener('input', () => {
    textInput.value = picker.value;
    if (els.autoPreview.checked) debouncedUpdate();
  });

  textInput.addEventListener('input', () => {
    const v = textInput.value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
      picker.value = v;
    }
    if (els.autoPreview.checked) debouncedUpdate();
  });
}

syncColor(els.outerColorPicker, els.outerColor);
syncColor(els.innerColorPicker, els.innerColor);

function bindSlider(slider, label) {
  const updateLabel = () => {
    const value = parseFloat(slider.value);
    label.textContent = Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

  slider.addEventListener('input', () => {
    updateLabel();
    if (els.autoPreview.checked) debouncedUpdate();
  });

  slider.addEventListener('change', () => {
    updateLabel();
    if (els.autoPreview.checked) debouncedUpdate();
  });

  updateLabel();
}

bindSlider(els.outerFactor, els.outerFactorVal);
bindSlider(els.innerFactor, els.innerFactorVal);
bindSlider(els.arrowSpacing, els.arrowSpacingVal);
bindSlider(els.arrowSize, els.arrowSizeVal);

['input', 'change'].forEach(evt => {
  els.groupId.addEventListener(evt, () => {
    if (els.autoPreview.checked) debouncedUpdate();
  });

  els.noWatermark.addEventListener(evt, () => {
    if (els.autoPreview.checked) debouncedUpdate();
  });

  els.keepMapOnly.addEventListener(evt, () => {
    if (els.autoPreview.checked) debouncedUpdate();
  });

  els.directionArrows.addEventListener(evt, () => {
    if (els.autoPreview.checked) debouncedUpdate();
  });
});

els.refreshBtn.addEventListener('click', updatePreview);

els.autoPreview.addEventListener('change', () => {
  setStatus(els.autoPreview.checked ? 'Auto preview ON' : 'Auto preview OFF');
});

els.zoomIn.addEventListener('click', () => {
  zoom = Math.min(4, zoom + 0.1);
  updatePreview();
});

els.zoomOut.addEventListener('click', () => {
  zoom = Math.max(0.2, zoom - 0.1);
  updatePreview();
});

els.zoomReset.addEventListener('click', () => {
  zoom = 1;
  updatePreview();
});

document.addEventListener('DOMContentLoaded', () => {
  const helpBtn = document.getElementById('helpBtn');
  const helpOverlay = document.getElementById('helpOverlay');
  const helpClose = document.getElementById('helpClose');

  if (!helpBtn || !helpOverlay || !helpClose) return;

  function openHelp() {
    helpOverlay.classList.remove('hidden');
    helpClose.focus();
  }

  function closeHelp() {
    helpOverlay.classList.add('hidden');
  }

  helpBtn.addEventListener('click', openHelp);
  helpClose.addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) closeHelp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpOverlay.classList.contains('hidden')) closeHelp();
  });
});
