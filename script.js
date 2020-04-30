import Stats from "stats.js";

var stats = new Stats();
stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom
stats.dom.style.bottom = 0;
stats.dom.style.top = null;
document.body.appendChild(stats.dom);

const c = document.querySelector("#c");
const ctx = c.getContext("2d");
let w = window.innerWidth - 240;
let h = window.innerHeight - 40;
c.style.width = w + "px";
c.style.height = h + "px";
const scale = window.devicePixelRatio;
c.width = Math.ceil(w * scale);
c.height = Math.ceil(h * scale);
ctx.scale(scale, scale);

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

let signals = [];
let id = 0;

let defaultSign = 1;

let neuromodulation = true;
let hebbian = false;

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
    if (inId == -1) {
      this.id = id;
      id++;
    } else this.id = inId;
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
}

class Signal {
  constructor(start, end) {
    this.start = start;
    this.end = end;
    this.time = 0;
  }
  tick(dt) {
    this.time += dt;
  }
  draw() {
    let x = this.start.x + ((this.end.x - this.start.x) * this.time) / delay;
    let y = this.start.y + ((this.end.y - this.start.y) * this.time) / delay;

    ctx.strokeStyle = "black";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

class Neuron {
  constructor(x, y, sign = defaultSign, inId = -1) {
    this.x = x; // input
    this.y = y; // input
    if (inId == -1) {
      this.id = id;
      id++;
    } else this.id = inId; // input

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

    this.tags = {"all":true};
  }
  createGraph() {
    this.canvas = document.createElement("canvas");
    this.graph = this.canvas.getContext("2d");

    this.canvas.style.width = "80px";
    this.canvas.style.height = "48px";
    this.canvas.width = Math.ceil(80 * scale);
    this.canvas.height = Math.ceil(48 * scale);
    this.graph.scale(scale, scale);
    this.graph.fillStyle = "white";
    this.graph.fillRect(0, 0, 80, 48);
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

    this.graph.fillRect(80 - 1, 0, 2, 48);

    this.graph.strokeStyle = "#18a0fb";

    this.graph.lineWidth = 2;
    this.graph.beginPath();
    this.graph.moveTo(80 - 1, this.lasty);
    let newy = (this.voltage / resetVoltage) * 48;
    if (this.lastFire == dt) newy = 0;
    this.graph.lineTo(80, newy);

    this.lasty = newy;
    this.graph.stroke();
  }
  drawGraph() {
    if (!this.canvas) return;
    ctx.drawImage(this.canvas, this.x - 40, this.y - box - 58);
  }
  leak() {
    return (-1.0 / resistance) * (this.voltage - restingPotential);
  }
  exp(dt) {
    if (this.lastFire > delay && !this.fired) {
      this.exponential = 1.0;
      this.fired = true;

      if (neuromodulation) {
        this.outputs
          .filter((n) => n instanceof Synapse)
          .forEach((n) => {
            n.maxCurrent += maxCurrent * this.sign;
          });
      }

      if (hebbian) {
        for (let i in this.inputs) {
          let input = this.inputs[i];
          let dt = input.start.lastFire - 2 * delay;
          input.maxCurrent *= 1 + 1 / (dt * 1000 + (dt > 0 ? 1 : -1));
        }
      }
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
      this.outputs.forEach((o) => signals.push(new Signal(this, o)));
    } else {
      let synCurrent = this.inputs.length
        ? this.inputs.map((inp) => inp.value()).reduce((a, b) => a + b)
        : 0;
      let totalCurrent = synCurrent + this.leak();
      let dv = (totalCurrent / capacitance) * dt;
      this.voltage += dv;
    }
    this.lastFire += dt;
    this.updateGraph(dt);
    // this.voltage = this.threshold+0.01; // constant output
  }
  drawArrows() {
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.sign > 0 ? "#6bafd6" : "#d66b88";
    this.outputs.forEach((n) => {
      drawArrow(this.x, this.y, n.x, n.y);
    });
  }
  draw() {
    let unscaled =
      (this.voltage - restingPotential) / (threshold - restingPotential);
    let b = Math.floor(Math.min(Math.max(unscaled, 0), 1) * 255);

    let i = this.sign > 0;
    ctx.fillStyle = "rgb(" + (i ? 0 : b) + ",0," + (i ? b : 0) + ")";
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

let neuron1 = new Neuron(50, 50);
let neuron2 = new Neuron(200, 200);
neuron2.inputs.push(new Synapse(neuron1, neuron2));
neuron1.outputs.push(neuron2);

neurons.push(neuron1);
neurons.push(neuron2);

let active = neurons[1];

let oldt = null; // real ms


function tick(t) {
  stats.begin();
  if (!oldt) oldt = t;
  let dt = Math.min((t - oldt) / 1000, 1);

  let scaleddt = dt * timeScale; // delta ms

  //tagging
  let tags = {};
  tags["red"] = document.getElementById("red-toggle").checked;
  tags["green"] = document.getElementById("green-toggle").checked;
  tags["blue"] = document.getElementById("blue-toggle").checked;

  let anytag = false;
  for(let foo of tags){
    if(tags[foo]) anytag = true;
  }
  if(!anytag) tags["all"] = true;

  neurons.forEach((n) => n.tick(scaleddt));

  neurons.forEach((n) => n.exp(scaleddt));

  signals.forEach((s) => s.tick(scaleddt));

  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(0, 0, c.width, c.height);

  neurons.forEach((n) => n.drawArrows());
  for(let n in neurons){
    for(let tag in n.tags){
      if(n.tags[tag]&&tags[tag]){
        n.draw();
        break;
      }
    }
  }
  signals.forEach((s) => s.draw());

  signals = signals.filter((s) => s.time <= delay);

  if (drawingEdge && active && !(active instanceof Synapse)) {
    ctx.strokeStyle = active.sign > 0 ? "#6bafd6" : "#d66b88";
    ctx.lineWidth = 2;
    let below = getBelow() || {};

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

  oldt = t;
  stats.end();
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
  let x = mouse.x;
  let y = mouse.y;
  let below = neurons.find(
    (n) => n.x < x + box && n.x > x - box && n.y < y + box && n.y > y - box
  );
  if (below) return below;
  let belowEdge;
  neurons.some((n) => {
    let out = n.inputs.find(
      (o) =>
        distToSegment([x, y], [o.start.x, o.start.y], [o.end.x, o.end.y]) <
          box &&
        (!drawingEdge || (o.start != active && o.end != active))
    );
    if (out) belowEdge = out;
    return out;
  });
  if (belowEdge) return belowEdge;

  return null;
}
let startx = 0;
let starty = 0;
let canchangedraw = false;
c.addEventListener("mousedown", (e) => {
  let x = e.clientX - c.getBoundingClientRect().left;
  let y = e.clientY - c.getBoundingClientRect().top;
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
        below.outputs.forEach((o) => signals.push(new Signal(below, o)));
      }
    } else {
      if (active && drawingEdge && !(active instanceof Synapse)) {
        if (below != active) {
          // select neuron and make connection
          below.inputs.push(new Synapse(active, below));
          active.outputs.push(below);
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
    if (
      active &&
      neuromodulation &&
      drawingEdge &&
      !(active instanceof Synapse)
    ) {
      active.outputs.push(below);
      drawingEdge = false;
    } else {
      setActive(below);
    }
  } else {
    // user clicked on empty space empty, so create a new neuron
    let n = new Neuron(x, y, defaultSign == 1 ? (e.shiftKey ? -1 : 1) : -1);
    neurons.push(n);
    if (active && drawingEdge && !(active instanceof Synapse)) {
      n.inputs.push(new Synapse(active, n));
      active.outputs.push(n);
    } else {
      setActive(n);
    }
    drawingEdge = false;
  }
});

window.addEventListener("mousemove", (e) => {
  let x = Math.min(Math.max(e.pageX - c.offsetLeft, 0), c.width);
  let y = Math.min(Math.max(e.pageY - c.offsetTop, 0), c.height);
  mouse.x = x;
  mouse.y = y;
  if (active && !(active instanceof Synapse) && down && !drawingEdge) {
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
      below.inputs.push(new Synapse(active, below));
      active.outputs.push(below);
    } else if (below instanceof Synapse) {
      if (neuromodulation) {
        active.outputs.push(below);
      }
    } else {
      let n = new Neuron(mouse.x, mouse.y, e.shiftKey ? -1 : 1);
      neurons.push(n);
      n.inputs.push(new Synapse(active, n));
      active.outputs.push(n);
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
  if (active) {
    startx = active.x;
    starty = active.y;
  }
}
let keysdown = {};
window.addEventListener("keydown", (e) => {
  const key = e.keyCode ? e.keyCode : e.which;
  if (!(key in keysdown)) {
    keysdown[key] = true;

    if (key == 27) {
      if (drawingEdge) drawingEdge = false;
      else setActive(null);
    }
    if (key == 8 && active) {
      if (active instanceof Synapse) {
        active.start.outputs = active.start.outputs.filter(
          (o) => o != active.end
        );
        active.end.inputs = active.end.inputs.filter(
          (i) => i.start != active.start
        );
        neurons.forEach((n) => {
          n.outputs = n.outputs.filter((o) => o != active);
        });
        setActive(null);
      } else {
        neurons = neurons.filter((n) => n != active);
        active.outputs.forEach((n) => {
          if (n.inputs) n.inputs = n.inputs.filter((o) => o.start != active);
        });

        active.inputs.forEach((n) => {
          n.start.outputs = n.start.outputs.filter((o) => o != active);
        });
        neurons.forEach((n) => {
          n.outputs = n.outputs.filter((o) => {
            return (
              !(o instanceof Synapse) || (o.end != active && o.start != active)
            );
          });
        });
        signals = signals.filter((s) => s.end != active && s.start != active);

        setActive(null);
      }
    }
    if (key == 73) {
      console.log(active);
    }
    if (key == 32) {
      console.log(quickEncode());
    }
    if(active){ //tags neuron
      if(key==49){
        active.tags["red"]=active.tags["red"]==false;
      }
      if(key==50){
        active.tags["blue"]=active.tags["blue"]==false;
      }
      if(key==51){
        active.tags["green"]=active.tags["green"]==false;
      }
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
  return (
    JSON.stringify(
      neurons.map((n) => ({
        x: n.x,
        y: n.y,
        id: n.id,
        sign: n.sign,
        thresh: n.threshold,
        inputs: n.inputs.map((i) => i.id),
        outputs: n.outputs.map((o) => o.id),
      }))
    ) +
    "\n" +
    JSON.stringify(
      neurons.flatMap((n) =>
        n.inputs
          .concat(n.outputs)
          .filter((x) => x instanceof Synapse)
          .map((x) => ({ id: x.id, start: x.start.id, end: x.end.id }))
      )
    )
  );
}
function quickDecode(str) {
  let a = str.split("\n");
  let lneurons = JSON.parse(a[0]);
  neurons = lneurons.map((n) => new Neuron(n.x, n.y, n.sign, n.id));
  let wires = JSON.parse(a[1]).map(
    (w) =>
      new Synapse(
        neurons.find((n) => n.id == w.start),
        neurons.find((n) => n.id == w.end),
        w.id
      )
  );
  lneurons.forEach((l, i) => {
    neurons[i].threshold = l.thresh;
    neurons[i].outputs = l.outputs.map((o) => neurons.find((n) => n.id == o));
    neurons[i].inputs = l.inputs.map((i) => wires.find((w) => w.id == i));
  });

  setActive(neurons[0]);
}

const thresholdIn = document.getElementById("threshold");
thresholdIn.onchange = () => {
  if (thresholdIn.value == null) return;

  let ddd = threshold - restingPotential;
  let newT = restingPotential + Number(thresholdIn.value) * ddd;
  active.threshold = newT;
  console.log("Changed threshold to " + newT);
};

const graphed = document.getElementById("graph-toggle");
graphed.onchange = () => {
  if (graphed.checked) active.createGraph();
  else active.deleteGraph();
};

const graphIn = document.getElementById("init-graph");
graphIn.onchange = () => {
  quickDecode(graphIn.value);
};




window.onresize = () => {
  w = window.innerWidth - 240;
  h = window.innerHeight - 40;
  c.style.width = w + "px";
  c.style.height = h + "px";
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
};
window.addEventListener("click", (event) => {
  if (event.target == modal) {
    modal.style.display = "none";
  }
});

let toolbar = document.querySelector(".toolbar");
let blue = toolbar.firstElementChild;
let red = blue.nextElementSibling;
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
