// The look plan for Ember Yard, in one place. A dusk industrial yard: warm amber
// light against cold blue-grey steel, rust red for the containers, one teal for
// the defending team. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#17120e',
  floor: '#262019',
  wall: '#3b332c',
  steel: '#4a4f55',
  rust: '#8a4a2b',
  crate: '#5d4a33',
  ink: '#f2ead9',
  muted: '#a89a86',
  accent: '#f5a623',
  ember: '#e2541e',
  defender: '#3fa8a0',
  attacker: '#f5a623',
};

export function shade(name) {
  return PALETTE[name];
}
