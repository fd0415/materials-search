import { redirect } from "next/navigation";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  redirect(query ? `/?q=${encodeURIComponent(query)}` : "/");
}
