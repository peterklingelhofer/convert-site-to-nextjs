const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");
const prettier = require("prettier");
const { execSync } = require("child_process");

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

// Function to download and save assets (images, fonts, etc.)
async function downloadAndSaveAsset(url, assetDir, outputDir) {
  const assetUrl = url.startsWith("http")
    ? url
    : url.startsWith("//")
    ? `https:${url}`
    : `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;

  const assetPath = path.join(outputDir, "public", assetDir, path.basename(url));

  try {
    const response = await axios.get(assetUrl, { responseType: "arraybuffer" });
    await fs.ensureDir(path.dirname(assetPath));
    await fs.writeFile(assetPath, response.data);
  } catch (error) {
    console.error(`Failed to download asset: ${assetUrl}`, error);
  }

  // Return the path to be used in CSS/HTML (relative to public)
  return `/${assetDir}/${path.basename(url)}`;
}

// Function to download and save CSS files (and extract fonts/images)
async function downloadAndSaveCss($, outputDir) {
  const cssLinks = [];

  $("link[rel='stylesheet']").each((i, link) => {
    const href = $(link).attr("href");
    if (href) {
      cssLinks.push(href);
    }
  });

  const cssFiles = [];

  for (const cssLink of cssLinks) {
    let cssUrl;
    if (cssLink.startsWith("http")) {
      cssUrl = cssLink;
    } else if (cssLink.startsWith("//")) {
      cssUrl = `https:${cssLink}`;
    } else if (cssLink.startsWith("/")) {
      cssUrl = `${siteUrl}${cssLink}`;
    } else {
      cssUrl = `${siteUrl}/${cssLink}`;
    }

    const cssPath = path.join(outputDir, "styles", path.basename(cssLink));

    try {
      const response = await axios.get(cssUrl);
      let cssContent = response.data;

      // Extract and download font URLs from CSS
      const fontUrls = cssContent.match(/url\(["']?([^"')]+)["']?\)/g);
      if (fontUrls) {
        for (const fontUrl of fontUrls) {
          const cleanedUrl = fontUrl.match(/url\(["']?([^"')]+)["']?\)/)[1];
          const localFontPath = await downloadAndSaveAsset(cleanedUrl, "fonts", outputDir);
          cssContent = cssContent.replace(cleanedUrl, localFontPath);
        }
      }

      // Extract and download images referenced in CSS
      const imageUrls = cssContent.match(/url\(["']?([^"')]+)["']?\)/g);
      if (imageUrls) {
        for (const imageUrl of imageUrls) {
          const cleanedUrl = imageUrl.match(/url\(["']?([^"')]+)["']?\)/)[1];
          const localImagePath = await downloadAndSaveAsset(cleanedUrl, "images", outputDir);
          cssContent = cssContent.replace(cleanedUrl, localImagePath);
        }
      }

      await fs.ensureDir(path.dirname(cssPath));
      await fs.writeFile(cssPath, cssContent);
      cssFiles.push(path.basename(cssLink));
    } catch (error) {
      console.error(`Failed to download CSS file: ${cssUrl}`, error);
    }
  }

  return cssFiles;
}

// Function to parse HTML content and convert to Next.js app directory page
async function convertToNextPage(html, route, cssFiles, outputDir) {
  const $ = cheerio.load(html);

  // Download images
  $("img").each(async (i, img) => {
    const src = $(img).attr("src");
    if (src) {
      const localSrc = await downloadAndSaveAsset(src, "images", outputDir);
      $(img).attr("src", localSrc);
    }
  });

  // Download background images
  $('[style*="background"]').each(async (i, elem) => {
    const style = $(elem).attr("style");
    const bgImageUrlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
    if (bgImageUrlMatch) {
      const bgImageUrl = bgImageUrlMatch[1];
      const localBgImageUrl = await downloadAndSaveAsset(bgImageUrl, "images", outputDir);
      $(elem).attr(
        "style",
        style.replace(bgImageUrl, localBgImageUrl)
      );
    }
  });

  const title = $("title").text();
  const content = $("body").html();

  const cssImports = cssFiles.map((file) => `import '@/styles/${file}';`).join("\n");

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
async function writeNextPage(route, content, outputDir) {
  const filePath = path.join(outputDir, "app", route, "page.tsx");
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

// Function to start the conversion process
async function convertSiteToNextJs(siteName, siteUrl) {
  const outputDir = path.join(process.cwd(), siteName);
  const publicDir = path.join(outputDir, "public");

  // Create Next.js project
  console.log(`Creating Next.js project: ${siteName}`);
  execSync(`npx create-next-app@latest ${siteName}`, { stdio: "inherit" });

  // Download and convert the site
  console.log(`Converting site: ${siteUrl}`);
  const html = await fetchPage(siteUrl);
  if (!html) return;

  const $ = cheerio.load(html);

  // Download and save CSS files
  const cssFiles = await downloadAndSaveCss($, outputDir);

  const links = $("a").map((i, link) => $(link).attr("href")).get();

  // Convert the home page
  const homePageContent = await convertToNextPage(html, "", cssFiles, outputDir);
  await writeNextPage("", homePageContent, outputDir);

  // Convert other pages
  for (const link of links) {
    if (link.startsWith("/") && link !== "/") {
      const pageHtml = await fetchPage(`${siteUrl}${link}`);
      if (pageHtml) {
        // Remove leading slash and get the path without the extension
        const route = link.replace(/^\//, "").replace(/\.[^/.]+$/, "");
        const pageContent = await convertToNextPage(pageHtml, route, cssFiles, outputDir);
        await writeNextPage(route, pageContent, outputDir);
      }
    }
  }

  console.log(`Conversion complete! Check the ${outputDir} directory.`);
}

// Entry point for the script
const [siteName, siteUrl] = process.argv.slice(2);
if (!siteName || !siteUrl) {
  console.error("Usage: node index.js <site-name> <site-url>");
  process.exit(1);
}

convertSiteToNextJs(siteName, siteUrl);
