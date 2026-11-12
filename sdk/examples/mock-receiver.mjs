import { createServer } from "node:http";

/** Start a tiny receiver that checks the bearer key and records safe metrics. */
export function startMockReceiver({ apiKey = "obs_example_key", port = 0 } = {}) {
  const events = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/ingest") {
        res.writeHead(404).end();
        return;
      }
      if (req.headers.authorization !== `Bearer ${apiKey}`) {
        res.writeHead(401).end();
        return;
      }
      try {
        const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        events.push(event);
        res.writeHead(202, { "content-type": "application/json" }).end('{"success":true}');
      } catch {
        res.writeHead(400).end();
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock receiver did not bind to a TCP port"));
        return;
      }
      resolve({
        server,
        events,
        url: `http://127.0.0.1:${address.port}/ingest`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const receiver = await startMockReceiver({ port: 5001 });
  console.log(`Mock receiver listening at ${receiver.url}`);
}
