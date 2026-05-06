// @ts-nocheck

const registry = {};

/* Prevent duplicate listeners when register() is called more than once */
let listening = false;

/* 2. Narrow detection to Dedicated Workers only */
const isWorker = typeof DedicatedWorkerGlobalScope !== "undefined" && self instanceof DedicatedWorkerGlobalScope;

export function register(handlers = {}) {
	// 1. Validate: Ensure handlers is a valid object
	if (!handlers || typeof handlers !== "object") throw new Error("register() expects an object of handlers");

	if (isWorker && !listening) {
		listening = true;
		self.addEventListener("message", async (event) => {
			const { id, type, payload } = event.data || {};
			if (!id || !type) return;

			try {
				const handler = registry[type];
				if (typeof handler !== "function") throw new Error(`Task "${type}" not found`);

				const result = await handler(payload);
				self.postMessage({ id, result });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err || "Worker task failed");
				self.postMessage({ id, error: message });
			}
		});
	}

	for (const [name, handler] of Object.entries(handlers)) {
		if (typeof handler === "function") registry[name] = handler;
	}
}

export function setup(path) {
	let jobId = 0;
	let destroyed = false;

	const jobs = new Map();
	const worker = new Worker(path, { type: "module" });
	/*
	const worker = typeof path === "function"
	? path()
	: path?.postMessage
		? path
		: new Worker(path, { type: "module" });
	*/

	const rejectJobs = (error) => {
		for (const job of jobs.values()) job.reject(error);
		jobs.clear();
	};

	worker.addEventListener("message", (event) => {
		const { id, result, error } = event.data || {};

		const job = jobs.get(id);
		if (!job) return;

		jobs.delete(id);
		if (error) job.reject(new Error(error));
		else job.resolve(result);
	});

	// 3. Mark destroyed on error to prevent future calls from hanging
	worker.addEventListener("error", (event) => {
		destroyed = true;
		rejectJobs(new Error(event.message || "Worker error"));
	});

	worker.addEventListener("messageerror", () => {
		rejectJobs(new Error("Worker message serialization failed"));
	});

	const terminate = () => {
		destroyed = true;
		rejectJobs(new Error("Worker terminated"));
		worker.terminate();
	};

	return new Proxy({}, {
		get(_, prop) {
			if (prop === "terminate") return terminate;
			if (prop === "worker") return worker;

			/* Prevents the proxy from being treated as a Promise */
			if (prop === "then") return undefined;

			if (prop in worker) {
				const value = worker[prop];
				return typeof value === "function" ? value.bind(worker) : value;
			}

			if (typeof prop !== "string") return undefined;

			return (payload = {}) => new Promise((resolve, reject) => {
				if (destroyed) return reject(new Error("Worker terminated"));

				const id = String(++jobId);
				jobs.set(id, { resolve, reject });

				try {
					worker.postMessage({ id, type: prop, payload });
				} catch (err) {
					jobs.delete(id);
					reject(err);
				}
			});
		},
		set(_, prop, value) {
			if (!(prop in worker)) return false;
			worker[prop] = value;
			return true;
		}
	});
}