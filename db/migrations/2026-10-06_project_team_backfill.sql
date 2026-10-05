-- Migration: 2026-10-06 — give every existing project a team.
--
-- NOT APPLIED. Run only when told. The server now refuses writes to a project
-- with no team (except by privileged users), so run this before deploying the
-- new code, or operators will lose write access to projects that have no team.
--
-- Adds the project's creator (matched by name, case-insensitive) as an operator.
-- Projects whose creator name does not match a user stay team-less: privileged
-- users can then add the team from Project Management.
-- Safe to run more than once.
--
-- How to apply: psql "$DATABASE_URL" -f db/migrations/2026-10-06_project_team_backfill.sql

BEGIN;

INSERT INTO project_members (project_id, user_id, role, added_by)
SELECT DISTINCT ON (p.id) p.id, u.id, 'operator', 'backfill'
FROM projects p
JOIN users u ON lower(trim(u.name)) = lower(trim(p.created_by))
WHERE NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id)
ON CONFLICT DO NOTHING;

COMMIT;
