"use strict";

const { createHttpServer } = require("./http-server");

const port = parsePort(process.env.PORT ?? "3000");
const host = "0.0.0.0";
const server = createHttpServer();

server.listen(port, host, () => {
  console.log(`COUTEC server listening on ${host}:${port}`);
});

server.on("error", (error) => {
  console.error("COUTEC server failed to start:", error);
  process.exitCode = 1;
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new TypeError(`PORT inválida: ${value}`);
  }
  return parsed;
}
