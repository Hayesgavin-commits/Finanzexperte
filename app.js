(() => {
  "use strict";
  const $ = (x) => document.getElementById(x),
    cash = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }),
    monthFmt = new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    }),
    days = [
      "Sonntag",
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
    ];
  let entries = [],
    opening = 0,
    kind = "expense",
    editing = "",
    shown = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthKey = (d) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
    dateToday = () => {
      const d = new Date();
      return monthKey(d) + "-" + String(d.getDate()).padStart(2, "0");
    },
    number = (v) => Number(String(v).replace(",", ".")),
    safe = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  function diff(a, b) {
    const A = a.split("-").map(Number),
      B = b.split("-").map(Number);
    return (B[0] - A[0]) * 12 + B[1] - A[1];
  }
  function count(x, m) {
    const md = diff(x.date.slice(0, 7), m);
    if (md < 0 || (x.endMonth && m > x.endMonth)) return 0;
    const stop = x.stopDate ? new Date(x.stopDate + "T00:00") : null;
    if (x.frequency === "once")
      return md === 0 && (!stop || new Date(x.date + "T12:00") < stop) ? 1 : 0;
    if (["monthly", "quarterly", "yearly"].includes(x.frequency)) {
      if (x.frequency === "quarterly" && md % 3 !== 0) return 0;
      if (x.frequency === "yearly" && md % 12 !== 0) return 0;
      const p = m.split("-").map(Number),
        wantedDay = Number(x.date.slice(8, 10)),
        last = new Date(p[0], p[1], 0).getDate(),
        due = new Date(p[0], p[1] - 1, Math.min(wantedDay, last), 12);
      return !stop || due < stop ? 1 : 0;
    }
    if (x.frequency === "weekly") {
      const p = m.split("-").map(Number),
        last = new Date(p[0], p[1], 0).getDate(),
        start = new Date(x.date + "T12:00");
      let n = 0;
      for (let i = 1; i <= last; i++) {
        const d = new Date(p[0], p[1] - 1, i, 12);
        if (
          d >= start &&
          (!stop || d < stop) &&
          d.getDay() === Number(x.weekday)
        )
          n++;
      }
      return n;
    }
    return 0;
  }
  function rows(m) {
    return entries
      .map((x) => ({ ...x, n: count(x, m) }))
      .filter((x) => x.n)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function sums(m) {
    const a = rows(m);
    return {
      a,
      inc: a
        .filter((x) => x.kind === "income")
        .reduce((s, x) => s + x.amount * x.n, 0),
      out: a
        .filter((x) => x.kind === "expense")
        .reduce((s, x) => s + x.amount * x.n, 0),
      n: a.reduce((s, x) => s + x.n, 0),
    };
  }
  function balanceAt(m) {
    const anchor =
        localStorage.getItem("fe-balance-month") || monthKey(new Date()),
      n = diff(anchor, m);
    let v = opening,
      d;
    if (n >= 0) {
      d = new Date(anchor + "-01T12:00");
      for (let i = 0; i <= n; i++) {
        const s = sums(monthKey(d));
        v += s.inc - s.out;
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    } else {
      d = new Date(m + "-01T12:00");
      for (let i = 0; i < Math.abs(n); i++) {
        const s = sums(monthKey(d));
        v -= s.inc - s.out;
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    return v;
  }
  function art(x) {
    return x.frequency === "monthly"
      ? "↻ Monatlich"
      : x.frequency === "weekly"
        ? "↻ Wöchentlich am " + days[x.weekday]
        : x.frequency === "quarterly"
          ? "↻ Vierteljährlich"
          : x.frequency === "yearly"
            ? "↻ Jährlich"
            : "Einmalig";
  }
  function save() {
    localStorage.setItem("fe-entries", JSON.stringify(entries));
    localStorage.setItem("fe-balance", opening);
    render();
  }
  function render() {
    const m = monthKey(shown),
      s = sums(m);
    $("balance").textContent = cash.format(opening);
    $("monthTitle").textContent = $("listTitle").textContent =
      monthFmt.format(shown);
    $("income").textContent = cash.format(s.inc);
    $("expense").textContent = cash.format(s.out);
    $("result").textContent = cash.format(s.inc - s.out);
    $("result").className = s.inc - s.out < 0 ? "negative" : "";
    let f = document.querySelector(".forecast");
    if (!f) {
      f = document.createElement("div");
      f.className = "forecast";
      document.querySelector(".summary").after(f);
    }
    f.innerHTML =
      "<span>Kontostand am Monatsende – wird in den Folgemonat übernommen</span><b>" +
      cash.format(balanceAt(m)) +
      "</b>";
    $("count").textContent = s.n;
    $("empty").classList.toggle("hidden", s.a.length > 0);
    $("entries").innerHTML = s.a
      .map(
        (x) =>
          '<tr class="selectable-row" data-entry="' +
          x.id +
          '"><td>' +
          (x.frequency !== "once" ? "ab " : "") +
          new Date(x.date + "T12:00").toLocaleDateString("de-DE") +
          (x.n > 1 ? "<br><small>" + x.n + "× in diesem Monat</small>" : "") +
          '</td><td><span class="badge ' +
          (x.frequency !== "once" ? "repeat" : "") +
          '">' +
          art(x) +
          "</span>" +
          (x.stopDate
            ? "<br><small>beendet ab " +
              new Date(x.stopDate + "T12:00").toLocaleDateString("de-DE") +
              "</small>"
            : "") +
          "</td><td>" +
          safe(x.category) +
          "</td><td>" +
          safe(x.item || "–") +
          "</td><td>" +
          (x.usage === "saving"
            ? '<span class="badge">Ansparen: ' +
              safe(x.savingGoal || x.item) +
              "</span>"
            : "Normal") +
          '</td><td class="money ' +
          (x.kind === "income" ? "in" : "out") +
          '">' +
          (x.kind === "income" ? "+" : "−") +
          cash.format(x.amount * x.n) +
          '</td><td><div class="rowbuttons"><button data-edit="' +
          x.id +
          '">✎</button>' +
          (x.frequency !== "once"
            ? '<button data-stop="' + x.id + '">Beenden</button>'
            : "") +
          '<button class="delete" data-delete="' +
          x.id +
          '">×</button></div></td></tr>',
      )
      .join("");
    document
      .querySelectorAll("[data-edit]")
      .forEach((b) => (b.onclick = () => edit(b.dataset.edit)));
    document.querySelectorAll("[data-entry]").forEach(
      (row) =>
        (row.onclick = (event) => {
          if (!event.target.closest("button")) edit(row.dataset.entry);
        }),
    );
    document
      .querySelectorAll("[data-stop]")
      .forEach((b) => (b.onclick = () => stopEntry(b.dataset.stop)));
    document.querySelectorAll("[data-delete]").forEach(
      (b) =>
        (b.onclick = () => {
          entries = entries.filter((x) => x.id !== b.dataset.delete);
          save();
        }),
    );
    renderMonths();
    renderSavings();
  }
  function renderMonths() {
    if (!entries.length) {
      $("monthsEmpty").classList.remove("hidden");
      $("months").innerHTML = "";
      return;
    }
    $("monthsEmpty").classList.add("hidden");
    const ys = entries.map((x) => +x.date.slice(0, 4)),
      now = new Date().getFullYear();
    let first = Math.min(...ys, now),
      last = Math.max(...ys, now),
      out = [],
      ti = 0,
      to = 0,
      tn = 0;
    entries.forEach(
      (x) =>
        (last = Math.max(
          last,
          x.stopDate
            ? +x.stopDate.slice(0, 4)
            : x.endMonth
              ? +x.endMonth.slice(0, 4)
              : x.frequency === "once"
                ? +x.date.slice(0, 4)
                : now + 1,
        )),
    );
    for (let y = first; y <= last; y++)
      for (let mo = 1; mo <= 12; mo++) {
        const k = y + "-" + String(mo).padStart(2, "0"),
          s = sums(k),
          b = balanceAt(k);
        out.push(
          "<tr><td>" +
            monthFmt.format(new Date(y, mo - 1, 1)) +
            '</td><td class="money in">' +
            cash.format(s.inc) +
            '</td><td class="money out">' +
            cash.format(s.out) +
            '</td><td class="' +
            (s.inc - s.out < 0 ? "negative" : "") +
            '">' +
            cash.format(s.inc - s.out) +
            '</td><td class="' +
            (b < 0 ? "negative" : "") +
            '">' +
            cash.format(b) +
            "</td><td>" +
            s.n +
            '</td><td><button class="open-month" data-month="' +
            k +
            '">Anzeigen</button></td></tr>',
        );
        ti += s.inc;
        to += s.out;
        tn += s.n;
      }
    $("months").innerHTML = out.join("");
    $("allIn").textContent = cash.format(ti);
    $("allOut").textContent = cash.format(to);
    $("allResult").textContent = cash.format(ti - to);
    $("allCount").textContent = tn;
    document.querySelectorAll("[data-month]").forEach(
      (button) =>
        (button.onclick = () => {
          const parts = button.dataset.month.split("-").map(Number);
          shown = new Date(parts[0], parts[1] - 1, 1);
          view("monthView", "monthTab");
          render();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }),
    );
  }
  function renderSavings() {
    const g = {};
    entries
      .filter(
        (x) => x.kind === "expense" && x.usage === "saving" && x.savingGoal,
      )
      .forEach((x) => {
        const name = x.savingGoal.trim();
        g[name] ??= { saved: 0, target: Number(x.savingTarget) || 0 };
        let d = new Date(x.date.slice(0, 7) + "-01T12:00"),
          end = monthKey(new Date());
        while (monthKey(d) <= end) {
          g[name].saved += x.amount * count(x, monthKey(d));
          d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        }
        g[name].target = Math.max(g[name].target, Number(x.savingTarget) || 0);
      });
    const list = Object.entries(g);
    $("savingsEmpty").classList.toggle("hidden", !!list.length);
    $("savingsList").innerHTML = list
      .map(([name, v]) => {
        const p = v.target ? Math.min(100, (v.saved / v.target) * 100) : 0;
        return (
          '<article class="goal"><div class="goalhead"><b>' +
          safe(name) +
          "</b><span>" +
          cash.format(v.saved) +
          '</span></div><div class="progress"><div style="width:' +
          p +
          '%"></div></div><div class="goaldetail"><span>' +
          (v.target ? "Ziel: " + cash.format(v.target) : "Kein Zielbetrag") +
          "</span><span>" +
          (v.target ? Math.round(p) + " %" : "–") +
          "</span></div></article>"
        );
      })
      .join("");
  }
  function fields() {
    $("weekdayLabel").classList.toggle(
      "hidden",
      $("frequency").value !== "weekly",
    );
    $("endLabel").classList.toggle("hidden", $("frequency").value === "once");
    $("stopLabel").classList.toggle("hidden", $("frequency").value === "once");
    $("usageLabel").classList.toggle("hidden", kind !== "expense");
    if (kind === "income") $("usage").value = "regular";
    const saving = kind === "expense" && $("usage").value === "saving";
    $("savingGoalLabel").classList.toggle("hidden", !saving);
    $("savingTargetLabel").classList.toggle("hidden", !saving);
    $("savingGoal").required = saving;
  }
  function setKind(v) {
    kind = v;
    $("expenseBtn").classList.toggle("active", v === "expense");
    $("incomeBtn").classList.toggle("active", v === "income");
    $("kindTitle").textContent = v === "income" ? "Einnahme" : "Ausgabe";
    fields();
  }
  function reset() {
    editing = "";
    [
      "amount",
      "item",
      "endMonth",
      "stopDate",
      "savingGoal",
      "savingTarget",
    ].forEach((x) => ($(x).value = ""));
    $("category").value = "";
    $("date").value = dateToday();
    $("frequency").value = "once";
    $("weekday").value = "1";
    $("usage").value = "regular";
    $("formLabel").textContent = "Neue Buchung";
    $("saveBtn").textContent = "Buchung hinzufügen";
    $("cancelBtn").classList.add("hidden");
    fields();
  }
  function edit(id) {
    const x = entries.find((a) => a.id === id);
    if (!x) return;
    editing = id;
    setKind(x.kind);
    $("amount").value = String(x.amount).replace(".", ",");
    $("date").value = x.date;
    $("category").value = x.category;
    $("item").value = x.item || x.note || "";
    $("frequency").value = x.frequency;
    $("weekday").value = String(x.weekday ?? 1);
    $("usage").value = x.usage || "regular";
    $("endMonth").value = x.endMonth || "";
    $("stopDate").value = x.stopDate || "";
    $("savingGoal").value = x.savingGoal || "";
    $("savingTarget").value = x.savingTarget || "";
    fields();
    $("formLabel").textContent = "Buchung bearbeiten";
    $("saveBtn").textContent = "Änderung speichern";
    $("cancelBtn").classList.remove("hidden");
    scrollTo({ top: 420, behavior: "smooth" });
  }
  function view(main, tab) {
    ["monthView", "overviewView", "savingsView"].forEach((x) =>
      $(x).classList.add("hidden"),
    );
    ["monthTab", "overviewTab", "savingsTab"].forEach((x) =>
      $(x).classList.remove("active"),
    );
    $(main).classList.remove("hidden");
    $(tab).classList.add("active");
  }
  function stopEntry(id) {
    const x = entries.find((a) => a.id === id);
    if (!x || x.frequency === "once") return;
    const value = prompt(
      "Ab welchem Datum soll diese Buchung nicht mehr gebucht werden?\nBitte im Format JJJJ-MM-TT eingeben:",
      x.stopDate || dateToday(),
    );
    if (value === null) return;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(value + "T12:00").getTime())
    ) {
      alert("Bitte ein gültiges Datum im Format JJJJ-MM-TT eingeben.");
      return;
    }
    x.stopDate = value;
    save();
  }
  $("balanceForm").onsubmit = (e) => {
    e.preventDefault();
    const v = number($("balanceInput").value);
    if (Number.isFinite(v)) {
      opening = v;
      localStorage.setItem("fe-balance-month", monthKey(new Date()));
      $("balanceInput").value = "";
      save();
    }
  };
  $("entryForm").onsubmit = (e) => {
    e.preventDefault();
    const amount = number($("amount").value);
    if (!(amount > 0)) return;
    const x = {
      id: editing || crypto.randomUUID(),
      kind,
      amount,
      date: $("date").value,
      category: $("category").value,
      item: $("item").value.trim(),
      note: $("item").value.trim(),
      frequency: $("frequency").value,
      weekday: Number($("weekday").value),
      usage: kind === "expense" ? $("usage").value : "regular",
      isSaving: kind === "expense" && $("usage").value === "saving",
      savingGoal: $("savingGoal").value.trim(),
      savingTarget: number($("savingTarget").value) || 0,
      endMonth: $("endMonth").value,
      stopDate: $("frequency").value === "once" ? "" : $("stopDate").value,
    };
    entries = editing
      ? entries.map((a) => (a.id === editing ? x : a))
      : [...entries, x];
    reset();
    save();
  };
  $("expenseBtn").onclick = () => setKind("expense");
  $("incomeBtn").onclick = () => setKind("income");
  $("frequency").onchange = fields;
  $("usage").onchange = fields;
  $("cancelBtn").onclick = reset;
  $("prev").onclick = () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1);
    render();
  };
  $("next").onclick = () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1);
    render();
  };
  $("monthTab").onclick = () => view("monthView", "monthTab");
  $("overviewTab").onclick = () => view("overviewView", "overviewTab");
  $("savingsTab").onclick = () => view("savingsView", "savingsTab");
  try {
    entries = JSON.parse(localStorage.getItem("fe-entries") || "[]").map(
      (x) => ({
        ...x,
        item: x.item || x.note || "",
        usage: x.usage || (x.isSaving ? "saving" : "regular"),
        weekday: x.weekday ?? new Date(x.date + "T12:00").getDay(),
      }),
    );
    opening = Number(localStorage.getItem("fe-balance") || 0);
  } catch (_) {
    entries = [];
  }
  reset();
  setKind("expense");
  render();
  if ("serviceWorker" in navigator)
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
})();
