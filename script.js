/* =====================
   Налоговые ступени
   ===================== */
const BRACKETS = [
  { rate: 0.13, label: '13%', from: 0,          to: 2_400_000,  color: '#7c6af7' },
  { rate: 0.15, label: '15%', from: 2_400_000,  to: 5_000_000,  color: '#9a6af7' },
  { rate: 0.18, label: '18%', from: 5_000_000,  to: 20_000_000, color: '#c46af7' },
  { rate: 0.20, label: '20%', from: 20_000_000, to: 50_000_000, color: '#f76ac4' },
  { rate: 0.22, label: '22%', from: 50_000_000, to: Infinity,   color: '#f76a8c' },
];

/* =====================
   Режим (вкладки)
   ===================== */
let mode = 1;

function setMode(m) {
  const currentVal = inputEl ? inputEl.value : '';

  mode = m;
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === m - 1));
  document.getElementById('input-label').textContent =
    m === 1 ? 'Оклад до налогов (в месяц)' : 'Желаемая зарплата на руки (в месяц)';
  document.getElementById('salary-input').placeholder = m === 1 ? '200 000' : '170 000';
  document.getElementById('salary-input').value = currentVal;

  localStorage.setItem('ndfl_mode', m);
  updateClearBtn();

  if (currentVal) {
    calculate();
  } else {
    document.getElementById('results').classList.remove('visible');
  }
}

/* =====================
   Расчёт налога
   ===================== */
function calculateNdfl(yearIncome) {
  let tax = 0;
  const details = [];
  for (const b of BRACKETS) {
    if (yearIncome <= b.from) { details.push({ ...b, taxable: 0, tax: 0 }); continue; }
    const taxable = Math.min(yearIncome, b.to === Infinity ? yearIncome : b.to) - b.from;
    const t = taxable * b.rate;
    tax += t;
    details.push({ ...b, taxable, tax: t });
  }
  return { tax, details };
}

function grossToNet(monthly) {
  const yearly = monthly * 12;
  const { tax, details } = calculateNdfl(yearly);
  return {
    monthly,
    monthlyNet: (yearly - tax) / 12,
    monthlyTax: tax / 12,
    yearlyNet: yearly - tax,
    yearlyTax: tax,
    dailyNet: (yearly - tax) / 12 / 21,
    details,
  };
}

function netToGross(targetNet) {
  let lo = 0, hi = 100_000_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (grossToNet(mid).monthlyNet < targetNet) lo = mid; else hi = mid;
  }
  // Используем lo (округление вниз), чтобы "на руки" не превышало желаемое
  return lo;
}

/* =====================
   Форматирование
   ===================== */
function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

/* =====================
   Основной расчёт и рендер
   ===================== */
function calculate() {
  const val = getRawValue();
  if (!val || val <= 0) return;

  const MAX = 100_000_000;
  if (val > MAX) {
    showError(`Максимальное значение — ${fmt(MAX)} ₽`);
    return;
  }

  hideError();

  let data;
  if (mode === 1) {
    data = grossToNet(val);
  } else {
    const gross = netToGross(val);
    data = grossToNet(gross);
  }

  const { monthly, monthlyNet, monthlyTax, yearlyNet, yearlyTax, dailyNet, details } = data;

  // Карточки результатов
  const netPct = (monthlyNet / monthly * 100).toFixed(1);
  const taxPct = (monthlyTax / monthly * 100).toFixed(1);

  const cards = [
    { label: 'Зарплата на руки',    value: fmt(monthlyNet), cls: 'highlight' },
    { label: 'Налог в месяц',       value: fmt(monthlyTax), cls: 'danger'    },
    { label: 'Оклад до налогов',    value: fmt(monthly),    cls: 'info'      },
    { label: 'Среднедневной доход', value: fmt(dailyNet),   cls: 'success'   },
    { label: 'На руки за год',      value: fmt(yearlyNet),  cls: 'info2'     },
    { label: 'Налогов за год',      value: fmt(yearlyTax),  cls: 'danger2'   },
  ];

  document.getElementById('results-grid').innerHTML = cards.map(c => `
    <div class="result-card ${c.cls}">
      <div class="result-label">${c.label}</div>
      <div class="result-value">${c.value}<span class="currency">₽</span></div>
    </div>
  `).join('');

  // Шкала распределения
  document.getElementById('bar-net').style.width = netPct + '%';
  document.getElementById('bar-tax').style.width = taxPct + '%';
  document.getElementById('legend-net-pct').textContent = netPct + '%';
  document.getElementById('legend-tax-pct').textContent = taxPct + '%';

  // Налоговые ступени
  const maxTax = Math.max(...details.map(d => d.tax), 1);
  document.getElementById('brackets-list').innerHTML = details.map(d => {
    const active = d.taxable > 0;
    const fillW = active ? Math.min((d.tax / maxTax) * 100, 100) : 0;
    const rangeStr = d.to === Infinity
      ? `от ${fmt(d.from / 1e6)}M`
      : `${fmt(d.from / 1e6)}M — ${fmt(d.to / 1e6)}M`;
    return `
      <div class="bracket-row ${active ? '' : 'inactive'}">
        <div class="bracket-rate" style="color:${d.color}">${d.label}</div>
        <div class="bracket-bar-wrap">
          <div class="bracket-bar-fill" style="background:${d.color};width:${fillW}%"></div>
        </div>
        <div class="bracket-amount">${active ? fmt(d.tax / 12) + ' ₽/мес' : '—'}</div>
        <div class="bracket-range">${rangeStr}</div>
      </div>`;
  }).join('');

  document.getElementById('results').classList.add('visible');
  buildMonthlyBreakdown(monthly);
}

/* =====================
   Помесячная разбивка
   ===================== */
let monthlyOpen = false;
let monthlyView = 'full';
let lastMonthlyGross = 0;

function toggleMonthly() {
  monthlyOpen = !monthlyOpen;
  document.getElementById('monthly-card').classList.toggle('open', monthlyOpen);
  document.getElementById('monthly-arrow').classList.toggle('open', monthlyOpen);
}

function setMonthlyView(view) {
  monthlyView = view;
  document.getElementById('subtab-full').classList.toggle('active', view === 'full');
  document.getElementById('subtab-remaining').classList.toggle('active', view === 'remaining');
  if (lastMonthlyGross) buildMonthlyBreakdown(lastMonthlyGross);
}

function buildMonthlyBreakdown(monthly) {
  lastMonthlyGross = monthly;
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const currentMonth = new Date().getMonth(); // 0-based

  // Полный год — считаем с января
  let cumGross = 0, cumTaxPrev = 0;
  const allRows = [];

  for (let i = 0; i < 12; i++) {
    cumGross += monthly;
    const { tax: cumTax } = calculateNdfl(cumGross);
    const monthTax = cumTax - cumTaxPrev;
    const monthNet = monthly - monthTax;
    cumTaxPrev = cumTax;

    let bracketColor = '#7c6af7', bracketLabel = '13%';
    for (const b of BRACKETS) {
      if (cumGross > b.from) { bracketColor = b.color; bracketLabel = b.label; }
    }
    const prevCumGross = cumGross - monthly;
    let prevBracketLabel = '13%';
    for (const b of BRACKETS) { if (prevCumGross > b.from) prevBracketLabel = b.label; }
    const rateChanged = i > 0 && bracketLabel !== prevBracketLabel;

    allRows.push({ month: MONTHS[i], idx: i, gross: monthly, net: monthNet,
                   tax: monthTax, bracketColor, bracketLabel, rateChanged, cumGross });
  }

  // Остаток года — считаем с нуля (человек только выходит на работу)
  let remCumGross = 0, remCumTaxPrev = 0;
  const remainingRows = [];
  const monthsLeft = [];
  for (let i = currentMonth + 1; i < 12; i++) monthsLeft.push(i);

  for (let j = 0; j < monthsLeft.length; j++) {
    const i = monthsLeft[j];
    remCumGross += monthly;
    const { tax: remCumTax } = calculateNdfl(remCumGross);
    const monthTax = remCumTax - remCumTaxPrev;
    const monthNet = monthly - monthTax;
    remCumTaxPrev = remCumTax;

    let bracketColor = '#7c6af7', bracketLabel = '13%';
    for (const b of BRACKETS) {
      if (remCumGross > b.from) { bracketColor = b.color; bracketLabel = b.label; }
    }
    const prevRemCumGross = remCumGross - monthly;
    let prevBracketLabel = '13%';
    for (const b of BRACKETS) { if (prevRemCumGross > b.from) prevBracketLabel = b.label; }
    const rateChanged = j > 0 && bracketLabel !== prevBracketLabel;

    remainingRows.push({ month: MONTHS[i], idx: i, gross: monthly, net: monthNet,
                         tax: monthTax, bracketColor, bracketLabel, rateChanged, cumGross: remCumGross });
  }

  const rows = monthlyView === 'remaining' ? remainingRows : allRows;
  const sourceRows = rows;

  // Пояснение
  const crossedBrackets = [];
  let prev = null;
  for (const r of sourceRows) {
    if (r.bracketLabel !== prev) {
      crossedBrackets.push({ label: r.bracketLabel, month: r.month, cumGross: r.cumGross });
      prev = r.bracketLabel;
    }
  }

  let explanation = `<strong>Как работает прогрессивный налог?</strong><br><br>`;
  explanation += `Налоговая ставка зависит не от месячного дохода, а от <strong>накопленного дохода с начала года</strong>. `;
  explanation += `Пока сумма всех выплат не достигла порога — действует меньшая ставка. Как только порог пройден — ставка вырастает.<br><br>`;

  if (crossedBrackets.length === 1) {
    explanation += `При вашем окладе весь период действует одна ставка <strong>${crossedBrackets[0].label}</strong>.`;
  } else {
    explanation += `При вашем окладе ставка меняется:<br>`;
    for (const cb of crossedBrackets) {
      explanation += `&nbsp;&nbsp;→ <strong>${cb.label}</strong> начиная с <strong>${cb.month}</strong> (накоплено ${fmt(cb.cumGross)} ₽)<br>`;
    }
    explanation += `<br>Поэтому в месяцы смены ставки вы получите <strong>меньше на руки</strong>, чем обычно.`;
  }

  if (monthlyView === 'remaining') {
    if (rows.length === 0) {
      explanation += `<br><br><strong>Текущий месяц — декабрь</strong>, оставшихся месяцев нет.`;
    } else {
      explanation += `<br><br>Расчёт ведётся с <strong>${rows[0].month}</strong> — как будто вы выходите на работу с этого месяца.`;
    }
  }

  document.getElementById('monthly-explanation').innerHTML = explanation;

  if (rows.length === 0) {
    document.getElementById('monthly-table').innerHTML =
      `<tbody><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Нет оставшихся месяцев в этом году</td></tr></tbody>`;
    document.getElementById('monthly-note').style.display = 'none';
    return;
  }

  const totalNet   = rows.reduce((s, r) => s + r.net, 0);
  const totalTax   = rows.reduce((s, r) => s + r.tax, 0);
  const totalGross = monthly * rows.length;

  let html = `<thead><tr>
    <th>Месяц</th><th>Оклад</th><th>На руки</th><th>Налог</th><th>Ставка</th><th>Накоплено</th>
  </tr></thead><tbody>`;

  for (const r of rows) {
    html += `<tr class="${r.rateChanged ? 'rate-change' : ''}">
      <td class="month-name">${r.month}</td>
      <td class="month-gross">${fmt(r.gross)} ₽</td>
      <td class="month-net">${fmt(r.net)} ₽</td>
      <td class="month-tax">${fmt(r.tax)} ₽</td>
      <td><span class="month-rate" style="background:${r.bracketColor}22;color:${r.bracketColor}">${r.bracketLabel}</span></td>
      <td class="month-gross">${fmt(r.cumGross)} ₽</td>
    </tr>`;
  }

  const periodLabel = monthlyView === 'remaining' ? `Итого (${rows.length} мес.)` : 'Итого за год';
  html += `</tbody><tfoot><tr>
    <td>${periodLabel}</td>
    <td>${fmt(totalGross)} ₽</td>
    <td class="month-net">${fmt(totalNet)} ₽</td>
    <td class="month-tax">${fmt(totalTax)} ₽</td>
    <td></td><td></td>
  </tr></tfoot>`;

  document.getElementById('monthly-table').innerHTML = html;
  document.getElementById('monthly-note').style.display = 'none';
}

/* =====================
   Переключатель темы
   ===================== */
const root = document.documentElement;
const toggleBtn = document.getElementById('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function getSystemTheme() { return prefersDark.matches ? 'dark' : 'light'; }

toggleBtn.addEventListener('click', () => {
  const current = root.classList.contains('light') ? 'light'
    : root.classList.contains('dark') ? 'dark'
    : getSystemTheme();
  if (current === 'dark') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }
});

/* =====================
   Поле ввода
   ===================== */
const inputEl  = document.getElementById('salary-input');
const clearBtn = document.getElementById('clear-btn');

function getRawValue() {
  return parseFloat(inputEl.value.replace(/\s/g, '')) || 0;
}

function showError(msg) {
  let el = document.getElementById('input-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'input-error';
    inputEl.closest('.input-card').appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  inputEl.closest('.input-wrapper').style.borderColor = 'var(--accent2)';
  inputEl.closest('.input-wrapper').style.boxShadow = '0 0 0 3px rgba(247,106,140,0.15)';
  document.getElementById('results').classList.remove('visible');
}

function hideError() {
  const el = document.getElementById('input-error');
  if (el) el.style.display = 'none';
  inputEl.closest('.input-wrapper').style.borderColor = '';
  inputEl.closest('.input-wrapper').style.boxShadow = '';
}

function updateClearBtn() {
  clearBtn.classList.toggle('visible', inputEl.value.length > 0);
}

function clearInput() {
  inputEl.value = '';
  localStorage.removeItem('ndfl_value');
  updateClearBtn();
  document.getElementById('results').classList.remove('visible');
  inputEl.focus();
}

/* =====================
   Восстановление состояния
   ===================== */
(function restoreState() {
  const savedMode = parseInt(localStorage.getItem('ndfl_mode')) || 1;
  const savedVal  = localStorage.getItem('ndfl_value') || '';

  if (savedMode !== 1) {
    mode = savedMode;
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === savedMode - 1));
    document.getElementById('input-label').textContent =
      savedMode === 1 ? 'Оклад до налогов (в месяц)' : 'Желаемая зарплата на руки (в месяц)';
    document.getElementById('salary-input').placeholder = savedMode === 1 ? '200 000' : '170 000';
  }

  if (savedVal) {
    inputEl.value = savedVal;
    updateClearBtn();
    calculate();
  }
})();

/* =====================
   Слушатели событий
   ===================== */
inputEl.addEventListener('input', () => {
  // Ограничиваем 9 цифрами — максимум 99 999 999 ₽ в месяц
  const raw    = inputEl.value.replace(/\s/g, '').replace(/[^\d]/g, '').slice(0, 9);
  const num    = parseInt(raw, 10);
  const cursor = inputEl.selectionStart;
  const oldLen = inputEl.value.length;

  if (raw === '') {
    inputEl.value = '';
    localStorage.removeItem('ndfl_value');
    updateClearBtn();
    document.getElementById('results').classList.remove('visible');
    return;
  }

  const formatted = num.toLocaleString('ru-RU');
  inputEl.value   = formatted;

  const diff = formatted.length - oldLen;
  inputEl.setSelectionRange(cursor + diff, cursor + diff);

  localStorage.setItem('ndfl_value', formatted);
  localStorage.setItem('ndfl_mode', mode);
  updateClearBtn();
  calculate();
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') calculate();
});
