# TODO

Legend:

- […] tarea pendiente
- [¿?] tarea que requiere información adicional para ejecutarse
- [¡!] tarea a riesgo de ser descartada
- [🗙] tarea descartada
- [✔] tarea finalizada

## General tasks

- [✔] Completar head en \src\templates\layouts\base.eta
- [✔] move test_words to the root and all [meta_data] to [ciprface] in the .toml
- [✔] Improve the console logging: silent, regular and debugging
- [✔] NO 'using defaults' if config file is not found, error y pajuera (src\core\config.js)
- [✔] [ Search for: | I need: | I offer: ], add columns in ciprdup, change placeholder, change weight of the search accordingly
- [✔] Revisar el autocomplete de location
- [✔] Revisar el validador de los FTS5 expressions en la búsqueda
- [✔] Mover los @media de main.css a media-queries.css
- [✔] Reducir los íconos con media queries
- [✔] Reorder search filters horizontally
- [✔] Hunt every rem in the styles and convert to em
- [✔] Add Ukrainian, Persian (Farsi) and Arabic languages
- [✔] Create all the missing endpoints
- [✔] Review HATEOAS in each endpoint, one by one
- [✔] Update ALPS
- [✔] Update the README.md with the latest changes
- [✔] Create the "Explore" button, it fills the page with random entries from the ciprdup
- [✔] Validate accessibility
- [✔] Reorder footer

- […] Ciprconf, a dead simple desktop app (Taury?) exclusively made to create the ciprnode.toml file
- […] RCU...

## Delayed tasks

- […] Create the A or CNAME record in the DNS during the first startup process, it implies asking the destination IP or domain in ciprnode.toml
- […] Implementation of the leech mode
- […] Implement dark mode

## External tasks

- […] Buy me a coffee to Payoneer?
- […] Finish the HTRGen
- […] Create the cipr.info HTR with the Specification, the usage guide and the FAQ, and publish its ciprnode
- […] Create the guasa.art HTR and publish its ciprnode
- […] Create the juan.barriteau.net and cgt.barriteau.net HTRs and publish their ciprnode
- […] Create a way to receive BTC/USDT/USDC (payments and patronage / pagos y mecenazgo)
  - Don't buy me a coffee, just buy me time, all I need is time ;)
  - non-custodial APIs:
    - [https://nowpayments.io/](https://nowpayments.io/) (0.5% fee)
    - [https://www.blockonomics.co/](https://www.blockonomics.co/) (1% fee)
  - Non-custodial self-hosted APIs:
    - [https://shkeeper.io/](https://shkeeper.io/)
  - Self-hosted payment processors:
    - [https://www.payram.com/](https://www.payram.com/)
    - [https://bitcart.ai/](https://bitcart.ai/)

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
