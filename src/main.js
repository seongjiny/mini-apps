import "./style.css";
import {
  FIELDS,
  LABELS,
  UNITS,
  evaluate,
  validTarget,
  solveTargets,
} from "./calculator.js";
import { readRecords, writeRecords, HISTORY_LIMIT } from "./storage.js";

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
let records = [],
  selectedKey = null,
  selectedValues = null,
  announcementTimer;

function status(message, error = false) {
  $("save-status").textContent = message;
  $("save-status").classList.toggle("error", error);
}
function readInputs() {
  return evaluate(Object.fromEntries(FIELDS.map((key) => [key, $(key).value])));
}
function render() {
  const current = readInputs(),
    target = Number($("target").value);
  const targetValid = validTarget($("target").value);
  $("pi-result").textContent =
    current.score === null ? "—" : number(current.score, 1);
  for (const key of FIELDS) {
    $("error-" + key).textContent = current.errors[key] || "";
    $(key).setAttribute("aria-invalid", String(Boolean(current.errors[key])));
  }
  $("error-target").textContent = targetValid
    ? ""
    : "목표 PI는 0보다 큰 값으로 입력하세요.";
  $("target").setAttribute("aria-invalid", String(!targetValid));
  const solutions = targetValid ? solveTargets(current.values, target) : null;
  selectedValues = null;
  $("save-record").disabled = !solutions;
  if (!solutions) {
    $("target-rows").innerHTML =
      '<tr><td colspan="3" class="table-empty">입력값을 확인해 주세요.</td></tr>';
    $("scenario-label").textContent = "현재 조건";
    $("scenario-pi").textContent = "PI —";
    $("scenario-status").textContent = "";
    announce("입력값을 확인해 주세요.");
    return;
  }
  if (selectedKey && !solutions[selectedKey].possible) selectedKey = null;
  selectedValues = { ...current.values };
  if (selectedKey) selectedValues[selectedKey] = solutions[selectedKey].value;
  $("target-rows").innerHTML = Object.entries(solutions)
    .map(([key, solution]) => {
      const selected = selectedKey === key;
      return `<tr class="${selected ? "selected" : ""}"><th scope="row">${LABELS[key]}</th><td><button type="button" data-key="${key}" aria-pressed="${selected}" aria-label="${LABELS[key]}만 조정${solution.possible ? "" : " 불가"}" ${solution.possible ? "" : "disabled"}>${solution.possible ? `<b>${number(solution.value, solution.digits)}</b><small>${UNITS[key]} ${solution.up ? "이상" : "이하"}</small>` : `<span class="impossible">${solution.reason}</span>`}</button></td><td>${solution.possible ? `<span class="delta">${solution.delta > 0 ? "+" : ""}${number(solution.delta, solution.digits)}${key === "livability" ? "%p" : UNITS[key]}</span>` : "—"}</td></tr>`;
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
    result.textContent = `목표 ${number(record.target)} → PI ${number(record.pi, 1)}`;
    const time = document.createElement("time");
    time.dateTime = record.createdAt;
    time.textContent = dateFormat.format(new Date(record.createdAt));
    time.title = fullDateFormat.format(new Date(record.createdAt));
    top.append(result, time);
    const values = document.createElement("span");
    values.className = "record-values";
    values.textContent = `${number(record.input.livability)}% · ${number(record.input.weight)}kg · ${number(record.input.age)}일 · FCR ${number(record.input.fcr)}`;
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
    selectedKey = null;
    status("");
    render();
  }),
);
$("target").addEventListener("input", () => {
  status("");
  render();
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
$("save-record").addEventListener("click", () => {
  if (!selectedValues || !validTarget($("target").value)) return;
  try {
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      input: { ...selectedValues },
      target: Number($("target").value),
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
      $(key).value = record.input[key];
    });
    $("target").value = record.target;
    selectedKey = null;
    render();
    status("저장한 조건을 불러왔습니다.");
    $("target").focus({ preventScroll: true });
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
renderRecords();
render();
