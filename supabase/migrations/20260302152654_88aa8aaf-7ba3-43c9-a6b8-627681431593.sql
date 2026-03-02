
-- Add RLS policies for recordings storage bucket
-- Allow authenticated users to upload their own recordings
CREATE POLICY "Users can upload recordings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own recordings
CREATE POLICY "Users can read own recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own recordings
CREATE POLICY "Users can delete own recordings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add update policy for templates table (was missing)
CREATE POLICY "Users can update their own templates"
ON public.templates
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add unique constraint on settings for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_user_id_key_unique'
  ) THEN
    ALTER TABLE public.settings ADD CONSTRAINT settings_user_id_key_unique UNIQUE (user_id, key);
  END IF;
END $$;

-- Attach updated_at trigger to reports and settings tables if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_reports_updated_at') THEN
    CREATE TRIGGER update_reports_updated_at
      BEFORE UPDATE ON public.reports
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_settings_updated_at') THEN
    CREATE TRIGGER update_settings_updated_at
      BEFORE UPDATE ON public.settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
