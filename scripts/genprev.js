#!/bin/env node
import fs from "fs";
import dns from "dns";
import Path from "path";
import puppeteer from "puppeteer";

const baseDir = Path.resolve(Path.dirname(import.meta.dirname));
const resDir = Path.resolve(Path.join(baseDir, "/static/"));
const origin = "http://localhost:8000/"; // can also be "https://whitespider.gq/"

dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1", "1.0.0.1"]);
dns.promises.setDefaultResultOrder("ipv4first");
dns.promises.setServers(["1.1.1.1", "1.0.0.1"]);

try {
	const res = await fetch(origin, { method: "GET" });
	if (!res.ok)
		throw void 0;
} catch (err) {
	throw new Error("Local server is not running");
}

const chrome = await puppeteer.launch({
	pipe: true,
	dumpio: true,
	browser: "chrome",
	channel: "chrome",
	timeout: 10000,
	headless: false,
	userDataDir: Path.join(baseDir, "/local/data/"),
	handleSIGHUP: false,
	handleSIGINT: false,
	handleSIGTERM: false,
	executablePath: Path.join(baseDir, "/local/chrome/chrome"),
	defaultViewport: {
		width: 1280,
		height: 720,
		isMobile: false,
		hasTouch: false,
		isLandscape: true,
		deviceScaleFactor: 1
	},
	args: [
		"--use-angle=vulkan",
		"--enable-unsafe-webgpu",
		"--enable-features=Vulkan",
		"--no-sandbox",
		"--disable-sync",
		"--disable-logging",
		"--disable-breakpad",
		"--disable-infobars",
		"--disable-translate",
		"--disable-extensions",
		"--disable-default-apps",
		"--disable-notifications",
		"--disable-dev-shm-usage",
		"--disable-setuid-sandbox",
		"--window-name=\"\ud800\"",
		"--window-size=1280,720",
		"--window-position=0,0"
	],
	ignoreDefaultArgs: [
		"--mute-audio",
		"--enable-automation"
	]
});

// const counts = JSON.parse(fs.readFileSync(Path.join(baseDir, "/config/count.txt"), "utf-8"));

// for (const { name, type, user, file: source } of JSON.parse(fs.readFileSync(Path.join(baseDir, "/games/index.json"), "utf-8")).sort((a, b) => (counts[b.date.toString(36)] || 0) - (counts[a.date.toString(36)]) || 0)) {

for (const { name, user, date } of JSON.parse(fs.readFileSync(Path.join(baseDir, "/games/index.json"), "utf-8"))) {
	if (typeof user === "undefined")
		continue;

	const file = Path.join(resDir, "/d/" + name.replace(/\//g, "") + ".jpg");
	if (fs.existsSync(file))
		continue;

	const page = await chrome.newPage();
	await page.setBypassCSP(true);
	await page.setCacheEnabled(false);
	await page.setJavaScriptEnabled(true);

	await page.setGeolocation({
		accuracy: 1,
		latitude: 0,
		longitude: 0
	});
	await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", {
		architecture: "",
		bitness: "",
		brands: [],
		fullVersion: "",
		fullVersionList: [],
		mobile: false,
		model: "",
		platform: "",
		platformVersion: "",
		wow64: false
	});
	await page.setViewport({
		width: 800,
		height: 600,
		isMobile: false,
		hasTouch: false,
		isLandscape: true,
		deviceScaleFactor: 1
	});

	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(10000);

	const res = await page.goto(new URL(date.toString(36) + "?hidegui=1", origin).href, {
		referer: "",
		timeout: 15000,
		waitUntil: "load"
	});

	if (res == null)
		throw new Error("Failed to load requested page");

	await new Promise((resolve) => {
		const context = chrome.defaultBrowserContext();
		/**
		 * @param {import("puppeteer").Target} target 
		 */
		const callback = (target) => {
			if (target.type() === "page" && target.opener() == null) {
				target.page().then((p) => {
					if (p != null && p.url().startsWith("chrome")) {
						context.off("targetcreated", callback);
						p.close({ runBeforeUnload: false }).then(resolve);
					}
				});
			}
		};

		context.on("targetcreated", callback);
	});

	await page.screenshot({
		type: "jpeg",
		path: file,
		quality: 90,
		encoding: "binary",
		fullPage: false,
		fromSurface: true,
		omitBackground: true,
		optimizeForSpeed: false,
		captureBeyondViewport: false
	});
	await page.close({ runBeforeUnload: false });
}

await chrome.close();
