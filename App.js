const svgNS = "http://www.w3.org/2000/svg";
const canvas = document.getElementById("diagramCanvas");
const parts = [];
let selectedPart = null;
let copiedColor = null;

// --- Toolbar buttons ---
document.getElementById("addBody").addEventListener("click", addBody);

document.getElementById("colorPicker").addEventListener("input", (e) => {
  if (selectedPart) {
    selectedPart.color = e.target.value;
    selectedPart.rect.setAttribute("fill", e.target.value);
  }
});

document.getElementById("addSpecial").addEventListener("click", () => {
  if (!selectedPart) {
    alert("Select a part first.");
    return;
  }
  if (selectedPart.special) {
    if (selectedPart.specialIcon) {
      selectedPart.g.removeChild(selectedPart.specialIcon);
    }
    selectedPart.special = false;
  } else {
    const icon = document.createElementNS(svgNS, "rect");
    const x = parseFloat(selectedPart.rect.getAttribute("x")) + selectedPart.width + 4;
    const y = parseFloat(selectedPart.rect.getAttribute("y")) + selectedPart.height / 2 - 7;
    icon.setAttribute("x", x);
    icon.setAttribute("y", y);
    icon.setAttribute("width", 14);
    icon.setAttribute("height", 14);
    icon.classList.add("special-placeholder");
    selectedPart.g.appendChild(icon);
    selectedPart.specialIcon = icon;
    selectedPart.special = true;
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
    selectedPart.rect.setAttribute("fill", copiedColor);
    document.getElementById("colorPicker").value = copiedColor;
  }
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

  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("fill", "#cccccc");
  rect.classList.add("rect");
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
  selectPart(part);
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
  part.rect.addEventListener("click", (e) => {
    selectPart(part);
    handleConnectorToggle(e, part);
  });
  part.handle.addEventListener("mousedown", (e) => startResize(e, part));
  part.handle.addEventListener(
    "touchstart",
    (e) => startResize(e, part),
    { passive: false }
  );
  part.leftHandle.addEventListener("mousedown", (e) => startHResize(e, part, "left"));
  part.leftHandle.addEventListener("touchstart", (e) => startHResize(e, part, "left"), { passive: false });
  part.rightHandle.addEventListener("mousedown", (e) => startHResize(e, part, "right"));
  part.rightHandle.addEventListener("touchstart", (e) => startHResize(e, part, "right"), { passive: false });
}

// --- Selection & Connector Logic ---
function selectPart(part) {
  if (selectedPart) {
    selectedPart.rect.classList.remove("selected");
  }
  selectedPart = part;
  part.rect.classList.add("selected");
  document.getElementById("colorPicker").value = part.color;
}

function handleConnectorToggle(evt, part) {
  const y = evt.offsetY;
  const rectY = parseFloat(part.rect.getAttribute("y"));
  const h = parseFloat(part.rect.getAttribute("height"));
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
    const g = document.createElementNS(svgNS, "g");
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", p.x);
    rect.setAttribute("y", p.y);
    rect.setAttribute("width", p.width);
    rect.setAttribute("height", p.height);
    rect.setAttribute("fill", p.color);
    rect.classList.add("rect");
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

    canvas.appendChild(g);

    const partData = {
      ...p,
      g,
      rect,
      handle,
      leftHandle,
      rightHandle,
      topLabel,
      bottomLabel,
      width: p.width,
      height: p.height,
      specialIcon,
    };
    parts.push(partData);
    addPartEventListeners(partData);
  });
}
