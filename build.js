const fs = require("fs");
const execshell = require("exec-sh");
const chokidar = require("chokidar");

function build() {
  execshell("esbuild script.js --outfile=dist/script.js --bundle --sourcemap");
}

function copy() {
  fs.copyFile("index.html", "dist/index.html", (err) => {
    if (err) throw err;
    console.log("Wrote to dist/index.html");
  });
}

chokidar.watch("script.js").on("change", build);
chokidar.watch("index.html").on("change", copy);

build();
copy();
