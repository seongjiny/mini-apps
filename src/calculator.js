export const DEFAULT_INPUT = Object.freeze({
  livability: 98.9,
  weight: 1.75,
  age: 31.3,
  fcr: 1.45,
});
export const FIELDS = Object.freeze(Object.keys(DEFAULT_INPUT));
export const MAX_TARGET_LIVABILITY = 103;
export const INPUT_RANGES = Object.freeze({
  weight: Object.freeze({ min: 1, max: 5 }),
  age: Object.freeze({ min: 20, max: 50 }),
});

export function weightInKg(raw, unit = "kg") {
  return raw === "" ? "" : Number(raw) / (unit === "g" ? 1000 : 1);
}

export function displayWeight(kg, unit = "kg") {
  return Number((kg * (unit === "g" ? 1000 : 1)).toPrecision(15));
}
export const LABELS = Object.freeze({
  livability: "육성률",
  weight: "평체",
  age: "사육일령",
  fcr: "사료요구율",
});
export const UNITS = Object.freeze({
  livability: "%",
  weight: "kg",
  age: "일",
  fcr: "",
});

export function validTarget(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "")
    return false;
  return Number.isFinite(Number(raw)) && Number(raw) > 0;
}

export function evaluate(input, { enforceRanges = true } = {}) {
  const values = {},
    errors = {};
  for (const key of FIELDS) {
    const raw = input?.[key];
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      errors[key] = "값을 입력해 주세요.";
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) errors[key] = "숫자로 입력해 주세요.";
    else if (key === "livability" && value < 0)
      errors[key] = "0% 이상으로 입력해 주세요.";
    else if (key !== "livability" && value <= 0)
      errors[key] = "0보다 큰 값을 입력해 주세요.";
    else if (
      enforceRanges &&
      INPUT_RANGES[key] &&
      (value < INPUT_RANGES[key].min || value > INPUT_RANGES[key].max)
    )
      errors[key] =
        key === "weight"
          ? "1~5kg으로 입력해 주세요."
          : "20~50일로 입력해 주세요.";
    else values[key] = value;
  }
  let score = Object.keys(errors).length
    ? null
    : ((values.livability * values.weight) / (values.age * values.fcr)) * 100;
  if (
    score !== null &&
    (!Number.isFinite(score) || (values.livability > 0 && score === 0))
  ) {
    errors.fcr = "계산 가능한 범위로 입력해 주세요.";
    score = null;
  }
  return { values, errors, score };
}

export function solveTargets(input, target) {
  const current = evaluate(input);
  if (current.score === null || !validTarget(target)) return null;
  const v = current.values,
    t = Number(target);
  const exact = {
    weight: (t * v.age * v.fcr) / (v.livability * 100),
    fcr: (v.livability * v.weight * 100) / (t * v.age),
    age: (v.livability * v.weight * 100) / (t * v.fcr),
    livability: (t * v.age * v.fcr) / (v.weight * 100),
  };
  return Object.fromEntries(
    ["weight", "fcr", "age", "livability"].map((key) => {
      const up = key === "weight" || key === "livability";
      const digits = key === "weight" || key === "fcr" ? 3 : 2;
      const scale = 10 ** digits;
      let value =
        (up ? Math.ceil(exact[key] * scale) : Math.floor(exact[key] * scale)) /
        scale;
      const limits =
        key === "livability"
          ? { min: 0, max: MAX_TARGET_LIVABILITY }
          : INPUT_RANGES[key];
      if (limits) value = Math.max(limits.min, Math.min(value, limits.max));
      let possible = Number.isFinite(value) && value > 0;
      // Verify the rounded condition meets the goal, including floating-point edges.
      if (possible) {
        let score = evaluate({ ...v, [key]: value }).score;
        if (
          score !== null &&
          score < t &&
          (!limits || (up ? value < limits.max : value > limits.min))
        ) {
          value = Number((value + (up ? 1 : -1) / scale).toFixed(digits));
          score = evaluate({ ...v, [key]: value }).score;
        }
        possible =
          score !== null &&
          score >= t &&
          value > 0 &&
          (!limits || (value >= limits.min && value <= limits.max));
      }
      return [
        key,
        {
          value,
          exact: exact[key],
          possible,
          digits,
          up,
          delta: value - v[key],
          reason:
            key === "livability"
              ? "103%로 달성 불가"
              : key === "weight"
                ? "5kg로 달성 불가"
                : key === "age"
                  ? "20일로 달성 불가"
                  : "단독 조정 불가",
        },
      ];
    }),
  );
}
