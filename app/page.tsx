import { SearchExperience } from "@/components/search-experience";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const { q = "" } = await searchParams;
  return <SearchExperience initialQuery={q} />;
}
