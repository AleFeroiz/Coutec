"use strict";

const http = require("node:http");

function createHttpServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return sendJson(response, 200, {
        service: "coutec-server",
        status: "ok",
      });
    }

    return sendJson(response, 404, {
      error: "not_found",
      message: "Rota não encontrada.",
    });
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

module.exports = { createHttpServer };
