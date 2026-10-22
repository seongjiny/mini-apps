import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INPUT,
  FIELDS,
  evaluate,
  validTarget,
  solveTargets,
} from "../src/calculator.js";
import {
  HISTORY_KEY,
  normalizeRecords,
  readRecords,
  writeRecords,
} from "../src/storage.js";

test("provided example displays PI 381.3 and solves all four conditions", () => {
  assert.equal(evaluate(DEFAULT_INPUT).score.toFixed(1), "381.3");
  const targets = solveTargets(DEFAULT_INPUT, 400);
  assert.equal(targets.weight.value, 1.836);
  assert.equal(targets.fcr.value, 1.382);
  assert.equal(targets.age.value, 29.84);
  assert.equal(targets.livability.possible, false);
  assert.equal(targets.livability.reason, "100% 초과");
  assert.equal(Number(targets.weight.delta.toFixed(3)), 0.086);
  assert.equal(Number(targets.fcr.delta.toFixed(3)), -0.068);
  assert.equal(Number(targets.age.delta.toFixed(2)), -1.46);
});

test("every selectable single-variable adjustment meets its target", () => {
  for (const input of [
    DEFAULT_INPUT,
    { livability: 97, weight: 2.1, age: 35, fcr: 1.6 },
    { livability: 100, weight: 2, age: 25, fcr: 2 },
  ]) {
    for (const target of [100, 300, 350, 381.35, 400, 450, 500]) {
      const solutions = solveTargets(input, target);
      for (const [key, solution] of Object.entries(solutions)) {
        if (!solution.possible) continue;
        const adjusted = { ...input, [key]: solution.value };
        assert.ok(
          evaluate(adjusted).score >= target,
          `${key} must reach ${target}`,
        );
        assert.ok(
          Math.abs(solution.value - solution.exact) <=
            1 / 10 ** solution.digits + 1e-10,
        );
        FIELDS.filter((field) => field !== key).forEach((field) =>
          assert.equal(adjusted[field], input[field]),
        );
      }
    }
  }
});

test("blank, negative, nonnumeric, and zero denominator inputs are rejected", () => {
  for (const key of FIELDS) {
    for (const value of ["", " ", undefined, null, NaN, Infinity, -1, "abc"]) {
      const invalid = { ...DEFAULT_INPUT, [key]: value };
      assert.equal(evaluate(invalid).score, null);
      assert.equal(solveTargets(invalid, 400), null);
    }
  }
  for (const key of ["weight", "age", "fcr"])
    assert.equal(evaluate({ ...DEFAULT_INPUT, [key]: 0 }).score, null);
  assert.equal(evaluate({ ...DEFAULT_INPUT, livability: 100.01 }).score, null);
  for (const invalid of ["", undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(validTarget(invalid), false);
    assert.equal(solveTargets(DEFAULT_INPUT, invalid), null);
  }
});

test("zero livability is valid but cannot be solved by weight, age, or FCR alone", () => {
  const input = { ...DEFAULT_INPUT, livability: 0 };
  assert.equal(evaluate(input).score, 0);
  const solutions = solveTargets(input, 100);
  for (const key of ["weight", "age", "fcr"])
    assert.equal(solutions[key].possible, false);
  assert.equal(solutions.livability.possible, true);
  assert.ok(
    evaluate({ ...input, livability: solutions.livability.value }).score >= 100,
  );
});

test("overflow and underflow cannot yield a misleading finite result", () => {
  assert.equal(
    evaluate({ ...DEFAULT_INPUT, weight: 1e308, age: 1e-308 }).score,
    null,
  );
  assert.equal(
    evaluate({ ...DEFAULT_INPUT, weight: 1e-308, age: 1e308 }).score,
    null,
  );
});

const record = {
  id: "test-record",
  createdAt: "2026-10-22T07:00:00.000Z",
  input: { ...DEFAULT_INPUT },
  target: 400,
};

test("records retain inputs, target, timestamp and independently recalculated PI", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  assert.deepEqual(readRecords(storage), []);
  const written = writeRecords(storage, [record]);
  assert.deepEqual(readRecords(storage), written);
  const saved = JSON.parse(data.get(HISTORY_KEY))[0];
  assert.deepEqual(saved.input, DEFAULT_INPUT);
  assert.equal(saved.createdAt, record.createdAt);
  assert.equal(saved.target, 400);
  assert.equal(saved.pi, evaluate(DEFAULT_INPUT).score);
});

test("selected scenario values are saved as the actual recorded condition", () => {
  const input = {
    ...DEFAULT_INPUT,
    weight: solveTargets(DEFAULT_INPUT, 400).weight.value,
  };
  const [saved] = normalizeRecords([{ ...record, input }]);
  assert.equal(saved.input.weight, 1.836);
  assert.ok(saved.pi >= 400);
});

test("malformed history is filtered and stored result cannot override calculation", () => {
  const result = normalizeRecords([
    null,
    {},
    { ...record, target: 0 },
    { ...record, createdAt: "invalid" },
    { ...record, input: { ...DEFAULT_INPUT, fcr: 0 } },
    { ...record, pi: 999 },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].pi, evaluate(DEFAULT_INPUT).score);
  assert.throws(() => normalizeRecords({}));
  assert.throws(() => readRecords({ getItem: () => "{invalid" }));
});

test("records are limited to the latest 50 and storage failures propagate", () => {
  const result = normalizeRecords(
    Array.from({ length: 55 }, (_, index) => ({
      ...record,
      id: String(index),
    })),
  );
  assert.equal(result.length, 50);
  assert.equal(result[0].id, "0");
  assert.equal(result[49].id, "49");
  assert.throws(
    () =>
      writeRecords(
        {
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        [record],
      ),
    /Quota exceeded/,
  );
});
