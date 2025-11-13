const fetch = require("node-fetch"); // works with node-fetch v2

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node simulate_traffic.js <url>");
  process.exit(1);
}

async function simulateRequest(method, path, body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body) options.body = JSON.stringify(body);
  try {
    await fetch(`${baseUrl}${path}`, options);
  } catch {
    // ignore errors silently
  }
}

async function runSimulation(durationMs = 5 * 60 * 1000) { // 5 minutes
  const endTime = Date.now() + durationMs;
  while (Date.now() < endTime) {
    await Promise.all([
      simulateRequest("GET", "/pizzas"),
      simulateRequest("POST", "/pizzas", { type: "pepperoni", size: "large" }),
      simulateRequest("GET", "/users"),
      simulateRequest("POST", "/auth/login", { user: "admin", pass: "password" }),
      simulateRequest("DELETE", "/pizzas/1"),
    ]);
    await new Promise((r) => setTimeout(r, 500)); // 0.5 s between batches
  }
}

runSimulation();
