import { register } from "joblin";

function heavyTask(iterations) {
	let result = 0;

	// 1. Run a heavy math loop
	for (let i = 0; i < iterations; i++) {
		result += Math.sqrt(i) * Math.sin(i);
	}

	return result;
}

register({ heavyTask });