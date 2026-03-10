# TODO

Legend:

[…] tarea pendiente
[¿?] tarea que requiere información adicional para ejecutarse
[¡!] tarea a riesgo de ser descartada
[🗙] tarea descartada
[✔] tarea finalizada

## General tasks

- [✔] Completar head en \src\templates\layouts\base.eta
- [] move test_words to the root and all [meta_data] to [ciprface] in the .toml
- […] Improve the console logging: silent, regular and debugging

We are totally changing the way we log and debug the application. Understand that good logging in the console and in files is a desired feature of this application. We need to be able to see in the console what is happening in realtime when the app is running.

I've added the `log_level` value, it can be 0, 1 or 2, where:

- 0: silent, nothing is shown in the console.
- 1: operational, the following is shown in the console:
  - *Application Startup Sequence* messages
  - *Server Startup Sequence* messages
  - DNS requests
  - Outgoing HTTP requests are shown in the console
- 2: verbose, the following is shown in the console:
  - *Application Startup Sequence* messages
  - *Server Startup Sequence* messages
  - DNS requests
  - Outgoing HTTP requests are shown in the console
  - Incoming HTTP requests

The `debug` value now have a different function, when `true`, it instructs the app to write to the log files, in the /logs/ folder, the exact same output of the log_level = 2, verbose.

`debug = true` is independent of the `log_level`, meaning, if `log_level = 0` and `debug = true` nothing is shown in the console but the following is written to the log files:

- *Application Startup Sequence* messages
- *Server Startup Sequence* messages
- DNS requests
- Outgoing HTTP requests are shown in the console
- Incoming HTTP requests

The log files must rotate in a size-based manner when the file hits a coherent threshold (e.g., 256 MB) and also they must rotate in a time-based manner, non currently written logs older than 24 hours must be deleted.

The logs currently written to the /data/ folder and their generating code are to be removed from the app.

I created a couple of bare bones functions named `line()` and `msg()` in \src\core\utils.js to be used for logging in the console (not for log files). Those functions are using CSS Substitutions to add color and styles in the console, you are going make them detect which environment the app is running in (browser console, bash, zsh, PowerShell, Node.js, Deno...) and automatically apply the corresponding styling method (CSS Substitutions, ANSI Escape Codes, Cmdlet Parameters, ANSI...).

Once you finish optimizing the functions I created and creating the code need to write log files as described, you are going to find every single console.*() in the code, you'll explain me the context it is and what it shows, and you are going to ask me for every one of them how it will show.

We have 4 message groups and this is my suggestion on how to show them in the console and print them in the log files:

### Application Startup messages format

The Application Startup Sequence messages must be shown almost in the same way they are being shown now, e.g.:

```bash
░█▀█ ░▀ ░█▀█ ░█▀█ ░█▄░█ ░█▀█ ░█▀▄ ░█▀▀
░█   ░█ ░█▄█ ░█▄▀ ░█░▀█ ░█░█ ░█░█ ░█▀
░█▄█  ▀  ▀    ▀ ▀  ▀  ▀  ▀▀▀  ▀▀   ▀▀▀
         ░▀▀█ ░█▀▀ ░█▀█ ░█▀█
         ░▄▀░ ░█▀  ░█▄▀ ░█░█
          ▀▀▀  ▀▀▀  ▀ ▀  ▀▀▀
     A ciprnode proof of concept

 Application Startup Sequence

1. Configuration file validation...

  za (Zone Apex)              [OK] Valid
  Title                       [OK] Valid
  Description                 [OK] Valid
  Keywords                    [OK] Valid
  Primary Language            [OK] Valid
  Offensiveness Level         [OK] Valid
  Coordinate Consistency      [OK] Valid
  Latitude Value              [OK] Valid
  Longitude Value             [OK] Valid
  Expected Propagation Time   [OK] Valid
  Page Size                   [OK] Valid
  Test Words                  [WARN] Ignored Invalid Configuration
  Parent URL                  Skipped (None provided)
  ISE Providers               Skipped (None provided)
  [OK] All checks passed

  Summary:
  Environment        dev
  Debug Mode         true
  Zone Apex          cipr.info
  Port               8448
  DNS Provider       cloudflare
  Propagation Time   120000ms
  Do53 Servers       31
  DoH Servers        52
  [OK] The Configuration File is okay and loaded

2. Extracting ciprHash for the current configuration...
  String to hash: cipr.info¦Cipr: Cosmic Index of Public Resources¦all you need to know about the Cipr¦info información information help ayuda guide guía índice index cipr ciprnode ciprdup ciprapi¦en¦2¦104806000¦-669036000
  Hash: cb74ce9d4ba3222fc8bede07920c5a5b8f9e0da56571ebe9ceae51ff0c2baca1

3. Ciprdup (local database) connection...
  Database connection established at: D:\Proyectos_VSCode\Cipr\ciprnodes\cipr.info\data\ciprdup.db
  [OK] Database connected & schema verified

4. Ciprnode synchronization...
  [OK] Database already populated, skipping initial sync.

5. Configured za verification...
  An entry for cipr.info has been found, validating it...
  String to hash: cipr.info¦Cipr: Cosmic Index of Public Resources¦all you need to know about the Cipr¦info información information help ayuda guide guía índice index cipr ciprnode ciprdup ciprapi¦en¦2¦104806000¦-669036000
  [OK] Local database matches ciprnode.toml configuration.

6. DNS entry verification...
  Attempt 1/8 Starting...
  Selected Do53 resolver: 1.1.1.1
  Validating via:
    1. ordns.he.net
    2. adfree.usableprivacy.net
    3. odvr.nic.cz
  Found in them:
    1: cb74ce9d4ba3222fc8bede07920c5a5b8f9e0da56571ebe9ceae51ff0c2baca1
    2: cb74ce9d4ba3222fc8bede07920c5a5b8f9e0da56571ebe9ceae51ff0c2baca1
    3: cb74ce9d4ba3222fc8bede07920c5a5b8f9e0da56571ebe9ceae51ff0c2baca1
  Triple Validation Successful
  The hash cb74ce9d4ba3222fc8bede07920c5a5b8f9e0da56571ebe9ceae51ff0c2baca1 was found in all servers.
  [OK] Cipr Entry in the DNS Verified

The Startup Sequence has completed.
Duration: 13.05s
```

If the debug level is 1 or 2, also incoming and/or outgoing dns/http request are to be shown in between

### Server Startup Sequence messages format

The Server Startup Sequence messages must be shown almost in the same way they are being shown now, e.g.:

```bash
       Server Startup Sequence

Locally listening on http://0.0.0.0:8448/

Verifying reachability for ciprnode.cipr.info...
Verifying HTTP HEAD (Attempt 1/6): https://ciprnode.cipr.info/...
This Ciprnode is reachable via https://ciprnode.cipr.info/

█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
█     Welcome to the Cosmic Index of Public Resources     █
█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

Starting Ciprpulse scheduler...
[Ciprpulse] Scheduler interval set to 120000ms
[Ciprpulse] Self-validation interval set to 360000ms
```

If the debug level is 1 or 2, also incoming and/or outgoing dns/http request are to be shown in between

### DNS requests

e.g.:

DNS request:
  To: doh.example.com
  Incoming Response: {response}

### Outgoing HTTP requests format

e.g.:

Outgoing request:
  Method: QUERY
  Path: /
  To: ciprnode.example.com
  Incoming Response: 200

### Incoming HTTP requests format

e.g.:

Incoming request:
  Method: HEAD
  Path /
  From: ciprnode.example.com
  Outgoing Response: 200


- […] Reorder footer
- […] Review HATEOAS in each endpoint, one by one
- […] Create the "Explore" page with random entries from the ciprdup
- […] Create the A or CNAME record in the DNS during the first startup process, it implies asking the destination IP or domain in ciprnode.toml
- […] Implementation of the leech mode
- […] Add Ukrainian, Farsi and Arabic languages
- […] Implement dark mode
- […] Update ALPS
- […] Update the README.md with the latest changes
- [🗙] Improve the texts in the "Help" page

## External tasks

- […] Finish the HTRGen
- […] Create the cipr.info HTR with the Specification, the usage guide and the FAQ, and publish its ciprnode
- […] Create the guasa.art HTR and publish its ciprnode
- […] Create the juan.barriteau.net and cgt.barriteau.net HTRs and publish their ciprnode
- […] Simple self hosted payment processor for mecenazgo with cryptomoney

## Special tasks

### Diaporama

To create a photo comic (fumetti, photonovel, picture movie; in Spanish: diaporama, fotonovela, fotohistoria...) I want you to create a sequence of 9 images as described bellow.

**Global Settings**:

- All elements must be simple and minimalistic 3D isometric drawings.
- Images format: webp or something better, if there is such thing, to create an eventual slide show in a website with all the pictures.
- Dimensions: images must looks sharp in a 4K screen but also must be readable in a tablet or big screen smartphone.
- The background color must be #fefefe.
- Use vivid colors, and friendly, amusing, comical characters.
- Save everything to /src/figures/diaporama/

Lets say every one of the 9 images is a scene, so here is the description for each one of them:

**Scene #1**:

A figurative representation of the Internet is shown, it consist of a bunch of cubes with rounded corners in different colors, they must look like interacting between themselves by exchanging tiny dots over connecting lines that represent their communication links.

The surface of each cube has a banner or icon about what it represent: Some are servers, routers and switches; others are protocols, languages and Internet systems (TCP/IP, FTP, UDP, SSH, HTTP, HTML, JS, CSS, DNS...); others represent ISPs, the W3C, the FSF, government agencies, cloud providers, social media providers, search engine providers, browsers, APIs, etc. You need to figure out how to fit in every cube an icon that tells what the cube represents.

Beneath all of the interacting cubes, in the bottom right of the scene, is an isolated cube, the Cipr cube, this one has only a #333333 colored circle (the Cipr logo) as its icon, this cube is not communicating with the others, is apart, partially covered in cobwebs, abandoned, forgotten.

**Scene #2**:

Here the Scene #2 stays in place, nothing changes except that a tiny guy appears like he stumbled upon the dusty Cipr cube. This tiny guy is Juan, he is a mulato person, all salt-and-pepper-haired, afro hairstyle, thick beard, black t-shirt, jeans and grey shoes.

**Scene #3**:

Everything remains as in Scene #2, except that now a laptop computer appears in front of Juan and he looks like typing on it.

**Scene #4**:

Everything remains as in Scene #3, but now a small sphere with the text `cn0` floats over the laptop, like it just emerged from it.

**Scene #5**:

In this scene the cobwebs are gone and the Cipr cube now links to the little `cn0` sphere and also links to the other cubes of the existing ones.

**Scene #6**:

Here everything is gone except for Juan in the top left of the scene with his little `cn0` sphere floating in front of him, and the Cipr cube in the top center of the scene.

The following text pops from the tiny `cn0` sphere: "ciprnode.cipr.info".

The tiny sphere of Juan is now linked to the Cipr cube. The Cipr cube includes a first unintelligible line of text, which represents its first entry ever.

**Scene #7**:

Juan is in the same position as in Scene #6, the Cipr cube is also in the same position, but now is a bit taller cuboid (rectangular prism) and includes a second unintelligible line of text representing it's second entry.

In the top right of the scene now we have another tiny person, a woman holding another tiny `cn0` sphere in her hand, the following text pops from her tiny `cn0` sphere: "ciprnode.jane-blog.com". Her sphere is also linked to the Cipr cube.

**Scene #8**:

This is the same as Scene #7, but now the Cipr cube is a bit taller cuboid and includes a third unintelligible line of text.

A third tiny person in the left center of the scene is present, an executive-looking man holding another tiny `cn0` sphere in his hand also linked to the cuboid. The following text pops from his tiny `cn0` sphere: "ciprnode.bill-business.com".

**Scene #9**:

This is the same as Scene #8, but now the Cipr cube is a bit more taller cuboid and includes a fourth unintelligible line of text.

A fourth tiny person in the right center of the scene is present, a young tattoo artist woman holding another tiny `cn0` sphere in her hand also linked to the cuboid. The following text pops from her tiny `cn0` sphere: "ciprnode.ana-tatu.art".

---

**Scene #1** legend:

Since appearing, this whole scene have the following text as a legend in the bottom:

«The Cipr has existed since the inception of the Internet, but it was empty and overlooked until it was recently discovered by accident.»

sCENE..

The legend on the bottom on this scene says:

«The tiny guy realized that using the Cipr required a simple piece of software that didn't yet exist, so he programmed a proof of concept for it: the Ciprnode zero (cn0).»

The legend at the bottom for this scene is:

«Once the first ciprnode was created, every domain name owner can grab a copy, deploy it and get indexed in the Cipr.»

A final text appears in the center of the scene:

«Now, instead of complaining, you can just move on ;)»

---
