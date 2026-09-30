const waitingMutations: Array<() => void> = [];

/** Session mutations wait for the complete archive, so a light cache never overwrites its media. */
export function deferDrawingMutation(mutation: () => void) {
  waitingMutations.push(mutation);
}

export function finishDrawingHydration() {
  const mutations = waitingMutations.splice(0);
  mutations.forEach(mutation => mutation());
}
