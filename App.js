const svgNS = "http://www.w3.org/2000/svg";
const canvas = document.getElementById("diagramCanvas");
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showContextMenu(e);
});
const drawLayer = document.createElementNS(svgNS, "g");
canvas.appendChild(drawLayer);
const axisLayer = document.createElementNS(svgNS, "g");
canvas.appendChild(axisLayer);
const uiLayer = document.createElementNS(svgNS, "g");
canvas.appendChild(uiLayer);
const parts = [];
const drawnShapes = [];
let tempShape = null;
let selectedPart = null;
let selectedShape = null;
let copiedColor = null;
let copiedShape = null;
let contextPart = null;
let contextShape = null;
const menu = document.getElementById("contextMenu");
const canvasArea = document.getElementById("canvas_area");
let zoom = 1;
const undoStack = [];

let drawMode = null;
let lineStart = null;
let curvePoints = [];
let circleCenter = null;
let snapEnabled = false;
let snapIndicator = null;
let shapeStrokeWidth = 2;

let CONNECTOR_TEMPLATE = null;
function loadConnectorTemplate() {
  return fetch('threads.json')
    .then((r) => r.json())
    .then((data) => {
      const part = data.parts[data.parts.length - 1];
      const lines = (data.drawnShapes || [])
        .filter((s) => s.type === 'line')
        .map((s) => ({
          relX1: s.relX1,
          relY1: s.relY1,
          relX2: s.relX2,
          relY2: s.relY2,
        }));
      CONNECTOR_TEMPLATE = { width: part.width, height: part.height, lines };
    })
    .catch((err) => console.error('Failed to load threads.json', err));
}
loadConnectorTemplate();

snapIndicator = document.createElementNS(svgNS, 'circle');
snapIndicator.setAttribute('r', 4);
snapIndicator.setAttribute('fill', 'none');
snapIndicator.setAttribute('stroke', 'red');
snapIndicator.style.display = 'none';
snapIndicator.classList.add('snap-indicator');
uiLayer.appendChild(snapIndicator);

const APP_VERSION = "1.0";
document.getElementById("version").textContent = APP_VERSION;
document.getElementById("lastUpdated").textContent = new Date(document.lastModified).toLocaleString();

function updateCanvasSize() {
  const bottom = parts.reduce((m, p) => Math.max(m, p.y + p.height), 0);
  const right = parts.reduce((m, p) => Math.max(m, p.x + p.width), 0);
  const newH = Math.max(canvasArea.clientHeight, bottom + 40);
  const newW = Math.max(canvasArea.clientWidth, right + 40);
  canvas.style.height = `${newH}px`;
  canvas.style.width = `${newW}px`;
  canvas.setAttribute('height', newH);
  canvas.setAttribute('width', newW);
  centerDiagram();
  updateAxes();
}

function centerDiagram() {
  if (!parts.length) return;
  const axisOffset = 20; // account for left axis in centering
  const left = Math.min(...parts.map((p) => p.x));
  const right = Math.max(...parts.map((p) => p.x + p.width));
  const cx = (left - axisOffset + right) / 2;
  const desiredLeft = cx * zoom - canvasArea.clientWidth / 2;
  canvasArea.scrollLeft = Math.max(0, desiredLeft);
  const margin = desiredLeft < 0 ? -desiredLeft : 0;
  canvas.style.marginLeft = `${margin}px`;
  // vertical centering removed
}

// --- Toolbar buttons ---
document.getElementById("addBody").addEventListener("click", addBody);

const toggleConnectorBtn = document.getElementById("toggleConnector");
let connectorMode = false;
toggleConnectorBtn.addEventListener("click", () => {
  connectorMode = !connectorMode;
  toggleConnectorBtn.classList.toggle("active", connectorMode);
});

function setDrawMode(mode) {
  drawMode = mode;
  lineStart = null;
  curvePoints = [];
  circleCenter = null;
  if (tempShape) {
    tempShape.remove();
    tempShape = null;
  }
  if (mode) clearSelectedShape();
  document.querySelectorAll('.draw-tool').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

const drawLineBtn = document.getElementById('drawLine');
const drawCircleBtn = document.getElementById('drawCircle');
document.getElementById('drawCurve').addEventListener('click', () => setDrawMode('curve'));
drawLineBtn.addEventListener('click', () => setDrawMode('line'));
drawCircleBtn.addEventListener('click', () => setDrawMode('circle'));
drawLineBtn.addEventListener('dblclick', () => {
  const val = parseFloat(prompt('Enter line width (px):', shapeStrokeWidth));
  if (!isNaN(val) && val > 0) shapeStrokeWidth = val;
});
drawCircleBtn.addEventListener('dblclick', () => {
  const val = parseFloat(prompt('Enter line width (px):', shapeStrokeWidth));
  if (!isNaN(val) && val > 0) shapeStrokeWidth = val;
});
document.getElementById('zoomIn').addEventListener('click', () => {
  zoom = Math.min(3, zoom + 0.1);
  updateZoom();
});
document.getElementById('zoomOut').addEventListener('click', () => {
  zoom = Math.max(0.01, zoom - 0.1);
  updateZoom();
});

const snapBtn = document.getElementById('toggleSnap');
snapBtn.addEventListener('click', () => {
  snapEnabled = !snapEnabled;
  snapBtn.classList.toggle('active', snapEnabled);
  snapIndicator.style.display = 'none';
});

function handleCanvasClick(e) {
  if (!drawMode) return;
  e.stopPropagation();
  let { x, y } = getSnappedPosition(e.offsetX, e.offsetY, false);
  if (drawMode === 'line') {
    if (!lineStart) {
      lineStart = { x, y };
      tempShape = document.createElementNS(svgNS, 'line');
      tempShape.setAttribute('x1', x);
      tempShape.setAttribute('y1', y);
      tempShape.setAttribute('x2', x);
      tempShape.setAttribute('y2', y);
      tempShape.setAttribute('stroke-width', shapeStrokeWidth);
      tempShape.classList.add('drawn-shape', 'preview-shape');
      drawLayer.appendChild(tempShape);
    } else {
      tempShape.setAttribute('x2', x);
      tempShape.setAttribute('y2', y);
      tempShape.classList.remove('preview-shape');
      const obj = { type: 'line', x1: lineStart.x, y1: lineStart.y, x2: x, y2: y, width: shapeStrokeWidth, elem: tempShape };
      drawnShapes.push(obj);
      addShapeEventListeners(obj);
      saveState();
      tempShape = null;
      setDrawMode(null);
    }
  } else if (drawMode === 'curve') {
    curvePoints.push({ x, y });
    if (curvePoints.length === 1) {
      tempShape = document.createElementNS(svgNS, 'path');
      tempShape.classList.add('drawn-shape', 'preview-shape');
      drawLayer.appendChild(tempShape);
    } else if (curvePoints.length === 3) {
      const d = `M ${curvePoints[0].x} ${curvePoints[0].y} Q ${curvePoints[1].x} ${curvePoints[1].y} ${curvePoints[2].x} ${curvePoints[2].y}`;
      tempShape.setAttribute('d', d);
      tempShape.classList.remove('preview-shape');
      const obj = {
        type: 'curve',
        p0: curvePoints[0],
        p1: curvePoints[1],
        p2: curvePoints[2],
        width: shapeStrokeWidth,
        elem: tempShape,
      };
      tempShape.setAttribute('stroke-width', shapeStrokeWidth);
      drawnShapes.push(obj);
      addShapeEventListeners(obj);
      saveState();
      tempShape = null;
      setDrawMode(null);
    }
  } else if (drawMode === 'circle') {
    if (!circleCenter) {
      circleCenter = { x, y };
      tempShape = document.createElementNS(svgNS, 'circle');
      tempShape.setAttribute('cx', x);
      tempShape.setAttribute('cy', y);
      tempShape.setAttribute('r', 0);
      tempShape.setAttribute('stroke-width', shapeStrokeWidth);
      tempShape.classList.add('drawn-shape', 'preview-shape');
      drawLayer.appendChild(tempShape);
    } else {
      const dx = x - circleCenter.x;
      const dy = y - circleCenter.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      tempShape.setAttribute('r', r);
      tempShape.classList.remove('preview-shape');
      const obj = { type: 'circle', cx: circleCenter.x, cy: circleCenter.y, r, width: shapeStrokeWidth, elem: tempShape };
      drawnShapes.push(obj);
      addShapeEventListeners(obj);
      saveState();
      tempShape = null;
      setDrawMode(null);
    }
  }
}

canvas.addEventListener('click', handleCanvasClick, true);
canvas.addEventListener('mousemove', handleMouseMove, true);
canvas.addEventListener('mousedown', (e) => {
  if (!drawMode && !e.target.closest('.drawn-shape')) {
    clearSelectedShape();
  }
});

function handleMouseMove(e) {
  const { x, y } = getSnappedPosition(e.offsetX, e.offsetY);
  if (!drawMode || !tempShape) return;
  if (drawMode === 'line') {
    tempShape.setAttribute('x2', x);
    tempShape.setAttribute('y2', y);
  } else if (drawMode === 'circle') {
    const dx = x - circleCenter.x;
    const dy = y - circleCenter.y;
    tempShape.setAttribute('r', Math.sqrt(dx * dx + dy * dy));
  } else if (drawMode === 'curve') {
    if (curvePoints.length === 1) {
      const d = `M ${curvePoints[0].x} ${curvePoints[0].y} L ${x} ${y}`;
      tempShape.setAttribute('d', d);
    } else if (curvePoints.length === 2) {
      const d = `M ${curvePoints[0].x} ${curvePoints[0].y} Q ${curvePoints[1].x} ${curvePoints[1].y} ${x} ${y}`;
      tempShape.setAttribute('d', d);
    }
  }
}

window.addEventListener("resize", centerDiagram);

function updateZoom() {
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `scale(${zoom})`;
  centerDiagram();
  // ensure centering after transform is applied
  requestAnimationFrame(centerDiagram);
}

function getSnappedPosition(x, y, showIndicator = true) {
  if (!snapEnabled) {
    if (showIndicator) snapIndicator.style.display = 'none';
    return { x, y };
  }
  let closest = null;
  let minDist = 8;
  parts.forEach((p) => {
    const pts = [
      [p.x, p.y],
      [p.x + p.width / 2, p.y],
      [p.x + p.width, p.y],
      [p.x, p.y + p.height / 2],
      [p.x + p.width, p.y + p.height / 2],
      [p.x, p.y + p.height],
      [p.x + p.width / 2, p.y + p.height],
      [p.x + p.width, p.y + p.height],
    ];
    pts.forEach(([px, py]) => {
      const dx = px - x;
      const dy = py - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = { x: px, y: py };
      }
    });
  });
  if (closest) {
    if (showIndicator) {
      snapIndicator.style.display = 'block';
      snapIndicator.setAttribute('cx', closest.x);
      snapIndicator.setAttribute('cy', closest.y);
    }
    return closest;
  }
  if (showIndicator) snapIndicator.style.display = 'none';
  return { x, y };
}

function saveState() {
  const state = JSON.stringify({
    parts: parts.map((p) => exportPart(p)),
    drawnShapes: drawnShapes.map(stripShape),
  });
  undoStack.push(state);
  if (undoStack.length > 15) undoStack.shift();
}

function undo() {
  if (!undoStack.length) return;
  const state = undoStack.pop();
  loadFromData(JSON.parse(state));
}

document.getElementById("colorPicker").addEventListener("input", (e) => {
  if (selectedPart) {
    saveState();
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
    saveState();
    selectedPart.color = copiedColor;
    selectedPart.shape.setAttribute("fill", copiedColor);
    document.getElementById("colorPicker").value = copiedColor;
  }
});

document.getElementById("removeBody").addEventListener("click", () => {
  if (contextPart) removePart(contextPart);
  contextPart = null;
  contextShape = null;
  menu.style.display = "none";
});

document.getElementById("undoAction").addEventListener("click", () => {
  undo();
  menu.style.display = "none";
  contextPart = null;
  contextShape = null;
});

document.getElementById("copyColorMenu").addEventListener("click", () => {
  if (contextPart) copiedColor = contextPart.color;
  menu.style.display = "none";
});

document.getElementById("pasteColorMenu").addEventListener("click", () => {
  if (contextPart && copiedColor) {
    saveState();
    contextPart.color = copiedColor;
    contextPart.shape.setAttribute("fill", copiedColor);
    document.getElementById("colorPicker").value = copiedColor;
  }
  menu.style.display = "none";
  contextPart = null;
  contextShape = null;
});

document.getElementById("copyShapeMenu").addEventListener("click", () => {
  if (contextPart) copiedShape = exportPart(contextPart);
  menu.style.display = "none";
  contextPart = null;
  contextShape = null;
});

document.getElementById("pasteShapeMenu").addEventListener("click", () => {
  if (!copiedShape) {
    menu.style.display = "none";
    return;
  }
  saveState();
  const data = JSON.parse(JSON.stringify(copiedShape));
  if (contextPart) {
    data.x = contextPart.x;
    data.y = contextPart.y;
    applyShapeToPart(contextPart, data);
  } else {
    data.x += 10;
    data.y += 10;
    createPartFromData(data);
  }
  menu.style.display = "none";
  contextPart = null;
  contextShape = null;
});

document.getElementById("attachShapeMenu").addEventListener("click", () => {
  if (contextShape && selectedPart) {
    attachShapeToPart(contextShape, selectedPart);
    updateAttachedShapes(selectedPart);
  }
  menu.style.display = "none";
  contextShape = null;
  contextPart = null;
});

document.getElementById("detachShapeMenu").addEventListener("click", () => {
  if (contextShape) {
    detachShapeFromPart(contextShape);
  }
  menu.style.display = "none";
  contextShape = null;
  contextPart = null;
});

document.getElementById("deleteShapeMenu").addEventListener("click", () => {
  if (contextShape) removeShape(contextShape);
  menu.style.display = "none";
  contextShape = null;
  contextPart = null;
});

document.getElementById("setSizeMenu").addEventListener("click", () => {
  if (contextPart) {
    saveState();
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
  contextShape = null;
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
    drawnShapes: drawnShapes.map(stripShape),
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
      saveState();
      loadFromData(JSON.parse(rd.result));
    } catch (err) {
      alert("Invalid JSON");
    }
  };
  rd.readAsText(file);
});

// --- Part creation ---
function addBody() {
  saveState();
  const width = 60,
    height = 120;
  let x;
  let y;
  if (parts.length) {
    const last = parts[parts.length - 1];
    x = last.x + last.width / 2 - width / 2;
    y = last.y + last.height;
  } else {
    x = canvas.clientWidth / 2 - width / 2;
    y = 20;
  }

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
  canvas.appendChild(drawLayer);

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
  // add default corner vertices for easier dragging
  addCornerVertices(part);
  // select the new part so all handles are visible
  selectPart(part);
  updateCanvasSize();
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
  canvas.appendChild(drawLayer);

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

  // ensure corner vertices are present
  addCornerVertices(partData);

  symVertices.forEach((v) => {
    v.handleLeft.addEventListener("mousedown", (evt) =>
      startVertexDrag(evt, partData, v, "left")
    );
    v.handleLeft.addEventListener("dblclick", () =>
      setVertexWidth(partData, v)
    );
    v.handleRight.addEventListener("mousedown", (evt) =>
      startVertexDrag(evt, partData, v, "right")
    );
    v.handleRight.addEventListener("dblclick", () =>
      setVertexWidth(partData, v)
    );
  });

  parts.push(partData);
  updatePolygonShape(partData);
  updateVertexHandles(partData);
  addPartEventListeners(partData);
  toggleHandles(partData, false);
  if (partData.topConnector && partData.topConnector !== 'none')
    createConnector(partData, 'top', partData.topConnector);
  if (partData.bottomConnector && partData.bottomConnector !== 'none')
    createConnector(partData, 'bottom', partData.bottomConnector);
  updateCanvasSize();
  return partData;
}

function applyShapeToPart(part, data) {
  const offX = data.x - part.x;
  const offY = data.y - part.y;

  // remove existing extras
  if (part.specialIcon) {
    part.specialIcon.remove();
    part.specialIcon = null;
  }
  if (part.specialForms) {
    part.specialForms.forEach((sf) => {
      if (sf.rect) sf.rect.remove();
      if (sf.rect2) sf.rect2.remove();
    });
    part.specialForms = [];
  }
  if (part.vertexHandles) {
    part.vertexHandles.forEach((h) => h.remove());
  }
  part.symVertices = [];
  part.vertexHandles = [];

  applyNewWidth(part, data.width);
  updatePartHeight(part, data.height);

  part.color = data.color;
  part.shape.setAttribute('fill', data.color);

  part.topConnector = data.topConnector;
  part.bottomConnector = data.bottomConnector;
  part.topLabel.textContent = labelFor(part.topConnector);
  updateConnectorLabelClass(part.topLabel, part.topConnector);
  part.bottomLabel.textContent = labelFor(part.bottomConnector);
  updateConnectorLabelClass(part.bottomLabel, part.bottomConnector);
  if (part.topConnector && part.topConnector !== 'none')
    createConnector(part, 'top', part.topConnector);
  else removeConnector(part, 'top');
  if (part.bottomConnector && part.bottomConnector !== 'none')
    createConnector(part, 'bottom', part.bottomConnector);
  else removeConnector(part, 'bottom');

  part.special = data.special;
  if (part.special) {
    const icon = document.createElementNS(svgNS, 'rect');
    icon.setAttribute('x', part.x + part.width + 4);
    icon.setAttribute('y', part.y + part.height / 2 - 7);
    icon.setAttribute('width', 14);
    icon.setAttribute('height', 14);
    icon.classList.add('special-placeholder');
    part.g.appendChild(icon);
    part.specialIcon = icon;
  }

  if (data.specialForms) {
    data.specialForms.forEach((sf) => {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', sf.x - offX);
      r.setAttribute('y', sf.y - offY);
      r.setAttribute('width', sf.width);
      r.setAttribute('height', sf.height);
      if (sf.rx) {
        r.setAttribute('rx', sf.rx);
        r.setAttribute('ry', sf.rx);
      }
      r.classList.add('special-form');
      r.addEventListener('contextmenu', specialContext);
      part.g.appendChild(r);
      let r2 = null;
      if (sf.symmetrical) {
        r2 = document.createElementNS(svgNS, 'rect');
        const center = part.x + part.width / 2;
        const dx = sf.side === 'left' ? center - (sf.x - offX) - sf.width : (sf.x - offX) - center;
        r2.setAttribute('x', center + dx);
        r2.setAttribute('y', sf.y - offY);
        r2.setAttribute('width', sf.width);
        r2.setAttribute('height', sf.height);
        if (sf.rx) {
          r2.setAttribute('rx', sf.rx);
          r2.setAttribute('ry', sf.rx);
        }
        r2.classList.add('special-form');
        r2.addEventListener('contextmenu', specialContext);
        part.g.appendChild(r2);
      }
      part.specialForms.push({ rect: r, rect2: r2, side: sf.side });
    });
  }

  if (data.symVertices) {
    data.symVertices.forEach((v) => {
      const vertex = { y: v.y, dx: v.dx };
      const hl = document.createElementNS(svgNS, 'rect');
      hl.setAttribute('width', 8);
      hl.setAttribute('height', 8);
      hl.classList.add('vertex-handle');
      part.g.appendChild(hl);
      hl.addEventListener('mousedown', (evt) => startVertexDrag(evt, part, vertex, 'left'));
      hl.addEventListener('dblclick', () => setVertexWidth(part, vertex));
      const hr = document.createElementNS(svgNS, 'rect');
      hr.setAttribute('width', 8);
      hr.setAttribute('height', 8);
      hr.classList.add('vertex-handle');
      part.g.appendChild(hr);
      hr.addEventListener('mousedown', (evt) => startVertexDrag(evt, part, vertex, 'right'));
      hr.addEventListener('dblclick', () => setVertexWidth(part, vertex));
      vertex.handleLeft = hl;
      vertex.handleRight = hr;
      part.symVertices.push(vertex);
      part.vertexHandles.push(hl, hr);
    });
  }

  // ensure default corner vertices exist
  addCornerVertices(part);

  updatePolygonShape(part);
  updateVertexHandles(part);
  toggleHandles(part, false);
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
  saveState();
  const y = evt.offsetY;
  const rectY = part.y;
  const h = part.height;
  if (y < rectY + 10) {
    part.topConnector = nextState(part.topConnector);
    part.topLabel.textContent = labelFor(part.topConnector);
    updateConnectorLabelClass(part.topLabel, part.topConnector);
    if (part.topConnector === 'none') removeConnector(part, 'top');
    else createConnector(part, 'top', part.topConnector);
  } else if (y > rectY + h - 10) {
    part.bottomConnector = nextState(part.bottomConnector);
    part.bottomLabel.textContent = labelFor(part.bottomConnector);
    updateConnectorLabelClass(part.bottomLabel, part.bottomConnector);
    if (part.bottomConnector === 'none') removeConnector(part, 'bottom');
    else createConnector(part, 'bottom', part.bottomConnector);
  }
}
function nextState(s) {
  return s === "none" ? "PIN" : s === "PIN" ? "BOX" : "none";
}

// --- Special Feature Toggling ---
function toggleSpecialVertex(e, part) {
  saveState();
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
    hl.addEventListener("dblclick", () => setVertexWidth(part, vertex));
    const hr = document.createElementNS(svgNS, "rect");
    hr.setAttribute("width", 8);
    hr.setAttribute("height", 8);
    hr.classList.add("vertex-handle");
    part.g.appendChild(hr);
    hr.addEventListener("mousedown", (evt) => startVertexDrag(evt, part, vertex, "right"));
    hr.addEventListener("dblclick", () => setVertexWidth(part, vertex));
    vertex.handleLeft = hl;
    vertex.handleRight = hr;
    part.vertexHandles.push(hl, hr);
    const fromLeft = e.offsetX - part.x < part.width / 2;
    startVertexDrag(e, part, vertex, fromLeft ? "left" : "right");
  }
  updatePolygonShape(part);
  updateVertexHandles(part);
}

function createVertexHandle(part, y) {
  const vertex = { y, dx: 0 };
  const hl = document.createElementNS(svgNS, 'rect');
  hl.setAttribute('width', 8);
  hl.setAttribute('height', 8);
  hl.classList.add('vertex-handle');
  part.g.appendChild(hl);
  hl.addEventListener('mousedown', (evt) => startVertexDrag(evt, part, vertex, 'left'));
  hl.addEventListener('dblclick', () => setVertexWidth(part, vertex));
  const hr = document.createElementNS(svgNS, 'rect');
  hr.setAttribute('width', 8);
  hr.setAttribute('height', 8);
  hr.classList.add('vertex-handle');
  part.g.appendChild(hr);
  hr.addEventListener('mousedown', (evt) => startVertexDrag(evt, part, vertex, 'right'));
  hr.addEventListener('dblclick', () => setVertexWidth(part, vertex));
  vertex.handleLeft = hl;
  vertex.handleRight = hr;
  if (!part.symVertices) part.symVertices = [];
  if (!part.vertexHandles) part.vertexHandles = [];
  part.symVertices.push(vertex);
  part.vertexHandles.push(hl, hr);
  return vertex;
}

function addCornerVertices(part) {
  if (!part.symVertices) part.symVertices = [];
  if (!part.vertexHandles) part.vertexHandles = [];
  const tol = 0.001;
  const hasTop = part.symVertices.some((v) => Math.abs(v.y) < tol);
  if (!hasTop) createVertexHandle(part, 0);
  const hasBottom = part.symVertices.some((v) => Math.abs(v.y - part.height) < tol);
  if (!hasBottom) createVertexHandle(part, part.height);
  updatePolygonShape(part);
  updateVertexHandles(part);
}


function findSpecialForm(el) {
  for (const part of parts) {
    for (const sf of part.specialForms || []) {
      if (sf.rect === el || sf.rect2 === el) return { part, sf };
    }
  }
  return null;
}

function specialContext(e) {
  e.preventDefault();
  saveState();
  const info = findSpecialForm(e.target);
  if (!info) return;
  const action = prompt('Type "remove" to delete, "size" to set dimensions, or enter roundness value');
  if (!action) return;
  if (action === "remove") {
    if (info.sf.rect) info.sf.rect.remove();
    if (info.sf.rect2) info.sf.rect2.remove();
    info.part.specialForms = info.part.specialForms.filter((f) => f !== info.sf);
    return;
  }
  if (action === "size") {
    const wInput = prompt("Enter width in cm:", info.sf.rect.getAttribute('width'));
    const hInput = prompt("Enter height in cm:", info.sf.rect.getAttribute('height'));
    if (wInput) {
      const w = parseDimension(wInput, 'cm');
      if (!isNaN(w)) {
        info.sf.rect.setAttribute('width', w);
        if (info.sf.rect2) info.sf.rect2.setAttribute('width', w);
      }
    }
    if (hInput) {
      const h = parseDimension(hInput, 'cm');
      if (!isNaN(h)) {
        info.sf.rect.setAttribute('height', h);
        if (info.sf.rect2) info.sf.rect2.setAttribute('height', h);
      }
    }
    if (info.sf.rect2) {
      const center = info.part.x + info.part.width / 2;
      const x = parseFloat(info.sf.rect.getAttribute('x'));
      const w = parseFloat(info.sf.rect.getAttribute('width'));
      const dx = info.sf.side === 'left' ? center - x - w : x - center;
      info.sf.rect2.setAttribute('x', center + dx);
      info.sf.rect2.setAttribute('y', info.sf.rect.getAttribute('y'));
    }
    return;
  }
  info.sf.rect.setAttribute('rx', action);
  info.sf.rect.setAttribute('ry', action);
  if (info.sf.rect2) {
    info.sf.rect2.setAttribute('rx', action);
    info.sf.rect2.setAttribute('ry', action);
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
  resizePart = null,
  startVertYs = null;
function startResize(e, part) {
  e.preventDefault();
  saveState();
  resizing = true;
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startHeight = part.height;
  resizePart = part;
  if (part.symVertices) {
    part.symVertices.forEach(v => {
      if (v.y > part.height) v.y = part.height;
      if (v.y < 0) v.y = 0;
    });
  }
  startVertYs = part.symVertices ? part.symVertices.map(v => v.y) : null;
  window.addEventListener("mousemove", doResize);
  window.addEventListener("touchmove", doResize, { passive: false });
  window.addEventListener("mouseup", stopResize);
  window.addEventListener("touchend", stopResize);
}
function doResize(e) {
  if (!resizing) return;
  const currentY = e.touches ? e.touches[0].clientY : e.clientY;
  const delta = (currentY - startY) / zoom;
  const newH = Math.max(30, startHeight + delta);
  resizePart.height = newH;
  resizePart.rect.setAttribute("height", newH);
  resizePart.handle.setAttribute("y", resizePart.y + newH - 5);
  resizePart.leftHandle.setAttribute("y", resizePart.y + newH / 2 - 5);
  resizePart.rightHandle.setAttribute("y", resizePart.y + newH / 2 - 5);
  resizePart.bottomLabel.setAttribute("y", resizePart.y + newH + 6);

  const scale = newH / startHeight;
  if (resizePart.symVertices && startVertYs) {
    const tol = 0.001;
    resizePart.symVertices.forEach((v, i) => {
      v.y = startVertYs[i] * scale;
      if (Math.abs(startVertYs[i] - startHeight) < tol) v.y = newH;
      if (Math.abs(startVertYs[i]) < tol) v.y = 0;
      if (v.y > newH) v.y = newH;
      if (v.y < 0) v.y = 0;
    });
  }
  updatePolygonShape(resizePart);
  updateVertexHandles(resizePart);
  updateAttachedShapes(resizePart);
  updateConnectors(resizePart);

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
    updateAttachedShapes(parts[i]);
    updateConnectors(parts[i]);
    baseY += parts[i].height;
  }
}
function stopResize() {
  resizing = false;
  window.removeEventListener("mousemove", doResize);
  window.removeEventListener("touchmove", doResize);
  window.removeEventListener("mouseup", stopResize);
  window.removeEventListener("touchend", stopResize);
  startVertYs = null;
  updateCanvasSize();
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
  saveState();
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
  const delta = (hDir === "left" ? startX - currentX : currentX - startX) / zoom;
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
  updateCanvasSize();
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
  updateAttachedShapes(part);
  updateConnectors(part);
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

function stripShape(s) {
  const base = { type: s.type, width: s.width };
  if (s.parentPart) {
    base.parentIndex = parts.indexOf(s.parentPart);
  }
  if (s.type === 'line') {
    return {
      ...base,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      relX1: s.relX1,
      relY1: s.relY1,
      relX2: s.relX2,
      relY2: s.relY2,
    };
  } else if (s.type === 'curve') {
    return {
      ...base,
      p0: s.p0,
      p1: s.p1,
      p2: s.p2,
      relP0: s.relP0,
      relP1: s.relP1,
      relP2: s.relP2,
    };
  } else if (s.type === 'circle') {
    return {
      ...base,
      cx: s.cx,
      cy: s.cy,
      r: s.r,
      relCX: s.relCX,
      relCY: s.relCY,
      relR: s.relR,
    };
  }
  return base;
}

function applyNewWidth(part, newW) {
  saveState();
  const center = part.x + part.width / 2;
  part.width = newW;
  part.x = center - newW / 2;
  updatePartWidth(part);
  updateAttachedShapes(part);
  updateConnectors(part);
  updateCanvasSize();
}

function updatePartHeight(part, newH) {
  saveState();
  const oldH = part.height;
  const scale = newH / oldH;
  part.height = newH;
  part.rect.setAttribute('height', newH);
  part.handle.setAttribute('y', part.y + newH - 5);
  part.leftHandle.setAttribute('y', part.y + newH / 2 - 5);
  part.rightHandle.setAttribute('y', part.y + newH / 2 - 5);
  part.bottomLabel.setAttribute('y', part.y + newH + 6);
  if (part.symVertices) {
    const tol = 0.001;
    part.symVertices.forEach((v) => {
      const origY = v.y;
      v.y *= scale;
      if (Math.abs(origY - oldH) < tol) v.y = newH;
      if (Math.abs(origY) < tol) v.y = 0;
      if (v.y > newH) v.y = newH;
      if (v.y < 0) v.y = 0;
    });
  }
  updatePolygonShape(part);
  updateVertexHandles(part);
  updateAttachedShapes(part);
  updateConnectors(part);
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
    updateAttachedShapes(parts[i]);
    updateConnectors(parts[i]);
    baseY += parts[i].height;
  }
  updateCanvasSize();
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
  saveState();
  vertexDrag = { part, vertex, side, startX: e.clientX, startDx: vertex.dx };
  window.addEventListener("mousemove", doVertexDrag);
  window.addEventListener("mouseup", stopVertexDrag);
}

function doVertexDrag(e) {
  if (!vertexDrag) return;
  const currentX = e.clientX;
  const { part, vertex, side, startX, startDx } = vertexDrag;
  const delta = (side === "left" ? startX - currentX : currentX - startX) / zoom;
  const minDx = -part.width / 2 + 1;
  vertex.dx = Math.max(minDx, startDx + delta);
  updatePolygonShape(part);
  updateVertexHandles(part);
}

function stopVertexDrag() {
  window.removeEventListener("mousemove", doVertexDrag);
  window.removeEventListener("mouseup", stopVertexDrag);
  vertexDrag = null;
}

function setVertexWidth(part, vertex) {
  const input = prompt("Enter width (e.g., 10cm, 8in, 8 1/2in):", "");
  if (!input) return;
  const w = parseDimension(input, "cm");
  if (isNaN(w)) {
    alert("Invalid width value");
    return;
  }
  saveState();
  const desiredDx = (w - part.width) / 2;
  const minDx = -part.width / 2 + 1;
  vertex.dx = Math.max(minDx, desiredDx);
  updatePolygonShape(part);
  updateVertexHandles(part);
}

function updateShapeRelative(shape) {
  if (!shape.parentPart) return;
  const part = shape.parentPart;
  if (shape.type === 'line') {
    shape.relX1 = (shape.x1 - part.x) / part.width;
    shape.relY1 = (shape.y1 - part.y) / part.height;
    shape.relX2 = (shape.x2 - part.x) / part.width;
    shape.relY2 = (shape.y2 - part.y) / part.height;
  } else if (shape.type === 'circle') {
    shape.relCX = (shape.cx - part.x) / part.width;
    shape.relCY = (shape.cy - part.y) / part.height;
    shape.relR = shape.r / ((part.width + part.height) / 2);
  } else if (shape.type === 'curve') {
    shape.relP0 = {
      x: (shape.p0.x - part.x) / part.width,
      y: (shape.p0.y - part.y) / part.height,
    };
    shape.relP1 = {
      x: (shape.p1.x - part.x) / part.width,
      y: (shape.p1.y - part.y) / part.height,
    };
    shape.relP2 = {
      x: (shape.p2.x - part.x) / part.width,
      y: (shape.p2.y - part.y) / part.height,
    };
  }
}

function updateAttachedShapes(part) {
  if (!part.shapes) return;
  part.shapes.forEach((s) => {
    if (s.type === 'line') {
      s.x1 = part.x + s.relX1 * part.width;
      s.y1 = part.y + s.relY1 * part.height;
      s.x2 = part.x + s.relX2 * part.width;
      s.y2 = part.y + s.relY2 * part.height;
      s.elem.setAttribute('x1', s.x1);
      s.elem.setAttribute('y1', s.y1);
      s.elem.setAttribute('x2', s.x2);
      s.elem.setAttribute('y2', s.y2);
    } else if (s.type === 'circle') {
      s.cx = part.x + s.relCX * part.width;
      s.cy = part.y + s.relCY * part.height;
      s.r = s.relR * ((part.width + part.height) / 2);
      s.elem.setAttribute('cx', s.cx);
      s.elem.setAttribute('cy', s.cy);
      s.elem.setAttribute('r', s.r);
    } else if (s.type === 'curve') {
      s.p0.x = part.x + s.relP0.x * part.width;
      s.p0.y = part.y + s.relP0.y * part.height;
      s.p1.x = part.x + s.relP1.x * part.width;
      s.p1.y = part.y + s.relP1.y * part.height;
      s.p2.x = part.x + s.relP2.x * part.width;
      s.p2.y = part.y + s.relP2.y * part.height;
      s.elem.setAttribute(
        'd',
        `M ${s.p0.x} ${s.p0.y} Q ${s.p1.x} ${s.p1.y} ${s.p2.x} ${s.p2.y}`
      );
    }
    updateShapeHandles(s);
  });
}

function attachShapeToPart(shape, part, relData) {
  if (!part.shapes) part.shapes = [];
  if (!part.shapes.includes(shape)) part.shapes.push(shape);
  shape.parentPart = part;
  if (relData) {
    Object.assign(shape, relData);
  } else {
    updateShapeRelative(shape);
  }
}

function detachShapeFromPart(shape) {
  if (!shape.parentPart) return;
  const arr = shape.parentPart.shapes || [];
  const idx = arr.indexOf(shape);
  if (idx !== -1) arr.splice(idx, 1);
  shape.parentPart = null;
  delete shape.relX1;
  delete shape.relY1;
  delete shape.relX2;
  delete shape.relY2;
  delete shape.relCX;
  delete shape.relCY;
  delete shape.relR;
  delete shape.relP0;
  delete shape.relP1;
  delete shape.relP2;
}

function removeConnector(part, pos) {
  if (!part.connectors || !part.connectors[pos]) return;
  const c = part.connectors[pos];
  if (c.group) c.group.remove();
  delete part.connectors[pos];
}

function createConnector(part, pos, type) {
  if (!CONNECTOR_TEMPLATE) {
    setTimeout(() => createConnector(part, pos, type), 100);
    return;
  }
  if (!part.connectors) part.connectors = {};
  removeConnector(part, pos);

  const w = part.width * 0.8;
  const h = (CONNECTOR_TEMPLATE.height / CONNECTOR_TEMPLATE.width) * w;
  const flip = (pos === 'top' && type === 'PIN') || (pos === 'bottom' && type === 'BOX');
  const x0 = part.x + (part.width - w) / 2;
  let y0;
  if (pos === 'top') y0 = type === 'PIN' ? part.y - h : part.y;
  else y0 = type === 'PIN' ? part.y + part.height : part.y + part.height - h;

  const g = document.createElementNS(svgNS, 'g');
  g.classList.add('connector-shape');
  g.style.pointerEvents = 'none';

  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('x', x0);
  rect.setAttribute('y', y0);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);
  rect.setAttribute('fill', '#cccccc');
  if (type === 'BOX') rect.setAttribute('fill-opacity', '0.8');
  g.appendChild(rect);

  CONNECTOR_TEMPLATE.lines.forEach((t) => {
    const line = document.createElementNS(svgNS, 'line');
    const y1 = flip ? 1 - t.relY1 : t.relY1;
    const y2 = flip ? 1 - t.relY2 : t.relY2;
    line.setAttribute('x1', x0 + t.relX1 * w);
    line.setAttribute('y1', y0 + y1 * h);
    line.setAttribute('x2', x0 + t.relX2 * w);
    line.setAttribute('y2', y0 + y2 * h);
    line.setAttribute('stroke', 'black');
    line.setAttribute('stroke-width', 2);
    g.appendChild(line);
  });

  drawLayer.appendChild(g);
  part.connectors[pos] = { type, group: g };
}

function updateConnectors(part) {
  if (!part.connectors) return;
  if (part.connectors.top) createConnector(part, 'top', part.connectors.top.type);
  if (part.connectors.bottom) createConnector(part, 'bottom', part.connectors.bottom.type);
}

function removePart(part) {
  saveState();
  const idx = parts.indexOf(part);
  if (idx === -1) return;
  if (part.shapes) {
    part.shapes.forEach((s) => detachShapeFromPart(s));
  }
  if (part.connectors) {
    removeConnector(part, 'top');
    removeConnector(part, 'bottom');
  }
  canvas.removeChild(part.g);
  parts.splice(idx, 1);
  if (selectedPart === part) selectedPart = null;
  let baseY = idx > 0 ? parts[idx - 1].y + parts[idx - 1].height : 20;
  for (let i = idx; i < parts.length; i++) {
    const p = parts[i];
    const dy = baseY - p.y;
    p.y = baseY;
    p.rect.setAttribute("y", baseY);
    p.handle.setAttribute("y", baseY + p.height - 5);
    p.leftHandle.setAttribute("y", baseY + p.height / 2 - 5);
    p.rightHandle.setAttribute("y", baseY + p.height / 2 - 5);
    p.topLabel.setAttribute("y", baseY - 6);
    p.bottomLabel.setAttribute("y", baseY + p.height + 6);
    if (p.specialIcon) {
      p.specialIcon.setAttribute("y", baseY + p.height / 2 - 7);
    }
    if (p.specialForms) {
      p.specialForms.forEach((sf) => {
        if (sf.rect) sf.rect.setAttribute("y", parseFloat(sf.rect.getAttribute("y")) + dy);
        if (sf.rect2) sf.rect2.setAttribute("y", parseFloat(sf.rect2.getAttribute("y")) + dy);
      });
    }
    updatePolygonShape(p);
    updateVertexHandles(p);
    updateAttachedShapes(p);
    updateConnectors(p);
    baseY += p.height;
  }
  updateCanvasSize();
}

function showContextMenu(e, part = null, shape = null) {
  e.preventDefault();
  e.stopPropagation();
  contextPart = part;
  contextShape = shape;
  document.getElementById('copyColorMenu').style.display = part ? 'block' : 'none';
  document.getElementById('pasteColorMenu').style.display = part && copiedColor ? 'block' : 'none';
  document.getElementById('copyShapeMenu').style.display = part ? 'block' : 'none';
  document.getElementById('pasteShapeMenu').style.display =
    part && copiedShape ? 'block' : 'none';
  document.getElementById('setSizeMenu').style.display = part ? 'block' : 'none';
  document.getElementById('removeBody').style.display = part ? 'block' : 'none';
  document.getElementById('attachShapeMenu').style.display =
    shape && selectedPart && shape.parentPart !== selectedPart ? 'block' : 'none';
  document.getElementById('detachShapeMenu').style.display =
    shape && shape.parentPart ? 'block' : 'none';
  document.getElementById('deleteShapeMenu').style.display = shape ? 'block' : 'none';
  const rect = canvasArea.getBoundingClientRect();
  menu.style.left = `${e.clientX - rect.left + canvasArea.scrollLeft}px`;
  menu.style.top = `${e.clientY - rect.top + canvasArea.scrollTop}px`;
  menu.style.display = "block";
}

function createDrawnShapeFromData(s) {
  let elem;
  if (s.type === 'line') {
    elem = document.createElementNS(svgNS, 'line');
    elem.setAttribute('x1', s.x1);
    elem.setAttribute('y1', s.y1);
    elem.setAttribute('x2', s.x2);
    elem.setAttribute('y2', s.y2);
  } else if (s.type === 'curve') {
    elem = document.createElementNS(svgNS, 'path');
    elem.setAttribute('d', `M ${s.p0.x} ${s.p0.y} Q ${s.p1.x} ${s.p1.y} ${s.p2.x} ${s.p2.y}`);
  } else if (s.type === 'circle') {
    elem = document.createElementNS(svgNS, 'circle');
    elem.setAttribute('cx', s.cx);
    elem.setAttribute('cy', s.cy);
    elem.setAttribute('r', s.r);
  }
  if (elem) {
    elem.classList.add('drawn-shape');
    elem.setAttribute('stroke-width', s.width || shapeStrokeWidth);
    drawLayer.appendChild(elem);
    const obj = { ...s, width: s.width || shapeStrokeWidth, elem };
    addShapeEventListeners(obj);
    if (typeof s.parentIndex === 'number' && parts[s.parentIndex]) {
      attachShapeToPart(obj, parts[s.parentIndex], {
        relX1: s.relX1,
        relY1: s.relY1,
        relX2: s.relX2,
        relY2: s.relY2,
        relCX: s.relCX,
        relCY: s.relCY,
        relR: s.relR,
        relP0: s.relP0,
        relP1: s.relP1,
        relP2: s.relP2,
      });
      updateAttachedShapes(parts[s.parentIndex]);
    }
    return obj;
  }
  return null;
}

function createHandle(x, y) {
  const h = document.createElementNS(svgNS, 'rect');
  h.setAttribute('width', 8);
  h.setAttribute('height', 8);
  h.setAttribute('x', x - 4);
  h.setAttribute('y', y - 4);
  h.classList.add('shape-handle');
  drawLayer.appendChild(h);
  return h;
}

function updateShapeHandles(shape) {
  if (!shape.handles) return;
  const setPos = (h, x, y) => {
    h.setAttribute('x', x - 4);
    h.setAttribute('y', y - 4);
  };
  if (shape.type === 'line') {
    setPos(shape.handles[0], shape.x1, shape.y1);
    setPos(shape.handles[1], shape.x2, shape.y2);
  } else if (shape.type === 'circle') {
    setPos(shape.handles[0], shape.cx, shape.cy);
    setPos(shape.handles[1], shape.cx + shape.r, shape.cy);
  } else if (shape.type === 'curve') {
    setPos(shape.handles[0], shape.p0.x, shape.p0.y);
    setPos(shape.handles[1], shape.p1.x, shape.p1.y);
    setPos(shape.handles[2], shape.p2.x, shape.p2.y);
  }
}

function selectShape(shape) {
  if (selectedShape === shape) return;
  clearSelectedShape();
  selectedShape = shape;
  shape.elem.classList.add('selected');
  if (!shape.handles) {
    if (shape.type === 'line') {
      shape.handles = [
        createHandle(shape.x1, shape.y1),
        createHandle(shape.x2, shape.y2),
      ];
    } else if (shape.type === 'circle') {
      shape.handles = [
        createHandle(shape.cx, shape.cy),
        createHandle(shape.cx + shape.r, shape.cy),
      ];
    } else if (shape.type === 'curve') {
      shape.handles = [
        createHandle(shape.p0.x, shape.p0.y),
        createHandle(shape.p1.x, shape.p1.y),
        createHandle(shape.p2.x, shape.p2.y),
      ];
    }
  }
  updateShapeHandles(shape);
}

function clearSelectedShape() {
  if (!selectedShape) return;
  selectedShape.elem.classList.remove('selected');
  if (selectedShape.handles) {
    selectedShape.handles.forEach((h) => h.remove());
    selectedShape.handles = null;
  }
  selectedShape = null;
}

function addShapeEventListeners(shape) {
  shape.elem.addEventListener('mousedown', (e) => {
    selectShape(shape);
    startShapeDrag(e, shape);
  });
  shape.elem.addEventListener('click', () => selectShape(shape));
  shape.elem.addEventListener('contextmenu', (e) => {
    showContextMenu(e, null, shape);
  });
}

let shapeDrag = null;
function startShapeDrag(e, shape) {
  e.preventDefault();
  saveState();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / zoom;
  const y = (e.clientY - rect.top) / zoom;
  let mode = 'move';
  if (shape.type === 'line') {
    const d1 = Math.hypot(x - shape.x1, y - shape.y1);
    const d2 = Math.hypot(x - shape.x2, y - shape.y2);
    if (d1 < 6) mode = 'start';
    else if (d2 < 6) mode = 'end';
  } else if (shape.type === 'circle') {
    const d = Math.hypot(x - shape.cx, y - shape.cy);
    if (Math.abs(d - shape.r) < 6) mode = 'resize';
  }
  shapeDrag = {
    shape,
    mode,
    startX: e.clientX,
    startY: e.clientY,
    start: { ...shape },
  };
  window.addEventListener('mousemove', doShapeDrag);
  window.addEventListener('mouseup', stopShapeDrag);
}

function doShapeDrag(e) {
  if (!shapeDrag) return;
  const { shape, mode, startX, startY, start } = shapeDrag;
  const dx = (e.clientX - startX) / zoom;
  const dy = (e.clientY - startY) / zoom;
  if (shape.type === 'line') {
    if (mode === 'start' || mode === 'move') {
      shape.x1 = start.x1 + dx;
      shape.y1 = start.y1 + dy;
    }
    if (mode === 'end' || mode === 'move') {
      shape.x2 = start.x2 + dx;
      shape.y2 = start.y2 + dy;
    }
    shape.elem.setAttribute('x1', shape.x1);
    shape.elem.setAttribute('y1', shape.y1);
    shape.elem.setAttribute('x2', shape.x2);
    shape.elem.setAttribute('y2', shape.y2);
    updateShapeHandles(shape);
  } else if (shape.type === 'circle') {
    if (mode === 'move') {
      shape.cx = start.cx + dx;
      shape.cy = start.cy + dy;
    } else if (mode === 'resize') {
      const rect = canvas.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / zoom;
      const ry = (e.clientY - rect.top) / zoom;
      shape.r = Math.max(1, Math.hypot(rx - start.cx, ry - start.cy));
    }
    shape.elem.setAttribute('cx', shape.cx);
    shape.elem.setAttribute('cy', shape.cy);
    shape.elem.setAttribute('r', shape.r);
    updateShapeHandles(shape);
  }
}

function stopShapeDrag() {
  window.removeEventListener('mousemove', doShapeDrag);
  window.removeEventListener('mouseup', stopShapeDrag);
  if (shapeDrag && shapeDrag.shape.parentPart) {
    updateShapeRelative(shapeDrag.shape);
  }
  shapeDrag = null;
}

function removeShape(shape) {
  if (shape.parentPart) detachShapeFromPart(shape);
  const idx = drawnShapes.indexOf(shape);
  if (idx !== -1) drawnShapes.splice(idx, 1);
  if (shape.elem) shape.elem.remove();
  if (selectedShape === shape) clearSelectedShape();
  saveState();
}

function updateAxes() {
  axisLayer.innerHTML = '';
  if (!parts.length) return;

  const left = Math.min(...parts.map((p) => p.x));
  const right = Math.max(...parts.map((p) => p.x + p.width));
  const top = Math.min(...parts.map((p) => p.y));
  const bottom = Math.max(...parts.map((p) => p.y + p.height));

  const width = right - left;
  const height = bottom - top;
  const centerX = (left + right) / 2;

  const axisY = bottom + 10;
  const hAxis = document.createElementNS(svgNS, 'line');
  hAxis.setAttribute('x1', left);
  hAxis.setAttribute('x2', right);
  hAxis.setAttribute('y1', axisY);
  hAxis.setAttribute('y2', axisY);
  hAxis.classList.add('axis-line');
  axisLayer.appendChild(hAxis);

  const maxIn = width / PX_PER_INCH;
  for (let i = 0; i <= Math.ceil(maxIn); i++) {
    const d = (i / 2) * PX_PER_INCH;
    [-1, 1].forEach((s) => {
      const x = centerX + s * d;
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', x);
      tick.setAttribute('x2', x);
      tick.setAttribute('y1', axisY - 4);
      tick.setAttribute('y2', axisY + 4);
      tick.classList.add('axis-line');
      axisLayer.appendChild(tick);

      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', x);
      txt.setAttribute('y', axisY + 14);
      txt.setAttribute('text-anchor', 'middle');
      txt.classList.add('axis-label');
      txt.textContent = i;
      axisLayer.appendChild(txt);
    });
  }

  const axisX = left - 20;
  const vAxis = document.createElementNS(svgNS, 'line');
  vAxis.setAttribute('x1', axisX);
  vAxis.setAttribute('x2', axisX);
  vAxis.setAttribute('y1', bottom);
  vAxis.setAttribute('y2', top);
  vAxis.classList.add('axis-line');
  axisLayer.appendChild(vAxis);

  const maxCm = height / PX_PER_CM;
  for (let i = 0; i <= Math.ceil(maxCm); i++) {
    const y = bottom - i * PX_PER_CM;
    const tick = document.createElementNS(svgNS, 'line');
    tick.setAttribute('x1', axisX - 4);
    tick.setAttribute('x2', axisX + 4);
    tick.setAttribute('y1', y);
    tick.setAttribute('y2', y);
    tick.classList.add('axis-line');
    axisLayer.appendChild(tick);

    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', axisX - 6);
    txt.setAttribute('y', y + 3);
    txt.setAttribute('text-anchor', 'end');
    txt.classList.add('axis-label');
    txt.textContent = i;
    axisLayer.appendChild(txt);
  }
}

// --- Import Logic ---
function clearCanvas() {
  while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
  parts.length = 0;
  drawnShapes.length = 0;
  drawLayer.innerHTML = '';
  axisLayer.innerHTML = '';
  selectedPart = null;
  canvas.appendChild(drawLayer);
  canvas.appendChild(axisLayer);
  updateCanvasSize();
}
function loadFromData(data) {
  clearCanvas();
  if (data.parts) {
    data.parts.forEach((p) => {
      createPartFromData(p);
    });
  }
  if (data.drawnShapes) {
    data.drawnShapes.forEach((s) => {
      const obj = createDrawnShapeFromData(s);
      if (obj) drawnShapes.push(obj);
    });
  }
  updateCanvasSize();
}

// capture initial empty state
saveState();
updateCanvasSize();
