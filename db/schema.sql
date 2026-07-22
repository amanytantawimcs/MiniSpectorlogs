-- MiniSpector Log — Railway Postgres schema
-- Replaces the schemaless Supabase `projects.data` JSONB blob with a
-- hybrid model: normalized tables for repeating log entries, JSONB
-- columns for document-shaped nested state (checklists, sim sysarch, etc).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ============================================================
-- updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS / ADMINS / MEMBERSHIP
-- ============================================================

CREATE TABLE users (
  id             TEXT PRIMARY KEY,              -- app's numeric-string IDs, e.g. '101'
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('engineer', 'manager')),
  passcode_hash  TEXT,                          -- scrypt hash; NULL means no passcode set yet (first login sets one)
  passcode_salt  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admins (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROJECTS — the central row (one per operation OR simulation-only project)
-- ============================================================

CREATE TABLE projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code         TEXT UNIQUE NOT NULL,
  project_name         TEXT,
  mode                 TEXT NOT NULL DEFAULT 'operation' CHECK (mode IN ('operation', 'simulation')),
  created_by           TEXT,   -- free-text display name (currentUserName), not a users.id FK

  vessel               TEXT,
  location             TEXT,
  scope                TEXT,
  operational_id_auto  TEXT,
  minispector_number   TEXT,
  supervisor_name      TEXT,
  is_sim_locked        BOOLEAN NOT NULL DEFAULT false,

  -- Document-shaped nested state — always read/written whole by renderer.js
  daily_summary        JSONB NOT NULL DEFAULT '{}',   -- startDate,endDate,location,weather,visibility,temperature,shiftno,scope
  pre_dive             JSONB NOT NULL DEFAULT '{}',   -- {selectedSystem, overallRemarks, checks:{...}}
  post_dive            JSONB NOT NULL DEFAULT '{}',   -- thrusters/props/frame/... booleans + remarks
  lars_status          JSONB NOT NULL DEFAULT '{}',
  software_status      JSONB NOT NULL DEFAULT '{}',
  aux_tool_status      JSONB NOT NULL DEFAULT '{}',
  camera_systems       JSONB NOT NULL DEFAULT '[]',
  other_sensors        JSONB NOT NULL DEFAULT '[]',
  fault_report         JSONB NOT NULL DEFAULT '{}',
  checklists           JSONB NOT NULL DEFAULT '{"mobilization":{},"startup":{},"preOp":{},"postOp":{},"shutdown":{},"demob":{}}',
  minispector_systems  JSONB NOT NULL DEFAULT '[]',
  pre_operation_data   JSONB,                          -- snapshot pushed from simulation (preOpData)
  final_setup          JSONB,
  remarks              TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- CREW & SHIFT LOGS
-- ============================================================

CREATE TABLE crew_members (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  shift      TEXT,
  sign_on    TEXT,
  sign_off   TEXT
);
CREATE INDEX idx_crew_members_project ON crew_members(project_id);

CREATE TABLE shift_logs (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shift_no    TEXT,
  start_date  TEXT,
  end_date    TEXT,
  weather     TEXT,
  visibility  TEXT,
  temperature TEXT,
  notes       TEXT,
  crew        TEXT[] NOT NULL DEFAULT '{}'   -- crew member names checked for this shift
);
CREATE INDEX idx_shift_logs_project ON shift_logs(project_id);

-- ============================================================
-- OPERATIONAL LOGS (one table per modal type in renderer.js)
-- ============================================================

CREATE TABLE dive_logs (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  num        TEXT,
  rov        TEXT,
  date       TEXT,
  end_date   TEXT,
  start_time TEXT,
  end_time   TEXT,
  depth      TEXT,
  duration   TEXT,
  purpose    TEXT,
  area       TEXT,
  issues     TEXT,
  client     TEXT,
  notes      TEXT
);
CREATE INDEX idx_dive_logs_project ON dive_logs(project_id);

CREATE TABLE maintenance_logs (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_ref  TEXT,   -- app's own `id` field (user-entered, not the PK)
  date       TEXT,
  performed_by TEXT,
  task       TEXT,
  details    TEXT,
  parts      TEXT,
  remarks    TEXT
);
CREATE INDEX idx_maintenance_logs_project ON maintenance_logs(project_id);

CREATE TABLE hse_reports (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_ref   TEXT,
  type        TEXT,
  description TEXT,
  action      TEXT,
  root_cause  TEXT,
  prevention  TEXT
);
CREATE INDEX idx_hse_reports_project ON hse_reports(project_id);

CREATE TABLE standby_logs (
  id           BIGSERIAL PRIMARY KEY,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_ref    TEXT,
  date         TEXT,
  end_date     TEXT,
  performed_by TEXT,
  start_time   TEXT,
  end_time     TEXT,
  duration     TEXT,
  category     TEXT,
  description  TEXT
);
CREATE INDEX idx_standby_logs_project ON standby_logs(project_id);

CREATE TABLE fault_logs (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status      TEXT,
  tech        TEXT,
  description TEXT,
  action      TEXT,
  parts       TEXT,
  remaining   TEXT,
  photos      JSONB NOT NULL DEFAULT '[]'   -- [{name, path, type}]
);
CREATE INDEX idx_fault_logs_project ON fault_logs(project_id);

-- ============================================================
-- SIMULATION (mission planning — collectSimState() / loadSimulationState())
-- ============================================================

CREATE TABLE simulations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID UNIQUE REFERENCES projects(id) ON DELETE CASCADE,  -- set once pushed to operation
  project_code      TEXT NOT NULL,
  scope_id          TEXT,
  scope_name        TEXT,
  report_date       DATE,

  sensors           JSONB NOT NULL DEFAULT '[]',
  rov_sensors       JSONB NOT NULL DEFAULT '{}',   -- keyed by rovNumber
  sysarch           JSONB NOT NULL DEFAULT '{}',   -- machines/equipment/simStatus/deliverables/systemIPs (equipment doubles as the packing list)
  issues            JSONB NOT NULL DEFAULT '[]',
  thrusters         JSONB NOT NULL DEFAULT '[]',

  approval_status   TEXT NOT NULL DEFAULT 'draft',
  approval_history  JSONB NOT NULL DEFAULT '[]',

  pushed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_simulations_project_code ON simulations(project_code);

CREATE TRIGGER trg_simulations_updated_at
  BEFORE UPDATE ON simulations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE simulation_rovs (
  id            BIGSERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  rov_number    INTEGER NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('main', 'standby')),
  serial        TEXT,
  description   TEXT,
  UNIQUE (simulation_id, rov_number)
);

-- ============================================================
-- CLOUD SYNC BOOKKEEPING (mirrors current Supabase usage)
-- ============================================================

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'viewer')),
  added_by   TEXT,   -- free-text display name or 'admin', not a users.id FK
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE session_meta (
  device_id   TEXT PRIMARY KEY,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  device_role TEXT CHECK (device_role IN ('vessel', 'office')),
  user_name   TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_log (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  device_role TEXT,
  user_name   TEXT,
  action      TEXT,       -- 'create' | 'join' | 'update'
  meta        JSONB NOT NULL DEFAULT '{}',
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_log_project ON sync_log(project_id, synced_at DESC);
