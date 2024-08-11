## convert-site-to-nextjs

Convert any static website to NextJS, importing HTML and styles. It will require some tweaking afterwards, but I'm seeing immediate performance increases in Lighthouse of 35 using this technique.

## Getting Started

Install [NodeJS](https://nodejs.org/en/download/package-manager).

Update url and output directory in `convertSite.js`.

Import your desired site:
```bash
node convertSite.js
```

Then run `npx create-next-app@latest site-name`

This script works best if you choose these NextJS options:

✔ Would you like to use TypeScript? … No / **Yes**
✔ Would you like to use ESLint? … No / **Yes**
✔ Would you like to use Tailwind CSS? … **No** / Yes
✔ Would you like to use `src/` directory? … **No** / Yes
✔ Would you like to use App Router? (recommended) … No / **Yes**
✔ Would you like to customize the default import alias (@/*)? … **No** / Yes




Copy the outputted files in the site import directory to the app folder to the app folder in the new NextJS app directory. Add the styles folder to the same directory level as the app folder as well. Then, follow the Readme in the NextJS directory to run your NextJS website.
