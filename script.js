let originalText = null;
let lastUrl = null;
let zoom = 1;

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function cleanSvgHard(svg, groupId) {
  const allowedGroups = Array.from(svg.querySelectorAll(`g[id='${groupId}']`));
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

function parsePolylinePoints(pointsText) {
  if (!pointsText) return [];

  const nums = (pointsText.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
  const pts = [];

  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push({ x, y });
    }
  }

  return pts;
}

function segLen(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += segLen(points[i - 1], points[i]);
  }
  return len;
}

function pointAtDistance(points, target) {
  if (!points.length) return null;
  if (target <= 0) return { ...points[0] };

  let acc = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const s = segLen(a, b);
    if (s <= 1e-9) continue;

    if (acc + s >= target) {
      const t = (target - acc) / s;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      };
    }

    acc += s;
  }

  return { ...points[points.length - 1] };
}

function tangentAtDistance(points, d, delta) {
  const p0 = pointAtDistance(points, Math.max(0, d - delta));
  const p1 = pointAtDistance(points, Math.min(polylineLength(points), d + delta));

  if (!p0 || !p1) return null;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);

  if (len < 1e-9) return null;

  return {
    x: dx / len,
    y: dy / len
  };
}

function makeChevronPoints(center, tangent, size) {
  const tx = tangent.x;
  const ty = tangent.y;

  const nx = -ty;
  const ny = tx;

  const back = size * 0.9;
  const half = size * 0.55;
  const tipForward = size * 0.55;

  const left = {
    x: center.x - tx * back - nx * half,
    y: center.y - ty * back - ny * half
  };

  const tip = {
    x: center.x + tx * tipForward,
    y: center.y + ty * tipForward
  };

  const right = {
    x: center.x - tx * back + nx * half,
    y: center.y - ty * back + ny * half
  };

  return `${left.x.toFixed(2)},${left.y.toFixed(2)} ${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${right.x.toFixed(2)},${right.y.toFixed(2)}`;
}

function addDirectionalArrows(svg, groupId, opts) {
  const groups = svg.querySelectorAll(`g[id='${groupId}']`);

  groups.forEach(g => {
    g.querySelectorAll('.direction-arrows').forEach(n => n.remove());

    const originalPolylines = Array.from(g.querySelectorAll(`polyline[id^='${groupId}:']`)).filter(node => {
      return (
        !node.classList.contains('styled-track-outer') &&
        !node.classList.contains('styled-track-inner')
      );
    });

    if (!originalPolylines.length) return;

    const arrowsLayer = createSvgEl(svg.ownerDocument, 'g');
    arrowsLayer.setAttribute('class', 'direction-arrows');
    arrowsLayer.setAttribute('pointer-events', 'none');

    originalPolylines.forEach(node => {
      const pts = parsePolylinePoints(node.getAttribute('points'));
      if (pts.length < 2) return;

      const total = polylineLength(pts);
      if (!Number.isFinite(total) || total <= opts.arrowSpacing * 1.5) return;

      const margin = Math.max(opts.arrowSpacing, opts.arrowSize * 2.0);
      const tangentDelta = Math.max(2, opts.arrowSize * 0.6);

      for (let d = margin; d < total - margin; d += opts.arrowSpacing) {
        const center = pointAtDistance(pts, d);
        const tangent = tangentAtDistance(pts, d, tangentDelta);

        if (!center || !tangent) continue;

        const chev = createSvgEl(svg.ownerDocument, 'polyline');
        chev.setAttribute('class', 'direction-arrow');
        chev.setAttribute('points', makeChevronPoints(center, tangent, opts.arrowSize));
        chev.setAttribute('fill', 'none');
        chev.setAttribute('stroke', opts.arrowColor);
        chev.setAttribute('stroke-width', String(Math.max(1.2, opts.arrowSize * 0.22)));
        chev.setAttribute('stroke-linecap', 'round');
        chev.setAttribute('stroke-linejoin', 'round');
        chev.setAttribute('vector-effect', 'non-scaling-stroke');

        arrowsLayer.appendChild(chev);
      }
    });

    if (arrowsLayer.childNodes.length) {
      g.appendChild(arrowsLayer);
    }
  });
}

function styleTrack(svg, groupId, opts) {
  const groups = svg.querySelectorAll(`g[id='${groupId}']`);

  groups.forEach(g => {
    g.querySelectorAll('.styled-track-outer, .styled-track-inner').forEach(n => n.remove());

    const originalPolylines = Array.from(g.querySelectorAll(`polyline[id^='${groupId}:']`)).filter(node => {
      return (
        !node.classList.contains('styled-track-outer') &&
        !node.classList.contains('styled-track-inner') &&
        !node.classList.contains('direction-arrow') &&
        !node.closest('.direction-arrows')
      );
    });

    originalPolylines.forEach(node => {
      const parent = node.parentNode;
      const w = parseFloat(node.getAttribute('stroke-width')) || 3.0;

      const outer = node.cloneNode(true);
      outer.classList.add('styled-track-outer');
      outer.setAttribute('fill', 'none');
      outer.setAttribute('stroke', opts.outerColor);
      outer.setAttribute('stroke-width', (w * opts.outerFactor).toFixed(3));
      outer.setAttribute('stroke-linecap', 'round');
      outer.setAttribute('stroke-linejoin', 'round');
      outer.setAttribute('vector-effect', 'non-scaling-stroke');

      const inner = node.cloneNode(true);
      inner.classList.add('styled-track-inner');
      inner.setAttribute('fill', 'none');
      inner.setAttribute('stroke', opts.innerColor);
      inner.setAttribute('stroke-width', (w * opts.innerFactor).toFixed(3));
      inner.setAttribute('stroke-linecap', 'round');
      inner.setAttribute('stroke-linejoin', 'round');
      inner.setAttribute('vector-effect', 'non-scaling-stroke');

      parent.insertBefore(outer, node);
      parent.insertBefore(inner, node);
      parent.removeChild(node);
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

  const groups = svg.querySelectorAll(`g[id='${opts.groupId}']`);
  if (!groups.length) {
    throw new Error(`Group with id '${opts.groupId}' not found.`);
  }

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
    addDirectionalArrows(svg, opts.groupId, {
      arrowColor: opts.innerColor,
      arrowSpacing: parseFloat(opts.arrowSpacing) || 28,
      arrowSize: parseFloat(opts.arrowSize) || 8
    });
  } else {
    svg.querySelectorAll('.direction-arrows').forEach(n => n.remove());
  }

  styleTrack(svg, opts.groupId, opts);

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
