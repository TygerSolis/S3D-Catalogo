# S3D — Digital 3D Printing Product Catalog

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Website-2563eb?style=for-the-badge)](https://tygersolis.github.io/S3D-Catalogo/)
[![GitHub](https://img.shields.io/badge/Source-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/TygerSolis/S3D-Catalogo)

A responsive, media-rich product catalog developed for **S3D**, a 3D printing business. The site combines product discovery, rich media presentation and direct WhatsApp conversion in a single front-end experience.

## Live Demo

**[https://tygersolis.github.io/S3D-Catalogo/](https://tygersolis.github.io/S3D-Catalogo/)**

## Highlights

- Dynamic catalog powered by structured JSON data
- 87 products organized across multiple collections and categories
- Product search, category filtering and sorting
- Multi-image product galleries
- Product-specific video presentation for selected items
- AVIF/WebP image delivery through responsive `<picture>` elements
- Lazy-loaded images and video metadata
- Direct WhatsApp contact and purchase inquiries
- Responsive desktop and mobile layout
- SEO metadata, canonical URL and Open Graph/Twitter cards
- Schema.org structured data
- Printable A4 catalog layout
- Embedded business location map

## Architecture

The solution separates product content from interface logic:

`productos.json` → product catalog and media references  
`catalogo.js` → product loading, state, filtering, rendering and media interaction  
`index.html` → page structure, SEO and business content  
`styles.css` → custom design system, responsive behavior and print styles  
`assets/` → product images, videos, logos and visual resources

## Technologies

- HTML5
- CSS3
- JavaScript (ES6+)
- Tailwind CSS
- JSON
- AVIF / WebP / MP4
- Lucide Icons
- GitHub Pages
- WhatsApp deep-link integration

## Technical Highlights

### JSON-driven product architecture

Product information is maintained independently from the HTML. JavaScript loads the data and generates the catalog dynamically, making content updates easier to manage.

### Optimized image delivery

Product imagery supports modern formats such as **AVIF and WebP**, with lazy loading and `<picture>` sources to reduce unnecessary transfer and improve the browsing experience.

### Rich product media

Selected products can include multiple images and video. The front-end provides an interactive media viewer so visitors can inspect products without leaving the catalog.

### Conversion-oriented UX

The interface combines discovery, product information and direct WhatsApp contact so a visitor can move from browsing to inquiry with minimal friction.

### Print-ready output

The page includes dedicated print rules for generating a clean A4 product catalog, extending the same digital catalog into a printable sales asset.

## Project Structure

```text
S3D-Catalogo/
├── assets/
├── catalogo.js
├── index.html
├── productos.json
└── styles.css
```

## Purpose

This project demonstrates how a small business can use a lightweight web application as a **digital storefront and sales catalog**, while keeping product content manageable and the interface responsive across devices.

---
Built by **Itamar Solis**

## Performance tooling

The repository includes `scripts/optimize_videos.py`, a reusable FFmpeg script that transcodes referenced MP4 files to H.264 with `faststart`, scales oversized sources to a practical web resolution and updates repository references. Product videos are also configured to load on demand rather than preloading large media for every card.

## Portfolio Focus

**Business problem:** turn a 3D-printing product collection into a digital storefront that combines product discovery, rich media and direct customer contact.

**Engineering focus:** JSON-driven rendering, responsive media galleries, AVIF/WebP images, deferred video loading, SEO, accessibility, print styles and WhatsApp conversion.
