// @ts-nocheck

const registry = {};
let listening = false;

const hasWorkerScope = typeof DedicatedWorkerGlobalScope !== "undefined";
const isWorker = hasWorkerScope && self instanceof DedicatedWorkerGlobalScope;

export function register(handlers = {}) {
	// 1. Validate
	if (!handlers || typeof handlers !== "object") throw new Error("register() expects an object");

	// 2. Initialize listener
	if (isWorker && !listening) {
		listening = true;
		self.addEventListener("message", async (event) => {
			const { id, type, args = [] } = event.data || {};
			if (!id || !type) return;

			try {
				const handler = registry[type];
				if (typeof handler !== "function") throw new Error(`Task "${type}" not found`);

				const result = await handler(...args);
				self.postMessage({ id, result });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err || "Task failed");
				self.postMessage({ id, error: message });
			}
		});
	}

	// 3. Register handlers
	for (const [name, handler] of Object.entries(handlers)) {
		if (typeof handler === "function") registry[name] = handler;
	}
}

export function setup(path) {
	let jobId = 0;
	let destroyed = false;

	const jobs = new Map();
	const worker = new Worker(path, { type: "module" });

	function rejectJobs(error) {
		for (const job of jobs.values()) job.reject(error);
		jobs.clear();
	}

	// 1. Handle incoming messages
	worker.addEventListener("message", (event) => {
		const { id, result, error } = event.data || {};
		const job = jobs.get(id);
		if (!job) return;

		jobs.delete(id);
		if (error) job.reject(new Error(error));
		else job.resolve(result);
	});

	// 2. Handle global errors (surgical logging only)
	worker.addEventListener("error", (event) => {
		console.error("Worker Runtime Error:", event.message);
	});

	worker.addEventListener("messageerror", () => {
		console.error("Worker Serialization Error");
	});

	// 3. Handle intentional termination
	function terminate() {
		destroyed = true;
		rejectJobs(new Error("Worker terminated"));
		worker.terminate();
	}

	// 4. Create worker proxy
	return new Proxy({}, {
		get(_, prop) {
			if (prop === "terminate") return terminate;
			if (prop === "worker") return worker;
			if (prop === "then") return undefined;

			if (prop in worker) {
				const value = worker[prop];
				return typeof value === "function" ? value.bind(worker) : value;
			}

			if (typeof prop !== "string") return undefined;

			return (...args) => new Promise((resolve, reject) => {
				if (destroyed) return reject(new Error("Worker terminated"));

				const id = String(++jobId);
				jobs.set(id, { resolve, reject });

				try {
					worker.postMessage({ id, type: prop, args });
				} catch (err) {
					jobs.delete(id);
					reject(err);
				}
			});
		},
		set(_, prop, value) {
			if (!(prop in worker)) return true;
			worker[prop] = value;
			return true;
		}
	});
}