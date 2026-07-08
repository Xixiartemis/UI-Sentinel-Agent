ALTER TABLE code_chunks
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'typescript',
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS code_chunks_content_hash_idx
  ON code_chunks(content_hash);
