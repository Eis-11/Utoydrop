const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrder } = require("../src/services/orderService");

const products = [{
  id: 1,
  name: "Playera UTOY",
  collection: "UTOY DROP",
  price: 399,
  sizes: ["M"],
  colors: ["Negro"],
  stock: 3,
  active: true,
  image: "/shirt.jpg",
}];

const validPayload = {
  customer: { name: "Cliente", instagram: "@cliente", city: "CDMX", delivery: "Envío", payment: "Transferencia" },
  items: [{ id: 1, size: "M", color: "Negro", quantity: 2, price: 1, name: "Manipulado" }],
};

test("calcula el total usando el catálogo del servidor", () => {
  const order = buildOrder(validPayload, products);
  assert.equal(order.total, 798);
  assert.equal(order.items[0].name, "Playera UTOY");
  assert.equal(order.items[0].price, 399);
});

test("rechaza cantidades mayores al inventario", () => {
  assert.throws(() => buildOrder({ ...validPayload, items: [{ ...validPayload.items[0], quantity: 4 }] }, products), /cantidad disponible/i);
});

test("rechaza variantes que no existen", () => {
  assert.throws(() => buildOrder({ ...validPayload, items: [{ ...validPayload.items[0], size: "XL" }] }, products), /variante elegida/i);
});

test("admite categorías y variantes genéricas como perfumes", () => {
  const perfume = {
    ...products[0], id: 9, name: "Perfume UTOY", category: "Perfumes",
    sizes: ["100 ml"], colors: ["Amaderado"], option1Label: "Presentación", option2Label: "Aroma",
  };
  const order = buildOrder({
    ...validPayload,
    items: [{ id: 9, size: "100 ml", color: "Amaderado", quantity: 1 }],
  }, [perfume]);
  assert.equal(order.items[0].option1Label, "Presentación");
  assert.equal(order.items[0].option2Label, "Aroma");
  assert.equal(order.items[0].name, "Perfume UTOY");
});
