import sys
import json
import cloudscraper
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from prisma import Prisma
import asyncio
import logging
import traceback
import random

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
# Logging config
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

# ----------------------------
# Helpers
# ----------------------------
def get_browser_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Pragma": "no-cache",
    }


def fetch_page(url: str, saved_etag: str = None, saved_lastmod: str = None):
    """Fetch page with ETag/Last-Modified headers"""
    headers = get_browser_headers()

    if saved_etag:
        headers["If-None-Match"] = saved_etag
    if saved_lastmod:
        headers["If-Modified-Since"] = saved_lastmod

    def try_request(u: str):
        try:
            scraper = cloudscraper.create_scraper()
            response = scraper.get(u, headers=headers, timeout=15)
            if response.status_code == 304:
                return None, "not_modified", None, None
            response.raise_for_status()
            return response.text, None, response.headers.get("ETag"), response.headers.get("Last-Modified")
        except Exception as e1:
            logging.warning(f"cloudscraper failed for {u}: {e1} (falling back to requests)")
            try:
                response = requests.get(u, headers=headers, timeout=15)
                if response.status_code == 304:
                    return None, "not_modified", None, None
                response.raise_for_status()
                return response.text, None, response.headers.get("ETag"), response.headers.get("Last-Modified")
            except Exception as e2:
                logging.error(f"requests failed for {u}: {e2}")
                return None, str(e2), None, None

    html, error, etag, lastmod = try_request(url)

    if not html and url.startswith("http://"):
        https_url = url.replace("http://", "https://", 1)
        logging.info(f"Retrying with HTTPS: {https_url}")
        html, error, etag, lastmod = try_request(https_url)

    return html, error, etag, lastmod


def scrape_articles(url: str, keywords: list[str], saved_etag=None, saved_lastmod=None):
    """Scrape and filter articles by keywords"""
    html, error, new_etag, new_lastmod = fetch_page(url, saved_etag, saved_lastmod)

    if error == "not_modified":
        return [], "not_modified", saved_etag, saved_lastmod

    if not html:
        return [], error, new_etag, new_lastmod

    soup = BeautifulSoup(html, "html.parser")
    articles = []

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")
        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
        if not any(word.lower() in title.lower() for word in keywords):
            continue

        articles.append({
            "title": title,
            "description": title,
            "link": link,
            "guid": {"isPermaLink": True, "value": link},
            "dc:creator": "scraper",
            "pubDate": pub_time,
        })

    return articles, None, new_etag, new_lastmod


# ----------------------------
# Scrape per country
# ----------------------------
async def scrape_country(db: Prisma, country_id: str, country_name: str):
    """Scrape all sources for a single country (one DB row per URL, with ETag/Last-Modified support)."""
    try:
        sources = await db.newssource.find_many(where={"countryId": country_id})
        urls = [s.url for s in sources]

        if not urls:
            logging.warning(f"No sources for {country_name} ({country_id})")
            return 0

        keywords = await db.keyword.find_many(where={"countryId": country_id})
        keyword_list = [k.keyword for k in keywords]

        if not keyword_list:
            logging.warning(f"No keywords for {country_name} ({country_id})")
            return 0

        total_articles = 0

        for url in urls:
            try:
                # 🔹 Check if we already scraped this URL
                saved_row = await db.scrapperdata.find_unique(
                    where={"country_id_url": {"country_id": country_id, "url": url}}
                )

                # 🔹 Scrape (passing etag & last-modified for conditional requests)
                articles, error_reason, new_etag, new_lastmod = scrape_articles(
                    url,
                    keyword_list,
                    saved_row.etag if saved_row else None,
                    saved_row.last_modified if saved_row else None,
                )

                # 🔹 If server says "not modified" → skip updating
                if error_reason == "not_modified":
                    logging.info(f"[{country_name}] {url} → not modified (skipped)")
                    continue

                # 🔹 Decide status
                status = "success" if articles else ("error" if error_reason else "empty")

                # 🔹 Build JSON payload
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

                # 🔹 Update or create row
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

                logging.info(f"[{country_name}] {url} → {status} ({len(articles)} articles)")
                total_articles += len(articles)

            except Exception as e:
                logging.error(f"Fatal error scraping {url} in {country_name}: {e}")
                traceback.print_exc()

        return total_articles

    except Exception as e:
        logging.error(f"Fatal error processing {country_name} ({country_id}): {e}")
        traceback.print_exc()
        return 0


# ----------------------------
# Main runner (chunked)
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    countries = await db.country.find_many()
    total_articles = 0

    chunk_size = 10
    for i in range(0, len(countries), chunk_size):
        chunk = countries[i : i + chunk_size]
        logging.info(f"Processing countries {i+1} to {i+len(chunk)} of {len(countries)}")

        for country in chunk:
            count = await scrape_country(db, country.id, country.name)
            total_articles += count

    await db.disconnect()
    logging.info(f"SUMMARY: Total {total_articles} articles saved across {len(countries)} countries")


if __name__ == "__main__":
    asyncio.run(main())


# ------------------------------
# Main - Chunked Run
# ------------------------------

# async def main():
#     db = Prisma()
#     await db.connect()

#     # test run: only 2 countries
#     countries = await db.country.find_many(take=2)
#     total_articles = 0

#     for country in countries:
#         count = await scrape_country(db, country.id, country.name)
#         total_articles += count

#     await db.disconnect()
#     logging.info(f"SUMMARY: Total {total_articles} articles saved across {len(countries)} countries")


# if __name__ == "__main__":
#     asyncio.run(main())
