export type ChecklistStatus = 'pending' | 'active' | 'picked' | 'problem';

export type ChecklistStep = { status: ChecklistStatus };

export function getActiveStep<T extends ChecklistStep>(route: T[]) {
  return route.find((step) => step.status === 'active' || step.status === 'pending');
}

export function updateActiveStepStatus<T extends ChecklistStep>(route: T[], status: 'picked' | 'problem') {
  const activeStep = getActiveStep(route);
  if (!activeStep) return route;

  return route.map((step) => step === activeStep ? { ...step, status } : step);
}

export function isChecklistComplete(route: ChecklistStep[]) {
  return route.length > 0 && route.every((step) => step.status === 'picked' || step.status === 'problem');
}
