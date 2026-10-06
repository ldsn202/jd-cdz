-- T5.1: fence dispatch/result adoption inside the same D1 transaction.
-- The attempt update is deliberately the first statement in every adoption batch.
CREATE TRIGGER guard_attempt_current_lease BEFORE UPDATE ON execution_attempt
WHEN OLD.status = 'RUNNING'
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM background_job j WHERE j.id = OLD.job_id AND j.status = 'RUNNING'
   AND j.lease_epoch = OLD.lease_epoch AND j.lease_token = OLD.lease_token
   AND j.lease_owner = OLD.executor_identity_id
   AND j.lease_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
 ) THEN RAISE(ABORT, 'attempt_lease_lost') END;
END;
