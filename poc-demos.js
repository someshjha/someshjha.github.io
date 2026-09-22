const demos = document.querySelector('[data-poc-demos]');

if (demos) {
  const setPressed = (group, active) => {
    group.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button === active));
    });
  };

  demos.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-demo-action]');
    if (!button) return;

    const panel = button.closest('.demo-panel');
    const output = panel.querySelector('[data-demo-output]');
    const action = button.dataset.demoAction;
    setPressed(button.closest('.demo-controls'), button);

    if (panel.id === 'evidence-review-demo') {
      panel.dataset.state = action;
      output.textContent = action === 'restart'
        ? 'Worker 2 resumed at screening batch 4. Completed search and extraction steps were not repeated.'
        : 'Reviewer overrode one exclusion. The model suggestion remains in the audit trail beside the human decision.';
    }

    if (panel.id === 'column-masking-demo') {
      const values = {
        support: ['Maya Chen', '••• ••• 1842', 'Hidden', 'Account support'],
        finance: ['Maya Chen', '••• ••• 1842', '$18,420', 'Payment review'],
        compliance: ['Maya Chen', '555-013-1842', '$18,420', 'Investigation']
      }[action];
      panel.querySelectorAll('[data-mask-value]').forEach((cell, index) => { cell.textContent = values[index]; });
      output.textContent = `${button.textContent.trim()} role applied at the data boundary. The query itself did not change.`;
    }

    if (panel.id === 'financial-data-demo') {
      panel.dataset.scope = action;
      output.textContent = action === 'research'
        ? 'Allowed: market snapshot and company fundamentals. Blocked: customer positions and trade execution.'
        : 'Allowed: aggregate portfolio exposure. Blocked: account identity, transfers, and order placement.';
    }

    if (panel.id === 'streaming-orders-demo') {
      const metric = panel.querySelector('[data-revenue]');
      const duplicate = panel.querySelector('[data-duplicates]');
      const late = panel.querySelector('[data-late]');
      if (action === 'duplicate') duplicate.textContent = '1 ignored';
      if (action === 'late') late.textContent = '1 reconciled';
      if (action === 'recover') metric.textContent = '$1,284.20';
      output.textContent = {
        duplicate: 'Duplicate event pay-104 was discarded using its event ID; revenue did not change.',
        late: 'Late payment pay-107 was joined in event time and the affected minute was corrected.',
        recover: 'Processor restored from checkpoint 88 without replaying committed revenue.'
      }[action];
    }
  });
}
