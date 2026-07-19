export const HIERARCHICAL_CHOICE_CONFLICTS = [
  ['hip_bone', 'ilium'],
  ['hip_bone', 'ischium'],
  ['hip_bone', 'pubis'],
  ['vertebra', 'atlas'],
  ['vertebra', 'axis'],
  ['vertebra', 'cervical_vertebra'],
  ['vertebra', 'thoracic_vertebra'],
  ['vertebra', 'lumbar_vertebra'],
];

export function choiceTermsConflict(firstTermId, secondTermId) {
  return HIERARCHICAL_CHOICE_CONFLICTS.some(
    ([parentTermId, childTermId]) =>
      (firstTermId === parentTermId && secondTermId === childTermId) ||
      (firstTermId === childTermId && secondTermId === parentTermId),
  );
}

export function findChoiceConflicts(choiceIds) {
  const conflicts = [];
  for (let firstIndex = 0; firstIndex < choiceIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < choiceIds.length; secondIndex += 1) {
      const firstTermId = choiceIds[firstIndex];
      const secondTermId = choiceIds[secondIndex];
      if (choiceTermsConflict(firstTermId, secondTermId)) {
        conflicts.push([firstTermId, secondTermId]);
      }
    }
  }
  return conflicts;
}
