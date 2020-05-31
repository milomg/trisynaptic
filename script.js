const thresholdIn = document.getElementById("threshold");
const sidebar = document.getElementById("sidebar");
const synpaseStrength = document.getElementById("strength");
const graphed = document.getElementById("graph-toggle");
let toolbar = document.querySelector(".toolbar");
let blue = toolbar.firstElementChild;
let red = blue.nextElementSibling;

const c = document.querySelector("#c");
const ctx = c.getContext("2d");

let w = window.innerWidth - 240;
let h = window.innerHeight - 40;
c.style.width = `${w}px`;
c.style.height = `${h}px`;
const scale = window.devicePixelRatio;
c.width = Math.ceil(w * scale);
c.height = Math.ceil(h * scale);
ctx.scale(scale, scale);

const vGraph = { width: 60, height: 35 }; //voltage graph dimensions
const offset = { x: 0, y: 0 };

const restingPotential = -70.0e-3; // mV
const threshold = -55.0e-3; // mV
const resetVoltage = -80.0e-3; // mV

const capacitance = 0.2e-9; // nF
const resistance = 100.0e6; // MΩ

const timeConstant = 2.0e-3; // ms

const maxCurrent = 3.0e-9; // nA

const delay = 5e-3; // ms

const refractoryPeriod = 2.0e-3; // ms;

const radius = 12;
const box = 20;

let id = 0;

let defaultSign = 1;

let neuromodulation = true;

function drawArrow(fromx, fromy, tox, toy) {
  const headlen = 10; // length of head in pixels
  const dx = tox - fromx;
  const dy = toy - fromy;
  const len = Math.sqrt(dx ** 2 + dy ** 2);
  const subx = (dx / len) * box;
  const suby = (dy / len) * box;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(fromx + subx, fromy + suby);
  ctx.lineTo(tox - subx, toy - suby);
  ctx.lineTo(
    tox - subx - headlen * Math.cos(angle - Math.PI / 6),
    toy - suby - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(tox - subx, toy - suby);
  ctx.lineTo(
    tox - subx - headlen * Math.cos(angle + Math.PI / 6),
    toy - suby - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

class Synapse {
  constructor(start, end, inId = -1) {
    this.start = start;
    this.end = end;
    this.maxCurrent = maxCurrent;
    this.signals = [];
    this.id = inId == -1 ? ++id : inId;
  }
  value() {
    return this.start.exponential * this.start.sign * this.maxCurrent;
  }
  get x() {
    return 0.5 * (this.start.x + this.end.x);
  }
  get y() {
    return 0.5 * (this.start.y + this.end.y);
  }
  fire() {
    if (neuromodulation && this.end instanceof Synapse) {
      this.end.maxCurrent += this.maxCurrent * this.start.sign;
      if (this.end == active)
        synpaseStrength.value = this.end.maxCurrent / maxCurrent;
    }
    this.signals.push(0);
  }
  tick(dt) {
    for (const i in this.signals) {
      this.signals[i] += dt;
    }
  }
  draw() {
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.start.sign > 0 ? "#6bafd6" : "#d66b88";
    drawArrow(this.start.x, this.start.y, this.end.x, this.end.y);

    for (const time of this.signals) {
      let x = this.start.x + ((this.end.x - this.start.x) * time) / delay;
      let y = this.start.y + ((this.end.y - this.start.y) * time) / delay;

      ctx.strokeStyle = "black";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    this.signals = this.signals.filter((time) => time <= delay);
  }
}

class Neuron {
  constructor(x, y, sign = defaultSign, inId = -1) {
    this.x = x; // input
    this.y = y; // input
    this.id = inId == -1 ? ++id : inId; // input

    this.voltage = resetVoltage;
    this.inputs = []; // input (synapse)
    this.outputs = []; // input (synapse, neuron)
    this.lastFire = Infinity;
    this.exponential = 0.0;
    this.fired = true;
    this.sign = sign;
    this.threshold = threshold;
    this.canvas = null;
    this.graph = null;
    this.lasty = 48;

    this.tags = { all: true };
  }
  createGraph() {
    this.canvas = document.createElement("canvas");
    this.graph = this.canvas.getContext("2d");

    this.canvas.style.width = `${vGraph.width}px`;
    this.canvas.style.height = `${vGraph.height}px`;
    this.canvas.width = Math.ceil(vGraph.width * scale);
    this.canvas.height = Math.ceil(vGraph.height * scale);
    this.graph.scale(scale, scale);
    this.graph.fillStyle = "white";
    this.graph.fillRect(0, 0, vGraph.width, vGraph.height);
  }
  deleteGraph() {
    this.graph = null;
    this.canvas = null;
  }
  updateGraph(dt) {
    if (!this.graph) return;
    this.graph.scale(1 / scale, 1 / scale);
    this.graph.drawImage(this.canvas, -1, 0);
    this.graph.scale(scale, scale);

    this.graph.fillStyle = "white";

    this.graph.fillRect(vGraph.width - 1, 0, 2, vGraph.height);

    this.graph.strokeStyle = "#18a0fb";

    this.graph.lineWidth = 1;
    this.graph.beginPath();
    this.graph.moveTo(vGraph.width - 1, this.lasty);
    let newy = (this.voltage / resetVoltage) * vGraph.height;
    if (this.lastFire == dt) newy = 0;
    this.graph.lineTo(vGraph.width, newy);

    this.lasty = newy;
    this.graph.stroke();
  }
  drawGraph() {
    if (!this.canvas) return;
    ctx.drawImage(
      this.canvas,
      this.x + vGraph.width / 2,
      this.y - vGraph.height / 2
    );
  }
  leak() {
    return (-1.0 / resistance) * (this.voltage - restingPotential);
  }
  exp(dt) {
    if (this.lastFire > delay && !this.fired) {
      this.exponential = 1.0;
      this.fired = true;
    }
    this.exponential -= (this.exponential * dt) / timeConstant;
  }
  tick(dt) {
    if (this.lastFire < refractoryPeriod) {
      this.voltage = resetVoltage;
    } else if (this.voltage > this.threshold && this.lastFire > delay) {
      this.fired = false;
      this.lastFire = 0.0;
      this.voltage = resetVoltage; // V_reset
      this.outputs.forEach((o) => o.fire());
    } else {
      let synCurrent = this.inputs
        .map((i) => i.value())
        .reduce((a, b) => a + b, 0);
      let totalCurrent = synCurrent + this.leak();
      let dv = (totalCurrent / capacitance) * dt;
      this.voltage += dv;
    }
    this.lastFire += dt;
    this.updateGraph(dt);
  }
  draw() {
    let unscaled =
      (this.voltage - restingPotential) / (threshold - restingPotential);
    let b = Math.floor(Math.min(Math.max(unscaled, 0), 1) * 255);

    let i = this.sign > 0;
    ctx.fillStyle = `rgb(${i ? 0 : b},0,${i ? b : 0})`;
    ctx.strokeStyle = i ? "#6bafd6" : "#d66b88";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

let timeScale = 0.01;

let neurons = [];
let synapses = [];

let neuron1 = new Neuron(50, 50);
let neuron2 = new Neuron(200, 200);
let conn = new Synapse(neuron1, neuron2);
neuron2.inputs.push(conn);
neuron1.outputs.push(conn);

synapses.push(conn);
neurons.push(neuron1);
neurons.push(neuron2);

let active = neurons[1];

let oldt = null; // real ms

function tick(t) {
  if (!oldt) oldt = t;
  let dt = Math.min((t - oldt) / 1000, 0.02);

  let scaleddt = dt * timeScale; // delta ms

  offset.x += 5 * (~~keysdown[37] - ~~keysdown[39]);
  offset.y += 5 * (~~keysdown[38] - ~~keysdown[40]);

  neurons.forEach((n) => n.tick(scaleddt));

  neurons.forEach((n) => n.exp(scaleddt));

  synapses.forEach((s) => s.tick(scaleddt));

  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.save();
  ctx.translate(offset.x, offset.y);
  for (let s of synapses) {
    s.draw();
  }
  for (let n of neurons) {
    n.draw();
  }

  if (drawingEdge && active && !(active instanceof Synapse)) {
    let below = getBelow() || {};

    ctx.strokeStyle = active.sign > 0 ? "#6bafd6" : "#d66b88";
    ctx.lineWidth = 2;
    drawArrow(active.x, active.y, below.x || mouse.x, below.y || mouse.y);
  }

  neurons.forEach((n) => n.drawGraph());

  if (active) {
    if (active instanceof Synapse) {
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      drawArrow(active.start.x, active.start.y, active.end.x, active.end.y);
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "black";
      ctx.strokeRect(active.x - box, active.y - box, box * 2, box * 2);
    }
  }

  ctx.restore();
  oldt = t;

  window.requestAnimationFrame(tick);
}
window.requestAnimationFrame(tick);

let mouse = { x: 0, y: 0 };
let down = false;
let drawingEdge = false;
c.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  return false;
});

function getBelow() {
  let { x, y } = mouse;
  let below = neurons.find(
    (n) => n.x < x + box && n.x > x - box && n.y < y + box && n.y > y - box
  );
  if (below) return below;
  let belowEdge = synapses.find(
    (s) =>
      distToSegment([x, y], [s.start.x, s.start.y], [s.end.x, s.end.y]) < box &&
      (!drawingEdge || (s.start != active && s.end != active))
  );
  if (belowEdge) return belowEdge;

  return null;
}
let startx = 0;
let starty = 0;
let canchangedraw = false;
c.addEventListener("mousedown", (e) => {
  let x = e.clientX - c.getBoundingClientRect().left - offset.x;
  let y = e.clientY - c.getBoundingClientRect().top - offset.y;
  mouse.x = x;
  mouse.y = y;
  let below = getBelow();

  // What did the user click on
  if (below instanceof Neuron) {
    // User clicked / right-clicked on neuron
    if (e.button == 2) {
      // initiate signal with right click
      if (below.lastFire > delay) {
        below.fired = false;
        below.lastFire = 0.0;
        below.voltage = resetVoltage;
        below.outputs.forEach((o) => o.fire());
      }
    } else {
      if (active && drawingEdge && active instanceof Neuron) {
        if (below != active) {
          // select neuron and make connection
          let conn = new Synapse(active, below);
          synapses.push(conn);
          below.inputs.push(conn);
          active.outputs.push(conn);
        } else {
          canchangedraw = false;
        }

        drawingEdge = false;
      } else {
        // select active neuron
        down = true;
        drawingEdge = e.altKey;
        setActive(below);
      }
    }
  } else if (below instanceof Synapse) {
    // user clicked on a synapse
    if (active && neuromodulation && drawingEdge && active instanceof Neuron) {
      let conn = new Synapse(active, below);
      synapses.push(conn);
      active.outputs.push(conn);
      drawingEdge = false;
    } else {
      setActive(below);
    }
  } else {
    // user clicked on empty space empty, so create a new neuron
    let n = new Neuron(x, y, defaultSign == 1 ? (e.shiftKey ? -1 : 1) : -1);
    neurons.push(n);
    if (active && drawingEdge && !(active instanceof Synapse)) {
      let conn = new Synapse(active, n);
      synapses.push(conn);
      n.inputs.push(conn);
      active.outputs.push(conn);
    } else {
      setActive(n);
    }
    drawingEdge = false;
  }
});

window.addEventListener("mousemove", (e) => {
  let x = Math.min(Math.max(e.pageX - c.offsetLeft, 0), c.width) - offset.x;
  let y = Math.min(Math.max(e.pageY - c.offsetTop, 0), c.height) - offset.y;
  mouse.x = x;
  mouse.y = y;
  if (active && active instanceof Neuron && down && !drawingEdge) {
    active.x = x;
    active.y = y;
  }
});
window.addEventListener("mouseup", (e) => {
  down = false;
  let below = getBelow();
  if (
    !drawingEdge &&
    canchangedraw &&
    active == below &&
    Math.hypot(startx - mouse.x, starty - mouse.y) < 20
  ) {
    drawingEdge = true;
  } else if (
    drawingEdge &&
    active &&
    Math.hypot(startx - mouse.x, starty - mouse.y) > 20
  ) {
    if (below instanceof Neuron) {
      let conn = new Synapse(active, below);
      synapses.push(conn);
      below.inputs.push(conn);
      active.outputs.push(conn);
    } else if (below instanceof Synapse) {
      if (neuromodulation) {
        let conn = new Synapse(active, below);
        synapses.push(conn);
        active.outputs.push(conn);
      }
    } else {
      let n = new Neuron(mouse.x, mouse.y, e.shiftKey ? -1 : 1);
      let conn = new Synapse(active, n);
      neurons.push(n);
      n.inputs.push(conn);
      active.outputs.push(conn);
      synapses.push(conn);
    }
    drawingEdge = false;
  }
});

function setActive(newval) {
  canchangedraw = active == newval;

  active = newval;

  if (active instanceof Neuron) {
    thresholdIn.value =
      (active.threshold - restingPotential) / (threshold - restingPotential);
    graphed.checked = !!active.canvas;
  }
  if (active instanceof Synapse) {
    synpaseStrength.value = active.maxCurrent / maxCurrent;
  }
  if (active) {
    startx = active.x;
    starty = active.y;
    sidebar.className = active instanceof Neuron ? "neuron" : "synapse";
  }
}
function detectEndpoint(s) {
  return (
    s instanceof Neuron ||
    (s.start != active &&
      s.end != active &&
      detectEndpoint(s.start) &&
      detectEndpoint(s.end))
  );
}
let keysdown = {};
c.addEventListener("keydown", (e) => {
  const key = e.keyCode ? e.keyCode : e.which;
  if (!(key in keysdown)) {
    keysdown[key] = true;

    if (key == 27) {
      if (drawingEdge) drawingEdge = false;
      else setActive(null);
      e.preventDefault();
    }
    if (key == 82) {
      offset.x = 0;
      offset.y = 0;
    }
    if (key == 8 && active) {
      e.preventDefault();
      if (active instanceof Synapse) {
        if (active.start.outputs)
          active.start.outputs = active.start.outputs.filter(
            (o) => o != active
          );
        if (active.end.inputs)
          active.end.inputs = active.end.inputs.filter((i) => i != active);
        neurons.forEach((n) => {
          n.outputs = n.outputs.filter((o) => o.end != active);
        });
        synapses = synapses.filter((s) => s != active && s.end != active);
        setActive(null);
      } else {
        neurons = neurons.filter((n) => n != active);

        active.outputs.forEach((n) => {
          if (n.end instanceof Neuron)
            n.end.inputs = n.end.inputs.filter((o) => o.start != active);
        });
        active.inputs.forEach((n) => {
          n.start.outputs = n.start.outputs.filter((o) => o.end != active);
        });

        neurons.forEach((n) => {
          n.outputs = n.outputs.filter((o) => detectEndpoint(o));
        });

        synapses = synapses.filter(
          (s) => detectEndpoint(s) && s.end != active && s.start != active
        );

        setActive(null);
      }
    }
    if (key == 73) {
      console.log(active);
    }
    if (key == 32) {
      console.log(quickEncode());
    }
  }
});

window.addEventListener("keyup", (e) => {
  const key = e.keyCode ? e.keyCode : e.which;
  delete keysdown[key];
});

function dist2(v, w) {
  return (v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2;
}

function distToSegmentSquared(p, v, w) {
  let l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])]);
}

function distToSegment(p, v, w) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

function quickEncode() {
  return [
    JSON.stringify(
      neurons.map((n) => ({
        x: n.x,
        y: n.y,
        id: n.id,
        sign: n.sign,
        thresh: n.threshold,
        graphed: !!n.canvas,
        inputs: n.inputs.map((i) => i.id),
        outputs: n.outputs.map((o) => o.id),
      }))
    ),
    JSON.stringify(
      synapses.map((x) => ({ id: x.id, start: x.start.id, end: x.end.id }))
    ),
  ].join("\n");
}
function quickDecode(str) {
  let a = str.split("\n");
  let lneurons = JSON.parse(a[0]);
  neurons = lneurons.map((n) => new Neuron(n.x, n.y, n.sign, n.id));
  synapses = JSON.parse(a[1]).map(
    (w) =>
      new Synapse(
        neurons.find((n) => n.id == w.start),
        neurons.find((n) => n.id == w.end) || w.end,
        w.id
      )
  );
  synapses.forEach((s) => {
    id = Math.max(id, s.id);
    if (typeof s.end == "number") s.end = synapses.find((w) => w.id == s.end);
  });
  lneurons.forEach((l, i) => {
    id = Math.max(id, l.id);
    neurons[i].threshold = l.thresh;
    if (l.graphed) neurons[i].createGraph();
    neurons[i].outputs = l.outputs.map((o) => synapses.find((w) => w.id == o));
    neurons[i].inputs = l.inputs.map((i) => synapses.find((w) => w.id == i));
  });

  setActive(neurons[0]);
}

synpaseStrength.onchange = () => {
  if (synpaseStrength.value == null) return;
  active.maxCurrent = synpaseStrength.value * maxCurrent;
};

thresholdIn.onchange = () => {
  if (thresholdIn.value == null) return;
  active.threshold =
    restingPotential + +thresholdIn.value * (threshold - restingPotential);
  console.log(`Changed threshold to ${active.threshold}`);
};

graphed.onchange = () => {
  if (graphed.checked) active.createGraph();
  else active.deleteGraph();
};

window.onresize = () => {
  w = window.innerWidth - 240;
  h = window.innerHeight - 40;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  ctx.scale(scale, scale);
};
let modal = document.querySelector(".modal");
document.querySelector("#help").onclick = () => {
  modal.style.display = "block";
};
document.querySelector(".close").onclick = () => {
  modal.style.display = "none";
  c.focus();
};
window.addEventListener("click", (event) => {
  if (event.target == modal) {
    modal.style.display = "none";
    c.focus();
  }
});

blue.onclick = () => {
  defaultSign = 1;
  blue.classList.add("selected");
  red.classList.remove("selected");
};
red.onclick = () => {
  defaultSign = -1;
  red.classList.add("selected");
  blue.classList.remove("selected");
};

document.addEventListener("copy", (e) => {
  e.clipboardData.setData("text/plain", quickEncode());
  e.preventDefault();
});

document.addEventListener("cut", (e) => {
  e.clipboardData.setData("text/plain", quickEncode());
  neurons = [];
  synapses = [];
  id = 0;
  active = null;
  e.preventDefault();
});

document.addEventListener("paste", (e) => {
  if (e.clipboardData.types.includes("text/plain")) {
    const data = e.clipboardData.getData("text/plain");
    try {
      quickDecode(data);
    } catch (e) {
      console.log(data, e);
    }
    e.preventDefault();
  }
});
