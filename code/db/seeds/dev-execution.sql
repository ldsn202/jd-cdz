-- 开发执行域种子：变化源与 READY 代次（cursor 从 c0 开始）。幂等。

INSERT INTO change_feed (id, service_provider_id, source_system, gmt_create, gmt_modified)
SELECT 'feed-dev-1', 'provider-dev-a', 'DEV', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM change_feed WHERE id = 'feed-dev-1');

INSERT INTO change_feed_generation (id, feed_id, generation_no, scope_json, start_cursor, current_cursor, state, source_acquired_position, coverage_through, row_version, gmt_create, gmt_modified)
SELECT 'gen-dev-1', 'feed-dev-1', 1, '{"feeds":["installation","billing"]}', 'c0', 'c0', 'READY', NULL, NULL, 1, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM change_feed_generation WHERE id = 'gen-dev-1');
