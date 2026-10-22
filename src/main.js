import "./style.css";
import {
  FIELDS,
  LABELS,
  UNITS,
  evaluate,
  validTarget,
  solveTargets,
  weightInKg,
  displayWeight,
} from "./calculator.js";
import {
  readRecords,
  writeRecords,
  readDraft,
  writeDraft,
  HISTORY_LIMIT,
} from "./storage.js";

const $ = (id) => document.getElementById(id);
const number = (value, digits = 3) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(
    value,
  );
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fullDateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
});
const touched = new Set();
let weightUnit = "kg";
let records = [],
  selectedKey = null,
  selectedValues = null,
  announcementTimer;

function status(message, error = false) {
  $("save-status").textContent = message;
  $("save-status").classList.toggle("error", error);
}
function readInputs() {
  const values = Object.fromEntries(FIELDS.map((key) => [key, $(key).value]));
  values.weight = weightInKg(values.weight, weightUnit);
  const result = evaluate(values);
  if (
    weightUnit === "g" &&
    result.errors.weight &&
    values.weight !== "" &&
    Number.isFinite(values.weight) &&
    (values.weight < 1 || values.weight > 5)
  ) {
    result.errors.weight = "1,000~5,000g으로 입력해 주세요.";
  }
  return result;
}
function fieldNumber(key, value, digits = 3) {
  return number(
    key === "weight" ? displayWeight(value, weightUnit) : value,
    digits,
  );
}
function fieldUnit(key) {
  return key === "weight" ? weightUnit : UNITS[key];
}
function syncWeightUnit() {
  $("weight").min = weightUnit === "g" ? "1000" : "1";
  $("weight").max = weightUnit === "g" ? "5000" : "5";
  $("weight-unit-label").textContent = weightUnit;
  $("weight-range").textContent = weightUnit === "g" ? "1,000~5,000g" : "1~5kg";
  document.querySelectorAll("[data-weight-unit]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.weightUnit === weightUnit),
    );
  });
}
function persistDraft() {
  try {
    writeDraft(localStorage, {
      ...Object.fromEntries(
        [...FIELDS, "target"].map((key) => [key, $(key).value]),
      ),
      weightUnit,
    });
  } catch {
    status(
      "입력값을 자동 저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.",
      true,
    );
  }
}
function render() {
  const current = readInputs(),
    target = Number($("target").value);
  const targetValid = validTarget($("target").value);
  $("targets-title").textContent = targetValid
    ? `PI ${number(target)}${/[136780]$/.test(String(target)) ? "을" : "를"} 달성하기 위해선`
    : "목표 PI를 달성하기 위해선";
  $("pi-result").textContent =
    current.score === null ? "—" : number(current.score, 1);
  for (const key of FIELDS) {
    const error = touched.has(key) ? current.errors[key] || "" : "";
    $("error-" + key).textContent = error;
    $(key).setAttribute("aria-invalid", String(Boolean(error)));
  }
  const targetError = touched.has("target") && !targetValid;
  $("error-target").textContent = targetError
    ? "목표 PI는 0보다 큰 값으로 입력하세요."
    : "";
  $("target").setAttribute("aria-invalid", String(targetError));
  const solutions = targetValid ? solveTargets(current.values, target) : null;
  selectedValues = null;
  $("scenario-actions").hidden = true;
  $("save-record").disabled = current.score === null;
  if (!solutions) {
    selectedKey = null;
    const hasInvalidValue = [...FIELDS, "target"].some(
      (key) =>
        $(key).value.trim() !== "" &&
        (key === "target" ? !targetValid : Boolean(current.errors[key])),
    );
    const message = hasInvalidValue
      ? "입력값을 확인해 주세요."
      : current.score !== null
        ? "목표 PI를 입력해 주세요."
        : targetValid
          ? "현재 조건을 모두 입력해 주세요."
          : "현재 조건과 목표 PI를 입력해 주세요.";
    $("target-rows").innerHTML =
      `<tr><td colspan="3" class="table-empty">${message}</td></tr>`;
    $("scenario-label").textContent = "현재 조건";
    $("scenario-pi").textContent =
      current.score === null ? "PI —" : "PI " + number(current.score, 1);
    $("scenario-status").textContent = "";
    announce(message);
    return;
  }
  if (selectedKey && !solutions[selectedKey].possible) selectedKey = null;
  selectedValues = { ...current.values };
  if (selectedKey) {
    selectedValues[selectedKey] = solutions[selectedKey].value;
    $("scenario-change").textContent =
      `${LABELS[selectedKey]} ${fieldNumber(selectedKey, current.values[selectedKey])}${fieldUnit(selectedKey)} → ${fieldNumber(selectedKey, selectedValues[selectedKey])}${fieldUnit(selectedKey)}`;
    $("scenario-actions").hidden = false;
  }
  $("target-rows").innerHTML = Object.entries(solutions)
    .map(([key, solution]) => {
      const selected = selectedKey === key;
      const reason =
        key === "weight" && weightUnit === "g"
          ? "5,000g으로 달성 불가"
          : solution.reason;
      return `<tr class="${selected ? "selected" : ""}"><th scope="row">${LABELS[key]}</th><td><button type="button" data-key="${key}" aria-pressed="${selected}" aria-label="${LABELS[key]}만 조정${solution.possible ? "" : " 불가"}" ${solution.possible ? "" : "disabled"}>${solution.possible ? `<b>${fieldNumber(key, solution.value, solution.digits)}</b><small>${fieldUnit(key)} ${solution.up ? "이상" : "이하"}</small>` : `<span class="impossible">${reason}</span>`}</button></td><td>${solution.possible ? `<span class="delta">${solution.delta > 0 ? "+" : ""}${fieldNumber(key, solution.delta, solution.digits)}${key === "livability" ? "%p" : fieldUnit(key)}</span>` : "—"}</td></tr>`;
    })
    .join("");
  const score = evaluate(selectedValues).score;
  const gap = target - score;
  $("scenario-label").textContent = selectedKey
    ? LABELS[selectedKey] + "만 조정"
    : "현재 조건";
  $("scenario-pi").textContent = "PI " + number(score, 1);
  $("scenario-status").textContent =
    score >= target
      ? "목표 이상"
      : gap < 0.1
        ? "목표까지 0.1 미만"
        : "목표까지 " + number(gap, 1);
  announce(
    `현재 PI ${number(current.score, 1)}. ${$("scenario-label").textContent}의 PI ${number(score, 1)}. ${$("scenario-status").textContent}.`,
  );
}
function announce(message) {
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => {
    $("calculation-status").textContent = message;
  }, 450);
}
function renderRecords() {
  $("record-count").textContent = records.length ? records.length : "";
  const container = $("records");
  container.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "records-empty";
    empty.textContent = "저장한 기록이 없습니다.";
    container.append(empty);
    return;
  }
  records.forEach((record, index) => {
    const article = document.createElement("article");
    article.className = "record";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "record-load";
    load.dataset.load = index;
    load.setAttribute(
      "aria-label",
      fullDateFormat.format(new Date(record.createdAt)) + " 기록 불러오기",
    );
    const top = document.createElement("span");
    top.className = "record-top";
    const result = document.createElement("strong");
    result.textContent = `PI ${number(record.pi, 1)}`;
    const time = document.createElement("time");
    time.dateTime = record.createdAt;
    time.textContent = dateFormat.format(new Date(record.createdAt));
    time.title = fullDateFormat.format(new Date(record.createdAt));
    top.append(result, time);
    const values = document.createElement("span");
    values.className = "record-values";
    values.textContent = `${number(record.input.livability)}% · ${fieldNumber("weight", record.input.weight)}${weightUnit} · ${number(record.input.age)}일 · FCR ${number(record.input.fcr)}`;
    load.append(top, values);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "record-delete";
    remove.dataset.delete = index;
    remove.textContent = "삭제";
    remove.setAttribute(
      "aria-label",
      fullDateFormat.format(new Date(record.createdAt)) + " 기록 삭제",
    );
    article.append(load, remove);
    container.append(article);
  });
}

FIELDS.forEach((key) =>
  $(key).addEventListener("input", () => {
    touched.add(key);
    selectedKey = null;
    status("");
    render();
    persistDraft();
  }),
);
document.querySelectorAll("[data-weight-unit]").forEach((button) =>
  button.addEventListener("click", () => {
    const nextUnit = button.dataset.weightUnit;
    if (nextUnit === weightUnit) return;
    const raw = $("weight").value;
    const kg = weightInKg(raw, weightUnit);
    weightUnit = nextUnit;
    if (raw !== "") $("weight").value = displayWeight(kg, weightUnit);
    syncWeightUnit();
    status("");
    render();
    renderRecords();
    persistDraft();
  }),
);
$("target").addEventListener("input", () => {
  touched.add("target");
  status("");
  render();
  persistDraft();
});
[...FIELDS, "target"].forEach((key) => {
  $(key).addEventListener("blur", () => {
    touched.add(key);
    const error =
      key === "target"
        ? validTarget($(key).value)
          ? ""
          : "목표 PI는 0보다 큰 값으로 입력하세요."
        : readInputs().errors[key] || "";
    $("error-" + key).textContent = error;
    $(key).setAttribute("aria-invalid", String(Boolean(error)));
  });
});
$("pi-form").addEventListener("submit", (event) => event.preventDefault());
$("target-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-key]");
  if (!button || button.disabled) return;
  selectedKey = selectedKey === button.dataset.key ? null : button.dataset.key;
  status("");
  render();
  // The table is rebuilt; retain keyboard focus on the chosen control.
  $("target-rows")
    .querySelector(`[data-key="${button.dataset.key}"]`)
    ?.focus({ preventScroll: true });
});
$("apply-scenario").addEventListener("click", () => {
  if (!selectedKey || !selectedValues) return;
  const key = selectedKey;
  $(key).value =
    key === "weight"
      ? displayWeight(selectedValues[key], weightUnit)
      : selectedValues[key];
  touched.add(key);
  selectedKey = null;
  render();
  status(`${LABELS[key]} 적용 완료`);
  persistDraft();
  $("conditions-title").focus({ preventScroll: true });
  $("conditions-title").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
});
$("close-scenario").addEventListener("click", () => {
  const key = selectedKey;
  selectedKey = null;
  status("");
  render();
  if (key)
    $("target-rows")
      .querySelector(`[data-key="${key}"]`)
      ?.focus({ preventScroll: true });
});
$("save-record").addEventListener("click", () => {
  const current = readInputs();
  if (current.score === null) return;
  try {
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      input: { ...current.values },
    };
    records = writeRecords(
      localStorage,
      [record, ...records].slice(0, HISTORY_LIMIT),
    );
    $("records").hidden = false;
    updateToggle();
    renderRecords();
    status("기록을 저장했습니다.");
  } catch {
    status(
      "저장하지 못했습니다. 브라우저의 저장 공간·설정을 확인해 주세요.",
      true,
    );
  }
});
$("records").addEventListener("click", (event) => {
  const load = event.target.closest("[data-load]");
  const remove = event.target.closest("[data-delete]");
  if (load) {
    const record = records[Number(load.dataset.load)];
    if (!record) return;
    FIELDS.forEach((key) => {
      $(key).value =
        key === "weight"
          ? displayWeight(record.input[key], weightUnit)
          : record.input[key];
    });
    selectedKey = null;
    render();
    status("저장한 조건을 불러왔습니다.");
    persistDraft();
    $("conditions-title").focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  } else if (remove) {
    const index = Number(remove.dataset.delete);
    try {
      records = writeRecords(
        localStorage,
        records.filter((_, i) => i !== index),
      );
      renderRecords();
      status("기록을 삭제했습니다.");
    } catch {
      status(
        "기록을 삭제하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.",
        true,
      );
    }
  }
});
function updateToggle() {
  const hidden = $("records").hidden;
  $("records-toggle").textContent = hidden ? "보기" : "가리기";
  $("records-toggle").setAttribute("aria-expanded", String(!hidden));
}
$("records-toggle").addEventListener("click", () => {
  $("records").hidden = !$("records").hidden;
  updateToggle();
});
try {
  records = readRecords(localStorage);
} catch {
  status("이전 기록을 읽을 수 없습니다. 계산은 계속 사용할 수 있습니다.", true);
}
try {
  const draft = readDraft(localStorage);
  if (draft) {
    weightUnit = draft.weightUnit;
    [...FIELDS, "target"].forEach((key) => {
      $(key).value = draft[key];
      if (draft[key] !== "") touched.add(key);
    });
  }
} catch {
  status("마지막 입력값을 불러오지 못했습니다. 새로 입력해 주세요.", true);
}
syncWeightUnit();
renderRecords();
render();
