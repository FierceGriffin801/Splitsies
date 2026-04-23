-- 1. Add created_by column to track group ownership
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Retroactively set existing groups' owner to the first member that joined
UPDATE public.groups g
SET created_by = (
  SELECT user_id FROM public.group_members gm 
  WHERE gm.group_id = g.id 
  ORDER BY joined_at ASC 
  LIMIT 1
)
WHERE created_by IS NULL;

-- 3. Replace old permissive delete policy with Strict Owner policy
DROP POLICY IF EXISTS "Members can delete group" ON public.groups;
CREATE POLICY "Owner can delete group" ON public.groups
  FOR DELETE USING (auth.uid() = created_by);
