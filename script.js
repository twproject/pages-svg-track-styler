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

function removeExtraSvgContent(svg) {
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
  if (symbol) {
    const existing = symbol.querySelector('polyline');
    if (existing) existing.setAttribute('stroke', color);
    return symbol;
  }

  symbol = createSvgEl(svg.ownerDocument, 'symbol');
  symbol.setAttribute('id', 'dirArrowSymbol');
  symbol.setAttribute('viewBox', '-7 -5 14 10');

  const chevron = createSvgEl(svg.ownerDocument, 'polyline');
  chevron.setAttribute('points', '-6,4 0,-3 6,4');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', color);
  chevron.setAttribute('stroke-width', '2');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');

  symbol.appendChild(chevron);
  defs.appendChild(symbol);

  return symbol;
}

function addDirectionalArrows(svg, groupId, opts) {
  ensureArrowSymbol(svg, opts.arrowColor);

  const groups = svg.querySelectorAll(`g[id^='${groupId}']`);

  groups.forEach(g => {
    g.querySelectorAll('.direction-arrows').forEach(node => node.remove());

    const nodes = g.querySelectorAll('polyline, path');

    nodes.forEach(node => {
      if (typeof node.getTotalLength !== 'function' || typeof node.getPointAtLength !== 'function') {
        return;
      }

      let total;
      try {
        total = node.getTotalLength();
      } catch (err) {
        return;
      }

      if (!isFinite(total) || total <= opts.arrowSpacing) {
        return;
      }

      const arrowsLayer = createSvgEl(svg.ownerDocument, 'g');
      arrowsLayer.setAttribute('class', 'direction-arrows');

      const margin = Math.max(opts.arrowSpacing * 0.8, opts.arrowSize * 1.5);

      for (let d = margin; d < total - margin; d += opts.arrowSpacing) {
        let p, pPrev, pNext;
        try {
          p = node.getPointAtLength(d);
          pPrev = node.getPointAtLength(Math.max(0, d - 0.75));
          pNext = node.getPointAtLength(Math.min(total, d + 0.75));
        } catch (err) {
          continue;
        }

        const angle = Math.atan2(pNext.y - pPrev.y, pNext.x - pPrev.x) * 180 / Math.PI;

        const use = createSvgEl(svg.ownerDocument, 'use');
        use.setAttribute('href', '#dirArrowSymbol');
        use.setAttributeNS(XLINK_NS, 'xlink:href', '#dirArrowSymbol');
        use.setAttribute(
          'transform',
          `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${(opts.arrowSize / 12).toFixed(3)})`
        );

        arrowsLayer.appendChild(use);
      }

      g.appendChild(arrowsLayer);
    });
  });
}

function process(text, opts) {
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-100000px';
  temp.style.top = '-100000px';
  temp.style.visibility = 'hidden';
  temp.innerHTML = text;
  document.body.appendChild(temp);

  try {
    const svg = temp.querySelector('svg');
    if (!svg) throw new Error('Invalid SVG file.');

    const groups = svg.querySelectorAll(`g[id^='${opts.groupId}']`);
    if (!groups.length) throw new Error(`Group with id '${opts.groupId}' not found.`);

    groups.forEach(g => {
      const paths = g.querySelectorAll('polyline, path');

      paths.forEach(node => {
        if (node.classList && node.classList.contains('styled-track-layer')) return;
        if (node.closest('.direction-arrows')) return;

        const parent = node.parentNode;
        const w = parseFloat(node.getAttribute('stroke-width')) || 3.0;

        const outer = node.cloneNode(true);
        outer.setAttribute('stroke', opts.outerColor);
        outer.setAttribute('stroke-width', (w * opts.outerFactor).toFixed(3));
        outer.setAttribute('fill', 'none');
        outer.setAttribute('stroke-linecap', 'round');
        outer.setAttribute('stroke-linejoin', 'round');
        outer.setAttribute('vector-effect', 'non-scaling-stroke');
        outer.classList.add('styled-track-layer', 'styled-track-outer');

        const inner = node.cloneNode(true);
        inner.setAttribute('stroke', opts.innerColor);
        inner.setAttribute('stroke-width', (w * opts.innerFactor).toFixed(3));
        inner.setAttribute('fill', 'none');
        inner.setAttribute('stroke-linecap', 'round');
        inner.setAttribute('stroke-linejoin', 'round');
        inner.setAttribute('vector-effect', 'non-scaling-stroke');
        inner.classList.add('styled-track-layer', 'styled-track-inner');

        parent.insertBefore(outer, node);
        parent.insertBefore(inner, node);
        parent.removeChild(node);
      });
    });

    if (opts.noWatermark) {
      svg.querySelectorAll('text').forEach(t => {
        if (/created by/i.test(t.textContent)) t.remove();
      });
    }

    if (opts.keepMapOnly) {
      removeExtraSvgContent(svg);
    }

    if (opts.directionArrows) {
      addDirectionalArrows(svg, opts.groupId, {
        arrowColor: opts.arrowColor || opts.innerColor || '#ffffff',
        arrowSpacing: opts.arrowSpacing || 28,
        arrowSize: opts.arrowSize || 8
      });
    } else {
      svg.querySelectorAll('.direction-arrows').forEach(node => node.remove());
    }

    return serializeSvg(svg);
  } finally {
    temp.remove();
  }
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
