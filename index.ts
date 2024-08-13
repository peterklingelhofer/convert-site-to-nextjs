import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";

// Function to fetch HTML content from a URL
async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

// Function to sanitize filenames by removing query parameters and encoding special characters
function sanitizeFilename(url: string): string {
  return path.basename(url.split("?")[0]);
}

// Function to download and save assets (images, fonts, etc.)
async function downloadAndSaveAsset(
  url: string,
  outputDir: string
): Promise<string> {
  // Skip data URLs
  if (url.startsWith("data:")) {
    return url;
  }

  const assetUrl = url.startsWith("http")
    ? url
    : url.startsWith("//")
    ? `https:${url}`
    : `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;

  const assetPath = path.join(outputDir, "public", sanitizeFilename(url));

  try {
    const response = await axios.get(assetUrl, { responseType: "arraybuffer" });
    await fs.ensureDir(path.dirname(assetPath));
    await fs.writeFile(assetPath, response.data);
    console.log(`Retrieved: ${path.relative(process.cwd(), assetPath)}`);
  } catch (error: any) {
    console.error(`Failed to download asset: ${assetUrl}`, error.message);
  }

  // Return the path to be used in CSS/HTML (relative to public)
  return `/${sanitizeFilename(url)}`;
}

// Function to download and save CSS files (and extract fonts/images)
async function downloadAndSaveCss(
  $: cheerio.CheerioAPI,
  outputDir: string
): Promise<string[]> {
  const cssLinks: string[] = [];

  $("link[rel='stylesheet']").each((i, link) => {
    const href = $(link).attr("href");
    if (href) {
      cssLinks.push(href);
    }
  });

  const cssFiles: string[] = [];

  for (const cssLink of cssLinks) {
    let cssUrl: string;
    if (cssLink.startsWith("http")) {
      cssUrl = cssLink;
    } else if (cssLink.startsWith("//")) {
      cssUrl = `https:${cssLink}`;
    } else if (cssLink.startsWith("/")) {
      cssUrl = `${siteUrl}${cssLink}`;
    } else {
      cssUrl = `${siteUrl}/${cssLink}`;
    }

    const cssPath = path.join(outputDir, "styles", sanitizeFilename(cssLink));

    try {
      const response = await axios.get(cssUrl);
      let cssContent = response.data;

      // Extract and download font URLs from CSS
      const fontUrls = cssContent.match(/url\(["']?([^"')]+)["']?\)/g);
      if (fontUrls) {
        for (const fontUrl of fontUrls) {
          const cleanedUrl = fontUrl.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
          if (cleanedUrl) {
            const localFontPath = await downloadAndSaveAsset(cleanedUrl, outputDir);
            cssContent = cssContent.replace(cleanedUrl, localFontPath);
          }
        }
      }

      // Extract and download images referenced in CSS
      const imageUrls = cssContent.match(/url\(["']?([^"')]+)["']?\)/g);
      if (imageUrls) {
        for (const imageUrl of imageUrls) {
          const cleanedUrl = imageUrl.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
          if (cleanedUrl) {
            const localImagePath = await downloadAndSaveAsset(cleanedUrl, outputDir);
            cssContent = cssContent.replace(cleanedUrl, localImagePath);
          }
        }
      }

      await fs.ensureDir(path.dirname(cssPath));
      await fs.writeFile(cssPath, cssContent);
      cssFiles.push(sanitizeFilename(cssLink));
    } catch (error: any) {
      console.error(`Failed to download CSS file: ${cssUrl}`, error.message);
    }
  }

  return cssFiles;
}

// Function to parse HTML content and convert to Next.js app directory page
async function convertToNextPage(
  html: string,
  route: string,
  cssFiles: string[],
  outputDir: string
): Promise<string> {
  const $ = cheerio.load(html);

  // Download images
  const imgPromises = $("img").map(async (i, img) => {
    const src = $(img).attr("src");
    if (src) {
      const localSrc = await downloadAndSaveAsset(src, outputDir);
      $(img).attr("src", localSrc);
    }
  }).get();

  // Download background images
  const bgPromises = $('[style*="background"]').map(async (i, elem) => {
    const style = $(elem).attr("style");
    const bgImageUrlMatch = style?.match(/url\(["']?([^"')]+)["']?\)/);
    if (style && bgImageUrlMatch) {
      const bgImageUrl = bgImageUrlMatch[1];
      const localBgImageUrl = await downloadAndSaveAsset(bgImageUrl, outputDir);
      $(elem).attr("style", style.replace(bgImageUrl, localBgImageUrl));
    }
  }).get();

  // Wait for all images and background images to be downloaded
  await Promise.all([...imgPromises, ...bgPromises]);

  const title = $("title").text();
  const content = $("body").html();

  const cssImports = cssFiles.map((file) => `import '@/styles/${file}';`).join("\n");

  const nextPageContent = `
    import { FC } from 'react';

    ${cssImports}

    const Page: FC = () => {
      return (
        <div dangerouslySetInnerHTML={{ __html: \`${content}\` }} />
      );
    };

    export const metadata = {
      title: "${title}",
    };

    export default Page;
  `;

  return nextPageContent; // Replace prettier formatting
}

// Function to write the converted page to disk
async function writeNextPage(route: string, content: string, outputDir: string): Promise<void> {
  const filePath = path.join(outputDir, "app", route, "page.tsx");
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  console.log(`Page written: ${path.relative(process.cwd(), filePath)}`);
}

// Function to start the conversion process
async function convertSiteToNextJs(siteName: string, siteUrl: string): Promise<void> {
  const outputDir = path.join(process.cwd(), siteName);

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
  console.error("Usage: ts-node index.ts <site-name> <site-url>");
  process.exit(1);
}

convertSiteToNextJs(siteName, siteUrl);
