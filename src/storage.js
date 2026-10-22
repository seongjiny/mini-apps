import { evaluate, validTarget, FIELDS } from "./calculator.js";

export const HISTORY_KEY = "poultry-pi.records.v1";
export const HISTORY_LIMIT = 50;
export const DRAFT_KEY = "poultry-pi.draft.v1";
const DRAFT_FIELDS = [...FIELDS, "target"];

function normalizeDraft(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid draft");
  }
  return Object.fromEntries(
    DRAFT_FIELDS.map((key) => {
      const value = data[key];
      if (
        typeof value !== "string" ||
        value.length > 100 ||
        (value !== "" && !Number.isFinite(Number(value)))
      ) {
        throw new Error("Invalid draft value");
      }
      return [key, value];
    }),
  );
}

export function readDraft(storage) {
  const raw = storage.getItem(DRAFT_KEY);
  return raw === null ? null : normalizeDraft(JSON.parse(raw));
}

export function writeDraft(storage, values) {
  storage.setItem(DRAFT_KEY, JSON.stringify(normalizeDraft(values)));
}

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
