import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;
let migrated: Promise<void> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Point it at any PostgreSQL database (see README).');
  }
  return url;
}

function getClient(): Sql {
  if (!client) {
    client = postgres(connectionString(), {
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idle_timeout: 20,
      // Transaction-mode poolers (Supabase, PgBouncer, Neon pooled URLs) don't support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
  }
  return client;
}

/**
 * Returns the SQL client after making sure the schema exists. Migrations are
 * idempotent and run once per server process.
 */
export async function db(): Promise<Sql> {
  const sql = getClient();
  if (!migrated) {
    migrated = migrate(sql).catch(err => {
      migrated = null;
      throw err;
    });
  }
  await migrated;
  return sql;
}

async function migrate(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      pdf         BYTEA NOT NULL,
      pages       JSONB NOT NULL,
      fields      JSONB NOT NULL DEFAULT '[]'::jsonb,
      archived    BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id                TEXT PRIMARY KEY,
      template_id       TEXT NOT NULL REFERENCES templates(id),
      title             TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'draft',
      signer_name       TEXT NOT NULL DEFAULT '',
      signer_email      TEXT NOT NULL DEFAULT '',
      message           TEXT NOT NULL DEFAULT '',
      sender_values     JSONB NOT NULL DEFAULT '{}'::jsonb,
      signer_values     JSONB,
      field_snapshot    JSONB,
      page_snapshot     JSONB,
      signing_token     TEXT UNIQUE,
      token_issued_at   TIMESTAMPTZ,
      expires_days      INTEGER NOT NULL DEFAULT 30,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at           TIMESTAMPTZ,
      viewed_at         TIMESTAMPTZ,
      signed_at         TIMESTAMPTZ,
      voided_at         TIMESTAMPTZ,
      last_reminder_at  TIMESTAMPTZ,
      reminder_count    INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_template ON documents(template_id)`;
  // Immutable PDFs: 'sent' is frozen at send time, 'signed' is the final record.
  await sql`
    CREATE TABLE IF NOT EXISTS document_files (
      document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      pdf          BYTEA NOT NULL,
      sha256       TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (document_id, kind)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_events (
      id           BIGSERIAL PRIMARY KEY,
      document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      event        TEXT NOT NULL,
      at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip           TEXT,
      user_agent   TEXT,
      detail       TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_events(document_id)`;
}

/** Closes the pool (tests and scripts). */
export async function closeDb(): Promise<void> {
  if (client) await client.end({ timeout: 5 });
  client = null;
  migrated = null;
}
