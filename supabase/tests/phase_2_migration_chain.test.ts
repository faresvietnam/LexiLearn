import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');

function migrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function readMigration(file: string) {
  return readFileSync(`${migrationsDirectory}/${file}`, 'utf8');
}

describe('Phase 2 migration chain', () => {
  it('keeps the complete migration order available for a clean replay', () => {
    const files = migrationFiles();

    expect(files.slice(0, 4)).toEqual([
      '20260729165754_phase_2_schema.sql',
      '20260730000100_harden_identity_functions.sql',
      '20260730001000_add_learning_content_schema.sql',
      '20260730025853_phase_2_security_hardening.sql',
    ]);
    expect(files.at(-1)).toMatch(
      /^\d{14}_close_phase_2_security_review_gaps\.sql$/,
    );
  });

  it('guards removal of the optional legacy public admin helper', () => {
    const chain = migrationFiles().map(readMigration).join('\n');
    const publicAdminDrops = [
      ...chain.matchAll(
        /drop\s+function(?:\s+if\s+exists)?\s+public\.is_admin\s*\(\s*\)\s*;/gi,
      ),
    ].map(([statement]) => statement);

    expect(publicAdminDrops.length).toBeGreaterThan(0);
    expect(publicAdminDrops).toEqual(
      publicAdminDrops.filter((statement) =>
        /drop\s+function\s+if\s+exists/i.test(statement),
      ),
    );
    expect(chain).not.toMatch(
      /revoke\s+all\s+on\s+function\s+public\.is_admin\s*\(\s*\)/i,
    );
  });
});
