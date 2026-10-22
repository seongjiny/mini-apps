import { evaluate, validTarget, FIELDS } from "./calculator.js";

export const HISTORY_KEY = "poultry-pi.records.v1";
export const HISTORY_LIMIT = 50;

export function normalizeRecords(data) {
  if (!Array.isArray(data)) throw new Error("Invalid records");
  return data
    .filter(
      (record) =>
        record &&
        typeof record.id === "string" &&
        record.id.length > 0 &&
        record.id.length <= 100 &&
        typeof record.createdAt === "string" &&
        Number.isFinite(Date.parse(record.createdAt)) &&
        record.input &&
        FIELDS.every((key) => typeof record.input[key] === "number") &&
        evaluate(record.input).score !== null &&
        typeof record.target === "number" &&
        validTarget(record.target),
    )
    .slice(0, HISTORY_LIMIT)
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      input: { ...evaluate(record.input).values },
      target: record.target,
      pi: evaluate(record.input).score,
    }));
}

export function readRecords(storage) {
  const raw = storage.getItem(HISTORY_KEY);
  return raw === null ? [] : normalizeRecords(JSON.parse(raw));
}

export function writeRecords(storage, records) {
  const normalized = normalizeRecords(records);
  storage.setItem(HISTORY_KEY, JSON.stringify(normalized));
  return normalized;
}
