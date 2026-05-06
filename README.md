# joblin
[![npm version](https://img.shields.io/npm/v/joblin)](https://www.npmjs.com/package/joblin)
[![license](https://img.shields.io/github/license/max-matinpalo/joblin?v=1)](https://github.com/max-matinpalo/joblin/blob/main/LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/joblin)](https://bundlephobia.com/package/joblin?v=1)
<br>
<p align="center">
	<img src="https://raw.githubusercontent.com/max-matinpalo/joblin/main/assets/JoblinLogo.jpeg" width="360" alt="Logo">
</p>

**Multicore JavaScript made simple ⚡**   
Define and call worker functions like normal async functions.

- **🚀 Performant**: Reuses the same worker thread/process for many tasks
- **🔀 Multi-worker**: Easily scale by creating multiple workers
- **🛡️ Robust**: Built-in error handling and job cleanup
- **🪶 Small**: Zero dependencies, ~600 bytes (min+gzip)
- **💻 Environments**: Browsers and Node.js





## 📦 Install

```bash
npm install joblin
```


## 🚀 Quick start
### worker.js

```js
import { register } from "joblin";

async function doAbc(data) { /* your code */ }
async function doXyz(data) { /* your code */ }

register({doAbc, doXyz});
```

### app.js

```js
import { setup } from "joblin";

const url = new URL("./worker.js", import.meta.url);
const worker = setup(url);

await worker.doAbc(...);
await worker.doXyz(...);
```

<br>

## 🔌 API
### `register({ functions })`
Registers functions inside the worker.   
Pass an object of functions to expose them on the worker.

---
### `setup(url)`
Loads the worker and returns an object, with the functions registered to it.  
Also all standard web worker methods like `onmessage` are available.  
To make sure bundlers like Vite/Webpack handle the worker correctly, use `new URL`:
```js
const url = new URL("./worker.js", import.meta.url);
const worker = setup(url);
```

<details>
<summary>Why?</summary>

Defining the worker location as a string like `"./worker.js"` easily breaks on modern build tools like Vite and Webpack. Using `new URL(..., import.meta.url)` tells the bundler: "Treat this file as a Worker entry point, bundle it, and give me the final production link." This pattern ensures your worker is found using a stable, absolute `file://` or `http://` URL every time.
</details>

---
### `worker.terminate()`
Terminate the worker, if pending jobs they will be canceled
and the promises rejected.

<br>

## ⚙️ How it works internally

### 1. The Request
When you trigger a function, the library performs three mechanical steps:
*   **Unique Tagging**: It generates a unique id for that specific call.
*   **State Storage**: It places the resolve and reject functions into a Map, using the id as the key so it can "remember" this specific request later.
*   **Dispatch**: It executes worker.postMessage(), sending the id, the name of the function to run, and your data.


### 2. The Execution
The worker acts as a simple listener that stays "awake" for incoming messages:
*   **Lookup**: It receives the message and uses the type field to find the corresponding function in its internal registry.
*   **Processing**: It executes the function with your data.
*   **Completion**: Once finished, it sends a return message containing the same id and the final result.


### 3. The Resolution
The main thread receives the response and closes the loop:
*   **Matching**: It looks at the id in the incoming message and retrieves the matching resolve function from its Map.
*   **Cleaning**: It deletes the entry from the Map to prevent memory leaks.
*   **Delivery**: It calls the stored resolve(result), which finally settles the original await call in your code.

If the worker crashes or is manually terminated, the library iterates through every pending job in the Map and calls their reject functions. This ensures your main application never gets stuck waiting for a message that will never arrive.


## 💡 Example use cases
- **Encryption & hashing**: Encrypt files, sign data, or generate checksums.
- **Compression**: zip, gzip, or compress files
- **Image, video processing**: resize...
- **Large file parsing**: Parse CSV, JSON, XML, logs...
- **Data crunching**: Sort, filter, aggregate, validate, or transform large datasets.
- **Search indexing**: Build indexes or run fuzzy search without blocking typing.
- **PDF work**: Generate reports, invoices, previews, or parse PDF content.
- **AI / ML tasks**: Run tokenizers, embeddings, or browser-side inference.
- **Map calculations**: Cluster markers, calculate routes, or process geodata.
<br>

## 📟 Node.js
The import automatically selects the right version for browsers or Node.js.
The default Node.js version uses worker threads.
There is also a process-based version for stronger isolation:

<details>
<summary>NodeJS versions</summary>

#### node-threads - the default
Uses Node.js worker threads. This is the best and default choice for most apps. Worker threads run inside the same Node.js process, but on separate threads. They are fast to start, use less memory than processes, and are ideal for CPU-heavy work like parsing, compression, hashing, image processing, or data crunching.

#### joblin/node-process
Uses separate Node.js processes. Processes have their own memory and runtime. They are heavier than worker threads, but provide stronger isolation. Use this when you need to run code more separately, protect the main app from crashes, or handle workloads that should not share the same process.

```js
import { setup } from "joblin/node-process"
```
</details>

## 📄 License
MIT



