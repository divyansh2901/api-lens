import { setTimeout as delay } from "node:timers/promises";
import { startMockReceiver } from "./mock-receiver.mjs";
import { createSampleApp } from "./sample-app.mjs";

const apiKey = "lens_demo_key";
const receiver = await startMockReceiver({ apiKey });
const app = createSampleApp({ apiKey, ingestionUrl: receiver.url });
const server = app.listen(0, "127.0.0.1");

try {
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sample API did not bind to a TCP port");

  const response = await fetch(`http://127.0.0.1:${address.port}/users/secret-user-id`);
  console.log("Sample API response:", response.status, await response.text());

  for (let attempt = 0; attempt < 30 && receiver.events.length === 0; attempt += 1) await delay(25);
  if (receiver.events.length !== 1) throw new Error("Mock receiver did not receive telemetry");
  console.log("Telemetry received by mock:", JSON.stringify(receiver.events[0], null, 2));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await receiver.close();
}
