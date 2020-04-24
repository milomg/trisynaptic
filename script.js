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

const c2 = document.querySelector("#c2");
const ctx2 = c2.getContext("2d");

c2.style.width = "80px";
c2.style.height = "48px";
c2.width = Math.ceil(80 * scale);
c2.height = Math.ceil(48 * scale);
ctx2.scale(scale, scale);

const restingPotential = -70.0e-3; // mV
const threshold = -55.0e-3; // mV
const resetVoltage = -80.0e-3; // mV

const capacitance = 0.2e-9; // nF
const resistance = 100.0e6; // MΩ

const timeConstant = 2.0e-3; // ms

const maxCurrent = 3.0e-9; // nA

const delay = 5e-3; // ms

const refractoryPeriod = 2.0e-3; // ms;

const radius = 8;
const box = 15;

let signals = [];
let id = 0;

let neuromodulation = true;
let hebbian = false;

function drawArrow(fromx, fromy, tox, toy) {
  const headlen = 10; // length of head in pixels
  const dx = tox - fromx;
  const dy = toy - fromy;
  const len = Math.sqrt(dx ** 2 + dy ** 2);
  const subx = (dx / len) * 15;
  const suby = (dy / len) * 15;
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
  constructor(start, end, in_id = -1) {
    this.start = start;
    this.end = end;
    this.maxCurrent = maxCurrent;
    if (in_id == -1) {
      this.id = id;
      id++;
    } else this.id = in_id;
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
  constructor(x, y, sign = 1.0, in_id = -1) {
    this.x = x; // input
    this.y = y; // input
    if (in_id == -1) {
      this.id = id;
      id++;
    } else this.id = in_id; // input

    this.voltage = resetVoltage;
    this.inputs = []; // input (synapse)
    this.outputs = []; // input (synapse, neuron)
    this.lastFire = Infinity;
    this.exponential = 0.0;
    this.fired = true;
    this.sign = sign;
    this.threshold = threshold;
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

    // this.voltage = this.threshold+0.01; // constant output
  }
  drawArrows() {
    ctx.lineWidth = 1;
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

let timeScale = 0.01;

let neurons = [];

let neuron1 = new Neuron(50, 50);
let neuron2 = new Neuron(50, 320);
neuron2.inputs.push(new Synapse(neuron1, neuron2));
neuron1.outputs.push(neuron2);

neurons.push(neuron1);
neurons.push(neuron2);

let graphFocus = neurons[1];
let lasty = 48;

let active = null;

let oldt = null; // real ms
function tick(t) {
  stats.begin();
  if (!oldt) oldt = t;
  let dt = Math.min((t - oldt) / 1000, 1);

  let scaleddt = dt * timeScale; // delta ms

  neurons.forEach((n) => n.tick(scaleddt));

  neurons.forEach((n) => n.exp(scaleddt));

  signals.forEach((s) => s.tick(scaleddt));

  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(0, 0, c.width, c.height);

  neurons.forEach((n) => n.drawArrows());
  neurons.forEach((n) => n.draw());
  signals.forEach((s) => s.draw());

  signals = signals.filter((s) => s.time <= delay);

  if (!down && active && !(active instanceof Synapse)) {
    ctx.strokeStyle = active.sign > 0 ? "#6bafd6" : "#d66b88";
    ctx.lineWidth = 1;
    let x = mouse.x;
    let y = mouse.y;
    let below =
      neurons.find(
        (n) => n.x < x + box && n.x > x - box && n.y < y + box && n.y > y - box
      ) || {};
    let belowEdge = {};
    if (!below.x && neuromodulation)
      neurons.find((n) => {
        let out = n.inputs.find(
          (o) =>
            distToSegment([x, y], [o.start.x, o.start.y], [o.end.x, o.end.y]) <
            box
        );
        if (out && out.start != active && out.end != active)
          belowEdge = { x: out.x, y: out.y };
        return out;
      });

    drawArrow(
      active.x,
      active.y,
      below.x || belowEdge.x || mouse.x,
      below.y || belowEdge.y || mouse.y
    );
  }

  ctx.lineWidth = 2;
  if (graphFocus) {
    ctx.strokeStyle = "blue";
    ctx.strokeRect(
      graphFocus.x - box + 2,
      graphFocus.y - box + 2,
      box * 2 - 4,
      box * 2 - 4
    );
  }

  if (active) {
    if (active instanceof Synapse) {
      ctx.strokeStyle = active.start.sign > 0 ? "#6bafd6" : "#d66b88";
      ctx.lineWidth = 3;
      drawArrow(active.start.x, active.start.y, active.end.x, active.end.y);
    } else {
      ctx.strokeStyle = "black";
      ctx.strokeRect(active.x - box, active.y - box, box * 2, box * 2);
    }
  }

  ctx2.scale(1 / scale, 1 / scale);
  ctx2.drawImage(c2, -1, 0);
  ctx2.scale(scale, scale);

  ctx2.fillStyle = "white";

  ctx2.fillRect(80 - 1, 0, 2, 48);

  if (graphFocus) {
    ctx2.strokeStyle = "blue";

    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.moveTo(80 - 1, lasty);
    let newy = (graphFocus.voltage / resetVoltage) * 48;
    if (graphFocus.lastFire == scaleddt) newy = 0;
    ctx2.lineTo(80, newy);

    lasty = newy;
    ctx2.stroke();
  }

  oldt = t;
  stats.end();
  window.requestAnimationFrame(tick);
}
window.requestAnimationFrame(tick);

let mouse = { x: 0, y: 0 };
let down = false;
c.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  return false;
});
c.addEventListener("mousedown", (e) => {
  let x = e.clientX - c.getBoundingClientRect().left;
  let y = e.clientY - c.getBoundingClientRect().top;
  mouse.x = x;
  mouse.y = y;
  let below = neurons.find(
    (n) => n.x < x + box && n.x > x - box && n.y < y + box && n.y > y - box
  );

  // clicks on neuron
  if (below) {
    // initiate signal with right click
    if (e.button == 2) {
      if (below.lastFire > delay) {
        below.fired = false;
        below.lastFire = 0.0;
        below.voltage = resetVoltage;
        below.outputs.forEach((o) => signals.push(new Signal(below, o)));
      }
    } else {
      if (active != null && !(active instanceof Synapse)) {
        // select neuron and make connection
        if (below != active) {
          below.inputs.push(new Synapse(active, below));
          active.outputs.push(below);
        }
        active = null;
      } else {
        // select active neuron
        down = true;
        active = below;
      }
    }
  } else {
    // not to existing neuron
    let belowEdge;
    neurons.find((n) => {
      let out = n.inputs.find(
        (o) =>
          distToSegment([x, y], [o.start.x, o.start.y], [o.end.x, o.end.y]) <
          box
      );
      let out2 = n.outputs.find((o) => o.end);
      if (out) belowEdge = out;
      return out;
    });
    if (belowEdge) {
      // neuromodulation
      if (
        active &&
        neuromodulation &&
        !(active instanceof Synapse) &&
        belowEdge.start != active &&
        belowEdge.end != active
      ) {
        active.outputs.push(belowEdge);
        active = null;
      } else {
        active = belowEdge;
      }
    } else {
      // new neuron
      let n = new Neuron(x, y, e.shiftKey ? -1 : 1);
      neurons.push(n);
      if (active && !(active instanceof Synapse)) {
        n.inputs.push(new Synapse(active, n));
        active.outputs.push(n);
      }
      active = null;
    }
  }
});

let movedx = 0;
let movedy = 0;
window.addEventListener("mousemove", (e) => {
  let x = Math.min(Math.max(e.pageX - c.offsetLeft, 0), c.width);
  let y = Math.min(Math.max(e.pageY - c.offsetTop, 0), c.height);
  mouse.x = x;
  mouse.y = y;
  if (active && !(active instanceof Synapse) && down) {
    movedx += active.x - x;
    movedy += active.y - y;
    active.x = x;
    active.y = y;
  }
});
window.addEventListener("mouseup", (e) => {
  down = false;
  if (Math.abs(movedx) > 20 || Math.abs(movedy) > 20) {
    active = null;
    movedx = 0;
    movedy = 0;
  }
});

let keysdown = {};
window.addEventListener("keydown", (e) => {
  const key = e.keyCode ? e.keyCode : e.which;
  if (!(key in keysdown)) {
    keysdown[key] = true;

    if (key == 27) active = null;
    if (key == 8 && active) {
      if (active instanceof Synapse) {
        active.start.outputs = active.start.outputs.filter(
          (o) => o != active.end
        );
        active.end.inputs = active.end.inputs.filter(
          (i) => i.start != active.start
        );
        active = null;
      } else {
        neurons = neurons.filter((n) => n != active);
        active.outputs.forEach((n) => {
          if (n.inputs) n.inputs = n.inputs.filter((o) => o.start != active);
        });

        active.inputs.forEach(
          (n) => (n.start.outputs = n.start.outputs.filter((o) => o != active))
        );
        signals = signals.filter((s) => s.end != active && s.start != active);
        if (graphFocus == active) graphFocus = null;
        active = null;
      }
    }
    if (key == 73) {
      console.log(active);
    }
    if (key == 32) {
      graphFocus = active;
      threshold_in.value =
        (graphFocus.threshold - restingPotential) /
        (threshold - restingPotential);
      ctx2.clearRect(0, 0, 40, 80);
      // console.log(graphFocus);
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
  // active = null;
  graphFocus = neurons[0];
}

const threshold_in = document.getElementById("threshold");
const graph_in = document.getElementById("init_graph");

threshold_in.onchange = () => {
  if (threshold_in.value == null) return;

  let ddd = threshold - restingPotential;
  let newT = restingPotential + Number(threshold_in.value) * ddd;
  graphFocus.threshold = newT;
  console.log("Changed threshold to " + newT);
};
graph_in.onchange = () => {
  quickDecode(graph_in.value);
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
let help = document.querySelector("#help");
let span = document.querySelector(".close");
help.onclick = () => {
  modal.style.display = "block";
};
span.onclick = () => {
  modal.style.display = "none";
};
window.onclick = (event) => {
  if (event.target == modal) {
    modal.style.display = "none";
  }
};
