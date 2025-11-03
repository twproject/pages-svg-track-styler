// Processing logic
document.getElementById('processBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('inputSvg');
  const outerColor = document.getElementById('outerColor').value.trim();
  const innerColor = document.getElementById('innerColor').value.trim();
  const outerFactor = parseFloat(document.getElementById('outerFactor').value) || 3;
  const innerFactor = parseFloat(document.getElementById('innerFactor').value) || 0.7;
  const groupId = document.getElementById('groupId').value.trim() || 'trk1';
  const removeWatermark = document.getElementById('noWatermark').checked;

  if (!fileInput.files.length) {
    alert('Please select an SVG file first.');
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'image/svg+xml');

  const groups = xml.querySelectorAll(`g[id^='${groupId}']`);
  if (!groups.length) {
    alert(`Group with id '${groupId}' not found.`);
    return;
  }

  groups.forEach(g => {
    const paths = g.querySelectorAll('polyline, path');
    paths.forEach(node => {
      const parent = node.parentNode;
      const w = parseFloat(node.getAttribute('stroke-width')) || 3.0;

      const outer = node.cloneNode(true);
      outer.setAttribute('stroke', outerColor);
      outer.setAttribute('stroke-width', (w * outerFactor).toFixed(3));
      outer.setAttribute('fill', 'none');
      outer.setAttribute('stroke-linecap', 'round');
      outer.setAttribute('stroke-linejoin', 'round');

      const inner = node.cloneNode(true);
      inner.setAttribute('stroke', innerColor);
      inner.setAttribute('stroke-width', (w * innerFactor).toFixed(3));
      inner.setAttribute('fill', 'none');
      inner.setAttribute('stroke-linecap', 'round');
      inner.setAttribute('stroke-linejoin', 'round');

      parent.insertBefore(outer, node);
      parent.insertBefore(inner, node);
      parent.removeChild(node);
    });
  });

  if (removeWatermark) {
    xml.querySelectorAll('text').forEach(t => {
      if (/created by/i.test(t.textContent)) t.remove();
    });
  }

  const serializer = new XMLSerializer();
  const out = serializer.serializeToString(xml);
  const blob = new Blob([out], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.getElementById('downloadLink');
  link.href = url;
  link.download = file.name.replace(/\.svg$/i, '-styled.svg');

  document.getElementById('result').classList.remove('hidden');
});

// Help modal logic
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

  // Close when clicking outside the modal content
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  // Close with Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpOverlay.classList.contains('hidden')) {
      closeHelp();
    }
  });
});

