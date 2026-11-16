// The look plan for Ember Yard, in one place. A dusk industrial yard: warm amber
// light against cold blue-grey steel, rust red for the containers, one teal for
// the defending team. The same names are the CSS custom properties in index.html.
// Revision (lighting pass): the yard is now lit like late golden hour rather
// than near-night — surfaces lifted so the map, lanes and bots read at a glance
// in screenshots, while the warm dusk character is kept.
export const PALETTE = {
  canvas: '#3d3226',
  floor: '#4a3d2c',
  wall: '#6b5d4a',
  steel: '#757c85',
  rust: '#a8603a',
  crate: '#82683f',
  ink: '#f2ead9',
  muted: '#c4b7a4',
  accent: '#f5a623',
  ember: '#e2541e',
  defender: '#3fa8a0',
  attacker: '#f5a623',
};

export function shade(name) {
  return PALETTE[name];
}
