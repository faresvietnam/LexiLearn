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

describe('database migration chain', () => {
  it('keeps the complete migration order available for a clean replay', () => {
    const files = migrationFiles();

    expect(files).toEqual([
      '20260729170452_phase_2_identity_schema.sql',
      '20260729170549_harden_identity_functions.sql',
      '20260729171732_add_learning_content_schema.sql',
      '20260730025853_phase_2_security_hardening.sql',
      '20260730033519_close_phase_2_security_review_gaps.sql',
      '20260730035000_remove_legacy_private_word_helper.sql',
      '20260730064946_add_fsrs_learning_card_state.sql',
      '20260730075754_add_personal_gemini_key.sql',
      '20260730081921_add_r2_image_metadata.sql',
      '20260730093433_add_csv_import_persistence.sql',
      '20260730112632_add_edit_suggestions.sql',
      '20260730115441_add_moderation_transactions.sql',
      '20260730123000_fix_admin_moderation_rls_version.sql',
      '20260730124500_allow_owner_delete_private_words.sql',
      '20260730130000_cascade_delete_word_attempts.sql',
      '20260730133000_add_adaptive_skill_telemetry.sql',
      '20260730134500_add_sentence_attempt_key.sql',
      '20260730162148_daily_new_word_usage.sql',
      '20260731094000_normalize_fsrs_card_consistency.sql',
      '20260731101500_remove_private_word_moderation.sql',
      '20260731102825_add_private_word_learning_content.sql',
      '20260731160000_add_admin_user_stats.sql',
      '20260803090000_reset_dev_review_history.sql',
      '20260803090100_add_review_idempotency.sql',
      '20260803090200_add_submit_learning_review_rpc.sql',
      '20260803090300_harden_admin_user_stats.sql',
      '20260803090400_complete_new_word_quota.sql',
      '20260804031142_add_private_word_component_library.sql',
      '20260804074151_add_openai_compatible_provider.sql',
      '20260804081036_add_openai_token_configured_flag.sql',
      '20260804090000_relax_import_row_number_check.sql',
      '20260807000000_fix_create_private_word_tag_ids_uuid_cast.sql',
      '20260807010000_fix_admin_user_stats_word_level_new_word_count.sql',
      '20260807080000_word_level_new_word_quota.sql',
    ]);
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
