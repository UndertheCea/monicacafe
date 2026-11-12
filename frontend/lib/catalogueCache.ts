// Short-lived caching of anonymous catalogue queries (#235). No imports: `node --test` loads this directly.
//
// Cached: filter options, the home page's sections, the sitemap's pages. They
// change a few times a day, so 60 s of staleness is invisible, and a burst of
// visitors costs the database one query a minute instead of one per visitor.
//
// Never cached: coffee listing and detail pages (filters, search, comments and
// stock must be fresh; the nonce'd CSP already makes each response per-request),
// anything with a viewer's Authorization header or cookie, and all mutations.

/** Seconds a cached catalogue response is served before it is refetched. */
export const CATALOGUE_REVALIDATE = 60;

export const CACHE_TAGS = {
  filterOptions: "catalogue:filter-options",
  home: "catalogue:home",
  sitemap: "catalogue:sitemap",
} as const;

export type CatalogueTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** The `next` option of a cached catalogue fetch. */
export function catalogueFetchOptions(tags: CatalogueTag[]): { revalidate: number; tags: string[] } {
  return { revalidate: CATALOGUE_REVALIDATE, tags: [...tags] };
}
