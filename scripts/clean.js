#!/bin/env node
import fs from "fs";
import Path from "path";

const baseDir = Path.resolve(Path.dirname(import.meta.dirname));
const prevDir = Path.resolve(Path.join(baseDir, "/static/d/"));
const indexFile = Path.resolve(Path.join(baseDir, "/games/index.json"));

const list = JSON.parse(fs.readFileSync(indexFile, "utf-8"));
const games = [];
const names = [];

for (let i = 0; i < list.length; i++) {
	const { name, date, type, file } = list[i];

	if (games.indexOf(date, 0) >= 0) {
		list.splice(i--, 1);
		continue;
	}

	names.push(name.replace(/\//g, ""));
	games.push(date);

	if (file.startsWith("/games/")) {
		const path = Path.join("/games/", type, name.toLowerCase().replace(/[^0-9a-z\-]/g, (ch) => {
			switch (ch) {
				case "-":
				case " ":
				case "\t":
				case "\n":
					return "-";
				default:
					return "";
			}
		}).replace(/\-+/g, "-") + (type === "html5" ? "/" : type === "flash" ? ".swf" : type === "dos" ? ".jsdos" : "\0\xaa"));

		const nPath = Path.join(baseDir, path[path.length - 1] === "/" ? path.slice(0, path.length - 1) : path);
		if (file !== path) {
			list[i].file = path;
			fs.renameSync(Path.join(baseDir, file[file.length - 1] === "/" ? file.slice(0, file.length - 1) : file), nPath);
		}
	}
}

for (const file of fs.readdirSync(prevDir, "utf-8")) {
	if (names.indexOf(file.slice(0, file.length - 4)) < 0)
		fs.rmSync(Path.join(prevDir, file), { force: true, recursive: true });
}

fs.writeFileSync(indexFile, JSON.stringify(list.sort((a, b) => {
	a = a.name.trim().toLowerCase();
	b = b.name.trim().toLowerCase();
	return a > b ? 1 : a < b ? -1 : 0;
}), void 0, "\t"), {
	mode: 0o600,
	flush: true,
	encoding: "utf-8"
});
