# TODO: Pending tasks

Lets work first in the ciprface, we already have the search working with your nice implementation of the `QUERY /` method, now we have to implement the rest of the features of the ciprface. There is already a basic frond-end and we need to improve the search form to include all the features supported by the `QUERY /` method of the CiprAPI, and also we need a beautiful and functional display of the results, lets discuss this plan :)

---

Map view for geolocation.

---

Randomly select a set of $N$ entries from its ciprdup, and send each one of them a `QUERY` request with a random `FTS expression`, a random `Accept:` header of the allowed ones, and random `pages[num]` and `pages[size]` query parameters. This is to validate the correctness of the ranking when retrieving search results.

---

Create the A or CNAME record in the DNS during the first startup process, it implies asking the destination IP or domain, this comes together with the implementation of the leech mode.

---

Promote to Git, binaries distribution in Forgejo? in Codeberg?

---

Possible areas for improvement:

Logging consistency: There is a mix of console.log and logDebug usage. Standardizing on logDebug (or a structured logger) for non-critical information would improve production observability.

Error Handling: The scheduler's broadcast logic (sendPulseRequest) uses a fire-and-forget approach. While efficient, adding a concurrency limit or retry queue could improve reliability at scale.

Variable Scope: A minor issue in main.js where txtUpdated is defined locally within blocks but needed for the scheduler start. This was identified during analysis.

---

The local indexer to create the resindex

---

implementing `QUERY /ZA/` to search in the resindex.

---

Let's work now with the implementation of the `QUERY /ZA/` method of the CiprAPI.

Now we are going to work only in `QUERY /` to search in the resindex using ????.

The features and rules for this search must be exactly the same as the ones for `QUERY /` (ranking, filtering, pagination, ordering, tie-breaking, etc.), only that it won't be made in the database but in the resindex.

---

We need to completely redo/rework/rebuild the Ciprface website, from scratch.

The landing/front/home page (public/index.html) and any other public/*.html MUST BE SERVED as a simple static standard compliant and semantic HTML5 file with the full structure of the entire page: the complete search form, including all inputs and buttons, all the field forms (After, Before, Near to, Radius, and all the Offensiveness Level checkboxes). Also all the placeholders for the later fetched data MUST be in this plain static public/index.html file.

But the landing/front/home page (public/index.html) and any other public/*.html MUST BE GENERATED before serving them, using template and translation files for a clean i18n implementation.

Switching languages must be made through including the expected language in the `Accept-Language:` header of the request, being English the default in case of absence of the mentioned header, which is probably the case for every first load.

There must be a combo-box-like language switcher and the browser must remember the selected language for successive requests.

So, to be clear, once the page is loaded and the user decides to switch the language, the page is entirely reloaded from the server in the language that the `Accept-Language:` header indicates.

The HTMX templates must use the same templating system and same translations files, so async requests using HTMX must include the `Accept-Language:` header.

Again, this entire web site must be smart enough to remember its current state when reloading for language switching, it means that after reloading the entire page from the server in the new language, the form must be refilled with the data present at the moment of switching and anything retrieved using HTMX must be automatically retrieved again.

It is vital the HTMX implementation to be simple, basic, direct, strict, clean, and must not use any additional framework or library, just plain HTMX to directly use the `QUERY /` method of the CiprAPI from the search FORM and display the results. Let me know if this presents any issue and we can discuss it.

This web site must be an installable PWA. Use `public\figures\Cipr Logo Source.png` as the source to generate the favicon.ico and all the necessary PWA icons.

No external CSS frameworks or libraries are to be used, only plain and modern CSS. Use Flexbox and CSS Grid for layout, use CSS variables for colors and spacing.

Ensure the web site is responsive and works well on different devices. Use a mobile-first approach.

The whole design must be extremely basic, minimalistic, clean, simple, direct, strict, and modern.

Implement a dark mode.

For the light and the dark modes, use a black/grey color palette.

Use the provided typography in `public\css\typography` in this way:

- Poller One for H1 titles
- Libertinus Sans Bold for titles from H2 to H6
- Libertinus Serif for body text
- Iosevka for code and preformatted text
- The best choice in `public\css\typography\math` for rendering math formulas

Include a noscript tag to explain the following when javascript is disable: "Using ECMAScript/JavaScript is not optional here because this is a simple client for a diverse network of resources. Without scripting, fetching is not possible. For instance, this tool becomes useless in those conditions."

The header section at the top of the page must include the following sections:

- left side: the ZA covered by the node (e.g. `cipr.info`) linking to home page, `/`.
- center: the number of entries in the ciprdup with the date and time of the last insert in the local ciprdup.
- right side:
  - the language switcher (combo-box-like)
  - the dark/light mode toggle button
  - a link to the ciprnode's help page (`/help`).

  Make the header section sticky.

The footer section must include the following links, all centered and separated with the • symbol:

- API Profile: `/profiles/cipr.json`
- Cipr's foundational site: https://cipr.info/
- PWA installation button (if PWA is not installed but is installable)

Create the header and footer sections as reusable templates to be included when needed in the `public/*.html` files.

Propose a solution to offer tooltips for the form fields and buttons, that can use the implemented templating system and language files, it must be compatible with touch devices.

Create a help page (`/help/index.html`), using the implemented templating system and language files, and the created header and footer templates, with the following sections:

- FAQ
  - What is Cipr?
  - What is a ciprnode?
  - How to use the ciprnode?
  - How to contribute to Cipr?
  - How to install the ciprnode?
  - How to update the ciprnode?
  - How to uninstall the ciprnode?
  - How to get help?
- Source Code
- License
- Privacy Policy
- Terms of Service

Create a first batch of translations for the landing/front/home page and the help page in English (default), Spanish, Italian and Chinese (simplified).

Don't use anything from CDNs, everything must be self-hosted, e.g. the HTMX library.

Suggest me the best options and existing alternatives for template systems and language files considering the given context, prioritize the simplest options, let's discuss it before implementing.

---

Create page "Recent Entries" to show the last 100 entries added to the ciprdup.

## NOTES

| za            | port |
|---------------|------|
| barriteau.com | 8445 |
| barriteau.net | 8446 |
| barriteau.org | 8447 |
| cipr.info     | 8448 |
| guasa.art     | 8449 |

alboro.top
proyec.top
barri.top
barriteau.com
barriteau.net
barriteau.org
cipr.info
guasa.art

Instead of hiding it, show a "No OL"
