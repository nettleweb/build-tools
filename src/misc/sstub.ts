const sstub: globalThis.AbstractStorage = Object.freeze(Object.setPrototypeOf({
	length: 0,
	clear: () => {},
	setItem: () => {},
	getItem: () => null,
	removeItem: () => {}
}, null));

export default sstub;