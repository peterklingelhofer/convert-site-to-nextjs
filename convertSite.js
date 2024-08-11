const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");
const prettier = require("prettier");

const siteUrl = "https://www.site.com"; // Update this URL to target the site you want to convert
const outputDir = "imported-site";

// Function to fetch HTML content from a URL
async function fetchPage(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    return null;
  }
}

// Function to download and save CSS files
async function downloadAndSaveCss($) {
  const cssLinks = [];
  $("link[rel='stylesheet']").each((i, link) => {
    const href = $(link).attr("href");
    if (href) {
      cssLinks.push(href);
    }
  });

  for (const cssLink of cssLinks) {
    // Handle different types of URLs
    let cssUrl;
    if (cssLink.startsWith("http")) {
      // Full URL (e.g., https://example.com/styles.css)
      cssUrl = cssLink;
    } else if (cssLink.startsWith("//")) {
      // Protocol-relative URL (e.g., //example.com/styles.css)
      cssUrl = `https:${cssLink}`;
    } else if (cssLink.startsWith("/")) {
      // Root-relative URL (e.g., /styles.css)
      cssUrl = `${siteUrl}${cssLink}`;
    } else {
      // Relative URL (e.g., styles.css)
      cssUrl = `${siteUrl}/${cssLink}`;
    }

    const cssPath = path.join(outputDir, "styles", path.basename(cssLink));

    try {
      const response = await axios.get(cssUrl);
      await fs.ensureDir(path.dirname(cssPath));
      await fs.writeFile(cssPath, response.data);
    } catch (error) {
      console.error(`Failed to download CSS file: ${cssUrl}`, error);
    }
  }

  return cssLinks.map((link) => path.basename(link));
}

// Function to parse HTML content and convert to Next.js app directory page
async function convertToNextPage(html, route, cssFiles) {
  const $ = cheerio.load(html);
  const title = $("title").text();
  const content = $("body").html();

  const cssImports = cssFiles
    .map((file) => `import '@/styles/${file}';`)
    .join("\n");

  const nextPageContent = `
    import Head from 'next/head';
    import { FC } from 'react';
    ${cssImports}

    const Page: FC = () => {
      return (
        <>
          <Head>
            <title>${title}</title>
          </Head>
          <div dangerouslySetInnerHTML={{ __html: \`${content}\` }} />
        </>
      );
    };

    export default Page;
  `;

  // Await prettier to format the content before returning
  return prettier.format(nextPageContent, { parser: "typescript" });
}

// Function to write the converted page to disk
async function writeNextPage(route, content) {
  const filePath = path.join(outputDir, "app", route, "page.tsx");
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

// Function to start the conversion process
async function convertSiteToNextJs(url) {
  // Clear and setup the output directory
  await fs.emptyDir(outputDir);
  await fs.ensureDir(path.join(outputDir, "app"));
  await fs.ensureDir(path.join(outputDir, "styles"));

  const html = await fetchPage(url);
  if (!html) return;

  const $ = cheerio.load(html);

  // Download and save CSS files
  const cssFiles = await downloadAndSaveCss($);

  const links = $("a")
    .map((i, link) => $(link).attr("href"))
    .get();

  // Convert the home page
  const homePageContent = await convertToNextPage(html, "", cssFiles);
  await writeNextPage("", homePageContent);

  // Convert other pages
  for (const link of links) {
    if (link.startsWith("/") && link !== "/") {
      const pageHtml = await fetchPage(`${siteUrl}${link}`);
      if (pageHtml) {
        // Remove leading slash and get the path without the extension
        const route = link.replace(/^\//, "").replace(/\.[^/.]+$/, "");
        const pageContent = await convertToNextPage(pageHtml, route, cssFiles);
        await writeNextPage(route, pageContent);
      }
    }
  }

  console.log(`Conversion complete! Check the ${outputDir} directory.`);
}

// Run the conversion
convertSiteToNextJs(siteUrl);
