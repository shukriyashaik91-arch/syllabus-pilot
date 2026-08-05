CREATE TABLE public.study_states (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_states TO authenticated;
GRANT ALL ON public.study_states TO service_role;

ALTER TABLE public.study_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own study state"
ON public.study_states FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);