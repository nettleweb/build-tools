#!/bin/env node
import fs from "fs";
import Path from "path";
import zlib from "zlib";
import NettleWeb from "@nettleweb/core";

const baseDir = Path.resolve(Path.dirname(import.meta.dirname));
const config = JSON.parse(fs.readFileSync(Path.join(baseDir, "/config/config.json"), "utf-8"));

config["pages"] = fs.readFileSync(Path.join(baseDir, "/config/pages.html"), "utf-8");

fs.writeFileSync(Path.join(baseDir, "/src/misc/config.ts"), "import { inflateSync } from \"fflate\";\nimport NettleWeb from \"@nettleweb/core\";\n\nexport default Object.freeze(NettleWeb.NTON.decode(inflateSync(NettleWeb.Base64.decode(\n\"" + zlib.deflateRawSync(NettleWeb.NTON.encode(config), {
	level: 9,
	memLevel: 9,
	chunkSize: 65536,
}).toString("base64") + "\"\n))));\n", {
	mode: 0o600,
	flush: true,
	encoding: "utf-8"
});
