import sys
import json
import asyncio
import logging
import traceback
import random
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from prisma import Prisma
from tqdm.asyncio import tqdm_asyncio

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
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.FileHandler("scraper.log"), logging.StreamHandler(sys.stdout)],
)

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
async def fetch_page(url: str, saved_etag: str = None, saved_lastmod: str = None):
    headers = {}
    if saved_etag:
        headers["If-None-Match"] = saved_etag
    if saved_lastmod:
        headers["If-Modified-Since"] = saved_lastmod

    try:
        r = await client.get(url, headers=headers)
        if r.status_code == 304:
            return None, "not_modified", None, None
        r.raise_for_status()
        return r.text, None, r.headers.get("ETag"), r.headers.get("Last-Modified")
    except Exception as e:
        return None, str(e), None, None


# ----------------------------
# Scrape Articles
# ----------------------------
def scrape_articles(url: str, html: str, keywords: list[str]):
    articles = []
    soup = BeautifulSoup(html, "html.parser")

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")
        if not any(word.lower() in title.lower() for word in keywords):
            continue

        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
        articles.append(
            {
                "title": title,
                "description": title,
                "link": link,
                "guid": {"isPermaLink": True, "value": link},
                "dc:creator": "scraper",
                "pubDate": pub_time,
            }
        )
    return articles


# ----------------------------
# Scrape Single URL
# ----------------------------
async def scrape_single_url(db: Prisma, country_name, country_id, url, keywords):
    async with url_semaphore:
        try:
            saved_row = await db.scrapperdata.find_unique(
                where={"country_id_url": {"country_id": country_id, "url": url}}
            )

            html, error_reason, new_etag, new_lastmod = await fetch_page(
                url,
                saved_row.etag if saved_row else None,
                saved_row.last_modified if saved_row else None,
            )

            if error_reason == "not_modified":
                return 0

            articles = scrape_articles(url, html, keywords) if html else []

            status = "success" if articles else ("error" if error_reason else "empty")

            rss_json = {
                "channel": {
                    "title": "Main Feed",
                    "description": f"Scraped articles for {country_name} ({url})",
                    "link": url,
                    "items": articles,
                    "meta": {
                        "status": status,
                        "reason": error_reason,
                        "article_count": len(articles),
                    },
                }
            }

            if saved_row:
                await db.scrapperdata.update(
                    where={"id": saved_row.id},
                    data={
                        "content": json.dumps(rss_json, ensure_ascii=False),
                        "etag": new_etag,
                        "last_modified": new_lastmod,
                        "updated_at": datetime.now(),
                    },
                )
            else:
                await db.scrapperdata.create(
                    data={
                        "url": url,
                        "feed_type": "MAIN_FEED",
                        "country_id": country_id,
                        "etag": new_etag,
                        "last_modified": new_lastmod,
                        "content": json.dumps(rss_json, ensure_ascii=False),
                    }
                )

            return len(articles)

        except Exception as e:
            logging.error(f"[{country_name}] {url} failed: {e}")
            traceback.print_exc()
            return 0


# ----------------------------
# Scrape Country
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            return 0

        tasks = [scrape_single_url(db, country.name, country.id, url, keywords) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        return sum(r for r in results if isinstance(r, int))


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

    total = 0
    tasks = [scrape_country(db, country, sources_by_country, keywords_by_country) for country in countries]

    # 🔹 Show progress bar
    results = await tqdm_asyncio.gather(*tasks, total=len(tasks), desc="Scraping countries")

    total = sum(r for r in results if isinstance(r, int))
    logging.info(f"SUMMARY: Total {total} articles saved across {len(countries)} countries")

    await db.disconnect()
    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
