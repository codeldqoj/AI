import directory from '../data/specialized-schools.json' with { type: 'json' };
export const SPECIALIZED_SCHOOLS = Object.freeze(directory.schools.map(school => Object.freeze(school)));
export function specializedSchool(id) { return SPECIALIZED_SCHOOLS.find(school => school.id === id); }
