# TODO: Pending tasks

Total number in pagination must be "n of n" or "n of many"

Strip line breaks in templates.

H1 size in media queries.

Solve the PWA issues.

Improve the console logging: silent, regular and debugging.

Ciprpulse checking of QUERY results: Randomly select a set of $N$ entries from its ciprdup, and send each one of them a `QUERY` request with a random `FTS expression`, a random `Accept:` header of the allowed ones, and random `pages[num]` and `pages[size]` query parameters. This is to validate the correctness of the ranking when retrieving search results.

Implement Pagefind (https://pagefind.app/) in the HTR and use the created index as the resindex.

Implement `QUERY /ZA/` to search in the resindex, it mimics `QUERY /` (ranking, filtering, pagination, ordering, tie-breaking, etc.).

Create the A or CNAME record in the DNS during the first startup process, it implies asking the destination IP or domain in ciprnode.toml.

Implementation of the leech mode.

Improve the texts in the Help page.

Create page "Random Entries" in the ciprface to show randomly selected entries with filtering.

Create the cipr.info HTR with the Specification and a friendly guide to get indexed in the Cipr.

Implement dark mode.

## NOTES

| za            | port |
|---------------|------|
| barriteau.com | 8445 |
| barriteau.net | 8446 |
| barriteau.org | 8447 |
| cipr.info     | 8448 |
| guasa.art     | 8449 |
