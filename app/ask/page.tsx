import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function AskRedirectPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = params.q?.trim();
  if (q) {
    redirect(`/?q=${encodeURIComponent(q)}`);
  }
  redirect("/");
}
