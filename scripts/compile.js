#!/bin/env node
import fs from "fs";
import Path from "path";
import zlib from "zlib";
import NettleWeb from "@nettleweb/core";

const baseDir = Path.resolve(Path.dirname(import.meta.dirname));
const resDir = Path.resolve(Path.join(baseDir, "/static/"));
const rDir = Path.join(resDir, "/r/");
const list = [];

const smOut = fs.createWriteStream(Path.join(resDir, "sitemap.txt"), {
	mode: 0o600,
	flush: true,
	encoding: "utf-8"
});
const counts = JSON.parse(fs.readFileSync(Path.join(baseDir, "/config/count.txt"), "utf-8"));
const compiled = JSON.parse(fs.readFileSync(Path.join(baseDir, "/games/compiled.json"), "utf-8"));

fs.mkdirSync(rDir, { mode: 0o700, recursive: true });
fs.mkdirSync(Path.join(resDir, "/xr/"), { mode: 0o700, recursive: true });

let chunkIndex = 0;
let chunkBufIndex = 0;

{
	const last = fs.readdirSync(rDir, "utf-8").sort().pop();
	if (last != null) {
		chunkIndex = parseInt(last, 16);

		const size = fs.lstatSync(Path.join(rDir, last), { bigint: false, throwIfNoEntry: true }).size;
		if (size >= 10485760) {
			chunkIndex++;
			chunkBufIndex = 0;
		} else chunkBufIndex = size;
	}
}

for (const { name, type, tags, file, desc, date, user, prev } of JSON.parse(fs.readFileSync(Path.join(baseDir, "/games/index.json"), "utf-8"))) {
	const gid = date.toString(36);
	const game = {
		name: name,
		type: type,
		path: file,
		tags: tags,
		desc: desc,
		date: date,
		user: user,
		prev: prev
	};

	smOut.write("https://nettleweb.com/" + gid + "\n", "utf-8");

	{
		const count = counts[gid];
		if (Number.isSafeInteger(count))
			game["count"] = count;
	}

	if (file.startsWith("https://")) {
		list.push(game);
		continue;
	}

	const path = Path.join(baseDir, file).replace(/\/$/, "");
	if (type === "html5") {
		let url;

		if (fs.lstatSync(path, { bigint: true, throwIfNoEntry: true }).isSymbolicLink()) {
			const target = Path.resolve(fs.readlinkSync(path, "utf-8"));
			if (!fs.existsSync(target) || !target.startsWith(resDir))
				throw new Error("Failed to resolve symbolic link: " + target);

			url = target.substring(resDir.length);
		} else {
			const dest = Path.join(resDir, url = "/xr/" + gid);
			fs.renameSync(path, dest);
			fs.symlinkSync(dest, path, "file");
		}

		game.path = url;
		list.push(game);
		continue;
	}

	{
		const path = compiled[gid];
		if (path != null) {
			game.path = path;
			list.push(game);
			continue;
		}
	}

	const buffer = fs.readFileSync(path);
	const size = buffer.byteLength;

	if ((chunkBufIndex + size) < 10485760) {
		const chunkId = chunkIndex.toString(16).padStart(6, "0");

		fs.appendFileSync(Path.join(rDir, chunkId), buffer, {
			mode: 0o600,
			flush: true
		});

		compiled[gid] = game.path = "!content!" + chunkId + ";" + chunkBufIndex + ";" + (chunkBufIndex += size);
		list.push(game);
		continue;
	}

	let index = 10485760 - chunkBufIndex;
	const data = [];

	{
		const chunkId = chunkIndex.toString(16).padStart(6, "0");

		fs.appendFileSync(Path.join(rDir, chunkId), buffer.subarray(0, index), {
			mode: 0o600,
			flush: true
		});

		data.push(chunkId + ";" + chunkBufIndex + ";10485760");
		chunkBufIndex = 0;
		chunkIndex++;
	}

	while (true) {
		const remaining = size - index;
		const chunkId = chunkIndex.toString(16).padStart(6, "0");

		if (remaining > 10485760) {
			fs.writeFileSync(Path.join(rDir, chunkId), buffer.subarray(index, index += 10485760), {
				mode: 0o600,
				flush: true
			});

			data.push(chunkId + ";0;10485760");
			chunkIndex++;
		} else {
			fs.writeFileSync(Path.join(rDir, chunkId), buffer.subarray(index, size), {
				mode: 0o600,
				flush: true
			});

			data.push(chunkId + ";0;" + remaining);
			chunkBufIndex = remaining;
			break;
		}
	}

	compiled[gid] = game.path = "!content!" + data.join(",");
	list.push(game);
}

fs.writeFileSync(Path.join(baseDir, "/games/compiled.json"), JSON.stringify(compiled, void 0, "\t"), "utf-8");
fs.writeFileSync(Path.join(resDir, "/d/index.json"), zlib.deflateRawSync(NettleWeb.NTON.encode(list), {
	level: 9,
	memLevel: 9,
	chunkSize: 65536
}), {
	mode: 0o644,
	flush: true
});

smOut.write("https://nettleweb.com/videos\n", "utf-8");
smOut.write("https://nettleweb.com/games\n", "utf-8");
smOut.write("https://nettleweb.com/apps\n", "utf-8");
smOut.write("https://nettleweb.com/shop\n", "utf-8");
smOut.end("https://nettleweb.com/\n", "utf-8");
