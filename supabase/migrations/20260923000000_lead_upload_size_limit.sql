-- The outreach-leads bucket (created in 20260826010000_campaigns_lead_files_schema.sql)
-- never had a size limit of its own -- the 10 MB cap a client sees in the
-- wizard (MAX_LEAD_FILE_BYTES in lib/csv.ts) only exists in the browser, so
-- nothing stops a raw upload (bypassing the app's own UI) from putting an
-- arbitrarily large file into this bucket, which the "add leads" API route
-- then reads entirely into memory to parse. Match the same 10 MB limit at
-- the storage layer so it's enforced no matter how the upload is made.
update storage.buckets set file_size_limit = 10485760 where id = 'outreach-leads';
