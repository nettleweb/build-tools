import * as firebase from "firebase/app";
import * as _analytics from "firebase/analytics";
import * as emoji from "emoji-picker-element";
import NettleWeb from "@nettleweb/core";
import { generate } from "lean-qr";
import config from "./misc/config";
import __host from "./misc/host";
import _logger from "./misc/misc";
import { inflateSync } from "fflate";
import sstub from "./misc/sstub";
import { Socket, SocketOptions } from "engine.io-client";

"use strict"; debugger; (async ({ window: win, document: doc }: {
	readonly window: Window;
	readonly document: Document;
}) => {
	function $(id: string): HTMLElement {
		const e = doc.getElementById(id);
		if (e != null)
			return e;

		throw new Error("Cannot access element: " + id);
	}

	function q(q: string): HTMLElement {
		const e = doc.querySelector<HTMLElement>(q);
		if (e != null)
			return e;

		throw new Error("Cannot access element selector: " + q);
	}

	function error(message: string | nul) {
		if (message != null) {
			errEl.textContent = message;
			errEl.style.display = "block";
		} else errEl.style.display = "none";
	}

	function optURL(s: string): URL | null {
		try {
			return new URL(s);
		} catch (err) {
			return null;
		}
	}

	function shuffle<E extends ListLike<any>>(list: E): E {
		for (let i = list.length - 1; i >= 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		return list;
	}

	function proxyURL(url: string): string {
		return "https://" + config.b + "/" + config.c + "?OO0O0OO0=" + encodeURIComponent(NettleWeb.Base64.encode(NettleWeb.UTF_8.encode(url)));
	}

	function dateToStr(date: number): string {
		return new Date(date).toLocaleString("POSIX", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false
		});
	}

	function escapeHTML(text: string): string {
		return text.replace(/[&<"']/g, (ch) => {
			switch (ch) {
				case "&":
					return "&amp;";
				case "<":
					return "&lt;";
				case ">":
					return "&gt;";
				case "\"":
					return "&quot;";
				default:
					return "";
			}
		});
	}

	async function optGetText(url: string, cache?: RequestCache | nul): Promise<string | null> {
		try {
			const res = await win.fetch(url, {
				cache: cache || "force-cache",
				method: "GET"
			});
			return res.ok ? await res.text() : null;
		} catch (err) {
			return null;
		}
	}

	async function resizeImage(blob: Blob, width: number, height?: number | nul): Promise<Blob | null> {
		try {
			const img = new Image(512, 512);
			img.loading = "eager";
			img.decoding = "sync";
			img.draggable = false;

			{
				const url = URL.createObjectURL(blob);
				img.src = url;
				await img.decode();
				URL.revokeObjectURL(url);
			}

			let nw: number = img.naturalWidth;
			let nh: number = img.naturalHeight;

			{
				const ratio = height == null ? nh / nw : height / width;
				if (nh >= (nw * ratio))
					nh = Math.floor(nw * ratio);
				else
					nw = Math.floor(nh / ratio);
			}

			if ((width = Math.min(width, nw)) < 10 || (height = height == null ? nh : Math.min(height, nh)) < 10)
				throw new Error("Image must have at least 100 pixels.");

			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext("2d", { alpha: false });

			if (context == null)
				throw new Error("Failed to initialize canvas context.");

			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = "high";
			context.drawImage(img, 0, 0, nw, nh, 0, 0, width, height);

			return await canvas.convertToBlob({
				type: "image/jpeg",
				quality: 100
			});
		} catch (err) {
			console.error("Image resize error: ", err);
			return null;
		}
	}

	async function fetchGameContent(path: string): Promise<ArrayBuffer> {
		let index: number = 0;
		let length: number = 0;

		const entries: {
			readonly id: string;
			readonly s: number;
			readonly e: number;
			readonly l: number;
		}[] = [];

		for (const it of path.split(",")) {
			const parts = it.split(";", 3);
			if (parts.length !== 3)
				throw new Error("Invalid entry value");

			const start = parseInt(parts[1], 10);
			const end = parseInt(parts[2], 10);
			const len = end - start;

			if (start < 0 || end < 0 || len <= 0)
				throw new Error("Invalid entry data length");

			length += len;
			entries.push({ id: parts[0], s: start, e: end, l: len });
		}

		const buffer = new Uint8Array(new ArrayBuffer(length), 0, length);

		for (const { id, s, e, l } of entries) {
			const res = await win.fetch("/r/" + id, {
				cache: "force-cache",
				method: "GET",
				headers: {
					"Range": "bytes=" + s + "-" + (e - 1)
				}
			});

			if (!res.ok)
				throw new Error("Failed to fetch resources: Remote returned error status code: " + res.status);
			if (res.status !== 206 || !res.headers.has("content-range"))
				buffer.set(new Uint8Array(await res.arrayBuffer(), s, l), index);
			else
				buffer.set(new Uint8Array(await res.arrayBuffer(), 0, l), index);

			index += l;
		}

		return buffer.buffer;
	}

	function fetchSIO(path: SIOPath, data?: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const buf = new ArrayBuffer((data = NettleWeb.NTON.encode(data)).byteLength + 10);
			const now = performance.now();

			{
				const view = new Uint8Array(buf);
				view[0] = 3;
				view[9] = path;
				view.set(data, 10);
			}

			new DataView(buf, 1, 8).setFloat64(0, now, true);
			socket.send(buf, { compress: true });
			sioreq.set(now, [resolve, reject]);
		});
	}

	function initStorage(): AbstractStorage {
		try {
			const { localStorage: ls } = win;
			if (ls == null)
				throw new Error("Storage interface not available.");

			const key = "___whitespider___";
			const val = Date.now().toString(36);

			ls.setItem(key, val);
			if (ls.getItem(key) !== val)
				throw new Error("Storage test failed: value mismatch");

			return ls;
		} catch (err) {
			return sstub;
		}
	}

	function createFrame(url: string) {
		frame.appendChild(createFrameElement(url));
		frameView.style.display = "block";
	}

	function createPRQEmbed(url: string) {
		const prq = (winTop || win).PaymentRequest;
		if (typeof prq !== "function") {
			error("Error: Your browser does not support this feature.");
			return;
		}

		new prq([
			{
				data: [url],
				supportedMethods: Constants.origin + "/res/pay.json",
			}
		], {
			id: "nettleweb_premium",
			total: {
				label: "Premium",
				amount: {
					value: "200",
					currency: "USD"
				},
				pending: true
			},
			modifiers: [],
			displayItems: []
		}).show();
	}

	function createGameFrame(type: string, buffer: ArrayBuffer | any[]): HTMLElement {
		const sid = performance.now().toString(36);

		const e = doc.createElement("embed");
		e.src = "/player.html?s=" + sid;
		e.type = "text/html";
		e.width = "1024";
		e.height = "768";

		const cb = (e: MessageEvent) => {
			if (e.origin === win.origin && e.data === sid) {
				const source = e.source;
				if (source != null) {
					source.postMessage({
						id: type,
						buf: buffer
					}, {
						targetOrigin: origin,
						transfer: Array.isArray(buffer) ? [] : [buffer]
					});
				}
				win.removeEventListener("message", cb);
			}
		};
		win.addEventListener("message", cb, { passive: true });

		return e;
	}

	function createGameElement(game: GameInfo): HTMLElement {
		const { name, prev, date } = game;
		const elem = doc.createElement("a");
		elem.href = date > 0 ? "/" + date.toString(36) : "#";
		elem.title = "Play " + name;
		elem.target = "_self";
		elem.className = "game";

		elem.onclick = (e) => {
			if (!e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();
				playGame(game).catch((err) => {
					consoleLog(err);
					error("Failed to launch game. Message: " + err);
				});
			}
		};

		if (prev != null)
			elem.style.backgroundImage = "url(\"" + prev + "\"), url(\"/res/preview.svg\")";
		else
			elem.style.backgroundImage = "url(\"/d/" + encodeURIComponent(name.replace(/\//g, "")) + ".jpg\"), url(\"/res/preview.svg\")";

		{
			const e = doc.createElement("div");
			e.textContent = name;
			elem.appendChild(e);
		}

		if (game.path.startsWith("https://")) {
			const e = doc.createElement("img");
			e.src = "/res/cloud.svg";
			e.alt = "Cloud";
			e.title = "Embedded from third-party servers";
			e.width = 24;
			e.height = 24;
			e.loading = "lazy";
			e.decoding = "async";
			e.draggable = false;
			elem.appendChild(e);
		}

		switch (game.type) {
			case "html5":
				{
					const e = doc.createElement("span");
					e.textContent = "HTML5";
					e.style.background = "#c04000";
					elem.appendChild(e);
				}
				break;
			case "flash":
				{
					const e = doc.createElement("span");
					e.textContent = "Flash";
					e.style.background = "#008000";
					elem.appendChild(e);
				}
				break;
			case "dos":
				{
					const e = doc.createElement("span");
					e.textContent = "Dos";
					e.style.background = "#0000ff";
					elem.appendChild(e);
				}
				break;
			default:
				elem.style.backgroundImage = "url(\"/res/preview.svg\")";
				break;
		}

		return elem;
	}

	function createItemElement(item: ItemInfo): HTMLElement {
		const elem = doc.createElement("div");
		elem.className = "item";
		elem.onclick = () => {
			openItem(item).catch((err) => {
				error("Failed to open the item. Message: " + err);
			});
		};

		elem.style.backgroundImage = "url(\"" + proxyURL(item.prev[0]) + "\"), url(\"/res/preview.svg\")";

		{
			const e = doc.createElement("div");
			e.textContent = item.name;
			elem.appendChild(e);
		}
		{
			const e = doc.createElement("span");
			e.textContent = "$" + item.price.toFixed(2);
			elem.appendChild(e);
		}

		return elem;
	}

	function createFrameElement(url: string): HTMLElement {
		if (url.startsWith("https://")) {
			const e = doc.createElement("iframe");
			e.setAttribute("name", "Frame");
			e.setAttribute("width", "1024");
			e.setAttribute("height", "768");
			e.setAttribute("loading", "lazy");
			e.setAttribute("sandbox", "allow-forms allow-popups allow-scripts allow-same-origin allow-pointer-lock");
			e.setAttribute("scrolling", "no");
			e.setAttribute("frameborder", "0");
			e.setAttribute("credentialless", "true");
			e.setAttribute("referrerpolicy", "no-referrer");
			e.setAttribute("allowfullscreen", "true");
			e.setAttribute("allowpaymentrequest", "true");

			{
				const src = "data:application/xhtml+xml;base64," + NettleWeb.Base64.encode(NettleWeb.UTF_8.encode(`<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="referrer" content="no-referrer" />
		<meta name="viewport" content="width=device-width,initial-scale=1" />
		<base href="${origin}" target="_blank" />
		<link rel="icon" type="image/x-icon" href="res/google.ico" />
		<link rel="stylesheet" type="text/css" href="data:text/css;base64,Ym9keSxlbWJlZCxpZnJhbWV7cG9zaXRpb246YWJzb2x1dGU7ZGlzcGxheTpibG9jazt3aWR0aDoxMDAlO2hlaWdodDoxMDAlO21hcmdpbjowcHg7cGFkZGluZzowcHg7Ym9yZGVyOm5vbmU7b3ZlcmZsb3c6aGlkZGVuO30K" />
		<title>Google</title>
	</head>
	<body>
		<embed type="text/plain" width="1024" height="768" src="${escapeHTML(url)}" />
	</body>
</html>`));

				e.addEventListener("load", () => {
					const win = e.contentWindow;
					if (win != null) {
						win.stop();
						win.focus();
						win.location.replace(src);
					} else e.setAttribute("src", src); // fallback
				}, { once: true, passive: true });

				frames.set(e, url);
			}

			return e;
		} else {
			const e = doc.createElement("embed");
			e.setAttribute("type", "text/plain");
			e.setAttribute("width", "1024");
			e.setAttribute("height", "768");
			e.setAttribute("src", url);
			return e;
		}
	}

	function restoreRootPath() {
		unblEndSes = null;
		if (!cloaking)
			doc.title = "NettleWeb";

		his.replaceState(void 0, "", "/");
	}

	function openPopupWindow(url: string) {
		const window = win.open(void 0, "_blank", "");
		if (window == null) {
			error("Please allow popups in your browser settings and try again.");
			return;
		}

		window.stop();
		window.focus();

		setTimeout(() => {
			window.location.replace(url);
		}, 100);
	}

	function openInNewWindow(elem: Element) {
		const window = win.open(void 0, "_blank", "");
		if (window == null) {
			error("Please allow popups in your browser settings and try again.");
			return;
		}
		// window.stop();
		window.focus();

		const document = window.document;
		document.head.innerHTML = "<meta charset=\"utf-8\" /><meta name=\"referrer\" content=\"no-referrer\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><base href=\"" + win.origin + "\" target=\"_blank\" /><link rel=\"icon\" type=\"image/x-icon\" href=\"res/google.ico\" /><link rel=\"stylesheet\" type=\"text/css\" href=\"data:text/css;base64,Ym9keSxlbWJlZCxpZnJhbWV7cG9zaXRpb246YWJzb2x1dGU7ZGlzcGxheTpibG9jazt3aWR0aDoxMDAlO2hlaWdodDoxMDAlO21hcmdpbjowcHg7cGFkZGluZzowcHg7Ym9yZGVyOm5vbmU7b3ZlcmZsb3c6aGlkZGVuO30K\"/>";
		document.body.appendChild(elem);
		document.title = "Google";
	}

	function injectAnchorFrame() {
		const e = doc.createElement("iframe");
		e.setAttribute("id", "anchor");
		e.setAttribute("name", "API Anchor");
		e.setAttribute("width", "1024");
		e.setAttribute("height", "768");
		e.setAttribute("loading", "lazy");
		e.setAttribute("scrolling", "no");
		e.setAttribute("frameborder", "0");
		e.setAttribute("credentialless", "true");
		e.setAttribute("referrerpolicy", "no-referrer");
		e.setAttribute("allowfullscreen", "true");
		e.setAttribute("allowpaymentrequest", "true");

		e.addEventListener("load", () => {
			const win = e.contentWindow;
			if (win != null) {
				win.stop();
				win.focus();
				win.location.replace(Constants.origin + "/?m=1");
			} else e.setAttribute("src", Constants.origin + "/?m=1");
		}, { once: true, passive: true });

		docBody.appendChild(e);
	}

	if (doc.readyState !== "complete") {
		await new Promise<void>((resolve) => {
			const callback = () => {
				if (doc.readyState === "complete") {
					doc.removeEventListener("readystatechange", callback);
					setTimeout(resolve, 100, null);
				}
			};
			doc.addEventListener("readystatechange", callback, { passive: true });
		});
	}

	doc.title = "NettleWeb";
	_logger["_"](win);
	win.focus();

	win.onerror = (_, file, line, col, err) => {
		const msg = "Unhandled error at " + (file || "unknown source") + " " + (line || "X") + ":" + (col || "X") + "\n\n Message: " + String(err);
		console.error(msg, err);
		errEl.textContent = msg;
		errEl.style.display = "block";
	};
	win.onkeydown = (e) => {
		if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
			switch (e.key) {
				case "h":
				case "q":
					e.preventDefault();
					e.stopPropagation();
					loc.replace("https://www.google.com/webhp?igu=1");
					break;
				case "b":
					e.preventDefault();
					e.stopPropagation();
					if (docBody.hasAttribute("style"))
						docBody.removeAttribute("style");
					else
						docBody.setAttribute("style", "filter: blur(15px);");
					break;
				default:
					break;
			}
		}
	};
	win.onpopstate = (e) => {
		e.preventDefault();
		e.stopPropagation();
		error("Notice: Please press ctrl+Q to leave this website.");
	};
	win.onappinstalled = (e) => {
		e.preventDefault();
		e.stopPropagation();
		install.style.display = "none";
	};
	win.onbeforeinstallprompt = (e) => {
		e.preventDefault();
		e.stopPropagation();

		install.style.display = "block";
		install.onclick = () => {
			e.prompt().catch((err) => {
				error("Failed to show install prompt. Message: " + String(err));
			});
		};
	};

	const loc = win.location;
	const his = win.history;
	const path = loc.pathname;
	const search = new URLSearchParams(loc.search);
	const docHead = doc.head;
	const docBody = doc.body;
	const consoleLog = _logger["$"];

	const errEl = $("error");
	const frame = $("frame");
	const frameView = $("frame-view");
	const status = $("status");
	const install = $("install");
	const content = $("content");
	const accnBtn = $("accn-btn");
	const strmBtn = $("strm-btn") as HTMLButtonElement;
	const commBtn = $("comm-btn");
	const nmsgBtn = $("nmsg-btn") as HTMLButtonElement;
	const sideMenu = $("side-menu") as HTMLInputElement;

	{
		const {
			_a,
			_b,
			_c,
			_d,
			_e,
			_f,
			_g,
			_h,
			_i,
			_j,
			_k,
			_l,
			_m,
			_n,
			_o,
			_v,
			_w,
			_p,
			_q,
			_r
		} = config;

		if ((() => {
			consoleLog(_a, _b);
			const url = new URL(loc.href);
			const host = url.hostname;
			const origin = url.origin;

			switch (url.protocol) {
				case "http:":
					if (host !== "localhost") {
						url.protocol = "https:";
						loc.replace(url.href);
						return false;
					}
					break;
				case "https:":
					break;
				default:
					return true;
			}

			switch (host) {
				case "whitespider.cf":
				case "whitespider.tk":
				case "whitespider.dev":
				case "whitespider.web.app":
				case "whitespider.pages.dev":
				case "whitespider.firebaseapp.com":
					url.host = Constants.domain;
					url.hash = "";
					url.search = "";
					url.pathname = "/";
					loc.replace(url.href);
					return false;
				default:
					break;
			}

			{
				const e: any = (doc as any)[_o](_h);
				if (e == null || e[_j](_i) !== _l)
					return true;
			}

			for (const e of (doc as any)[_m](_n)) {
				switch (e[_j]("type") || "") {
					case "":
					case "text/javascript":
					case "application/javascript":
						break;
					default:
						e.remove();
						return true;
				}

				const src = e[_j]("src");
				if (!src || e.textContent) {
					e.remove();
					return true;
				}

				const url = new URL(src.startsWith("//") ? "https:" + src : src, origin);
				if (url.origin !== origin) {
					if (url.protocol === "https:") {
						const parts = url.host.split(".");
						const length = parts.length;
						if (parts[length - 1] === "com") {
							const dom = parts[length - 2];
							if (dom.indexOf("google") >= 0 || dom.indexOf("firebase") >= 0)
								continue;
						}
					}

					e.remove();
					return true;
				}
			}

			return (q("link[rel=\"canonical\"]") as any)[_j]("href").slice(0, _c) !== _f ||
				(doc as any)[_o](_p) == null ||
				(doc as any)[_o](_q) == null ||
				(doc as any)[_r] !== _a.slice(2, 11);
		})()) {
			consoleLog(_e, _k);

			const nDoc = new DOMParser().parseFromString(_v, "application/xhtml+xml");
			nDoc.title = _g;

			const body = nDoc.body;
			body.innerHTML = _d;

			{
				const e = nDoc.createElement("button");
				e.innerHTML = _w;
				e.setAttribute("type", "button");
				e.addEventListener("click", () => {
					loc.replace(_f);
				}, { passive: true });
				body.appendChild(e);
			}

			doc.documentElement.replaceWith(nDoc.documentElement);
			return;
		}

		for (const k of Object.getOwnPropertyNames(config)) {
			if (k.length === 2)
				delete config[k];
		}
	}

	{
		// chrome blocks all cookies in data urls, reopen it in a new tab to fix this
		if (win !== win.top) {
			if (loc.ancestorOrigins?.item(0) === "null") {
				const elem = doc.createElement("div");
				elem.style.padding = "15px";
				elem.textContent = "Click here to continue";
				elem.onclick = () => {
					const e = doc.createElement("embed");
					e.type = "text/plain";
					e.width = "1280";
					e.height = "720";
					e.src = Constants.rootI;
					openInNewWindow(e);
				};
				docBody.innerHTML = "";
				docBody.appendChild(elem);
				return;
			}
			if (loc.origin !== Constants.origin) {
				loc.replace(Constants.rootI);
				return;
			}
		}
	}

	_analytics.getAnalytics(firebase.initializeApp({
		appId: "1:176227430389:web:94270de43b7eb971c03abc",
		apiKey: "AIzaSyCPXTy7dt3fpcLd8kVTBtXy0xuBdeuhbFc",
		projectId: "whitespider",
		authDomain: "whitespider.firebaseapp.com",
		databaseURL: "https://whitespider-default-rtdb.firebaseio.com",
		storageBucket: "whitespider.appspot.com",
		measurementId: "G-F72WBJT57S",
		messagingSenderId: "176227430389"
	}, "NettleWeb"));

	const mirror = win !== win.top && win.origin !== Constants.origin;
	const frames = new WeakMap<Element, string>();
	const sioreq = new Map<number, Function[]>();
	const localStorage = initStorage();

	let user: string | nul;
	let myuid: string | nul;
	let socket: Socket;
	let server: string | nul;
	let winTop: Window | nul;
	let cloaking: boolean;
	let gameList: GameList;
	let itemList: ItemList = [];
	let itemLock: Promise<void>;
	let unblEndSes: (() => void) | null = null;
	let loadAccnInfo: () => void;

	// lateinit functions
	let openChat: (info: UserInfo) => Promise<void>;
	let openItem: (item: ItemInfo) => Promise<void>;
	let playGame: (game: GameInfo) => Promise<void>;
	let openProfile: (uid: string) => Promise<void>;
	let openChannel: (chId: string) => Promise<void>;

	// socket message callback
	let onLogin: (() => void) | null = null;
	let onLoginError: ((msg: string) => void) | null = null;
	let onGPTResponse: ((msg: string) => void) | null = null;
	let onGPTResError: ((err: string) => void) | null = null;
	let onCommentCreate: ((id: number, msg: Message) => void) | null = null;
	let onCommentUpdate: ((id: number, msg: string, text: string) => void) | null = null;
	let onMessageCreate: ((ch: string, msg: Message) => void) | null = null;
	let onMessageDelete: ((ch: string, msg: string) => void) | null = null;
	let onMessageUpdate: ((ch: string, msg: string, text: string) => void) | null = null;

	if ((win.isSecureContext ?? loc.protocol === "https:")) {
		if (localStorage !== sstub) {
			try {
				const manifest = await optGetText("/manifest.json", "no-cache");
				if (manifest != null) {
					const version = JSON.parse(manifest).version;
					if (version !== localStorage.getItem("__mf_version")) {
						docBody.innerHTML = "Updating contents...";
						for (const key of await caches.keys())
							await caches.delete(key);

						localStorage.setItem("__mf_version", version);
						loc.reload();
						return;
					}
					$("version").textContent = "v" + version;
				}
				user = localStorage.getItem("__secrets_") || void 0;
			} catch (err) {
				// ignore
			}
		} else error("Warning: Cookies are blocked by your browser. Some features might not work properly, and your game data will NOT be saved.");

		try {
			const nsw = win.navigator.serviceWorker;
			if (nsw != null) { // This property is undefined in Firefox private tab
				await nsw.register("/sw.js", {
					type: "classic",
					scope: "/",
					updateViaCache: "none"
				});
				await nsw.ready;
			}
		} catch (err) { // ignore
		}
	}

	try {
		const res = await win.fetch("/d/index.json", {
			mode: "same-origin",
			cache: "no-cache",
			method: "GET"
		});
		if (!res.ok)
			throw new Error("Remote returned error status code: " + res.status);

		gameList = NettleWeb.NTON.decode(inflateSync(new Uint8Array(await res.arrayBuffer())));
	} catch (err) {
		error("Failed to initialize local game list. Message: " + String(err));
		return;
	}

	// {
	// 	const n = win.Notification;
	// 	if (n != null) {
	// 		let p = n.permission;
	// 		while (p === "default")
	// 			p = await n.requestPermission();

	// 		if (p === "denied")
	// 			error("Error: Permission denied. Certain features might not behave as expected.");
	// 	}
	// }

	try {
		const top = win.top;
		if (top != null)
			winTop = top === win ? win : top.origin === win.origin ? top : null;
	} catch (err) {
		// ignore
	}

	errEl.onclick = () => {
		errEl.innerHTML = "";
		errEl.style.display = "none";
	};

	$("frame-close").onclick = () => {
		frame.innerHTML = "";
		frameView.style.display = "none";
	};
	$("frame-expand").onclick = (e) => {
		if (doc.fullscreenEnabled && !e.ctrlKey) {
			frame.requestFullscreen({ navigationUI: "hide" }).catch((err) => {
				error("Failed to enter fullscreen mode. Message: " + String(err));
			});
		} else {
			const elem = frame.firstElementChild;
			if (elem != null) {
				const url = frames.get(elem) || "";
				if (url.startsWith("https://"))
					openInNewWindow(createFrameElement(url));
			}
			frame.innerHTML = "";
			frameView.style.display = "none";
		}
	};

	$("content-page").outerHTML = config.pages;

	{
		const faviconElem = q("link[rel*='icon']") as HTMLLinkElement;
		const overlay = $("overlay");
		const notice = $("notice");
		const theme = $("theme") as HTMLSelectElement;
		const image = $("image") as HTMLInputElement;
		const font = $("font") as HTMLSelectElement;
		const burl = $("backend-url") as HTMLInputElement;
		const tabc = $("tab-cloaking") as HTMLSelectElement;
		const sm = $("stealth-mode") as HTMLSelectElement;

		const options: SocketOptions = {
			path: "/K7e8UQ1JqnTj/",
			secure: true,
			upgrade: true,
			protocols: [],
			transports: ["polling", "websocket"],
			timestampParam: "x",
			timestampRequests: true,
			rejectUnauthorized: true,
			closeOnBeforeunload: true
		};

		let themeCSS: HTMLLinkElement | undefined;

		function createSocket(server: string) {
			socket = new Socket(server, options);
			status.innerHTML = "Connecting...";
			status.style.color = "#808000";

			socket.on("open", () => {
				status.title = "";
				status.innerHTML = "\u2713Connected";
				status.style.color = "#008000";
			});
			socket.on("close", (msg) => {
				status.title = msg;
				status.innerHTML = "\u2715Disconnected";
				status.style.color = "#ff0000";

				// reject all pending api requests
				for (const [, err] of sioreq.values())
					err("API socket connection closed");

				// attempt to reconnect after 5 seconds
				setTimeout(() => {
					createSocket(server);
				}, 5000);
			});
			socket.on("message", (data: ArrayBuffer) => {
				const buf = new Uint8Array(data, 0, data.byteLength);
				switch (buf[0]) {
					case 1: // login response
						if (typeof myuid !== "string")
							myuid = NettleWeb.UTF_8.decode(buf.subarray(1));
						if (onLogin != null)
							onLogin();
						break;
					case 2: // login error
						if (onLoginError != null)
							onLoginError(NettleWeb.UTF_8.decode(buf.subarray(1)));
						break;
					case 3: // annoncement
						if (buf.byteLength > 1) {
							notice.textContent = NettleWeb.UTF_8.decode(buf.subarray(1));
							notice.style.display = "block";
						}
						break;
					case 4: // notification
						nmsgBtn.setAttribute("data-unread", "");
						break;
					case 5: // comment create
						if (onCommentCreate != null) {
							const data = JSON.parse(NettleWeb.UTF_8.decode(buf.subarray(1)));
							onCommentCreate(data[0], data[1]);
						}
						break;
					case 6: // comment update
						if (onCommentUpdate != null) {
							const data = JSON.parse(NettleWeb.UTF_8.decode(buf.subarray(1)));
							onCommentUpdate(data[0], data[1], data[2]);
						}
						break;
					case 7: // message create
						if (onMessageCreate != null) {
							const data = JSON.parse(NettleWeb.UTF_8.decode(buf.subarray(1)));
							onMessageCreate(data[0], data[1]);
						}
						break;
					case 8: // message delete
						if (onMessageDelete != null) {
							const data = JSON.parse(NettleWeb.UTF_8.decode(buf.subarray(1)));
							onMessageDelete(data[0], data[1]);
						}
						break;
					case 9: // message update
						if (onMessageUpdate != null) {
							const data = JSON.parse(NettleWeb.UTF_8.decode(buf.subarray(1)));
							onMessageUpdate(data[0], data[1], data[2]);
						}
						break;
					case 10: // GPT response
						if (onGPTResponse != null)
							onGPTResponse(NettleWeb.UTF_8.decode(buf.subarray(1)));
						break;
					case 11: // GPT error response
						if (onGPTResError != null)
							onGPTResError(NettleWeb.UTF_8.decode(buf.subarray(1)));
						break;
					case 12:
						{
							const key = new DataView(data, 1, 8).getFloat64(0, true);
							const cb = sioreq.get(key);
							if (cb != null) {
								cb[0](NettleWeb.NTON.decode(buf.subarray(9)));
								sioreq.delete(key);
							}
						}
						break;
					case 13:
						{
							const key = new DataView(data, 1, 8).getFloat64(0, true);
							const cb = sioreq.get(key);
							if (cb != null) {
								cb[1](NettleWeb.UTF_8.decode(buf.subarray(9)));
								sioreq.delete(key);
							}
						}
						break;
					default:
						consoleLog("[WARN] Received invalid message ID: ", buf[0]);
						break;
				}
			});

			if (user != null)
				socket.send(NettleWeb.UTF_8.encode("\x01" + user)); // login
		}

		function updateBackendURL(value: string) {
			if (server == null) {
				const { "q": e, "r": g } = config;
				if (e != null && g != null)
					server = e + g + __host;
			}

			if (socket != null)
				socket.close();

			createSocket(value || server || "https://service.nettleweb.com/");
		}

		function updateFont(value: string) {
			if (value === "mono")
				docBody.style.fontFamily = "\"Ubuntu Mono\", monospace";
			else
				docBody.style.removeProperty("font-family");
		}

		function updateImage(value: string) {
			if (value.startsWith("data:image/jpeg;base64,"))
				docBody.style.background = "url(\"" + value + "\")";
			else
				docBody.style.removeProperty("background");
		}

		function updateTheme(value: string) {
			if (themeCSS == null) {
				themeCSS = doc.createElement("link");
				themeCSS.rel = "stylesheet";
				themeCSS.type = "text/css";
				themeCSS.href = "index.dark.css";
				docHead.appendChild(themeCSS);
			}

			switch (value) {
				case "light":
					themeCSS.href = "data:text/css;base64,";
					themeCSS.removeAttribute("media");
					break;
				case "dark":
					themeCSS.href = "index.dark.css";
					themeCSS.removeAttribute("media");
					break;
				default:
					themeCSS.href = "index.dark.css";
					themeCSS.media = "all and (prefers-color-scheme: dark)";
					break;
			}
		}

		function updateTabCloak(value: string) {
			switch (value) {
				case "empty":
					cloaking = true;
					doc.title = "\u2060";
					faviconElem.type = "image/x-icon";
					faviconElem.href = "/res/empty.ico";
					break;
				case "google":
					cloaking = true;
					doc.title = "Google";
					faviconElem.type = "image/x-icon";
					faviconElem.href = "/res/google.ico";
					break;
				case "classroom":
					cloaking = true;
					doc.title = "Home";
					faviconElem.type = "image/png";
					faviconElem.href = "/res/classroom.png";
					break;
				default:
					cloaking = false;
					doc.title = "NettleWeb";
					faviconElem.type = "image/x-icon";
					faviconElem.href = "/favicon.ico";
					break;
			}
		}

		function updateStealthMode(value: string) {
			switch (value) {
				case "blank":
					doc.onblur = doc.onmouseleave = (e: Event) => {
						if (!overlay.hasAttribute("data-x")) {
							e.preventDefault();
							e.stopPropagation();
							overlay.setAttribute("data-x", "1");
						}
					};
					doc.onmousedown = doc.ontouchstart = (e: Event) => {
						if (overlay.hasAttribute("data-x")) {
							e.preventDefault();
							e.stopPropagation();
							overlay.removeAttribute("data-x");
						}
					};

					overlay.innerHTML = "";
					overlay.removeAttribute("data-x")
					break;
				case "google":
					doc.onblur = doc.onmouseleave = (e: Event) => {
						if (!overlay.hasAttribute("data-x")) {
							e.preventDefault();
							e.stopPropagation();
							overlay.setAttribute("data-x", "1");
						}
					};
					doc.onmousedown = doc.ontouchstart = (e: Event) => {
						if (overlay.hasAttribute("data-x")) {
							e.preventDefault();
							e.stopPropagation();
							overlay.removeAttribute("data-x");
						}
					};

					overlay.innerHTML = "<iframe width=\"1024\" height=\"768\" allowfullscreen=\"true\" allowpaymentrequest=\"true\" name=\"Frame\" allow=\"fullscreen payment\" loading=\"lazy\" scrolling=\"no\" frameborder=\"0\" credentialless=\"true\" referrerpolicy=\"no-referrer\" src=\"https://www.google.com/webhp?igu=1\"></iframe>";
					overlay.removeAttribute("data-x");
					break;
				default:
					overlay.innerHTML = "";
					overlay.removeAttribute("data-x");
					doc.onblur = doc.onmouseleave = doc.onmousedown = doc.ontouchstart = null;
					break;
			}
		}

		theme.onchange = () => {
			const value = theme.value;
			updateTheme(value);
			localStorage.setItem("__set_theme", value);
		};
		image.onchange = async () => {
			const file = image.files?.item(0);
			if (file != null) {
				if (file.size > 10485760) {
					error("Error: Selected file is too large.");
					return;
				}

				const blob = await resizeImage(file, 1280);
				if (blob == null) {
					error("Error: Failed to decode image file.");
					return;
				}

				const value = "data:image/jpeg;base64," + NettleWeb.Base64.encode(new Uint8Array(await blob.arrayBuffer()));
				updateImage(value);
				localStorage.setItem("__set_image", value);
			} else {
				updateImage("")
				localStorage.setItem("__set_image", "");
			}
		};
		font.onchange = () => {
			const value = font.value;
			updateFont(value);
			localStorage.setItem("__set_font", value);
		};
		burl.onblur = () => {
			const url = optURL(burl.value.trim());
			if (url != null) {
				const href = url.href;
				localStorage.setItem("__backendURL_", href);
				updateBackendURL(burl.value = href);
			} else {
				localStorage.removeItem("__backendURL_");
				updateBackendURL(burl.value = "");
			};
		};
		tabc.onchange = () => {
			const value = tabc.value;
			updateTabCloak(value);
			localStorage.setItem("__set_tabc", value);
		};
		sm.onchange = () => {
			const value = sm.value;
			updateStealthMode(value);
			localStorage.setItem("__set_sm", value);
		};

		updateFont(font.value = localStorage.getItem("__set_font") || "normal");
		updateImage(localStorage.getItem("__set_image") || "");
		updateTheme(theme.value = localStorage.getItem("__set_theme") || "default");
		updateTabCloak(tabc.value = localStorage.getItem("__set_tabc") || "disabled");
		updateBackendURL(burl.value = localStorage.getItem("__backendURL_") || "");
		updateStealthMode(sm.value = localStorage.getItem("__set_sm") || "disabled");
	}

	{
		$("clear-data").onclick = async () => {
			for (const key of await caches.keys())
				await caches.delete(key);

			localStorage.clear();
			loc.reload();
		};
		$("clear-cache").onclick = async () => {
			for (const key of await caches.keys())
				await caches.delete(key);

			loc.reload();
		};
	}

	{
		const newsContainer = $("headlines");

		fetchSIO(SIOPath.articles).then((articles) => {
			if (!Array.isArray(articles)) {
				newsContainer.innerHTML = "Error: Failed to parse server response.";
				return;
			}
			if (articles.length === 0) {
				newsContainer.innerHTML = "No articles are available at this moment.";
				return;
			}

			newsContainer.innerHTML = "";

			for (const it of articles) {
				const elem = doc.createElement("div");
				const url = it.urlToImage || null;

				{
					const e = doc.createElement("img");
					e.src = url == null ? "/res/preview.svg" : proxyURL(url);
					e.alt = "Preview";
					e.width = 160;
					e.height = 90;
					e.loading = "lazy";
					e.decoding = "async";
					e.draggable = false;
					elem.appendChild(e);
				}

				{
					const el = doc.createElement("div");

					{
						const e = doc.createElement("div");
						e.className = "title";
						e.textContent = it.title;
						el.appendChild(e);
					}
					{
						const e = doc.createElement("div");
						e.className = "desc";
						e.textContent = it.description || "Description is not available for this article.";
						el.appendChild(e);
					}
					{
						const e = doc.createElement("div");
						e.className = "time";
						e.textContent = "Source: " + (it.source.name || "unknown") + "; Author: " + (it.author || "unknown") + "; Published at " + dateToStr(it.publishedAt);
						el.appendChild(e);
					}

					elem.appendChild(el);
				}

				elem.onclick = () => {
					openPopupWindow(it.url);
				};

				newsContainer.appendChild(elem);
			}
		}).catch((err) => {
			newsContainer.textContent = "Failed to fetch from the API server. Message: " + err;
		});
	}

	{
		const gameContainer = $("game-container");
		const gameComments = $("comments");
		const gamePlayer = $("player");
		const gameShare = $("share");
		const gameLike = $("like") as HTMLButtonElement;
		const gamePage = $("game-page");
		const gameCode = $("ecode");
		const gameEdit = $("edit") as HTMLButtonElement;
		const gameName = $("name");
		const gameType = $("type");
		const gameTags = $("tags");
		const gameDate = $("date");
		const gameUser = $("user");
		const gameDesc = $("desc");
		const gameId = $("code");

		const lock = $("lock");
		const comm = $("comm") as HTMLTextAreaElement;
		const post = $("post") as HTMLTextAreaElement;
		const eName = $("e-name") as HTMLInputElement;
		const eTags = $("e-tags") as HTMLInputElement;
		const eDesc = $("e-desc") as HTMLTextAreaElement;
		const submit = $("e-subm") as HTMLButtonElement;
		const editor = $("editor");
		const sGames = $("s-games");
		const loadmore = $("loadmore");
		const controller = $("controller");

		const gnavBack = $("gnav-back") as HTMLButtonElement;
		const gnavForward = $("gnav-forward") as HTMLButtonElement;
		const gnavPageNo = $("gnav-page-no") as HTMLInputElement;
		const gnavPageCount = $("gnav-page-count");

		const pages: GameList[] = [];

		let order: string = "p";
		let match: string = "all";
		let search: string = "";
		let currentPage: number = 0;

		{
			const gameSearch = $("game-search") as HTMLFormElement;
			const searchInput = q("#game-search>input") as HTMLInputElement;

			let __timer__: number = 0;

			gameSearch.onsubmit = (e) => {
				e.preventDefault();
				e.stopPropagation();

				search = searchInput.value.trim().toLowerCase();
				clearTimeout(__timer__);
				updateGameList();
			};
			searchInput.onblur = () => {
				search = searchInput.value.trim().toLowerCase();
				clearTimeout(__timer__);
				updateGameList();
			};
			searchInput.oninput = () => {
				clearTimeout(__timer__);
				__timer__ = setTimeout(() => {
					search = searchInput.value.trim().toLowerCase();
					updateGameList();
				}, 1000);
			};
		}
		{
			const buttons = doc.querySelectorAll<HTMLElement>("#game-category>button");
			for (const elem of buttons) {
				elem.onclick = () => {
					for (const e of buttons)
						e.removeAttribute("data-current");

					match = elem.getAttribute("data-match") || "all";
					elem.setAttribute("data-current", "");
					updateGameList();
				};
			}
		}
		{
			const elem = $("game-sort") as HTMLSelectElement;
			elem.value = order = localStorage.getItem("__gamesortorder") || "p";
			elem.onchange = () => {
				localStorage.setItem("__gamesortorder", order = elem.value);
				updateGameList();
			};
		}

		function matchGameList(): GameList {
			switch (match) {
				case "all":
					return search.length > 0 ? gameList.filter((e) => e.name.toLowerCase().indexOf(search) >= 0 || e.tags.indexOf(search) >= 0) : [...gameList];
				case "html5":
					return gameList.filter((e) => e.type === "html5" && (search.length === 0 || e.name.toLowerCase().indexOf(search) >= 0 || e.tags.indexOf(search) >= 0));
				case "flash":
					return gameList.filter((e) => e.type === "flash" && (search.length === 0 || e.name.toLowerCase().indexOf(search) >= 0 || e.tags.indexOf(search) >= 0));
				case "dos":
					return gameList.filter((e) => e.type === "dos" && (search.length === 0 || e.name.toLowerCase().indexOf(search) >= 0 || e.tags.indexOf(search) >= 0));
				default:
					return gameList.filter((e) => e.tags.split(",").indexOf(match) >= 0 && (search.length === 0 || e.name.toLowerCase().indexOf(search) >= 0));
			}
		}

		function updateGameList() {
			currentPage = 0;
			pages.length = 0;

			const list = matchGameList();
			if (list.length === 0) {
				gnavBack.disabled = true;
				gnavForward.disabled = true;
				gameContainer.innerHTML = "No results found :(";
				return;
			}

			switch (order) {
				case "r":
					if (myuid === "Joey" || myuid === "anonymous")
						list.sort((a, b) => a.desc.length - b.desc.length);
					else
						shuffle(list);
					break;
				case "d":
					list.sort((a, b) => b.date - a.date);
					break;
				case "p":
					list.sort((a, b) => (b.count || 0) - (a.count || 0));
					break;
				default:
					break;
			}

			for (let i = 0; i < list.length; i += 100)
				pages.push(list.slice(i, i + 100));

			updatePageList();
		}

		function updatePageList() {
			gnavPageNo.min = "1";
			gnavPageNo.max = gnavPageCount.innerHTML = String(pages.length);
			gnavPageNo.value = String(currentPage + 1);
			gameContainer.innerHTML = "";

			if (currentPage < 1)
				gnavBack.disabled = true;
			else
				gnavBack.disabled = false;

			if (currentPage >= pages.length - 1)
				gnavForward.disabled = true;
			else
				gnavForward.disabled = false;

			for (const game of pages[currentPage])
				gameContainer.appendChild(createGameElement(game));
		}

		function createCommentElement({ id, msg, uid, vip, user: _user, icon }: Message, game: number): HTMLElement {
			const elem = doc.createElement("div");
			elem.setAttribute("id", id);

			const usr = doc.createElement("div");
			usr.className = "user";
			usr.textContent = _user;

			switch (vip) {
				case 3:
					usr.setAttribute("data-vip", "gold");
					break;
				case 4:
					usr.setAttribute("data-vip", "diamond");
					break;
				default:
					break;
			}

			{
				const img = doc.createElement("img");
				img.src = proxyURL(icon);
				img.alt = "Avatar";
				img.width = 32;
				img.height = 32;
				img.loading = "lazy";
				img.decoding = "async";
				img.draggable = false;

				if (uid != null) {
					img.style.cursor = usr.style.cursor = "pointer";
					img.onclick = usr.onclick = () => {
						openProfile(uid).catch((err) => {
							error("Failed to open user profile. Message: " + err);
						});
					};
				}

				elem.appendChild(img);
			}

			const wid = doc.createElement("div");
			wid.appendChild(usr);

			if (msg.length > 0) {
				const el = doc.createElement("span");
				el.textContent = msg;
				wid.appendChild(el);

				if (myuid != null && uid === myuid) {
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Edit";
						e.className = "edit";

						e.onclick = () => {
							const elem = doc.createElement("div");

							const input = doc.createElement("input");
							input.type = "text";
							input.value = msg;
							input.required = true;
							input.minLength = 1;
							input.maxLength = 1000;
							input.placeholder = "Message";
							input.autocomplete = "off";
							elem.appendChild(input);

							const tick = doc.createElement("button");
							tick.type = "button";
							tick.title = "Save";
							tick.className = "tick";
							elem.appendChild(tick);

							const cross = doc.createElement("button");
							cross.type = "button";
							cross.title = "Cancel";
							cross.className = "cross";
							elem.appendChild(cross);

							tick.onclick = () => {
								const value = input.value.trim();
								if (value.length < 1) {
									error("Comments cannot be empty.");
									return;
								}
								if (value.length > 1000) {
									error("Comments cannot be longer than 1000 characters.");
									return;
								}

								fetchSIO(SIOPath.editcomment, [user, id, game, value]).then(() => {
									msg = value;
									elem.remove();
									e.disabled = false;
								}).catch((err) => {
									error("Failed to update the comment. Message: " + err);
								});
							};
							cross.onclick = () => {
								elem.remove();
								e.disabled = false;
								el.innerHTML = msg;
							};

							e.disabled = true;
							el.innerHTML = "";
							el.appendChild(elem);
						};

						elem.appendChild(e);
					}
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Delete";
						e.className = "delete";

						e.onclick = () => {
							e.disabled = true;

							fetchSIO(SIOPath.editcomment, [user, id, game, ""]).catch((err) => {
								error("Failed to delete the comment. Message: " + err);
							});
						};

						elem.appendChild(e);
					}
				}
			}

			elem.appendChild(wid);

			return elem;
		}

		playGame = async ({ name, type, tags, date, path, desc }: GameInfo) => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});

			sideMenu.checked = false;
			gamePage.setAttribute("data-current", "");

			unblEndSes = () => {
				unblEndSes = null;
				lock.title = "Enable scroll lock";
				lock.style.backgroundImage = "url(\"res/lock-open-w.svg\")";

				if (!mirror) {
					if (!cloaking)
						doc.title = "NettleWeb";

					his.replaceState(void 0, "", "/");
				}

				onCommentCreate = null;
				onCommentUpdate = null;
				gamePlayer.innerHTML = "";
				content.style.overflow = "";
			};

			comm.value = "";
			eName.value = "";
			eTags.value = "";
			eDesc.value = "";
			sGames.innerHTML = "";
			gameUser.innerHTML = "";
			gameLike.innerHTML = "Like";
			gameShare.innerHTML = "Share";
			gameComments.innerHTML = "";

			editor.style.display = "none";
			gameEdit.style.display = "block";
			controller.style.display = "block";

			gameName.textContent = name;
			gameType.textContent = type.toUpperCase();
			gameTags.textContent = tags.replace(/\,/g, ", ") || "None";
			gameDate.textContent = dateToStr(date);
			gameDesc.textContent = desc || "No information provided by the uploader.";

			{
				const id = date.toString(36);
				const url = "/" + id;
				const furl = Constants.origin + url;

				if (!mirror) {
					if (!cloaking)
						doc.title = name + " - NettleWeb";

					his.replaceState(void 0, "", url);
				}

				gameId.textContent = id;
				gameCode.textContent = "<embed type=\"text/plain\" width=\"1280\" height=\"720\" src=\"" + furl + "?hidegui=1\" />";
				gameShare.onclick = () => {
					navigator.clipboard.writeText(furl).then(() => {
						gameShare.innerHTML = "Link copied!";
					}).catch((err) => {
						error("Failed to copy link to clipboard. Message: " + String(err));
					});
				};
			}

			gameEdit.innerHTML = "Edit Game Info";
			gameEdit.disabled = false;
			gameEdit.onclick = () => {
				if (user == null) {
					accnBtn.click();
					return;
				}

				eName.value = name;
				eTags.value = tags;
				eDesc.value = desc;

				editor.style.display = "block";
				gameEdit.style.display = "none";
			};

			submit.onclick = () => {
				if (user == null) {
					error("Invalid session. Please refresh this page and try again.");
					return;
				}

				const name = eName.value.replace(/\s+/g, " ").trim();
				if (name.length === 0) {
					error("Game name must not be empty.");
					return;
				}
				if (name.length > 256) {
					error("Game name must be less than 256 characters in length.");
					return;
				}

				const desc = eDesc.value.replace(/\s+/g, " ").trim();
				const tags = eTags.value.trim().toLowerCase().split(",").map((v) => {
					return v.replace(/\s+/g, " ").trim();
				}).join(",");

				if (tags.length > 300) {
					error("Game tags list must be less than 300 characters long in total.");
					return;
				}
				if (desc.length > 5000) {
					error("Game description text must be less than 5000 characters in length.");
					return;
				}

				submit.disabled = true;

				fetchSIO(SIOPath.editgameinfo, [user, date, name, tags, desc]).then(() => {
					submit.disabled = false;
					gameEdit.disabled = true;
					gameEdit.innerHTML = "Requested. Pending review...";

					editor.style.display = "none";
					gameEdit.style.display = "block";
				}).catch((err) => {
					error("Failed to submit request. Message: " + err);
					submit.disabled = false;
				});
			};

			post.onclick = () => {
				if (user == null) {
					accnBtn.click();
					return;
				}

				const value = comm.value.trim();
				if (value.length < 1) {
					error("Comments cannot be empty.");
					return;
				}
				if (value.length > 1000) {
					error("Comments cannot be longer than 1000 characters.");
					return;
				}

				post.disabled = true;

				fetchSIO(SIOPath.postcomment, [user, date, value]).then(() => {
					comm.value = "";
					post.disabled = false;
				}).catch((err) => {
					error("Failed to post comment. Message: " + err);
					post.disabled = false;
				});
			};

			for (const game of shuffle(gameList.filter((e) => !e.path.startsWith("https://"))).slice(3, 9)) {
				if (game.date !== date && sGames.childElementCount < 5)
					sGames.appendChild(createGameElement(game));
			}

			if (path.startsWith("!content!"))
				gamePlayer.appendChild(createGameFrame(type, await fetchGameContent(path.slice(9))));
			else
				gamePlayer.appendChild(createFrameElement(path));

			{
				const info = await fetchSIO(SIOPath.gameinfo, date);

				{
					let n: number = info.likes;

					gameLike.textContent = n.toString(10);
					gameLike.onclick = () => {
						gameLike.disabled = true;

						fetchSIO(SIOPath.like, date).then(() => {
							gameLike.textContent = (++n).toString(10);
							gameLike.disabled = false;
						}).catch((err) => {
							error("Failed to give a like. Message: " + err);
						});
					};
				}

				{
					const e = doc.createElement("img");
					e.src = proxyURL(info.icon);
					e.alt = "Avatar";
					e.width = 40;
					e.height = 40;
					e.loading = "eager";
					e.decoding = "sync";
					e.draggable = false;
					gameUser.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.className = "user";
					e.textContent = info.id;

					switch (info.vip) {
						case 3:
							e.setAttribute("data-vip", "gold");
							break;
						case 4:
							e.setAttribute("data-vip", "diamond");
							break;
						default:
							break;
					}
					gameUser.appendChild(e);
				}

				gameUser.onclick = () => {
					openProfile(info.uid).catch((err) => {
						error("Failed to open user profile. Message: " + err);
					});
				};
			}

			{
				const list = await fetchSIO(SIOPath.getcomments, [date]);
				if (list.length === 20) {
					let last: number = list[list.length - 1].id;

					loadmore.style.display = "block";
					loadmore.onclick = () => {
						loadmore.style.display = "none";

						fetchSIO(SIOPath.getcomments, [date, last]).then((list) => {
							if (list.length === 20) {
								last = list[list.length - 1].id;
								loadmore.style.display = "block";
							}

							for (const it of list)
								gameComments.appendChild(createCommentElement(it, date));
						}).catch((err) => {
							error("Failed to fetch comments. Message: " + err);
						});
					};
				}

				for (const it of list)
					gameComments.appendChild(createCommentElement(it, date));
			}

			onCommentCreate = (id, msg) => {
				if (date === id)
					gameComments.prepend(createCommentElement(msg, date));
			};
			onCommentUpdate = (id, msg, text) => {
				if (date === id) {
					for (const elem of gameComments.children) {
						if (elem.getAttribute("id") === msg) {
							const e = elem.querySelector("div>span");
							if (e != null)
								e.textContent = text;
							else
								error("Failed to update comment: " + msg);
							break;
						}
					}
				}
			};
		}

		gnavBack.onclick = () => {
			currentPage--;
			updatePageList();

			gameContainer.scrollIntoView({
				behavior: "instant",
				inline: "start",
				block: "start"
			});
		};
		gnavForward.onclick = () => {
			currentPage++;
			updatePageList();

			gameContainer.scrollIntoView({
				behavior: "instant",
				inline: "start",
				block: "start"
			});
		};
		gnavPageNo.onblur = () => {
			const value = parseInt(gnavPageNo.value.trim(), 10) || 0;
			if ((currentPage + 1) !== value) {
				if (value < 1 || value > pages.length) {
					gnavPageNo.value = "1";
					currentPage = 0;
				} else currentPage = value - 1;

				updatePageList();
				gameContainer.scrollIntoView({
					behavior: "instant",
					inline: "start",
					block: "start"
				});
			}
		};
		gnavPageNo.onchange = () => {
			gnavPageNo.blur();
		};

		lock.onclick = () => {
			if (lock.title === "Disable scroll lock") {
				lock.style.backgroundImage = "url(\"res/lock-open-w.svg\")";
				lock.title = "Enable scroll lock";
				content.style.overflow = "";
			} else {
				lock.style.backgroundImage = "url(\"res/lock-w.svg\")";
				lock.title = "Disable scroll lock";
				content.style.overflow = "hidden";
				gamePlayer.scrollIntoView({
					block: "start",
					inline: "start",
					behavior: "instant"
				});
			}
		};
		comm.onfocus = () => {
			if (user == null)
				accnBtn.click();
		};

		$("hide").onclick = () => {
			controller.style.display = "none";
		};
		$("e-canc").onclick = () => {
			editor.style.display = "none";
			gameEdit.style.display = "block";
		};
		$("newtab").onclick = () => {
			error("This feature has been temporarily disabled.");
		};
		$("fullscreen").onclick = () => {
			if (doc.fullscreenEnabled) {
				const elem = gamePlayer.firstElementChild;
				if (elem != null) {
					elem.requestFullscreen({ navigationUI: "hide" }).catch((err) => {
						error("Failed to enter fullscreen mode. Message: " + String(err));
					});
				}
			} else error("Fullscreen mode is not supported in the current browsing context.");
		};

		updateGameList();
	}

	{
		const searchInput = q("#yt-search>input") as HTMLInputElement;
		const searchBtn = q("#yt-search>button") as HTMLButtonElement;
		const ploadmore = $("p-load-more");
		const loadmore = $("yt-load-more");
		const strmBtn2 = $("goto-video") as HTMLButtonElement;
		const strmPage = $("videos-page");
		const results = $("yt-results");
		const sserver = $("sserver") as HTMLSelectElement;
		const service = $("service") as HTMLSelectElement;

		const video = $("video");
		const sVideos = $("s-videos");
		const pVideos = $("p-videos");
		const videoPage = $("video-page");
		const playlistPage = $("playlist-page");

		const vID = $("vcode");
		const vidName = $("vname");
		const vidTags = $("vtags");
		const vidDate = $("vdate");
		const vidDesc = $("vdesc");
		const vidLikes = $("vlike");
		const vidViews = $("vview");
		const vidOrigin = $("origin");
		const vidSource = $("source");
		const vidStream = $("stream");
		const vidPrivacy = $("privacy");
		const vidLicense = $("license");
		const vidCategory = $("category");
		const vidUploader = $("uploader");

		const pName = $("pname");
		const pDesc = $("pdesc");
		const pOrigin = $("porigin");
		const pSource = $("psource");
		const pStreams = $("streams");
		const pUploader = $("puploader");

		let resultsServiceId: string = "0";
		service.value = localStorage.getItem("__yt_service") || "0";

		function parseVideoID(url: URL): string | null {
			switch (url.protocol) {
				case "http:":
				case "https:":
					break;
				default:
					return null;
			}

			const path = url.pathname;
			if (path.length < 4)
				return null;

			switch (url.hostname) {
				case "piped.video":
				case "youtube.com":
				case "www.youtube.com":
				case "youtube-nocookie.com":
				case "www.youtube-nocookie.com":
					if (path === "/watch")
						return url.searchParams.get("v") || null;
					if (path.slice(0, 7) === "/embed/")
						return path.slice(7) || null;

					return null;
				case "youtu.be":
					return path.slice(1) || null;
				default:
					return null;
			}
		}

		function createResultElement(item: any): Element {
			const thumb = item.thumbnails[0]?.url || null;
			const elem = doc.createElement("div");
			const { url, type } = item;

			{
				const e = doc.createElement("img");
				e.src = thumb == null ? "/res/preview.svg" : proxyURL(thumb);
				e.alt = "Preview";
				e.width = 160;
				e.height = 90;
				e.loading = "lazy";
				e.decoding = "async";
				e.draggable = false;
				elem.appendChild(e);
			}

			{
				const el = doc.createElement("div");

				{
					const e = doc.createElement("div");
					e.className = "title";
					e.textContent = item.name;
					el.appendChild(e);
				}
				{
					const e = doc.createElement("div");
					e.className = "desc";
					e.textContent = item.description || "";
					el.appendChild(e);
				}
				{
					let info: string = "";

					switch (type) {
						case "stream":
							{
								const { uploadDate: date, uploader } = item;
								if (date != null && date.length > 0)
									info += date + "; ";

								info += "Views: " + item.viewCount + "; Uploader: " + (uploader.name || "Unknown") + (uploader.verified ? " \u2713" : "");
							}
							break;
						case "channel":
							info = "Streams: " + item.streams + "; Subscribers: " + item.subscribers + (item.verified ? " \u2713" : "");
							break;
						case "playlist":
							info = "Streams: " + item.streams + "; Type: " + item.playlist;
							break;
						default:
							info = "No information available for this item."
							break;
					}

					if (resultsServiceId === "0")
						info += "; Source: YouTube";

					const e = doc.createElement("div");
					e.className = "time";
					e.textContent = info;
					el.appendChild(e);
				}

				elem.appendChild(el);
			}

			elem.onclick = () => {
				switch (type) {
					case "stream":
						openVideo(url);
						break;
					case "playlist":
						openPlaylist(url);
						break;
					default:
						consoleLog(type);
						error("Function not implemented!");
						break;
				}
			};

			return elem;
		}

		async function loadKiosk(pageToken: string) {
			service.disabled = true;
			searchBtn.disabled = true;
			searchInput.disabled = true;
			loadmore.style.display = "none";

			const res = await fetchSIO(SIOPath.yttrending, [pageToken, resultsServiceId]);
			if (res == null || typeof res !== "object") {
				error("Error: API server returned invalid response.");
				return;
			}

			const items = res.results;
			if (pageToken === "") {
				if (items.length === 0) {
					results.innerHTML = "No suggestions are available at this moment.";
					return;
				}

				results.innerHTML = "";
			}

			for (const item of items)
				results.appendChild(createResultElement(item));

			if ((pageToken = res.nextPageToken) != null) {
				loadmore.style.display = "block";
				loadmore.onclick = () => {
					loadKiosk(pageToken).then(() => {
						service.disabled = false;
						searchBtn.disabled = false;
						searchInput.disabled = false;
					});
				};
			}
		}

		async function runSearch(pageToken: string) {
			service.disabled = true;
			searchBtn.disabled = true;
			searchInput.disabled = true;
			loadmore.style.display = "none";

			const res = await fetchSIO(SIOPath.ytsearch, [searchInput.value.trim(), pageToken, "relevance", "videos", resultsServiceId]);
			if (res == null || typeof res !== "object") {
				error("Error: API server returned invalid response.");
				return;
			}

			const items = res.results;
			if (pageToken.length === 0 && items.length === 0) {
				results.innerHTML = "No matching results found :(";
				return;
			}

			for (const item of items)
				results.appendChild(createResultElement(item));

			if ((pageToken = res.nextPageToken) != null) {
				loadmore.style.display = "block";
				loadmore.onclick = () => {
					runSearch(pageToken).then(() => {
						service.disabled = false;
						searchBtn.disabled = false;
						searchInput.disabled = false;
					});
				};
			}
		}

		function openVideo(url: string) {
			fetchSIO(SIOPath.ytstream, [url, resultsServiceId]).then((info) => {
				if (info == null || typeof info !== "object") {
					error("Error: API server returned invalid response.");
					return;
				}

				if (unblEndSes != null)
					unblEndSes();
				for (const elem of curElems)
					elem.removeAttribute("data-current");

				content.scrollTo({
					top: 0,
					left: 0,
					behavior: "instant"
				});
				sVideos.innerHTML = "";
				sideMenu.checked = false;
				videoPage.setAttribute("data-current", "");

				unblEndSes = () => {
					unblEndSes = null;
					video.innerHTML = "";
				};

				const id = vID.textContent = info.id;

				if (resultsServiceId !== "0") {
					sserver.value = "nettle";
					sserver.disabled = true;
					vidSource.textContent = "Unknown";
				} else {
					sserver.disabled = false;
					vidSource.textContent = "YouTube";
				}

				vidName.textContent = info.name;
				vidTags.textContent = info.tags.join(", ").trim() || "None";
				vidDate.textContent = dateToStr(Date.parse(info.uploadDate));
				vidDesc.textContent = info.description.replace(/\<br\>/g, "\n").replace(/<[^>]*>/g, "").trim() || "No information provided by the uploader.";
				vidLikes.textContent = info.likeCount;
				vidViews.textContent = info.viewCount;
				vidOrigin.textContent = url;
				vidStream.textContent = info.stream;
				vidPrivacy.textContent = info.privacy;
				vidLicense.textContent = info.license || "Unknown";
				vidCategory.textContent = info.category || "Unknown";

				{
					const { name, verified, subscribers } = info.uploader;
					vidUploader.textContent = name + " (" + subscribers + " subscribers)" + (verified ? " \u2713" : "");
				}

				{
					const related = info.relatedItems;
					if (related.length > 0) {
						for (const item of related)
							sVideos.appendChild(createResultElement(item));
					} else sVideos.innerHTML = "No suggestions are available for this video.";
				}

				(sserver.onchange = () => {
					switch (sserver.value) {
						case "none":
							video.innerHTML = "";
							video.appendChild(createFrameElement("https://www.youtube-nocookie.com/embed/" + id));
							break;
						case "piped":
							video.innerHTML = "";
							video.appendChild(createFrameElement("https://cf.piped.video/watch?v=" + id));
							break;
						default:
							if ((url = info.videoStreams[0]?.url || "").length > 4) {
								const e = doc.createElement("video");
								e.src = proxyURL(url);
								e.width = 800;
								e.height = 600;
								e.volume = 0.8;
								e.autoplay = true;
								e.controls = true;
								e.preservesPitch = false;

								if ((url = info.thumbnails.pop().url || "").length > 4)
									e.poster = proxyURL(url);

								e.onerror = () => {
									error("Video stream failed to load. Falling back to official server.");
									e.replaceWith(createFrameElement("https://www.youtube-nocookie.com/embed/" + id));
								};
								e.oncanplay = () => {
									e.onerror = null;
									e.oncanplay = null;
								};

								video.innerHTML = "";
								video.appendChild(e);
							} else if ((url = info.audioStreams[0]?.url || "").length > 4) {
								const e = doc.createElement("audio");
								e.src = proxyURL(url);
								e.volume = 0.8;
								e.autoplay = true;
								e.controls = true;
								e.preservesPitch = false;

								e.onerror = () => {
									error("Error: Failed to load the audio stream.");
								};
								e.oncanplay = () => {
									e.onerror = null;
									e.oncanplay = null;
								};

								video.innerHTML = "";
								video.appendChild(e);
							} else video.innerHTML = "Failed to retrieve the video stream. Try switching to a different stream proxy server below.";
							break;
					}
				})();
			}).catch((err) => {
				error("Failed to fetch video stream information. Message: " + err);
				createFrame("https://www.youtube-nocookie.com/embed/" + parseVideoID(new URL(url)));
			});
		}

		function openPlaylist(url: string) {
			fetchSIO(SIOPath.ytplaylist, [url, "", resultsServiceId]).then((info) => {
				if (info == null || typeof info !== "object") {
					error("Error: API server returned invalid response.");
					return;
				}

				if (unblEndSes != null)
					unblEndSes();
				for (const elem of curElems)
					elem.removeAttribute("data-current");

				content.scrollTo({
					top: 0,
					left: 0,
					behavior: "instant"
				});
				pVideos.innerHTML = "";
				sideMenu.checked = false;
				ploadmore.style.display = "none";
				playlistPage.setAttribute("data-current", "");

				pName.textContent = info.name;
				pDesc.textContent = info.description.replace(/\<br\>/g, "\n").replace(/<[^>]*>/g, "").trim() || "No information provided by the uploader.";
				pOrigin.textContent = url;
				pSource.textContent = resultsServiceId === "0" ? "YouTube" : "Unknown";
				pStreams.textContent = info.streams;
				pUploader.textContent = info.uploader.name;

				{
					const results = info.results;
					if (results.length > 0) {
						for (const item of results)
							pVideos.appendChild(createResultElement(item));

						let pageToken = info.nextPageToken;
						if (pageToken != null) {
							ploadmore.style.display = "block";
							ploadmore.onclick = () => {
								ploadmore.style.display = "none";

								fetchSIO(SIOPath.ytplaylist, [url, pageToken, resultsServiceId]).then((info) => {
									if (info == null || typeof info !== "object") {
										error("Error: API server returned invalid response.");
										return;
									}

									for (const item of info.results)
										pVideos.appendChild(createResultElement(item));

									if ((pageToken = info.nextPageToken) != null)
										ploadmore.style.display = "block";
								});
							};
						}
					} else sVideos.innerHTML = "No streams are found within this playlist.";
				}
			}).catch((err) => {
				error("Failed to fetch playlist information. Message: " + err);
			});
		}

		service.onchange = () => {
			error(null);
			results.innerHTML = "";
			resultsServiceId = service.value;
			localStorage.setItem("__yt_service", service.value);

			if (searchInput.value.length > 0) {
				runSearch("").then(() => {
					service.disabled = false;
					searchBtn.disabled = false;
					searchInput.disabled = false;
				});
			} else {
				loadKiosk("").then(() => {
					service.disabled = false;
					searchBtn.disabled = false;
					searchInput.disabled = false;
				});
			}
		};
		$("yt-search").onsubmit = (e) => {
			e.preventDefault();
			e.stopPropagation();

			error(null);
			results.innerHTML = "";
			resultsServiceId = service.value;

			const url = optURL(searchInput.value);
			if (url != null) {
				const id = parseVideoID(url);
				if (id != null)
					openVideo("https://www.youtube.com/watch?v=" + id);
				else
					error("Error: Failed to parse video ID from the provided URL.");
			} else {
				runSearch("").then(() => {
					service.disabled = false;
					searchBtn.disabled = false;
					searchInput.disabled = false;
				});
			}
		};
		strmBtn.onclick = strmBtn2.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			sideMenu.checked = false;
			strmBtn.setAttribute("data-current", "");
			strmPage.setAttribute("data-current", "");

			if (!mirror) {
				if (!cloaking)
					doc.title = "NettleWeb Videos";

				unblEndSes = restoreRootPath;
				his.replaceState(void 0, "", "/videos");
			}

			if (results.childElementCount === 0) {
				strmBtn.disabled = true;
				strmBtn2.disabled = true;
				resultsServiceId = service.value;

				loadKiosk("").then(() => {
					service.disabled = strmBtn.disabled = strmBtn2.disabled =
						searchBtn.disabled = searchInput.disabled = false;
				});
			}
		};
	}

	{
		const itemContainer = $("item-container");
		const itemCategory = $("item-category");
		const itemPreviews = $("previews");
		const itemSeller = $("seller");
		const itemPrice = $("price");
		const itemStock = $("stock");
		const itemPage = $("item-page");
		const itemName = $("iname");
		const itemTags = $("itags");
		const itemDate = $("idate");
		const itemDesc = $("idesc");
		const itemId = $("icode");

		const cart: ItemList = [];
		const iadd = $("iadd") as HTMLButtonElement;
		const ibuy = $("ibuy") as HTMLButtonElement;
		const checkout = $("checkout");

		const navBack = $("nav-back") as HTMLButtonElement;
		const navForward = $("nav-forward") as HTMLButtonElement;
		const navPageNo = $("nav-page-no") as HTMLInputElement;
		const navPageCount = $("nav-page-count");
		const purchasePage = $("purchase-page");

		const pages: ItemList[] = [];

		let order: string = "p";
		let match: string = "all";
		let search: string = "";
		let currentPage: number = 0;

		itemLock = fetchSIO(SIOPath.store).then((data) => {
			if (data == null || typeof data !== "object") {
				itemContainer.innerHTML = "Error: Failed to load contents. Message: Failed to parse server response.";
				return;
			}

			const list: ItemList = data.pros;
			if (!Array.isArray(list) || list.length === 0) {
				itemContainer.innerHTML = "Sorry, no items are available at this moment.";
				return;
			}

			{
				const cats = data.cats;
				const btns = itemCategory.children;

				{
					const e = doc.createElement("button");
					e.type = "button";
					e.innerHTML = "All";
					e.setAttribute("data-current", "");

					e.onclick = () => {
						for (const e of btns)
							e.removeAttribute("data-current");

						match = "all";
						updateItemList();
						e.setAttribute("data-current", "");
					};

					itemCategory.appendChild(e);
				}

				if (Array.isArray(cats) && cats.length > 0) {
					for (const it of cats) {
						const e = doc.createElement("button");
						e.type = "button";
						e.textContent = it;

						e.onclick = () => {
							for (const e of btns)
								e.removeAttribute("data-current");

							match = it;
							updateItemList();
							e.setAttribute("data-current", "");
						};

						itemCategory.appendChild(e);
					}
				}
			}

			itemList = list;
			updateItemList();
		}).catch((err) => {
			itemContainer.textContent = "Failed to load contents. Message: " + err;
		});

		{
			const itemSearch = $("item-search") as HTMLFormElement;
			const searchInput = q("#item-search>input") as HTMLInputElement;

			let __timer__: number = 0;

			itemSearch.onsubmit = (e) => {
				e.preventDefault();
				e.stopPropagation();

				search = searchInput.value.trim().toLowerCase();
				clearTimeout(__timer__);
				updateItemList();
			};
			searchInput.onblur = () => {
				search = searchInput.value.trim().toLowerCase();
				clearTimeout(__timer__);
				updateItemList();
			};
			searchInput.oninput = () => {
				clearTimeout(__timer__);
				__timer__ = setTimeout(() => {
					search = searchInput.value.trim().toLowerCase();
					updateItemList();
				}, 1000);
			};
		}
		{
			const elem = $("item-sort") as HTMLSelectElement;
			elem.value = order = localStorage.getItem("_$so") || "n";
			elem.onchange = () => {
				localStorage.setItem("_$so", order = elem.value);
				updateItemList();
			};
		}

		function cmpStr(a: string, b: string): number {
			return a > b ? 1 : a < b ? -1 : 0;
		}

		function matchItemList(): ItemList {
			if (match === "all")
				return search.length > 0 ? itemList.filter((e) => e.name.toLowerCase().indexOf(search) >= 0 || e.desc.toLowerCase().indexOf(search) >= 0 || e.cats.indexOf(search) >= 0) : [...itemList];
			else
				return itemList.filter((e) => e.cats.split(",").indexOf(match) >= 0 && (search.length === 0 || e.name.toLowerCase().indexOf(search) >= 0 || e.desc.toLowerCase().indexOf(search) >= 0));
		}

		function updateItemList() {
			currentPage = 0;
			pages.length = 0;

			const list = matchItemList();
			if (list.length === 0) {
				navBack.disabled = true;
				navForward.disabled = true;
				itemContainer.innerHTML = "Sorry, no matching results found :(";
				return;
			}

			switch (order) {
				case "r":
					shuffle(list);
					break;
				case "d":
					list.sort((a, b) => b.date - a.date);
					break;
				default:
					list.sort((a, b) => cmpStr(a.name, b.name));
					break;
			}

			for (let i = 0; i < list.length; i += 100)
				pages.push(list.slice(i, i + 100));

			updatePageList();
		}

		function updatePageList() {
			navPageNo.min = "1";
			navPageNo.max = navPageCount.innerHTML = String(pages.length);
			navPageNo.value = String(currentPage + 1);
			itemContainer.innerHTML = "";

			if (currentPage < 1)
				navBack.disabled = true;
			else
				navBack.disabled = false;

			if (currentPage >= pages.length - 1)
				navForward.disabled = true;
			else
				navForward.disabled = false;

			for (const item of pages[currentPage]) {
				if (item.stock >= 1)
					itemContainer.appendChild(createItemElement(item));
			}
		}

		function openPurchasePage() {
			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});

			sideMenu.checked = false;
			purchasePage.innerHTML = "";
			purchasePage.setAttribute("data-current", "");

			{
				const e = doc.createElement("h2");
				e.textContent = "Confirm Purchase";
				purchasePage.appendChild(e);
			}

			let totalUSD: number = 0;
			const itemIds: string[] = [];

			for (const item of cart) {
				const elem = doc.createElement("div");
				const price = item.price;
				const itemId = item.date.toString(36);

				{
					const e = doc.createElement("img");
					e.src = proxyURL(item.prev[0]);
					e.alt = "Preview";
					e.width = 50;
					e.height = 50;
					e.loading = "lazy";
					e.decoding = "async";
					e.draggable = false;
					elem.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.textContent = item.name;
					elem.appendChild(e);
				}
				{
					const e = doc.createElement("span");
					e.textContent = "$" + price.toFixed(2);
					elem.appendChild(e);
				}

				{
					const e = doc.createElement("button");
					e.type = "button";
					e.title = "Remove item";
					e.onclick = () => {
						const i = cart.indexOf(item, 0);
						if (i >= 0) {
							elem.remove();
							cart.splice(i, 1);
							total.textContent = "Total: $" + (totalUSD - price).toFixed(2);

							{
								const i = itemIds.indexOf(itemId, 0);
								if (i >= 0)
									itemIds.splice(i, 1);
							}

							if (cart.length === 0) {
								commBtn.click();
								checkout.style.display = "none";
							}
						}
					};
					elem.appendChild(e);
				}

				totalUSD += price;
				itemIds.push(itemId);
				purchasePage.appendChild(elem);
			}

			const total = doc.createElement("span");
			total.textContent = "Total: $" + totalUSD.toFixed(2);
			purchasePage.appendChild(total);

			const e = doc.createElement("button");
			e.type = "button";
			e.className = "pri-button";
			e.textContent = "Continue";

			e.onclick = () => {
				if (user == null) {
					accnBtn.click();
					return;
				}

				const elem = doc.createElement("form");
				elem.action = "https://secure.nettleweb.com/pay.xml";
				elem.method = "GET";
				elem.target = "_self";
				elem.innerHTML = `<div>Please fill in the additional information below. It is required for continuing your purchase.</div>
	<fieldset>
		<legend>Delivery Address</legend>
		<div>
			<label for="addr1">Address Line 1:</label>
			<input id="addr1" name="a1" type="text" required="" minlength="1" maxlength="200" autocomplete="off" />
		</div>
		<div>
			<label for="addr2">Address Line 2:</label>
			<input id="addr1" name="a2" type="text" maxlength="200" autocomplete="off" />
		</div>
		<div>
			<label for="city">City:</label>
			<input id="city" name="c" type="text" required="" minlength="1" maxlength="100" autocomplete="off" />
		</div>
		<div>
			<label for="region">State/Region:</label>
			<input id="region" name="r" type="text" required="" minlength="1" maxlength="100" autocomplete="off" />
		</div>
		<div>
			<label for="country">Country:</label>
			<select id="country" name="n">${config.cc}</select>
		</div>
		<div>
			<label for="postcode">Post Code:</label>
			<input id="postcode" name="p" type="text" required="" minlength="3" maxlength="20" autocomplete="off" />
		</div>
	</fieldset>
	<div>Notice: Depending on your geolocation, additional delivery and processing fees may apply.</div>
	<button type="submit" class="pri-button">Continue</button>`;

				{
					const e = doc.createElement("input");
					e.type = "hidden";
					e.name = "i";
					e.value = itemIds.join(";");
					elem.appendChild(e);
				}
				{
					const e = doc.createElement("input");
					e.type = "hidden";
					e.name = "u";
					e.value = user;
					elem.appendChild(e);
				}

				purchasePage.innerHTML = "";
				purchasePage.appendChild(elem);
			};

			purchasePage.appendChild(e);
		}

		openItem = async (item: ItemInfo) => {
			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});

			sideMenu.checked = false;
			itemPage.setAttribute("data-current", "");
			itemSeller.innerHTML = "";
			itemPreviews.innerHTML = "";

			itemId.textContent = item.date.toString(36);
			itemName.textContent = item.name;
			itemTags.textContent = item.cats.replace(/\,/g, ", ") || "None";
			itemDate.textContent = dateToStr(item.date);
			itemDesc.textContent = item.desc || "No information provided by the provider.";
			itemStock.textContent = item.stock.toString(10);
			itemPrice.textContent = "$" + item.price.toFixed(2);

			for (const p of item.prev) {
				const e = doc.createElement("img");
				e.src = proxyURL(p);
				e.alt = "Preview";
				e.width = 400;
				e.height = 300;
				e.loading = "lazy";
				e.decoding = "async";
				e.draggable = false;
				itemPreviews.appendChild(e);
			}

			if (item.stock >= 1) {
				if (cart.indexOf(item, 0) < 0) {
					iadd.disabled = false;
					ibuy.disabled = false;

					iadd.onclick = () => {
						cart.push(item);
						ibuy.onclick = openPurchasePage;
						iadd.disabled = true;
						checkout.style.display = "block";
					};
					ibuy.onclick = () => {
						cart.push(item);
						openPurchasePage();
						checkout.style.display = "block";
					};
				} else {
					iadd.disabled = true;
					ibuy.disabled = false;
					ibuy.onclick = openPurchasePage;
				}
			} else {
				iadd.disabled = true;
				ibuy.disabled = true;
			}

			{
				const info = await fetchSIO(SIOPath.userinfo, item.user || "anonymous");

				{
					const e = doc.createElement("img");
					e.src = proxyURL(info.icon);
					e.alt = "Avatar";
					e.width = 40;
					e.height = 40;
					e.loading = "eager";
					e.decoding = "sync";
					e.draggable = false;
					itemSeller.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.className = "user";
					e.textContent = info.id;

					switch (info.vip) {
						case 3:
							e.setAttribute("data-vip", "gold");
							break;
						case 4:
							e.setAttribute("data-vip", "diamond");
							break;
						default:
							break;
					}

					itemSeller.appendChild(e);
				}

				itemSeller.onclick = () => {
					openProfile(info.uid).catch((err) => {
						error("Failed to open user profile. Message: " + err);
					});
				};
			}
		};

		navBack.onclick = () => {
			currentPage--;
			updatePageList();

			itemContainer.scrollIntoView({
				behavior: "instant",
				inline: "start",
				block: "start"
			});
		};
		navForward.onclick = () => {
			currentPage++;
			updatePageList();

			itemContainer.scrollIntoView({
				behavior: "instant",
				inline: "start",
				block: "start"
			});
		};
		navPageNo.onblur = () => {
			const value = parseInt(navPageNo.value.trim(), 10) || 0;
			if ((currentPage + 1) !== value) {
				if (value < 1 || value > pages.length) {
					navPageNo.value = "1";
					currentPage = 0;
				} else currentPage = value - 1;

				updatePageList();
				itemContainer.scrollIntoView({
					behavior: "instant",
					inline: "start",
					block: "start"
				});
			}
		};
		navPageNo.onchange = () => {
			navPageNo.blur();
		};

		checkout.onclick = openPurchasePage;
	}

	{
		const addr = $("addr") as HTMLInputElement;
		const mode = $("ub-mode") as HTMLSelectElement;

		mode.value = localStorage.getItem("__unbl_mode_") || "raw-embed-v2";
		mode.onchange = () => {
			localStorage.setItem("__unbl_mode_", mode.value);
		};

		addr.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();

				const input = addr.value.trim();
				if (input.length > 0)
					openFrame(rewriteURL(input, "https://www.google.com/search?igu=1&q="));
			}
		};

		$("ub-google").onclick = () => {
			openFrame("https://www.google.com/webhp?igu=1");
		};
		$("ub-discord").onclick = () => {
			openFrame("https://discord.com/");
		};
		$("ub-facebook").onclick = () => {
			openFrame("https://www.facebook.com/");
		};
		$("ub-instagram").onclick = () => {
			openFrame("https://www.instagram.com/");
		};

		function openFrame(url: string) {
			switch (mode.value) {
				case "raw-embed":
					createFrame(url);
					break;
				case "prq-embed":
					createPRQEmbed(url);
					break;
				case "puppeteer":
					fetchSIO(SIOPath.tunnel, [url, 20]).then((url) => {
						createFrame(url);
					}).catch((err) => {
						error("Failed to create new session. Message: " + err);
					});
					break;
				default:
					fetchSIO(SIOPath.tunnel, [url, 10]).then((url) => {
						createFrame(url);
					}).catch((err) => {
						error("Failed to create new session. Message: " + err);
					});
					break;
			}
		}

		function rewriteURL(value: string, search: string) {
			value = value.replace(/\s+/g, " ").trim();

			const url = optURL(value);
			if (url != null)
				return url.href;

			if (value.includes(" "))
				return search + encodeURIComponent(value);

			const i = value.indexOf("/");
			if (i === 0)
				return search + encodeURIComponent(value);

			if (i > 0) {
				const host = value.substring(0, i);
				if (isHostname(host))
					return "https://" + value;
			} else {
				if (isHostname(value) && value.includes("."))
					return "https://" + value;
			}

			return search + encodeURIComponent(value);
		}

		function isHostname(str: string) {
			str = str.toLowerCase();
			for (let i = 0; i < str.length; i++) {
				const ch = str.charCodeAt(i);
				if ((ch < 48 || ch > 57) && (ch < 97 || ch > 122) && ch !== 45 && ch !== 46) {
					return false;
				}
			}
			return true;
		}
	}

	{
		const emu = $("emulator") as HTMLSelectElement;
		const core = $("core") as HTMLSelectElement;
		const bios = $("bios") as HTMLInputElement;
		const gameRom = $("game-rom") as HTMLInputElement;

		emu.onchange = () => {
			switch (emu.value) {
				case "ps2":
					core.value = "ps2";
					core.disabled = true;
					bios.disabled = true;
					gameRom.accept = ".bin, .iso, application/octet-stream";
					break;
				case "swf":
					core.value = "swf";
					core.disabled = true;
					bios.disabled = true;
					gameRom.accept = ".swf";
					break;
				case "dos":
					core.value = "dos";
					core.disabled = true;
					bios.disabled = true;
					gameRom.accept = ".jsdos, .zip";
					break;
				default:
					core.value = "nes";
					core.disabled = false;
					bios.disabled = false;
					gameRom.removeAttribute("accept");
					break;
			}
		};

		$("startemu").onclick = () => {
			const file = gameRom.files?.item(0);
			if (file == null) {
				error("Please choose a valid game ROM file.");
				return;
			}

			const type = emu.value;
			if (type === "emu") {
				const biosFile = bios.files?.item(0);
				frame.appendChild(createGameFrame(type, [URL.createObjectURL(file), biosFile == null ? "" : biosFile, core.value]));
				frameView.style.display = "block";
				return;
			}

			file.arrayBuffer().then((buf) => {
				frame.appendChild(createGameFrame(type, buf));
				frameView.style.display = "block";
			}).catch((err) => {
				error("Failed to read game file. Message: " + String(err));
			});
		};
	}

	{
		const message = $("upload-message");
		const gameName = $("game-name") as HTMLInputElement;
		const gameType = $("game-type") as HTMLSelectElement;
		const gameFile = $("game-file") as HTMLInputElement;
		const gameTags = $("game-tags") as HTMLInputElement;
		const gameDesc = $("game-desc") as HTMLTextAreaElement;
		const testArea = $("upload-test");
		const testFrame = $("test-frame");
		const uploadBtn = $("upload") as HTMLButtonElement;

		let gameTested: boolean = false;

		message.onclick = () => {
			message.innerHTML = "";
			message.style.display = "none";
		};
		gameFile.onchange = () => {
			gameTested = false;
			testFrame.innerHTML = "";
			testArea.style.display = "none";
		};
		gameType.onchange = () => {
			switch (gameType.value) {
				case "html5":
					gameFile.accept = ".zip";
					break;
				case "flash":
					gameFile.accept = ".swf";
					break;
				case "dos":
					gameFile.accept = ".jsdos";
					break;
				default:
					gameFile.removeAttribute("accept");
					break;
			}
		};
		uploadBtn.onclick = () => {
			if (user == null) {
				error("Invalid session. Please refresh this page and try again.");
				return;
			}

			const name = gameName.value.replace(/\s+/g, " ").trim();
			if (name.length === 0) {
				error("Game name must not be empty.");
				return;
			}
			if (name.length > 256) {
				error("Game name must be less than 256 characters in length.");
				return;
			}

			const file = gameFile.files?.item(0);
			if (file == null) {
				error("Please choose a valid game file.");
				return;
			}

			const size = file.size;
			if (size === 0) {
				error("Uploading empty game files is not allowed.");
				return;
			}
			if (size > 125829120) {
				error("Uploading files larger than 120MB is not supported currently.");
				return;
			}

			const type = gameType.value;
			const desc = gameDesc.value.replace(/\s+/g, " ").trim();
			const tags = gameTags.value.trim().toLowerCase().split(",").map((v) => {
				return v.replace(/\s+/g, " ").trim();
			}).join(",");

			if (tags.length > 300) {
				error("Game tags list must be less than 300 characters long in total.");
				return;
			}
			if (desc.length > 5000) {
				error("Game description text must be less than 5000 characters in length.");
				return;
			}

			switch (type) {
				case "dos":
				case "flash":
					if (!gameTested) {
						file.arrayBuffer().then((buf) => {
							testFrame.appendChild(createGameFrame(type, buf));
							testArea.style.display = "block";
							gameTested = true;
						}).catch((err) => {
							error("Failed to read game file. Message: " + String(err));
						});
						return;
					}
					break;
				case "html5":
					break;
				default:
					error("Please select a valid game type.");
					return;
			}

			uploadBtn.disabled = true;

			message.innerHTML = "Processing...";
			message.style.color = "#808080";
			message.style.display = "block";

			(async () => {
				const sid = await fetchSIO(SIOPath.uploadgame, [user, name, type, tags, desc]);
				for (let i = 0; i < size;) {
					const start = i;
					const end = i += 10485760;

					if (end >= size) {
						const blob = file.slice(start, size, "application/octet-stream");
						await postUploadBuffer(sid, await blob.arrayBuffer(), true);
					} else {
						const blob = file.slice(start, end, "application/octet-stream");
						await postUploadBuffer(sid, await blob.arrayBuffer(), false);
					}
				}
			})().then(() => {
				message.innerHTML = "\u2713Success!";
				message.style.color = "#008000";
				message.style.display = "block";

				gameTested = false;
				testFrame.innerHTML = "";
				testArea.style.display = "none";

				gameName.value = "";
				gameFile.value = "";
				gameTags.value = "";
				gameDesc.value = "";
				uploadBtn.disabled = false;
			}).catch((err) => {
				error("Failed to upload the selected game file. Message: " + String(err));
				message.innerHTML = "\u2715Error";
				message.style.color = "#ff0000";
				message.style.display = "block";
				uploadBtn.disabled = false;
			});
		};

		async function postUploadBuffer(sid: string, buf: ArrayBuffer, end: boolean): Promise<void> {
			if (user == null)
				throw new Error("Invalid user context");

			let msg: any;

			for (let i = 0; i < 10; i++) {
				try {
					await fetchSIO(SIOPath.uploadgame2, [user, sid, buf, end]);
					return;
				} catch (err) {
					msg = err;
				}
			}

			throw new Error("Too many unsuccessful attempts. Message from the last attempt: " + String(msg));
		}
	}

	{
		const itemId = $("item-id") as HTMLInputElement;
		const itemAdd = $("item-add") as HTMLButtonElement;
		const itemName = $("item-name") as HTMLInputElement;
		const itemTags = $("item-tags") as HTMLInputElement;
		const itemPrev = $("item-prev") as HTMLInputElement;
		const itemDel1 = $("item-del1") as HTMLInputElement;
		const itemDel2 = $("item-del2") as HTMLInputElement;
		const itemDesc = $("item-desc") as HTMLInputElement;
		const itemStock = $("item-stock") as HTMLInputElement;
		const itemPrice = $("item-price") as HTMLInputElement;

		const sOrders = $("s-orders");
		const smgrPage = $("store-manager-page");

		itemAdd.onclick = async () => {
			const name = itemName.value.replace(/\s+/g, " ").trim();
			if (name.length === 0) {
				error("Item name must not be empty.");
				return;
			}
			if (name.length > 256) {
				error("Item name must be less than 256 characters in length.");
				return;
			}

			const tags = itemTags.value.trim().toLowerCase().split(",").map((v) => v.replace(/\s+/g, " ").trim()).join(",");
			if (tags.length === 0) {
				error("Item must have at least one tag.");
				return;
			}
			if (tags.length > 300) {
				error("Item tags list must be less than 300 characters long in total.");
				return;
			}

			const desc = itemDesc.value.replace(/\s+/g, " ").trim();
			if (desc.length < 10) {
				error("Item description must have at least 10 characters.");
				return;
			}
			if (desc.length > 5000) {
				error("Item description text must be less than 5000 characters in length.");
				return;
			}

			const del1 = parseFloat(itemDel1.value) || 0;
			const del2 = parseFloat(itemDel2.value) || 0;

			if (del1 < 0 || del1 > 99.99 || del2 < 0 || del2 > 99.99) {
				error("Item delivery price must be between the range: 0-99.99");
				return;
			}

			const stock = parseInt(itemStock.value, 10) || 0;
			if (stock < 1 || stock > 99999) {
				error("Item stock must be between the range: 1-99999");
				return;
			}

			const price = parseFloat(itemPrice.value) || 0;
			if (price < 0.01 || price > 999.99) {
				error("Item price must be between the range: 0.01-999.99");
				return;
			}

			const previews: any[] = Array.from(itemPrev.files || []);
			if (previews.length < 1) {
				error("Please provide at least one preview image for this item.");
				return;
			}
			if (previews.length > 10) {
				error("The maximum number of preview images allowed for this item is 10.");
				return;
			}

			itemAdd.disabled = true;

			for (let i = 0; i < previews.length; i++) {
				const blob = await resizeImage(previews[i], 400, 300);
				if (blob == null) {
					error("Error: Failed to decode and resize preview images.");
					return;
				}

				previews[i] = await blob.arrayBuffer();
			}

			try {
				await fetchSIO(SIOPath.addproduct, [user, itemId.value.trim(), name, tags, desc, previews, stock, price, del1, del2]);
			} catch (err) {
				error("Failed to add this item. Message: " + err);
			}

			itemId.value = "";
			itemName.value = "";
			itemTags.value = "";
			itemPrev.value = "";
			itemDesc.value = "";
			itemStock.value = "";
			itemPrice.value = "";

			itemAdd.disabled = false;
		};

		$("sm").onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});

			sOrders.innerHTML = "Loading...";
			sideMenu.checked = false;
			smgrPage.setAttribute("data-current", "");

			fetchSIO(SIOPath.getSOrders, user).then((list: OrderList) => {
				if (!Array.isArray(list) || list.length < 1) {
					sOrders.innerHTML = "You don't have any orders yet.";
					return;
				}

				const elem = doc.createElement("table");
				elem.innerHTML = `<thead><tr><th scope="col">ID</th><th scope="col">Date</th><th scope="col">Items</th><th scope="col">Price*</th><th scope="col">Contact</th><th scope="col">Address</th><th scope="col">Confirm Payment &amp; Delivery</th></tr></thead>`;

				{
					const e = doc.createElement("tbody");
					for (const it of list) {
						const el = doc.createElement("tr");

						{
							const e = doc.createElement("td");
							e.textContent = it.id;
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");
							e.textContent = dateToStr(it.date);
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");
							for (const p of it.pros) {
								const elem = doc.createElement("div");
								for (const e of itemList) {
									if (e.date.toString(36) === p) {
										elem.textContent = e.name;
										break;
									}
								}
								e.appendChild(elem);
							}
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");
							e.textContent = "$" + it.price.toFixed(2);
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");
							e.textContent = it.buyerEmail;
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");
							e.textContent = it.address;
							el.appendChild(e);
						}
						{
							const e = doc.createElement("td");

							switch (it.state) {
								case 0:
									{
										const btn = doc.createElement("button");
										btn.type = "button";
										btn.textContent = "Confirm";
										btn.onclick = () => {
											fetchSIO(SIOPath.confirmorder, [user, it.id]).then(() => {
												e.innerHTML = "Confirmed";
											}).catch((err) => {
												error("Failed to confirm payment. Message: " + err);
											});
										};
										e.appendChild(btn);
									}
									{
										const btn = doc.createElement("button");
										btn.type = "button";
										btn.textContent = "Reject";
										btn.onclick = () => {
											fetchSIO(SIOPath.cancelorder, [user, it.id, true]).then(() => {
												e.innerHTML = "Rejected";
											}).catch((err) => {
												error("Failed to reject payment. Message: " + err);
											});
										};
										e.appendChild(btn);
									}
									break;
								case 1:
									e.innerHTML = "Aborted";
									break;
								case 2:
									e.innerHTML = "Confirmed";
									break;
								default:
									e.innerHTML = "Not Allowed";
									break;
							}

							el.appendChild(e);
						}

						e.appendChild(el);
					}
					elem.appendChild(e);
				}

				sOrders.innerHTML = "<div>* including additional delivery fee</div>";
				sOrders.prepend(elem);
			}).catch((err) => {
				error("Failed to fetch order list. Message: " + err);
			});
		};
	}

	{
		const payu = $("payu") as HTMLButtonElement;

		payu.onclick = () => {
			const desc = paydesc.value.trim();
			if (desc.length > 1000) {
				error("Payment description must have more than 1000 characters in length.");
				return;
			}

			payu.disabled = true;

			fetchSIO(SIOPath.updatepayment, [user, desc, paycc.value]).then(() => {
				payu.disabled = false;
			}).catch((err) => {
				error("Failed to update payment description. Message: " + err);
			});
		};
	}

	{
		const picker = $("picker");
		const msglist = $("msglist");
		const history = $("history");
		const channels = $("channels");
		const ufileBtn = $("ufile") as HTMLInputElement;
		const messages = $("messages");
		const msgElems = messages.children;
		const chnlname = $("chname");
		const chnlinfo = $("chinfo") as HTMLButtonElement;
		const inputElem = $("sendmsg") as HTMLInputElement;

		const global = $("global") as HTMLButtonElement;
		const friends = $("friends") as HTMLButtonElement;
		const chatgpt = $("chatgpt") as HTMLButtonElement;
		const starter = $("starter");

		{
			const chat = $("chat");
			const menu = $("sidemenu");
			const toggle = $("toggle");

			toggle.onclick = () => {
				if (toggle.title === "Close") {
					toggle.title = "Menu";
					chat.style.width = "100%";
					menu.style.display = "none";
				} else {
					toggle.title = "Close";
					chat.removeAttribute("style");
					menu.removeAttribute("style");
				}
			};
			if (docBody.clientWidth < 800) {
				toggle.title = "Menu";
				chat.style.width = "100%";
				menu.style.display = "none";
			}
		}

		{
			const dmUn = $("dm-un") as HTMLInputElement;
			const dmBtn = $("dm-btn") as HTMLButtonElement;

			dmBtn.onclick = async () => {
				const value = dmUn.value.trim().toLowerCase();
				if (value.length < 4 || value.length > 20 || !/^[\-a-z0-9]+$/.test(value)) {
					error("Please provide a valid username.");
					return;
				}

				dmBtn.disabled = true;

				try {
					await openChat(await fetchSIO(SIOPath.userinfo, "@" + value));
				} catch (err) {
					error("Failed to started new chat. Message: " + err);
				}

				dmUn.value = "";
				dmBtn.disabled = false;
			};
		}

		{
			const chatBtn = $("chat-btn") as HTMLButtonElement;
			const chatBtn2 = $("goto-chat") as HTMLButtonElement;
			const chatPage = $("community-page");
			const channelElems = channels.children;
			const msglistElems = msglist.children;

			const groupId = $("grid");
			const groupPage = $("group-page");
			const groupEdit = $("gredit")
			const groupName = $("grname");
			const groupCode = $("grcode");
			const groupLink = $("grlink");
			const groupUsers = $("grusers");

			let tmpChIcon: string | undefined;
			let tmpChName: string | undefined;
			let tmpChVip: number | undefined;
			let fetching: boolean = false;
			let privChnl: boolean = false;
			let channel: string | undefined;
			let oldest: string | undefined;

			function createMemberElement({ id, uid, vip, icon }: UserInfo): HTMLElement {
				const elem = doc.createElement("div");

				const img = doc.createElement("img");
				img.src = proxyURL(icon);
				img.alt = "Avatar";
				img.width = 48;
				img.height = 48;
				img.loading = "lazy";
				img.decoding = "async";
				img.draggable = false;
				elem.appendChild(img);

				{
					const e = doc.createElement("div");
					e.className = "user";
					e.textContent = id;

					switch (vip) {
						case 3:
							e.setAttribute("data-vip", "gold");
							break;
						case 4:
							e.setAttribute("data-vip", "diamond");
							break;
						default:
							break;
					}

					img.onclick = e.onclick = () => {
						openProfile(uid).catch((err) => {
							error("Failed to open user profile. Message: " + err);
						});
					};

					elem.appendChild(e);
				}

				if (channel != null && privChnl) {
					const e = doc.createElement("button");
					e.type = "button";
					e.title = "Kick user";
					e.className = "cross";
					e.onclick = () => {
						fetchSIO(SIOPath.kickgroupuser, [user, channel, uid]).then(() => {
							elem.remove();
						}).catch((err) => {
							error("Failed to kick this user. Message: " + err);
						});
					};
					elem.appendChild(e);
				}

				return elem;
			}

			function createMessageElement({ id, msg, uid, vip, user: _user, icon, files }: Message): HTMLElement {
				const elem = doc.createElement("div");
				elem.setAttribute("id", id);

				const usr = doc.createElement("div");
				usr.className = "user";
				usr.textContent = _user;

				switch (vip) {
					case 3:
						usr.setAttribute("data-vip", "gold");
						break;
					case 4:
						usr.setAttribute("data-vip", "diamond");
						break;
					default:
						break;
				}

				{
					const img = doc.createElement("img");
					img.src = proxyURL(icon);
					img.alt = "Avatar";
					img.width = 32;
					img.height = 32;
					img.loading = "lazy";
					img.decoding = "async";
					img.draggable = false;

					if (uid != null) {
						img.style.cursor = usr.style.cursor = "pointer";
						img.onclick = usr.onclick = () => {
							openProfile(uid).catch((err) => {
								error("Failed to open user profile. Message: " + err);
							});
						};
					}

					elem.appendChild(img);
				}

				const wid = doc.createElement("div");
				wid.appendChild(usr);

				if (msg.length > 0) {
					const el = doc.createElement("span");
					el.textContent = msg;
					wid.appendChild(el);

					if (myuid != null && (privChnl || uid === myuid)) {
						{
							const e = doc.createElement("button");
							e.type = "button";
							e.title = "Edit";
							e.className = "edit";

							e.onclick = () => {
								const elem = doc.createElement("div");

								const input = doc.createElement("input");
								input.type = "text";
								input.value = msg;
								input.required = true;
								input.minLength = 1;
								input.maxLength = 1000;
								input.placeholder = "Message";
								input.autocomplete = "off";
								elem.appendChild(input);

								const tick = doc.createElement("button");
								tick.type = "button";
								tick.title = "Save";
								tick.className = "tick";
								elem.appendChild(tick);

								const cross = doc.createElement("button");
								cross.type = "button";
								cross.title = "Cancel";
								cross.className = "cross";
								elem.appendChild(cross);

								tick.onclick = () => {
									const value = input.value.trim();
									if (value.length < 1) {
										error("Messages cannot be empty.");
										return;
									}
									if (value.length > 1000) {
										error("Messages cannot be longer than 1000 characters.");
										return;
									}
									if (user == null || channel == null) {
										error("Invalid context. Please refresh this page.");
										return;
									}

									fetchSIO(SIOPath.editmessage, [user, id, channel, value]).then(() => {
										msg = value;
										elem.remove();
										e.disabled = false;
									}).catch((err) => {
										error("Failed to update message. Reason: " + err);
									});
								};
								cross.onclick = () => {
									elem.remove();
									e.disabled = false;
									el.innerHTML = msg;
								};

								e.disabled = true;
								el.innerHTML = "";
								el.appendChild(elem);
							};

							elem.appendChild(e);
						}
						{
							const e = doc.createElement("button");
							e.type = "button";
							e.title = "Delete";
							e.className = "delete";

							e.onclick = () => {
								if (user == null || channel == null) {
									error("Invalid context. Please refresh this page.");
									return;
								}

								e.disabled = true;

								fetchSIO(SIOPath.editmessage, [user, id, channel, ""]).catch((err) => {
									error("Failed to delete message. Reason: " + err);
								});
							};

							elem.appendChild(e);
						}
					}
				}

				for (const { name, type, url } of files) {
					const purl = proxyURL(url);

					{
						const e = doc.createElement("a");
						e.rel = "noopener nofollow"
						e.href = purl;
						e.target = "_blank";
						e.download = "";
						e.textContent = name || "file";
						wid.appendChild(e);
					}

					switch (type.split("/", 2)[0]) {
						case "image":
							{
								const e = doc.createElement("img");
								e.src = purl;
								e.alt = "Attachment";
								e.width = 500;
								e.height = 500;
								e.loading = "lazy";
								e.decoding = "async";
								e.draggable = false;
								wid.appendChild(e);
							}
							break;
						case "audio":
							{
								const e = doc.createElement("audio");
								e.src = purl;
								e.volume = 0.8;
								e.preload = "metadata"
								e.controls = true;
								wid.appendChild(e);
							}
							break;
						case "video":
							{
								const e = doc.createElement("video");
								e.src = purl;
								e.muted = true;
								e.width = 500;
								e.height = 500;
								e.volume = 0.8;
								e.autoplay = true;
								e.controls = true;
								wid.appendChild(e);
							}
							break;
					}
				}

				elem.appendChild(wid);

				return elem;
			}

			function createChannelElement(id: string, name: string, code: string, users: string[]): HTMLElement {
				const elem = doc.createElement("div");
				elem.setAttribute("id", id);

				{
					const e = doc.createElement("img");
					e.src = "/res/group.svg";
					e.alt = "Group";
					e.width = 32;
					e.height = 32;
					e.loading = "lazy";
					e.decoding = "async";
					e.draggable = false;
					elem.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.textContent = name;
					elem.appendChild(e);
				}

				elem.onclick = () => {
					if (!fetching) {
						fetching = true;
						messages.innerHTML = "<div>Loading...</div>";
						privChnl = myuid != null && users[0] === myuid;

						fetchSIO(SIOPath.getmessages, [user, channel = id]).then((msgs: Message[]) => {
							oldest = msgs[msgs.length - 1]?.id;
							messages.innerHTML = "";

							for (const msg of msgs)
								messages.prepend(createMessageElement(msg));

							messages.scrollTo({
								behavior: "instant",
								left: 0,
								top: messages.scrollHeight
							});

							for (const e of msglistElems)
								e.removeAttribute("data-current");

							chnlinfo.setAttribute("data-op", "grinfo");
							chnlinfo.title = "View channel info";
							chnlinfo.onclick = () => {
								if (unblEndSes != null)
									unblEndSes();
								for (const elem of curElems)
									elem.removeAttribute("data-current");

								groupPage.setAttribute("data-current", "");
								sideMenu.checked = false;
								content.scrollTo({
									top: 0,
									left: 0,
									behavior: "instant"
								});

								groupId.textContent = id;
								groupName.textContent = name;
								groupCode.textContent = code;
								groupLink.textContent = Constants.origin + "/join/" + code;
								groupEdit.style.display = privChnl ? "block" : "none";

								fetchSIO(SIOPath.getgroupusers, [user, id, 0]).then((list: any[]) => {
									groupUsers.innerHTML = "";

									if (list.length > 0) {
										let index: number = 0;

										for (const it of list)
											groupUsers.appendChild(createMemberElement(it));

										groupUsers.onscrollend = () => {
											if (groupUsers.scrollTop >= (groupUsers.scrollHeight - groupUsers.clientHeight) && index >= 0) {
												fetchSIO(SIOPath.getgroupusers, [user, id, index += 10]).then((list: any[]) => {
													if (list.length < 10)
														index = -1;

													for (const it of list)
														groupUsers.appendChild(createMemberElement(it));
												});
											}
										};
									}
								}).catch((err) => {
									error("Failed to fetch the list. Message: " + err);
								});
							};

							elem.setAttribute("data-current", "");
							starter.style.display = "none";
							chnlname.textContent = name;
							fetching = false;
						}).catch((err) => {
							error("Failed to initialize channel. Message: " + err);
							fetching = false;
						});
					}
				};

				return elem;
			}

			function createDMChannelElement(id: string, uid: string, vip: number | nul, name: string, icon: string): HTMLElement {
				const elem = doc.createElement("div");
				elem.setAttribute("id", id);
				elem.setAttribute("data-user", uid);

				{
					const e = doc.createElement("img");
					e.src = proxyURL(icon);
					e.alt = "Avatar";
					e.width = 32;
					e.height = 32;
					e.loading = "lazy";
					e.decoding = "async";
					e.draggable = false;
					elem.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.className = "user";
					e.textContent = name;

					switch (vip) {
						case 3:
							e.setAttribute("data-vip", "gold");
							break;
						case 4:
							e.setAttribute("data-vip", "diamond");
							break;
						default:
							break;
					}

					elem.appendChild(e);
				}

				elem.onclick = () => {
					if (!fetching) {
						fetching = true;
						messages.innerHTML = "<div>Loading...</div>";

						fetchSIO(SIOPath.getmessages, [user, channel = id]).then((msgs: Message[]) => {
							oldest = msgs[msgs.length - 1]?.id;
							messages.innerHTML = "";

							for (const msg of msgs)
								messages.prepend(createMessageElement(msg));

							messages.scrollTo({
								behavior: "instant",
								left: 0,
								top: messages.scrollHeight
							});

							for (const e of msglistElems)
								e.removeAttribute("data-current");

							chnlinfo.setAttribute("data-op", "profile");
							chnlinfo.title = "View user profile";
							chnlinfo.onclick = () => {
								openProfile(uid).catch((err) => {
									error("Failed to open user profile. Message: " + err);
								});
							};

							elem.setAttribute("data-current", "");
							starter.style.display = "none";
							chnlname.textContent = name;
							fetching = false;
						}).catch((err) => {
							error("Failed to initialize channel. Message: " + err);
							fetching = false;
						});
					}
				};

				return elem;
			}

			function handleMessageCreate(chnl: string, msg: Message) {
				if (channel === chnl) {
					const top = messages.scrollHeight - messages.clientHeight;
					messages.appendChild(createMessageElement(msg));

					if (top === messages.scrollTop) {
						messages.scrollTo({
							behavior: "instant",
							left: 0,
							top: messages.scrollHeight
						});
					}
				}
			}

			function handleMessageDelete(chnl: string, msgId: string) {
				if (channel === chnl) {
					for (const elem of msgElems) {
						if (elem.getAttribute("id") === msgId) {
							elem.remove();
							break;
						}
					}
				}
			}

			function handleMessageUpdate(chnl: string, msgId: string, text: string) {
				if (channel === chnl) {
					for (const elem of msgElems) {
						if (elem.getAttribute("id") === msgId) {
							const e = elem.querySelector("div>span");
							if (e != null)
								e.textContent = text;
							else
								error("Failed to update message: " + msgId);
							break;
						}
					}
				}
			}

			async function openGlobalChat() {
				global.disabled = true;
				friends.disabled = true;
				chatgpt.disabled = true;
				chatBtn.disabled = true;
				chatBtn2.disabled = true;
				ufileBtn.disabled = true;
				inputElem.disabled = true;

				if (channelElems.length === 0) {
					try {
						const list: string[] = await fetchSIO(SIOPath.requestchannels);
						for (const it of list) {
							if (it[0] === "#") {
								const elem = doc.createElement("span");
								elem.textContent = it.slice(1);
								channels.appendChild(elem);
							} else {
								const [name, id, attr] = it.split(":", 3);
								const elem = doc.createElement("div");
								elem.setAttribute("id", id);
								elem.textContent = name;
								elem.onclick = () => {
									if (!fetching) {
										fetching = true;
										privChnl = false; // always
										messages.innerHTML = "<div>Loading...</div>";

										fetchSIO(SIOPath.requestmessages, [channel = id]).then((msgs: Message[]) => {
											oldest = msgs[msgs.length - 1]?.id;
											messages.innerHTML = "";

											for (const msg of msgs)
												messages.prepend(createMessageElement(msg));

											messages.scrollTo({
												behavior: "instant",
												left: 0,
												top: messages.scrollHeight
											});

											for (const e of channelElems)
												e.removeAttribute("data-current");

											ufileBtn.style.display = attr === "f" ? "block" : "none";
											elem.setAttribute("data-current", "");
											chnlname.textContent = name;
											fetching = false;
										}).catch((err) => {
											error("Failed to initialize channel. Message: " + err);
											fetching = false;
										});
									}
								};
								channels.appendChild(elem);
							}
						}
					} catch (err) {
						error("Failed to load channel list. Message: " + err);
						return;
					}
				}

				channel = void 0;
				messages.innerHTML = "";
				chnlname.innerHTML = "Server";
				starter.style.display = "none";

				chnlinfo.setAttribute("data-op", "discord");
				chnlinfo.title = "Open chat in Discord";
				chnlinfo.onclick = () => {
					openPopupWindow("https://discord.gg/djdH3kVd4v");
				};

				onMessageCreate = handleMessageCreate;
				onMessageDelete = handleMessageDelete;
				onMessageUpdate = handleMessageUpdate;

				{
					const firstEl = channels.querySelector("div");
					if (firstEl != null) {
						messages.onscrollend = () => {
							if (!fetching && channel != null && messages.scrollTop < 100) {
								fetching = true;

								fetchSIO(SIOPath.requestmessages, [channel, oldest]).then((msgs: Message[]) => {
									if (msgs.length > 0) {
										const height = messages.scrollHeight;
										oldest = msgs[msgs.length - 1].id;

										for (const msg of msgs)
											messages.prepend(createMessageElement(msg));

										messages.scrollTo({
											behavior: "instant",
											left: 0,
											top: messages.scrollHeight - height
										});
									}
									fetching = false;
								}).catch((err) => {
									error("Failed to fetch messages. Reason: " + err);
									fetching = false;
								});
							}
						};
						inputElem.onkeydown = (e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								e.stopPropagation();

								if (user == null) {
									accnBtn.click();
									return;
								}

								const msg = inputElem.value.trim();
								if (msg.length < 1) {
									error("Messages cannot be empty.");
									return;
								}
								if (msg.length > 1000) {
									error("Messages cannot be longer than 1000 characters.");
									return;
								}

								if (channel == null) {
									error("Please select a valid channel for posting messages.");
									return;
								}

								inputElem.value = "";
								inputElem.disabled = true;

								fetchSIO(SIOPath.postmessage, [user, channel, msg]).then(() => {
									inputElem.disabled = false;
								}).catch((err) => {
									error("Failed to post text message. Message: " + err);
									inputElem.disabled = false;
								});
							}
						};
						firstEl.click();
					} else {
						channels.innerHTML = "No public channels are available at this moment.";
						inputElem.onkeydown = messages.onscrollend = null;
					}
				}

				inputElem.onfocus = (e) => {
					e.preventDefault();
					e.stopPropagation();

					if (user == null)
						accnBtn.click();
				};

				friends.removeAttribute("data-current");
				chatgpt.removeAttribute("data-current");
				global.setAttribute("data-current", "");

				msglist.removeAttribute("style");
				history.removeAttribute("style");
				channels.style.display = "block";

				global.disabled = false;
				friends.disabled = false;
				chatgpt.disabled = false;
				chatBtn.disabled = false;
				chatBtn2.disabled = false;
				ufileBtn.disabled = false;
				inputElem.disabled = false;
			}

			async function openPrivateChat() {
				if (user == null || myuid == null) {
					accnBtn.click();
					return;
				}

				global.disabled = true;
				friends.disabled = true;
				chatgpt.disabled = true;
				chatBtn.disabled = true;
				chatBtn2.disabled = true;
				ufileBtn.disabled = true;
				inputElem.disabled = true;

				// since the message list is dynamic, we always re-fetch the list regardlessly
				channel = void 0;
				msglist.innerHTML = "";
				messages.innerHTML = "";
				chnlname.innerHTML = "Messages";
				starter.style.display = "block";
				chnlinfo.removeAttribute("data-op");

				try {
					for (const { id, name, mode, code, users } of await fetchSIO(SIOPath.getchannels, user)) {
						if (mode === "0") {
							const { id: user, uid, vip, icon } = await fetchSIO(SIOPath.userinfo, users[0]);
							msglist.appendChild(createDMChannelElement(id, uid, vip, user, icon));
						} else msglist.appendChild(createChannelElement(id, name, code, users));
					}
				} catch (err) {
					error("Failed to load friends list. Message: " + err);
					return;
				}

				onMessageCreate = handleMessageCreate;
				onMessageDelete = handleMessageDelete;
				onMessageUpdate = handleMessageUpdate;

				messages.onscrollend = () => {
					if (!fetching && channel != null && messages.scrollTop < 100) {
						fetching = true;

						fetchSIO(SIOPath.getmessages, [user, channel, oldest]).then((msgs: Message[]) => {
							if (msgs.length > 0) {
								const height = messages.scrollHeight;
								oldest = msgs[msgs.length - 1].id;

								for (const msg of msgs)
									messages.prepend(createMessageElement(msg));

								messages.scrollTo({
									behavior: "instant",
									left: 0,
									top: messages.scrollHeight - height
								});
							}
							fetching = false;
						}).catch((err) => {
							error("Failed to fetch messages. Reason: " + err);
							fetching = false;
						});
					}
				};
				inputElem.onkeydown = (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();

						const msg = inputElem.value.trim();
						if (msg.length < 1) {
							error("Messages cannot be empty.");
							return;
						}
						if (msg.length > 1000) {
							error("Messages cannot be longer than 1000 characters.");
							return;
						}

						if (channel == null) {
							error("Please select a valid channel before posting messages.");
							return;
						}

						inputElem.value = "";
						inputElem.disabled = true;

						(async () => {
							if (channel.startsWith("tmp$")) {
								const uid = channel.slice(4);

								try {
									const e = createDMChannelElement(channel = await fetchSIO(SIOPath.newdmchannel, [user, uid]),
										uid, tmpChVip, tmpChName || "", tmpChIcon || "/res/user.svg");

									e.setAttribute("data-current", "");
									msglist.appendChild(e);
								} catch (err) {
									error("Failed to create new channel. Message: " + err);
									return;
								}

								messages.innerHTML = "";
							}

							try {
								await fetchSIO(SIOPath.postmessage, [user, channel, msg]);
							} catch (err) {
								error("Failed to post text message. Reason: " + err);
							}
						})().then(() => {
							inputElem.disabled = false;
						});
					}
				};

				global.removeAttribute("data-current");
				chatgpt.removeAttribute("data-current");
				friends.setAttribute("data-current", "1");

				history.removeAttribute("style");
				channels.removeAttribute("style");
				msglist.style.display = "block";
				ufileBtn.style.display = "block";

				global.disabled = false;
				friends.disabled = false;
				chatgpt.disabled = false;
				chatBtn.disabled = false;
				chatBtn2.disabled = false;
				ufileBtn.disabled = false;
				inputElem.disabled = false;
			}

			{
				const grName = $("gr-name") as HTMLInputElement;
				const grCode = $("gr-code") as HTMLInputElement;
				const grJoin = $("gr-join") as HTMLButtonElement;
				const grCreate = $("gr-create") as HTMLButtonElement;

				grName.onblur = () => {
					const value = grName.value.trim();
					if (value.length > 0)
						grName.value = value;
				};
				grCode.onblur = () => {
					const value = grCode.value.trim();
					if (value.length > 0)
						grCode.value = value;
				};

				grJoin.onclick = () => {
					const value = grCode.value.trim();
					if (value.length !== 12) {
						error("The invite code must have exactly 12 characters.");
						return;
					}

					grJoin.disabled = true;

					fetchSIO(SIOPath.joingroupchat, [user, value]).then(({ id, name, users }) => {
						{
							const e = createChannelElement(channel = id, name, value, users);
							e.setAttribute("data-current", "");
							msglist.appendChild(e);
							e.click();
						}

						starter.style.display = "none";
						grJoin.disabled = false;
					}).catch((err) => {
						error("Failed to join group chat. Message: " + err);
						grJoin.disabled = false;
					});
				};
				grCreate.onclick = () => {
					const value = grName.value.trim();
					if (value.length < 2) {
						error("Group name must contain at least 2 characters.");
						return;
					}
					if (value.length > 30) {
						error("Group name cannot be longer than 30 characters.");
						return;
					}
					if (value.indexOf(",", 0) >= 0 || value.indexOf(";", 0) >= 0) {
						error("Group names are not allowed to include commas and semicolons.")
						return;
					}

					grCreate.disabled = true;

					fetchSIO(SIOPath.newgroupchat, [user, value]).then(({ id, name, code, users }) => {
						{
							const e = createChannelElement(channel = id, name, code, users);
							e.setAttribute("data-current", "");
							msglist.appendChild(e);
							e.click();
						}

						starter.style.display = "none";
						grCreate.disabled = false;
					}).catch((err) => {
						error("Failed to create new group. Message: " + err);
						grCreate.disabled = false;
					});
				};
			}

			{
				const elem = doc.createElement("input");
				elem.type = "file";
				elem.multiple = true;
				elem.onchange = async () => {
					if (channel == null) {
						error("Please select a valid channel before uploading files.");
						return;
					}

					const list = elem.files;
					if (list != null && list.length > 0) {
						if (list.length > 10) {
							error("Uploading more than 10 files at once is not supported.");
							return;
						}

						ufileBtn.disabled = true;
						inputElem.disabled = true;

						try {
							const files: any[] = [];
							let tSize: number = 0;

							for (const it of list) {
								const size = it.size;
								if (size < 1)
									throw new Error("Empty files are not allowed.");
								if (size > 10000000)
									throw new Error("Files larger than 10MB are not supported.");
								if ((tSize += size) > 12000000)
									throw new Error("The total size of a single upload cannot exceed 12MB.");

								files.push({
									name: it.name,
									attachment: await it.arrayBuffer()
								});
							}

							await fetchSIO(SIOPath.postFileMessage, [user, channel, files]);
						} catch (err) {
							error("Failed to upload file. Message: " + err);
						}

						elem.value = ""; // remove selected files to free memory
						ufileBtn.disabled = false;
						inputElem.disabled = false;
					}
				};

				ufileBtn.onclick = () => {
					elem.click();
				};
			}

			$("grleave").onclick = () => {
				if (channel == null || channel[0] !== "m") {
					error("The selected channel is not valid.");
					return;
				}

				fetchSIO(SIOPath.leavegroupchat, [user, channel]).then(() => {
					if (unblEndSes != null)
						unblEndSes();
					for (const elem of curElems)
						elem.removeAttribute("data-current");

					sideMenu.checked = false;
					chatPage.setAttribute("data-current", "");
					chatBtn.setAttribute("data-current", "");
					content.scrollTo({
						top: 0,
						left: 0,
						behavior: "instant"
					});

					openPrivateChat();
				}).catch((err) => {
					error("Failed to leave the group. Message: " + err);
				});
			};
			groupEdit.onclick = () => {
				const elem = doc.createElement("div");

				const input = doc.createElement("input");
				input.type = "text";
				input.value = groupName.innerHTML;
				input.required = true;
				input.minLength = 2;
				input.maxLength = 30;
				input.placeholder = "Group Name";
				input.autocomplete = "off";
				elem.appendChild(input);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Save";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				input.onblur = () => {
					const value = input.value.trim();
					if (value.length > 0)
						input.value = value;
				};
				tick.onclick = () => {
					if (channel == null || channel[0] !== "m" || !privChnl) {
						error("The selected channel is not valid.");
						return;
					}

					const value = input.value.trim();
					if (value.length < 2) {
						error("Group name must contain at least 2 characters.");
						return;
					}
					if (value.length > 30) {
						error("Group name cannot be longer than 30 characters.");
						return;
					}
					if (value.indexOf(",", 0) >= 0 || value.indexOf(";", 0) >= 0) {
						error("Group names are not allowed to include commas and semicolons.")
						return;
					}

					fetchSIO(SIOPath.changegroupname, [user, channel, value]).then(() => {
						elem.replaceWith(groupEdit);
						groupName.textContent = value;
					}).catch((err) => {
						error("Failed to update group name. Message: " + err);
					});
				};
				cross.onclick = () => {
					elem.replaceWith(groupEdit);
				};

				groupEdit.replaceWith(elem);
				input.select();
			};
			chatBtn.onclick = chatBtn2.onclick = () => {
				if (unblEndSes != null)
					unblEndSes();
				for (const elem of curElems)
					elem.removeAttribute("data-current");

				sideMenu.checked = false;
				chatPage.setAttribute("data-current", "");
				chatBtn.setAttribute("data-current", "");
				content.scrollTo({
					top: 0,
					left: 0,
					behavior: "instant"
				});

				if (channel == null)
					openGlobalChat();
			};
			friends.onclick = () => {
				openPrivateChat();
			};
			global.onclick = () => {
				openGlobalChat();
			};

			openChat = async ({ id, uid, vip, icon }: UserInfo) => {
				await openPrivateChat();
				starter.style.display = "none";

				if (unblEndSes != null)
					unblEndSes();
				for (const elem of curElems)
					elem.removeAttribute("data-current");

				sideMenu.checked = false;
				chatPage.setAttribute("data-current", "");
				chatBtn.setAttribute("data-current", "");
				content.scrollTo({
					top: 0,
					left: 0,
					behavior: "instant"
				});

				for (const elem of msglistElems) {
					if (elem.getAttribute("data-user") === uid) {
						(elem as HTMLElement).click();
						return;
					}
				}

				channel = "tmp$" + uid;
				tmpChVip = vip || void 0;
				tmpChIcon = icon;
				chnlname.innerHTML = tmpChName = id;
				messages.innerHTML = "<div>Send a message to start a new chat with " + id + ".</div>";

				for (const e of msglistElems)
					e.removeAttribute("data-current");
			};

			openChannel = async (chId: String) => {
				if (chId[0] === "m") {
					await openPrivateChat();
					starter.style.display = "none";

					for (const e of msglistElems) {
						if (e.getAttribute("id") === chId) {
							(e as HTMLElement).click();
							break;
						}
					}
				} else {
					await openGlobalChat();

					for (const e of channelElems) {
						if (e.getAttribute("id") === chId) {
							(e as HTMLElement).click();
							break;
						}
					}
				}

				if (unblEndSes != null)
					unblEndSes();
				for (const elem of curElems)
					elem.removeAttribute("data-current");

				sideMenu.checked = false;
				chatPage.setAttribute("data-current", "");
				chatBtn.setAttribute("data-current", "");
				content.scrollTo({
					top: 0,
					left: 0,
					behavior: "instant"
				});
			};
		}

		{
			const historyElems = history.children;

			let gptmsgs: GPTMessage[] | null = null;
			const chats: GPTChat[] = JSON.parse(localStorage.getItem("__chats") || "[]");

			function initMsg({ role, text }: GPTMessage): HTMLElement {
				const elem = doc.createElement("div");

				{
					const e = doc.createElement("img");
					e.width = 32;
					e.height = 32;
					e.loading = "lazy";
					e.decoding = "async";
					e.draggable = false;

					if (role === "u") {
						e.src = "res/user.svg";
						e.alt = "User";
					} else {
						e.src = "res/bot.svg";
						e.alt = "Assistant";
					}

					elem.appendChild(e);
				}

				{
					const e = doc.createElement("div");
					e.textContent = text;
					elem.appendChild(e);
				}

				messages.appendChild(elem);
				return elem;
			}

			function initChat(chat: GPTChat) {
				const title = chat.title;
				if (typeof title !== "string")
					throw new Error("Invalid chat object");

				const elem = doc.createElement("div");
				elem.onclick = () => {
					for (const e of historyElems)
						e.removeAttribute("data-current");

					elem.setAttribute("data-current", "1");
					messages.innerHTML = "";
					chnlname.textContent = title;

					for (const msg of (gptmsgs = chat.msgs))
						initMsg(msg);

					messages.scrollTo({
						behavior: "instant",
						left: 0,
						top: messages.scrollHeight
					});
				};

				{
					const e = doc.createElement("div");
					e.textContent = title;
					elem.appendChild(e);
				}

				{
					const e = doc.createElement("button");
					e.type = "button";
					e.title = "Delete";
					e.onclick = (e) => {
						e.preventDefault();
						e.stopPropagation();

						const i = chats.indexOf(chat, 0);
						if (i >= 0) {
							gptmsgs = null;
							elem.remove();
							chats.splice(i, 1);
							messages.innerHTML = "";
							localStorage.setItem("__chats", JSON.stringify(chats, void 0, 0));
						}
					};
					elem.appendChild(e);
				}

				history.appendChild(elem);
			}

			$("newchat").onclick = () => {
				for (const e of historyElems)
					e.removeAttribute("data-current");

				gptmsgs = null;
				messages.innerHTML = "";
				chnlname.innerHTML = "New chat";
			};

			chatgpt.onclick = () => {
				for (const e of historyElems)
					e.removeAttribute("data-current");

				gptmsgs = null;
				messages.innerHTML = "";
				chnlname.innerHTML = "New chat";
				starter.style.display = "none";
				chnlinfo.removeAttribute("data-op");

				// remove message handlers
				onMessageCreate = null;
				onMessageDelete = null;
				onMessageUpdate = null;

				if (historyElems.length < 2) {
					for (const chat of chats)
						initChat(chat);
				}

				inputElem.onfocus = messages.onscrollend = null;
				inputElem.onkeydown = (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();

						const msg = inputElem.value.trim();
						if (msg.length < 1) {
							error("Messages cannot be empty.");
							return;
						}
						if (msg.length > 8000) {
							error("Messages cannot be longer than 8000 characters.");
							return;
						}

						inputElem.value = "";
						inputElem.disabled = true;

						if (gptmsgs == null) {
							const chat: GPTChat = {
								title: msg.slice(0, 100),
								msgs: gptmsgs = []
							};
							initChat(chat);
							chats.push(chat);
						}

						const message: GPTMessage = {
							role: "u",
							text: msg,
						};

						initMsg(message);
						gptmsgs.push(message);

						const resMsg: GPTMessage = {
							role: "a",
							text: "Processing..."
						};

						const outElem = initMsg(resMsg);
						const msgElem = outElem.lastElementChild!;

						onGPTResponse = (msg) => {
							if (msg.length > 0) {
								msgElem.textContent = resMsg.text = msg;
								msgElem.scrollIntoView({
									block: "end",
									inline: "end",
									behavior: "instant"
								});
							} else { // the response has ended
								gptmsgs!.push(resMsg);
								inputElem.disabled = false;
								onGPTResponse = onGPTResError = null;
								localStorage.setItem("__chats", JSON.stringify(chats, void 0, 0));
							}
						};
						onGPTResError = (err) => {
							gptmsgs!.pop();
							outElem.remove();
							inputElem.disabled = false;
							onGPTResponse = onGPTResError = null;
							error("Failed to process the request. Message: " + err);
						};

						socket.send(NettleWeb.UTF_8.encode("\x02" + JSON.stringify(gptmsgs, void 0, 0)), { compress: true });
					}
				};

				global.removeAttribute("data-current");
				friends.removeAttribute("data-current");
				chatgpt.setAttribute("data-current", "1");

				msglist.removeAttribute("style");
				channels.removeAttribute("style");
				history.style.display = "block";
				ufileBtn.style.display = "none";

				global.disabled = false;
				friends.disabled = false;
				chatgpt.disabled = false;
				ufileBtn.disabled = true;
				inputElem.disabled = false;
			};
		}

		$("emoji").onclick = () => {
			if (picker.style.display === "block") {
				picker.style.display = "none";
				return;
			}

			if (picker.firstElementChild == null) {
				const elem = new emoji.Picker({
					locale: "POSIX",
					emojiVersion: 1000
				});
				elem.addEventListener("emoji-click", (e) => {
					e.preventDefault();
					e.stopPropagation();

					const code = e.detail.unicode;
					if (code != null)
						inputElem.setRangeText(code, inputElem.selectionStart || 0, inputElem.selectionEnd || 0, "end");
				});
				picker.appendChild(elem);
			}

			picker.style.display = "block";
		};
	}

	{
		const widget = $("nwidget");

		nmsgBtn.onclick = () => {
			if (user == null) {
				accnBtn.click();
				return;
			}

			if (widget.hasAttribute("data-current")) {
				widget.removeAttribute("data-current");
				nmsgBtn.removeAttribute("data-current");
				return;
			}

			widget.innerHTML = "";
			nmsgBtn.disabled = true;

			fetchSIO(SIOPath.getnotifications, user).then((list: NotifList) => {
				if (Array.isArray(list) && list.length > 0) {
					for (const it of list) {
						const elem = doc.createElement("div");

						{
							const e = doc.createElement("div");
							switch (it.type) {
								case NotifType.rawtext:
									e.textContent = it.text;
									break;
								case NotifType.message:
									e.innerHTML = "<b>" + it.user + "</b> sent a direct message to you.";
									elem.onclick = () => {
										fetchSIO(SIOPath.userinfo, it.fuid).then((info) => {
											openChat(info).catch((err) => {
												error("Failed to open chat channel. Message: " + err);
											});
										}).catch((err) => {
											error("Failed to load user info. Message: " + err);
										});
									};
									break;
								case NotifType.mention:
									e.innerHTML = "<b>" + it.user + "</b> mentioned you in a chat channel.";
									elem.onclick = () => {
										openChannel(it.chId).catch((err) => {
											error("Failed to open chat channel. Message: " + err);
										});
									};
									break;
								case NotifType.mentionc:
									e.innerHTML = "<b>" + it.user + "</b> mentioned you in a game comment.";
									elem.onclick = () => {
										const game = it.game;
										for (const it of gameList) {
											if (it.date === game) {
												playGame(it).catch((err) => {
													error("Failed to launch game. Message: " + err);
												});
												break;
											}
										}
									};
									break;
								case NotifType.addfriend:
									e.innerHTML = "<b>" + it.user + "</b> requested to be friend with you.";
									elem.onclick = () => {
										accnBtn.click();
									};
									break
								default:
									e.innerHTML = "Error: Failed to parse message.";
									break;
							}
							elem.appendChild(e);
						}

						{
							const e = doc.createElement("span");
							e.textContent = dateToStr(it.date);
							elem.appendChild(e);
						}

						widget.appendChild(elem);
					}
				} else widget.innerHTML = "<div>You don't have any notifications.</div>"

				nmsgBtn.disabled = false;
				nmsgBtn.removeAttribute("data-unread");
				widget.setAttribute("data-current", "");
				nmsgBtn.setAttribute("data-current", "");
			}).catch((err) => {
				error("Failed to fetch notifications. Message: " + err);
			});
		};
	}

	{
		const id = $("id");
		const bio = $("bio");
		const afBtn = $("af") as HTMLButtonElement;
		const dmBtn = $("dm");
		const games = $("pf-games");
		const items = $("pf-items");
		const avatar = $("avatar") as HTMLImageElement;
		const profPage = $("profile-page");

		openProfile = async (uid: string) => {
			const info: UserInfo = await fetchSIO(SIOPath.userinfo, uid);

			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			sideMenu.checked = false;
			profPage.setAttribute("data-current", "1");

			afBtn.disabled = false;
			afBtn.innerHTML = "Add Friend";
			games.removeAttribute("style");
			items.removeAttribute("style");
			avatar.src = proxyURL(info.icon);
			games.innerHTML = items.innerHTML = "";
			games.onscrollend = items.onscrollend = null;
			bio.textContent = info.bio || "NettleWeb User";

			{
				const user = id.textContent = info.id;

				if (!mirror) {
					unblEndSes = restoreRootPath;
					his.replaceState(void 0, "", "/@" + user);
				}
			}

			switch (info.vip) {
				case 3:
					id.setAttribute("data-vip", "gold");
					break;
				case 4:
					id.setAttribute("data-vip", "diamond");
					break;
				default:
					id.removeAttribute("data-vip");
					break;
			}

			afBtn.onclick = () => {
				if (user == null) {
					accnBtn.click();
					return;
				}

				fetchSIO(SIOPath.addfriend, [user, uid]).then(() => {
					afBtn.disabled = true;
					afBtn.innerHTML = "Requested";
				}).catch((err) => {
					error("Failed to send friend request. Message: " + err);
				});
			};
			dmBtn.onclick = () => {
				if (user == null) {
					accnBtn.click();
					return;
				}

				openChat(info).catch((err) => {
					error("Failed to open chat channel. Message: " + err);
				});
			};

			{
				const list = gameList.filter((e) => e.user === uid);
				if (list.length > 0) {
					let index: number = 25;
					for (const game of list.slice(0, 25))
						games.appendChild(createGameElement(game));

					games.onscrollend = () => {
						if (games.scrollTop >= (games.scrollHeight - games.clientHeight)) {
							const end = index + 25;
							if (end >= list.length)
								games.onscrollend = null;
							for (const game of list.slice(index, index = end))
								games.appendChild(createGameElement(game));
						}
					};
				} else {
					games.style.overflow = "unset";
					games.innerHTML = "This user has not uploaded any games yet.";
				}
			}

			{
				const list = itemList.filter((e) => e.user === uid);
				if (list.length > 0) {
					let index: number = 25;
					for (const item of list.slice(0, 25))
						items.appendChild(createItemElement(item));

					items.onscrollend = () => {
						if (items.scrollTop >= (items.scrollHeight - items.clientHeight)) {
							const end = index + 25;
							if (end >= list.length)
								items.onscrollend = null;
							for (const item of list.slice(index, index = end))
								items.appendChild(createItemElement(item));
						}
					};
				} else {
					items.style.overflow = "unset";
					items.innerHTML = "This user does not have a store yet.";
				}
			}
		};
	}

	const paycc = $("paycc") as HTMLSelectElement;
	const paydesc = $("paydesc") as HTMLTextAreaElement;
	const chatProf = $("chat-profile");
	const curElems = doc.querySelectorAll<HTMLElement>("#nav-bar>button, #content>div, #nmsg-btn, #accn-btn, #nwidget");

	{
		const addFriendBtn = $("ff") as HTMLButtonElement;
		const accnPage = $("accountinfo-page");
		const friends = $("ac-friends");
		const orders = $("ac-orders");

		function renderFriend(elem: HTMLElement, info: FriendInfo) {
			const uid: string = info.uid;
			if (typeof uid !== "string")
				throw new Error("Internal Error");

			const img = doc.createElement("img");
			img.src = proxyURL(info.icon);
			img.alt = "Avatar";
			img.width = 48;
			img.height = 48;
			img.loading = "lazy";
			img.decoding = "async";
			img.draggable = false;
			elem.appendChild(img);

			{
				const e = doc.createElement("div");
				e.className = "user";
				e.textContent = info.id;

				switch (info.vip) {
					case 3:
						e.setAttribute("data-vip", "gold");
						break;
					case 4:
						e.setAttribute("data-vip", "diamond");
						break;
					default:
						break;
				}

				img.onclick = e.onclick = () => {
					openProfile(uid).catch((err) => {
						error("Failed to open user profile. Message: " + err);
					});
				};

				elem.appendChild(e);
			}

			switch (info.state) {
				case 1:
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Cancel request";
						e.className = "cross";
						e.onclick = () => {
							fetchSIO(SIOPath.delfriend, [user, uid]).then(() => {
								elem.remove();
							}).catch((err) => {
								error("Failed to cancel friend request. Message: " + err);
							});
						};
						elem.appendChild(e);
					}
					{
						const e = doc.createElement("span");
						e.innerHTML = "Requested";
						elem.appendChild(e);
					}
					break;
				case 2:
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Accept";
						e.className = "tick";
						e.onclick = () => {
							fetchSIO(SIOPath.addfriend, [user, uid]).then(() => {
								info.state = 0;
								elem.innerHTML = "";
								renderFriend(elem, info);
							}).catch((err) => {
								error("Failed to accept friend request. Message: " + err);
							});
						};
						elem.appendChild(e);
					}
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Reject";
						e.className = "cross";
						e.onclick = () => {
							fetchSIO(SIOPath.delfriend, [user, uid]).then(() => {
								elem.remove();
							}).catch((err) => {
								error("Failed to reject friend request. Message: " + err);
							});
						};
						elem.appendChild(e);
					}
					{
						const e = doc.createElement("span");
						e.innerHTML = "Accept friend request?";
						elem.appendChild(e);
					}
					break;
				default:
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Remove friend";
						e.className = "cross";
						e.onclick = () => {
							fetchSIO(SIOPath.delfriend, [user, uid]).then(() => {
								elem.remove();
							}).catch((err) => {
								error("Failed to remove friend. Message: " + err);
							});
						};
						elem.appendChild(e);
					}
					{
						const e = doc.createElement("button");
						e.type = "button";
						e.title = "Message";
						e.className = "message";
						e.onclick = () => {
							openChat(info).catch((err) => {
								error("Failed to open chat channel. Message: " + err);
							});
						};
						elem.appendChild(e);
					}
					break;
			}
		}

		loadAccnInfo = () => {
			fetchSIO(SIOPath.getBOrders, user).then((list) => {
				if (Array.isArray(list) && list.length > 0) {
					const el = doc.createElement("table");
					el.innerHTML = `<thead><tr><th scope="col">ID</th><th scope="col">Date</th><th scope="col">Items</th><th scope="col">Price*</th><th scope="col">State</th><th scope="col">Contact</th></tr></thead>`;

					{
						const e = doc.createElement("tbody");
						for (const it of list) {
							const el = doc.createElement("tr");

							{
								const e = doc.createElement("td");
								e.textContent = it.id;
								el.appendChild(e);
							}
							{
								const e = doc.createElement("td");
								e.textContent = dateToStr(it.date);
								el.appendChild(e);
							}
							{
								const e = doc.createElement("td");
								for (const p of it.pros) {
									const elem = doc.createElement("div");
									for (const e of itemList) {
										if (e.date.toString(36) === p) {
											elem.textContent = e.name;
											break;
										}
									}
									e.appendChild(elem);
								}
								el.appendChild(e);
							}
							{
								const e = doc.createElement("td");
								e.textContent = "$" + it.price.toFixed(2);
								el.appendChild(e);
							}
							{
								const e = doc.createElement("td");
								switch (it.state) {
									case 0:
										e.textContent = "Pending Payment";

										{
											const el = doc.createElement("button");
											el.type = "button";
											el.textContent = "Cancel";
											el.onclick = () => {
												fetchSIO(SIOPath.cancelorder, [user, it.id, false]).then(() => {
													e.innerHTML = "Aborted";
												}).catch((err) => {
													error("Failed to cancel order. Message: " + err);
												});
											};
											e.appendChild(el);
										}

										break;
									case 1:
										e.textContent = "Aborted";
										break;
									case 2:
										e.textContent = "Delivered";
										break;
									default:
										e.textContent = "Unknown";
										break;
								}
								el.appendChild(e);
							}
							{
								const e = doc.createElement("td");
								e.textContent = it.sellerEmail;
								el.appendChild(e);
							}

							e.appendChild(el);
						}
						el.appendChild(e);
					}

					orders.innerHTML = "<div>* including additional delivery fee</div>";
					orders.prepend(el);
				} else {
					orders.style.overflow = "unset";
					orders.innerHTML = "You don't have any orders yet.";
				}
			}).catch((err) => {
				orders.innerHTML = "Failed to fetch the list. Message: " + err;
			});

			fetchSIO(SIOPath.getfriends, [user, 0]).then((list) => {
				friends.innerHTML = "";

				if (Array.isArray(list) && list.length > 0) {
					let index: number = 0;

					for (const it of list) {
						const e = doc.createElement("div");
						renderFriend(e, it);
						friends.appendChild(e);
					}

					friends.onscrollend = () => {
						if (friends.scrollTop >= (friends.scrollHeight - friends.clientHeight) && index >= 0) {
							fetchSIO(SIOPath.getfriends, [user, index += 10]).then((list: any[]) => {
								if (list.length < 10)
									index = -1;

								for (const it of list) {
									const e = doc.createElement("div");
									renderFriend(e, it);
									friends.appendChild(e);
								}
							});
						}
					};
				}
			}).catch((err) => {
				error("Failed to fetch the list. Message: " + err);
			});
		};

		$("chat-login").onclick = chatProf.onclick = accnBtn.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			orders.innerHTML = friends.innerHTML = "Loading...";
			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			accnBtn.setAttribute("data-current", "1");
			accnPage.setAttribute("data-current", "1");
			sideMenu.checked = false;

			if (typeof user === "string")
				loadAccnInfo();
		};

		addFriendBtn.onclick = () => {
			const elem = doc.createElement("div");

			const input = doc.createElement("input");
			input.type = "text";
			input.minLength = 2;
			input.maxLength = 30;
			input.spellcheck = false;
			input.placeholder = "Username";
			input.autocomplete = "off";
			elem.appendChild(input);

			const tick = doc.createElement("button");
			tick.type = "button";
			tick.title = "Add";
			tick.className = "tick";
			elem.appendChild(tick);

			const cross = doc.createElement("button");
			cross.type = "button";
			cross.title = "Cancel";
			cross.className = "cross";
			elem.appendChild(cross);

			input.onblur = () => {
				const value = input.value.trim().toLowerCase();
				if (value.length > 0)
					input.value = value;
			};
			tick.onclick = () => {
				const value = input.value.trim().toLowerCase();
				if (value.length < 4 || value.length > 20 || !/^[\-a-z0-9]+$/.test(value)) {
					error("Please provide a valid username.");
					return;
				}

				fetchSIO(SIOPath.userinfo, "@" + value).then((info) => {
					fetchSIO(SIOPath.addfriend, [user, info.uid]).then(() => {
						const e = doc.createElement("div");
						info.state = 1;
						renderFriend(e, info);
						friends.appendChild(e);
						elem.replaceWith(addFriendBtn);
					}).catch((err) => {
						error("Failed to send friend request. Message: " + err);
					});
				}).catch((err) => {
					error("Failed to retrieve user information. Message: " + err);
				});
			};
			cross.onclick = () => {
				elem.replaceWith(addFriendBtn);
			};

			addFriendBtn.replaceWith(elem);
		};
	}

	{
		const homeBtn = $("home-btn");
		const gameBtn = $("game-btn");
		const appsBtn = $("apps-btn");

		const homePage = $("home-page");
		const gamePage = $("games-page");
		const commPage = $("store-page");
		const appsPage = $("services-page");
		const upldPage = $("uploadgames-page");
		const settPage = $("settings-page");

		$("logo").onclick = homeBtn.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			sideMenu.checked = false;
			homePage.setAttribute("data-current", "");
			homeBtn.setAttribute("data-current", "");
			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
		};
		$("goto-games").onclick = gameBtn.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			sideMenu.checked = false;
			gameBtn.setAttribute("data-current", "");
			gamePage.setAttribute("data-current", "");

			if (!mirror) {
				if (!cloaking)
					doc.title = "NettleWeb Games"

				unblEndSes = restoreRootPath;
				his.replaceState(void 0, "", "/games");
			}
		};
		commBtn.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			sideMenu.checked = false;
			commBtn.setAttribute("data-current", "");
			commPage.setAttribute("data-current", "");

			if (!mirror) {
				if (!cloaking)
					doc.title = "NettleWeb Store";

				unblEndSes = restoreRootPath;
				his.replaceState(void 0, "", "/shop");
			}
		};
		$("goto-apps").onclick = appsBtn.onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const elem of curElems)
				elem.removeAttribute("data-current");

			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
			sideMenu.checked = false;
			appsBtn.setAttribute("data-current", "");
			appsPage.setAttribute("data-current", "");

			if (!mirror) {
				if (!cloaking)
					doc.title = "NettleWeb Apps";

				unblEndSes = restoreRootPath;
				his.replaceState(void 0, "", "/apps");
			}
		};
		$("ug").onclick = () => {
			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			sideMenu.checked = false;
			upldPage.setAttribute("data-current", "");
			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
		};
		$("settings").onclick = () => {
			const open = settPage.hasAttribute("data-current");

			if (unblEndSes != null)
				unblEndSes();
			for (const e of curElems)
				e.removeAttribute("data-current");

			if (open) {
				homeBtn.setAttribute("data-current", "1");
				homePage.setAttribute("data-current", "1");
			} else settPage.setAttribute("data-current", "1");

			sideMenu.checked = false;
			content.scrollTo({
				top: 0,
				left: 0,
				behavior: "instant"
			});
		};

		his.scrollRestoration = "manual";
		his.replaceState(void 0, "", "/");

		switch (path) {
			case "/":
				break;
			case "/g":
			case "/g/":
			case "/game":
			case "/game/":
			case "/games":
			case "/games/":
				gameBtn.click();
				break;
			case "/v":
			case "/v/":
			case "/video":
			case "/video/":
			case "/videos":
			case "/videos/":
				strmBtn.click();
				break;
			case "/s":
			case "/s/":
			case "/shop":
			case "/shop/":
			case "/store":
			case "/store/":
				commBtn.click();
				break;
			case "/a":
			case "/a/":
			case "/apps":
			case "/apps/":
				appsBtn.click();
				break;
			default:
				if (path.slice(0, 2) === "/@") {
					const user = path.slice(1);
					if (user.length <= 50) {
						try {
							await openProfile(user);
						} catch (err) {
							error("Failed to open user profile. Message: " + err);
						}
					}
				} else if (path.slice(0, 6) === "/join/") {
					const code = path.slice(6);
					if (code.length === 12) {
						try {
							const info = await fetchSIO(SIOPath.getgroupinfo, code);

							$("igrcode").textContent = code;
							$("igrname").textContent = info.name;
							$("gr-users").textContent = info.users;
							$("gr-accept").onclick = () => {
								if (user == null) {
									accnBtn.click();
									return;
								}

								fetchSIO(SIOPath.joingroupchat, [user, code]).then(({ id }) => {
									openChannel(id).catch((err) => {
										error("Failed to open chat channel. Message: " + err);
									});
								}).catch((err) => {
									error("Failed to join group chat. Message: " + err);
								});
							};

							for (const e of curElems)
								e.removeAttribute("data-current");

							$("group-invite-page").setAttribute("data-current", "");
							sideMenu.checked = false;
							content.scrollTo({
								top: 0,
								left: 0,
								behavior: "instant"
							});
						} catch (err) {
							error("Failed to open invite link. Message: " + err);
						}
					}
				} else if (path.slice(0, 7) === "/reset/") {
					const token = path.slice(7);
					if (token.length === 256) {
						const resetPage = $("account-reset-page");

						for (const e of curElems)
							e.removeAttribute("data-current");

						resetPage.setAttribute("data-current", "");
						sideMenu.checked = false;
						content.scrollTo({
							top: 0,
							left: 0,
							behavior: "instant"
						});

						const pass = $("np") as HTMLInputElement;
						const cPass = $("rp") as HTMLInputElement;

						$("reset").onclick = () => {
							const value = pass.value;
							if (value.length < 8 || value.length > 30) {
								error("The new password must have 8 to 30 characters.");
								return;
							}

							if (value !== cPass.value) {
								error("The confirm password does not match the new password.");
								return;
							}

							fetchSIO(SIOPath.resetpassword2, [token, value]).then(() => {
								resetPage.remove();
								accnBtn.click();
							}).catch((err) => {
								error("Failed to reset password. Message: " + err)
							});
						};
					}
				} else if (path.length > 4 && path.length < 20) {
					const id = parseInt(path.slice(1), 36);
					if (Number.isSafeInteger(id) && id > 0) {
						for (const game of gameList) {
							if (game.date === id) {
								if (search.get("hidegui") === "1") {
									const { type, path } = game;
									docBody.innerHTML = "";

									if (path.startsWith("!content!"))
										docBody.appendChild(createGameFrame(type, await fetchGameContent(path.slice(9))));
									else
										docBody.appendChild(createFrameElement(path));

									injectAnchorFrame();
									return;
								}

								try {
									await playGame(game);
								} catch (err) {
									error("Failed to launch game. Message: " + err);
								}

								break;
							}
						}
					}
				} else {
					error("Error: Page does not exist: " + path);
				}
				break;
		}

		$("loading").remove();
		content.style.display = "block";
	}

	if (search.get("m") === "1") {
		setTimeout(() => {
			content.scrollTo({
				top: content.scrollHeight,
				left: 0,
				behavior: "instant"
			});
		}, 5000, null);
	}

	if (win.origin === Constants.origin) {
		{
			const func = doc.createElement.bind(doc);
			Object.defineProperty(doc, "createElement", {
				value: (tag: string, opt: any) => {
					const e = func(tag, opt);
					if (e.tagName.toLowerCase() === "iframe")
						e.setAttribute("credentialless", "true");

					return e;
				},
				writable: false,
				enumerable: false,
				configurable: false
			});
		}
		{
			const func = doc.createElementNS.bind(doc);
			Object.defineProperty(doc, "createElementNS", {
				value: (ns: string, tag: string, opt: any) => {
					const e = func(ns, tag, opt);
					if (e.tagName.toLowerCase() === "iframe")
						e.setAttribute("credentialless", "true");

					return e;
				},
				writable: false,
				enumerable: false,
				configurable: false
			});
		}

		const js1 = await optGetText("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7505521340110301");
		if (js1 != null && js1.length > 0) {
			try {
				new Function("arguments", "globalThis", "window", "frames", "self", "document", js1).apply(win, [void 0, win, win, win, win, doc]);
			} catch (err) {
				console.error("#Google Adense: ", err);
			}
		} else error("You are using an ad blocker. Please disable it to support this website's development.");

		const ads = win.adsbygoogle ||= [];
		for (const e of doc.querySelectorAll("ins.adsbygoogle")) {
			e.setAttribute("data-ad-client", "ca-pub-7505521340110301");
			e.setAttribute("data-ad-format", "auto");
			e.setAttribute("data-full-width-responsive", "true");

			try {
				ads.push(1);
			} catch (err) { }
		}
	} else injectAnchorFrame();

	{
		async function loginCb() {
			await itemLock;
			loadAccnInfo();
			paycc.innerHTML = config.cc;
			accnBtn.title = "My Account";
			accnBtn.setAttribute("data-ac", "");

			$("ac-prof").style.display = "block";
			$("chat-login").remove();
			$("login-dialog").remove();

			const bio = $("ac-bio");
			const name = $("ac-name");
			const email = $("ac-email");
			const username = $("ac-un");

			const unEditBtn = $("ac-edit");
			const unLinkBtn = $("ac-link");
			const bioEditBtn = $("ac-bio-edit");
			const nameEditBtn = $("ac-name-edit");
			const emailEditBtn = $("ac-email-edit");
			const passwordEditBtn = $("cp");
			const revokeSecretsBtn = $("rs") as HTMLButtonElement;
			const enableTwoFactorBtn = $("tf");

			if (localStorage.getItem("__?2fa") === "1") {
				enableTwoFactorBtn.setAttribute("data-enabled", "");
				enableTwoFactorBtn.textContent = "Disable Two-Factor";
			}

			const chavatar = $("ch-avatar");
			const avatar = chavatar.firstElementChild as HTMLImageElement;

			const avatar2 = doc.createElement("img");
			avatar2.alt = "Avatar";
			avatar2.width = 40;
			avatar2.height = 40;
			avatar2.loading = "eager";
			avatar2.decoding = "sync";
			avatar2.draggable = false;
			chatProf.appendChild(avatar2);

			const username2 = doc.createElement("div");
			username2.className = "user";
			chatProf.appendChild(username2);
			chatProf.style.display = "block";

			const data = await fetchSIO(SIOPath.userdata, user);
			const id = data.id;
			const uid = data.uid;

			if (typeof id !== "string" || id.length < 4 || typeof uid !== "string" || uid.length < 2) {
				error("Error: Server response parse error.");
				return;
			}

			bio.textContent = data.bio || "NettleWeb User";
			name.textContent = data.name || "Not set";
			email.textContent = data.email || "Not set";
			avatar.src = avatar2.src = proxyURL(data.icon);
			username.textContent = id;
			username2.textContent = id;
			$("ac-uid").textContent = uid;
			paycc.value = data.paycc || "US";
			paydesc.value = data.paydesc || "";

			if (data.unread)
				nmsgBtn.setAttribute("data-unread", "");

			switch (data.vip) {
				case 3:
					$("ac-membership").textContent = "Gold \ud83d\udc51";
					username.setAttribute("data-vip", "gold");
					username2.setAttribute("data-vip", "gold");
					break;
				case 4:
					$("ac-membership").textContent = "Diamond \ud83d\udc8e";
					username.setAttribute("data-vip", "diamond");
					username2.setAttribute("data-vip", "diamond");
					break;
				default:
					$("ac-membership").textContent = "None";
					break;
			}

			{
				const elem = $("ac-games");
				const list = gameList.filter((e) => e.user === uid);

				let index: number = 25;
				for (const game of list.slice(0, 25))
					elem.appendChild(createGameElement(game));

				elem.onscrollend = () => {
					if (index < list.length && elem.scrollTop >= (elem.scrollHeight - elem.clientHeight)) {
						for (const game of list.slice(index, index += 25))
							elem.appendChild(createGameElement(game));
					}
				};
			}

			{
				const elem = $("s-products");
				const list = itemList.filter((e) => e.user === uid);

				if (list.length > 0) {
					let index: number = 25;
					for (const item of list.slice(0, 25))
						elem.appendChild(createItemElement(item));

					elem.onscrollend = () => {
						if (index < list.length && elem.scrollTop >= (elem.scrollHeight - elem.clientHeight)) {
							for (const item of list.slice(index, index += 25))
								elem.appendChild(createItemElement(item));
						}
					};
				} else {
					elem.style.overflow = "unset";
					elem.innerHTML = "You have not published any products yet.";
				}
			}

			chavatar.onclick = () => {
				const elem = doc.createElement("input");
				elem.type = "file";
				elem.accept = "image/*";
				elem.onchange = async () => {
					const file = elem.files?.item(0);
					if (file != null) {
						const blob = await resizeImage(file, 512, 512);
						if (blob == null) {
							error("Error: Failed to resize image.");
							return;
						}

						try {
							await fetchSIO(SIOPath.changeavatar, [user, await blob.arrayBuffer()]);
						} catch (err) {
							error("Failed to upload the image file. Message: " + err);
							return;
						}

						const url = URL.createObjectURL(blob);
						avatar.src = avatar2.src = url;
						await avatar.decode();
						await avatar2.decode();
						URL.revokeObjectURL(url);
					}
				};
				elem.click();
			};
			unEditBtn.onclick = () => {
				const elem = doc.createElement("div");

				const input = doc.createElement("input");
				input.type = "text";
				input.value = username.innerHTML;
				input.minLength = 4;
				input.maxLength = 20;
				input.spellcheck = false;
				input.placeholder = "Username";
				input.autocomplete = "off";
				elem.appendChild(input);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Save";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				input.onblur = () => {
					const value = input.value.trim().toLowerCase();
					if (value.length > 0)
						input.value = value;
				};
				tick.onclick = () => {
					const value = input.value.trim().toLowerCase();
					if (value.length < 4 || value.length > 20) {
						error("Username must be between 4 and 20 characters long.");
						return;
					}
					if (!/^[\-a-z0-9]+$/.test(value)) {
						error("Username must contain only hyphens, 0-9, lowercase a-z");
						return;
					}

					fetchSIO(SIOPath.changeid, [user, value]).then(() => {
						elem.replaceWith(username);
						username.textContent = value;
						username2.textContent = value;
						unEditBtn.removeAttribute("style");
					}).catch((err) => {
						error("Failed to change username. Message: " + err)
					});
				};
				cross.onclick = () => {
					elem.replaceWith(username);
					unEditBtn.removeAttribute("style");
				};

				unEditBtn.style.display = "none";
				username.replaceWith(elem);
				input.select();
			};
			unLinkBtn.onclick = () => {
				const url = Constants.root + "@" + id;
				const e = doc.createElement("span");

				e.textContent = url;
				unLinkBtn.replaceWith(e);
				navigator.clipboard.writeText(url).catch((err) => {
					error("Failed to copy link to clipboard. Message: " + String(err));
				});
			};
			bioEditBtn.onclick = () => {
				const elem = doc.createElement("div");

				const input = doc.createElement("input");
				input.type = "text";
				input.value = bio.innerHTML;
				input.minLength = 1;
				input.maxLength = 500;
				input.spellcheck = false;
				input.placeholder = "Bio";
				input.autocomplete = "off";
				elem.appendChild(input);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Save";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				input.onblur = () => {
					const value = input.value.trim();
					if (value.length > 0)
						input.value = value;
				};
				tick.onclick = () => {
					const value = input.value.trim();
					if (value.length > 500) {
						error("Bio cannot have more than 500 characters in length.");
						return;
					}

					fetchSIO(SIOPath.changebio, [user, value]).then(() => {
						elem.replaceWith(bio);
						bioEditBtn.removeAttribute("style");
						bio.textContent = value || "NettleWeb User";
					}).catch((err) => {
						error("Failed to update bio. Message: " + err);
					});
				};
				cross.onclick = () => {
					elem.replaceWith(bio);
					bioEditBtn.removeAttribute("style");
				};

				bioEditBtn.style.display = "none";
				bio.replaceWith(elem);
				input.select();
			};
			nameEditBtn.onclick = () => {
				const elem = doc.createElement("div");

				const input = doc.createElement("input");
				input.type = "text";
				input.value = name.innerHTML;
				input.minLength = 2;
				input.maxLength = 30;
				input.spellcheck = false;
				input.placeholder = "Name";
				input.autocomplete = "off";
				elem.appendChild(input);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Save";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				input.onblur = () => {
					const value = input.value.trim();
					if (value.length > 0)
						input.value = value;
				};
				tick.onclick = () => {
					const value = input.value.trim();
					if (value.length > 30) {
						error("Name cannot have more than 30 characters in length.");
						return;
					}

					fetchSIO(SIOPath.changename, [user, value]).then(() => {
						elem.replaceWith(name);
						name.textContent = value;
						nameEditBtn.removeAttribute("style");
					}).catch((err) => {
						error("Failed to update name. Message: " + err);
					});
				};
				cross.onclick = () => {
					elem.replaceWith(name);
					nameEditBtn.removeAttribute("style");
				};

				nameEditBtn.style.display = "none";
				name.replaceWith(elem);
				input.select();
			};
			emailEditBtn.onclick = () => {
				const elem = doc.createElement("div");

				const input = doc.createElement("input");
				input.type = "email";
				input.value = email.innerHTML;
				input.minLength = 6;
				input.maxLength = 320;
				input.spellcheck = false;
				input.placeholder = "Email";
				input.autocomplete = "off";
				elem.appendChild(input);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Save";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				input.onblur = () => {
					const value = input.value.trim().toLowerCase();
					if (value.length > 0)
						input.value = value;
				};
				tick.onclick = () => {
					const value = input.value.trim().toLowerCase();
					if (value.length < 6 || value.length > 320 || value.indexOf("@", 1) < 0) {
						error("Please provide a valid email address.");
						return;
					}

					fetchSIO(SIOPath.changeemail, [user, value]).then(() => {
						{
							const e = doc.createElement("div");
							e.textContent = "Please check your inbox and fill in the 6-digit verification code below to verify your email address.";
							elem.prepend(e);
						}

						input.type = "text";
						input.value = "";
						input.minLength = 6;
						input.maxLength = 6;
						input.placeholder = "6-digit verification code";

						input.onblur = () => {
							const value = input.value.trim();
							if (value.length > 0)
								input.value = value;
						};
						tick.onclick = () => {
							const code = input.value.trim();
							if (code.length !== 6 || !/^\d+$/.test(code)) {
								error("The code provided must have exactly 6 digits.");
								return;
							}

							fetchSIO(SIOPath.verifyemail2, [user, code]).then(() => {
								elem.replaceWith(email);
								email.textContent = value;
								emailEditBtn.removeAttribute("style");
							}).catch((err) => {
								error("Failed to verify your email. Message: " + err);
							});
						};
					}).catch((err) => {
						error("Failed to update your email address. Message: " + err);
					});
				};
				cross.onclick = () => {
					elem.replaceWith(email);
					emailEditBtn.removeAttribute("style");
				};

				emailEditBtn.style.display = "none";
				email.replaceWith(elem);
				input.select();
			};
			passwordEditBtn.onclick = () => {
				const elem = doc.createElement("div");

				{
					const e = doc.createElement("div");
					e.setAttribute("style", "position:relative;display:block;width:fit-content;height:fit-content;margin:10px 0px;padding:5px;line-height:18px;");
					e.innerHTML = "Notice: If your account was created with your Google account and does not have a password, set the current password field to 'CHANGEME!'. After changing your password, previously logged-in sessions will still have access to your account. To revoke the access, click the 'logout all sessions' button down below."
					elem.appendChild(e);
				}

				const i1 = doc.createElement("input");
				i1.type = "password";
				i1.minLength = 8;
				i1.maxLength = 30;
				i1.spellcheck = false;
				i1.placeholder = "Current password";
				i1.autocomplete = "off";
				elem.appendChild(i1);

				const i2 = doc.createElement("input");
				i2.type = "password";
				i2.minLength = 8;
				i2.maxLength = 30;
				i2.spellcheck = false;
				i2.placeholder = "New password";
				i2.autocomplete = "off";
				elem.appendChild(i2);

				const i3 = doc.createElement("input");
				i3.type = "password";
				i3.minLength = 8;
				i3.maxLength = 30;
				i3.spellcheck = false;
				i3.placeholder = "Confirm password";
				i3.autocomplete = "off";
				elem.appendChild(i3);

				const tick = doc.createElement("button");
				tick.type = "button";
				tick.title = "Change";
				tick.className = "tick";
				elem.appendChild(tick);

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				tick.onclick = () => {
					const v1 = i1.value;
					if (v1.length < 8 || v1.length > 30) {
						error("The current password must have 8 to 30 characters.");
						return;
					}

					const v2 = i2.value;
					if (v2.length < 8 || v2.length > 30) {
						error("The new password must have 8 to 30 characters.");
						return;
					}

					if (v1 === v2) {
						error("The new password must be different from the current password.");
						return;
					}
					if (v2 !== i3.value) {
						error("The confirm password does not match the new password.");
						return;
					}

					fetchSIO(SIOPath.changePassword, [user, v1, v2]).then(() => {
						elem.replaceWith(passwordEditBtn);
					}).catch((err) => {
						error("Failed to change password. Message: " + err);
					});
				};
				cross.onclick = () => {
					elem.replaceWith(passwordEditBtn);
				};

				passwordEditBtn.replaceWith(elem);
			};
			revokeSecretsBtn.onclick = () => {
				fetchSIO(SIOPath.revokesecrets, user).then((token) => {
					if (typeof token === "string" && token.length === 2048) {
						socket.send(NettleWeb.UTF_8.encode("\x01" + (user = token))); // login
						localStorage.setItem("__secrets_", token);
						revokeSecretsBtn.disabled = true;
					} else error("Error: Remote returned invalid token.");
				}).catch((err) => {
					error("Failed to revoke login tokens. Message: " + err);
				});
			};
			enableTwoFactorBtn.onclick = () => {
				const elem = doc.createElement("div");

				if (enableTwoFactorBtn.hasAttribute("data-enabled")) {
					const input = doc.createElement("input");
					input.type = "text";
					input.minLength = 6;
					input.maxLength = 6;
					input.spellcheck = false;
					input.placeholder = "6-digit verification code";
					input.autocomplete = "off";
					elem.appendChild(input);

					const tick = doc.createElement("button");
					tick.type = "button";
					tick.title = "Change";
					tick.className = "tick";
					elem.appendChild(tick);

					tick.onclick = () => {
						const code = input.value.trim();
						if (code.length !== 6 || !/^\d+$/.test(code)) {
							error("The code provided must have exactly 6 digits.");
							return;
						}

						fetchSIO(SIOPath.disabletwofactor, [user, code]).then(() => {
							localStorage.setItem("__?2fa", "0");
							elem.replaceWith(enableTwoFactorBtn);
							enableTwoFactorBtn.removeAttribute("data-enabled");
							enableTwoFactorBtn.textContent = "Enable Two-Factor";
						}).catch((err) => {
							error("Failed to enable two-factor authentication. Message: " + err);
						});
					};
				} else {
					{
						const e = doc.createElement("div");
						e.setAttribute("style", "position:relative;display:block;width:fit-content;height:fit-content;margin:15px 0px;line-height:18px;white-space:pre-wrap;");
						e.innerHTML = "In order to enable two-factor authentication (2FA), please follow the steps below:\n1. Install an <a href=\"https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2\" target=\"_blank\" rel=\"noopener\">authenticator app</a> if you don't have one already.\n2. Scan the QR code below or manually input the secret to save your account onto the authenticator.\n3. Input the 6-digit verification code generated below to verify.\n\nAfter enabling 2FA, you will be required to input the generated 6-digit verification code everytime as you login for enhanced account security.\n\nTo avoid being locked out, save the secret or a screenshot of the QR code across multiple devices, so that it could be restored back into the authenticator in case you lost your data.";
						elem.appendChild(e);
					}

					const key = NettleWeb.Base32.encode(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32), 0, 32)));

					{
						const e = doc.createElement("img");
						e.alt = "QR Code";
						e.width = 147;
						e.height = 147;
						e.loading = "eager";
						e.decoding = "sync";
						e.draggable = false;

						{
							e.src = generate("otpauth://totp/NettleWeb:" + id + "?secret=" + key + "&issuer=NettleWeb&algorithm=SHA1").toDataURL({
								type: "image/png",
								scale: 3
							});
						}

						elem.appendChild(e);
					}

					{
						const e = doc.createElement("div");
						e.setAttribute("style", "position:relative;display:block;width:fit-content;height:fit-content;margin:15px 0px;line-height:18px;");
						e.textContent = "Secret: " + key;
						elem.appendChild(e);
					}

					const input = doc.createElement("input");
					input.type = "text";
					input.minLength = 6;
					input.maxLength = 6;
					input.spellcheck = false;
					input.placeholder = "6-digit verification code";
					input.autocomplete = "off";
					elem.appendChild(input);

					const tick = doc.createElement("button");
					tick.type = "button";
					tick.title = "Change";
					tick.className = "tick";
					elem.appendChild(tick);

					tick.onclick = () => {
						const code = input.value.trim();
						if (code.length !== 6 || !/^\d+$/.test(code)) {
							error("The code provided must have exactly 6 digits.");
							return;
						}

						fetchSIO(SIOPath.enabletwofactor, [user, key, code]).then(() => {
							localStorage.setItem("__?2fa", "1");
							elem.replaceWith(enableTwoFactorBtn);
							enableTwoFactorBtn.setAttribute("data-enabled", "");
							enableTwoFactorBtn.textContent = "Disable Two-Factor";
						}).catch((err) => {
							error("Failed to enable two-factor authentication. Message: " + err);
						});
					};
				}

				const cross = doc.createElement("button");
				cross.type = "button";
				cross.title = "Cancel";
				cross.className = "cross";
				elem.appendChild(cross);

				cross.onclick = () => {
					elem.replaceWith(enableTwoFactorBtn);
				};

				enableTwoFactorBtn.replaceWith(elem);
			};

			$("so").onclick = () => {
				localStorage.removeItem("__secrets_");
				setTimeout(() => loc.reload(), 200);
			};
			$("da").onclick = () => {
				error("Error: Operation not permitted.");
			};

			$("account-settings").style.display = "block";
		}

		if (user != null) {
			const err: string | null = await new Promise((resolve) => {
				onLogin = () => {
					onLogin = onLoginError = null;
					resolve(null);
				};
				onLoginError = (err) => {
					onLogin = onLoginError = null;
					resolve(err);
				};

				socket.send(NettleWeb.UTF_8.encode("\x01" + user)); // login
			});

			if (err == null) {
				await loginCb();
				return;
			}

			error("Failed to validate login token. Please login again. Message: " + err);
			user = null;
			// Do not delete invalid token immediately as it could be caused
			// by a temporary network error
		}

		const dialog = $("login-dialog");

		let email: string | undefined;
		let username: string | undefined;
		let password: string | undefined;

		function login() {
			dialog.style.display = "none";
			dialog.innerHTML = "";

			{
				const e = doc.createElement("h3");
				e.textContent = "Login";
				dialog.appendChild(e);
			}

			const un = doc.createElement("input");
			un.type = "text";
			un.value = username || "";
			un.required = true;
			un.minLength = 4;
			un.maxLength = 320;
			un.spellcheck = false;
			un.placeholder = "Username/Email";
			un.autocomplete = "off";
			dialog.appendChild(un);

			const pass = doc.createElement("input");
			pass.type = "password";
			pass.value = password || "";
			pass.required = true;
			pass.minLength = 8;
			pass.maxLength = 30;
			pass.spellcheck = false;
			pass.placeholder = "Password";
			pass.autocomplete = "off";
			dialog.appendChild(pass);

			const log = doc.createElement("button");
			log.type = "button";
			log.className = "pri-button";
			log.textContent = "Login";
			dialog.appendChild(log);

			const reg = doc.createElement("div");
			reg.tabIndex = 0;
			reg.textContent = "Register";
			dialog.appendChild(reg);

			const res = doc.createElement("div");
			res.tabIndex = 0;
			res.textContent = "Forgot password";
			dialog.appendChild(res);

			const goo = doc.createElement("div");
			goo.tabIndex = 0;
			goo.textContent = "Sign in with Google";
			dialog.appendChild(goo);

			un.onblur = () => {
				const value = un.value.trim().toLowerCase();
				if (value.length > 0)
					username = un.value = value;
			};
			pass.onblur = () => {
				const value = pass.value;
				if (value.length > 0)
					password = value;
			};
			log.onclick = () => {
				const usr = username = un.value.trim().toLowerCase();
				if (usr.indexOf("@", 1) < 0) {
					if (usr.length < 4 || usr.length > 20) {
						error("Username must be between 4 and 20 characters long.");
						return;
					}
					if (!/^[\-a-z0-9]+$/.test(usr)) {
						error("Username must contain only hyphens, 0-9, lowercase a-z.");
						return;
					}
				} else {
					if (usr.length < 6 || usr.length > 320) {
						error("Invalid email address. (Usernames should not contain a '@' symbol)");
						return;
					}
				}

				const psw = password = pass.value;
				if (psw.length < 8 || psw.length > 30) {
					error("Password must be between 8 and 30 characters long.");
					return;
				}

				fetchSIO(SIOPath.login2, [usr, psw]).then((token) => {
					if (typeof token !== "string") {
						error("Error: Remote returned invalid token data.");
						return;
					}

					tokenCallback(token);
				}).catch((err) => {
					error("Failed to retrieve login token. Message: " + err);
				});
			};
			reg.onclick = register;
			res.onclick = resetPass;
			goo.onclick = loginGoogle;

			dialog.style.display = "block";
		}

		function register() {
			dialog.style.display = "none";
			dialog.innerHTML = "";

			{
				const e = doc.createElement("h3");
				e.textContent = "Register";
				dialog.appendChild(e);
			}

			const un = doc.createElement("input");
			un.type = "text";
			un.value = username || "";
			un.required = true;
			un.minLength = 4;
			un.maxLength = 20;
			un.spellcheck = false;
			un.placeholder = "Username";
			un.autocomplete = "off";
			dialog.appendChild(un);

			const em = doc.createElement("input");
			em.type = "email";
			em.value = email || "";
			em.required = true;
			em.minLength = 6;
			em.maxLength = 320;
			em.spellcheck = false;
			em.placeholder = "Email";
			em.autocomplete = "off";
			dialog.appendChild(em);

			const pass = doc.createElement("input");
			pass.type = "password";
			pass.value = password || "";
			pass.required = true;
			pass.minLength = 8;
			pass.maxLength = 30;
			pass.spellcheck = false;
			pass.placeholder = "Password";
			pass.autocomplete = "off";
			dialog.appendChild(pass);

			const cpass = doc.createElement("input");
			cpass.type = "password";
			cpass.value = "";
			cpass.required = true;
			cpass.minLength = 8;
			cpass.maxLength = 30;
			cpass.spellcheck = false;
			cpass.placeholder = "Confirm password"
			cpass.autocomplete = "off";
			dialog.appendChild(cpass);

			const tcheck = doc.createElement("input");
			tcheck.id = "tos-check";
			tcheck.type = "checkbox";
			tcheck.required = true;
			dialog.appendChild(tcheck);

			{
				const e = doc.createElement("label");
				e.htmlFor = "tos-check";
				e.innerHTML = "I have read and accepted NettleWeb's <a href=\"" + Constants.origin + "/terms.html\" target=\"blank\" rel=\"noopener\">Terms of Service</a>.";
				dialog.appendChild(e);
			}

			const reg = doc.createElement("button");
			reg.type = "button";
			reg.className = "pri-button";
			reg.innerHTML = "Register";
			dialog.appendChild(reg);

			const log = doc.createElement("div");
			log.tabIndex = 0;
			log.innerHTML = "Login";
			dialog.appendChild(log);

			const goo = doc.createElement("div");
			goo.tabIndex = 0;
			goo.innerHTML = "Sign in with Google";
			dialog.appendChild(goo);

			un.onblur = () => {
				const value = un.value.trim().toLowerCase();
				if (value.length > 0)
					username = un.value = value;
			};
			em.onblur = () => {
				const value = em.value.trim().toLowerCase();
				if (value.length > 0)
					email = em.value = value;
			};
			pass.onblur = () => {
				const value = pass.value;
				if (value.length > 0)
					password = value;
			};

			reg.onclick = () => {
				const usr = username = un.value.trim().toLowerCase();
				if (usr.length < 4 || usr.length > 20) {
					error("The username must be between 4 and 20 characters long.");
					return;
				}
				if (!/^[\-a-z0-9]+$/.test(usr)) {
					error("The username must contain only hyphens, lowercase a-z and 0-9.");
					return;
				}

				const eml = email = em.value.trim().toLowerCase();
				if (eml.length < 6 || eml.length > 320 || eml.indexOf("@", 1) < 0) {
					error("Please provide a valid email.");
					return;
				}

				const psw = password = pass.value;
				if (psw.length < 8 || psw.length > 30) {
					error("The password must be between 8 and 30 characters long.");
					return;
				}

				if (psw !== cpass.value) {
					error("The confirm password does not match.");
					return;
				}

				if (!tcheck.checked) {
					error("Please check the checkbox above to accept the Terms of Service.");
					return;
				}

				fetchSIO(SIOPath.register, [usr, psw, eml]).then(() => {
					dialog.style.display = "none";
					dialog.innerHTML = "";

					{
						const e = doc.createElement("h3");
						e.textContent = "Verify Email";
						dialog.appendChild(e);
					}
					{
						const e = doc.createElement("span");
						e.textContent = "Please check your inbox and fill in the 6-digit verification code below to verify your email address.";
						dialog.appendChild(e);
					}

					const code = doc.createElement("input");
					code.type = "text";
					code.value = "";
					code.required = true;
					code.minLength = 6;
					code.maxLength = 6;
					code.spellcheck = false;
					code.placeholder = "6-digit verification code";
					code.autocomplete = "off";
					dialog.appendChild(code);

					const btn = doc.createElement("button");
					btn.type = "button";
					btn.className = "pri-button";
					btn.textContent = "Verify";
					dialog.appendChild(btn);

					{
						const e = doc.createElement("span");
						e.textContent = "Notice: If you are using a managed email address (ie. school or work) and did not receive a code in your inbox after several attempts, the code is likely to be blocked by your administrator. In this case, using a personal account could help."
						dialog.appendChild(e);
					}

					dialog.appendChild(goo);

					code.onblur = () => {
						const value = code.value.trim();
						if (value.length > 0)
							code.value = value;
					};
					btn.onclick = () => {
						const cd = code.value.trim();
						if (cd.length !== 6 || !/^\d+$/.test(cd)) {
							error("The code provided must have exactly 6 digits.");
							return;
						}

						fetchSIO(SIOPath.verifyemail, [usr, cd]).then((token) => {
							if (typeof token === "string" && token.length === 2048) {
								socket.send(NettleWeb.UTF_8.encode("\x01" + (user = token))); // login
								localStorage.setItem("__secrets_", token);
								loginCb();
							} else error("Error: Remote returned invalid token data.");
						}).catch((err) => {
							error("Failed to verify your email address. Message: " + err);
						});
					};

					dialog.style.display = "block";
				}).catch((err) => {
					error("Failed to send request. Message: " + err);
				});

			};
			log.onclick = login;
			goo.onclick = loginGoogle;

			dialog.style.display = "block";
		}

		function resetPass() {
			dialog.style.display = "none";
			dialog.innerHTML = "";

			{
				const e = doc.createElement("h3");
				e.textContent = "Reset Password";
				dialog.appendChild(e);
			}

			const em = doc.createElement("input");
			em.type = "email";
			em.value = email || "";
			em.required = true;
			em.minLength = 6;
			em.maxLength = 320;
			em.spellcheck = false;
			em.placeholder = "Email";
			em.autocomplete = "off";
			dialog.appendChild(em);

			const con = doc.createElement("button");
			con.type = "button";
			con.className = "pri-button";
			con.textContent = "Continue";
			dialog.appendChild(con);

			const log = doc.createElement("div");
			log.tabIndex = 0;
			log.textContent = "Login";
			dialog.appendChild(log);

			const reg = doc.createElement("div");
			reg.tabIndex = 0;
			reg.textContent = "Register";
			dialog.appendChild(reg);

			const goo = doc.createElement("div");
			goo.tabIndex = 0;
			goo.textContent = "Sign in with Google";
			dialog.appendChild(goo);

			em.onblur = () => {
				const value = em.value.trim().toLowerCase();
				if (value.length > 0)
					email = em.value = value;
			};
			con.onclick = () => {
				const eml = email = em.value.trim().toLowerCase();
				if (eml.length < 6 || eml.length > 320 || eml.indexOf("@", 1) < 0) {
					error("Please provide a valid email.");
					return;
				}

				fetchSIO(SIOPath.resetpassword, eml).then(() => {
					dialog.style.display = "none";
					dialog.innerHTML = "";

					{
						const e = doc.createElement("h3");
						e.textContent = "Reset Password";
						dialog.appendChild(e);
					}
					{
						const e = doc.createElement("span");
						e.textContent = "Please check your inbox and follow the instructions on the email.";
						dialog.appendChild(e);
					}

					dialog.appendChild(log);
					dialog.appendChild(reg);
					dialog.appendChild(goo);
					dialog.style.display = "block";
				}).catch((err) => {
					error("Failed to send request. Message: " + err);
				});
			};

			log.onclick = login;
			reg.onclick = register;
			goo.onclick = loginGoogle;

			dialog.style.display = "block";
		}

		function tokenCallback(token: string) {
			if (token.length === 2048) {
				socket.send(NettleWeb.UTF_8.encode("\x01" + (user = token))); // login
				localStorage.setItem("__secrets_", token);
				localStorage.setItem("__?2fa", "0");
				loginCb();
				return;
			}

			dialog.style.display = "none";
			dialog.innerHTML = "";

			{
				const e = doc.createElement("h3");
				e.textContent = "Two-Factor Authentication";
				dialog.appendChild(e);
			}
			{
				const e = doc.createElement("span");
				e.textContent = "Please open your authenticator app and fill in the generated 6-digit verification code below.";
				dialog.appendChild(e);
			}

			const code = doc.createElement("input");
			code.type = "text";
			code.value = "";
			code.minLength = 6;
			code.maxLength = 6;
			code.spellcheck = false;
			code.placeholder = "6-digit verification code";
			code.autocomplete = "off";
			dialog.appendChild(code);

			const btn = doc.createElement("button");
			btn.type = "button";
			btn.className = "pri-button";
			btn.textContent = "Verify";
			dialog.appendChild(btn);

			code.onblur = () => {
				const value = code.value.trim();
				if (value.length > 0)
					code.value = value;
			};
			btn.onclick = () => {
				const cd = code.value.trim();
				if (cd.length !== 6 || !/^\d+$/.test(cd)) {
					error("The code provided must have exactly 6 digits.");
					return;
				}

				fetchSIO(SIOPath.verifytwofactor, [token, cd]).then((token) => {
					if (typeof token === "string" && token.length === 2048) {
						socket.send(NettleWeb.UTF_8.encode("\x01" + (user = token))); // login
						localStorage.setItem("__secrets_", token);
						localStorage.setItem("__?2fa", "1");
						loginCb();
					} else error("Error: Remote returned invalid token data.");
				}).catch((err) => {
					error("Failed to login with OTP. Message: " + err);
				});
			};

			dialog.style.display = "block";
		}

		function loginGoogle() {
			const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
			{
				const options = url.searchParams;
				options.set("client_id", "176227430389-qkdboctmfhe9jnvnk2vmarafc5p8amuf.apps.googleusercontent.com");
				options.set("redirect_uri", win.origin + "/auth.html");
				options.set("response_type", "token");
				options.set("state", "12");
				options.set("scope", "email profile");
				options.set("include_granted_scopes", "true");
				options.set("enable_granular_consent", "true");
			}
			loc.replace(url);
		}

		{
			const tmpToken = localStorage.getItem("_cre_") || "";
			if (tmpToken.length > 0) {
				try {
					const token = await fetchSIO(SIOPath.login, tmpToken);
					if (typeof token !== "string") {
						error("Error: Remote returned invalid token data.");
						return;
					}

					accnBtn.click();
					tokenCallback(token);
				} catch (err) {
					error("Failed to retrieve login token. Message: " + err);
				}

				localStorage.removeItem("_cre_");
			} else login();
		}
	}
})(window);