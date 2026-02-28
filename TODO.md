# TODO: Pending tasks

Improve the console logging: silent, regular and debugging.

---

# Reliability Validation

Having *Ownership Validation* and *Availability Validation*, now we are creating a *Reliability Validation*, its goal is to prove the ranking of results to a `QUERY` requests is consistent among all ciprnodes, meaning, to validate the correctness of the ranking when retrieving search results.

Steps to do this:

1. Randomly select a set of $N$ entries from the ciprdup, and send each one of them a `QUERY` request with a random `FTS expression`, and random but coherent and between the allowed limits `pages[num]` and `pages[size]` query parameters.

2. To build every FTS expression, a function dedicated to it must do the following:

- create a *test string* randomly selecting a random number of words from the following sources:
  - The words in the newly introduced `test_words` variable in `ciprnode.toml`.
  - Words extracted from the FTS expressions received in local requests sent to any `QUERY /` endpoint from the ciprface. Those words must be saved in memory, with a modest amount of kilobytes, just enough to save around 1024 words, this is not to be saved in any permanent storage.
- Randomly include one, two or three validly positioned FTS operators to 5-15% of the generated test strings, this means that only 85-95% of the test FTS expressions will contain only the flat test string without operators.

3. Once the FTS expression is built and sent in the different test `QUERY` requests as stated in #1, the received responses from the different ciprnodes must be compared to stablish if the results are the same, certain level of tolerance mus be allowed, so if two responses are not identical but very similar, the validation must pass. The only inaceptable deviation is the one occurring in the first 8 results, if they are not the same, the validation must fail. Give me a detailed description of how you propose to implement the comparison of results, remember the point here is detect cheating or misconfigured ciprnodes.

4. For the failing nodes, the ciprnode must send a `DELETE` request to a randomly selected set of $N$ entries from the ciprdup.

Important: The Reliability Validation is to be part of the ciprpulse, is not intended to be used during the startup process.

Please, give me a detailed description of how you propose to implement the Reliability Validation, I want to understand it before you implement it, and I want to be able to change it later if I want to, triple check everything I'm proposing, I want to be sure that it's correct and that it will work as expected, I want your suggestions about possible improvements, and I want you to point out any potential problems you see with my proposal. Remember we need to keep the ciprdup small, low memory usage, low CPU usage, low disk usage, low bandwidth usage, low everything usage.

Confirm me the modularity of the *Ownership Validation*, *Availability Validation*, and now the *Reliability Validation*, remember they need to be independent, reusable, easy to test and centralized.

Remember to follow all the coding guidelines stated at the AGENTS.md file.

---

Implement Pagefind (<https://pagefind.app/>) in the HTR and use the created index as the resindex.

Implement `QUERY /za/` to search in the resindex, it mimics `QUERY /` (ranking, filtering, pagination, ordering, tie-breaking, etc.).

Create the A or CNAME record in the DNS during the first startup process, it implies asking the destination IP or domain in ciprnode.toml.

Implementation of the leech mode.

Improve the texts in the Help page.

Create page "Random Entries" in the ciprface to show randomly selected entries with filtering.

Create the cipr.info HTR with the Specification and a friendly guide to get indexed in the Cipr.

Implement dark mode.

Complete `GET /languages/` and `GET /za/language/` sections in the Spec

## NOTES

| za            | port |
|---------------|------|
| barriteau.com | 8445 |
| barriteau.net | 8446 |
| barriteau.org | 8447 |
| cipr.info     | 8448 |
| guasa.art     | 8449 |
