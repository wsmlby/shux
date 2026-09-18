export interface OpenLibraryResult {
  description?: string;
  coverUrl?: string;
  publishedAt?: string;
  isbn?: string;
}

interface SearchDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
}

interface SearchResponse {
  docs?: SearchDoc[];
}

export async function fetchOpenLibraryMetadata(
  title: string,
  author?: string
): Promise<OpenLibraryResult | undefined> {
  const query = new URLSearchParams({
    title,
    ...(author ? { author } : {}),
    limit: "1",
  });

  try {
    const response = await fetch(`https://openlibrary.org/search.json?${query.toString()}`, {
      headers: { "User-Agent": "Shux/0.1 (self-hosted book server)" },
    });
    if (!response.ok) return undefined;

    const data = (await response.json()) as SearchResponse;
    const doc = data.docs?.[0];
    if (!doc) return undefined;

    let description: string | undefined;
    const workKey = (doc as unknown as { key?: string }).key;
    if (workKey) {
      try {
        const workResponse = await fetch(`https://openlibrary.org${workKey}.json`, {
          headers: { "User-Agent": "Shux/0.1 (self-hosted book server)" },
        });
        if (workResponse.ok) {
          const work = (await workResponse.json()) as { description?: string | { value?: string } };
          description =
            typeof work.description === "string" ? work.description : work.description?.value;
        }
      } catch {
        // best-effort only
      }
    }

    return {
      description,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
      publishedAt: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      isbn: doc.isbn?.[0],
    };
  } catch {
    return undefined;
  }
}
