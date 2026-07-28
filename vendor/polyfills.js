if (typeof structuredClone === "undefined") {
  window.structuredClone = function (o) { return JSON.parse(JSON.stringify(o)); };
}
