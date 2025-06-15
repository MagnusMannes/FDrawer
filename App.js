const svgNS = "http://www.w3.org/2000/svg";
const canvas = document.getElementById("diagramCanvas");
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showContextMenu(e, null);
});
const parts = [];
let selectedPart = null;
let copiedColor = null;
let copiedShape = null;
let contextPart = null;
const menu = document.getElementById("contextMenu");
let zoom = 1;

const APP_VERSION = "1.0";
document.getElementById("version").textContent = APP_VERSION;
document.getElementById("lastUpdated").textContent = new Date(document.lastModified).toLocaleString();

// --- Toolbar buttons ---
document.getElementById("addBody").addEventListener("click", addBody);

const toggleConnectorBtn = document.getElementById("toggleConnector");
let connectorMode = false;
toggleConnectorBtn.addEventListener("click", () => {
  connectorMode = !connectorMode;
  toggleConnectorBtn.classList.toggle("active", connectorMode);
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.deltaY < 0) zoom = Math.min(3, zoom + 0.1);
  else zoom = Math.max(0.5, zoom - 0.1);
  updateZoom();
});

function updateZoom() {
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `scale(${zoom})`;
}

document.getElementById("colorPicker").addEventListener("input", (e) => {
  if (selectedPart) {
    selectedPart.color = e.target.value;
    selectedPart.shape.setAttribute("fill", e.target.value);
  }
});


document.getElementById("copyColor").addEventListener("click", () => {
  if (selectedPart) {
    copiedColor = selectedPart.color;
  }
});

document.getElementById("pasteColor").addEventListener("click", () => {
  if (selectedPart && copiedColor) {
    selectedPart.color = copiedColor;
    selectedPart.shape.setAttribute("fill", copiedColor);
    document.getElementById("colorPicker").value = copiedColor;
  }
});

document.getElementById("removeBody").addEventListener("click", () => {
  if (contextPart) removePart(contextPart);
  contextPart = null;
  menu.style.display = "none";
});

document.getElementById("copyColorMenu").addEventListener("click", () => {
  if (contextPart) copiedColor = contextPart.color;
  menu.style.display = "none";
});

document.getElementById("pasteColorMenu").addEventListener("click", () => {
  if (contextPart && copiedColor) {
    contextPart.color = copiedColor;
    contextPart.shape.setAttribute("fill", copiedColor);
    document.getElementById("colorPicker").value = copiedColor;
  }
  menu.style.display = "none";
});

document.getElementById("copyShapeMenu").addEventListener("click", () => {
  if (contextPart) copiedShape = exportPart(contextPart);
  menu.style.display = "none";
});

document.getElementById("pasteShapeMenu").addEventListener("click", () => {
  if (copiedShape) {
    const data = JSON.parse(JSON.stringify(copiedShape));
    data.x += 10;
    data.y += 10;
    createPartFromData(data);
  }
  menu.style.display = "none";
});

document.getElementById("setSizeMenu").addEventListener("click", () => {
  if (contextPart) {
    const wInput = prompt(
      "Enter width (e.g., 10cm, 8in, 8 1/2in):",
      ""
    );
    if (wInput) {
      const w = parseDimension(wInput, "cm");
      if (!isNaN(w)) {
        applyNewWidth(contextPart, w);
      } else {
        alert("Invalid width value");
      }
    }
    const hInput = prompt("Enter height in cm:", "");
    if (hInput) {
      const h = parseDimension(hInput, "cm");
      if (!isNaN(h)) {
        updatePartHeight(contextPart, h);
      } else {
        alert("Invalid height value");
      }
    }
  }
  menu.style.display = "none";
  contextPart = null;
});

document.getElementById("resetView").addEventListener("click", () => {
  zoom = 1;
  updateZoom();
  menu.style.display = "none";
  contextPart = null;
});

document.addEventListener("click", () => {
  menu.style.display = "none";
  contextPart = null;
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const data = {
    parts: parts.map((p) => ({
      x: parseFloat(p.rect.getAttribute("x")),
      y: parseFloat(p.rect.getAttribute("y")),
      width: p.width,
      height: p.height,
      color: p.color,
      topConnector: p.topConnector,
      bottomConnector: p.bottomConnector,
      special: p.special,
      specialForms: (p.specialForms || []).map((f) => ({
        x: parseFloat(f.rect.getAttribute("x")),
        y: parseFloat(f.rect.getAttribute("y")),
        width: parseFloat(f.rect.getAttribute("width")),
        height: parseFloat(f.rect.getAttribute("height")),
        rx: parseFloat(f.rect.getAttribute("rx")) || 0,
        side: f.side,
        symmetrical: !!f.rect2,
      })),
      symVertices: (p.symVertices || []).map((v) => ({ y: v.y, dx: v.dx })),
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "diagram.json";
  a.click();
});

document.getElementById("importBtn").addEventListener("click", () =>
  document.getElementById("fileInput").click()
);

document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      loadFromData(JSON.parse(rd.result));
    } catch (err) {
      alert("Invalid JSON");
    }
  };
  rd.readAsText(file);
});

// --- Part creation ---
function addBody() {
  const width = 60,
    height = 120;
  const x = canvas.clientWidth / 2 - width / 2;
  const y = parts.length
    ? parts[parts.length - 1].y + parts[parts.length - 1].height
    : 20;

  const g = document.createElementNS(svgNS, "g");

  const shape = document.createElementNS(svgNS, "polygon");
  shape.setAttribute(
    "points",
    `${x},${y} ${x + width},${y} ${x + width},${y + height} ${x},${y + height}`
  );
  shape.setAttribute("fill", "#cccccc");
  shape.classList.add("body-shape");
  g.appendChild(shape);

  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("fill", "none");
  rect.setAttribute("pointer-events", "none");
  g.appendChild(rect);

  const handle = document.createElementNS(svgNS, "rect");
  handle.setAttribute("width", 10);
  handle.setAttribute("height", 10);
  handle.setAttribute("x", x + width / 2 - 5);
  handle.setAttribute("y", y + height - 5);
  handle.classList.add("handle");
  g.appendChild(handle);

  const leftHandle = document.createElementNS(svgNS, "rect");
  leftHandle.setAttribute("width", 10);
  leftHandle.setAttribute("height", 10);
  leftHandle.setAttribute("x", x - 5);
  leftHandle.setAttribute("y", y + height / 2 - 5);
  leftHandle.classList.add("h-handle");
  g.appendChild(leftHandle);

  const rightHandle = document.createElementNS(svgNS, "rect");
  rightHandle.setAttribute("width", 10);
  rightHandle.setAttribute("height", 10);
  rightHandle.setAttribute("x", x + width - 5);
  rightHandle.setAttribute("y", y + height / 2 - 5);
  rightHandle.classList.add("h-handle");
  g.appendChild(rightHandle);

  const topLabel = createConnectorLabel(x + width / 2, y - 6);
  const bottomLabel = createConnectorLabel(x + width / 2, y + height + 6);
  g.appendChild(topLabel);
  g.appendChild(bottomLabel);

  canvas.appendChild(g);

  const part = {
    x,
    y,
    width,
    height,
    color: "#cccccc",
    topConnector: "none",
    bottomConnector: "none",
    special: false,
    specialForms: [],
    shape,
    symVertices: [],
    vertexHandles: [],
    g,
    rect,
    handle,
    leftHandle,
    rightHandle,
    topLabel,
    bottomLabel,
  };
  parts.push(part);
  addPartEventListeners(part);
  toggleHandles(part, false);
  selectPart(part);
}

function exportPart(part) {
  return {
    x: part.x,
    y: part.y,
    width: part.width,
    height: part.height,
    color: part.color,
    topConnector: part.topConnector,
    bottomConnector: part.bottomConnector,
    special: part.special,
    specialForms: (part.specialForms || []).map((f) => ({
      x: parseFloat(f.rect.getAttribute("x")),
      y: parseFloat(f.rect.getAttribute("y")),
      width: parseFloat(f.rect.getAttribute("width")),
      height: parseFloat(f.rect.getAttribute("height")),
      rx: parseFloat(f.rect.getAttribute("rx")) || 0,
      side: f.side,
      symmetrical: !!f.rect2,
    })),
    symVertices: (part.symVertices || []).map((v) => ({ y: v.y, dx: v.dx })),
  };
}

function createPartFromData(p) {
  const g = document.createElementNS(svgNS, "g");
  const shape = document.createElementNS(svgNS, "polygon");
  shape.setAttribute("fill", p.color);
  shape.classList.add("body-shape");
  g.appendChild(shape);

  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x", p.x);
  rect.setAttribute("y", p.y);
  rect.setAttribute("width", p.width);
  rect.setAttribute("height", p.height);
  rect.setAttribute("fill", "none");
  rect.setAttribute("pointer-events", "none");
  g.appendChild(rect);

  const handle = document.createElementNS(svgNS, "rect");
  handle.setAttribute("width", 10);
  handle.setAttribute("height", 10);
  handle.setAttribute("x", p.x + p.width / 2 - 5);
  handle.setAttribute("y", p.y + p.height - 5);
  handle.classList.add("handle");
  g.appendChild(handle);

  const leftHandle = document.createElementNS(svgNS, "rect");
  leftHandle.setAttribute("width", 10);
  leftHandle.setAttribute("height", 10);
  leftHandle.setAttribute("x", p.x - 5);
  leftHandle.setAttribute("y", p.y + p.height / 2 - 5);
  leftHandle.classList.add("h-handle");
  g.appendChild(leftHandle);

  const rightHandle = document.createElementNS(svgNS, "rect");
  rightHandle.setAttribute("width", 10);
  rightHandle.setAttribute("height", 10);
  rightHandle.setAttribute("x", p.x + p.width - 5);
  rightHandle.setAttribute("y", p.y + p.height / 2 - 5);
  rightHandle.classList.add("h-handle");
  g.appendChild(rightHandle);

  const topLabel = createConnectorLabel(p.x + p.width / 2, p.y - 6);
  topLabel.textContent = labelFor(p.topConnector);
  updateConnectorLabelClass(topLabel, p.topConnector);
  g.appendChild(topLabel);

  const bottomLabel = createConnectorLabel(p.x + p.width / 2, p.y + p.height + 6);
  bottomLabel.textContent = labelFor(p.bottomConnector);
  updateConnectorLabelClass(bottomLabel, p.bottomConnector);
  g.appendChild(bottomLabel);

  let specialIcon = null;
  if (p.special) {
    specialIcon = document.createElementNS(svgNS, "rect");
    specialIcon.setAttribute("x", p.x + p.width + 4);
    specialIcon.setAttribute("y", p.y + p.height / 2 - 7);
    specialIcon.setAttribute("width", 14);
    specialIcon.setAttribute("height", 14);
    specialIcon.classList.add("special-placeholder");
    g.appendChild(specialIcon);
  }

  const specialForms = [];
  if (p.specialForms) {
    p.specialForms.forEach((sf) => {
      const r = document.createElementNS(svgNS, "rect");
      r.setAttribute("x", sf.x);
      r.setAttribute("y", sf.y);
      r.setAttribute("width", sf.width);
      r.setAttribute("height", sf.height);
      if (sf.rx) {
        r.setAttribute("rx", sf.rx);
        r.setAttribute("ry", sf.rx);
      }
      r.classList.add("special-form");
      g.appendChild(r);
      r.addEventListener("contextmenu", specialContext);
      let r2 = null;
      if (sf.symmetrical) {
        r2 = document.createElementNS(svgNS, "rect");
        const center = p.x + p.width / 2;
        const dx = sf.side === "left" ? center - sf.x - sf.width : sf.x - center;
        r2.setAttribute("x", center + dx);
        r2.setAttribute("y", sf.y);
        r2.setAttribute("width", sf.width);
        r2.setAttribute("height", sf.height);
        if (sf.rx) {
          r2.setAttribute("rx", sf.rx);
          r2.setAttribute("ry", sf.rx);
        }
        r2.classList.add("special-form");
        g.appendChild(r2);
        r2.addEventListener("contextmenu", specialContext);
      }
      specialForms.push({ rect: r, rect2: r2, side: sf.side });
    });
  }

  const symVertices = [];
  const vertexHandles = [];
  if (p.symVertices) {
    p.symVertices.forEach((v) => {
      const vertex = { y: v.y, dx: v.dx };
      const hl = document.createElementNS(svgNS, "rect");
      hl.setAttribute("width", 8);
      hl.setAttribute("height", 8);
      hl.classList.add("vertex-handle");
      g.appendChild(hl);
      const hr = document.createElementNS(svgNS, "rect");
      hr.setAttribute("width", 8);
      hr.setAttribute("height", 8);
      hr.classList.add("vertex-handle");
      g.appendChild(hr);
      vertex.handleLeft = hl;
      vertex.handleRight = hr;
      symVertices.push(vertex);
      vertexHandles.push(hl, hr);
    });
  }

  canvas.appendChild(g);

  const partData = {
    ...p,
    g,
    shape,
    rect,
    handle,
    leftHandle,
    rightHandle,
    topLabel,
    bottomLabel,
    width: p.width,
    height: p.height,
    specialIcon,
    specialForms,
    symVertices,
    vertexHandles,
  };

  symVertices.forEach((v) => {
    v.handleLeft.addEventListener("mousedown", (evt) =>
      startVertexDrag(evt, partData, v, "left")
    );
    v.handleRight.addEventListener("mousedown", (evt) =>
      startVertexDrag(evt, partData, v, "right")
    );
  });

  parts.push(partData);
  updatePolygonShape(partData);
  updateVertexHandles(partData);
  addPartEventListeners(partData);
  toggleHandles(partData, false);
  return partData;
}

function createConnectorLabel(x, y) {
  const t = document.createElementNS(svgNS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.classList.add("connector-label");
  t.textContent = "";
  return t;
}

function addPartEventListeners(part) {
  part.shape.addEventListener("click", (e) => {
    selectPart(part);
    if (connectorMode) handleConnectorToggle(e, part);
  });
  part.shape.addEventListener("dblclick", (e) => {
    selectPart(part);
    toggleSpecialVertex(e, part);
  });
  part.g.addEventListener("contextmenu", (e) => {

    showContextMenu(e, part);
  });
  part.handle.addEventListener("mousedown", (e) => startResize(e, part));
  part.handle.addEventListener(
    "touchstart",
    (e) => startResize(e, part),
    { passive: false }
  );
  part.handle.addEventListener("dblclick", () => {
    const input = prompt("Enter height in cm:");
    if (!input) return;
    const h = parseDimension(input, "cm");
    if (isNaN(h)) {
      alert("Invalid height value");
    } else {
      updatePartHeight(part, h);
    }
  });
  part.leftHandle.addEventListener("mousedown", (e) => startHResize(e, part, "left"));
  part.leftHandle.addEventListener("touchstart", (e) => startHResize(e, part, "left"), { passive: false });
  part.leftHandle.addEventListener("dblclick", () => {
    const input = prompt("Enter width (e.g., 8 1/2, 8.5in):");
    if (!input) return;
    const w = parseDimension(input, "in");
    if (isNaN(w)) {
      alert("Invalid width value");
    } else {
      applyNewWidth(part, w);
    }
  });
  part.rightHandle.addEventListener("mousedown", (e) => startHResize(e, part, "right"));
  part.rightHandle.addEventListener("touchstart", (e) => startHResize(e, part, "right"), { passive: false });
  part.rightHandle.addEventListener("dblclick", () => {
    const input = prompt("Enter width (e.g., 8 1/2, 8.5in):");
    if (!input) return;
    const w = parseDimension(input, "in");
    if (isNaN(w)) {
      alert("Invalid width value");
    } else {
      applyNewWidth(part, w);
    }
  });
}

// --- Selection & Connector Logic ---
function selectPart(part) {
  if (selectedPart) {
    toggleHandles(selectedPart, false);
    selectedPart.rect.classList.remove("selected");
    if (selectedPart.shape) selectedPart.shape.classList.remove("selected");
  }
  selectedPart = part;
  part.rect.classList.add("selected");
  if (part.shape) part.shape.classList.add("selected");
  document.getElementById("colorPicker").value = part.color;
  toggleHandles(part, true);
}

function handleConnectorToggle(evt, part) {
  const y = evt.offsetY;
  const rectY = part.y;
  const h = part.height;
  if (y < rectY + 10) {
    part.topConnector = nextState(part.topConnector);
    part.topLabel.textContent = labelFor(part.topConnector);
    updateConnectorLabelClass(part.topLabel, part.topConnector);
  } else if (y > rectY + h - 10) {
    part.bottomConnector = nextState(part.bottomConnector);
    part.bottomLabel.textContent = labelFor(part.bottomConnector);
    updateConnectorLabelClass(part.bottomLabel, part.bottomConnector);
  }
}
function nextState(s) {
  return s === "none" ? "PIN" : s === "PIN" ? "BOX" : "none";
}

// --- Special Feature Toggling ---
function toggleSpecialVertex(e, part) {
  const offsetY = e.offsetY - part.y;
  const existingIndex = part.symVertices.findIndex((v) => Math.abs(v.y - offsetY) < 5);
  if (existingIndex !== -1) {
    const vertex = part.symVertices.splice(existingIndex, 1)[0];
    if (vertex.handleLeft) vertex.handleLeft.remove();
    if (vertex.handleRight) vertex.handleRight.remove();
    part.vertexHandles = part.vertexHandles.filter(
      (h) => h !== vertex.handleLeft && h !== vertex.handleRight
    );
  } else {
    const vertex = { y: offsetY, dx: 0 };
    part.symVertices.push(vertex);
    const hl = document.createElementNS(svgNS, "rect");
    hl.setAttribute("width", 8);
    hl.setAttribute("height", 8);
    hl.classList.add("vertex-handle");
    part.g.appendChild(hl);
    hl.addEventListener("mousedown", (evt) => startVertexDrag(evt, part, vertex, "left"));
    const hr = document.createElementNS(svgNS, "rect");
    hr.setAttribute("width", 8);
    hr.setAttribute("height", 8);
    hr.classList.add("vertex-handle");
    part.g.appendChild(hr);
    hr.addEventListener("mousedown", (evt) => startVertexDrag(evt, part, vertex, "right"));
    vertex.handleLeft = hl;
    vertex.handleRight = hr;
    part.vertexHandles.push(hl, hr);
    const fromLeft = e.offsetX - part.x < part.width / 2;
    startVertexDrag(e, part, vertex, fromLeft ? "left" : "right");
  }
  updatePolygonShape(part);
  updateVertexHandles(part);
}


function specialContext(e) {
  e.preventDefault();
  const action = prompt('Type "remove" to delete or enter roundness value');
  if (!action) return;
  if (action === "remove") {
    if (e.target.parentNode) e.target.parentNode.removeChild(e.target);
  } else {
    e.target.setAttribute("rx", action);
    e.target.setAttribute("ry", action);
  }
}
function labelFor(s) {
  return s === "none" ? "" : s;
}
function updateConnectorLabelClass(label, state) {
  if (state === "none") label.classList.remove("active");
  else label.classList.add("active");
}

// --- Resize Logic ---
let resizing = false,
  startY = 0,
  startHeight = 0,
  resizePart = null;
function startResize(e, part) {
  e.preventDefault();
  resizing = true;
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startHeight = part.height;
  resizePart = part;
  window.addEventListener("mousemove", doResize);
  window.addEventListener("touchmove", doResize, { passive: false });
  window.addEventListener("mouseup", stopResize);
  window.addEventListener("touchend", stopResize);
}
function doResize(e) {
  if (!resizing) return;
  const currentY = e.touches ? e.touches[0].clientY : e.clientY;
  const delta = currentY - startY;
  const newH = Math.max(30, startHeight + delta);
  resizePart.height = newH;
  resizePart.rect.setAttribute("height", newH);
  resizePart.handle.setAttribute("y", resizePart.y + newH - 5);
  resizePart.leftHandle.setAttribute("y", resizePart.y + newH / 2 - 5);
  resizePart.rightHandle.setAttribute("y", resizePart.y + newH / 2 - 5);
  resizePart.bottomLabel.setAttribute("y", resizePart.y + newH + 6);

  const scale = newH / startHeight;
  if (resizePart.symVertices) {
    resizePart.symVertices.forEach((v) => {
      v.y *= scale;
    });
  }
  updatePolygonShape(resizePart);
  updateVertexHandles(resizePart);

  const idx = parts.indexOf(resizePart);
  let baseY = resizePart.y + newH;
  for (let i = idx + 1; i < parts.length; i++) {
    parts[i].y = baseY;
    parts[i].rect.setAttribute("y", baseY);
    parts[i].handle.setAttribute("y", baseY + parts[i].height - 5);
    parts[i].leftHandle.setAttribute("y", baseY + parts[i].height / 2 - 5);
    parts[i].rightHandle.setAttribute("y", baseY + parts[i].height / 2 - 5);
    parts[i].topLabel.setAttribute("y", baseY - 6);
    parts[i].bottomLabel.setAttribute("y", baseY + parts[i].height + 6);
    if (parts[i].specialIcon) {
      parts[i].specialIcon.setAttribute("y", baseY + parts[i].height / 2 - 7);
    }
    baseY += parts[i].height;
  }
}
function stopResize() {
  resizing = false;
  window.removeEventListener("mousemove", doResize);
  window.removeEventListener("touchmove", doResize);
  window.removeEventListener("mouseup", stopResize);
  window.removeEventListener("touchend", stopResize);
}

// --- Horizontal Resize Logic ---
let hResizing = false,
  startX = 0,
  startWidth = 0,
  hResizePart = null,
  hDir = "left",
  centerX = 0;
function startHResize(e, part, dir) {
  e.preventDefault();
  hResizing = true;
  startX = e.touches ? e.touches[0].clientX : e.clientX;
  startWidth = part.width;
  hResizePart = part;
  hDir = dir;
  centerX = part.x + part.width / 2;
  window.addEventListener("mousemove", doHResize);
  window.addEventListener("touchmove", doHResize, { passive: false });
  window.addEventListener("mouseup", stopHResize);
  window.addEventListener("touchend", stopHResize);
}
function doHResize(e) {
  if (!hResizing) return;
  const currentX = e.touches ? e.touches[0].clientX : e.clientX;
  const delta = hDir === "left" ? startX - currentX : currentX - startX;
  const newW = Math.max(30, startWidth + delta * 2);
  hResizePart.width = newW;
  hResizePart.x = centerX - newW / 2;
  updatePartWidth(hResizePart);
}
function stopHResize() {
  hResizing = false;
  window.removeEventListener("mousemove", doHResize);
  window.removeEventListener("touchmove", doHResize);
  window.removeEventListener("mouseup", stopHResize);
  window.removeEventListener("touchend", stopHResize);
}

function updatePartWidth(part) {
  part.rect.setAttribute("x", part.x);
  part.rect.setAttribute("width", part.width);
  part.handle.setAttribute("x", part.x + part.width / 2 - 5);
  part.leftHandle.setAttribute("x", part.x - 5);
  part.leftHandle.setAttribute("y", part.y + part.height / 2 - 5);
  part.rightHandle.setAttribute("x", part.x + part.width - 5);
  part.rightHandle.setAttribute("y", part.y + part.height / 2 - 5);
  part.topLabel.setAttribute("x", part.x + part.width / 2);
  part.bottomLabel.setAttribute("x", part.x + part.width / 2);
  if (part.specialIcon) {
    part.specialIcon.setAttribute("x", part.x + part.width + 4);
  }
  updatePolygonShape(part);
  updateVertexHandles(part);
}

// -- Dimension Helpers --
const PX_PER_INCH = 96;
const PX_PER_CM = PX_PER_INCH / 2.54;

function parseFractionalInches(str) {
  str = str.trim();
  let m = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]);
  m = str.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1]) / parseInt(m[2]);
  return parseFloat(str);
}

function parseDimension(input, defUnit) {
  if (!input) return NaN;
  let s = input.trim().toLowerCase();
  let unit = defUnit;
  if (s.endsWith('cm')) {
    unit = 'cm';
    s = s.slice(0, -2).trim();
  } else if (s.endsWith('inch')) {
    unit = 'in';
    s = s.slice(0, -4).trim();
  } else if (s.endsWith('in')) {
    unit = 'in';
    s = s.slice(0, -2).trim();
  }
  let val = unit === 'in' ? parseFractionalInches(s) : parseFloat(s);
  if (isNaN(val)) return NaN;
  return unit === 'in' ? val * PX_PER_INCH : val * PX_PER_CM;
}

function applyNewWidth(part, newW) {
  const center = part.x + part.width / 2;
  part.width = newW;
  part.x = center - newW / 2;
  updatePartWidth(part);
}

function updatePartHeight(part, newH) {
  const scale = newH / part.height;
  part.height = newH;
  part.rect.setAttribute('height', newH);
  part.handle.setAttribute('y', part.y + newH - 5);
  part.leftHandle.setAttribute('y', part.y + newH / 2 - 5);
  part.rightHandle.setAttribute('y', part.y + newH / 2 - 5);
  part.bottomLabel.setAttribute('y', part.y + newH + 6);
  if (part.symVertices) {
    part.symVertices.forEach(v => {
      v.y *= scale;
    });
  }
  updatePolygonShape(part);
  updateVertexHandles(part);
  const idx = parts.indexOf(part);
  let baseY = part.y + newH;
  for (let i = idx + 1; i < parts.length; i++) {
    parts[i].y = baseY;
    parts[i].rect.setAttribute('y', baseY);
    parts[i].handle.setAttribute('y', baseY + parts[i].height - 5);
    parts[i].leftHandle.setAttribute('y', baseY + parts[i].height / 2 - 5);
    parts[i].rightHandle.setAttribute('y', baseY + parts[i].height / 2 - 5);
    parts[i].topLabel.setAttribute('y', baseY - 6);
    parts[i].bottomLabel.setAttribute('y', baseY + parts[i].height + 6);
    if (parts[i].specialIcon) {
      parts[i].specialIcon.setAttribute('y', baseY + parts[i].height / 2 - 7);
    }
    baseY += parts[i].height;
  }
}

// --- Polygon Shape Helpers ---
function updatePolygonShape(part) {
  const x = part.x;
  const y = part.y;
  const w = part.width;
  const h = part.height;
  const verts = (part.symVertices || []).slice().sort((a, b) => a.y - b.y);
  const pts = [];
  pts.push(`${x},${y}`);
  pts.push(`${x + w},${y}`);
  verts.forEach((v) => {
    pts.push(`${x + w + v.dx},${y + v.y}`);
  });
  pts.push(`${x + w},${y + h}`);
  pts.push(`${x},${y + h}`);
  for (let i = verts.length - 1; i >= 0; i--) {
    const v = verts[i];
    pts.push(`${x - v.dx},${y + v.y}`);
  }
  part.shape.setAttribute("points", pts.join(" "));
}

function updateVertexHandles(part) {
  if (!part.symVertices) return;
  part.symVertices.forEach((v) => {
    v.handleLeft.setAttribute("x", part.x - v.dx - 4);
    v.handleLeft.setAttribute("y", part.y + v.y - 4);
    v.handleRight.setAttribute("x", part.x + part.width + v.dx - 4);
    v.handleRight.setAttribute("y", part.y + v.y - 4);
  });
}

function toggleHandles(part, show) {
  const display = show ? "block" : "none";
  part.handle.style.display = display;
  part.leftHandle.style.display = display;
  part.rightHandle.style.display = display;
  if (part.vertexHandles) {
    part.vertexHandles.forEach((h) => (h.style.display = display));
  }
}

let vertexDrag = null;
function startVertexDrag(e, part, vertex, side) {
  e.preventDefault();
  vertexDrag = { part, vertex, side, startX: e.clientX, startDx: vertex.dx };
  window.addEventListener("mousemove", doVertexDrag);
  window.addEventListener("mouseup", stopVertexDrag);
}

function doVertexDrag(e) {
  if (!vertexDrag) return;
  const currentX = e.clientX;
  const { part, vertex, side, startX, startDx } = vertexDrag;
  const delta = side === "left" ? startX - currentX : currentX - startX;
  vertex.dx = Math.max(0, startDx + delta);
  updatePolygonShape(part);
  updateVertexHandles(part);
}

function stopVertexDrag() {
  window.removeEventListener("mousemove", doVertexDrag);
  window.removeEventListener("mouseup", stopVertexDrag);
  vertexDrag = null;
}

function removePart(part) {
  const idx = parts.indexOf(part);
  if (idx === -1) return;
  canvas.removeChild(part.g);
  parts.splice(idx, 1);
  if (selectedPart === part) selectedPart = null;
  let baseY = idx > 0 ? parts[idx - 1].y + parts[idx - 1].height : 20;
  for (let i = idx; i < parts.length; i++) {
    parts[i].y = baseY;
    parts[i].rect.setAttribute("y", baseY);
    parts[i].handle.setAttribute("y", baseY + parts[i].height - 5);
    parts[i].leftHandle.setAttribute("y", baseY + parts[i].height / 2 - 5);
    parts[i].rightHandle.setAttribute("y", baseY + parts[i].height / 2 - 5);
    parts[i].topLabel.setAttribute("y", baseY - 6);
    parts[i].bottomLabel.setAttribute("y", baseY + parts[i].height + 6);
    if (parts[i].specialIcon) {
      parts[i].specialIcon.setAttribute(
        "y",
        baseY + parts[i].height / 2 - 7
      );
    }
    baseY += parts[i].height;
  }
}

function showContextMenu(e, part) {
  e.preventDefault();
  contextPart = part;
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  menu.style.display = "block";
}

// --- Import Logic ---
function clearCanvas() {
  while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
  parts.length = 0;
  selectedPart = null;
}
function loadFromData(data) {
  clearCanvas();
  if (!data.parts) return;
  data.parts.forEach((p) => {
    createPartFromData(p);
  });
}
