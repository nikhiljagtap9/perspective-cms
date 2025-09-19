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
# Logging (two log files + console)
# ----------------------------
main_feed_logger = logging.getLogger("MAIN_FEED")
us_mentions_logger = logging.getLogger("US_MENTIONS")

formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
)

# Console handler (shared)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

# File handlers
main_feed_file = logging.FileHandler("main_feed.log")
main_feed_file.setFormatter(formatter)

us_mentions_file = logging.FileHandler("us_mentions.log")
us_mentions_file.setFormatter(formatter)

# Attach handlers
for logger, file_handler in [(main_feed_logger, main_feed_file), (us_mentions_logger, us_mentions_file)]:
    logger.setLevel(logging.INFO)
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
# Generic Scraper
# ----------------------------
async def scrape_single_url(db: Prisma, country_name, country_id, url, keywords, feed_type: str, logger):
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
                logger.info(f"[{feed_type}][{country_name}] {url} → not modified")
                return 0

            articles = scrape_articles(url, html, keywords) if html else []
            status = "success" if articles else ("error" if error_reason else "empty")

            rss_json = {
                "channel": {
                    "title": f"{feed_type} Feed",
                    "description": f"Scraped {feed_type} for {country_name} ({url})",
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
                        "feed_type": feed_type,
                    },
                )
            else:
                await db.scrapperdata.create(
                    data={
                        "url": url,
                        "feed_type": feed_type,
                        "country_id": country_id,
                        "etag": new_etag,
                        "last_modified": new_lastmod,
                        "content": json.dumps(rss_json, ensure_ascii=False),
                    }
                )

            logger.info(f"[{feed_type}][{country_name}] {url} → {status} ({len(articles)} articles)")
            return len(articles)

        except Exception as e:
            logger.error(f"[{feed_type}][{country_name}] {url} failed: {e}")
            traceback.print_exc()
            return 0

# ----------------------------
# Scrape MAIN_FEED
# ----------------------------
async def scrape_country_main(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            return 0

        tasks = [
            scrape_single_url(db, country.name, country.id, url, keywords, "MAIN_FEED", main_feed_logger)
            for url in urls
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return sum(r for r in results if isinstance(r, int))

# ----------------------------
# Scrape US_MENTIONS
# ----------------------------
async def scrape_country_us_mentions(db: Prisma, country, us_sources, us_keywords_by_country):
    async with country_semaphore:
        keywords = us_keywords_by_country.get(country.id, [])
        if not keywords:
            return 0

        tasks = [
            scrape_single_url(db, country.name, country.id, src.url, keywords, "US_MENTIONS", us_mentions_logger)
            for src in us_sources
        ]
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
    us_sources = await db.usmentionssource.find_many()
    us_keywords = await db.usmentionskeyword.find_many()

    sources_by_country = {}
    for s in sources:
        sources_by_country.setdefault(s.countryId, []).append(s.url)

    keywords_by_country = {}
    for k in keywords:
        keywords_by_country.setdefault(k.countryId, []).append(k.keyword)

    us_keywords_by_country = {}
    for k in us_keywords:
        us_keywords_by_country.setdefault(k.countryId, []).append(k.keyword)

    # MAIN_FEED
    main_feed_logger.info("Starting MAIN_FEED scraping...")
    tasks_main = [scrape_country_main(db, country, sources_by_country, keywords_by_country) for country in countries]
    results_main = await tqdm_asyncio.gather(*tasks_main, total=len(tasks_main), desc="Scraping MAIN_FEED")
    total_main = sum(r for r in results_main if isinstance(r, int))

    # US_MENTIONS
    us_mentions_logger.info("Starting US_MENTIONS scraping...")
    tasks_us = [scrape_country_us_mentions(db, country, us_sources, us_keywords_by_country) for country in countries]
    results_us = await tqdm_asyncio.gather(*tasks_us, total=len(tasks_us), desc="Scraping US_MENTIONS")
    total_us = sum(r for r in results_us if isinstance(r, int))

    main_feed_logger.info(f"SUMMARY: MAIN_FEED={total_main}")
    us_mentions_logger.info(f"SUMMARY: US_MENTIONS={total_us}")

    await db.disconnect()
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
