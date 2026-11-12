import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createSampleApp } from "../examples/sample-app.mjs";
import { startMockReceiver } from "../examples/mock-receiver.mjs";

const apiKey = "obs_test_key";
let receiver;
let server;
let baseUrl;

before(async () => {
  receiver = await startMockReceiver({ apiKey });
  server = createSampleApp({ apiKey, ingestionUrl: receiver.url }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await receiver.close();
});

async function waitForEvents(count) {
  for (let attempt = 0; attempt < 40 && receiver.events.length < count; attempt += 1) await delay(25);
  assert.equal(receiver.events.length, count, "receiver should get the expected event count");
}

test("captures route template, method, status, latency and timestamp without request data", async () => {
  const response = await fetch(`${baseUrl}/users/private-value?token=do-not-capture`, {
    headers: { authorization: "application-secret", cookie: "session=private" },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.json().then((body) => body.userId), "private-value");
  await waitForEvents(1);

  const event = receiver.events[0];
  assert.deepEqual(Object.keys(event).sort(), ["latency", "method", "route", "statusCode", "timestamp"]);
  assert.equal(event.method, "GET");
  assert.equal(event.route, "/users/:userId");
  assert.equal(event.statusCode, 200);
  assert.ok(Number.isInteger(event.latency) && event.latency >= 0);
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
  assert.equal(JSON.stringify(event).includes("private-value"), false);
  assert.equal(JSON.stringify(event).includes("do-not-capture"), false);
});

test("captures non-success status codes and labels unmatched routes safely", async () => {
  const nested = await fetch(`${baseUrl}/v1/orders/order-secret`);
  assert.equal(nested.status, 200);
  await nested.arrayBuffer();
  await waitForEvents(2);
  assert.equal(receiver.events[1].route, "/v1/orders/:orderId");
  assert.equal(JSON.stringify(receiver.events[1]).includes("order-secret"), false);

  const failed = await fetch(`${baseUrl}/fail`);
  assert.equal(failed.status, 503);
  await failed.arrayBuffer();
  const unmatched = await fetch(`${baseUrl}/private/path/segment?password=secret`);
  assert.equal(unmatched.status, 404);
  await unmatched.arrayBuffer();
  await waitForEvents(4);

  assert.equal(receiver.events[2].route, "/fail");
  assert.equal(receiver.events[2].statusCode, 503);
  assert.equal(receiver.events[3].route, "/unmatched");
  assert.equal(JSON.stringify(receiver.events[3]).includes("private"), false);
});

test("validates options and ignores delivery and callback failures", async () => {
  const { observatory } = await import("../dist/index.js");
  assert.throws(() => observatory({ apiKey: " " }), /apiKey/);
  assert.throws(() => observatory({ apiKey, ingestionUrl: "file:///tmp/receiver" }), /HTTP or HTTPS/);
  assert.throws(() => observatory({ apiKey, timeoutMs: 0 }), /timeoutMs/);

  const badServer = createSampleApp({
    apiKey,
    ingestionUrl: "http://127.0.0.1:1/ingest",
    onDeliveryError: () => { throw new Error("callback failure"); },
  }).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => {
      badServer.once("listening", resolve);
      badServer.once("error", reject);
    });
    const address = badServer.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/users/healthy`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  } finally {
    await new Promise((resolve, reject) => badServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("aborts a receiver that does not respond within the configured timeout", async () => {
  const slowReceiver = createServer((_req, _res) => {
    // Deliberately leave the request open; the SDK timeout should abort it.
  });
  await new Promise((resolve, reject) => {
    slowReceiver.once("error", reject);
    slowReceiver.listen(0, "127.0.0.1", resolve);
  });
  const receiverAddress = slowReceiver.address();
  assert.ok(receiverAddress && typeof receiverAddress !== "string");

  let deliveryError;
  try {
    const { observatory } = await import("../dist/index.js");
    const express = (await import("express")).default;
    const timeoutApp = express();
    timeoutApp.use(observatory({
      apiKey,
      ingestionUrl: `http://127.0.0.1:${receiverAddress.port}/ingest`,
      timeoutMs: 30,
      onDeliveryError: (error) => { deliveryError = error; },
    }));
    timeoutApp.get("/timeout", (_req, res) => res.sendStatus(204));
    const timeoutServer = timeoutApp.listen(0, "127.0.0.1");
    try {
      await new Promise((resolve, reject) => {
        timeoutServer.once("listening", resolve);
        timeoutServer.once("error", reject);
      });
      const timeoutAddress = timeoutServer.address();
      assert.ok(timeoutAddress && typeof timeoutAddress !== "string");
      const response = await fetch(`http://127.0.0.1:${timeoutAddress.port}/timeout`);
      assert.equal(response.status, 204);
      await response.arrayBuffer();
      for (let attempt = 0; attempt < 40 && !deliveryError; attempt += 1) await delay(10);
      assert.ok(deliveryError instanceof Error);
      assert.match(deliveryError.message, /abort|fail/i);
    } finally {
      await new Promise((resolve, reject) => timeoutServer.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await new Promise((resolve, reject) => slowReceiver.close((error) => error ? reject(error) : resolve()));
  }
});
