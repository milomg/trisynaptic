const fs = require("fs");
const execshell = require("exec-sh");
let watching = false;
function build() {
  if (watching) return;
  watching = true;

  execshell("esbuild script.js --outdir=dist --minify --bundle --sourcemap");

  setTimeout(() => {
    watching = false;
  }, 100);
}

let watching2 = false;
function copy() {
  if (watching2) return;
  watching2 = true;

  fs.copyFileSync("index.html", "dist/index.html");
  console.log("Wrote to dist/index.html");

  setTimeout(() => {
    watching2 = false;
  }, 100);
}

fs.watch("script.js", "utf8", build);
fs.watch("index.html", "utf8", copy);

build();
copy();
