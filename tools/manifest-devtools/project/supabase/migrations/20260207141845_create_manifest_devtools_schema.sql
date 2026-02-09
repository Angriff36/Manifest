/*
  # Manifest DevTools Database Schema

  1. New Tables
    - `provenance_records`
      - `id` (uuid, primary key)
      - `created_by` (uuid, nullable FK to auth.users)
      - `ir_hash` (text, unique) - SHA-256 hash of the IR content
      - `ir_content` (jsonb) - The IR JSON content
      - `source_hash` (text) - SHA-256 hash of the original source
      - `compiler_version` (text) - Compiler version that produced this IR
      - `metadata` (jsonb) - Additional metadata
      - `is_public` (boolean) - Whether publicly visible
      - `created_at` (timestamptz)

    - `saved_fixtures`
      - `id` (uuid, primary key)
      - `created_by` (uuid, nullable FK to auth.users)
      - `name` (text) - Human-readable fixture name
      - `description` (text) - What this fixture tests
      - `manifest_source` (text) - The .manifest source content
      - `compiled_ir` (jsonb) - The .ir.json compiled IR
      - `expected_results` (jsonb) - The .results.json expected outputs
      - `tags` (text array) - Tags for categorization
      - `is_public` (boolean) - Whether publicly visible
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Anon users can read public records and create public records
    - Authenticated users can manage their own records and read public ones

  3. Indexes
    - Index on ir_hash for fast lookups
    - Index on is_public for filtered queries
    - Index on tags for fixture search
*/

-- Provenance Records table
CREATE TABLE IF NOT EXISTS provenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  ir_hash text UNIQUE NOT NULL,
  ir_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text NOT NULL DEFAULT '',
  compiler_version text NOT NULL DEFAULT '0.1.0',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read public provenance records"
  ON provenance_records FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Anon can submit public provenance records"
  ON provenance_records FOR INSERT
  TO anon
  WITH CHECK (is_public = true AND created_by IS NULL);

CREATE POLICY "Auth users can read own provenance records"
  ON provenance_records FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR is_public = true);

CREATE POLICY "Auth users can insert own provenance records"
  ON provenance_records FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Auth users can update own provenance records"
  ON provenance_records FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Auth users can delete own provenance records"
  ON provenance_records FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_provenance_ir_hash ON provenance_records (ir_hash);
CREATE INDEX IF NOT EXISTS idx_provenance_public ON provenance_records (is_public) WHERE is_public = true;

-- Saved Fixtures table
CREATE TABLE IF NOT EXISTS saved_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  manifest_source text NOT NULL DEFAULT '',
  compiled_ir jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read public fixtures"
  ON saved_fixtures FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Anon can create public fixtures"
  ON saved_fixtures FOR INSERT
  TO anon
  WITH CHECK (is_public = true AND created_by IS NULL);

CREATE POLICY "Auth users can read own and public fixtures"
  ON saved_fixtures FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR is_public = true);

CREATE POLICY "Auth users can insert own fixtures"
  ON saved_fixtures FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Auth users can update own fixtures"
  ON saved_fixtures FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Auth users can delete own fixtures"
  ON saved_fixtures FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fixtures_public ON saved_fixtures (is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_fixtures_tags ON saved_fixtures USING gin (tags);
