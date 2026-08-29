(function () {
  "use strict";

  const BAR_COLOR = "#2456c7";
  const OUTLIER_COLOR = "#e07b00";
  const MEDIAN_COLOR = "#d43f3f";

  let sortState = { key: "denial_rate", dir: "desc" };
  let contracts = [];

  function fmtPct(n) {
    return `${n}%`;
  }

  function renderSummary(summary) {
    const cards = [
      { label: "Contracts", value: summary.n_contracts },
      { label: "Median denial rate", value: fmtPct(summary.median_denial_rate) },
      { label: "Range", value: `${summary.min_denial_rate}% – ${summary.max_denial_rate}%` },
      { label: "Aggregate overturn rate", value: fmtPct(summary.aggregate_appeal_overturn_rate) },
      { label: "Outliers flagged", value: `${summary.n_outliers} (|z| > ${summary.outlier_z_threshold})` },
    ];
    const el = document.getElementById("summary-cards");
    el.innerHTML = cards
      .map(
        (c) => `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`
      )
      .join("");
  }

  const medianLinePlugin = {
    id: "medianLine",
    afterDatasetsDraw(chart, args, opts) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || opts.value == null) return;
      const y = scales.y.getPixelForValue(opts.value);
      ctx.save();
      ctx.strokeStyle = MEDIAN_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };

  let chart;
  function renderChart(data, summary) {
    const sorted = [...data].sort((a, b) => b.denial_rate - a.denial_rate);
    const ctx = document.getElementById("denial-chart").getContext("2d");
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map((c) => c.contract_id),
        datasets: [
          {
            label: "Denial rate (%)",
            data: sorted.map((c) => c.denial_rate),
            backgroundColor: sorted.map((c) => (c.is_outlier ? OUTLIER_COLOR : BAR_COLOR)),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { autoSkip: true, maxRotation: 90, minRotation: 90, font: { size: 9 } } },
          y: { beginAtZero: true, title: { display: true, text: "Denial rate (%)" } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel(item) {
                const c = sorted[item.dataIndex];
                return c.is_outlier ? "Flagged outlier (synthetic dataset)" : "";
              },
            },
          },
          medianLine: { value: summary.median_denial_rate },
        },
      },
      plugins: [medianLinePlugin],
    });
  }

  function sortContracts(rows) {
    const { key, dir } = sortState;
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "string") return av.localeCompare(bv) * mult;
      return (av - bv) * mult;
    });
  }

  function renderTable() {
    const rows = sortContracts(contracts);
    const body = document.getElementById("table-body");
    body.innerHTML = rows
      .map(
        (c) => `
      <tr class="${c.is_outlier ? "outlier-row" : ""}">
        <td>${c.contract_id}</td>
        <td>${c.state}</td>
        <td>${c.plan_type}</td>
        <td>${c.denial_rate}</td>
        <td>${c.appeals_filed}</td>
        <td>${c.appeals_overturned}</td>
        <td>${c.z_score}</td>
      </tr>`
      )
      .join("");

    document.querySelectorAll("#contracts-table thead th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.key === sortState.key) {
        th.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });
  }

  function attachSortHandlers() {
    document.querySelectorAll("#contracts-table thead th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortState.key === key) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState = { key, dir: "asc" };
        }
        renderTable();
      });
    });
  }

  function renderOutliers() {
    const outliers = contracts.filter((c) => c.is_outlier);
    const el = document.getElementById("outlier-list");
    if (outliers.length === 0) {
      el.innerHTML = "<p>No outliers flagged in this synthetic dataset.</p>";
      return;
    }
    el.innerHTML = outliers
      .map((c) => `<div class="outlier-item"><strong>${c.contract_id}</strong> — ${c.explanation}</div>`)
      .join("");
  }

  fetch("data/stats.json")
    .then((r) => r.json())
    .then((data) => {
      contracts = data.contracts;
      renderSummary(data.summary);
      renderChart(data.contracts, data.summary);
      renderTable();
      attachSortHandlers();
      renderOutliers();
    })
    .catch((err) => {
      document.getElementById("summary-cards").innerHTML =
        "<p>Failed to load dataset (data/stats.json). See console for details.</p>";
      console.error(err);
    });
})();
