mport { setup; } from "joblin/node-process";

const url = new URL("./worker.js", import.meta.url);
const iterations = 100000000;

async function runDemo() {
	// 1. Init workers
	const w1 = setup(url);
	const w2 = setup(url);

	// 2. Sequential test
	console.log("Running single task...");
	const s1 = performance.now();
	await w1.heavyTask(iterations);
	console.log(`Single: ${Math.round(performance.now() - s1)}ms`);

	// 3. Parallel test
	console.log("Running 2 tasks in parallel...");
	const s2 = performance.now();
	await Promise.all([w1.heavyTask(iterations), w2.heavyTask(iterations)]);
	console.log(`Parallel: ${Math.round(performance.now() - s2)}ms`);

	// 4. Cleanup
	w1.terminate();
	w2.terminate();
}

runDemo();