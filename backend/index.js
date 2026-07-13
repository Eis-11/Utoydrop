const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim();
  }
}

const config = require("./src/config");
const { createApp } = require("./src/app");
const { JsonRepository } = require("./src/repositories/jsonRepository");

if (!config.adminPassword) {
  throw new Error("Configura ADMIN_PASSWORD en backend/.env antes de iniciar el servidor.");
}

const productsRepository = new JsonRepository(path.join(config.dataDirectory, "products.json"), async () => {
  const seedUrl = pathToFileURL(path.join(__dirname, "..", "frontend", "src", "data", "products.js")).href;
  return (await import(seedUrl)).products;
});
const categoriesRepository = new JsonRepository(path.join(config.dataDirectory, "categories.json"), [
  "Playeras", "Sudaderas", "Shorts", "Camisas", "Gorras", "Perfumes", "Accesorios", "Otros",
]);
const collectionsRepository = new JsonRepository(path.join(config.dataDirectory, "collections.json"), [
  "UTOY DROP", "YOUNGLA", "Trasher", "Skydream", "MPK True Religion", "MPK Hugo Boss",
  "MPK Chrome", "MPK All Saints", "Sad Boyz", "Antisocial Club",
]);
const ordersRepository = new JsonRepository(path.join(config.dataDirectory, "orders.json"), []);
const app = createApp({ config, productsRepository, categoriesRepository, collectionsRepository, ordersRepository });
const server = app.listen(config.port, () => console.log(`UTOY DROP running on http://localhost:${config.port}`));

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
