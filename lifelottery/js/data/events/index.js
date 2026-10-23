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

/** File name -> events, kept separate so tests can check id prefixes per file. */
export const EVENT_FILES = { seed, childhood, youth, adult_work, adult_family, migration, health, aging, world, regional };

/** Required id prefix per file. */
export const EVENT_PREFIX = {
  seed: 'seed_', childhood: 'childhood_', youth: 'youth_', adult_work: 'work_', adult_family: 'family_',
  migration: 'migration_', health: 'health_', aging: 'aging_', world: 'world_', regional: 'regional_',
};

export default Object.values(EVENT_FILES).flat();
