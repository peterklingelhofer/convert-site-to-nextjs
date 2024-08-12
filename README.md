## convert-site-to-nextjs

Convert any static website to NextJS, importing HTML and styles. It will require some tweaking afterwards, but I'm seeing immediate performance increases in Lighthouse of 35 using this technique.

## Getting Started

Install [NodeJS](https://nodejs.org/en/download/package-manager).

Then install any project dependencies:

```sh
npm install
```

Then create your NextJS project and import the static site:

```sh
npm run start --site-name=my-nextjs-site --site-url=https://www.sitetoimport.com
```

This script works best if you choose these NextJS options:

✔ Would you like to use TypeScript? … No / <ins>**Yes**</ins>

✔ Would you like to use ESLint? … No / <ins>**Yes**</ins>

✔ Would you like to use Tailwind CSS? … <ins>**No**</ins> / Yes

✔ Would you like to use `src/` directory? … <ins>**No**</ins> / Yes

✔ Would you like to use App Router? (recommended) … No / <ins>**Yes**</ins>

✔ Would you like to customize the default import alias (@/*)? … <ins>**No**</ins> / Yes


Then, follow the Readme in the NextJS directory to run your NextJS website.
