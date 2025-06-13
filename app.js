/* ──────────  View Switching  ────────── */
const mainPage    = document.getElementById('main-page');
const builderPage = document.getElementById('builder-page');

document.getElementById('newBtn').onclick = () => {
  mainPage.hidden    = true;
  builderPage.hidden = false;
};

document.getElementById('loadBtn').onclick = () =>
  document.getElementById('fileInput').click();

/* ──────────  File Import  ────────── */
document.getElementById('fileInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      loadAssembly(data);
      mainPage.hidden    = true;
      builderPage.hidden = false;
    } catch(err){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
};

/* ──────────  Drag-and-Drop Logic  ────────── */
const dropZone = document.getElementById('dropZone');

document.querySelectorAll('.tool-item').forEach(item => {
  item.addEventListener('dragstart', ev => {
    ev.dataTransfer.setData('application/json', item.dataset.tool);
  });
});

dropZone.addEventListener('drop', ev => {
  ev.preventDefault();
  const json = ev.dataTransfer.getData('application/json');
  if (!json) return;
  const tool = JSON.parse(json);
  addComponent(tool);
});

/*  Helper: create a visual block in the assembly  */
function addComponent(tool){
  const div = document.createElement('div');
  div.className = 'bha-component';
  div.innerHTML = `
    <span>${tool.name}</span>
    <span class="dim">${tool.od}&quot; · ${tool.length} ft</span>
  `;
  dropZone.appendChild(div);
}

/*  Helper: rebuild the assembly from imported JSON list  */
function loadAssembly(arr){
  dropZone.querySelectorAll('.bha-component').forEach(el => el.remove());
  arr.forEach(addComponent);
}
