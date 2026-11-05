/** App listens and opens or creates the ecommerce canvas project. */
export const OPEN_ECOMMERCE_CANVAS_EVENT = 'beike:open-ecommerce-canvas';
/** The mounted ecommerce canvas reads this token and opens the reference library. */
export const OPEN_WORKSHOP_REFERENCES_EVENT = 'beike:open-workshop-references';

let workshopReferenceToken = 0;

export function requestEcommerceCanvas() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_ECOMMERCE_CANVAS_EVENT));
}

export function requestWorkshopReferenceLibrary() {
  workshopReferenceToken += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_WORKSHOP_REFERENCES_EVENT));
}

export function workshopReferenceTokenValue() {
  return workshopReferenceToken;
}
