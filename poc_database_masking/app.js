(() => {
  "use strict";

  const commonRecord = Object.freeze({
    patient_id: "PT-DEMO-0042",
    record_status: "ACTIVE",
    updated_at: "2026-09-21T14:32:00Z"
  });

  const roleDefinitions = Object.freeze({
    clinical: Object.freeze({
      label: "Clinical",
      identity: "clinical.user",
      schema: "clinical_access",
      heading: "Clinical patient record",
      summary: "Clinical fields needed for safe care delivery and continuity.",
      policy: "Clinical teams receive the information needed to make and document care decisions.",
      fields: Object.freeze({
        patient_name: "Avery Example",
        date_of_birth: "1988-02-14 (fictional)",
        allergies: "Penicillin",
        active_conditions: "Type 2 diabetes",
        current_medications: "Metformin 500 mg",
        care_plan: "Quarterly monitoring",
        last_clinical_visit: "2026-08-28"
      })
    }),
    billing: Object.freeze({
      label: "Billing",
      identity: "billing.user",
      schema: "billing_access",
      heading: "Billing patient record",
      summary: "Insurance and account fields needed to process claims and payments.",
      policy: "Billing teams receive coverage, claim, and balance details without clinical or contact data.",
      fields: Object.freeze({
        billing_account_id: "BA-DEMO-7301",
        insurer: "Example Health Plan",
        member_id_masked: "DEMO-••••-4821",
        claim_status: "PENDING REVIEW",
        outstanding_balance: 84.25,
        currency: "CAD",
        last_invoice_date: "2026-09-05"
      })
    }),
    support: Object.freeze({
      label: "Patient Support",
      identity: "support.user",
      schema: "support_access",
      heading: "Patient support record",
      summary: "Contact and service fields needed to coordinate the patient experience.",
      policy: "Patient Support receives contact, appointment, and service details without clinical or billing data.",
      fields: Object.freeze({
        patient_name: "Avery Example",
        preferred_contact_method: "Email",
        phone: "+1 555 010 0042 (fictional)",
        email: "avery@example.invalid",
        assigned_clinic: "North Demo Clinic",
        next_appointment: "2026-10-03 09:30",
        open_support_request: "Appointment rescheduling"
      })
    })
  });

  const tabs = [...document.querySelectorAll("[data-role]")];
  const recordPanel = document.querySelector("#record-panel");
  const fieldGrid = document.querySelector("#field-grid");
  const jsonOutput = document.querySelector("#json-output");
  let activeRole = "clinical";

  const formatLabel = key => key.replaceAll("_", " ");

  const formatValue = (key, value) => {
    if (key === "outstanding_balance") {
      return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
    }
    if (key === "updated_at") {
      return new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC"
      }).format(new Date(value)) + " UTC";
    }
    return String(value);
  };

  const highlightJson = record => {
    const escaped = JSON.stringify(record, null, 2)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    return escaped.replace(
      /(&quot;[^&]*?&quot;)(?=\s*:)|(&quot;.*?&quot;)|\b(-?\d+(?:\.\d+)?)\b/g,
      (match, key, stringValue, numberValue) => {
        if (key) return `<span class="json-key">${key}</span>`;
        if (stringValue) return `<span class="json-string">${stringValue}</span>`;
        if (numberValue) return `<span class="json-number">${numberValue}</span>`;
        return match;
      }
    );
  };

  const buildRecord = role => Object.freeze({ ...commonRecord, ...roleDefinitions[role].fields });

  const renderRecord = role => {
    const definition = roleDefinitions[role];
    const record = buildRecord(role);
    const entries = Object.entries(record);

    document.body.dataset.role = role;
    document.querySelector("#identity-name").textContent = definition.identity;
    document.querySelector("#application-role").textContent = definition.label;
    document.querySelector("#database-schema").textContent = definition.schema;
    document.querySelector("#identity-result").textContent = `${entries.length} columns returned`;
    document.querySelector("#record-heading").textContent = definition.heading;
    document.querySelector("#record-summary").textContent = definition.summary;
    document.querySelector("#policy-copy").textContent = definition.policy;
    document.querySelector("#column-count").textContent = entries.length;
    document.querySelector("#json-size").textContent = `${entries.length} keys`;

    fieldGrid.replaceChildren(...entries.map(([key, value]) => {
      const wrapper = document.createElement("div");
      wrapper.className = `field-pair${key in commonRecord ? " is-common" : ""}`;

      const term = document.createElement("dt");
      term.textContent = formatLabel(key);
      const detail = document.createElement("dd");
      detail.textContent = formatValue(key, value);
      wrapper.append(term, detail);
      return wrapper;
    }));

    jsonOutput.innerHTML = highlightJson(record);
    recordPanel.setAttribute("aria-labelledby", `tab-${role}`);

    tabs.forEach(tab => {
      const isActive = tab.dataset.role === role;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
  };

  const selectRole = (role, shouldFocus = false) => {
    if (!roleDefinitions[role] || role === activeRole) {
      if (shouldFocus) document.querySelector(`[data-role="${role}"]`)?.focus();
      return;
    }

    activeRole = role;
    recordPanel.classList.add("is-updating");
    window.setTimeout(() => {
      renderRecord(role);
      recordPanel.classList.remove("is-updating");
      if (shouldFocus) document.querySelector(`[data-role="${role}"]`)?.focus();
    }, 110);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectRole(tab.dataset.role));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      selectRole(tabs[nextIndex].dataset.role, true);
    });
  });

  renderRecord(activeRole);
})();
