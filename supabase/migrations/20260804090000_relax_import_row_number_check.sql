-- csv_import_rows.source_row_number originally required > 1 because CSV
-- imports always reserve row 1 for the header, so the first data row is 2.
-- JSON imports have no header row: the first array entry is source row 1.
-- Relax the check so a JSON import's first entry doesn't violate it.
alter table public.csv_import_rows
  drop constraint csv_import_rows_source_row_number_check;

alter table public.csv_import_rows
  add constraint csv_import_rows_source_row_number_check
  check (source_row_number > 0);
