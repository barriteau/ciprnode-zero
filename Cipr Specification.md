<!-- This document follows the Pandoc Markdown standard -->

# Cipr: Cosmic Index of Public Resources {.root-cover-title}

The *Cosmic^[Because Martians and Belters are welcome.] Index of Public Resources* ―Cipr― is a decentralized, distributed, independent, public, and universal directory of DNS-resolvable web presences, services, and resources.

The Cipr is a potential alternative to the well-established web search engines that modestly-realistically aims to facilitate interaction among bloggers, writers, artists, homelabbers, freelancers, researchers, privacy advocates, decentralization proponents, and members of other expert or focused communities.

This idea is really simple and it's surprising that something like this hasn't been the standard resource indexing system for the World Wide Web since its inception.

The Cipr shares features with conventional search engines, web directories, webrings, expert networks and service directories. The key point is that presence in the Cipr does not require web crawling or the approval of curators, editors or administrators because of its decentralized and user-controlled nature.

With the Cipr, every content publisher *owns* their entries in the index, meaning, they can include, update or exclude them at will. It is the publisher who decides when and how their resource is indexed or not.

The factors that determine the ranking position of search results cannot be obscured in the Cipr, they are standardized, public and auditable.

The equivalent to the SEO activity in the Cipr is very basic, a publisher only needs to use the right and consistent-in-time information about their resources (title, description, keywords, primary language and localization data) to make them visible to their target audience, nothing else.

Censoring, banning, blocking or filtering a Cipr indexed resource is only possible through DNS censoring, banning, blocking or filtering.

The worldwide availability of any inclusion, update or exclusion to the Cipr is expected to take only a few minutes when no less.

Having a website or any other Internet resource effectively indexed in the Cipr is a matter of:

- Owning a domain name, e.g. `example.com`.
- Deploying a simple demon in the Internet: a ciprnode.
- Authorizing your ciprnode to add a couple of records to your DNS zone (or doing it manually).

If you know what comes next in this document and you already own a domain name, grab a binary of **Ciprnode zero**, a ciprnode PoC, and get listed in the Cosmic Index.

― [Binaries on Codeberg](https://codeberg.org/barriteau/Ciprnode-zero/tags/)
― [Binaries on Github](https://github.com/barriteau/ciprnode-zero/releases/latest/)

Please be careful, try it in a safe environment, it's just a PoC.

Ciprnode zero source code:

― [Codeberg](https://codeberg.org/barriteau/Ciprnode-zero/)
― [Github](https://github.com/barriteau/ciprnode-zero/)

## Technical overview

In this specification, a *resource* refers to whatever a zone apex^[Also known as "root" or "naked" domain, your domain name.] points to, as well as any subdomain beneath it, so, any resource that is effectively indexed in the Cipr is referred as a *cipred resource* and identified by its Zone Apex or za, which will always be: `sldl.tldl` (`Second Level Domain` `.` `Top Level Domain`).

The Cipr is built upon a set of software components, network elements, protocols, services, policies, and constraints that ensure its completeness, integrity, availability, responsiveness, accuracy, reliability, and *up-to-dateness*. These components are:

- **Domain Name System**: The existing Internet's naming system.
- **Ciprnodes**: A type of demon whose swarm enables the existence of the Cipr.

A ciprnode is composed of:

  1. **Ciprdup**: Queryable copy of the Cipr in every ciprnode.
  2. **Resindex**: Queryable index of the cipred resource in every ciprnode.
  3. **CiprAPI**: The API exposed in every ciprnode for syncing and searching tasks.
  4. **Ciprpulse**: The automated set of ciprnode-syncing tasks.
  5. **Ciprface**: Web interface to search the Cipr and the existing resindexes.

## Domain Name System

The DNS is the old, trusted, ubiquitous hierarchical and decentralized naming system used to identify resources on the Internet; the Cipr uses it to:

1. **Verify entries existence** by validating their presence in the Domain Name System.
2. **Verify entries correctness** by validating the specifics of a particular TXT record in the Domain Name System.

Extending the verification tasks to any known DNS Root Zone alternative^[Handshake, OpenNIC, Namecoin...] is technically possible, and may even be desirable at some point.

## Ciprnodes

Most of the functions to keep the Cipr running rely on its ciprnodes. A ciprnode is a daemon whose main function is to hold a queryable copy of the Cipr and keep it in sync with all the other copies on the rest of the ciprnodes.

Second function of a ciprnode is to act as an entry point for search requests to the Cipr and the the resource it indexes.

Each ciprnode must be published following this pattern:

`https://ciprnode.{za}`

Where `{za}` is the same as `sldl.tldl`. The literal *ciprnode* **must** be the *third level domain* (3LD) label assigned to the demon, for example:

`https://ciprnode.cipr.info`

**Important note**: For some *country code top-level domains* (ccTLDs) the registration of *second level domains* is restricted or forbidden, this means that resources like `bbc.co.uk`, `up.edu.br` or `ivic.gob.ve` CAN NOT be indexed in the Cipr, this is because allowing ciprnodes under the 3LD allows the inclusion of infinite ciprnodes under a single za.

![ciprsys](_figures/ciprsys.svg)

### 1. Ciprdup

A ciprdup is the working copy of the Cipr in each ciprnode. It's probably ―but not mandatorily― a table or a group of tables in a RDBMS.

The fields ―or columns― of the ciprdup are: `za`, `title`, `description`, `ol`, `latitude`, `longitude` and `timestamp`.

| za             | title             | description       | keywords         | offering | seeking  | primary_lang | ol  | latitude    | longitude   | timestamp    |
|----------------|-------------------|-------------------|------------------|----------|----------|--------------|-----|-------------|-------------|--------------|
| `pali.to`      | `Little Stick`    | `Stick dedicated` | `polo hilo star` | sticks   |          | `es`         |     |             |             | `1698417000` |
| `meansite.com` | `We are Mean`     | `Quite offensive` | `truck ala wing` |          |          | `zh`         | `2` | `407128000` | `407128000` | `1698417000` |
| `foobar.org`   | `The Foobar Zone` | `Foobar`          | `late chupe ola` |          |          | `en`         |     |             |             | `1698417000` |
| `example.com`  | `Example Domain`  | `For examples`    | `rat pote table` |          |          |              |     | `407128000` | `407128000` | `1698417000` |
| `elcoco.buh`   | `Offense For All` | `Fully offensive` | `bit cigar tool` |          |          | `ur`         | `3` |             |             | `1698417000` |
| `cipr.info`    | `Specification`   | `Cipr spec`       | `pose wind pork` |          | RCU devs | `es`         |     | `407128000` | `407128000` | `1698417000` |

Table: Ciprdup fields with example data shown as table rows in a RDBMS:

The fields of the ciprdup are:

#### za

*Zone Apex* of the resource in the Domain Name System.

- **Constrains**:
  - Allowed values/length: `/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u`
  - empty allowed: no.
  - Primary key: yes.
  - FTS searchable: yes.

#### title

The indexed resource's title.

- **Constrains**:
  - Allowed values/length: `/^[^\r\n\u2028\u2029]{1,64}$/u`
  - empty allowed: no.
  - Primary key: no.
  - FTS searchable: yes.

#### description

The resource's description.

- **Constrains**:
  - Allowed values/length: `/^[^\r\n\u2028\u2029]{1,256}$/u`
  - empty allowed: no.
  - Primary key: no.
  - FTS searchable: yes.

#### keywords

Keywords for the resource.

- **Constrains**:
  - Allowed values/length: `/^[^\r\n\u2028\u2029]{1,512}$/u`
  - empty allowed: no.
  - Primary key: no.
  - FTS searchable: yes.

#### offering

 What is offered or shared through the resource.

- **Constrains**:
  - Allowed values/length: `/^[^\r\n\u2028\u2029]{1,128}$/u`
  - empty allowed: yes.
  - Primary key: no.
  - FTS searchable: yes.

#### seeking

What the owner of the resource is looking for.

- **Constrains**:
  - Allowed values/length: `/^[^\r\n\u2028\u2029]{1,128}$/u`
  - empty allowed: yes.
  - Primary key: no.
  - FTS searchable: yes.

#### primary_lang

The primary language for the resource.

- **Constrains**:
  - Allowed values/length: `/^[a-z]{2}$/u`
  - empty allowed: yes.
  - Primary key: no.
  - FTS searchable: no.

#### ol

Offensiveness level, a subjective indicator of how offensive the resource content could be from its publisher's point of view.

Taking as a starting point that in this context a *group* is any community, congregation, circle, clan, league, tribe, collective, gang, faction, union, guild or any other form of association based on: sexual orientation, social position, region, ethnicity, culture, nationality, age, profession, gender identity, political views, religious views, ideological views or any other type of affinity; the possible values for the **ol** field are:

**`NULL`**: *Non Offensive Content*, indicates the content is not offensive to any person or social group.

**`1`**: *Individually Offensive Content*, indicates the content could be offensive to specific individuals, to one or more specific persons not related by any particular type of affinity between them.

**`2`**: *Collectively Offensive Content*, indicates the content could be offensive to two or more members of one or more specific groups.

**`3`**: *Universally Offensive Content*, used when the publisher considers the offensiveness of their content is transversal to most social groups in the whole world.

It is suggested to provide extra information in the description field to clarify why the resource is considered offensive.

- **Constrains**:
  - Allowed values/length: `/^[1-3]$/`
  - empty allowed: yes.
  - Primary key: no.
  - FTS searchable: no.

#### latitude

Geographic latitude of the resource, the integer value resulting of multiplying the real number that represents the latitude coordinate in WGS 84 (EPSG:4326) format by 10000000. The publisher is free to decide the level of precision to use.

- **Constrains**:
  - Allowed values/length: integer in range `[-900000000, 900000000]`
  - empty allowed: yes, only if longitude is also empty.
  - Primary key: no.
  - FTS searchable: no.

#### longitude

Geographic longitude of the resource, the integer value resulting of multiplying the real number that represents the longitude coordinate in WGS 84 (EPSG:4326) format by 10000000. The publisher is free to decide the level of precision to use.

- **Constrains**:
  - Allowed values/length: integer in range `[-1800000000, 1800000000]`
  - empty allowed: yes, only if latitude is also empty.
  - Primary key: no.
  - FTS searchable: no.

#### timestamp

Coordinated Universal Time (UTC) timestamp of the last update of the resource represented with a valid Unix Epoch timestamp (seconds since 1970-01-01T00:00:00Z).

- **Constrains**:
  - Allowed values/length: `/^[\d]{10,12}$/`
  - empty allowed: no.
  - Primary key: no.
  - FTS searchable: no.

### 2. Resindex

A resindex is the indexed content of a cipred resource. The creation of the resindex is the exclusive responsibility of each publisher, how to create it depends on them (Pagefind, YaCy, Meilisearch, LLM/RAG tools, etc.) but, no matter how or when it is generated, the resindex must be queryable through the CiprAPI in a standard way.

The use of a resindex isn't mandatory, but having it is extremely convenient for the publisher; this is an optional but desirable component.

### 3. CiprAPI

CiprAPI is a strict Semantic RESTful Web API used by every ciprnode to:

- Query the ciprdup and the resindex of the ciprnode
- Maintain the ciprdup in sync with the Cipr
- Audit its peers to guarantee the trustability, reliability and up-to-dateness of the Cipr

The CiprAPI supports the following media types for the information exchange:

**HAL**, when the `Accept:` header includes any of the following media types:

- `application/hal+json`
- `application/hal+json; charset=utf-8`

**Plain text**, when the `Accept:` header includes the following media types:

- `text/plain`
- `text/plain; charset=utf-8`

**HTML chunks or fragments**, when the header `HX-Request:` is present and `true`, and the `Accept:` header is absent or present with one of the following media types:

- `*/*`
- `text/html`
- `text/html; charset=utf-8`

**Full HTML with HEAD and BODY tags^[This is basically the ciprface.]**, when the header `HX-Request:` is absent or has `false` value, and the `Accept:` header is absent or includes the following media types:

- `*/*`
- `text/html`
- `text/html; charset=utf-8`

No matter if it is requested or not, UTF-8 must be used always in any response and is assumed as the default charset for any request and response.

The CiprAPI exposes the following endpoints:

- `GET /` - Retrieves the contents of the ciprdup.
- `GET /{za}/` - Retrieves all fields for a specific cipred resource.
- `GET /{za}/title/` - Retrieves the title of a specific cipred resource.
- `GET /{za}/description/` - Retrieves the description of a specific cipred resource.
- `GET /{za}/keywords/` - Retrieves the keywords of a specific cipred resource.
- `GET /{za}/offering/` - Retrieves the offering being made through a specific cipred resource.
- `GET /{za}/seeking/` - Retrieves the seeking being made through a specific cipred resource.
- `GET /{za}/ol/` - Retrieves the value of the offensiveness level of a specific cipred resource.
- `GET /{za}/primary_lang/` - Retrieves the value of the primary language of a specific cipred resource.
- `GET /{za}/latitude/` - Retrieves the latitude of a specific cipred resource.
- `GET /{za}/longitude/` - Retrieves the longitude of a specific cipred resource.
- `GET /{za}/timestamp/` - Retrieves the timestamp of a specific cipred resource.
- `GET /languages/` - Retrieves the contents of the languages database table. Only to be called from the local ciprface.
- `PUT /{za}/` - Adds a new cipred resource to the Cipr.
- `DELETE /{za}/` - Removes a cipred resource from the Cipr.
- `QUERY /` - Queries the ciprdup of the ciprnode with a given `FTS expression+filters`.
- `QUERY /ri/` - Queries the resindex (ri) of the cipred resource with a given `expression`.
- `HEAD /` - Verifies the presence of a ciprnode in the Cipr.
- `HEAD /ri/` - Verifies the presence of a resindex (ri) in the ciprnode.

#### Use of the GET method

A `GET` request to `/` accepts the `pages[size]` and `pages[num]` query parameters, being `size` an integer (n) indicating the expected number of entries per page, and `num` an integer or range indicating which page numbers are expected. A `GET` request to `/{za}/` will retrieve only one row with all the fields for a specific cipred resource or only one row with a specific field. All `GET` endpoints support content negotiation via the `Accept` header. Examples:

This request asks the Cipr to retrieve the full Cipr^[Limits and default pagination settings of the ciprnode will apply.]:

```http
GET /
Host: ciprnode.example.com
```

This request asks the Cipr to retrieve 2048 entries:

```http
GET /?pages[size]=2048 HTTP/1.1
Host: ciprnode.example.com
```

This request asks the Cipr to retrieve the row corresponding to the barriteau.net zone apex as HAL JSON:

```http
GET /barriteau.net/ HTTP/1.1
Host: ciprnode.guasa.art
Accept: application/hal+json
```

```http
HTTP/1.1 200 OK
Content-Type: application/hal+json; charset=utf-8

{
  "za": "barriteau.net",
  "title": "Barriteau",
  "description": "The Barriteau resource",
  "keywords": "barriteau net example",
  "offering": null,
  "seeking": null,
  "ol": null,
  "latitude": null,
  "longitude": null,
  "timestamp": 1698417000,
  "primary_lang": "en",
  "_links": {
    "self": { "href": "/barriteau.net/" },
    "collection": { "href": "/" }
  }
}
```

This request asks the Cipr to retrieve the title of the barriteau.net cipred resource as plain text:

```http
GET /barriteau.net/title/ HTTP/1.1
Host: ciprnode.cipr.info
Accept: text/plain
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

Barriteau
```

This request retrieves the same field as HAL JSON, which includes HATEOAS links to all sibling fields:

```http
GET /barriteau.net/title/ HTTP/1.1
Host: ciprnode.cipr.info
Accept: application/hal+json
```

```http
HTTP/1.1 200 OK
Content-Type: application/hal+json; charset=utf-8

{
  "title": "Barriteau",
  "_links": {
    "self": { "href": "/barriteau.net/title/" },
    "up": { "href": "/barriteau.net/" },
    "description": { "href": "/barriteau.net/description/" },
    "keywords": { "href": "/barriteau.net/keywords/" },
    "offering": { "href": "/barriteau.net/offering/" },
    "seeking": { "href": "/barriteau.net/seeking/" },
    "ol": { "href": "/barriteau.net/ol/" },
    "primary_lang": { "href": "/barriteau.net/primary_lang/" },
    "latitude": { "href": "/barriteau.net/latitude/" },
    "longitude": { "href": "/barriteau.net/longitude/" },
    "timestamp": { "href": "/barriteau.net/timestamp/" }
  }
}
```

This request asks the Cipr to retrieve the list of languages matching with the `q` query parameter. The `/languages/` endpoint is restricted to same-origin requests using the `Sec-Fetch-Site` header:

```http
GET /languages/?q=Spanish HTTP/1.1
Host: ciprnode.cipr.info
Sec-Fetch-Site: same-origin
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[
  {
    "lang_code": "es",
    "lang_name": "Español",
    "lang_name_en": "Spanish"
  }
]
```

#### Use of the PUT method

A `PUT` request to `{za}` will add a new cipred resource to the Cipr if it doesn't exist or update it if it does. The request body must be JSON and must contain at least all the required fields for a cipred resource. The response has no body; the outcome is indicated by the HTTP status code (`202 Accepted` for new entries, for idempotent updates or for self-insertions) and the `Location` header. Example:

```http
PUT /guasa.art/ HTTP/1.1
Host: ciprnode.cipr.info
Content-Type: application/json; charset=utf-8

{
  "za": "guasa.art",
  "title": "La web de los ejemplos",
  "description": "En esta web hay la la la",
  "keywords": "perro gato loro",
  "offering": "ejemplos gratis",
  "seeking": null,
  "primary_lang": "es",
  "ol": null,
  "latitude": 407128000,
  "longitude": 407128000,
  "timestamp": 1698417000
}
```

```http
HTTP/1.1 202 Accepted
Location: /guasa.art/
Content-Length: 0
```

Before proceeding with the effective insertion/update of a `PUT`ed entry in the ciprdup, a ciprnode must execute the **Insertion Validation Sequence**:

0. **Currentness Validation**: check that the value in the `timestamp` field is not older than 24 hours and not more than 5 minutes in the future (to tolerate minor clock skew).
1. **Ownership Validation**: DNS query to check if the TXT record for the new cipred resource exists and is valid.
2. **Availability Validation**: `HEAD /` request to the `https://ciprnode.{za}` to check if the cipred resource is responding.
3. **Reliability Validation**: `QUERY /` to `https://ciprnode.{za}` to validate the correctness of the resource's query results. If the network call fails due to a transient error, this step is bypassed (fails open) to avoid blocking legitimate propagation.

Additional defensive validations are applied before the sequence: rate limiting per IP, body size limits, JSON validity, URL/body `za` consistency, self-update protection, and field-level length limits.

The insertion won't be effective if at least one of the non-bypassed checks fails.

#### Use of the DELETE method

A `DELETE` request to `{za}` will remove a cipred resource from the Cipr if it exists. The response is always `202 Accepted` with no body, regardless of whether the entry was actually deleted or the deletion was rejected because the node passed validation. Self-deletions are silently ignored. Example:

```http
DELETE /example.com/ HTTP/1.1
Host: ciprnode.barriteau.net
```

```http
HTTP/1.1 202 Accepted
Content-Length: 0
```

Before proceeding with the effective deletion of a `DELETE`d entry in the ciprdup, a ciprnode must execute the **Deletion Validation Sequence**:

1. **Ownership Validation**: DNS query to check if the TXT record for the new cipred resource exists and is valid.
2. **Availability Validation**: `HEAD /` request to the `https://ciprnode.{za}` to check if the cipred resource is responding.
3. **Reliability Validation**: `QUERY /` to `https://ciprnode.{za}` to validate the correctness of the resource's query results.

The *Reliability Validation* requires the use of a random `FTS expression` and random `pages[num]` and random `pages[size]` query parameters, it also could reuse FTS expressions received from users of the ciprface, this implies that the ciprnode must be able to store and retrieve FTS expressions received from users of the ciprface.

The deletion of an entry won't be effective if all of the three checks are successfully passed.

#### Use of the QUERY method

A `QUERY /` request must be able to receive the `pages[num]` and `pages[size]` query parameters, being `num` an array of integers (n) and/or ranges (n-m) indicating which page numbers are expected, and `size` an array of integers (n) indicating the expected number of entries per page. For example:

This queries the first page of search results with the number of entries defaulted in the ciprnode's configuration:

```http
QUERY / HTTP/1.1
Host: ciprnode.example.com
Content-Type: text/plain; charset=utf-8
Accept: application/x-www-form-urlencoded; charset=utf-8

query="FTS expression"
ol=[0,1,2,3]
geo_latitude=latitude
geo_longitude=longitude
geo_min_radius_km=radius
geo_max_radius_km=radius
before=timestamp
after=timestamp
```

This queries the fifth page of search results with the number of entries defaulted in the ciprnode's configuration:

```http
QUERY /?pages[num]=5 HTTP/1.1
Host: ciprnode.example.com
Content-Type: text/plain; charset=utf-8
Accept: application/x-www-form-urlencoded; charset=utf-8

query="FTS expression"
ol=[0,1,2,3]
geo_latitude=latitude
geo_longitude=longitude
geo_min_radius_km=radius
geo_max_radius_km=radius
before=timestamp
after=timestamp
```

This queries the first page of search results with 30 entries:

```http
QUERY /?pages[size]=30 HTTP/1.1
Host: ciprnode.example.com
Content-Type: application/hal+json; charset=utf-8
Accept: application/hal+json; charset=utf-8

{
  "query": "FTS expression",
  "ol": [0,1,2,3],
  "geo_latitude": "latitude",
  "geo_longitude": "longitude",
  "geo_min_radius_km": "radius",
  "geo_max_radius_km": "radius",
  "before": "timestamp",
  "after": "timestamp",
  "pages_num": [num],
  "pages_size": [size]
}
```

This queries the first page of search results with 10 entries:

```http
QUERY /?pages[num]=1&pages[size]=10 HTTP/1.1
Host: ciprnode.example.com
Content-Type: application/x-www-form-urlencoded; charset=utf-8
Accept: application/x-www-form-urlencoded; charset=utf-8

query="FTS expression"
&ol=[0,1,2,3]
&geo_latitude=latitude
&geo_longitude=longitude
&geo_min_radius_km=radius
&geo_max_radius_km=radius
&before=timestamp
&after=timestamp
&pages_num=[num]
&pages_size=[size]
```

This queries the second, sixth and tenth pages of search results with 20 entries each:

```http
QUERY /?pages[num]=[2,6,10]&pages[size]=[20] HTTP/1.1
Host: ciprnode.example.com
Content-Type: application/hal+json; charset=utf-8
Accept: application/hal+json; charset=utf-8

{
  "query": "FTS expression",
  "ol": [0,1,2,3],
  "geo_latitude": "latitude",
  "geo_longitude": "longitude",
  "geo_min_radius_km": "radius",
  "geo_max_radius_km": "radius",
  "before": "timestamp",
  "after": "timestamp",
  "pages_num": [num],
  "pages_size": [size]
}
```

This queries the fourth to eighth pages of search results with 10 entries each:

```http
QUERY /?pages[num]=[4-8]&pages[size]=10 HTTP/1.1
Host: ciprnode.example.com
Content-Type: application/x-www-form-urlencoded; charset=utf-8
Accept: application/x-www-form-urlencoded; charset=utf-8

query="FTS expression"
&ol=[0,1,2,3]
&geo_latitude=latitude
&geo_longitude=longitude
&geo_min_radius_km=radius
&geo_max_radius_km=radius
&before=timestamp
after=timestamp
&pages_num=[num]
&pages_size=[size]
```

This queries the eleventh to twentieth and the twenty-first to forty pages of search results with 10 entries the first group and 20 entries the second group:

```http
QUERY /?pages[num]=[11-20,21-40]&pages[size]=[10,20] HTTP/1.1
Host: ciprnode.example.com
Content-Type: application/x-www-form-urlencoded; charset=utf-8
Accept: text/html; charset=utf-8
HX-Request: true

query="FTS expression"
ol=[0,1,2,3]
geo_latitude=latitude
geo_longitude=longitude
geo_min_radius_km=radius
geo_max_radius_km=radius
before=timestamp
after=timestamp
&pages_num=[num]
&pages_size=[size]
```

Note the last one is asking for the results to be returned as HTML fragments instead of JSON.

Example responses to the above requests:

```http
HTTP/1.1 200 OK
Content-Type: application/hal+json; charset=utf-8
Date: Tue, 18 Feb 2026 10:09:00 GMT
Content-Length: 845

{
  "_links": {
    "self": { "href": "/?pages[num]=1" },
    "first": { "href": "/?pages[num]=1" },
    "last": { "href": "/?pages[num]=5" },
    "next": { "href": "/?pages[num]=2" }
  },
  "count": 42,
  "pages[num]": [1],
  "pages[size]": [10],
  "_embedded": {
    "results": [
      {
        "za": "sub.example.com",
        "title": "FTS Expression Guide",
        "description": "A complete guide to Full Text Search expressions.",
        "keywords": "fts query search",
        "offering": null,
        "seeking": null,
        "ol": null,
        "latitude": null,
        "longitude": null,
        "timestamp": 1698417000,
        "primary_lang": "en",
        "score": 12.5,
        "lang_name": "English",
        "lang_name_en": "English",
        "_links": { "self": { "href": "/sub.example.com/" } }
      },
      {
        "za": "blog.example.com",
        "title": "My First FTS Post",
        "description": "Testing the expression engine.",
        "keywords": "blog post test",
        "offering": null,
        "seeking": null,
        "ol": null,
        "latitude": null,
        "longitude": null,
        "timestamp": 1698417055,
        "primary_lang": "en",
        "score": 8.2,
        "lang_name": "English",
        "lang_name_en": "English",
        "_links": { "self": { "href": "/blog.example.com/" } }
      }
    ]
  }
}
```

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Date: Tue, 18 Feb 2026 10:09:00 GMT
Content-Length: 512

<article class="cipr-entry" data-za="sub.example.com">
    <h3><a href="/sub.example.com/">FTS Expression Guide</a></h3>
    <p class="description">A complete guide to Full Text Search expressions.</p>
    <small class="meta">
        <span class="za">sub.example.com</span> •
        <time datetime="2023-10-27T17:10:00Z">2023-10-27</time>
    </small>
</article>

<article class="cipr-entry" data-za="blog.example.com">
    <h3><a href="/blog.example.com/">My First FTS Post</a></h3>
    <p class="description">Testing the expression engine.</p>
    <small class="meta">
        <span class="za">blog.example.com</span> •
        <time datetime="2023-10-27T17:10:55Z">2023-10-27</time>
    </small>
</article>

<nav class="pagination">
    <a rel="prev" href="/?pages[num]=1&pages[size]=10">← Previous</a>
    <span class="current">1</span>
    <a rel="next" href="/?pages[num]=2&pages[size]=10">Next →</a>
</nav>
```

A `QUERY /ri/` request receives a `query` parameter with the search expression. Pagination and filtering are handled internally by each ISE provider according to its own capabilities.

This queries the first page of search results from the resindex with the number of entries defaulted in the ciprnode's configuration:

```http
QUERY /ri/ HTTP/1.1
Host: ciprnode.example.com
Content-Type: text/plain; charset=utf-8
Accept: application/x-www-form-urlencoded; charset=utf-8

query="search expression"
```

Even when desirable, the resindex ranking algorithm for search results doesn't need to adhere to the one specified for the ciprdup/Cipr. Every resource owner is free to implement their own ranking algorithm at their own convenience, they have the last word about what is more relevant for their users when a search query is sent to their resindex.

A ciprnode must provide a set of minimum mechanisms to allow resource owners creating adapters for the `QUERY /ri/` endpoint act as a client to whatever they have as their resource's search system, being it client-side site search tools, static site search tools, lightweight server-side search tools, enterprise/heavyweight search tools, search-as-a-service (hosted) tools, etc.

#### Use of the HEAD method

A `HEAD` request to `/` will verify the presence of a ciprnode in the Cipr. The response includes an `X-Cipr-Count` header with the total number of entries in the ciprdup. Example:

```http
HEAD / HTTP/1.1
Host: ciprnode.example.com
```

```http
HTTP/1.1 200 OK
X-Cipr-Count: 1542
Content-Length: 0
```

A `HEAD` request to `/ri/` will verify the presence of a resindex in a ciprnode. Returns `200 OK` if the node has ISE (Internal Search Engine) providers configured, or `204 No Content` if the resindex is not available. CORS headers are always included to allow cross-origin pings from other ciprnodes:

```http
HEAD /ri/ HTTP/1.1
Host: ciprnode.example.com
```

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: HEAD, OPTIONS
Content-Length: 0
```

Or if no resindex is configured:

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: HEAD, OPTIONS
Content-Length: 0
```

### 4. Ciprpulse

The Ciprpulse is the set of interactions that occurs between ciprnodes with the intention of maintaining the reliability and up-to-dateness of the Cipr. The following values and formulas are of relevance to the Ciprpulse:

**Total number of entries** in the Cipr, obtained by simply counting the number of cipred resources in the Cipr in a given moment.

**Expected propagation time**, the expected time in minutes for any update to be available in the Cipr. It will defaulted to 120000 milliseconds (2 minutes), which is a roughly estimate of the average time for a DNS record to propagate in the DNS system.

**Number of nodes per pulse**, the number of ciprnodes to which a ciprnode needs to send a request that needs to *infect* the whole network in the expected propagation time.

**Deletion Validation Sequence**, as described before, the sequence of checks that a ciprnode must execute before proceeding with the deletion of any entry in the ciprdup (Ownership Validation, Availability Validation and Reliability Validation).

#### Scheduled Actions

Every ciprnode must start the following actions every $I$ milliseconds (where $I$ is the `expected_propagation_time`):

1. **Audit and Propagation**: Randomly select a set of $N$ entries from its ciprdup (excluding self), and apply the full **Deletion Validation Sequence** (Ownership, Availability, and Reliability) to each one. For every resource that passes validation, a `PUT` request with a freshened `timestamp` must be sent to $N$ ciprnodes selected at random from the ciprdup. For every resource that fails its audit, a `DELETE` request must be sent to $N$ ciprnodes selected at random from the ciprdup.

2. **Reliability Checks**: Generate a random FTS expression (using configured `test_words` and captured user search terms), execute it locally as a baseline, then send `QUERY` requests to $N$ randomly selected peers whose `timestamp` is older than 1 hour. Compare results using Jaccard set similarity (threshold ≥ 60%). Peers failing this check are evicted locally and a `DELETE` is propagated.

3. **Self-Validation**: Every $3 \times I$ milliseconds, validate the local node's own configuration. On success, broadcast a `PUT` for the local entry to $N$ random peers. On persistent failure after retries, send a `DELETE` for the node's own `za` to $N$ random peers (self-destruct signal).

### 5. Ciprface

A ciprface is a front-end for the human interaction with the Cipr, its default client application. At least one ciprface must be available in every ciprnode and it must be accesible from any browser as:

`https://ciprnode.{za}`

Non-TLS requests to a ciprface must be always ignored, rejected or redirected.

There are no checks to verify the presence of the ciprface in a ciprnode, so it could be absent or disabled without affecting the ciprnode's reputation, but having an active ciprface has advantages for a ciprnode: the more search queries it processes, the more up-to-date its ciprdup will be.

There is a **minimal set of features** that a ciprface must have in order to be considered compliant with this specification:

1. When accessed via a simple `GET` request, it must display a first list of randomly selected zas from the ciprdup.
2. There must be a form at the top of the page that helps build FTS expressions (e.g. a form with checkboxes) for the operators and text fields for the search terms.
3. Must offer at least one of the following capabilities:
   1. Controls for pagination of `QUERY` results
   2. Controls for *Load More* `QUERY` results
   3. Infinite scroll of `QUERY` results
4. Must be able to *lazy load* the results of querying the user's FTS expression to the resindexes of the different zas being listed in a given moment.

There are no restrictions regarding the use of additional features or elements in the ciprface, as long as they don't conflict with the minimal set of features. The domain holder has the final say about design, UI enhancements, ads, tracking, telemetry, fingerprinting, self-promotion, etc., in a healthy Cipr, the abundance of choices make irrelevant any wrongdoings in a particular ciprface.

The ciprface must also provide a way to specify the order of the search results, for example, by relevance or by age. The number of results per page is configured server-side by the node operator.

## Search expressions

> The proposals in this section are in a very primitive state and probably will need to be revised and improved in future iterations of this document.

Search expressions are used to query the Cipr and the resindexes, they must support standard boolean operators: `AND`, `OR`, `NOT` (uppercase always). Operators must be separated from the search terms by spaces.

### Operators and syntax

| Logic          | Syntax    | Example                  | Meaning                                                                      |
|----------------|-----------|--------------------------|------------------------------------------------------------------------------|
| Implicit `AND` | `(space)` | safety first             | Contains *safety* AND *first*.                                               |
| Explicit `AND` | `AND`     | safety AND first         | Same as above.                                                               |
| `OR`           | `OR`      | safety OR danger         | Contains either *safety*, *danger*, or both.                                 |
| `NOT`          | `NOT`     | safety NOT first         | Contains *safety* but **must not** contain *first*.                          |
| `Grouping`     | `( )`     | (safety OR danger) first | Control precedence: *safety* or *danger* must exist, AND *first* must exist. |

### Matching Patterns (wildcards & phrases)

These define *how* words are matched.

**Prefix Search (`*`):** Matches words starting with a prefix.
`work*` matches *work*, *worker*, *working*, *workplace*.
*Constraint:* The `*` must be at the **end** of the word. You cannot do `*work` or `w*rk`.

**Phrase Search (`" "`):** Matches an exact sequence of words.
`"safety first"` matches the exact phrase. It will **not** match *safety comes first*.

**Initial Token (`^`):** Matches only if the term is the very **first** word in the column.
`^Title` matches *Title of the book* but not *The Title*.

### Column Filters

You can restrict a search term to specific columns in your FTS5 table.

**Single Column:** `colname : term`
`title : linux` (Finds *linux* only in the `title` column).

**Multiple Columns:** `{col1 col2} : term`
`{title body} : linux` (Finds *linux* in either `title` or `body`, ignoring other columns like `author`).

### Proximity Search

Finds words that are close to each other.

**Syntax:** `NEAR(term1 term2, distance)`
**Example:** `NEAR(sqlite database, 10)`
**Meaning:** Find documents where *sqlite* and *database* appear within **10 words** of each other.
**Note:** The order does not matter (unless you strictly enforce it, which `NEAR` generally doesn't; it just checks distance).

## Search results

> The proposals in this section are in a very primitive state and probably will need to be revised and improved in future iterations of this document.

### Ranking

The Okapi BM25 standard must be used to calculate the ranking of the results when searching the Cipr.

### Weighting

A specific set of weights must be used for every one of the fields used for the full-text search:

For any regular search (default):

- za: 32
- title: 16
- description: 8
- keywords: 1
- offering: 1
- seeking: 1

If 'seeking' is prioritized:

- za: 32
- title: 16
- description: 8
- keywords: 1
- offering: 1
- seeking: 32

If 'offering' is prioritized:

- za: 32
- title: 16
- description: 8
- keywords: 1
- offering: 32
- seeking: 1

The proposed weighting model must follow the FTS5 SQLite extension implementation.

### Filtering

It must be possible to filter the results by:

- Inclusion date (timestamp) when a value is provided (a date or a date range).
- Geolocation, distance to a given point when its longitude and latitude are provided.
- Declared Primary Language when a value is provided (a language code).
- Offensiveness level (ol) when one or more values are provided (0-3).

### Ordering / Tie-breaking

In the occurrence of obtaining identical ranking values for certain rows, older entries (earlier timestamps) must be ranked higher.

## Incorporation to the Cipr

The process to incorporate a ciprnode to the Cipr is the same process that allows having an entry on it. In general terms, the following steps must be taken to have a working ciprnode, and a valid entry in the Cipr:

### Ciprnode deployment

This step is done after a ciprnode has been installed and is able to operate as `https://ciprnode.{za}`. It's not that it's yet operating as an effective node in the network.

### Initial configuration

Each ciprnode must be specifically configured before being added to the Cipr. At a minimum, the following parameters must be provided to be stored in a configuration file, database or something similar:

```toml
[network]
# Trusted bootstrap ciprnode to start syncing from
bootstrap_nodes = [
  "https://ciprnode.cipr.info",
  "https://ciprnode.barriteau.net"
]
```

### Ciprdup population

Once the ciprnode is deployed and has its initial configuration, next action is to populate its ciprdup, the retrieval of entries begins with a `GET /` to each one of the configured `bootstrap_nodes` and then it's possible to keep going with the gradually obtained zas.

Note that, even when a `GET /` is a request for the whole Cipr, the response will always be paginated, it might be convenient to ask different nodes for different pages rather than just one.

Of course, it is perfectly possible to simply copy an entire ciprdup from an existing ciprnode and avoid spending time in the sync process, but in this case it is very important to certify the validity of the obtained copy.

### Hash generation

Having a populated ciprdup, the ciprnode must automatically generate the ciprHash, a SHA-256 hash using the existing info in the configuration concatenated using a broken vertical bar (`¦`) just to ease console debugging. Note that numeric values must be converted to strings. For example:

```javascript
ciprHash = createSha256HashFunction(
    za + "¦" + title + "¦" + description + "¦" + keywords + "¦" + offering + "¦" + seeking + "¦" + primary_lang + "¦" + ol + "¦" + geo.latitude + "¦" + geo.longitude
)
```

**Note on numerical and nullable fields:**
When concatenating the string for the hash:

- Missing, empty, or nullable numerical fields (such as `ol`, `geo.latitude`, and `geo.longitude`) must fallback to `"0"`.
- Empty string values (such as an absent `primary_lang`) must fallback to an empty string `""`.
- If fields like `keywords` were provided as an array in the configuration or API payload, they must be joined into a single string separated by a space before being concatenated.

### TXT record creation

By manual or automated means, a `TXT` record must be created in the corresponding DNS Zone namespace, something like:

```yaml
Name: _cipr.{za}
Record Type: TXT
Value: "ciprHash"
TTL: 1800
```

### Ciprpulse activation

At this point the ciprnode is ready to join the Cipr, for this, all the Ciprpulse functions must be activated. Plus, it could be a good idea to promote the ciprface usage, search going through it contributes with the sanity of the newly incorporated ciprnode.

## Tenancy models

Regarding the tenancy preferences, two main types of ciprnode implementations are expected to evolve:

### ST Ciprnode

*Single-tenant oriented* implementations, where everything is though to have the lowest possible hardware requirements and the lowest possible resource consumption. Ideal ST implementations runs smoothly in the simplest homelab, in a very light container, in a SBC or in a Tamagotchi.

No matter what, STs are the ideal implementations because they guarantee distribution, independence and decentralization.

### MT Ciprnode

*Multi-tenant oriented* implementations, where the main goal is to host multiple ciprnodes instances in a single server. This type of implementation probably share the same DBMS/RDBMS under the hood, it's suited to handle a heavy network traffic load so, they are mostly to be deployed in large data centers.

With this type of implementation increases the risk of centralization and the risks to the security of the Cipr, but their existence is justified: they facilitate more publishers having a presence in the Cipr.

## Known Limitations

The following issues are known and structurally understood. They represent open design problems in the Cipr protocol itself, not bugs in this implementation.

### No Defense Against Spam or Sybil Attacks

The protocol is fully permissionless: anyone with a registered domain can join the index. Domain registration costs are low (free TLDs exist), deployment is trivially scriptable.

**No code change in this implementation can solve this**. It requires a protocol-level design decision: potential mitigations include per-domain trust scoring, domain age signals, proof-of-work, or moderation layers: all of which involve trade-offs with the permissionless, decentralized model.

### DNS as the Sole Authorization Mechanism

The `_cipr.{za} TXT` record is the only credential that proves a ciprnode's identity to the network. DNS is controlled by registrars, registries, and ICANN: all subject to legal pressure, terms-of-service enforcement, and political interference.

- A single court order to a registrar can silently remove a node's TXT record, causing all peers to evict it automatically within one or two pulse cycles.
- Nodes in jurisdictions that block major DoH providers (China, Iran, Russia block Cloudflare, Google, Quad9) cannot complete Triple Validation on incoming PUTs. They become isolated from the rest of the network.
- The Zone Apex (`sldl.tldl`) format requirement structurally excludes all path-based resources, shared subdomains, and most 2nd-level ccTLDs (`.co.uk`, `.edu.br`, etc.).

### No Economic or Reputational Incentive to Run a Node

Operating a ciprnode could cost money (VPS, domain registration, bandwidth) and time (setup, maintenance, security). The benefit is one entry in the Cipr and participation in maintaining the index. There is no monetary return, no reputation mechanism outside the Cipr, and no network effect until adoption is meaningful.

## Epilogue

The Cipr is an addition to the existing searching and indexing ecosystem: crawlers, spiders, meta search engines, indexers, aggregators, web directories, link directories, RSS directories, webrings and similar tools can interact with the Cipr, depending on the use case and the level of adoption, the Cipr could be an alternative, a companion, a competitor or a replacement to any of those tools, time will tell.

Juan Barriteau
