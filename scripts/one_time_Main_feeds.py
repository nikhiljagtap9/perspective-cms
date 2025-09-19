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
            logging.info(f"[SKIP] {url} → Not Modified (304)")
            return None, "not_modified", None, None
        if r.status_code != 200:
            logging.error(f"[HTTP ERROR] {url} → {r.status_code} {r.reason_phrase}")
        r.raise_for_status()
        return r.text, None, r.headers.get("ETag"), r.headers.get("Last-Modified")
    except Exception as e:
        logging.error(f"[REQUEST FAILED] {url} → {e}")
        return None, str(e), None, None


# ----------------------------
# Scrape Articles
# ----------------------------
def scrape_articles(url: str, html: str, keywords: list[str], country_name: str):
    articles = []
    soup = BeautifulSoup(html, "html.parser")

    # --- Try to extract site logo ---
    site_logo = None
    icon = soup.find("link", rel=lambda v: v and "icon" in v.lower())
    if icon and icon.get("href"):
        site_logo = icon["href"]

    if not site_logo:
        og_img = soup.find("meta", property="og:image")
        if og_img and og_img.get("content"):
            site_logo = og_img["content"]

    if not site_logo:
        logo_img = soup.find("img", {"class": lambda v: v and "logo" in v.lower()})
        if not logo_img:
            logo_img = soup.find("img", {"id": lambda v: v and "logo" in v.lower()})
        if logo_img and logo_img.get("src"):
            site_logo = logo_img["src"]

    if site_logo and not site_logo.startswith("http"):
        site_logo = url.rstrip("/") + "/" + site_logo.lstrip("/")

    # --- Collect article candidates ---
    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")

        # Collect context
        context_parts = [title]
        parent = a.find_parent()
        if parent:
            for p in parent.find_all("p", limit=3):
                context_parts.append(p.get_text(strip=True))
            img = parent.find("img")
            if img and img.has_attr("alt"):
                context_parts.append(img["alt"])

        full_context = " ".join(context_parts).lower()

        # Match keywords OR country name
        if not (
            any(word.lower() in full_context for word in keywords)
            or country_name.lower() in full_context
        ):
            continue

        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
        articles.append(
            {
                "title": title,
                "description": " ".join(context_parts)[:500],
                "link": link,
                "guid": {"isPermaLink": True, "value": link},
                "dc:creator": "scraper",
                "pubDate": pub_time,
            }
        )

    return articles, site_logo


# ----------------------------
# Scrape Single URL
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            return 0

        all_articles = []
        site_logo = None

        # scrape all sources
        tasks = [fetch_page(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            url = urls[i]
            if isinstance(result, Exception):
                logging.error(f"[{country.name}] {url} failed: {result}")
                continue

            html, error_reason, _, _ = result
            if error_reason:
                logging.error(f"[{country.name}] ERROR from {url}: {error_reason}")
                continue

            if html:
                articles, logo = scrape_articles(url, html, keywords, country.name)
                all_articles.extend(articles)
                if logo and not site_logo:
                    site_logo = logo

        # build one combined feed JSON
        status = "success" if all_articles else "empty"
        rss_json = {
            "channel": {
                "title": "Main Feed",
                "description": f"Scraped articles for {country.name}",
                "link": None,
                "items": all_articles,
                "meta": {
                    "status": status,
                    "article_count": len(all_articles),
                },
            }
        }

        if site_logo:
            rss_json["channel"]["image"] = {
                "url": site_logo,
                "title": f"{country.name} Feed",
                "link": urls[0] if urls else None,
            }

        # save/update one row per (country_id, MAIN_FEED)
        saved_row = await db.scrapperdata.find_unique(
            where={"country_id_feed_type": {"country_id": country.id, "feed_type": "MAIN_FEED"}}
        )

        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.now(),
                },
            )
        else:
            await db.scrapperdata.create(
                data={
                    "country_id": country.id,
                    "feed_type": "MAIN_FEED",
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        return len(all_articles)


# ----------------------------
# Scrape all sources for a country
# ----------------------------
# ----------------------------
# Scrape all sources for a country
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            return 0

        all_articles = []

        # scrape each URL and merge articles
        tasks = [fetch_page(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            url = urls[i]
            if isinstance(result, Exception):
                logging.error(f"[{country.name}] {url} failed: {result}")
                continue

            html, error_reason, _, _ = result
            if html:
                articles = scrape_articles(url, html, keywords, country.name)
                all_articles.extend(articles)

        # build one combined feed JSON
        status = "success" if all_articles else "empty"
        rss_json = {
            "channel": {
                "title": "Main Feed",
                "description": f"Scraped articles for {country.name}",
                "link": None,  # multiple sources, so no single URL
                "items": all_articles,
                "meta": {
                    "status": status,
                    "article_count": len(all_articles),
                },
            }
        }

        # save/update one row per country + feed_type
        saved_row = await db.scrapperdata.find_unique(
            where={"country_id_feed_type": {"country_id": country.id, "feed_type": "MAIN_FEED"}}
        )

        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.now(),
                },
            )
        else:
            await db.scrapperdata.create(
                data={
                    "country_id": country.id,
                    "feed_type": "MAIN_FEED",
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

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
