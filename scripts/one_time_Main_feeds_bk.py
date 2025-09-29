import sys
import json
import asyncio
import logging
import random
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from prisma import Prisma
from tqdm.asyncio import tqdm_asyncio
from urllib.parse import urljoin, urlparse
import openpyxl   # ✅ Excel support

# ----------------------------
# Excel Setup
# ----------------------------
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Scraper Logs"
ws.append(["Country", "Source", "Status", "ErrorMessage"])  # header row

def save_excel():
    filename = f"scraper_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    wb.save(filename)
    print(f"✅ Excel file saved: {filename}")

# ----------------------------
# User Agents
# ----------------------------
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Chrome/116.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) "
    "Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Safari/537.36 Edg/117.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/16.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 6 Pro) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Mobile Safari/537.36",
]

# ----------------------------
# Logging
# ----------------------------
logger = logging.getLogger("scraper")
logger.setLevel(logging.INFO)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter("[%(levelname)s] %(message)s")
console_handler.setFormatter(console_format)

file_handler = logging.FileHandler("scraper.log", mode="w", encoding="utf-8")
file_handler.setLevel(logging.ERROR)
file_format = logging.Formatter("[%(levelname)s] %(message)s")
file_handler.setFormatter(file_format)

logger.addHandler(console_handler)
logger.addHandler(file_handler)

# ----------------------------
# Concurrency
# ----------------------------
MAX_COUNTRY_CONCURRENCY = 5
MAX_URL_CONCURRENCY = 20

country_semaphore = asyncio.Semaphore(MAX_COUNTRY_CONCURRENCY)
url_semaphore = asyncio.Semaphore(MAX_URL_CONCURRENCY)

# ----------------------------
# HTTP Client
# ----------------------------
client = httpx.AsyncClient(
    timeout=8, follow_redirects=True, headers={"User-Agent": random.choice(USER_AGENTS)}
)

# ----------------------------
# Fetch Page
# ----------------------------
async def fetch_page(url: str, country_name: str, saved_etag: str = None, saved_lastmod: str = None):
    headers = {}
    if saved_etag:
        headers["If-None-Match"] = saved_etag
    if saved_lastmod:
        headers["If-Modified-Since"] = saved_lastmod

    try:
        r = await client.get(url, headers=headers)
        if r.status_code == 304:
            return None, "not_modified", None, None
        if r.status_code != 200:
            return None, f"{r.status_code} {r.reason_phrase}", None, None
        return r.text, None, r.headers.get("ETag"), r.headers.get("Last-Modified")
    except Exception as e:
        return None, str(e), None, None

# ----------------------------
# Scrape Articles
# ----------------------------
def scrape_articles(url: str, html: str, keywords: list[str], country_name: str):
    articles = []
    seen_links = set()
    soup = BeautifulSoup(html, "html.parser")

    favicon_url = ""
    icon_link = soup.find("link", rel=lambda v: v and "icon" in v.lower())
    if icon_link and icon_link.has_attr("href"):
        favicon_url = urljoin(url, icon_link["href"])

    parsed_domain = urlparse(url).netloc

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")

        if link in seen_links:
            continue
        seen_links.add(link)

        context_parts = [title]
        thumbnail_url = ""

        parent = a.find_parent()
        if parent:
            for p in parent.find_all("p", limit=3):
                text = p.get_text(strip=True)
                if text:
                    context_parts.append(text)

            img = parent.find("img")
            if img:
                if img.has_attr("alt") and img["alt"].strip():
                    context_parts.append(img["alt"].strip())
                if img.has_attr("src") and img["src"].strip():
                    thumbnail_url = urljoin(url, img["src"].strip())

        full_context = " ".join(context_parts).lower()

        if not any(word.lower() in full_context for word in keywords):
            continue

        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

        articles.append(
            {
                "title": title,
                "description": " ".join(context_parts)[:500],
                "link": link,
                "guid": {"isPermaLink": True, "value": link},
                "dc:creator": parsed_domain,
                "pubDate": pub_time,
                "thumbnails": favicon_url,
                "thumbnail_url": thumbnail_url,
            }
        )

    return articles

# ----------------------------
# Scrape Single Country
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            logger.error(f"[{country.name}] Sources={urls} Status=empty")
            ws.append([country.name, "N/A", "EMPTY", "No sources/keywords"])  # ✅ Excel
            return 0

        all_articles = []
        tasks = [fetch_page(url, country.name) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            url = urls[i]
            if isinstance(result, Exception):
                logger.error(f"[{country.name}] Source={url} Status=error → {result}")
                ws.append([country.name, url, "ERROR", str(result)])  # ✅ Excel
                continue

            html, error_reason, _, _ = result
            if error_reason:
                logger.error(f"[{country.name}] Source={url} Status=error → {error_reason}")
                ws.append([country.name, url, "ERROR", error_reason])  # ✅ Excel
                continue

            if html:
                articles = scrape_articles(url, html, keywords, country.name)
                all_articles.extend(articles)

        if not all_articles:
            logger.error(f"[{country.name}] Sources={urls} Status=empty")
            ws.append([country.name, ", ".join(urls), "EMPTY", "No articles found"])  # ✅ Excel

        return len(all_articles)

# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    countries = await db.country.find_many()
    sources = await db.newssource.find_many()
    keywords = await db.keyword.find_many()

    sources_by_country = {}
    for s in sources:
        sources_by_country.setdefault(s.countryId, []).append(s.url)

    keywords_by_country = {}
    for k in keywords:
        keywords_by_country.setdefault(k.countryId, []).append(k.keyword)

    tasks = [scrape_country(db, country, sources_by_country, keywords_by_country) for country in countries]
    await tqdm_asyncio.gather(*tasks, total=len(tasks), desc="Scraping countries")

    await db.disconnect()
    await client.aclose()

    save_excel()  # ✅ Save Excel at the end

if __name__ == "__main__":
    asyncio.run(main())
