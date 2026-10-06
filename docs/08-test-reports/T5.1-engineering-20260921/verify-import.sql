SELECT count(*) AS providers FROM service_provider WHERE source_system='installation_management';
SELECT count(*) AS work_orders FROM installation_work_order WHERE source_system='installation_management';
SELECT count(*) AS contexts FROM installation_context_snapshot;
SELECT count(*) AS inferred_work_items FROM work_item;
SELECT count(*) AS verified_contexts FROM installation_context_snapshot WHERE json_extract(context_json,'$._sourceImport') IS NOT NULL;
