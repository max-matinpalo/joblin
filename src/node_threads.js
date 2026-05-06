import { Worker, isMainThread, parentPort } from "node:worker_threads";

const registry = {};
let listening = false;

export function register(handlers = {}) {
	// 1. Validate
	if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
		throw new Error("register() expects an object");
	}

	// 2. Initialize listener
	if (!isMainThread && parentPort && !listening) {
		listening = true;
		parentPort.on("message", async (data) => {
			const { id, type, args = [] } = data || {};
			if (!id || !type) return;

			try {
				const handler = registry[type];
				if (typeof handler !== "function") throw new Error(`Task "${type}" not found`);

				const result = await handler(...args);
				parentPort.postMessage({ id, result });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err || "Worker task failed");
				parentPort.postMessage({ id, error: msg });
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

	// 1. Initialize worker
	const worker = new Worker(path);

	const rejectJobs = (error) => {
		for (const job of jobs.values()) job.reject(error);
		jobs.clear();
	};

	// 2. Handle messages
	worker.on("message", (data) => {
		const { id, result, error } = data || {};
		const job = jobs.get(id);
		if (!job) return;

		jobs.delete(id);
		if (error) job.reject(new Error(error));
		else job.resolve(result);
	});

	// 3. Cleanup
	worker.on("error", (err) => {
		destroyed = true;
		rejectJobs(err || new Error("Worker error"));
	});

	worker.on("messageerror", () => rejectJobs(new Error("Serialization failed")));

	worker.on("exit", (code) => {
		if (destroyed) return;
		destroyed = true;
		const msg = code === 0 ? "Worker exited" : `Worker exited with code ${code}`;
		rejectJobs(new Error(msg));
	});

	const terminate = () => {
		destroyed = true;
		rejectJobs(new Error("Worker terminated"));
		return worker.terminate();
	};

	// 4. Return proxy
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