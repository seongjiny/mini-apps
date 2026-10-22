export const DEFAULT_INPUT = Object.freeze({
  livability: 98.9,
  weight: 1.75,
  age: 31.3,
  fcr: 1.45,
});
export const FIELDS = Object.freeze(Object.keys(DEFAULT_INPUT));
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

export function evaluate(input) {
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
    else if (key === "livability" && (value < 0 || value > 100))
      errors[key] = "0~100%로 입력해 주세요.";
    else if (key !== "livability" && value <= 0)
      errors[key] = "0보다 큰 값을 입력해 주세요.";
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
      let possible =
        Number.isFinite(value) &&
        value > 0 &&
        (key !== "livability" || exact[key] <= 100);
      // Verify the rounded condition meets the goal, including floating-point edges.
      if (possible) {
        let score = evaluate({ ...v, [key]: value }).score;
        if (score !== null && score < t) {
          value = Number((value + (up ? 1 : -1) / scale).toFixed(digits));
          score = evaluate({ ...v, [key]: value }).score;
        }
        possible =
          score !== null &&
          score >= t &&
          value > 0 &&
          (key !== "livability" || value <= 100);
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
            key === "livability" && exact[key] > 100
              ? "100% 초과"
              : "단독 조정 불가",
        },
      ];
    }),
  );
}
