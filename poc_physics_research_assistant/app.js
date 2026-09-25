(() => {
  "use strict";

  const stageOrder = ["literature", "derivation", "comparison", "simulation", "review", "writeup"];

  const stageMeta = Object.freeze({
    literature: Object.freeze({ eyebrow: "STAGE 01 · LITERATURE & CONTEXT", title: "Retrieving relevant prior work" }),
    derivation: Object.freeze({ eyebrow: "STAGE 02 · HYPOTHESIS & DERIVATION", title: "Drafting the working hypothesis" }),
    comparison: Object.freeze({ eyebrow: "STAGE 03 · MODEL COMPARISON", title: "Running the question across models" }),
    simulation: Object.freeze({ eyebrow: "STAGE 04 · SIMULATION", title: "Checking the estimate numerically" }),
    review: Object.freeze({ eyebrow: "STAGE 05 · PEER REVIEW", title: "Critiquing the derivation and simulation" }),
    writeup: Object.freeze({ eyebrow: "STAGE 06 · WRITE-UP & EXPORT", title: "Assembling the draft section" })
  });

  const papers = Object.freeze([
    Object.freeze({
      tag: "Foundational",
      title: "Perturbation theory of the anharmonic oscillator",
      authors: "Bender & Wu (1969, illustrative citation)",
      relevance: "Establishes the divergent, asymptotic nature of the λx⁴ perturbation series — a caution for how far the second-order estimate below can be trusted."
    }),
    Object.freeze({
      tag: "Method",
      title: "Rayleigh–Schrödinger perturbation theory, second order",
      authors: "Sakurai & Napolitano, Modern Quantum Mechanics (textbook reference)",
      relevance: "Supplies the matrix-element formula used in stage two for the second-order energy correction."
    }),
    Object.freeze({
      tag: "Numerics",
      title: "Finite-basis diagonalization for one-dimensional anharmonic potentials",
      authors: "Illustrative lecture notes, computational quantum mechanics",
      relevance: "Basis-truncation guidance used to size the numerical check in stage four."
    }),
    Object.freeze({
      tag: "Related",
      title: "Quartic anharmonicity in trapped-ion motional states",
      authors: "Illustrative applied-physics reference",
      relevance: "An experimental context where this exact perturbation shows up, useful for framing the write-up's motivation."
    })
  ]);

  const hypothesis = "For small λ (λ ≪ mω³/ħ), the ground-state energy shift is dominated by the first-order term 3λ(ħ/2mω)², with the second-order correction contributing a small negative correction that first-order perturbation theory alone would miss.";

  const derivationSteps = Object.freeze([
    Object.freeze({
      title: "Set up the perturbed Hamiltonian",
      equation: "H = H₀ + λx⁴,   H₀ = p²/2m + ½mω²x²",
      note: "Treat λx⁴ as a small perturbation on the standard harmonic oscillator eigenbasis |n⟩."
    }),
    Object.freeze({
      title: "First-order correction",
      equation: "E₀⁽¹⁾ = λ⟨0|x⁴|0⟩ = 3λ(ħ / 2mω)²",
      note: "Uses the standard fourth-moment result for the oscillator ground state; nonzero because x⁴ is even."
    }),
    Object.freeze({
      title: "Second-order correction",
      equation: "E₀⁽²⁾ = Σₙ≠₀ |⟨n|λx⁴|0⟩|² / (E₀⁽⁰⁾ − Eₙ⁽⁰⁾)",
      note: "Only |0⟩, |2⟩, and |4⟩ have nonzero matrix elements with |0⟩ through x⁴; the sum collapses to two terms."
    }),
    Object.freeze({
      title: "Combine",
      equation: "E₀ ≈ ½ħω + 3λ(ħ/2mω)² − (21/8)λ²(ħ/mω)³/ħω",
      note: "The second-order term is negative, pulling the estimate slightly below the first-order-only prediction — the claim tested numerically in stage four."
    })
  ]);

  const models = Object.freeze([
    Object.freeze({
      id: "gpt-5.1",
      label: "GPT-5.1",
      style: "Concise closed-form",
      confidence: "high",
      answer: "First-order shift is +3λ(ħ/2mω)². Second order is negative and roughly two orders of magnitude smaller for λħω/(mω²)² ~ 0.05, so the first-order term dominates unless λ is pushed well past the perturbative regime."
    }),
    Object.freeze({
      id: "claude-opus-5",
      label: "Claude Opus 5",
      style: "Step-by-step symbolic",
      confidence: "high",
      answer: "Derives the same 3λ(ħ/2mω)² first-order term, then walks the |0⟩→|2⟩ and |0⟩→|4⟩ matrix elements explicitly for the second-order piece, flagging that the series is asymptotic rather than convergent — consistent with Bender & Wu."
    }),
    Object.freeze({
      id: "gemini-3-pro",
      label: "Gemini 3 Pro",
      style: "Numeric-first",
      confidence: "medium",
      answer: "Prefers to jump to a numerical diagonalization over carrying the algebra by hand, and reports a ground-state shift in the same direction and rough magnitude as the perturbative estimate, without deriving the closed form first."
    }),
    Object.freeze({
      id: "grok-4",
      label: "Grok 4",
      style: "Compact, fewer caveats",
      confidence: "medium",
      answer: "Gives the first-order term correctly but initially omits the second-order correction unless explicitly asked for it — a reminder that model comparison should specify the order of perturbation theory wanted, not assume it."
    })
  ]);

  const critiques = Object.freeze([
    Object.freeze({
      severity: "major",
      title: "Confirm non-degenerate perturbation theory applies",
      detail: "The oscillator spectrum is non-degenerate, so Rayleigh–Schrödinger perturbation theory applies cleanly here — but this should be stated explicitly in the write-up, not assumed, since the formula changes entirely for degenerate levels."
    }),
    Object.freeze({
      severity: "major",
      title: "State the validity regime for λ",
      detail: "The derivation is only trustworthy while λ stays small relative to mω³/ħ. The write-up should give this bound numerically, since the series is asymptotic (per Bender & Wu) and eventually diverges for any fixed λ as more orders are added."
    }),
    Object.freeze({
      severity: "minor",
      title: "Report the numerical basis size",
      detail: "The simulation stage doesn't yet state how many basis states were kept in the diagonalization. A truncation study (e.g. 10 vs. 30 vs. 100 basis states) would show whether the higher energy levels are converged."
    }),
    Object.freeze({
      severity: "minor",
      title: "Cross-check units of λ",
      detail: "λ carries units of energy/length⁴; double check that the same convention is used consistently between the derivation, the model comparison, and the simulation inputs before publishing the numbers together."
    })
  ]);

  const simulation = Object.freeze({
    lambda: "λ = 0.02 · mω³/ħ",
    basisSize: "40 harmonic-oscillator basis states",
    perturbativeEstimate: "0.5147 ħω",
    numericalResult: "0.5142 ħω",
    agreement: "0.10% difference",
    levels: Object.freeze([
      Object.freeze({ label: "E₀ (0th order)", value: 0.5 }),
      Object.freeze({ label: "E₀ (1st order)", value: 0.5158 }),
      Object.freeze({ label: "E₀ (2nd order)", value: 0.5147 }),
      Object.freeze({ label: "E₀ (numerical)", value: 0.5142 })
    ])
  });

  const writeupParagraphs = Object.freeze([
    "We examine the ground-state energy shift of a quantum harmonic oscillator perturbed by a quartic anharmonic term λx⁴. Using Rayleigh–Schrödinger perturbation theory to second order, the shift is estimated as E₀ ≈ ½ħω + 3λ(ħ/2mω)² − (21/8)λ²(ħ/mω)³/ħω, with the second-order term contributing a small negative correction.",
    "A finite-basis numerical diagonalization (40 harmonic-oscillator basis states, λ = 0.02 · mω³/ħ) gives a ground-state energy of 0.5142 ħω, compared to the second-order perturbative estimate of 0.5147 ħω — a 0.10% difference, consistent with the perturbative treatment over this parameter range.",
    "Four models were asked to derive the same result independently. All four agreed on the sign and leading order of the first-order term; two produced the second-order correction unprompted, while the other two required an explicit request for the higher-order term — a useful reminder to specify the desired order of perturbation theory when comparing model outputs on a derivation task.",
    "As the reviewer pass notes, this estimate holds only while λ stays well below mω³/ħ; the perturbation series itself is asymptotic rather than convergent, so it should not be extrapolated to strongly anharmonic regimes without a fully numerical treatment."
  ]);

  let activeStage = "literature";
  let checkedModels = new Set(models.map(model => model.id));

  const stageTabs = [...document.querySelectorAll("[data-stage]")];
  const stageViews = [...document.querySelectorAll("[data-view]")];
  const stagePanel = document.querySelector("#stage-panel");

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  function renderLiterature() {
    const list = document.querySelector("#paper-list");
    list.replaceChildren(...papers.map(paper => {
      const item = document.createElement("li");
      item.className = "paper-item";
      item.innerHTML = `
        <div class="paper-meta"><span class="paper-tag">${escapeHtml(paper.tag)}</span><span>${escapeHtml(paper.authors)}</span></div>
        <p class="paper-title">${escapeHtml(paper.title)}</p>
        <p class="paper-relevance">${escapeHtml(paper.relevance)}</p>
      `;
      return item;
    }));
  }

  function renderDerivation() {
    document.querySelector("#hypothesis-text").textContent = hypothesis;
    const list = document.querySelector("#derivation-steps");
    list.replaceChildren(...derivationSteps.map((step, index) => {
      const item = document.createElement("li");
      item.className = "derivation-step";
      item.innerHTML = `
        <span class="derivation-step-index">${index + 1}</span>
        <div class="derivation-step-body">
          <strong>${escapeHtml(step.title)}</strong>
          <code class="equation">${escapeHtml(step.equation)}</code>
          <p>${escapeHtml(step.note)}</p>
        </div>
      `;
      return item;
    }));
  }

  function renderModelPicker() {
    const picker = document.querySelector("#model-picker");
    picker.replaceChildren(...models.map(model => {
      const label = document.createElement("label");
      label.className = `model-pill${checkedModels.has(model.id) ? " is-checked" : ""}`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checkedModels.has(model.id);
      input.addEventListener("change", () => {
        if (input.checked) checkedModels.add(model.id);
        else checkedModels.delete(model.id);
        renderModelPicker();
        renderModelGrid();
      });
      label.append(input, document.createTextNode(model.label));
      return label;
    }));
  }

  function renderModelGrid() {
    const grid = document.querySelector("#model-grid");
    const visible = models.filter(model => checkedModels.has(model.id));
    grid.replaceChildren(...visible.map(model => {
      const card = document.createElement("div");
      card.className = "model-card";
      card.innerHTML = `
        <div class="model-card-heading">
          <strong>${escapeHtml(model.label)}</strong>
          <span class="model-confidence is-${model.confidence}">${model.confidence === "high" ? "High confidence" : "Medium confidence"}</span>
        </div>
        <p class="model-style">${escapeHtml(model.style)}</p>
        <p class="model-answer">${escapeHtml(model.answer)}</p>
      `;
      return card;
    }));

    const note = document.querySelector("#consensus-note");
    if (visible.length === 0) {
      note.textContent = "Select at least one model to see its mock response.";
    } else {
      note.textContent = `${visible.length} of ${models.length} models selected. All models that derived a closed form agree on the sign and order of magnitude of the first-order term; only the treatment of the second-order term differs.`;
    }
  }

  function renderSimulation() {
    const chart = document.querySelector("#energy-chart");
    const width = 420, height = 220, padding = 36;
    const maxValue = Math.max(...simulation.levels.map(level => level.value));
    const barWidth = (width - padding * 2) / simulation.levels.length - 16;

    const bars = simulation.levels.map((level, index) => {
      const x = padding + index * ((width - padding * 2) / simulation.levels.length);
      const barHeight = ((level.value - 0.49) / (maxValue - 0.49)) * (height - padding * 2);
      const y = height - padding - barHeight;
      const color = index === simulation.levels.length - 1 ? "#0d8f83" : "#7a5cf0";
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" opacity="${index === simulation.levels.length - 1 ? 1 : 0.65 + index * 0.08}" />
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="#1f1a33">${level.value.toFixed(4)}</text>
        <text x="${x + barWidth / 2}" y="${height - padding + 18}" text-anchor="middle" font-size="9" fill="#6c6680">${escapeHtml(level.label)}</text>
      `;
    }).join("");

    chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    chart.innerHTML = `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#243548" stroke-width="1" />${bars}`;

    const stats = document.querySelector("#sim-stats");
    stats.replaceChildren();
    const rows = [
      ["Perturbation strength", simulation.lambda],
      ["Basis size", simulation.basisSize],
      ["Perturbative estimate", simulation.perturbativeEstimate],
      ["Numerical result", simulation.numericalResult],
      ["Agreement", simulation.agreement]
    ];
    rows.forEach(([label, value], index) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (index === rows.length - 1) dd.classList.add("is-good");
      row.append(dt, dd);
      stats.append(row);
    });
  }

  function renderReview() {
    const list = document.querySelector("#critique-list");
    list.replaceChildren(...critiques.map(critique => {
      const item = document.createElement("li");
      item.className = `critique-item${critique.severity === "minor" ? " is-minor" : ""}`;
      item.innerHTML = `
        <span class="critique-icon" aria-hidden="true">${critique.severity === "major" ? "!" : "i"}</span>
        <div class="critique-body">
          <strong>${escapeHtml(critique.title)}</strong>
          <p>${escapeHtml(critique.detail)}</p>
        </div>
      `;
      return item;
    }));
  }

  function renderWriteup() {
    const container = document.querySelector("#writeup-text");
    container.replaceChildren(...writeupParagraphs.map(paragraph => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      return p;
    }));

    const references = document.querySelector("#reference-list");
    references.replaceChildren(...papers.map(paper => {
      const li = document.createElement("li");
      li.textContent = `${paper.title} — ${paper.authors}`;
      return li;
    }));

    document.querySelector("#writeup-status").textContent = "";
  }

  const renderers = Object.freeze({
    literature: renderLiterature,
    derivation: renderDerivation,
    comparison: () => { renderModelPicker(); renderModelGrid(); },
    simulation: renderSimulation,
    review: renderReview,
    writeup: renderWriteup
  });

  function updateChrome(stage) {
    const meta = stageMeta[stage];
    document.querySelector("#stage-eyebrow").textContent = meta.eyebrow;
    document.querySelector("#stage-title").textContent = meta.title;

    const index = stageOrder.indexOf(stage);
    document.querySelector("#progress-label").textContent = `${index + 1} / ${stageOrder.length}`;
    document.querySelector("#progress-fill").style.transform = `scaleX(${(index + 1) / stageOrder.length})`;

    stageTabs.forEach((tab, tabIndex) => {
      const isActive = tab.dataset.stage === stage;
      tab.classList.toggle("is-active", isActive);
      tab.classList.toggle("is-complete", stageOrder.indexOf(tab.dataset.stage) < index);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    stagePanel.setAttribute("aria-labelledby", `tab-${stage}`);

    const prevButton = document.querySelector("#prev-stage");
    const nextButton = document.querySelector("#next-stage");
    prevButton.disabled = index === 0;
    nextButton.textContent = index === stageOrder.length - 1 ? "Restart lifecycle" : "Next stage →";
  }

  function selectStage(stage, shouldFocus = false) {
    if (!stageOrder.includes(stage)) return;

    activeStage = stage;
    stageViews.forEach(view => { view.hidden = view.dataset.view !== stage; });
    updateChrome(stage);
    renderers[stage]();

    if (shouldFocus) document.querySelector(`[data-stage="${stage}"]`)?.focus();
  }

  stageTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectStage(tab.dataset.stage));
    tab.addEventListener("keydown", event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowUp") nextIndex = (index - 1 + stageTabs.length) % stageTabs.length;
      if (event.key === "ArrowDown") nextIndex = (index + 1) % stageTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = stageTabs.length - 1;
      selectStage(stageTabs[nextIndex].dataset.stage, true);
    });
  });

  document.querySelector("#prev-stage").addEventListener("click", () => {
    const index = stageOrder.indexOf(activeStage);
    if (index > 0) selectStage(stageOrder[index - 1]);
  });

  document.querySelector("#next-stage").addEventListener("click", () => {
    const index = stageOrder.indexOf(activeStage);
    selectStage(index === stageOrder.length - 1 ? stageOrder[0] : stageOrder[index + 1]);
  });

  document.querySelector("#copy-writeup").addEventListener("click", async () => {
    const text = writeupParagraphs.join("\n\n");
    const status = document.querySelector("#writeup-status");
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Copied to clipboard.";
    } catch {
      status.textContent = "Copy isn't available in this context — select the text manually.";
    }
  });

  selectStage(activeStage);
})();
