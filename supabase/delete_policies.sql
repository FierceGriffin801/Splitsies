-- Allow users to delete their own membership
CREATE POLICY "Users can remove themselves" ON public.group_members
  FOR DELETE USING (auth.uid() = user_id);

-- Allow users to delete the group if they are a member
CREATE POLICY "Members can delete group" ON public.groups
  FOR DELETE USING (
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );
