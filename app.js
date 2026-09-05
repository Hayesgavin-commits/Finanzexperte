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
    monthlyBalances = {},
    bookings = [],
    kind = "expense",
    editing = "",
    bookAfterSave = false,
    shown = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthKey = (d) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
    dateToday = () => {
      const d = new Date();
      return monthKey(d) + "-" + String(d.getDate()).padStart(2, "0");
    },
    number = (v) => Number(String(v).replace(",", ".")),
    localDate = (d) =>
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0"),
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
  function occurrenceDates(x, m) {
    const md = diff(x.date.slice(0, 7), m);
    if (md < 0 || (x.endMonth && m > x.endMonth)) return [];
    const stop = x.stopDate ? new Date(x.stopDate + "T00:00") : null;
    if (x.frequency === "once") {
      const due = new Date(x.date + "T12:00");
      return md === 0 && (!stop || due < stop) ? [x.date] : [];
    }
    if (["monthly", "quarterly", "yearly"].includes(x.frequency)) {
      if (x.frequency === "quarterly" && md % 3 !== 0) return [];
      if (x.frequency === "yearly" && md % 12 !== 0) return [];
      const p = m.split("-").map(Number),
        wantedDay = Number(x.date.slice(8, 10)),
        last = new Date(p[0], p[1], 0).getDate(),
        due = new Date(p[0], p[1] - 1, Math.min(wantedDay, last), 12);
      return !stop || due < stop ? [localDate(due)] : [];
    }
    if (x.frequency === "weekly") {
      const p = m.split("-").map(Number),
        last = new Date(p[0], p[1], 0).getDate(),
        start = new Date(x.date + "T12:00");
      const dates = [];
      for (let i = 1; i <= last; i++) {
        const d = new Date(p[0], p[1] - 1, i, 12);
        if (
          d >= start &&
          (!stop || d < stop) &&
          d.getDay() === Number(x.weekday)
        )
          dates.push(localDate(d));
      }
      return dates;
    }
    return [];
  }
  function count(x, m) {
    return occurrenceDates(x, m).length;
  }
  function bookingKey(id, date) {
    return id + "@" + date;
  }
  function isBooked(id, date) {
    return bookings.some((b) => b.key === bookingKey(id, date));
  }
  function dateInMonth(x, m) {
    const p = m.split("-").map(Number),
      wantedDay = Number(x.date.slice(8, 10)) || 1,
      last = new Date(p[0], p[1], 0).getDate();
    return localDate(new Date(p[0], p[1] - 1, Math.min(wantedDay, last), 12));
  }
  function rows(m) {
    const scheduled = entries.flatMap((x) =>
        occurrenceDates(x, m).map((occurrenceDate) => ({
          ...x,
          n: 1,
          occurrenceDate,
          booked: isBooked(x.id, occurrenceDate),
        })),
      ),
      keys = new Set(scheduled.map((x) => bookingKey(x.id, x.occurrenceDate))),
      extra = bookings
        .filter((b) => b.month === m && !keys.has(b.key))
        .map((b) => ({
          id: b.entryId,
          kind: b.kind,
          amount: b.amount,
          date: b.occurrenceDate,
          occurrenceDate: b.occurrenceDate,
          category: b.category || "sonstiges",
          item: b.item || "Posten",
          note: b.item || "Posten",
          frequency: "once",
          usage: b.usage || "regular",
          savingGoal: b.savingGoal || "",
          n: 1,
          booked: true,
          bookingOnly: true,
        }));
    return [...scheduled, ...extra].sort((a, b) =>
      b.occurrenceDate.localeCompare(a.occurrenceDate),
    );
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
  function openingBalance(m) {
    return Number(monthlyBalances[m]) || 0;
  }
  function balanceAt(m) {
    const remaining = rows(m).filter((x) => !x.booked),
      inc = remaining
        .filter((x) => x.kind === "income")
        .reduce((sum, x) => sum + x.amount, 0),
      out = remaining
        .filter((x) => x.kind === "expense")
        .reduce((sum, x) => sum + x.amount, 0);
    return openingBalance(m) + inc - out;
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
    localStorage.setItem("fe-month-balances", JSON.stringify(monthlyBalances));
    localStorage.setItem("fe-bookings", JSON.stringify(bookings));
    render();
  }
  function render() {
    const m = monthKey(shown),
      s = sums(m);
    $("balance").textContent = cash.format(openingBalance(m));
    $("balanceLabel").textContent =
      "Kontostand im " + monthFmt.format(shown);
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
      "<span>Kontostand am Monatsende – ohne Übertrag in den Folgemonat</span><b>" +
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
          new Date(x.occurrenceDate + "T12:00").toLocaleDateString("de-DE") +
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
          '</td><td><span class="status ' +
          (x.booked ? "booked" : "") +
          '">' +
          (x.booked ? "Gebucht" : "Offen") +
          "</span>" +
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
    renderBookingList();
  }
  function renderMonths() {
    $("monthsEmpty").classList.add("hidden");
    const monthList = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date(shown.getFullYear(), shown.getMonth() + i, 1);
      monthList.push({ key: monthKey(d), date: d });
    }
    const visible = entries.filter((x) =>
        monthList.some((m) => rows(m.key).some((r) => r.id === x.id)),
      ),
      incomes = visible.filter((x) => x.kind === "income"),
      expenses = visible.filter((x) => x.kind === "expense"),
      amountCell = (x, m) => {
        const relevant = rows(m.key).filter((r) => r.id === x.id);
        if (!relevant.length) return "<td></td>";
        const value = relevant.reduce((sum, r) => sum + r.amount, 0);
        return (
          '<td class="editable-cell ' +
          (x.frequency === "once" || relevant.every((r) => r.bookingOnly)
            ? "one-off"
            : "") +
          '" data-edit="' +
          x.id +
          '" title="Buchung bearbeiten">' +
          cash.format(value) +
          "</td>"
        );
      },
      entryRow = (x, type) =>
        '<tr class="' +
        type +
        '-row"><th title="' +
        safe(x.category) +
        '">' +
        safe(x.item || x.category) +
        "</th>" +
        monthList.map((m) => amountCell(x, m)).join("") +
        "</tr>",
      totalRow = (label, cls, getter) =>
        '<tr class="' +
        cls +
        '"><th>' +
        label +
        "</th>" +
        monthList
          .map((m) => "<td>" + cash.format(getter(sums(m.key), m.key)) + "</td>")
          .join("") +
        "</tr>";
    $("monthsHead").innerHTML =
      "<th>Posten</th>" +
      monthList
        .map(
          (m) =>
            '<th><button class="month-head" data-month="' +
            m.key +
            '">' +
            m.date.toLocaleDateString("de-DE", { month: "long" }) +
            "<br><small>" +
            m.date.getFullYear() +
            "</small></button></th>",
        )
        .join("");
    $("overviewRange").textContent =
      monthFmt.format(monthList[0].date) +
      " bis " +
      monthFmt.format(monthList[monthList.length - 1].date);
    let out = totalRow("Kontostand", "balance-row", (_s, k) =>
      openingBalance(k),
    );
    out += incomes.map((x) => entryRow(x, "income")).join("");
    out += totalRow("Summe Einnahmen", "income-total", (s) => s.inc);
    out += expenses.map((x) => entryRow(x, "expense")).join("");
    out += totalRow("Summe Ausgaben", "expense-total", (s) => s.out);
    out += totalRow("Monatsergebnis", "result-row", (s) => s.inc - s.out);
    out += totalRow("Kontostand Monatsende", "closing-row", (_s, k) =>
      balanceAt(k),
    );
    $("months").innerHTML = out;
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
    $("months")
      .querySelectorAll("[data-edit]")
      .forEach((cell) => (cell.onclick = () => edit(cell.dataset.edit)));
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
    const isRecurring = $("recurring").value === "yes";
    if (!isRecurring) $("frequency").value = "monthly";
    $("frequencyLabel").classList.toggle("hidden", !isRecurring);
    $("weekdayLabel").classList.toggle(
      "hidden",
      !isRecurring || $("frequency").value !== "weekly",
    );
    $("stopLabel").classList.toggle("hidden", !isRecurring);
    $("usageLabel").classList.toggle("hidden", kind !== "expense");
    if (kind === "income") $("usage").value = "regular";
    const saving = kind === "expense" && $("usage").value === "saving";
    $("savingGoalLabel").classList.toggle("hidden", !saving);
    $("savingTargetLabel").classList.toggle("hidden", !saving);
    $("savingGoal").required = saving;
  }
  function closeBookingPanel() {
    $("bookingPanel").classList.add("hidden");
    $("existingBookingArea").classList.add("hidden");
    $("bookingModeChoice").classList.remove("hidden");
    $("bookBtn").classList.remove("hidden");
  }
  function bookOccurrence(x, occurrenceDate) {
    const key = bookingKey(x.id, occurrenceDate);
    if (bookings.some((b) => b.key === key)) return;
    const month = occurrenceDate.slice(0, 7),
      signed = x.kind === "income" ? x.amount : -x.amount;
    monthlyBalances[month] = openingBalance(month) + signed;
    bookings.push({
      key,
      entryId: x.id,
      occurrenceDate,
      month,
      kind: x.kind,
      amount: x.amount,
      category: x.category,
      item: x.item,
      usage: x.usage,
      savingGoal: x.savingGoal,
      bookedAt: new Date().toISOString(),
    });
  }
  function renderBookingList() {
    const m = monthKey(shown),
      items = entries.flatMap((x) => {
        const dates = occurrenceDates(x, m);
        return (dates.length ? dates : [dateInMonth(x, m)]).map(
          (occurrenceDate) => ({
            entry: x,
            occurrenceDate,
            booked: isBooked(x.id, occurrenceDate),
            additional: !dates.length,
          }),
        );
      });
    $("bookingEmpty").classList.toggle("hidden", !!items.length);
    $("bookingList").innerHTML = items
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
      .map(
        (v) =>
          '<button type="button" class="booking-item ' +
          (v.booked ? "booked" : "") +
          '" data-book-entry="' +
          v.entry.id +
          '" data-book-date="' +
          v.occurrenceDate +
          '" ' +
          (v.booked ? "disabled" : "") +
          "><span>" +
          safe(v.entry.item || v.entry.category) +
          "<small>" +
          new Date(v.occurrenceDate + "T12:00").toLocaleDateString("de-DE") +
          (v.additional ? " · zusätzliche Buchung" : "") +
          " · " +
          (v.booked ? "Gebucht" : "Offen") +
          '</small></span><span class="booking-amount">' +
          (v.entry.kind === "income" ? "+" : "−") +
          cash.format(v.entry.amount) +
          "</span></button>",
      )
      .join("");
    $("bookingList")
      .querySelectorAll("[data-book-entry]:not(:disabled)")
      .forEach(
        (button) =>
          (button.onclick = () => {
            const x = entries.find((e) => e.id === button.dataset.bookEntry);
            if (!x) return;
            bookOccurrence(x, button.dataset.bookDate);
            save();
          }),
      );
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
    bookAfterSave = false;
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
    $("recurring").value = "no";
    $("frequency").value = "monthly";
    $("weekday").value = "1";
    $("usage").value = "regular";
    $("formLabel").textContent = "Umsatz erfassen";
    $("kindTitle").textContent = "Neu";
    $("saveBtn").textContent = "Buchung hinzufügen";
    $("cancelBtn").classList.add("hidden");
    $("entryForm").classList.add("hidden");
    $("transactionChoice").classList.add("hidden");
    $("newTransactionBtn").classList.remove("hidden");
    fields();
  }
  function openNew(v) {
    setKind(v);
    $("transactionChoice").classList.add("hidden");
    $("newTransactionBtn").classList.add("hidden");
    $("entryForm").classList.remove("hidden");
    $("cancelBtn").classList.remove("hidden");
    $("formLabel").textContent = "Neuer Umsatz";
    $("kindTitle").textContent = v === "income" ? "Einnahme" : "Ausgabe";
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
    $("recurring").value = x.frequency === "once" ? "no" : "yes";
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
    $("newTransactionBtn").classList.add("hidden");
    $("transactionChoice").classList.add("hidden");
    $("entryForm").classList.remove("hidden");
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
      monthlyBalances[monthKey(shown)] = v;
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
      frequency: $("recurring").value === "yes" ? $("frequency").value : "once",
      weekday: Number($("weekday").value),
      usage: kind === "expense" ? $("usage").value : "regular",
      isSaving: kind === "expense" && $("usage").value === "saving",
      savingGoal: $("savingGoal").value.trim(),
      savingTarget: number($("savingTarget").value) || 0,
      endMonth: $("endMonth").value,
      stopDate: $("recurring").value === "no" ? "" : $("stopDate").value,
    };
    const wasEditing = !!editing,
      shouldBook = bookAfterSave && !wasEditing;
    entries = wasEditing
      ? entries.map((a) => (a.id === editing ? x : a))
      : [...entries, x];
    if (shouldBook) bookOccurrence(x, x.date);
    reset();
    save();
  };
  $("newTransactionBtn").onclick = () => {
    $("newTransactionBtn").classList.add("hidden");
    $("transactionChoice").classList.remove("hidden");
  };
  $("choiceCancelBtn").onclick = reset;
  $("bookBtn").onclick = () => {
    $("bookBtn").classList.add("hidden");
    $("bookingPanel").classList.remove("hidden");
    $("bookingModeChoice").classList.remove("hidden");
    $("existingBookingArea").classList.add("hidden");
  };
  $("existingPostBtn").onclick = () => {
    $("bookingModeChoice").classList.add("hidden");
    $("existingBookingArea").classList.remove("hidden");
    renderBookingList();
  };
  $("newPostBtn").onclick = () => {
    closeBookingPanel();
    bookAfterSave = true;
    $("newTransactionBtn").classList.add("hidden");
    $("transactionChoice").classList.remove("hidden");
    const currentMonth = monthKey(new Date());
    $("date").value =
      monthKey(shown) === currentMonth ? dateToday() : monthKey(shown) + "-01";
  };
  $("bookingCancelBtn").onclick = closeBookingPanel;
  $("expenseBtn").onclick = () => openNew("expense");
  $("incomeBtn").onclick = () => openNew("income");
  $("recurring").onchange = fields;
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
  $("overviewPrev").onclick = () => {
    shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1);
    render();
  };
  $("overviewNext").onclick = () => {
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
    monthlyBalances = JSON.parse(
      localStorage.getItem("fe-month-balances") || "{}",
    );
    bookings = JSON.parse(localStorage.getItem("fe-bookings") || "[]");
    if (!Object.keys(monthlyBalances).length) {
      const legacy = Number(localStorage.getItem("fe-balance") || 0);
      if (legacy) {
        const anchor =
          localStorage.getItem("fe-balance-month") || monthKey(new Date());
        monthlyBalances[anchor] = legacy;
        localStorage.setItem(
          "fe-month-balances",
          JSON.stringify(monthlyBalances),
        );
      }
    }
  } catch (_) {
    entries = [];
  }
  reset();
  setKind("expense");
  render();
  if ("serviceWorker" in navigator)
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
})();
