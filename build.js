const servor = require("servor");
const { build } = require("esbuild");
const fs = require("fs");
const chokidar = require("chokidar");

function runBuild() {
  build({
    stdio: "inherit",
    entryPoints: ["./script.js"],
    outfile: "dist/script.js",
    sourcemap: "external",
    bundle: true,
  });
}

function copy() {
  if (!fs.existsSync("dist")) fs.mkdirSync("dist");
  fs.copyFile("index.html", "dist/index.html", (err) => {
    if (err) throw err;
    console.log("Wrote to dist/index.html");
  });
}

chokidar.watch("script.js").on("change", runBuild);
chokidar.watch("index.html").on("change", copy);

runBuild();
copy();

servor({
  root: "dist",
  reload: true,
});
