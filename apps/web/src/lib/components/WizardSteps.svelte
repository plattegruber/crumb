<script lang="ts">
  const {
    steps,
    currentStep,
  }: {
    steps: string[];
    currentStep: number;
  } = $props();
</script>

<div class="wizard-steps" role="navigation" aria-label="Wizard progress">
  {#each steps as label, i (i)}
    {@const stepNum = i + 1}
    {@const isActive = stepNum === currentStep}
    {@const isComplete = stepNum < currentStep}
    <div class="step" class:active={isActive} class:complete={isComplete}>
      <span class="step-number">
        {#if isComplete}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        {:else}
          {stepNum}
        {/if}
      </span>
      <span class="step-label">{label}</span>
    </div>
    {#if i < steps.length - 1}
      <div class="step-connector" class:complete={stepNum < currentStep}></div>
    {/if}
  {/each}
</div>

<p class="step-indicator-mobile">Step {currentStep} of {steps.length}: {steps[currentStep - 1]}</p>

<style>
  .wizard-steps {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: var(--space-8);
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    font-weight: 700;
    border: 2px solid var(--color-border);
    color: var(--color-text-muted);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .step.active .step-number {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-primary-text, white);
  }

  .step.complete .step-number {
    border-color: var(--color-success, #22c55e);
    background: var(--color-success, #22c55e);
    color: white;
  }

  .step-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .step.active .step-label {
    color: var(--color-text);
  }

  .step.complete .step-label {
    color: var(--color-text-secondary);
  }

  .step-connector {
    flex: 1;
    height: 2px;
    background: var(--color-border);
    margin: 0 var(--space-2);
    min-width: 16px;
  }

  .step-connector.complete {
    background: var(--color-success, #22c55e);
  }

  .step-indicator-mobile {
    display: none;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .wizard-steps {
      display: none;
    }

    .step-indicator-mobile {
      display: block;
    }
  }
</style>
