/**
 * TEST-ONLY compatibility shim for MongoDB-compatible servers (e.g. FerretDB 1.x) whose $group
 * support is incomplete (multiple accumulators / $max). Enabled only when MONGO_TEST_COMPAT=1.
 *
 * It evaluates the simple [$match, $group] pipelines RideLedger uses by fetching the matched
 * documents and grouping them in JavaScript, which reproduces MongoDB semantics for:
 *   _id: null | '$field' | { key: '$field', ... }
 *   accumulators: { $sum: <number> | '$field' }, { $max: '$field' }
 * Any other pipeline shape falls through to the real server unchanged.
 * Production code never loads this file; against real MongoDB it is not needed.
 */
const mongoose = require('mongoose');

const fieldOf = (expr) => (typeof expr === 'string' && expr.startsWith('$') ? expr.slice(1) : null);
const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);

function isSupported(pipeline) {
  if (!Array.isArray(pipeline) || pipeline.length !== 2 || !pipeline[0].$match || !pipeline[1].$group) return false;
  const { _id, ...acc } = pipeline[1].$group;
  const idOk = _id === null || fieldOf(_id) || (typeof _id === 'object' && Object.values(_id).every(fieldOf));
  const accOk = Object.values(acc).every((a) => {
    const [[op, arg]] = Object.entries(a);
    return (op === '$sum' && (typeof arg === 'number' || fieldOf(arg))) || (op === '$max' && fieldOf(arg));
  });
  return Boolean(idOk) && accOk;
}

function groupInMemory(docs, group) {
  const { _id: idSpec, ...acc } = group;
  const buckets = new Map();
  for (const doc of docs) {
    let id;
    if (idSpec === null) id = null;
    else if (typeof idSpec === 'string') id = get(doc, fieldOf(idSpec)) ?? null;
    else id = Object.fromEntries(Object.entries(idSpec).map(([k, e]) => [k, get(doc, fieldOf(e)) ?? null]));
    const key = JSON.stringify(id);
    if (!buckets.has(key)) {
      const init = { _id: id };
      for (const [name, a] of Object.entries(acc)) init[name] = a.$sum !== undefined ? 0 : null;
      buckets.set(key, init);
    }
    const b = buckets.get(key);
    for (const [name, a] of Object.entries(acc)) {
      if (a.$sum !== undefined) {
        const v = typeof a.$sum === 'number' ? a.$sum : get(doc, fieldOf(a.$sum));
        if (typeof v === 'number') b[name] += v;
      } else {
        const v = get(doc, fieldOf(a.$max));
        if (v !== undefined && v !== null && (b[name] === null || v > b[name])) b[name] = v;
      }
    }
  }
  return [...buckets.values()];
}

function install() {
  const original = mongoose.Model.aggregate;
  mongoose.Model.aggregate = function aggregate(pipeline, ...rest) {
    if (!isSupported(pipeline)) return original.call(this, pipeline, ...rest);
    return this.collection.find(pipeline[0].$match).toArray().then((docs) => groupInMemory(docs, pipeline[1].$group));
  };
}

module.exports = { install, groupInMemory, isSupported };
