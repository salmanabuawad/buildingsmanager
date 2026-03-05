-- Replace status 'transferred_to_automation' with 'closed' in inspection_tasks.
-- הועבר לאוטומציה is removed; use סגור (closed) when manager approves.

UPDATE inspection_tasks SET status = 'closed' WHERE status = 'transferred_to_automation';

ALTER TABLE inspection_tasks DROP CONSTRAINT IF EXISTS inspection_tasks_status_check;
ALTER TABLE inspection_tasks ADD CONSTRAINT inspection_tasks_status_check
  CHECK (status IN ('open', 'in_inspector_handling', 'pending_manager_approval', 'closed'));

COMMENT ON COLUMN inspection_tasks.status IS 'open | in_inspector_handling | pending_manager_approval | closed (after manager approve)';
