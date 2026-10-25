// Merges every event file into one list. The engine imports the default export.
//
// To add a new event file: create it here, import it below and add it to EVENT_FILES.
// Event ids must be globally unique and start with the file's prefix (see each file's header).

import seed from './seed.js';
import childhood from './childhood.js';
import youth from './youth.js';
import adult_work from './adult_work.js';
import adult_family from './adult_family.js';
import migration from './migration.js';
import health from './health.js';
import aging from './aging.js';
import world from './world.js';
import regional from './regional.js';
import VARIANTS from './variants.js';
import MEMORIES from './memories.js';

/** File name -> events, kept separate so tests can check id prefixes per file. */
export const EVENT_FILES = { seed, childhood, youth, adult_work, adult_family, migration, health, aging, world, regional };

/** Required id prefix per file. */
export const EVENT_PREFIX = {
  seed: 'seed_', childhood: 'childhood_', youth: 'youth_', adult_work: 'work_', adult_family: 'family_',
  migration: 'migration_', health: 'health_', aging: 'aging_', world: 'world_', regional: 'regional_',
};

const ALL = Object.values(EVENT_FILES).flat();

// Phase 5C: alternative phrasings of the most frequent ordinary events (variants.js, { eventId: [variant, ...] }).
// The event's own `text` stays variant 0; the engine rotates through the list by the player's earlier lives (events.js).
for (const ev of ALL) if (VARIANTS[ev.id]) ev.variants = VARIANTS[ev.id];

// Phase 6C: the clause each choice keeps as a memory (memories.js, { eventId: { choice label: phrase } }). An option that also has a `familyResult`
// (written for a child whose family decides) keeps its own `memory` for the family and takes this phrase as `memoryYou`, for the person who chooses it.
for (const ev of ALL) {
  const M = MEMORIES[ev.id];
  if (!M || !ev.choices) continue;
  for (const c of ev.choices) {
    if (M[c.label] === undefined) continue;
    if (c.familyResult !== undefined && c.familyResult !== false) c.memoryYou = M[c.label];
    else if (c.memory === undefined) c.memory = M[c.label];
  }
}

export { VARIANTS, MEMORIES };
export default ALL;
