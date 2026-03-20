-- Allow removing / switching votes (PostgREST sends WHERE report_id + fingerprint)
drop policy if exists "Anyone can delete upvotes" on public.upvotes;
drop policy if exists "Anyone can delete downvotes" on public.downvotes;

create policy "Anyone can delete upvotes"
  on public.upvotes for delete using (true);

create policy "Anyone can delete downvotes"
  on public.downvotes for delete using (true);
