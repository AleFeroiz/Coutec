"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createHttpServer } = require("../src/http-server");

test("GET /health informa que o servidor está online", async (context) => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: "coutec-server",
    status: "ok",
  });
});

test("rotas desconhecidas retornam JSON e status 404", async (context) => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/inexistente`);

  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "not_found");
});
